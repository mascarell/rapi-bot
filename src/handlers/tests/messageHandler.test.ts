import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChannelType } from 'discord.js';

const execute = vi.fn();

vi.mock('../../chatCommands/index.js', () => ({
    getChatCommand: vi.fn((name: string) =>
        name === 'booba?' || name === 'ccp rules' ? { name, execute } : undefined
    ),
}));
vi.mock('../../utils/sensitiveTermsChecker.js', () => ({ checkSensitiveTerms: vi.fn() }));
vi.mock('../../services/slurModerationService.js', () => ({
    getSlurModerationService: () => ({ checkMessage: vi.fn() }),
}));
vi.mock('../../services/embedFix/urlFixService.js', () => ({ checkEmbedFixUrls: vi.fn() }));
vi.mock('../coopPingHandler.js', () => ({ checkCoopPing: vi.fn() }));
vi.mock('../../utils/cdn/mediaManager.js', () => ({ getRandomCdnMediaUrl: vi.fn() }));
vi.mock('../../services/uptimeService.js', () => ({
    getUptimeService: () => ({ incrementCommands: vi.fn() }),
}));
vi.mock('../../utils/logger.js', () => ({
    logger: new Proxy({}, { get: () => () => undefined }),
}));
vi.mock('../../utils/util.js', () => ({
    findRoleByName: vi.fn(() => undefined),
    logError: vi.fn(),
    isMessageCommand: () => true,
}));
vi.mock('../../utils/chatCommandRateLimiter.js', () => ({
    ChatCommandRateLimiter: {
        check: vi.fn(),
        getRemainingTime: vi.fn(() => 1000),
    },
}));

import { ChatCommandRateLimiter } from '../../utils/chatCommandRateLimiter.js';
import { handleMessage } from '../messageHandler';

const RAPI_BOT_CHANNEL_ID = '100000000000000001';
const OTHER_CHANNEL_ID = '100000000000000002';

function textChannel(id: string, name: string) {
    return { id, name, type: ChannelType.GuildText };
}

function setup(opts: { content: string; inChannel: 'rapi-bot' | 'general'; guildHasRapiBot: boolean }) {
    const rapiBot = textChannel(RAPI_BOT_CHANNEL_ID, 'rapi-bot');
    const general = textChannel(OTHER_CHANNEL_ID, 'general');
    const channels = opts.guildHasRapiBot ? [rapiBot, general] : [general];
    const warning = { delete: vi.fn().mockResolvedValue(undefined) };
    const msg: any = {
        content: opts.content,
        mentions: { everyone: false, users: { has: () => false } },
        author: { id: '200000000000000001', bot: false },
        member: { roles: { cache: { has: () => false } } },
        guild: {
            id: '300000000000000001',
            channels: { cache: { find: (fn: (c: any) => boolean) => channels.find(fn) } },
            emojis: { cache: { find: () => undefined } },
        },
        channel: opts.inChannel === 'rapi-bot' ? rapiBot : general,
        reply: vi.fn().mockResolvedValue(warning),
    };
    const bot: any = {
        commands: new Map([
            ['booba?', { name: 'booba?', execute }],
            ['ccp rules', { name: 'ccp rules', execute }],
        ]),
    };
    return { msg, bot };
}

describe('handleMessage chat command gating', () => {
    beforeEach(() => {
        execute.mockReset();
        vi.mocked(ChatCommandRateLimiter.check).mockReset().mockReturnValue(true);
    });

    it('blocks a non-ccp command outside #rapi-bot when the guild has #rapi-bot', async () => {
        const { msg, bot } = setup({ content: 'booba?', inChannel: 'general', guildHasRapiBot: true });
        await handleMessage(msg, bot);
        expect(msg.reply).toHaveBeenCalledWith({
            content: expect.stringContaining(`only available in <#${RAPI_BOT_CHANNEL_ID}>`),
        });
        expect(execute).not.toHaveBeenCalled();
    });

    it('runs the command inside #rapi-bot without consulting the limiter', async () => {
        const { msg, bot } = setup({ content: 'booba?', inChannel: 'rapi-bot', guildHasRapiBot: true });
        await handleMessage(msg, bot);
        expect(execute).toHaveBeenCalledTimes(1);
        expect(ChatCommandRateLimiter.check).not.toHaveBeenCalled();
    });

    it('runs the command with no limit in a guild without #rapi-bot', async () => {
        const { msg, bot } = setup({ content: 'booba?', inChannel: 'general', guildHasRapiBot: false });
        await handleMessage(msg, bot);
        expect(ChatCommandRateLimiter.check).not.toHaveBeenCalled();
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('rate-limits a ccp command outside #rapi-bot', async () => {
        const { msg, bot } = setup({ content: 'ccp rules', inChannel: 'general', guildHasRapiBot: true });
        await handleMessage(msg, bot);
        expect(ChatCommandRateLimiter.check).toHaveBeenCalledTimes(1);
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('does not run the command when the limiter says no', async () => {
        vi.mocked(ChatCommandRateLimiter.check).mockReturnValue(false);
        const { msg, bot } = setup({ content: 'ccp rules', inChannel: 'general', guildHasRapiBot: true });
        await handleMessage(msg, bot);
        expect(execute).not.toHaveBeenCalled();
        expect(msg.reply).toHaveBeenCalledWith({
            content: expect.stringContaining('too frequently'),
        });
    });
});
