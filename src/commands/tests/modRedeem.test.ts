import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionFlagsBits, MessageFlags } from 'discord.js';

vi.stubEnv('CDN_DOMAIN_URL', 'https://cdn.example.com');

vi.mock('../../utils/cdn/config', () => ({
    s3Client: { send: vi.fn() },
    S3_BUCKET: 'test-bucket',
}));

vi.mock('../../config/assets', () => ({
    cacheBust: (url: string) => url,
    getAssetUrls: () => ({
        rapiBot: { thumbnail: 'https://example.com/thumb.png' },
        nikke: { logo: 'https://example.com/nikke.png' },
    }),
}));

// Embed validation is not what these tests are about.
vi.mock('discord.js', async importOriginal => {
    const actual = await importOriginal<typeof import('discord.js')>();
    return {
        ...actual,
        EmbedBuilder: vi.fn().mockImplementation(() => ({
            setColor: vi.fn().mockReturnThis(),
            setTitle: vi.fn().mockReturnThis(),
            setThumbnail: vi.fn().mockReturnThis(),
            setDescription: vi.fn().mockReturnThis(),
            addFields: vi.fn().mockReturnThis(),
            setTimestamp: vi.fn().mockReturnThis(),
            setFooter: vi.fn().mockReturnThis(),
            toJSON: vi.fn().mockReturnValue({}),
        })),
    };
});

vi.mock('../utils/paginationBuilder', () => ({ createPaginatedMessage: vi.fn() }));
vi.mock('../utils/spamModeration', () => ({
    handleSpamStats: vi.fn().mockResolvedValue(undefined),
    handleSpamReset: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../services/gachaDataService', () => ({ getGachaDataService: vi.fn() }));
vi.mock('../../services/gachaRedemptionService', () => ({ getGachaRedemptionService: vi.fn() }));
vi.mock('../../services/gachaGuildConfigService', () => ({ getGachaGuildConfigService: vi.fn() }));
vi.mock('../../services/couponSourceService', () => ({ syncCouponSources: vi.fn() }));

import { getGachaDataService } from '../../services/gachaDataService';
import { getGachaRedemptionService } from '../../services/gachaRedemptionService';
import { getGachaGuildConfigService } from '../../services/gachaGuildConfigService';
import { syncCouponSources } from '../../services/couponSourceService';
import { createPaginatedMessage } from '../utils/paginationBuilder';

const modCommand = (await import('../mod')).default;
const redeemModule = await import('../redeem');
const redeemCommand = redeemModule.default;

const GUILD_ID = '1054761356416528475'; // the home server: the write subcommands are home-only
const MOD_MESSAGE = 'Timeout Members';
const NOT_AVAILABLE = '❌ The gacha coupon system is not available on this server.';

const SUBCOMMANDS = ['add', 'remove', 'list', 'trigger', 'unsub', 'update', 'lookup', 'reset', 'scrape', 'stats', 'subscribers'];

/** [option name, required] for each moderator subcommand, as they were on /redeem. */
const EXPECTED_OPTIONS: Record<string, [string, boolean][]> = {
    add: [['game', true], ['code', true], ['rewards', true], ['expiration', false], ['source', false]],
    remove: [['game', true], ['code', true]],
    list: [['game', true], ['filter', false]],
    trigger: [['game', true]],
    unsub: [['user', true], ['game', true]],
    update: [['user', true], ['game', true], ['userid', true]],
    lookup: [['user', true]],
    reset: [['user', true], ['game', true]],
    scrape: [],
    stats: [['game', false]],
    subscribers: [['game', true], ['mode', false]],
};

let dataService: any;
let redemptionService: any;
let allowed: boolean;

function makeInteraction(opts: {
    group?: string;
    sub: string;
    isMod?: boolean;
    strings?: Record<string, string>;
}) {
    return {
        id: 'interaction-1',
        guildId: GUILD_ID,
        guild: { id: GUILD_ID, name: 'Test Guild', ownerId: 'owner-id', roles: { cache: new Map() } },
        memberPermissions: {
            has: (p: bigint) => (opts.isMod ?? true) && p === PermissionFlagsBits.ModerateMembers,
        },
        member: { roles: [] },
        user: { id: 'u1', tag: 'Mod#0001', toString: () => '<@u1>' },
        options: {
            getSubcommandGroup: () => opts.group ?? 'redeem',
            getSubcommand: () => opts.sub,
            getString: (name: string) => opts.strings?.[name] ?? null,
            getUser: () => ({ id: 'u2', tag: 'Member#0002', toString: () => '<@u2>' }),
        },
        reply: vi.fn().mockResolvedValue({}),
        deferReply: vi.fn().mockResolvedValue({}),
        editReply: vi.fn().mockResolvedValue({}),
    } as any;
}

function makeAutocomplete(opts: { isMod: boolean; sub?: string; group?: string; focused?: string }) {
    return {
        guildId: GUILD_ID,
        guild: { id: GUILD_ID, ownerId: 'owner-id', roles: { cache: new Map() } },
        memberPermissions: {
            has: (p: bigint) => opts.isMod && p === PermissionFlagsBits.ModerateMembers,
        },
        member: { roles: [] },
        user: { id: 'u1' },
        options: {
            getSubcommandGroup: () => opts.group ?? 'redeem',
            getSubcommand: () => opts.sub ?? 'remove',
            getFocused: (full?: boolean) =>
                full ? { name: opts.focused ?? 'code', value: 'test' } : 'test',
            getString: () => 'bd2',
        },
        respond: vi.fn().mockResolvedValue(undefined),
    } as any;
}

beforeEach(() => {
    vi.clearAllMocks();
    allowed = true;
    dataService = {
        addCoupon: vi.fn().mockResolvedValue(undefined),
        removeCoupon: vi.fn().mockResolvedValue(true),
        getAllCoupons: vi.fn().mockResolvedValue([]),
        getGameStats: vi.fn().mockResolvedValue({ total: 0, autoRedeem: 0, notifyOnly: 0 }),
        getGameSubscribers: vi.fn().mockResolvedValue([]),
        getActiveCoupons: vi.fn().mockResolvedValue([
            { code: 'TESTCODE1', rewards: '100 Gems' },
            { code: 'OTHER', rewards: '25 Gems' },
        ]),
    };
    vi.mocked(getGachaDataService).mockReturnValue(dataService);
    redemptionService = {
        notifyNewCode: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getGachaRedemptionService).mockReturnValue(redemptionService);
    vi.mocked(getGachaGuildConfigService).mockReturnValue({
        isGuildAllowed: vi.fn().mockImplementation(async () => allowed),
    } as any);
    vi.mocked(syncCouponSources).mockResolvedValue({
        success: true,
        codes: [],
        added: [],
        outcomes: [],
    } as any);
});

describe('/mod redeem registration', () => {
    const json = () => modCommand.data.toJSON() as any;
    const group = () => json().options.find((o: any) => o.name === 'redeem');

    it('adds a redeem group with exactly the eleven moderator subcommands', () => {
        expect(group().options.map((o: any) => o.name)).toEqual(SUBCOMMANDS);
    });

    it.each(SUBCOMMANDS)('keeps the options of %s as they were on /redeem', name => {
        const sub = group().options.find((o: any) => o.name === name);
        const actual = (sub.options ?? []).map((o: any) => [o.name, o.required === true]);
        expect(actual).toEqual(EXPECTED_OPTIONS[name]);
    });

    it('keeps autocomplete on the remove code option only', () => {
        const flagged = group().options.flatMap((s: any) =>
            (s.options ?? []).filter((o: any) => o.autocomplete).map((o: any) => `${s.name}.${o.name}`));
        expect(flagged).toEqual(['remove.code']);
    });

    it('drops the [Mod] prefix from descriptions', () => {
        for (const sub of group().options) expect(sub.description).not.toContain('[Mod]');
    });
});

describe('/mod redeem dispatch', () => {
    it('add stores the coupon', async () => {
        const i = makeInteraction({
            sub: 'add',
            strings: { game: 'bd2', code: 'newcode123', rewards: '100 Gems' },
        });
        await modCommand.execute(i);
        expect(dataService.addCoupon).toHaveBeenCalledWith(
            expect.objectContaining({ code: 'NEWCODE123', gameId: 'bd2', rewards: '100 Gems' })
        );
    });

    it('remove deactivates the coupon', async () => {
        const i = makeInteraction({ sub: 'remove', strings: { game: 'bd2', code: 'EXISTING' } });
        await modCommand.execute(i);
        expect(dataService.removeCoupon).toHaveBeenCalledWith('bd2', 'EXISTING');
    });

    it('list reads the codes and stats', async () => {
        const i = makeInteraction({ sub: 'list', strings: { game: 'bd2' } });
        await modCommand.execute(i);
        expect(dataService.getAllCoupons).toHaveBeenCalledWith('bd2');
        expect(dataService.getGameStats).toHaveBeenCalledWith('bd2');
    });

    it('scrape runs the source sync', async () => {
        const i = makeInteraction({ sub: 'scrape' });
        await modCommand.execute(i);
        expect(syncCouponSources).toHaveBeenCalledTimes(1);
    });

    it('subscribers reads the subscriber list', async () => {
        const i = makeInteraction({ sub: 'subscribers', strings: { game: 'bd2' } });
        await modCommand.execute(i);
        expect(dataService.getGameSubscribers).toHaveBeenCalledWith('bd2', undefined);
        expect(createPaginatedMessage).not.toHaveBeenCalled();
    });

    it.each(SUBCOMMANDS)('refuses %s for a non-moderator without touching any service', async name => {
        const i = makeInteraction({ sub: name, isMod: false, strings: { game: 'bd2', code: 'X', rewards: 'Y' } });
        await modCommand.execute(i);
        expect(i.reply).toHaveBeenCalledWith(
            expect.objectContaining({ content: expect.stringContaining(MOD_MESSAGE), flags: MessageFlags.Ephemeral })
        );
        expect(dataService.addCoupon).not.toHaveBeenCalled();
        expect(dataService.removeCoupon).not.toHaveBeenCalled();
        expect(dataService.getAllCoupons).not.toHaveBeenCalled();
        expect(syncCouponSources).not.toHaveBeenCalled();
        expect(dataService.getGameSubscribers).not.toHaveBeenCalled();
    });

    it('refuses with the allowlist message when the server is not allowed', async () => {
        allowed = false;
        const i = makeInteraction({ sub: 'add', strings: { game: 'bd2', code: 'X', rewards: 'Y' } });
        await modCommand.execute(i);
        expect(i.reply).toHaveBeenCalledWith({ content: NOT_AVAILABLE, flags: MessageFlags.Ephemeral });
        expect(dataService.addCoupon).not.toHaveBeenCalled();
    });
});

describe('/mod autocomplete for redeem remove', () => {
    it('suggests codes for a moderator', async () => {
        const i = makeAutocomplete({ isMod: true });
        await modCommand.autocomplete(i);
        expect(i.respond).toHaveBeenCalledWith([{ name: 'TESTCODE1 - 100 Gems', value: 'TESTCODE1' }]);
    });

    it('gives nothing to a non-moderator', async () => {
        const i = makeAutocomplete({ isMod: false });
        await modCommand.autocomplete(i);
        expect(i.respond).toHaveBeenCalledWith([]);
        expect(dataService.getActiveCoupons).not.toHaveBeenCalled();
    });

    it('gives nothing for other redeem subcommands or options', async () => {
        const other = makeAutocomplete({ isMod: true, sub: 'list' });
        await modCommand.autocomplete(other);
        expect(other.respond).toHaveBeenCalledWith([]);

        const option = makeAutocomplete({ isMod: true, focused: 'game' });
        await modCommand.autocomplete(option);
        expect(option.respond).toHaveBeenCalledWith([]);
        expect(dataService.getActiveCoupons).not.toHaveBeenCalled();
    });
});

describe('/redeem member subcommands', () => {
    const json = () => redeemCommand.data.toJSON() as any;

    it.each(SUBCOMMANDS)('%s is not registered on /redeem', name => {
        expect(json().options.map((o: any) => o.name)).not.toContain(name);
    });

    it('registers exactly the member subcommands', () => {
        expect(json().options.map((o: any) => o.name)).toEqual(
            ['subscribe', 'edit', 'unsubscribe', 'status', 'codes', 'preferences', 'switch', 'help'],
        );
    });

    it('has no code option left to autocomplete and answers empty', async () => {
        const i = makeAutocomplete({ isMod: true });
        await redeemCommand.autocomplete(i);
        expect(i.respond).toHaveBeenCalledWith([]);
    });
});
