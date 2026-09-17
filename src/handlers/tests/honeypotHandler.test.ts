import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

// EmbedBuilder.setThumbnail validates URL format; the asset URL helper returns
// relative paths in test envs (no CDN_DOMAIN_URL). Stub with an absolute URL.
vi.mock('../../config/assets.js', () => ({
    getAssetUrls: () => ({
        rapiBot: { thumbnail: 'https://example.com/thumb.png' },
    }),
    DEFAULT_IMAGE_EXTENSIONS: ['.gif', '.png', '.jpg', '.webp'],
}));

import { checkHoneypot, ensureHoneypotNotice, resetHoneypotState } from '../honeypotHandler';
import { HONEYPOT_CONFIG } from '../../utils/data/honeypotConfig.js';

const BOT_ID = 'rapi-bot-id';
const OWNER_ID = 'owner-id';

let userCounter = 0;

interface Overrides {
    channelName?: string;
    channelType?: ChannelType;
    authorId?: string;
    isBot?: boolean;
    webhookId?: string | null;
    roleNames?: string[];
    isAdmin?: boolean;
    isOwner?: boolean;
    member?: unknown;
    content?: string;
    botHasBanPermission?: boolean;
    modLogChannel?: boolean;
    alreadyBanned?: boolean;
    banCreate?: ReturnType<typeof vi.fn>;
    banRemove?: ReturnType<typeof vi.fn>;
}

function createMessage(overrides: Overrides = {}) {
    const authorId = overrides.authorId ?? `user-${++userCounter}`;
    const roleNames = overrides.roleNames ?? [];

    const banCreate = overrides.banCreate ?? vi.fn().mockResolvedValue({});
    const banRemove = overrides.banRemove ?? vi.fn().mockResolvedValue({});
    const banFetch = vi
        .fn()
        .mockImplementation(() =>
            overrides.alreadyBanned ? Promise.resolve({ user: { id: authorId } }) : Promise.reject(new Error('Unknown Ban'))
        );

    const modLogSend = vi.fn().mockResolvedValue({});
    const channels = [
        {
            type: ChannelType.GuildText,
            name: overrides.modLogChannel === false ? 'general' : HONEYPOT_CONFIG.MOD_LOG_CHANNEL_NAME,
            send: modLogSend,
        },
    ];

    const member =
        'member' in overrides
            ? overrides.member
            : {
                  id: authorId,
                  joinedTimestamp: 1_700_000_000_000,
                  permissions: {
                      has: (flag: bigint) =>
                          flag === PermissionFlagsBits.Administrator && !!overrides.isAdmin,
                  },
                  roles: { cache: roleNames.map(name => ({ name })) },
              };

    const guild = {
        id: 'guild-1',
        ownerId: overrides.isOwner ? authorId : OWNER_ID,
        channels: { cache: { find: (fn: any) => channels.find(fn) } },
        members: {
            me: {
                permissions: {
                    has: (flag: bigint) =>
                        flag === PermissionFlagsBits.BanMembers &&
                        overrides.botHasBanPermission !== false,
                },
            },
            fetch: vi.fn().mockResolvedValue(member),
        },
        bans: { create: banCreate, remove: banRemove, fetch: banFetch },
    };

    const msg = {
        author: {
            id: authorId,
            tag: `tag-${authorId}`,
            bot: overrides.isBot ?? false,
            createdTimestamp: 1_600_000_000_000,
        },
        webhookId: overrides.webhookId ?? null,
        client: { user: { id: BOT_ID } },
        guild,
        member,
        channel: {
            id: 'channel-1',
            type: overrides.channelType ?? ChannelType.GuildText,
            name: overrides.channelName ?? HONEYPOT_CONFIG.CHANNEL_NAME,
        },
        content: overrides.content ?? '@everyone free nitro https://scam.example',
        delete: vi.fn().mockResolvedValue({}),
    } as any;

    return { msg, banCreate, banRemove, modLogSend };
}

function modLogEmbed(modLogSend: ReturnType<typeof vi.fn>) {
    return modLogSend.mock.calls[0][0].embeds[0];
}

function actionsField(modLogSend: ReturnType<typeof vi.fn>) {
    return modLogEmbed(modLogSend).data.fields.find((f: any) => f.name === 'Actions').value;
}

describe('checkHoneypot', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetHoneypotState();
    });

    it('softbans a non-exempt account that posts in the trap', async () => {
        const { msg, banCreate, banRemove } = createMessage();

        await checkHoneypot(msg);

        expect(banCreate).toHaveBeenCalledWith(msg.author.id, {
            deleteMessageSeconds: HONEYPOT_CONFIG.DELETE_MESSAGE_SECONDS,
            reason: HONEYPOT_CONFIG.BAN_REASON,
        });
        expect(banRemove).toHaveBeenCalledWith(msg.author.id, HONEYPOT_CONFIG.UNBAN_REASON);
    });

    it('acts on @everyone spam, which the main message handler filters out', async () => {
        const { msg, banCreate } = createMessage({
            content: '@everyone claim your free nitro https://scam.example',
        });

        await checkHoneypot(msg);

        expect(banCreate).toHaveBeenCalledTimes(1);
    });

    it('ignores messages outside the honeypot channel', async () => {
        const { msg, banCreate } = createMessage({ channelName: 'general' });

        await checkHoneypot(msg);

        expect(banCreate).not.toHaveBeenCalled();
    });

    it('ignores non-text channels', async () => {
        const { msg, banCreate } = createMessage({ channelType: ChannelType.GuildVoice });

        await checkHoneypot(msg);

        expect(banCreate).not.toHaveBeenCalled();
    });

    it('never actions the server owner, admins, or mods', async () => {
        const owner = createMessage({ isOwner: true });
        const admin = createMessage({ isAdmin: true });
        const mod = createMessage({ roleNames: ['Mods'] });

        await checkHoneypot(owner.msg);
        await checkHoneypot(admin.msg);
        await checkHoneypot(mod.msg);

        expect(owner.banCreate).not.toHaveBeenCalled();
        expect(admin.banCreate).not.toHaveBeenCalled();
        expect(mod.banCreate).not.toHaveBeenCalled();
    });

    it('never actions itself', async () => {
        const { msg, banCreate } = createMessage({ authorId: BOT_ID });

        await checkHoneypot(msg);

        expect(banCreate).not.toHaveBeenCalled();
    });

    it('exempts bots and webhooks while EXEMPT_BOTS is on', async () => {
        const bot = createMessage({ isBot: true });
        const hook = createMessage({ webhookId: 'hook-1' });

        await checkHoneypot(bot.msg);
        await checkHoneypot(hook.msg);

        expect(bot.banCreate).not.toHaveBeenCalled();
        expect(hook.banCreate).not.toHaveBeenCalled();
    });

    it('leaves an existing ban alone rather than releasing it', async () => {
        const { msg, banCreate, banRemove } = createMessage({ alreadyBanned: true });

        await checkHoneypot(msg);

        expect(banCreate).not.toHaveBeenCalled();
        expect(banRemove).not.toHaveBeenCalled();
    });

    it('acts once per account within the cooldown window', async () => {
        const first = createMessage({ authorId: 'spammer-1' });
        const second = createMessage({ authorId: 'spammer-1' });

        await checkHoneypot(first.msg);
        await checkHoneypot(second.msg);

        expect(first.banCreate).toHaveBeenCalledTimes(1);
        expect(second.banCreate).not.toHaveBeenCalled();
    });

    it('posts a mod-log embed with the message snapshot and user metadata', async () => {
        const { msg, modLogSend } = createMessage({ content: 'scam link here' });

        await checkHoneypot(msg);

        expect(modLogSend).toHaveBeenCalledTimes(1);
        const embed = modLogEmbed(modLogSend);
        expect(embed.data.title).toContain('Honeypot Triggered');
        const fields = embed.data.fields;
        expect(fields.find((f: any) => f.name === 'User').value).toContain(msg.author.id);
        expect(fields.find((f: any) => f.name === 'Message').value).toContain('scam link here');
        expect(actionsField(modLogSend)).toContain('Banned');
    });

    it('snapshots the message before the ban purges it', async () => {
        const banCreate = vi.fn().mockImplementation(async () => {
            msg.content = '';
            return {};
        });
        const { msg, modLogSend } = createMessage({ content: 'original scam text', banCreate });

        await checkHoneypot(msg);

        const fields = modLogEmbed(modLogSend).data.fields;
        expect(fields.find((f: any) => f.name === 'Message').value).toContain('original scam text');
    });

    it('flags loudly when the unban fails, because the user is still banned', async () => {
        const banRemove = vi.fn().mockRejectedValue(new Error('Missing Permissions'));
        const { msg, modLogSend } = createMessage({ banRemove });

        await checkHoneypot(msg);

        const actions = actionsField(modLogSend);
        expect(actions).toContain('Unban FAILED');
        expect(actions).toContain('still banned');
    });

    it('reports a missing Ban Members permission instead of failing silently', async () => {
        const { msg, banCreate, modLogSend } = createMessage({ botHasBanPermission: false });

        await checkHoneypot(msg);

        expect(banCreate).not.toHaveBeenCalled();
        expect(modLogSend).toHaveBeenCalledTimes(1);
        expect(actionsField(modLogSend)).toContain('Ban Members permission');
    });

    it('deletes the triggering message when the ban itself failed', async () => {
        const banCreate = vi.fn().mockRejectedValue(new Error('Missing Permissions'));
        const { msg, modLogSend } = createMessage({ banCreate });

        await checkHoneypot(msg);

        expect(msg.delete).toHaveBeenCalledTimes(1);
        expect(actionsField(modLogSend)).toContain('Ban failed');
    });

    it('does not throw when there is no mod-log channel', async () => {
        const { msg, banCreate } = createMessage({ modLogChannel: false });

        await expect(checkHoneypot(msg)).resolves.toBeUndefined();
        expect(banCreate).toHaveBeenCalledTimes(1);
    });

    it('does not throw on DMs or when the guild is missing', async () => {
        const { msg } = createMessage();
        msg.guild = null;

        await expect(checkHoneypot(msg)).resolves.toBeUndefined();
    });
});

interface NoticeOverrides {
    hasChannel?: boolean;
    existing?: { authorId: string; pinned: boolean } | null;
    sendRejects?: boolean;
    pinRejects?: boolean;
}

function createClient(overrides: NoticeOverrides = {}) {
    const send = overrides.sendRejects
        ? vi.fn().mockRejectedValue(new Error('Missing Permissions'))
        : vi.fn().mockImplementation(async () => ({ pin: sentPin }));
    const sentPin = overrides.pinRejects
        ? vi.fn().mockRejectedValue(new Error('Missing Permissions'))
        : vi.fn().mockResolvedValue({});

    const existingEdit = vi.fn().mockResolvedValue({});
    const existingPin = vi.fn().mockResolvedValue({});
    const existing = overrides.existing
        ? {
              author: { id: overrides.existing.authorId },
              pinned: overrides.existing.pinned,
              edit: existingEdit,
              pin: existingPin,
          }
        : null;

    const fetched = {
        find: (fn: any) => (existing && fn(existing) ? existing : undefined),
    };

    const channels = overrides.hasChannel === false
        ? []
        : [
              {
                  type: ChannelType.GuildText,
                  name: HONEYPOT_CONFIG.CHANNEL_NAME,
                  messages: { fetch: vi.fn().mockResolvedValue(fetched) },
                  send,
              },
          ];

    const bot = {
        user: { id: BOT_ID },
        guilds: {
            cache: {
                values: () => [
                    {
                        id: 'guild-1',
                        name: 'Guild One',
                        channels: { cache: { find: (fn: any) => channels.find(fn) } },
                    },
                ],
            },
        },
    } as any;

    return { bot, send, sentPin, existingEdit, existingPin };
}

describe('ensureHoneypotNotice', () => {
    beforeEach(() => vi.clearAllMocks());

    it('posts and pins the warning when the channel has none', async () => {
        const { bot, send, sentPin } = createClient();

        const result = await ensureHoneypotNotice(bot);

        expect(result).toEqual({ posted: 1, skipped: 0 });
        expect(send).toHaveBeenCalledTimes(1);
        expect(sentPin).toHaveBeenCalledTimes(1);

        const embed = send.mock.calls[0][0].embeds[0];
        expect(embed.data.title).toBe(HONEYPOT_CONFIG.NOTICE_TITLE);
        expect(embed.data.description).toContain('bait');
        expect(embed.data.description).toContain('ask a mod for an invite');
    });

    it('edits its existing notice instead of stacking a new one each restart', async () => {
        const { bot, send, existingEdit } = createClient({
            existing: { authorId: BOT_ID, pinned: true },
        });

        const result = await ensureHoneypotNotice(bot);

        expect(existingEdit).toHaveBeenCalledTimes(1);
        expect(send).not.toHaveBeenCalled();
        expect(result.posted).toBe(1);
    });

    it('re-pins its notice if someone unpinned it', async () => {
        const { bot, existingPin } = createClient({
            existing: { authorId: BOT_ID, pinned: false },
        });

        await ensureHoneypotNotice(bot);

        expect(existingPin).toHaveBeenCalledTimes(1);
    });

    it('ignores messages from other authors when looking for its notice', async () => {
        const { bot, send, existingEdit } = createClient({
            existing: { authorId: 'someone-else', pinned: false },
        });

        await ensureHoneypotNotice(bot);

        expect(existingEdit).not.toHaveBeenCalled();
        expect(send).toHaveBeenCalledTimes(1);
    });

    it('skips guilds with no honeypot channel', async () => {
        const { bot, send } = createClient({ hasChannel: false });

        const result = await ensureHoneypotNotice(bot);

        expect(result).toEqual({ posted: 0, skipped: 1 });
        expect(send).not.toHaveBeenCalled();
    });

    it('keeps the notice when pinning is not permitted', async () => {
        const { bot, send } = createClient({ pinRejects: true });

        const result = await ensureHoneypotNotice(bot);

        expect(send).toHaveBeenCalledTimes(1);
        expect(result.posted).toBe(1);
    });

    it('does not throw when the channel rejects the post', async () => {
        const { bot } = createClient({ sendRejects: true });

        await expect(ensureHoneypotNotice(bot)).resolves.toEqual({ posted: 0, skipped: 1 });
    });
});
