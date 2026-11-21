/**
 * Channel posts for new and expiring codes, their button ids, and the
 * single-code redemption behind "Redeem for me". Real data service on an
 * in-memory S3, real redemption service with fetch stubbed, fake Discord guilds.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChannelType, Client, Collection, MessageType, PermissionFlagsBits } from 'discord.js';

// Read when gachaGamesConfig is first imported, so it must be set before the imports run.
vi.hoisted(() => {
    process.env.CDN_DOMAIN_URL = 'https://cdn.example.com';
});

vi.mock('../../utils/cdn/config', () => ({
    s3Client: { send: vi.fn() },
    S3_BUCKET: 'test-bucket',
}));
vi.mock('../gachaGuildConfigService', () => ({ getGachaGuildConfigService: vi.fn() }));
vi.mock('../couponSourceService', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../couponSourceService')>()),
    syncCouponSources: vi.fn(),
}));

import { s3Client } from '../../utils/cdn/config';
import { GachaDataService, getGachaDataService } from '../gachaDataService';
import { getGachaGuildConfigService } from '../gachaGuildConfigService';
import { syncCouponSources } from '../couponSourceService';
import { GachaCouponScheduler } from '../gachaCouponScheduler';
import { GachaRedemptionService, getGachaRedemptionService, _testResetCircuitBreaker } from '../gachaRedemptionService';
import {
    CouponAnnouncementService,
    buildCouponPost,
    codeFromPost,
    couponButtonId,
    findAnnounceChannel,
    getCouponAnnouncementService,
    parseCouponButtonId,
} from '../couponAnnouncementService';
import { GachaCoupon, GachaCouponData, GachaGameId, GameSubscription } from '../../utils/interfaces/GachaCoupon.interface';

const HOUR = 60 * 60 * 1000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR).toISOString();

function coupon(overrides: Partial<GachaCoupon> = {}): GachaCoupon {
    return {
        code: 'TESTCODE1',
        gameId: 'czn',
        rewards: '100 Gems',
        expirationDate: null,
        addedBy: 'tester',
        addedAt: '2026-11-01T00:00:00.000Z',
        isActive: true,
        ...overrides,
    };
}

/** The embed JSON and button JSON of a built post. */
function render(post: ReturnType<typeof buildCouponPost>) {
    return {
        embed: post.embeds[0].toJSON(),
        buttons: post.components.flatMap(row => row.toJSON().components as any[]),
    };
}

describe('buildCouponPost', () => {
    it('gives CZN Redeem for me, Copy code and a link to the redeem page', () => {
        const { buttons } = render(buildCouponPost(coupon(), 'new'));

        expect(buttons.map(b => b.label)).toEqual(['Redeem for me', 'Copy code', 'Redeem on website']);
        expect(buttons[0].custom_id).toBe('coupon:redeem:czn:TESTCODE1');
        expect(buttons[1].custom_id).toBe('coupon:copy:czn:TESTCODE1');
        expect(buttons[2].url).toBe('https://chaoszeronightmare.onstove.com/en/coupon');
        expect(buttons[2].custom_id).toBeUndefined();
    });

    it('gives a game without auto-redeem or a redeem page only Copy code', () => {
        const { buttons } = render(buildCouponPost(coupon({ gameId: 'lost-sword' }), 'new'));

        expect(buttons.map(b => b.label)).toEqual(['Copy code']);
    });

    it('puts the code in the description and names the game in the title', () => {
        const { embed } = render(buildCouponPost(coupon(), 'new'));

        expect(embed.description).toContain('TESTCODE1');
        expect(embed.title).toContain('New');
        expect(embed.title).toContain('Chaos Zero Nightmare');
    });

    it('warns when the code expires within 24 hours', () => {
        const { embed } = render(buildCouponPost(coupon({ expirationDate: inHours(12) }), 'new'));

        expect(embed.description).toContain('⚠️');
        expect(embed.description).toContain('Redeem it today');
    });

    it('does not warn when the code expires after more than 24 hours', () => {
        const { embed } = render(buildCouponPost(coupon({ expirationDate: inHours(48) }), 'new'));

        expect(embed.description).not.toContain('⚠️');
        // The date itself is still shown.
        expect(embed.fields?.map(f => f.name)).toContain('Expires');
    });

    it('does not warn for a code that has no expiry', () => {
        const { embed } = render(buildCouponPost(coupon({ expirationDate: null }), 'new'));

        expect(embed.description).not.toContain('⚠️');
        expect(embed.fields?.map(f => f.name) ?? []).not.toContain('Expires');
    });

    it("titles an 'expiring' post as a warning and shows the warning line", () => {
        const { embed } = render(buildCouponPost(coupon({ expirationDate: inHours(6) }), 'expiring'));

        expect(embed.title).toContain('expires soon');
        expect(embed.title).not.toContain('New');
        expect(embed.description).toContain('⚠️');
    });

    it('adds the Rewards and Source fields when present, and no Rewards field when empty', () => {
        const full = render(buildCouponPost(coupon({ source: 'Official site' }), 'new')).embed;
        expect(full.fields).toContainEqual(expect.objectContaining({ name: 'Rewards', value: '100 Gems' }));
        expect(full.fields).toContainEqual(expect.objectContaining({ name: 'Source', value: 'Official site' }));

        for (const rewards of ['', '   ']) {
            const { embed } = render(buildCouponPost(coupon({ rewards }), 'new'));
            expect(embed.fields?.map(f => f.name) ?? []).not.toContain('Rewards');
        }
    });

    it('still posts a code too long for a custom id, without the buttons that need it', () => {
        const long = 'A'.repeat(90);

        const lostSword = buildCouponPost(coupon({ gameId: 'lost-sword', code: long }), 'new');
        expect(lostSword.components).toEqual([]);
        expect(lostSword.embeds[0].toJSON().description).toContain(long);

        // CZN keeps its link button, the only one that needs no custom id.
        const { buttons } = render(buildCouponPost(coupon({ code: long }), 'new'));
        expect(buttons.map(b => b.label)).toEqual(['Redeem on website']);
        expect(buttons.every(b => !b.custom_id)).toBe(true);
    });

    it('keeps every custom id within 100 characters and withholds ids for codes outside the allowed characters', () => {
        const { buttons } = render(buildCouponPost(coupon({ code: 'B'.repeat(64) }), 'new'));
        for (const b of buttons) expect((b.custom_id ?? '').length).toBeLessThanOrEqual(100);
        expect(buttons.map(b => b.label)).toContain('Copy code');

        const spaced = render(buildCouponPost(coupon({ code: 'HAS SPACE' }), 'new')).buttons;
        expect(spaced.map(b => b.label)).toEqual(['Redeem on website']);
    });
});

describe('couponButtonId / parseCouponButtonId', () => {
    it('round-trips every action', () => {
        for (const gameId of ['bd2', 'czn', 'lost-sword'] as GachaGameId[]) {
            expect(parseCouponButtonId(couponButtonId('redeem', gameId, 'TESTCODE1')))
                .toEqual({ action: 'redeem', gameId, code: 'TESTCODE1' });
            expect(parseCouponButtonId(couponButtonId('copy', gameId, 'test-code_2')))
                .toEqual({ action: 'copy', gameId, code: 'test-code_2' });
            expect(parseCouponButtonId(couponButtonId('subscribe', gameId)))
                .toEqual({ action: 'subscribe', gameId, code: '' });
        }
    });

    it('accepts subscribe without a code', () => {
        expect(parseCouponButtonId('coupon:subscribe:czn')).toEqual({ action: 'subscribe', gameId: 'czn', code: '' });
    });

    it('rejects a wrong prefix, an unknown action, and an unknown game', () => {
        expect(parseCouponButtonId('redeem_fix_123')).toBeNull();
        expect(parseCouponButtonId('other:redeem:czn:TESTCODE1')).toBeNull();
        expect(parseCouponButtonId('coupon:delete:czn:TESTCODE1')).toBeNull();
        expect(parseCouponButtonId('coupon:redeem:nope:TESTCODE1')).toBeNull();
        expect(parseCouponButtonId('')).toBeNull();
    });

    it('rejects redeem and copy without a code', () => {
        expect(parseCouponButtonId('coupon:redeem:czn:')).toBeNull();
        expect(parseCouponButtonId('coupon:redeem:czn')).toBeNull();
        expect(parseCouponButtonId('coupon:copy:bd2:')).toBeNull();
        expect(parseCouponButtonId('coupon:copy:bd2')).toBeNull();
    });

    it('rejects codes with spaces or other characters', () => {
        expect(parseCouponButtonId('coupon:redeem:czn:HAS SPACE')).toBeNull();
        expect(parseCouponButtonId('coupon:copy:czn:BAD!CODE')).toBeNull();
        expect(parseCouponButtonId(`coupon:copy:czn:${'A'.repeat(65)}`)).toBeNull();
    });

    it('rejects a code containing a colon', () => {
        expect(parseCouponButtonId(couponButtonId('copy', 'czn', 'A:B'))).toBeNull();
        expect(parseCouponButtonId('coupon:redeem:czn:A:B')).toBeNull();
    });
});

/** A guild with the given channels; the bot holds exactly `granted` permissions in each. */
function fakeChannel(
    name: string,
    opts: { type?: ChannelType; granted?: bigint[]; send?: ReturnType<typeof vi.fn> } = {}
) {
    const granted = opts.granted ?? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];
    return {
        name,
        type: opts.type ?? ChannelType.GuildText,
        send: opts.send ?? vi.fn().mockResolvedValue({}),
        permissionsFor: vi.fn(() => ({
            has: (flags: bigint[]) => flags.every(f => granted.includes(f)),
        })),
    };
}

function fakeGuild(id: string, channels: Array<ReturnType<typeof fakeChannel>>) {
    return {
        id,
        name: `Guild ${id}`,
        members: { me: { id: 'bot' } },
        channels: { cache: new Collection(channels.map((c, i) => [`${id}-ch${i}`, c])) },
    };
}

function fakeBot(guilds: Array<ReturnType<typeof fakeGuild>>, send = vi.fn().mockResolvedValue({})) {
    const user = { id: 'user', send };
    return {
        guilds: { cache: new Collection(guilds.map(g => [g.id, g])) },
        users: { fetch: vi.fn().mockResolvedValue(user) },
        user,
    } as unknown as Client & { user: typeof user };
}

describe('findAnnounceChannel', () => {
    it('honours the order of the configured names, not the guild order', () => {
        const bd2 = fakeChannel('bd2');
        const full = fakeChannel('brown-dust-2');
        const guild = fakeGuild('g1', [bd2, full]);

        expect(findAnnounceChannel(guild as any, ['brown-dust-2', 'bd2'])).toBe(full);
        expect(findAnnounceChannel(guild as any, ['bd2', 'brown-dust-2'])).toBe(bd2);
    });

    it('accepts announcement channels as well as text channels', () => {
        const news = fakeChannel('brown-dust-2', { type: ChannelType.GuildAnnouncement });

        expect(findAnnounceChannel(fakeGuild('g1', [news]) as any, ['brown-dust-2'])).toBe(news);
    });

    it('ignores channels of other kinds, and returns undefined when none match', () => {
        const voice = fakeChannel('bd2', { type: ChannelType.GuildVoice });
        const guild = fakeGuild('g1', [voice, fakeChannel('general')]);

        expect(findAnnounceChannel(guild as any, ['bd2'])).toBeUndefined();
    });

    it.each([
        ['ViewChannel', PermissionFlagsBits.ViewChannel],
        ['SendMessages', PermissionFlagsBits.SendMessages],
        ['EmbedLinks', PermissionFlagsBits.EmbedLinks],
    ])('skips a channel the bot lacks %s on, and falls back to the next name', (_label, missing) => {
        const all = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];
        const blocked = fakeChannel('brown-dust-2', { granted: all.filter(p => p !== missing) });
        const open = fakeChannel('bd2');
        const guild = fakeGuild('g1', [blocked, open]);

        expect(findAnnounceChannel(guild as any, ['brown-dust-2', 'bd2'])).toBe(open);
        expect(findAnnounceChannel(fakeGuild('g2', [blocked]) as any, ['brown-dust-2'])).toBeUndefined();
    });

    it('returns undefined when the bot is not a member of the guild', () => {
        const guild = fakeGuild('g1', [fakeChannel('bd2')]);
        (guild.members as any).me = null;

        expect(findAnnounceChannel(guild as any, ['bd2'])).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Services on top of an in-memory coupons.json
// ---------------------------------------------------------------------------

/** An in-memory coupons.json behind the S3 mock. */
function storeWith(data: GachaCouponData) {
    let current = JSON.stringify(data);
    const store = { puts: 0, read: () => JSON.parse(current) as GachaCouponData };
    vi.mocked(s3Client.send).mockImplementation(async (command: any) => {
        const name = command.constructor.name;
        if (name === 'GetObjectCommand') {
            return { Body: { transformToString: async () => current } } as any;
        }
        if (name === 'PutObjectCommand') {
            store.puts++;
            current = command.input.Body;
        }
        return {} as any;
    });
    return store;
}

function sub(overrides: Partial<GameSubscription> = {}): GameSubscription {
    return {
        gameId: 'bd2',
        gameUserId: 'Tester',
        mode: 'auto-redeem',
        subscribedAt: '2026-11-01T00:00:00.000Z',
        redeemedCodes: [],
        preferences: { weeklyDigest: false },
        ...overrides,
    };
}

function dataWith(opts: {
    coupons?: GachaCoupon[];
    subs?: Array<[string, GameSubscription]>;
}): GachaCouponData {
    return {
        coupons: opts.coupons ?? [],
        subscriptions: (opts.subs ?? []).map(([discordId, s]) => ({ discordId, games: { [s.gameId]: s } })),
        lastUpdated: '2026-11-01T00:00:00.000Z',
        schemaVersion: 1,
    };
}

const bd2Coupon = (overrides: Partial<GachaCoupon> = {}) => coupon({ gameId: 'bd2', ...overrides });

let fetchMock: ReturnType<typeof vi.fn>;

const apiAnswer = (body: object) => ({ ok: true, status: 200, statusText: 'OK', json: async () => body, text: async () => '' });

function allowGuilds(ids: string[] | Error) {
    vi.mocked(getGachaGuildConfigService).mockReturnValue({
        getAllowedGuildIds: ids instanceof Error
            ? vi.fn().mockRejectedValue(ids)
            : vi.fn().mockResolvedValue(ids),
    } as any);
}

beforeEach(() => {
    (GachaDataService as any).instance = null;
    (GachaRedemptionService as any).instance = undefined;
    (CouponAnnouncementService as any).instance = undefined;
    _testResetCircuitBreaker();
    vi.mocked(s3Client.send).mockReset();
    fetchMock = vi.fn().mockResolvedValue(apiAnswer({ success: true }));
    vi.stubGlobal('fetch', fetchMock);
    allowGuilds([]);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('CouponAnnouncementService.announce', () => {
    it('posts in every allowlisted guild the bot is in, and nowhere else', async () => {
        const in1 = fakeChannel('chaos-zero-nightmare');
        const in2 = fakeChannel('czn');
        const notAllowed = fakeChannel('czn');
        const bot = fakeBot([fakeGuild('g1', [in1]), fakeGuild('g2', [in2]), fakeGuild('g3', [notAllowed])]);
        // g4 is allowlisted but the bot isn't in it.
        allowGuilds(['g1', 'g2', 'g4']);

        const posted = await getCouponAnnouncementService().announce(bot, coupon());

        expect(posted).toBe(2);
        expect(in1.send).toHaveBeenCalledTimes(1);
        expect(in2.send).toHaveBeenCalledTimes(1);
        expect(notAllowed.send).not.toHaveBeenCalled();
        const sent = in1.send.mock.calls[0][0];
        expect(sent.embeds[0].toJSON().description).toContain('TESTCODE1');
        expect(sent.components).toHaveLength(1);
    });

    it('posts nothing for a game with no announceChannelNames, and does not even read the allowlist', async () => {
        const channel = fakeChannel('lost-sword');
        const getAllowedGuildIds = vi.fn().mockResolvedValue(['g1']);
        vi.mocked(getGachaGuildConfigService).mockReturnValue({ getAllowedGuildIds } as any);

        const posted = await getCouponAnnouncementService().announce(
            fakeBot([fakeGuild('g1', [channel])]),
            coupon({ gameId: 'lost-sword' })
        );

        expect(posted).toBe(0);
        expect(channel.send).not.toHaveBeenCalled();
        expect(getAllowedGuildIds).not.toHaveBeenCalled();
    });

    it('skips a guild without a usable channel', async () => {
        const bot = fakeBot([fakeGuild('g1', [fakeChannel('general')])]);
        allowGuilds(['g1']);

        expect(await getCouponAnnouncementService().announce(bot, coupon())).toBe(0);
    });

    it("returns 0 and doesn't throw when the allowlist read fails", async () => {
        const channel = fakeChannel('czn');
        allowGuilds(new Error('S3 down'));

        await expect(
            getCouponAnnouncementService().announce(fakeBot([fakeGuild('g1', [channel])]), coupon())
        ).resolves.toBe(0);
        expect(channel.send).not.toHaveBeenCalled();
    });

    it("returns 0 and doesn't throw when the allowlist is not a list", async () => {
        vi.mocked(getGachaGuildConfigService).mockReturnValue({ getAllowedGuildIds: vi.fn().mockResolvedValue(undefined) } as any);

        await expect(getCouponAnnouncementService().announce(fakeBot([]), coupon())).resolves.toBe(0);
    });

    it('carries on to the next guild when one channel.send throws', async () => {
        const broken = fakeChannel('czn', { send: vi.fn().mockRejectedValue(new Error('Missing Access')) });
        const fine = fakeChannel('czn');
        allowGuilds(['g1', 'g2']);

        const posted = await getCouponAnnouncementService().announce(
            fakeBot([fakeGuild('g1', [broken]), fakeGuild('g2', [fine])]),
            coupon()
        );

        expect(posted).toBe(1);
        expect(broken.send).toHaveBeenCalledTimes(1);
        expect(fine.send).toHaveBeenCalledTimes(1);
    });
});

describe('CouponAnnouncementService.warnExpiring', () => {
    it('posts once per code expiring within a day, and nothing for the rest', async () => {
        storeWith(dataWith({
            coupons: [
                bd2Coupon({ code: 'SOONCODE1', expirationDate: inHours(6) }),
                bd2Coupon({ code: 'SOONCODE2', expirationDate: inHours(20) }),
                bd2Coupon({ code: 'LATERCODE', expirationDate: inHours(72) }),
                bd2Coupon({ code: 'NOEXPIRY1', expirationDate: null }),
                bd2Coupon({ code: 'GONECODE1', expirationDate: inHours(-2) }),
                bd2Coupon({ code: 'INACTIVE1', expirationDate: inHours(5), isActive: false }),
                coupon({ code: 'OTHERGAME', gameId: 'czn', expirationDate: inHours(5) }),
            ],
        }));
        const channel = fakeChannel('bd2');
        allowGuilds(['g1']);

        const posted = await getCouponAnnouncementService().warnExpiring(fakeBot([fakeGuild('g1', [channel])]), 'bd2');

        expect(posted).toBe(2);
        const codes = channel.send.mock.calls.map(c => c[0].embeds[0].toJSON().description as string);
        expect(codes).toHaveLength(2);
        expect(codes[0]).toContain('SOONCODE1');
        expect(codes[1]).toContain('SOONCODE2');
        expect(channel.send.mock.calls[0][0].embeds[0].toJSON().title).toContain('expires soon');
    });

    it('posts nothing when nothing is expiring', async () => {
        storeWith(dataWith({ coupons: [bd2Coupon({ expirationDate: inHours(72) })] }));
        const channel = fakeChannel('bd2');
        allowGuilds(['g1']);

        expect(await getCouponAnnouncementService().warnExpiring(fakeBot([fakeGuild('g1', [channel])]), 'bd2')).toBe(0);
        expect(channel.send).not.toHaveBeenCalled();
    });

    it('does nothing for a game with no channel configured', async () => {
        const store = storeWith(dataWith({ coupons: [coupon({ gameId: 'lost-sword', expirationDate: inHours(5) })] }));

        expect(await getCouponAnnouncementService().warnExpiring(fakeBot([]), 'lost-sword')).toBe(0);
        expect(vi.mocked(s3Client.send)).not.toHaveBeenCalled();
        expect(store.puts).toBe(0);
    });

    it("doesn't throw when reading the coupons fails", async () => {
        vi.mocked(s3Client.send).mockRejectedValue(new Error('S3 down'));
        allowGuilds(['g1']);

        await expect(
            getCouponAnnouncementService().warnExpiring(fakeBot([fakeGuild('g1', [fakeChannel('bd2')])]), 'bd2')
        ).resolves.toBe(0);
    });
});

describe('GachaRedemptionService.redeemOneForUser', () => {
    const redeemer = () => getGachaRedemptionService();

    it('says a game without auto-redeem is unsupported', async () => {
        storeWith(dataWith({}));

        expect(await redeemer().redeemOneForUser('u1', 'lost-sword', 'TESTCODE1')).toEqual({ status: 'unsupported' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('says not-subscribed when the member has no subscription for the game', async () => {
        storeWith(dataWith({ coupons: [bd2Coupon()] }));

        expect(await redeemer().redeemOneForUser('u1', 'bd2', 'TESTCODE1')).toEqual({ status: 'not-subscribed' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('says inactive for an expired code and for an unknown code, without calling the API', async () => {
        storeWith(dataWith({
            coupons: [bd2Coupon({ code: 'OLDCODE1', expirationDate: inHours(-1) })],
            subs: [['u1', sub()]],
        }));

        expect(await redeemer().redeemOneForUser('u1', 'bd2', 'OLDCODE1')).toEqual({ status: 'inactive' });
        expect(await redeemer().redeemOneForUser('u1', 'bd2', 'NEVERSEEN')).toEqual({ status: 'inactive' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('says already-redeemed when the code is already on the subscription, without calling the API', async () => {
        storeWith(dataWith({
            coupons: [bd2Coupon()],
            subs: [['u1', sub({ redeemedCodes: ['TESTCODE1'] })]],
        }));

        // Matched case-insensitively.
        expect(await redeemer().redeemOneForUser('u1', 'bd2', 'testcode1'))
            .toEqual({ status: 'already-redeemed', gameUserId: 'Tester' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('marks the code redeemed with a verified identity, and writes manual history, on success', async () => {
        const store = storeWith(dataWith({ coupons: [bd2Coupon()], subs: [['u1', sub()]] }));

        const outcome = await redeemer().redeemOneForUser('u1', 'bd2', 'TESTCODE1');

        expect(outcome).toMatchObject({ status: 'done', gameUserId: 'Tester', result: { success: true, code: 'TESTCODE1' } });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body).toMatchObject({ userId: 'Tester', code: 'TESTCODE1' });

        const saved = store.read();
        const record = saved.subscriptions[0].games.bd2!;
        expect(record.redeemedCodes).toEqual(['TESTCODE1']);
        expect(record.identityVerifiedAt).toBeDefined();
        expect(saved.redemptionHistory).toEqual([
            expect.objectContaining({ discordId: 'u1', gameId: 'bd2', code: 'TESTCODE1', success: true, method: 'manual' }),
        ]);
    });

    it('sends the full identity for CZN, nickname and server included', async () => {
        const store = storeWith(dataWith({
            coupons: [coupon()],
            subs: [['u1', sub({
                gameId: 'czn',
                gameUserId: '12345678901',
                gameUserFields: { nickname: 'Tester', world: 'world_live_global' },
            })]],
        }));
        fetchMock.mockResolvedValue(apiAnswer({ code: 0, value: { result: '000' } }));

        const outcome = await redeemer().redeemOneForUser('u1', 'czn', 'TESTCODE1');

        expect(outcome).toMatchObject({ status: 'done', result: { success: true } });
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
            guid: '12345678901', nick_name: 'Tester', world_id: 'world_live_global', coupon_no: 'TESTCODE1',
        });
        expect(store.read().subscriptions[0].games.czn!.redeemedCodes).toEqual(['TESTCODE1']);
    });

    it('marks the code on AlreadyUsed too, since the game found the account', async () => {
        fetchMock.mockResolvedValue(apiAnswer({ success: false, error: 'AlreadyUsed' }));
        const store = storeWith(dataWith({ coupons: [bd2Coupon()], subs: [['u1', sub()]] }));

        const outcome = await redeemer().redeemOneForUser('u1', 'bd2', 'TESTCODE1');

        expect(outcome).toMatchObject({ status: 'done', result: { success: false, errorCode: 'AlreadyUsed' } });
        const saved = store.read();
        expect(saved.subscriptions[0].games.bd2!.redeemedCodes).toEqual(['TESTCODE1']);
        expect(saved.subscriptions[0].games.bd2!.identityVerifiedAt).toBeDefined();
        expect(saved.redemptionHistory?.[0]).toMatchObject({ success: false, errorCode: 'AlreadyUsed', method: 'manual' });
    });

    it('does not mark the code, and does not unsubscribe, on IncorrectUser', async () => {
        fetchMock.mockResolvedValue(apiAnswer({ success: false, error: 'IncorrectUser' }));
        const store = storeWith(dataWith({ coupons: [bd2Coupon()], subs: [['u1', sub()]] }));

        const outcome = await redeemer().redeemOneForUser('u1', 'bd2', 'TESTCODE1');

        expect(outcome).toMatchObject({ status: 'done', result: { success: false, errorCode: 'IncorrectUser' } });
        const saved = store.read();
        expect(saved.subscriptions).toHaveLength(1);
        const record = saved.subscriptions[0].games.bd2!;
        expect(record.redeemedCodes).toEqual([]);
        expect(record.identityVerifiedAt).toBeUndefined();
        // Reported, not acted on: the six-hourly run decides what to do about it.
        expect(record.identityRejectedAt).toBeUndefined();
        expect(saved.redemptionHistory?.[0]).toMatchObject({ errorCode: 'IncorrectUser', method: 'manual' });
    });

    it('does not mark the code on other failures', async () => {
        fetchMock.mockResolvedValue(apiAnswer({ success: false, error: 'ExpiredCode' }));
        const store = storeWith(dataWith({ coupons: [bd2Coupon()], subs: [['u1', sub()]] }));

        await redeemer().redeemOneForUser('u1', 'bd2', 'TESTCODE1');

        expect(store.read().subscriptions[0].games.bd2!.redeemedCodes).toEqual([]);
    });

    it('answers in-progress to a second concurrent call for the same member and code, and calls the API once', async () => {
        let release!: (value: unknown) => void;
        fetchMock.mockReturnValue(new Promise(resolve => { release = resolve; }));
        storeWith(dataWith({ coupons: [bd2Coupon()], subs: [['u1', sub()]] }));

        const first = redeemer().redeemOneForUser('u1', 'bd2', 'TESTCODE1');
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

        expect(await redeemer().redeemOneForUser('u1', 'bd2', 'testcode1')).toEqual({ status: 'in-progress' });

        release(apiAnswer({ success: true }));
        expect(await first).toMatchObject({ status: 'done', result: { success: true } });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('lets a different member redeem the same code at the same time', async () => {
        storeWith(dataWith({ coupons: [bd2Coupon()], subs: [['u1', sub()], ['u2', sub({ gameUserId: 'Tester2' })]] }));

        const outcomes = await Promise.all([
            redeemer().redeemOneForUser('u1', 'bd2', 'TESTCODE1'),
            redeemer().redeemOneForUser('u2', 'bd2', 'TESTCODE1'),
        ]);

        expect(outcomes.map(o => o.status)).toEqual(['done', 'done']);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    describe('after a failed press', () => {
        const T0 = Date.UTC(2026, 10, 20, 12, 0, 0);
        const MIN = 60 * 1000;
        const refusal = (error: string) => apiAnswer({ success: false, error });
        const gatewayError = { ok: false, status: 400, statusText: 'Bad Request', json: async () => ({}), text: async () => '' };

        beforeEach(() => {
            // Only the clock: real timers keep the S3 mock and rate limiter honest.
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(T0);
        });

        it('does not send the code again for 6 hours when the game refused it, then tries again', async () => {
            fetchMock
                .mockResolvedValueOnce(refusal('ExceededUses'))
                .mockResolvedValueOnce(apiAnswer({ success: true }));
            const store = storeWith(dataWith({ coupons: [bd2Coupon({ expirationDate: inHours(48) })], subs: [['u1', sub()]] }));

            const first = await redeemer().redeemOneForUser('u1', 'bd2', 'TESTCODE1');
            expect(first).toMatchObject({ status: 'done', result: { errorCode: 'ExceededUses' } });

            const second = await redeemer().redeemOneForUser('u1', 'bd2', 'TESTCODE1');
            expect(second).toMatchObject({ status: 'cooling-down', until: T0 + 6 * 60 * MIN, result: { errorCode: 'ExceededUses' } });
            expect(fetchMock).toHaveBeenCalledTimes(1);

            vi.setSystemTime(T0 + 6 * 60 * MIN - MIN);
            expect(await redeemer().redeemOneForUser('u1', 'bd2', 'TESTCODE1')).toMatchObject({ status: 'cooling-down' });
            expect(fetchMock).toHaveBeenCalledTimes(1);

            vi.setSystemTime(T0 + 6 * 60 * MIN + MIN);
            expect(await redeemer().redeemOneForUser('u1', 'bd2', 'TESTCODE1')).toMatchObject({ status: 'done', result: { success: true } });
            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(store.read().subscriptions[0].games.bd2!.redeemedCodes).toEqual(['TESTCODE1']);
            // Only real attempts are in the history, not the refused presses.
            expect(store.read().redemptionHistory).toHaveLength(2);
        });

        it('uses the 6 hour window for IncorrectUser too', async () => {
            fetchMock.mockResolvedValue(refusal('IncorrectUser'));
            storeWith(dataWith({ coupons: [bd2Coupon({ expirationDate: inHours(48) })], subs: [['u1', sub()]] }));

            await redeemer().redeemOneForUser('u1', 'bd2', 'TESTCODE1');
            vi.setSystemTime(T0 + 5 * 60 * MIN);

            expect(await redeemer().redeemOneForUser('u1', 'bd2', 'TESTCODE1')).toMatchObject({ status: 'cooling-down' });
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('waits only 10 minutes after a network problem', async () => {
            fetchMock.mockResolvedValueOnce(gatewayError).mockResolvedValueOnce(apiAnswer({ success: true }));
            storeWith(dataWith({ coupons: [bd2Coupon({ expirationDate: inHours(48) })], subs: [['u1', sub()]] }));

            const first = await redeemer().redeemOneForUser('u1', 'bd2', 'TESTCODE1');
            expect(first).toMatchObject({ status: 'done', result: { errorCode: 'NetworkError' } });

            vi.setSystemTime(T0 + 9 * MIN);
            expect(await redeemer().redeemOneForUser('u1', 'bd2', 'TESTCODE1'))
                .toMatchObject({ status: 'cooling-down', until: T0 + 10 * MIN });
            expect(fetchMock).toHaveBeenCalledTimes(1);

            vi.setSystemTime(T0 + 11 * MIN);
            expect(await redeemer().redeemOneForUser('u1', 'bd2', 'TESTCODE1')).toMatchObject({ status: 'done', result: { success: true } });
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it('treats the game saying "already used" as success, not a failure to wait out', async () => {
            fetchMock.mockResolvedValue(refusal('AlreadyUsed'));
            storeWith(dataWith({ coupons: [bd2Coupon({ expirationDate: inHours(48) })], subs: [['u1', sub()]] }));

            await redeemer().redeemOneForUser('u1', 'bd2', 'TESTCODE1');

            expect(await redeemer().redeemOneForUser('u1', 'bd2', 'TESTCODE1')).toMatchObject({ status: 'already-redeemed' });
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('keeps the cooldown per member and per code', async () => {
            fetchMock.mockResolvedValueOnce(refusal('ExceededUses')).mockResolvedValue(apiAnswer({ success: true }));
            storeWith(dataWith({
                coupons: [bd2Coupon({ expirationDate: inHours(48) }), bd2Coupon({ code: 'TESTCODE2', expirationDate: inHours(48) })],
                subs: [['u1', sub()], ['u2', sub({ gameUserId: 'Tester2' })]],
            }));
            // No real waiting between API calls.
            vi.spyOn(redeemer() as any, 'enforceRateLimit').mockResolvedValue(undefined);

            await redeemer().redeemOneForUser('u1', 'bd2', 'TESTCODE1');

            expect(await redeemer().redeemOneForUser('u1', 'bd2', 'TESTCODE1')).toMatchObject({ status: 'cooling-down' });
            expect(await redeemer().redeemOneForUser('u2', 'bd2', 'TESTCODE1')).toMatchObject({ status: 'done', result: { success: true } });
            expect(await redeemer().redeemOneForUser('u1', 'bd2', 'TESTCODE2')).toMatchObject({ status: 'done', result: { success: true } });
        });
    });

    it('sends nothing and says details-rejected when the game has stopped recognising the saved details', async () => {
        const store = storeWith(dataWith({
            coupons: [bd2Coupon()],
            subs: [['u1', sub({ identityRejectedAt: '2026-11-10T00:00:00.000Z' })]],
        }));

        expect(await redeemer().redeemOneForUser('u1', 'bd2', 'TESTCODE1')).toEqual({ status: 'details-rejected' });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(store.read().redemptionHistory ?? []).toEqual([]);
    });

    it('checks the code is already redeemed before the details are judged rejected', async () => {
        storeWith(dataWith({
            coupons: [bd2Coupon()],
            subs: [['u1', sub({ identityRejectedAt: '2026-11-10T00:00:00.000Z', redeemedCodes: ['TESTCODE1'] })]],
        }));

        expect(await redeemer().redeemOneForUser('u1', 'bd2', 'TESTCODE1')).toMatchObject({ status: 'already-redeemed' });
    });

    it('releases the claim when the redemption throws', async () => {
        storeWith(dataWith({ coupons: [bd2Coupon()], subs: [['u1', sub()]] }));
        const service = redeemer();
        vi.spyOn(service, 'redeemCode').mockRejectedValueOnce(new Error('boom'));

        await expect(service.redeemOneForUser('u1', 'bd2', 'TESTCODE1')).rejects.toThrow('boom');
        expect(await service.redeemOneForUser('u1', 'bd2', 'TESTCODE1')).toMatchObject({ status: 'done' });
    });
});

describe('GachaRedemptionService.notifyNewCode and the channel post', () => {
    it('answers a button press in-progress while the fan-out is redeeming for that subscriber, and sends the code once', async () => {
        let release!: (value: unknown) => void;
        fetchMock.mockReturnValue(new Promise(resolve => { release = resolve; }));
        const store = storeWith(dataWith({ coupons: [bd2Coupon()], subs: [['u1', sub()]] }));
        const bot = fakeBot([]);

        const fanOut = getGachaRedemptionService().notifyNewCode(bot, bd2Coupon());
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

        expect(await getGachaRedemptionService().redeemOneForUser('u1', 'bd2', 'TESTCODE1'))
            .toEqual({ status: 'in-progress' });

        release(apiAnswer({ success: true }));
        await fanOut;

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const saved = store.read();
        expect(saved.subscriptions[0].games.bd2!.redeemedCodes).toEqual(['TESTCODE1']);
        // The fan-out records its own run as auto, and the pressed button added nothing.
        expect(saved.redemptionHistory).toEqual([expect.objectContaining({ discordId: 'u1', method: 'auto' })]);
        // Once it has finished the member is told it is already redeemed.
        expect(await getGachaRedemptionService().redeemOneForUser('u1', 'bd2', 'TESTCODE1'))
            .toMatchObject({ status: 'already-redeemed' });
    });

    it('skips a subscriber whose button press got there first, so the code is not sent twice', async () => {
        let release!: (value: unknown) => void;
        fetchMock.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
        storeWith(dataWith({ coupons: [bd2Coupon()], subs: [['u1', sub()]] }));
        const service = getGachaRedemptionService();

        const press = service.redeemOneForUser('u1', 'bd2', 'TESTCODE1');
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

        const fanOut = service.notifyNewCode(fakeBot([]), bd2Coupon());
        release(apiAnswer({ success: true }));
        await Promise.all([press, fanOut]);

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('posts the announcement to the channel before it starts on the DMs and redemptions', async () => {
        storeWith(dataWith({ coupons: [bd2Coupon()], subs: [['u1', sub()]] }));
        const channel = fakeChannel('bd2');
        allowGuilds(['g1']);
        const order: string[] = [];
        channel.send.mockImplementation(async () => { order.push('post'); return {}; });
        fetchMock.mockImplementation(async () => { order.push('redeem'); return apiAnswer({ success: true }); });

        await getGachaRedemptionService().notifyNewCode(fakeBot([fakeGuild('g1', [channel])]), bd2Coupon());

        expect(order).toEqual(['post', 'redeem']);
    });

    it('still sends DMs and redemptions when the announcement fails', async () => {
        const store = storeWith(dataWith({
            coupons: [bd2Coupon()],
            subs: [
                ['u1', sub({ mode: 'notification-only' })],
                ['u2', sub({ gameUserId: 'Tester2' })],
            ],
        }));
        allowGuilds(new Error('S3 down'));
        const send = vi.fn().mockResolvedValue({});
        const bot = fakeBot([], send);

        await expect(getGachaRedemptionService().notifyNewCode(bot, bd2Coupon())).resolves.toBeUndefined();

        // u1 got a DM about the code; u2 was redeemed for, and told the result.
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(send.mock.calls.length).toBeGreaterThanOrEqual(2);
        const saved = store.read();
        expect(saved.subscriptions.find(s => s.discordId === 'u2')!.games.bd2!.redeemedCodes).toEqual(['TESTCODE1']);
        expect(saved.subscriptions.find(s => s.discordId === 'u1')!.games.bd2!.redeemedCodes).toEqual([]);
    });

    it('still sends DMs and redemptions when posting in the channel throws', async () => {
        const store = storeWith(dataWith({ coupons: [bd2Coupon()], subs: [['u2', sub({ gameUserId: 'Tester2' })]] }));
        const channel = fakeChannel('bd2', { send: vi.fn().mockRejectedValue(new Error('Missing Access')) });
        allowGuilds(['g1']);

        await getGachaRedemptionService().notifyNewCode(fakeBot([fakeGuild('g1', [channel])]), bd2Coupon());

        expect(channel.send).toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(store.read().subscriptions[0].games.bd2!.redeemedCodes).toEqual(['TESTCODE1']);
    });

    it('does not post a code that has already expired', async () => {
        storeWith(dataWith({}));
        const channel = fakeChannel('bd2');
        allowGuilds(['g1']);

        await getGachaRedemptionService().notifyNewCode(
            fakeBot([fakeGuild('g1', [channel])]),
            bd2Coupon({ expirationDate: inHours(-1) })
        );

        expect(channel.send).not.toHaveBeenCalled();
    });
});

describe('GachaRedemptionService.sendExpirationWarnings', () => {
    it('posts the last-day warning to the channel for codes expiring within a day only', async () => {
        storeWith(dataWith({
            coupons: [
                bd2Coupon({ code: 'SOONCODE1', expirationDate: inHours(10) }),
                bd2Coupon({ code: 'LATERCODE', expirationDate: inHours(60) }), // inside the 3-day DM window, outside the post window
            ],
        }));
        const channel = fakeChannel('bd2');
        allowGuilds(['g1']);

        await getGachaRedemptionService().sendExpirationWarnings(fakeBot([fakeGuild('g1', [channel])]), 'bd2');

        expect(channel.send).toHaveBeenCalledTimes(1);
        expect(channel.send.mock.calls[0][0].embeds[0].toJSON().description).toContain('SOONCODE1');
    });
});

// ---------------------------------------------------------------------------
// Claims shared by the fan-out, the six-hourly run and button presses
// ---------------------------------------------------------------------------

const pendingOf = (service: unknown): Set<string> => (service as any).pendingRedemptions;

/** A fetch that stays open until `release()`, then answers success. */
function gatedFetch() {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    fetchMock.mockImplementation(async () => {
        await gate;
        return apiAnswer({ success: true });
    });
    return release;
}

const requestedAccounts = () => fetchMock.mock.calls.map(c => JSON.parse(c[1].body).userId as string);

describe('notifyNewCode claims before it posts', () => {
    it('answers a button press in-progress while the channel post is still being sent', async () => {
        storeWith(dataWith({ coupons: [bd2Coupon()], subs: [['u1', sub()]] }));
        let finishPost!: () => void;
        const channel = fakeChannel('bd2', {
            send: vi.fn().mockImplementation(() => new Promise(resolve => { finishPost = () => resolve({}); })),
        });
        allowGuilds(['g1']);
        const service = getGachaRedemptionService();

        const fanOut = service.notifyNewCode(fakeBot([fakeGuild('g1', [channel])]), bd2Coupon());
        await vi.waitFor(() => expect(channel.send).toHaveBeenCalled());

        // The post is up (or going up) but no redemption has started yet.
        expect(fetchMock).not.toHaveBeenCalled();
        expect(await service.redeemOneForUser('u1', 'bd2', 'TESTCODE1')).toEqual({ status: 'in-progress' });
        expect(fetchMock).not.toHaveBeenCalled();

        finishPost();
        await fanOut;

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(pendingOf(service).size).toBe(0);
    });

    it('releases every claim even when the fan-out throws', async () => {
        storeWith(dataWith({
            coupons: [bd2Coupon()],
            subs: [['u1', sub()], ['u2', sub({ gameUserId: 'Tester2' })]],
        }));
        vi.spyOn(getGachaDataService(), 'addBatchRedemptionHistory').mockRejectedValue(new Error('S3 down'));
        const service = getGachaRedemptionService();

        await expect(service.notifyNewCode(fakeBot([]), bd2Coupon())).rejects.toThrow('S3 down');

        expect(pendingOf(service).size).toBe(0);
    });

    it('claims nothing for notification-only subscribers', async () => {
        storeWith(dataWith({ coupons: [bd2Coupon()], subs: [['u1', sub({ mode: 'notification-only' })]] }));
        const service = getGachaRedemptionService();
        const channel = fakeChannel('bd2');
        let seen = -1;
        channel.send.mockImplementation(async () => { seen = pendingOf(service).size; return {}; });
        allowGuilds(['g1']);

        await service.notifyNewCode(fakeBot([fakeGuild('g1', [channel])]), bd2Coupon());

        expect(seen).toBe(0);
    });
});

describe('processGameAutoRedemptions and button presses', () => {
    it('answers a button press in-progress while the run is redeeming for that member, and sends the code once', async () => {
        const store = storeWith(dataWith({ coupons: [bd2Coupon()], subs: [['u1', sub()]] }));
        const release = gatedFetch();
        const service = getGachaRedemptionService();

        const run = service.processGameAutoRedemptions(fakeBot([]), 'bd2');
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

        expect(await service.redeemOneForUser('u1', 'bd2', 'TESTCODE1')).toEqual({ status: 'in-progress' });

        release();
        const result = await run;

        expect(result.successful).toBe(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(store.read().subscriptions[0].games.bd2!.redeemedCodes).toEqual(['TESTCODE1']);
        expect(pendingOf(service).size).toBe(0);
    });

    it('sends the code once for a member the run has not reached yet when they press the button', async () => {
        // More subscribers than the run handles at once, so the last is still waiting its turn.
        const subs: Array<[string, GameSubscription]> = [1, 2, 3, 4, 5, 6].map(n => [`u${n}`, sub({ gameUserId: `Tester${n}` })]);
        const store = storeWith(dataWith({ coupons: [bd2Coupon()], subs }));
        const release = gatedFetch();
        const service = getGachaRedemptionService();
        vi.spyOn(service as any, 'enforceRateLimit').mockResolvedValue(undefined);

        const run = service.processGameAutoRedemptions(fakeBot([]), 'bd2');
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        expect(pendingOf(service).has('u6:bd2:TESTCODE1')).toBe(false);

        const press = service.redeemOneForUser('u6', 'bd2', 'TESTCODE1');
        await vi.waitFor(() => expect(pendingOf(service).has('u6:bd2:TESTCODE1')).toBe(true));

        release();
        const [result, outcome] = await Promise.all([run, press]);

        expect(outcome).toMatchObject({ status: 'done', result: { success: true } });
        expect(result.skipped).toBe(1);
        const accounts = requestedAccounts();
        expect(accounts.filter(a => a === 'Tester6')).toHaveLength(1);
        expect(accounts).toHaveLength(6);
        for (const s of store.read().subscriptions) {
            expect(s.games.bd2!.redeemedCodes, s.discordId).toEqual(['TESTCODE1']);
        }
        expect(pendingOf(service).size).toBe(0);
    });

    it('skips a code that is pending for the member, without the "all redeemed" DM', async () => {
        storeWith(dataWith({ coupons: [bd2Coupon()], subs: [['u1', sub()]] }));
        const release = gatedFetch();
        const service = getGachaRedemptionService();
        const bot = fakeBot([]);

        const press = service.redeemOneForUser('u1', 'bd2', 'TESTCODE1');
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

        const result = await service.processGameAutoRedemptions(bot, 'bd2', { hasNewCodes: true });

        expect(result).toMatchObject({ usersProcessed: 1, skipped: 1, totalRedemptions: 0, successful: 0 });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(bot.users.fetch).not.toHaveBeenCalled();
        // The press's claim isn't the run's to release.
        expect(pendingOf(service).has('u1:bd2:TESTCODE1')).toBe(true);

        release();
        await press;
        expect(pendingOf(service).size).toBe(0);
    });

    it('still sends the "all redeemed" DM when a member really has every code and nothing is pending', async () => {
        storeWith(dataWith({ coupons: [bd2Coupon()], subs: [['u1', sub({ redeemedCodes: ['TESTCODE1'] })]] }));
        const bot = fakeBot([]);

        const result = await getGachaRedemptionService().processGameAutoRedemptions(bot, 'bd2', { hasNewCodes: true });

        expect(result.skipped).toBe(1);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(bot.users.fetch).toHaveBeenCalledWith('u1');
    });

    it('keeps its claims until the batch write has finished, then releases them', async () => {
        storeWith(dataWith({ coupons: [bd2Coupon()], subs: [['u1', sub()]] }));
        const service = getGachaRedemptionService();
        const data = getGachaDataService();
        const realWrite = data.batchMarkCodesRedeemed.bind(data);
        let heldDuringWrite: boolean | undefined;
        vi.spyOn(data, 'batchMarkCodesRedeemed').mockImplementation(async (updates) => {
            heldDuringWrite = pendingOf(service).has('u1:bd2:TESTCODE1');
            return realWrite(updates);
        });

        await service.processGameAutoRedemptions(fakeBot([]), 'bd2');

        expect(heldDuringWrite).toBe(true);
        expect(pendingOf(service).size).toBe(0);
    });

    it('releases its claims even when the batch write throws', async () => {
        storeWith(dataWith({
            coupons: [bd2Coupon()],
            subs: [['u1', sub()], ['u2', sub({ gameUserId: 'Tester2' })]],
        }));
        const service = getGachaRedemptionService();
        vi.spyOn(service as any, 'enforceRateLimit').mockResolvedValue(undefined);
        vi.spyOn(getGachaDataService(), 'batchMarkCodesRedeemed').mockRejectedValue(new Error('S3 down'));

        await expect(service.processGameAutoRedemptions(fakeBot([]), 'bd2')).rejects.toThrow('S3 down');

        expect(pendingOf(service).size).toBe(0);
        // The write failed, so nothing was recorded and a press goes through again.
        expect(await service.redeemOneForUser('u1', 'bd2', 'TESTCODE1')).toMatchObject({ status: 'done' });
    });

    it('releases its claims even when reading the active codes throws', async () => {
        storeWith(dataWith({ coupons: [bd2Coupon()], subs: [['u1', sub()]] }));
        const service = getGachaRedemptionService();
        vi.spyOn(getGachaDataService(), 'getActiveCoupons').mockRejectedValue(new Error('S3 down'));

        await expect(service.processGameAutoRedemptions(fakeBot([]), 'bd2')).rejects.toThrow('S3 down');

        expect(pendingOf(service).size).toBe(0);
    });
});

describe('CouponAnnouncementService.warnExpiring: once per code', () => {
    const soon = () => bd2Coupon({ code: 'SOONCODE1', expirationDate: inHours(10) });

    it('does not post the same code again on a second run', async () => {
        storeWith(dataWith({ coupons: [soon()] }));
        const channel = fakeChannel('bd2');
        allowGuilds(['g1']);
        const bot = fakeBot([fakeGuild('g1', [channel])]);
        const announcer = getCouponAnnouncementService();

        expect(await announcer.warnExpiring(bot, 'bd2')).toBe(1);
        expect(await announcer.warnExpiring(bot, 'bd2')).toBe(0);
        expect(await announcer.warnExpiring(bot, 'bd2')).toBe(0);

        expect(channel.send).toHaveBeenCalledTimes(1);
    });

    it('warns for a new code on a later run, and keeps games apart', async () => {
        storeWith(dataWith({ coupons: [soon()] }));
        const bd2Channel = fakeChannel('bd2');
        const cznChannel = fakeChannel('czn');
        allowGuilds(['g1']);
        const bot = fakeBot([fakeGuild('g1', [bd2Channel, cznChannel])]);
        const announcer = getCouponAnnouncementService();

        await announcer.warnExpiring(bot, 'bd2');
        // The same code text on another game is a different code.
        storeWith(dataWith({ coupons: [soon(), coupon({ code: 'SOONCODE1', expirationDate: inHours(10) })] }));
        (GachaDataService as any).instance = null;
        await announcer.warnExpiring(bot, 'czn');

        expect(bd2Channel.send).toHaveBeenCalledTimes(1);
        expect(cznChannel.send).toHaveBeenCalledTimes(1);
    });

    it('skips a code this process posted as new within the last 24 hours, since that post carried the warning', async () => {
        storeWith(dataWith({ coupons: [soon()] }));
        const channel = fakeChannel('bd2');
        allowGuilds(['g1']);
        const bot = fakeBot([fakeGuild('g1', [channel])]);
        const announcer = getCouponAnnouncementService();

        await announcer.announce(bot, soon());
        const posted = await announcer.warnExpiring(bot, 'bd2');

        expect(posted).toBe(0);
        expect(channel.send).toHaveBeenCalledTimes(1);
        expect(channel.send.mock.calls[0][0].embeds[0].toJSON().title).toContain('New');
    });

    it('matches the announced code case-insensitively', async () => {
        storeWith(dataWith({ coupons: [soon()] }));
        const channel = fakeChannel('bd2');
        allowGuilds(['g1']);
        const bot = fakeBot([fakeGuild('g1', [channel])]);
        const announcer = getCouponAnnouncementService();

        await announcer.announce(bot, bd2Coupon({ code: 'soonCODE1', expirationDate: inHours(10) }));

        expect(await announcer.warnExpiring(bot, 'bd2')).toBe(0);
    });

    it('does warn about a code that was posted as new more than 24 hours ago', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        const t0 = Date.UTC(2026, 10, 20, 12, 0, 0);
        vi.setSystemTime(t0);
        const expiring = bd2Coupon({ code: 'SOONCODE1', expirationDate: new Date(t0 + 26 * HOUR).toISOString() });
        storeWith(dataWith({ coupons: [expiring] }));
        const channel = fakeChannel('bd2');
        allowGuilds(['g1']);
        const bot = fakeBot([fakeGuild('g1', [channel])]);
        const announcer = getCouponAnnouncementService();

        await announcer.announce(bot, expiring);
        vi.setSystemTime(t0 + 25 * HOUR);

        expect(await announcer.warnExpiring(bot, 'bd2')).toBe(1);
        expect(channel.send.mock.calls[1][0].embeds[0].toJSON().title).toContain('expires soon');
    });

    it('still warns later when the first attempt could not post at all', async () => {
        storeWith(dataWith({ coupons: [soon()] }));
        const announcer = getCouponAnnouncementService();
        allowGuilds(new Error('S3 down'));
        await announcer.warnExpiring(fakeBot([]), 'bd2');

        // Once the problem is gone the same code is still warned about.
        const channel = fakeChannel('bd2');
        allowGuilds(['g1']);

        expect(await announcer.warnExpiring(fakeBot([fakeGuild('g1', [channel])]), 'bd2')).toBe(1);
    });
});

describe('GachaCouponScheduler.triggerCodeScraping posts what it adds', () => {
    const syncResult = (added: Array<{ gameId: GachaGameId; code: string }>) => ({
        success: true,
        added: added.map(a => ({ ...a, source: 'Gachafeed' as const })),
        outcomes: [],
    });

    function setup(added: Array<{ gameId: GachaGameId; code: string }>) {
        vi.mocked(syncCouponSources).mockResolvedValue(syncResult(added) as any);
        const bd2Channel = fakeChannel('bd2');
        const cznChannel = fakeChannel('czn');
        allowGuilds(['g1']);
        const bot = fakeBot([fakeGuild('g1', [bd2Channel, cznChannel])]);
        const runs = vi.spyOn(getGachaRedemptionService(), 'processGameAutoRedemptions').mockResolvedValue({} as any);
        return { bot, bd2Channel, cznChannel, runs, scheduler: new GachaCouponScheduler(bot) };
    }

    it('announces each added code in its own game channel, before the batch redemption', async () => {
        storeWith(dataWith({ coupons: [bd2Coupon(), coupon({ code: 'CZNCODE01' })] }));
        const { bd2Channel, cznChannel, runs, scheduler } = setup([
            { gameId: 'bd2', code: 'TESTCODE1' },
            { gameId: 'czn', code: 'CZNCODE01' },
        ]);
        const order: string[] = [];
        bd2Channel.send.mockImplementation(async () => { order.push('post'); return {}; });
        runs.mockImplementation(async () => { order.push('run'); return {} as any; });

        const result = await scheduler.triggerCodeScraping();

        expect(result.added).toHaveLength(2);
        expect(bd2Channel.send).toHaveBeenCalledTimes(1);
        expect(bd2Channel.send.mock.calls[0][0].embeds[0].toJSON().description).toContain('TESTCODE1');
        expect(cznChannel.send).toHaveBeenCalledTimes(1);
        expect(cznChannel.send.mock.calls[0][0].embeds[0].toJSON().description).toContain('CZNCODE01');
        expect(order[0]).toBe('post');
        expect(order).toContain('run');
        expect(runs).toHaveBeenCalledWith(expect.anything(), 'bd2', { hasNewCodes: true });
        expect(runs).toHaveBeenCalledWith(expect.anything(), 'czn', { hasNewCodes: true });
    });

    it('posts nothing, and reads no allowlist, when no code was added', async () => {
        storeWith(dataWith({ coupons: [bd2Coupon()] }));
        const { bd2Channel, runs, scheduler } = setup([]);

        await scheduler.triggerCodeScraping();

        expect(bd2Channel.send).not.toHaveBeenCalled();
        expect(vi.mocked(getGachaGuildConfigService)).not.toHaveBeenCalled();
        expect(runs).not.toHaveBeenCalled();
    });

    it('skips an added code that cannot be found in the store and still posts the others', async () => {
        storeWith(dataWith({ coupons: [bd2Coupon()] }));
        const { bd2Channel, runs, scheduler } = setup([
            { gameId: 'bd2', code: 'GONECODE1' },
            { gameId: 'bd2', code: 'TESTCODE1' },
        ]);

        await expect(scheduler.triggerCodeScraping()).resolves.toBeDefined();

        expect(bd2Channel.send).toHaveBeenCalledTimes(1);
        expect(bd2Channel.send.mock.calls[0][0].embeds[0].toJSON().description).toContain('TESTCODE1');
        expect(runs).toHaveBeenCalled();
    });

    it('still runs the batch redemption when the posts fail', async () => {
        storeWith(dataWith({ coupons: [bd2Coupon()] }));
        const { runs, scheduler } = setup([{ gameId: 'bd2', code: 'TESTCODE1' }]);
        allowGuilds(new Error('S3 down'));

        await expect(scheduler.triggerCodeScraping()).resolves.toBeDefined();

        expect(runs).toHaveBeenCalledWith(expect.anything(), 'bd2', { hasNewCodes: true });
    });

    it('does not post a game with no channel configured', async () => {
        storeWith(dataWith({ coupons: [coupon({ gameId: 'lost-sword', code: 'LSCODE001' })] }));
        const { bd2Channel, cznChannel, scheduler } = setup([{ gameId: 'lost-sword', code: 'LSCODE001' }]);

        await scheduler.triggerCodeScraping();

        expect(bd2Channel.send).not.toHaveBeenCalled();
        expect(cznChannel.send).not.toHaveBeenCalled();
    });

    it('leaves nothing for the expiry run to repeat: a code posted now is not warned about for the next day', async () => {
        storeWith(dataWith({ coupons: [bd2Coupon({ expirationDate: inHours(10) })] }));
        const { bd2Channel, bot, scheduler } = setup([{ gameId: 'bd2', code: 'TESTCODE1' }]);

        await scheduler.triggerCodeScraping();
        const warned = await getCouponAnnouncementService().warnExpiring(bot, 'bd2');

        expect(warned).toBe(0);
        expect(bd2Channel.send).toHaveBeenCalledTimes(1);
    });
});

describe('pinning code posts', () => {
    function sentMessage(botUserId = 'user') {
        const notice = {
            type: MessageType.ChannelPinnedMessage,
            author: { id: botUserId },
            reference: { messageId: 'post-1' },
            delete: vi.fn().mockResolvedValue(undefined),
        };
        const message = {
            id: 'post-1',
            client: { user: { id: botUserId } },
            channel: { name: 'czn', messages: { fetch: vi.fn().mockResolvedValue(new Collection([['n1', notice]])) } },
            pin: vi.fn().mockResolvedValue(undefined),
        };
        return { message, notice };
    }

    it('pins a new-code post and deletes the pin notice', async () => {
        const { message, notice } = sentMessage();
        const channel = fakeChannel('czn', { send: vi.fn().mockResolvedValue(message) });
        allowGuilds(['g1']);

        const posted = await getCouponAnnouncementService().announce(fakeBot([fakeGuild('g1', [channel])]), coupon());

        expect(posted).toBe(1);
        expect(message.pin).toHaveBeenCalledTimes(1);
        expect(notice.delete).toHaveBeenCalledTimes(1);
    });

    it('still counts the post when pinning is not allowed', async () => {
        const { message } = sentMessage();
        message.pin.mockRejectedValue(new Error('Missing Permissions'));
        const channel = fakeChannel('czn', { send: vi.fn().mockResolvedValue(message) });
        allowGuilds(['g1']);

        expect(await getCouponAnnouncementService().announce(fakeBot([fakeGuild('g1', [channel])]), coupon())).toBe(1);
    });

    function pinnedPost(gameId: GachaGameId, code: string, authorId = 'user') {
        const { embeds } = buildCouponPost(coupon({ gameId, code }), 'new');
        return { message: { author: { id: authorId }, embeds: embeds.map(e => e.toJSON()), unpin: vi.fn().mockResolvedValue(undefined) } };
    }

    it('unpins posts whose code is no longer active and leaves the rest', async () => {
        const expired = pinnedPost('czn', 'OLDCODE1');
        const live = pinnedPost('czn', 'LIVECODE1');
        const someoneElse = pinnedPost('czn', 'OLDCODE1', 'member');
        const channel: any = fakeChannel('czn');
        channel.messages = {
            fetchPins: vi.fn().mockResolvedValue({ hasMore: false, items: [expired, live, someoneElse] }),
        };
        allowGuilds(['g1']);
        vi.spyOn(getGachaDataService(), 'getActiveCoupons').mockImplementation(async (gameId: GachaGameId) =>
            gameId === 'czn' ? [coupon({ gameId: 'czn', code: 'LIVECODE1' })] : []
        );

        const unpinned = await getCouponAnnouncementService().unpinFinished(fakeBot([fakeGuild('g1', [channel])]));

        expect(unpinned).toBe(1);
        expect(expired.message.unpin).toHaveBeenCalledTimes(1);
        expect(live.message.unpin).not.toHaveBeenCalled();
        expect(someoneElse.message.unpin).not.toHaveBeenCalled();
    });

    it('reads the code back out of a post', () => {
        const { embeds } = buildCouponPost(coupon({ code: 'READBACK1' }), 'new');
        expect(codeFromPost({ embeds: embeds.map(e => e.toJSON()) } as any)).toBe('READBACK1');
    });
});
