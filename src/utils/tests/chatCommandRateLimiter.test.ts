import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChatCommandRateLimiter, CHAT_COMMAND_RATE_LIMIT } from '../chatCommandRateLimiter';

const GUILD = '222222222222222222';
const USER = '111111111111111111';

const violations = () => (ChatCommandRateLimiter as any).violators?.[GUILD]?.[USER] ?? 0;

describe('ChatCommandRateLimiter violations', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-21T10:05:00Z'));
        ChatCommandRateLimiter.resetUser(GUILD, USER);
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not count allowed uses as violations', () => {
        for (let i = 0; i < CHAT_COMMAND_RATE_LIMIT.maxCommands; i++) {
            expect(ChatCommandRateLimiter.check(GUILD, USER, 'ccp rules')).toBe(true);
        }
        expect(violations()).toBe(0);
    });

    it('counts each blocked attempt', () => {
        for (let i = 0; i < CHAT_COMMAND_RATE_LIMIT.maxCommands; i++) ChatCommandRateLimiter.check(GUILD, USER);
        expect(ChatCommandRateLimiter.check(GUILD, USER)).toBe(false);
        expect(ChatCommandRateLimiter.check(GUILD, USER)).toBe(false);
        expect(violations()).toBe(2);
    });

    it('never reaches the timeout threshold from normal use across hours', () => {
        for (let hour = 10; hour < 14; hour++) {
            vi.setSystemTime(new Date(`2026-11-21T${hour}:05:00Z`));
            for (let i = 0; i < CHAT_COMMAND_RATE_LIMIT.maxCommands; i++) {
                expect(ChatCommandRateLimiter.check(GUILD, USER)).toBe(true);
            }
        }
        expect(violations()).toBe(0);
    });

    it('starts the violation count again each hour', () => {
        for (let i = 0; i < CHAT_COMMAND_RATE_LIMIT.maxCommands + 3; i++) ChatCommandRateLimiter.check(GUILD, USER);
        expect(violations()).toBe(3);

        vi.setSystemTime(new Date('2026-11-21T11:05:00Z'));
        expect(ChatCommandRateLimiter.check(GUILD, USER)).toBe(true);
        expect(violations()).toBe(0);
    });
});

describe('ChatCommandRateLimiter public reads', () => {
    const OTHER = '333333333333333333';
    const THIRD = '444444444444444444';

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-21T10:05:00Z'));
        for (const id of [USER, OTHER, THIRD]) ChatCommandRateLimiter.resetUser(GUILD, id);
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('exposes the timeout trigger in config', () => {
        expect(CHAT_COMMAND_RATE_LIMIT.timeoutViolations).toBe(8);
    });

    it('getViolationCount reports blocked attempts', () => {
        for (let i = 0; i < CHAT_COMMAND_RATE_LIMIT.maxCommands + 2; i++) ChatCommandRateLimiter.check(GUILD, USER);
        expect(ChatCommandRateLimiter.getViolationCount(GUILD, USER)).toBe(2);
        expect(ChatCommandRateLimiter.getViolationCount(GUILD, OTHER)).toBe(0);
    });

    it('getWindowSummary ranks and averages the current hour only', () => {
        ChatCommandRateLimiter.check(GUILD, OTHER);
        ChatCommandRateLimiter.check(GUILD, OTHER);
        ChatCommandRateLimiter.check(GUILD, OTHER);
        // THIRD used the limiter in the previous hour and must not count now.
        vi.setSystemTime(new Date('2026-11-21T09:05:00Z'));
        ChatCommandRateLimiter.check(GUILD, THIRD);
        ChatCommandRateLimiter.check(GUILD, THIRD);
        vi.setSystemTime(new Date('2026-11-21T10:05:00Z'));
        ChatCommandRateLimiter.check(GUILD, USER);

        expect(ChatCommandRateLimiter.getWindowSummary(GUILD, USER)).toEqual({
            used: 1, rank: 2, activeUsers: 2, average: 2,
        });
        expect(ChatCommandRateLimiter.getWindowSummary(GUILD, THIRD)).toMatchObject({ used: 0, rank: null });
    });
});

describe('ChatCommandRateLimiter.getUsageStats', () => {
    const STATS_GUILD = '333333333333333333';
    const OLD_USER = '444444444444444444';
    const NOW_USER = '555555555555555555';

    beforeEach(() => {
        vi.useFakeTimers();
        (ChatCommandRateLimiter as any).usage[STATS_GUILD] = {};
        (ChatCommandRateLimiter as any).violators[STATS_GUILD] = {};
        delete (ChatCommandRateLimiter as any).commandUsage[STATS_GUILD];
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('counts only the current hour', () => {
        // Last hour: a heavy spammer and their commands
        vi.setSystemTime(new Date('2026-11-21T09:30:00Z'));
        for (let i = 0; i < 10; i++) ChatCommandRateLimiter.check(STATS_GUILD, OLD_USER, 'booba?');

        // This hour: one normal use
        vi.setSystemTime(new Date('2026-11-21T10:05:00Z'));
        ChatCommandRateLimiter.check(STATS_GUILD, NOW_USER, 'booty?');

        const stats = ChatCommandRateLimiter.getUsageStats(STATS_GUILD);
        expect(stats.totalUsers).toBe(1);
        expect(stats.totalUsage).toBe(1);
        expect(stats.activeUsers).toBe(1);
        expect(stats.topViolators).toEqual([]);
        expect(stats.mostSpammedCommands).toEqual([{ command: 'booty?', count: 1 }]);
    });

    it("lists this hour's violators", () => {
        vi.setSystemTime(new Date('2026-11-21T10:05:00Z'));
        const attempts = CHAT_COMMAND_RATE_LIMIT.maxCommands + CHAT_COMMAND_RATE_LIMIT.violatorThreshold;
        for (let i = 0; i < attempts; i++) ChatCommandRateLimiter.check(STATS_GUILD, NOW_USER, 'booba?');

        const stats = ChatCommandRateLimiter.getUsageStats(STATS_GUILD);
        expect(stats.topViolators).toEqual([{ userId: NOW_USER, attempts: CHAT_COMMAND_RATE_LIMIT.violatorThreshold }]);
        expect(stats.mostSpammedCommands).toEqual([{ command: 'booba?', count: attempts }]);
    });
});
