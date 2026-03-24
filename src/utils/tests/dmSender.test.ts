import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { sendDMSafe } from '../dmSender';
import { EmbedBuilder, User } from 'discord.js';

describe('sendDMSafe', () => {
    let mockUser: User;
    let testContent: { embeds: EmbedBuilder[] };

    beforeEach(() => {
        mockUser = {
            id: 'test-user-id',
            send: vi.fn().mockResolvedValue({ id: 'dm-msg-id' }),
        } as any;

        testContent = { embeds: [new EmbedBuilder().setTitle('Test')] };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should send DM and return message', async () => {
        const result = await sendDMSafe(mockUser, testContent);
        expect(result).toBeDefined();
        expect(result?.id).toBe('dm-msg-id');
        expect(mockUser.send).toHaveBeenCalledWith(testContent);
    });

    it('should call onDMSuccess callback on successful send', async () => {
        const onSuccess = vi.fn();
        await sendDMSafe(mockUser, testContent, { onDMSuccess: onSuccess });
        expect(onSuccess).toHaveBeenCalledWith('test-user-id');
    });

    it('should return null and call onDMDisabled on error 50007', async () => {
        (mockUser.send as any).mockRejectedValueOnce({ code: 50007, message: 'DMs disabled' });

        const onDisabled = vi.fn();
        const result = await sendDMSafe(mockUser, testContent, { onDMDisabled: onDisabled });

        expect(result).toBeNull();
        expect(onDisabled).toHaveBeenCalledWith('test-user-id');
    });

    it('should return null on non-50007 error without calling onDMDisabled', async () => {
        (mockUser.send as any).mockRejectedValueOnce({ code: 50001, message: 'Other error' });

        const onDisabled = vi.fn();
        const result = await sendDMSafe(mockUser, testContent, { onDMDisabled: onDisabled });

        expect(result).toBeNull();
        expect(onDisabled).not.toHaveBeenCalled();
    });

    it('should use custom rate limit delay', async () => {
        const start = Date.now();
        await sendDMSafe(mockUser, testContent, { rateLimitDelay: 50 });
        const elapsed = Date.now() - start;

        // Should wait at least 50ms (with some tolerance)
        expect(elapsed).toBeGreaterThanOrEqual(40);
    });

    it('should work without options', async () => {
        const result = await sendDMSafe(mockUser, testContent);
        expect(result).toBeDefined();
    });
});
