/**
 * Rate limiter for embed fix requests
 * Limits requests per guild and per user to prevent spam
 */

import { EMBED_FIX_CONFIG } from '../../utils/data/embedFixConfig';
import { RateLimitEntry } from '../../utils/interfaces/EmbedFix.interface';

class EmbedFixRateLimiter {
    private guildLimits: Map<string, RateLimitEntry> = new Map();
    private userLimits: Map<string, RateLimitEntry> = new Map();
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor() {
        // Clean up old entries every 5 minutes
        this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }

    /**
     * Check if a request is allowed based on rate limits
     * @param guildId The guild ID
     * @param userId The user ID
     * @returns true if request is allowed, false if rate limited
     */
    check(guildId: string, userId: string): boolean {
        const now = Date.now();

        // Check guild limit
        if (!this.checkLimit(this.guildLimits, guildId, EMBED_FIX_CONFIG.GUILD_RATE_LIMIT, now)) {
            return false;
        }

        // Check user limit
        if (!this.checkLimit(this.userLimits, `${guildId}:${userId}`, EMBED_FIX_CONFIG.USER_RATE_LIMIT, now)) {
            return false;
        }

        // Increment counters
        this.incrementLimit(this.guildLimits, guildId, now);
        this.incrementLimit(this.userLimits, `${guildId}:${userId}`, now);

        return true;
    }

    /**
     * Check a specific limit map
     */
    private checkLimit(map: Map<string, RateLimitEntry>, key: string, limit: number, now: number): boolean {
        const entry = map.get(key);

        if (!entry) {
            return true;
        }

        // Check if window has expired
        if (now - entry.windowStart >= EMBED_FIX_CONFIG.RATE_WINDOW_MS) {
            return true;
        }

        // Check if under limit
        return entry.count < limit;
    }

    /**
     * Increment the counter for a limit
     */
    private incrementLimit(map: Map<string, RateLimitEntry>, key: string, now: number): void {
        const entry = map.get(key);

        if (!entry || now - entry.windowStart >= EMBED_FIX_CONFIG.RATE_WINDOW_MS) {
            // Start new window
            map.set(key, { count: 1, windowStart: now });
        } else {
            // Increment existing window
            entry.count++;
        }
    }

    /**
     * Clean up expired entries to prevent memory leaks
     */
    private cleanup(): void {
        const now = Date.now();
        const expiredThreshold = now - EMBED_FIX_CONFIG.RATE_WINDOW_MS;

        for (const [key, entry] of this.guildLimits) {
            if (entry.windowStart < expiredThreshold) {
                this.guildLimits.delete(key);
            }
        }

        for (const [key, entry] of this.userLimits) {
            if (entry.windowStart < expiredThreshold) {
                this.userLimits.delete(key);
            }
        }
    }

    /**
     * Get current stats (for debugging/monitoring)
     */
    getStats(): { guildEntries: number; userEntries: number } {
        return {
            guildEntries: this.guildLimits.size,
            userEntries: this.userLimits.size,
        };
    }

    /**
     * Clear all rate limits (for testing)
     */
    clear(): void {
        this.guildLimits.clear();
        this.userLimits.clear();
    }

    /**
     * Stop the cleanup interval (for graceful shutdown)
     */
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}

// Export singleton instance
export const embedFixRateLimiter = new EmbedFixRateLimiter();
