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
    it('keeps check, stats and reset, with the moved stubs described as such', () => {
        const json = spamCommand.data.toJSON() as any;
        expect(json.options.map((o: any) => o.name)).toEqual(['check', 'stats', 'reset']);
        expect(json.options[1].description).toBe('Moved to /mod spam stats');
        expect(json.options[2].description).toBe('Moved to /mod spam reset');
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

describe('/spam stats and reset (moved)', () => {
    it.each(['stats', 'reset'])('%s points at /mod and does nothing else', async sub => {
        const interaction = makeInteraction(sub);
        await spamCommand.execute(interaction);

        expect(interaction.reply).toHaveBeenCalledWith({
            content: `This moved to \`/mod spam ${sub}\`.`,
            flags: expect.any(Number),
        });
        expect(ChatCommandRateLimiter.resetUser).not.toHaveBeenCalled();
        expect(ChatCommandRateLimiter.getUsageStats).not.toHaveBeenCalled();
    });
});
