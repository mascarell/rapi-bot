import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock the config before importing the rate limiter
vi.mock('../../../utils/data/embedFixConfig', () => ({
    EMBED_FIX_CONFIG: {
        GUILD_RATE_LIMIT: 3,
        USER_RATE_LIMIT: 2,
        RATE_WINDOW_MS: 1000, // 1 second for testing
    },
}));

// Import after mocking
import { embedFixRateLimiter } from '../rateLimiter';

describe('EmbedFixRateLimiter', () => {
    beforeEach(() => {
        embedFixRateLimiter.clear();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('check', () => {
        it('should allow first request', () => {
            expect(embedFixRateLimiter.check('guild1', 'user1')).toBe(true);
        });

        it('should allow requests within user limit', () => {
            expect(embedFixRateLimiter.check('guild1', 'user1')).toBe(true);
            expect(embedFixRateLimiter.check('guild1', 'user1')).toBe(true);
        });

        it('should reject requests exceeding user limit', () => {
            expect(embedFixRateLimiter.check('guild1', 'user1')).toBe(true);
            expect(embedFixRateLimiter.check('guild1', 'user1')).toBe(true);
            expect(embedFixRateLimiter.check('guild1', 'user1')).toBe(false); // 3rd request, limit is 2
        });

        it('should allow requests from different users (within guild limit)', () => {
            // Guild limit is 3, so we can only do 3 total requests per guild
            // User 1 makes 1 request, user 2 makes 2 requests = 3 total (at guild limit)
            expect(embedFixRateLimiter.check('guild1', 'user1')).toBe(true);
            expect(embedFixRateLimiter.check('guild1', 'user2')).toBe(true);
            expect(embedFixRateLimiter.check('guild1', 'user2')).toBe(true);
        });

        it('should reject requests exceeding guild limit', () => {
            expect(embedFixRateLimiter.check('guild1', 'user1')).toBe(true);
            expect(embedFixRateLimiter.check('guild1', 'user2')).toBe(true);
            expect(embedFixRateLimiter.check('guild1', 'user3')).toBe(true);
            expect(embedFixRateLimiter.check('guild1', 'user4')).toBe(false); // 4th request, guild limit is 3
        });

        it('should reset limits after window expires', () => {
            expect(embedFixRateLimiter.check('guild1', 'user1')).toBe(true);
            expect(embedFixRateLimiter.check('guild1', 'user1')).toBe(true);
            expect(embedFixRateLimiter.check('guild1', 'user1')).toBe(false);

            // Advance time past the rate window
            vi.advanceTimersByTime(1100);

            expect(embedFixRateLimiter.check('guild1', 'user1')).toBe(true);
        });

        it('should track guilds independently', () => {
            expect(embedFixRateLimiter.check('guild1', 'user1')).toBe(true);
            expect(embedFixRateLimiter.check('guild1', 'user1')).toBe(true);
            expect(embedFixRateLimiter.check('guild1', 'user1')).toBe(false);

            // Different guild should still work
            expect(embedFixRateLimiter.check('guild2', 'user1')).toBe(true);
        });
    });

    describe('getStats', () => {
        it('should return correct stats', () => {
            embedFixRateLimiter.check('guild1', 'user1');
            embedFixRateLimiter.check('guild1', 'user2');
            embedFixRateLimiter.check('guild2', 'user1');

            const stats = embedFixRateLimiter.getStats();
            expect(stats.guildEntries).toBe(2);
            expect(stats.userEntries).toBe(3);
        });
    });

    describe('clear', () => {
        it('should clear all entries', () => {
            embedFixRateLimiter.check('guild1', 'user1');
            embedFixRateLimiter.check('guild1', 'user2');

            embedFixRateLimiter.clear();

            const stats = embedFixRateLimiter.getStats();
            expect(stats.guildEntries).toBe(0);
            expect(stats.userEntries).toBe(0);
        });
    });
});
