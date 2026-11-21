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
