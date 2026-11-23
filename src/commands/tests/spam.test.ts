import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/assets', () => ({
    getAssetUrls: () => ({
        rapiBot: { thumbnail: 'https://example.com/thumb.png' },
    }),
}));

vi.mock('../../utils/chatCommandRateLimiter', () => ({
    CHAT_COMMAND_RATE_LIMIT: { maxCommands: 3, violatorThreshold: 3, timeoutViolations: 8, cleanupIntervalMs: 3_600_000 },
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
        getWindowSummary: vi.fn().mockReturnValue({ used: 1, rank: 1, activeUsers: 1, average: 1 }),
        resetUser: vi.fn(),
    },
}));

import { ChatCommandRateLimiter } from '../../utils/chatCommandRateLimiter';

const spamCommand = (await import('../spam')).default;

function guildWithRapiBot(has = true) {
    const channels = [{ name: 'general', type: 0 }, ...(has ? [{ name: 'rapi-bot', type: 0 }] : [])];
    return {
        id: '111111111111111111',
        name: 'Test Guild',
        channels: { cache: { some: (fn: (c: any) => boolean) => channels.some(fn) } },
    };
}

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

function fieldsOf(interaction: any): Record<string, string> {
    const embed = interaction.reply.mock.calls[0][0].embeds[0].toJSON();
    return Object.fromEntries((embed.fields ?? []).map((f: any) => [f.name, f.value]));
}

describe('/spam check', () => {
    it('replies ephemerally with the caller\'s own status embed', async () => {
        const interaction = makeInteraction('check', guildWithRapiBot());
        await spamCommand.execute(interaction);

        expect(interaction.reply).toHaveBeenCalledTimes(1);
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.embeds[0].toJSON().title).toBe('🛡️ Spam Status');
        expect(arg.flags).toBeDefined();
    });

    it('omits the reset time while the member still has commands left', async () => {
        const interaction = makeInteraction('check', guildWithRapiBot());
        await spamCommand.execute(interaction);

        const fields = fieldsOf(interaction);
        expect(fields['📊 Commands Remaining']).toBe('2/3');
        expect(fields['⏰ Time Until Reset']).toBeUndefined();
    });

    it('shows a relative Discord timestamp for the reset at 0 uses left', async () => {
        vi.mocked(ChatCommandRateLimiter.getRemainingCommands).mockReturnValueOnce(0);
        vi.mocked(ChatCommandRateLimiter.getRemainingTime).mockReturnValueOnce(60_000);
        const before = Math.floor(Date.now() / 1000);
        const interaction = makeInteraction('check', guildWithRapiBot());
        await spamCommand.execute(interaction);

        const value = fieldsOf(interaction)['⏰ Time Until Reset'];
        const unix = Number(/^<t:(\d+):R>$/.exec(value)?.[1]);
        expect(unix).toBeGreaterThanOrEqual(before + 60);
        expect(unix).toBeLessThanOrEqual(before + 62);
    });

    it('ranks and averages from the current hour only', async () => {
        vi.mocked(ChatCommandRateLimiter.getWindowSummary).mockReturnValueOnce({
            used: 2, rank: 2, activeUsers: 4, average: 1.5,
        });
        const interaction = makeInteraction('check', guildWithRapiBot());
        await spamCommand.execute(interaction);

        const fields = fieldsOf(interaction);
        expect(fields['🏆 Your Usage Rank']).toBe('#2 of 4 users this hour');
        expect(fields['📈 Server Average']).toBe('1.5 commands/user this hour');
        expect(ChatCommandRateLimiter.getWindowSummary).toHaveBeenCalledWith('111111111111111111', 'u1');
    });

    it('says there is no limit in a server without a #rapi-bot channel', async () => {
        const interaction = makeInteraction('check', guildWithRapiBot(false));
        await spamCommand.execute(interaction);

        const embed = interaction.reply.mock.calls[0][0].embeds[0].toJSON();
        expect(embed.description).toContain('no chat command limit in this server');
        expect(embed.fields ?? []).toHaveLength(0);
        expect(ChatCommandRateLimiter.getRemainingCommands).not.toHaveBeenCalled();
    });
});
