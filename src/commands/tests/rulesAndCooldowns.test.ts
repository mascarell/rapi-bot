import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChannelType, MessageFlags } from 'discord.js';

vi.mock('fs', () => ({
    default: { readFileSync: vi.fn(() => '{}'), writeFileSync: vi.fn() },
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
}));

const allowed = vi.fn(async () => true);
vi.mock('../../services/rulesManagementService.js', () => ({
    getRulesManagementService: () => ({
        isGuildAllowed: allowed,
        getRulesContent: () => 'HOME RULES TEXT',
    }),
}));

const rateCheck = vi.fn(() => true);
vi.mock('../utils/index.js', () => ({
    GACHA_CONFIGS: {},
    RateLimiter: { init: vi.fn(), check: (id: string) => rateCheck(id) },
    GachaPuller: { pull: vi.fn() },
    handlePagination: vi.fn(),
}));

import rulesCommand from '../rules';
import gachaCommand from '../gacha';
import luckyCommand from '../lucky';
import { HOME_GUILD_ID } from '../../utils/data/homeGuild';

const OTHER_GUILD_ID = '300000000000000009';
const RULES_CHANNEL_ID = '100000000000000005';

function interaction(guildId: string, channels: any[] = []) {
    return {
        guildId,
        guild: { channels: { cache: { find: (fn: (c: any) => boolean) => channels.find(fn) } } },
        user: { id: '111111111111111111' },
        options: { get: vi.fn() },
        reply: vi.fn().mockResolvedValue({}),
        deferReply: vi.fn().mockResolvedValue({}),
        followUp: vi.fn().mockResolvedValue({}),
    } as any;
}

describe('/rules', () => {
    beforeEach(() => allowed.mockResolvedValue(true));

    it('shows the full rules in the home server', async () => {
        const i = interaction(HOME_GUILD_ID);
        await rulesCommand.execute(i);
        expect(i.reply).toHaveBeenCalledWith({ content: 'HOME RULES TEXT', flags: MessageFlags.Ephemeral });
    });

    it("points to the other server's own #rules channel", async () => {
        const i = interaction(OTHER_GUILD_ID, [{ id: RULES_CHANNEL_ID, name: 'rules', type: ChannelType.GuildText }]);
        await rulesCommand.execute(i);
        const content = i.reply.mock.calls[0][0].content;
        expect(content).toContain(`<#${RULES_CHANNEL_ID}>`);
        expect(content).not.toContain('HOME RULES TEXT');
    });

    it('says so when the other server has no #rules channel', async () => {
        const i = interaction(OTHER_GUILD_ID);
        await rulesCommand.execute(i);
        expect(i.reply.mock.calls[0][0].content).toContain("hasn't set up a #rules channel");
    });

    it('still refuses servers that are not allowlisted', async () => {
        allowed.mockResolvedValue(false);
        const i = interaction(OTHER_GUILD_ID);
        await rulesCommand.execute(i);
        expect(i.reply.mock.calls[0][0].content).toContain('not available');
    });
});

describe('cooldown notices are private', () => {
    it('/gacha replies ephemerally without a public defer when rate limited', async () => {
        rateCheck.mockReturnValue(false);
        const i = interaction(HOME_GUILD_ID);
        await gachaCommand.execute(i);
        expect(i.deferReply).not.toHaveBeenCalled();
        expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.Ephemeral }));
    });

    it('/lucky replies ephemerally while on cooldown', async () => {
        const i = interaction(HOME_GUILD_ID);
        (luckyCommand as any).lastUsage[i.user.id] = { lastTime: Date.now() };
        await luckyCommand.execute(i);
        expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('You can use this command again'),
            flags: MessageFlags.Ephemeral,
        }));
    });
});
