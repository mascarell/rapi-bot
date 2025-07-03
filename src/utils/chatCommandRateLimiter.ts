export const CHAT_COMMAND_RATE_LIMIT = {
    maxCommands: 3,
    cleanupIntervalMs: 2 * 60 * 60 * 1000, // 2 hours
    violatorThreshold: 5 // Mark as violator if they try 5+ times
} as const;

function getCurrentHourKey() {
    const now = new Date();
    return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
}

export class ChatCommandRateLimiter {
    // usage[guildId][userId] = { hourKey: string, count: number }
    private static usage: Record<string, Record<string, { hourKey: string, count: number }>> = {};
    // violators[guildId][userId] = total attempts (including blocked ones)
    private static violators: Record<string, Record<string, number>> = {};
    // commandUsage[guildId][commandName] = count of times this command was used (per hour)
    private static commandUsage: Record<string, Record<string, number>> = {};
    // global command count
    private static globalCommandCount: number = 0;
    // per-guild command count
    private static guildCommandCount: Record<string, number> = {};

    static init(): void {
        setInterval(() => this.cleanup(), CHAT_COMMAND_RATE_LIMIT.cleanupIntervalMs);
    }

    static check(guildId: string, userId: string, commandName?: string): boolean {
        const hourKey = getCurrentHourKey();
        if (!this.usage[guildId]) this.usage[guildId] = {};
        if (!this.usage[guildId][userId] || this.usage[guildId][userId].hourKey !== hourKey) {
            this.usage[guildId][userId] = { hourKey, count: 0 };
        }

        // Track total attempts for violator detection
        if (!this.violators[guildId]) this.violators[guildId] = {};
        if (!this.violators[guildId][userId]) this.violators[guildId][userId] = 0;
        this.violators[guildId][userId]++;

        // Track command-specific usage
        if (commandName) {
            if (!this.commandUsage[guildId]) this.commandUsage[guildId] = {};
            if (!this.commandUsage[guildId][commandName]) this.commandUsage[guildId][commandName] = 0;
            this.commandUsage[guildId][commandName]++;
        }

        // Track global and per-guild command counts
        this.globalCommandCount++;
        if (!this.guildCommandCount[guildId]) this.guildCommandCount[guildId] = 0;
        this.guildCommandCount[guildId]++;

        if (this.usage[guildId][userId].count >= CHAT_COMMAND_RATE_LIMIT.maxCommands) {
            return false;
        }
        this.usage[guildId][userId].count++;
        return true;
    }

    static getRemainingTime(guildId: string, userId: string): number {
        // Time until the next hour (UTC)
        const now = new Date();
        const nextHour = new Date(now);
        nextHour.setUTCMinutes(0, 0, 0);
        nextHour.setUTCHours(now.getUTCHours() + 1);
        return nextHour.getTime() - now.getTime();
    }

    static getRemainingCommands(guildId: string, userId: string): number {
        const hourKey = getCurrentHourKey();
        if (!this.usage[guildId] || !this.usage[guildId][userId] || this.usage[guildId][userId].hourKey !== hourKey) {
            return CHAT_COMMAND_RATE_LIMIT.maxCommands;
        }
        return Math.max(0, CHAT_COMMAND_RATE_LIMIT.maxCommands - this.usage[guildId][userId].count);
    }

    static resetUser(guildId: string, userId: string): void {
        if (this.usage[guildId]) {
            delete this.usage[guildId][userId];
        }
        if (this.violators[guildId]) {
            delete this.violators[guildId][userId];
        }
    }

    static getUsageStats(guildId: string): { 
        totalUsers: number; 
        totalUsage: number; 
        topViolators: Array<{userId: string, attempts: number}>;
        activeUsers: number;
        mostSpammedCommands: Array<{command: string, count: number}>;
    } {
        if (!this.usage[guildId]) return { 
            totalUsers: 0, 
            totalUsage: 0, 
            topViolators: [],
            activeUsers: 0,
            mostSpammedCommands: []
        };
        
        const totalUsers = Object.keys(this.usage[guildId]).length;
        const totalUsage = Object.values(this.usage[guildId]).reduce((sum, user) => sum + user.count, 0);
        
        // Get top violators (users with 5+ attempts)
        const violators = this.violators[guildId] || {};
        const topViolators = Object.entries(violators)
            .filter(([_, attempts]) => attempts >= CHAT_COMMAND_RATE_LIMIT.violatorThreshold)
            .map(([userId, attempts]) => ({ userId, attempts }))
            .sort((a, b) => b.attempts - a.attempts)
            .slice(0, 5); // Top 5 violators
        
        // Count active users (users with recent activity)
        const hourKey = getCurrentHourKey();
        const activeUsers = Object.values(this.usage[guildId])
            .filter(user => user.hourKey === hourKey && user.count > 0)
            .length;
        
        // Get most spammed commands
        const commandUsage = this.commandUsage[guildId] || {};
        const mostSpammedCommands = Object.entries(commandUsage)
            .map(([command, count]) => ({ command, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5); // Top 5 most spammed commands
        
        return { totalUsers, totalUsage, topViolators, activeUsers, mostSpammedCommands };
    }

    static getGlobalCommandCount(): number {
        return this.globalCommandCount;
    }

    static getGuildCommandCount(guildId: string): number {
        return this.guildCommandCount[guildId] || 0;
    }

    private static cleanup(): void {
        // Clean up old usage data (not strictly necessary with hourly reset, but keeps memory usage low)
        const hourKey = getCurrentHourKey();
        Object.keys(this.usage).forEach(guildId => {
            Object.keys(this.usage[guildId]).forEach(userId => {
                if (this.usage[guildId][userId].hourKey !== hourKey) {
                    delete this.usage[guildId][userId];
                }
            });
            if (Object.keys(this.usage[guildId]).length === 0) delete this.usage[guildId];
        });
    }
} 