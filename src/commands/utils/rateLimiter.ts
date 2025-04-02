import { CONSTANTS } from './gachaConstants';

export class RateLimiter {
    private static usage: Record<string, number[]> = {};

    static init(): void {
        setInterval(() => this.cleanup(), CONSTANTS.rateLimit.cleanupIntervalMs);
    }

    static check(userId: string): boolean {
        const now = Date.now();
        if (!this.usage[userId]) this.usage[userId] = [];
        
        this.usage[userId] = this.usage[userId]
            .filter(time => now - time < CONSTANTS.rateLimit.windowMs);
        
        if (this.usage[userId].length >= CONSTANTS.rateLimit.maxPulls) return false;
        
        this.usage[userId].push(now);
        return true;
    }

    private static cleanup(): void {
        const now = Date.now();
        Object.keys(this.usage).forEach(userId => {
            this.usage[userId] = this.usage[userId]
                .filter(time => now - time < CONSTANTS.rateLimit.windowMs);
            if (this.usage[userId].length === 0) delete this.usage[userId];
        });
    }
} 