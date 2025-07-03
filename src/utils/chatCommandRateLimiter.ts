export const CHAT_COMMAND_RATE_LIMIT = {
    maxCommands: 3,
    windowMs: 60 * 60 * 1000, // 1 hour
    cleanupIntervalMs: 2 * 60 * 60 * 1000, // 2 hours
    violatorThreshold: 5 // Mark as violator if they try 5+ times
} as const;

export class ChatCommandRateLimiter {
    // usage[guildId][userId] = [timestamps]
    private static usage: Record<string, Record<string, number[]>> = {};
    // violators[guildId][userId] = total attempts (including blocked ones)
    private static violators: Record<string, Record<string, number>> = {};
    // commandUsage[guildId][commandName] = count of times this command was used
    private static commandUsage: Record<string, Record<string, number>> = {};

    static init(): void {
        setInterval(() => this.cleanup(), CHAT_COMMAND_RATE_LIMIT.cleanupIntervalMs);
    }

    static check(guildId: string, userId: string, commandName?: string): boolean {
        const now = Date.now();
        if (!this.usage[guildId]) this.usage[guildId] = {};
        if (!this.usage[guildId][userId]) this.usage[guildId][userId] = [];
        
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
        
        this.usage[guildId][userId] = this.usage[guildId][userId]
            .filter(time => now - time < CHAT_COMMAND_RATE_LIMIT.windowMs);
        
        if (this.usage[guildId][userId].length >= CHAT_COMMAND_RATE_LIMIT.maxCommands) {
            console.log(`Rate limit exceeded for user ${userId} in guild ${guildId}. Usage: ${this.usage[guildId][userId].length}/${CHAT_COMMAND_RATE_LIMIT.maxCommands}, Total attempts: ${this.violators[guildId][userId]}`);
            return false;
        }
        
        this.usage[guildId][userId].push(now);
        console.log(`Rate limit check passed for user ${userId} in guild ${guildId}. Usage: ${this.usage[guildId][userId].length}/${CHAT_COMMAND_RATE_LIMIT.maxCommands}, Total attempts: ${this.violators[guildId][userId]}`);
        return true;
    }

    static getRemainingTime(guildId: string, userId: string): number {
        const now = Date.now();
        if (!this.usage[guildId] || !this.usage[guildId][userId]) return 0;
        
        const validTimes = this.usage[guildId][userId]
            .filter(time => now - time < CHAT_COMMAND_RATE_LIMIT.windowMs);
        
        if (validTimes.length === 0) return 0;
        
        const oldestTime = Math.min(...validTimes);
        return Math.max(0, CHAT_COMMAND_RATE_LIMIT.windowMs - (now - oldestTime));
    }

    static getRemainingCommands(guildId: string, userId: string): number {
        const now = Date.now();
        if (!this.usage[guildId] || !this.usage[guildId][userId]) return CHAT_COMMAND_RATE_LIMIT.maxCommands;
        
        const validTimes = this.usage[guildId][userId]
            .filter(time => now - time < CHAT_COMMAND_RATE_LIMIT.windowMs);
        
        return Math.max(0, CHAT_COMMAND_RATE_LIMIT.maxCommands - validTimes.length);
    }

    static resetUser(guildId: string, userId: string): void {
        if (this.usage[guildId]) {
            delete this.usage[guildId][userId];
        }
        if (this.violators[guildId]) {
            delete this.violators[guildId][userId];
        }
        console.log(`Rate limit reset for user ${userId} in guild ${guildId}`);
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
        const totalUsage = Object.values(this.usage[guildId]).reduce((sum, times) => sum + times.length, 0);
        
        // Get top violators (users with 5+ attempts)
        const violators = this.violators[guildId] || {};
        const topViolators = Object.entries(violators)
            .filter(([_, attempts]) => attempts >= CHAT_COMMAND_RATE_LIMIT.violatorThreshold)
            .map(([userId, attempts]) => ({ userId, attempts }))
            .sort((a, b) => b.attempts - a.attempts)
            .slice(0, 5); // Top 5 violators
        
        // Count active users (users with recent activity)
        const now = Date.now();
        const activeUsers = Object.values(this.usage[guildId])
            .filter(times => times.some(time => now - time < CHAT_COMMAND_RATE_LIMIT.windowMs))
            .length;
        
        // Get most spammed commands
        const commandUsage = this.commandUsage[guildId] || {};
        const mostSpammedCommands = Object.entries(commandUsage)
            .map(([command, count]) => ({ command, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5); // Top 5 most spammed commands
        
        return { totalUsers, totalUsage, topViolators, activeUsers, mostSpammedCommands };
    }

    private static cleanup(): void {
        const now = Date.now();
        Object.keys(this.usage).forEach(guildId => {
            Object.keys(this.usage[guildId]).forEach(userId => {
                this.usage[guildId][userId] = this.usage[guildId][userId]
                    .filter(time => now - time < CHAT_COMMAND_RATE_LIMIT.windowMs);
                if (this.usage[guildId][userId].length === 0) delete this.usage[guildId][userId];
            });
            if (Object.keys(this.usage[guildId]).length === 0) delete this.usage[guildId];
        });
    }
} 