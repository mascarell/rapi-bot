import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

// ---- Mock S3 client BEFORE importing the service ----
vi.mock('../../utils/cdn/config', () => ({
    s3Client: { send: vi.fn() },
    S3_BUCKET: 'test-bucket',
}));

// EmbedBuilder.setThumbnail validates URL format; the asset URL helper returns
// relative paths in test envs (no CDN_DOMAIN_URL). Stub with an absolute URL.
vi.mock('../../config/assets', () => ({
    getAssetUrls: () => ({
        rapiBot: {
            thumbnail: 'https://example.com/thumb.png',
        },
        nikke: { logo: 'https://example.com/nikke.png' },
    }),
}));

import { s3Client } from '../../utils/cdn/config';
import { SlurModerationService, getSlurModerationService } from '../slurModerationService';

/* ==========================================================================
 *  Test fixtures
 * ========================================================================== */

// Placeholder slurs — never use real slurs in test files.
const PLACEHOLDER_SLURS = ['fooslurbar', 'qwertytest'];

const slurListDoc = {
    schemaVersion: 1,
    lastUpdated: new Date().toISOString(),
    notes: 'test fixture',
    slurs: PLACEHOLDER_SLURS,
};

let offenseStore: any;

function resetOffenseStore() {
    offenseStore = {
        schemaVersion: 1,
        lastUpdated: new Date().toISOString(),
        guilds: {},
    };
}

function mockS3SuccessFor(slurDoc = slurListDoc) {
    vi.mocked(s3Client.send).mockImplementation(async (command: any) => {
        const constructor = command?.constructor?.name;
        if (constructor === 'GetObjectCommand') {
            const key: string = command.input.Key;
            if (key.includes('slur-list')) {
                return {
                    Body: { transformToString: async () => JSON.stringify(slurDoc) },
                };
            }
            if (key.includes('offenses')) {
                return {
                    Body: { transformToString: async () => JSON.stringify(offenseStore) },
                };
            }
        }
        if (constructor === 'PutObjectCommand') {
            const key: string = command.input.Key;
            if (key.includes('offenses')) {
                offenseStore = JSON.parse(command.input.Body);
            }
            return {};
        }
        return {};
    });
}

/* ==========================================================================
 *  Discord.js mocks — minimal shapes the service touches
 * ========================================================================== */

function makeChannel({ name = 'general', sentEmbeds }: { name?: string; sentEmbeds?: any[] }) {
    return {
        id: `chan-${name}`,
        type: ChannelType.GuildText,
        name,
        send: vi.fn().mockImplementation(async (payload: any) => {
            if (sentEmbeds && payload.embeds) sentEmbeds.push(...payload.embeds);
            return { id: 'embed-msg' };
        }),
    };
}

interface FakeGuildOpts {
    ownerId?: string;
    modLogChannelName?: string;
    modLogSentEmbeds?: any[];
}

function makeGuild(opts: FakeGuildOpts = {}) {
    const ownerId = opts.ownerId ?? 'owner-id';
    const modLogChannelName = opts.modLogChannelName ?? 'moderator-only';
    const modLogChannel = makeChannel({
        name: modLogChannelName,
        sentEmbeds: opts.modLogSentEmbeds,
    });
    const guild: any = {
        id: 'guild-1',
        ownerId,
        channels: {
            cache: {
                find: (predicate: (c: any) => boolean) =>
                    predicate(modLogChannel) ? modLogChannel : undefined,
            },
        },
    };
    return { guild, modLogChannel };
}

interface FakeMemberOpts {
    isBot?: boolean;
    isOwner?: boolean;
    isAdmin?: boolean;
    isMod?: boolean;
    timeoutSucceeds?: boolean;
    timeoutErrorCode?: number;
    timeoutUntil?: number | null;
    userId?: string;
}

function makeMessage(content: string, opts: FakeMemberOpts = {}, guildOpts: FakeGuildOpts = {}) {
    const userId = opts.userId ?? 'user-1';
    const { guild, modLogChannel } = makeGuild(guildOpts);

    const timeoutFn = vi.fn().mockImplementation(async () => {
        if (opts.timeoutSucceeds === false) {
            const err: any = new Error('timeout failed');
            if (opts.timeoutErrorCode) err.code = opts.timeoutErrorCode;
            throw err;
        }
        return undefined;
    });

    const roles = new Map<string, any>();
    roles.set('@everyone', { id: guild.id, name: '@everyone', position: 0 });
    if (opts.isMod) {
        roles.set('mods', { id: 'mods', name: 'mods', position: 5 });
    }

    const permissions = {
        has: (perm: bigint) =>
            opts.isAdmin === true && perm === PermissionFlagsBits.Administrator,
    };

    const member: any = {
        id: opts.isOwner ? guild.ownerId : userId,
        user: {
            id: opts.isOwner ? guild.ownerId : userId,
            tag: 'TestUser#0001',
            displayAvatarURL: () => 'https://example.com/avatar.png',
        },
        roles: {
            cache: {
                some: (predicate: (r: any) => boolean) =>
                    [...roles.values()].some(predicate),
                filter: (predicate: (r: any) => boolean) => {
                    const filtered = [...roles.values()].filter(predicate);
                    return {
                        sort: () => filtered.sort((a, b) => b.position - a.position),
                        size: filtered.length,
                    };
                },
                size: roles.size,
            },
        },
        permissions,
        timeout: timeoutFn,
        communicationDisabledUntilTimestamp: opts.timeoutUntil ?? null,
        joinedTimestamp: 1700000000000,
    };

    const channel = makeChannel({ name: 'general' });

    const message: any = {
        id: 'msg-1',
        content,
        guild,
        member,
        author: {
            ...member.user,
            bot: !!opts.isBot,
            createdTimestamp: 1500000000000,
        },
        channel,
        url: 'https://discord.com/channels/guild-1/chan-general/msg-1',
    };

    return { message, member, guild, modLogChannel, timeoutFn };
}

/* ==========================================================================
 *  Tests
 * ========================================================================== */

describe('SlurModerationService', () => {
    let service: SlurModerationService;

    beforeEach(() => {
        // Reset singleton between tests
        (SlurModerationService as any).instance = null;
        service = getSlurModerationService();
        service.clearCache();
        resetOffenseStore();
        vi.clearAllMocks();
        mockS3SuccessFor();
    });

    afterEach(() => {
        service.clearCache();
    });

    /* ----- Detection ----- */

    it('detects placeholder slur and applies timeout', async () => {
        const { message, timeoutFn } = makeMessage('hello fooslurbar world');
        await service.checkMessage(message);
        expect(timeoutFn).toHaveBeenCalledWith(
            30 * 60 * 1000,
            expect.stringContaining('Auto-moderation')
        );
    });

    it('does not trigger on words missing from the slur list (whitelist by omission)', async () => {
        const { timeoutFn: t1 } = await runWith('retard');
        const { timeoutFn: t2 } = await runWith('retarded');
        const { timeoutFn: t3 } = await runWith('fuck this');
        const { timeoutFn: t4 } = await runWith('shit happens');
        expect(t1).not.toHaveBeenCalled();
        expect(t2).not.toHaveBeenCalled();
        expect(t3).not.toHaveBeenCalled();
        expect(t4).not.toHaveBeenCalled();
    });

    it('does not trigger on substring matches (Scunthorpe problem)', async () => {
        // Use a list where the placeholders are themselves substrings of common words
        // to verify word-boundary assertions are doing their job.
        service.clearCache();
        const substringProneList = {
            schemaVersion: 1,
            lastUpdated: new Date().toISOString(),
            slurs: ['foo', 'bar'],
        };
        mockS3SuccessFor(substringProneList);

        // 'foo' should NOT match in 'foobar', 'fool', 'food', 'foofy'
        const { timeoutFn: t1 } = await runWith('foobar is a meta term');
        const { timeoutFn: t2 } = await runWith('don\'t be a fool');
        const { timeoutFn: t3 } = await runWith('I love food');
        // 'bar' should NOT match in 'barricade', 'barbecue', 'bartender'
        const { timeoutFn: t4 } = await runWith('built a barricade');
        const { timeoutFn: t5 } = await runWith('barbecue tonight');
        // But the standalone term DOES still match
        const { timeoutFn: t6 } = await runWith('plain foo here');
        const { timeoutFn: t7 } = await runWith('walk into a bar');

        expect(t1).not.toHaveBeenCalled();
        expect(t2).not.toHaveBeenCalled();
        expect(t3).not.toHaveBeenCalled();
        expect(t4).not.toHaveBeenCalled();
        expect(t5).not.toHaveBeenCalled();
        expect(t6).toHaveBeenCalled();
        expect(t7).toHaveBeenCalled();
    });

    it('detects leetspeak / case / homoglyph evasion', async () => {
        // Case variation: handled by the recommended transformers
        const { timeoutFn: t1 } = await runWith('FOOSLURBAR is bad');
        expect(t1).toHaveBeenCalled();

        // Leetspeak (0 → o): handled by resolveLeetSpeakTransformer
        const { timeoutFn: t2 } = await runWith('say f00slurbar now');
        expect(t2).toHaveBeenCalled();

        // Cyrillic homoglyph (Cyrillic 'е' → Latin 'e'): handled by our preprocessor
        const { timeoutFn: t3 } = await runWith('qwеrtytest hi'); // Cyrillic е U+0435
        expect(t3).toHaveBeenCalled();
    });

    it('detects when slur is wrapped in code-block backticks', async () => {
        const { timeoutFn } = await runWith('hey `fooslurbar`');
        expect(timeoutFn).toHaveBeenCalled();
    });

    it('detects when slur is wrapped in spoiler tags', async () => {
        const { timeoutFn } = await runWith('look ||fooslurbar||');
        expect(timeoutFn).toHaveBeenCalled();
    });

    /* ----- Skip cases ----- */

    it('skips bot authors', async () => {
        const { message, timeoutFn } = makeMessage('qwertytest', { isBot: true });
        await service.checkMessage(message);
        expect(timeoutFn).not.toHaveBeenCalled();
    });

    it('skips messages from members with the mods role', async () => {
        const { message, timeoutFn } = makeMessage('qwertytest', { isMod: true });
        await service.checkMessage(message);
        expect(timeoutFn).not.toHaveBeenCalled();
    });

    it('skips messages from administrators', async () => {
        const { message, timeoutFn } = makeMessage('qwertytest', { isAdmin: true });
        await service.checkMessage(message);
        expect(timeoutFn).not.toHaveBeenCalled();
    });

    it('skips messages from the guild owner', async () => {
        const { message, timeoutFn } = makeMessage('qwertytest', { isOwner: true });
        await service.checkMessage(message);
        expect(timeoutFn).not.toHaveBeenCalled();
    });

    it('skips messages where the user is already in a longer timeout', async () => {
        const farFuture = Date.now() + 60 * 60 * 1000; // 1h > 30 min threshold
        const { message, timeoutFn } = makeMessage('qwertytest', { timeoutUntil: farFuture });
        await service.checkMessage(message);
        expect(timeoutFn).not.toHaveBeenCalled();
    });

    /* ----- Mod-log embed ----- */

    it('posts a mod-log embed with violator metadata to #moderator-only', async () => {
        const sentEmbeds: any[] = [];
        const { message } = makeMessage(
            'qwertytest',
            {},
            { modLogSentEmbeds: sentEmbeds }
        );
        await service.checkMessage(message);

        expect(sentEmbeds).toHaveLength(1);
        const embed = sentEmbeds[0];
        const data = embed.data ?? embed.toJSON();
        expect(data.title).toContain('Slur Detected');
        const fieldNames = (data.fields ?? []).map((f: any) => f.name);
        expect(fieldNames).toEqual(
            expect.arrayContaining(['User', 'Account Created', 'Channel', 'Action', 'Total Offenses'])
        );
    });

    it('rate-limits mod-log embeds to one per minute per user with rollup', async () => {
        const sentEmbeds: any[] = [];
        // First offense — embed posted
        const { message: m1 } = makeMessage(
            'qwertytest',
            { userId: 'rapidfire' },
            { modLogSentEmbeds: sentEmbeds }
        );
        await service.checkMessage(m1);
        expect(sentEmbeds).toHaveLength(1);

        // Second offense within the rate-limit window — suppressed
        const { message: m2 } = makeMessage(
            'qwertytest',
            { userId: 'rapidfire' },
            { modLogSentEmbeds: sentEmbeds }
        );
        await service.checkMessage(m2);
        expect(sentEmbeds).toHaveLength(1);
    });

    it('still posts mod-log when timeout fails (with failure note in Action field)', async () => {
        const sentEmbeds: any[] = [];
        const { message } = makeMessage(
            'qwertytest',
            { timeoutSucceeds: false, timeoutErrorCode: 50013 },
            { modLogSentEmbeds: sentEmbeds }
        );
        await service.checkMessage(message);
        expect(sentEmbeds).toHaveLength(1);
        const data = sentEmbeds[0].data ?? sentEmbeds[0].toJSON();
        const action = (data.fields ?? []).find((f: any) => f.name === 'Action');
        expect(action.value).toContain('Timeout failed');
    });

    /* ----- Offense persistence ----- */

    it('increments offense count across multiple violations', async () => {
        const { message: m1 } = makeMessage('qwertytest', { userId: 'persist-test' });
        await service.checkMessage(m1);

        const { message: m2 } = makeMessage('qwertytest message', { userId: 'persist-test' });
        await service.checkMessage(m2);

        const offenses = await service.getOffenses('guild-1', 'persist-test');
        expect(offenses).not.toBeNull();
        expect(offenses!.count).toBe(2);
        expect(offenses!.history).toHaveLength(2);
    });

    it('serializes concurrent offenses for the same user (no race)', async () => {
        // Fire 5 detections in parallel; expect count=5, no race-induced loss
        const messages = Array.from({ length: 5 }, () =>
            makeMessage('qwertytest', { userId: 'race-test' }).message
        );
        await Promise.all(messages.map(m => service.checkMessage(m)));

        const offenses = await service.getOffenses('guild-1', 'race-test');
        expect(offenses?.count).toBe(5);
        expect(offenses?.history).toHaveLength(5);
    });

    it('does not leak entries in the per-user mutex map after work settles', async () => {
        const { message } = makeMessage('qwertytest', { userId: 'leak-test' });
        await service.checkMessage(message);
        // Allow the finally{} cleanup tick to run
        await new Promise(resolve => setImmediate(resolve));
        const mutexMap: Map<string, unknown> = (service as any).userMutex;
        expect(mutexMap.size).toBe(0);
    });

    it('isolates offenses per guild (no cross-guild count leakage)', async () => {
        const { message: gA } = makeMessage('qwertytest', { userId: 'multi-guild' });
        await service.checkMessage(gA);

        const { message: gB } = makeMessage(
            'qwertytest',
            { userId: 'multi-guild' },
            // Different guild context
            {}
        );
        // Mutate the second message's guild id so it lands in a different bucket
        gB.guild.id = 'guild-2';
        await service.checkMessage(gB);

        const a = await service.getOffenses('guild-1', 'multi-guild');
        const b = await service.getOffenses('guild-2', 'multi-guild');
        expect(a?.count).toBe(1);
        expect(b?.count).toBe(1);
    });

    /* ----- Embed safety ----- */

    it('caps embed field values at 1024 chars (long content + many roles)', async () => {
        const sentEmbeds: any[] = [];
        const { message } = makeMessage(
            'qwertytest ' + 'word '.repeat(100),
            {},
            { modLogSentEmbeds: sentEmbeds }
        );
        // Inject a synthetic role flood to exercise the capping path
        const fakeRoles = Array.from({ length: 50 }, (_, i) => ({
            id: `role-${i}`,
            name: `extremely-long-role-name-number-${i}-padding-padding`,
            position: 100 - i,
        }));
        message.member.roles.cache.filter = (predicate: (r: any) => boolean) => {
            const filtered = fakeRoles.filter(predicate);
            return {
                sort: () => filtered.sort((a, b) => b.position - a.position),
                size: filtered.length,
            };
        };

        await service.checkMessage(message);
        const data = sentEmbeds[0].data ?? sentEmbeds[0].toJSON();
        for (const f of data.fields ?? []) {
            expect(f.value.length).toBeLessThanOrEqual(1024);
        }
    });

    /* ----- S3 failure handling ----- */

    it('posts a degraded embed when slur list fetch fails and matcher is unloaded', async () => {
        // Re-mock S3 to fail the slur-list fetch
        vi.mocked(s3Client.send).mockImplementation(async (command: any) => {
            const constructor = command?.constructor?.name;
            if (constructor === 'GetObjectCommand') {
                const key: string = command.input.Key;
                if (key.includes('slur-list')) {
                    throw new Error('NoSuchKey: file not found');
                }
            }
            return {};
        });

        const sentEmbeds: any[] = [];
        const { message, timeoutFn } = makeMessage(
            'qwertytest',
            {},
            { modLogSentEmbeds: sentEmbeds }
        );
        await service.checkMessage(message);

        // No timeout because matcher never loaded
        expect(timeoutFn).not.toHaveBeenCalled();
        // Degraded embed posted
        expect(sentEmbeds.length).toBeGreaterThanOrEqual(1);
        const data = sentEmbeds[0].data ?? sentEmbeds[0].toJSON();
        expect(data.title).toContain('Degraded');
    });

    /* ----- helpers ----- */

    async function runWith(content: string) {
        const fixture = makeMessage(content);
        await service.checkMessage(fixture.message);
        return fixture;
    }
});
