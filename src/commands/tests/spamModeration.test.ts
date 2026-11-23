import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/chatCommandRateLimiter', () => ({
    CHAT_COMMAND_RATE_LIMIT: { maxCommands: 3, violatorThreshold: 3, timeoutViolations: 8, cleanupIntervalMs: 3_600_000 },
    ChatCommandRateLimiter: {
        getUsageStats: vi.fn(),
        resetUser: vi.fn(),
    },
}));

import { ChatCommandRateLimiter } from '../../utils/chatCommandRateLimiter';
import { handleSpamStats, handleSpamReset } from '../utils/spamModeration';

const guild = { id: '111111111111111111', name: 'Test Guild' } as any;

function makeInteraction() {
    return {
        user: { id: 'u1', tag: 'Mod#0001' },
        client: { user: { displayAvatarURL: () => 'https://example.com/a.png' } },
        options: {
            getUser: vi.fn().mockReturnValue({ id: 'u2', tag: 'Member#0002', toString: () => '<@u2>' }),
        },
        reply: vi.fn().mockResolvedValue({}),
    } as any;
}

const EPHEMERAL = expect.any(Number);

beforeEach(() => vi.clearAllMocks());

describe('handleSpamReset', () => {
    it('resets the member for this guild and replies ephemerally', async () => {
        const interaction = makeInteraction();
        await handleSpamReset(interaction, guild);

        expect(ChatCommandRateLimiter.resetUser).toHaveBeenCalledWith(guild.id, 'u2');
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.flags).toEqual(EPHEMERAL);
        expect(arg.embeds[0].toJSON().title).toBe('✅ Rate Limit Reset');
    });
});

describe('handleSpamStats', () => {
    const stats = {
        totalUsers: 4,
        activeUsers: 2,
        totalUsage: 120,
        topViolators: [{ userId: '222222222222222222', attempts: 5 }],
        mostSpammedCommands: [{ command: 'redeem', count: 30 }],
    };

    it('replies ephemerally with the stats embed and no filler', async () => {
        vi.mocked(ChatCommandRateLimiter.getUsageStats).mockReturnValue(stats as any);
        const interaction = makeInteraction();
        await handleSpamStats(interaction, guild);

        expect(ChatCommandRateLimiter.getUsageStats).toHaveBeenCalledWith(guild.id);
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.flags).toEqual(EPHEMERAL);
        const embed = arg.embeds[0].toJSON();
        expect(JSON.stringify(embed)).not.toMatch(/Moderator Only|v2\.0|underutilized|working effectively|optimization/);
        expect(embed.footer).toBeUndefined();
        const names = embed.fields.map((f: any) => f.name);
        expect(names).toEqual(expect.arrayContaining(['🚨 Top Violators', '🔥 Most Spammed Commands']));
        expect(names).not.toContain('💡 System Recommendations');
    });

    it('shows the real timeout trigger from config next to the listing threshold', async () => {
        vi.mocked(ChatCommandRateLimiter.getUsageStats).mockReturnValue(stats as any);
        const interaction = makeInteraction();
        await handleSpamStats(interaction, guild);

        const embed = interaction.reply.mock.calls[0][0].embeds[0].toJSON();
        const violation = embed.fields.find((f: any) => f.name === '⚠️ Violation Tracking');
        expect(violation.value).toContain('Listed at:** 3+');
        expect(violation.value).toContain('Timeout at:** 8+');
    });
});
