import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/assets', () => ({
    getAssetUrls: () => ({
        rapiBot: { thumbnail: 'https://example.com/thumb.png' },
    }),
}));

vi.mock('../../utils/chatCommandRateLimiter', () => ({
    CHAT_COMMAND_RATE_LIMIT: { maxCommands: 3, violatorThreshold: 3, cleanupIntervalMs: 3_600_000 },
    ChatCommandRateLimiter: {
        getRemainingCommands: vi.fn().mockReturnValue(2),
        getRemainingTime: vi.fn().mockReturnValue(0),
        getUsageStats: vi.fn().mockReturnValue({
            totalUsers: 1,
            activeUsers: 1,
            totalUsage: 1,
            topViolators: [],
            mostSpammedCommands: [],
        }),
        resetUser: vi.fn(),
    },
}));

import { ChatCommandRateLimiter } from '../../utils/chatCommandRateLimiter';

const spamCommand = (await import('../spam')).default;

function makeInteraction(sub: string, guild: any = { id: '111111111111111111', name: 'Test Guild' }) {
    return {
        guild,
        user: { id: 'u1', tag: 'Member#0001', toString: () => '<@u1>' },
        client: { user: { displayAvatarURL: () => 'https://example.com/a.png' } },
        options: { getSubcommand: () => sub, getUser: vi.fn() },
        reply: vi.fn().mockResolvedValue({}),
    } as any;
}

beforeEach(() => vi.clearAllMocks());

describe('/spam registration', () => {
    it('registers only check', () => {
        const json = spamCommand.data.toJSON() as any;
        expect(json.options.map((o: any) => o.name)).toEqual(['check']);
    });
});

describe('/spam check', () => {
    it('replies ephemerally with the caller\'s own status embed', async () => {
        const interaction = makeInteraction('check');
        await spamCommand.execute(interaction);

        expect(interaction.reply).toHaveBeenCalledTimes(1);
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.embeds[0].toJSON().title).toBe('🛡️ Spam Status');
        expect(arg.flags).toBeDefined();
    });
});
