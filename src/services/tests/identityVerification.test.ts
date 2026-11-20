/**
 * Keeping valid subscriptions: the game's own answers mark an account as
 * accepted, an accepted account isn't deleted by a later rejection, and
 * account details can be changed in place.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Client } from 'discord.js';

vi.stubEnv('CDN_DOMAIN_URL', 'https://cdn.example.com');

vi.mock('discord.js', async (importOriginal) => {
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

vi.mock('../../utils/cdn/config', () => ({
    s3Client: { send: vi.fn() },
    S3_BUCKET: 'test-bucket',
}));

import { EmbedBuilder } from 'discord.js';
import { s3Client } from '../../utils/cdn/config';
import { GachaDataService, getGachaDataService } from '../gachaDataService';
import {
    GachaRedemptionService,
    getGachaRedemptionService,
    isIdentityRejected,
    _testResetCircuitBreaker,
} from '../gachaRedemptionService';
import { GachaCouponData, GameSubscription, RedemptionResult } from '../../utils/interfaces/GachaCoupon.interface';

/** An in-memory coupons.json behind the S3 mock; `puts` counts real writes. */
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
        redeemedCodes: ['OLDCODE'],
        preferences: { weeklyDigest: false },
        ...overrides,
    };
}

function dataWith(...subs: Array<[string, GameSubscription]>): GachaCouponData {
    return {
        coupons: [],
        subscriptions: subs.map(([discordId, s]) => ({ discordId, games: { [s.gameId]: s } })),
        lastUpdated: '2026-11-01T00:00:00.000Z',
        schemaVersion: 1,
    };
}

const result = (code: string, success: boolean, errorCode?: string): RedemptionResult => ({
    code, success, errorCode, gameId: 'bd2', message: '', timestamp: '',
});

beforeEach(() => {
    (GachaDataService as any).instance = null;
    (GachaRedemptionService as any).instance = undefined;
    _testResetCircuitBreaker();
    vi.mocked(s3Client.send).mockReset();
});

describe('isIdentityRejected', () => {
    it('is true only when the account was rejected and accepted nowhere', () => {
        expect(isIdentityRejected([result('A', false, 'IncorrectUser')])).toBe(true);
        expect(isIdentityRejected([result('A', false, 'IncorrectUser'), result('B', false, 'ExpiredCode')])).toBe(true);
    });

    it('is false once any answer shows the game found the account', () => {
        expect(isIdentityRejected([result('A', false, 'IncorrectUser'), result('B', true)])).toBe(false);
        // "Already used" means the game looked the account up.
        expect(isIdentityRejected([result('A', false, 'IncorrectUser'), result('B', false, 'AlreadyUsed')])).toBe(false);
    });

    it('is false for code problems, including a code meant for another region', () => {
        expect(isIdentityRejected([result('A', false, 'RestrictedCode')])).toBe(false);
        expect(isIdentityRejected([result('A', false, 'InvalidCode')])).toBe(false);
        expect(isIdentityRejected([])).toBe(false);
    });
});

describe('GachaDataService: verification stamps', () => {
    it('stamps an account the game accepted, and clears an earlier rejection', async () => {
        const store = storeWith(dataWith(['u1', sub({ identityRejectedAt: '2026-11-10T00:00:00.000Z' })]));

        await getGachaDataService().markCodesRedeemed('u1', 'bd2', ['NEW'], { verified: true });

        const saved = store.read().subscriptions[0].games.bd2!;
        expect(saved.identityVerifiedAt).toBeDefined();
        expect(saved.identityRejectedAt).toBeUndefined();
        expect(saved.redeemedCodes).toEqual(['OLDCODE', 'NEW']);
    });

    it("doesn't stamp a code marked done by hand", async () => {
        const store = storeWith(dataWith(['u1', sub()]));

        await getGachaDataService().markCodesRedeemed('u1', 'bd2', ['NEW']);

        expect(store.read().subscriptions[0].games.bd2!.identityVerifiedAt).toBeUndefined();
    });

    it('verifies in a batch run, in one write, skipping a record edited since', async () => {
        const store = storeWith(dataWith(['u1', sub()], ['u2', sub({ gameUserId: 'EditedSince' })]));

        await getGachaDataService().batchMarkCodesRedeemed([
            { discordId: 'u1', gameId: 'bd2', codes: ['NEW'], verified: true, identity: { userId: 'Tester' } },
            // The run used u2's old details; its results don't belong to the new ones.
            { discordId: 'u2', gameId: 'bd2', codes: ['NEW'], verified: true, identity: { userId: 'OldName' } },
        ]);

        const [u1, u2] = store.read().subscriptions.map(s => s.games.bd2!);
        expect(u1.identityVerifiedAt).toBeDefined();
        expect(u2.identityVerifiedAt).toBeUndefined();
        expect(u2.redeemedCodes).toEqual(['OLDCODE']);
        expect(store.puts).toBe(1);
    });

    it("markCodesRedeemed won't credit edited details with the old account's codes", async () => {
        const store = storeWith(dataWith(['u1', sub({ gameUserId: 'EditedSince', redeemedCodes: [] })]));

        const marked = await getGachaDataService().markCodesRedeemed(
            'u1', 'bd2', ['NEW'], { verified: true, identity: { userId: 'OldName' } }
        );

        expect(marked).toBe(false);
        expect(store.puts).toBe(0);
    });

    it('verifying new details drops the fallback to the old ones', async () => {
        const store = storeWith(dataWith(['u1', sub({
            previousIdentity: { gameUserId: 'OldName', redeemedCodes: [], identityVerifiedAt: '2026-11-01T00:00:00.000Z' },
        })]));

        await getGachaDataService().markCodesRedeemed('u1', 'bd2', ['NEW'], { verified: true });

        expect(store.read().subscriptions[0].games.bd2!.previousIdentity).toBeUndefined();
    });
});

describe('GachaDataService: resolveIdentityRejection', () => {
    const used = { userId: 'Tester' };

    it('keeps an accepted account and records the first rejection', async () => {
        const store = storeWith(dataWith(['u1', sub({ identityVerifiedAt: '2026-11-01T00:00:00.000Z' })]));

        expect(await getGachaDataService().resolveIdentityRejection('u1', 'bd2', used)).toBe('flagged');
        expect(store.read().subscriptions[0].games.bd2!.identityRejectedAt).toBeDefined();
    });

    it('records a rejection once, keeping the first date', async () => {
        const first = '2026-11-10T00:00:00.000Z';
        const store = storeWith(dataWith(['u1', sub({ identityVerifiedAt: '2026-11-01T00:00:00.000Z', identityRejectedAt: first })]));

        expect(await getGachaDataService().resolveIdentityRejection('u1', 'bd2', used)).toBe('already-flagged');
        expect(store.read().subscriptions[0].games.bd2!.identityRejectedAt).toBe(first);
        expect(store.puts).toBe(0);
    });

    it('puts accepted details back when edited ones are rejected', async () => {
        const store = storeWith(dataWith(['u1', sub({
            gameUserId: 'Typo',
            redeemedCodes: [],
            mode: 'notification-only', // changed after the edit; must survive
            previousIdentity: { gameUserId: 'Tester', redeemedCodes: ['OLDCODE'], identityVerifiedAt: '2026-11-01T00:00:00.000Z' },
        })]));

        expect(await getGachaDataService().resolveIdentityRejection('u1', 'bd2', { userId: 'Typo' })).toBe('reverted');

        const saved = store.read().subscriptions[0].games.bd2!;
        expect(saved.gameUserId).toBe('Tester');
        expect(saved.redeemedCodes).toEqual(['OLDCODE']);
        expect(saved.identityVerifiedAt).toBe('2026-11-01T00:00:00.000Z');
        expect(saved.previousIdentity).toBeUndefined();
        expect(saved.mode).toBe('notification-only');
    });

    it('removes details that were never accepted', async () => {
        const store = storeWith(dataWith(['u1', sub()]));

        expect(await getGachaDataService().resolveIdentityRejection('u1', 'bd2', used)).toBe('removed');
        expect(store.read().subscriptions).toHaveLength(0);
    });

    it('leaves alone a record whose details changed since the attempt', async () => {
        const store = storeWith(dataWith(['u1', sub({ gameUserId: 'EditedSince' })]));

        expect(await getGachaDataService().resolveIdentityRejection('u1', 'bd2', used)).toBe('changed');
        expect(store.read().subscriptions[0].games.bd2!.gameUserId).toBe('EditedSince');
        expect(store.puts).toBe(0);
    });

    it('treats a different CZN server as different details', async () => {
        storeWith(dataWith(['u1', sub({
            gameId: 'czn', gameUserId: '12345678901', gameUserFields: { nickname: 'Tester', world: 'world_live_asia' },
        })]));

        expect(await getGachaDataService().resolveIdentityRejection('u1', 'czn', {
            userId: '12345678901', fields: { nickname: 'Tester', world: 'world_live_global' },
        })).toBe('changed');
    });
});

describe('GachaDataService: updateGameIdentity', () => {
    it('changes the details in place, keeping mode, preferences and subscribe date', async () => {
        const original = sub({ identityVerifiedAt: '2026-11-02T00:00:00.000Z', identityRejectedAt: '2026-11-03T00:00:00.000Z' });
        const store = storeWith(dataWith(['u1', original]));

        const { changed } = await getGachaDataService().updateGameIdentity('u1', 'bd2', ' NewName ');

        expect(changed).toBe(true);
        const saved = store.read().subscriptions[0].games.bd2!;
        // The old details are kept to fall back on until the new ones are accepted.
        expect(saved.previousIdentity).toEqual({
            gameUserId: 'Tester',
            redeemedCodes: ['OLDCODE'],
            identityVerifiedAt: original.identityVerifiedAt,
            identityRejectedAt: original.identityRejectedAt,
        });
        expect(saved.gameUserId).toBe('NewName');
        expect(saved.mode).toBe('auto-redeem');
        expect(saved.preferences).toEqual({ weeklyDigest: false });
        expect(saved.subscribedAt).toBe(original.subscribedAt);
        // Codes claimed by the old account shouldn't stop the new one getting them.
        expect(saved.redeemedCodes).toEqual([]);
        // The stamps described the old account.
        expect(saved.identityVerifiedAt).toBeUndefined();
        expect(saved.identityRejectedAt).toBeUndefined();
    });

    it('stores the extra fields for a multi-field game', async () => {
        const store = storeWith(dataWith(['u1', sub({
            gameId: 'czn', gameUserId: '12345678901', gameUserFields: { nickname: 'Tester', world: 'world_live_global' },
        })]));

        await getGachaDataService().updateGameIdentity('u1', 'czn', '12345678901', { nickname: 'Tester', world: 'world_live_asia' });

        expect(store.read().subscriptions[0].games.czn!.gameUserFields).toEqual({ nickname: 'Tester', world: 'world_live_asia' });
    });

    it("writes nothing when the details didn't change", async () => {
        const store = storeWith(dataWith(['u1', sub({
            gameId: 'czn', gameUserId: '12345678901', gameUserFields: { nickname: 'Tester', world: 'world_live_global' },
        })]));

        const { changed } = await getGachaDataService().updateGameIdentity(
            'u1', 'czn', '12345678901', { world: 'world_live_global', nickname: 'Tester' }
        );

        expect(changed).toBe(false);
        expect(store.puts).toBe(0);
        expect(store.read().subscriptions[0].games.czn!.redeemedCodes).toEqual(['OLDCODE']);
    });

    it("refuses an id another user already registered", async () => {
        const store = storeWith(dataWith(['u1', sub()], ['u2', sub({ gameUserId: 'Taken' })]));

        await expect(getGachaDataService().updateGameIdentity('u1', 'bd2', 'taken')).rejects.toThrow('already registered');
        expect(store.puts).toBe(0);
    });

    it('refuses when not subscribed', async () => {
        storeWith(dataWith(['u2', sub()]));

        await expect(getGachaDataService().updateGameIdentity('u1', 'bd2', 'X')).rejects.toThrow('not subscribed');
    });

    it('keeps the accepted details as the fallback through a second unaccepted edit', async () => {
        const store = storeWith(dataWith(['u1', sub({ identityVerifiedAt: '2026-11-02T00:00:00.000Z' })]));
        const service = getGachaDataService();

        await service.updateGameIdentity('u1', 'bd2', 'TypoOne');
        await service.updateGameIdentity('u1', 'bd2', 'TypoTwo');

        expect(store.read().subscriptions[0].games.bd2!.previousIdentity!.gameUserId).toBe('Tester');
    });

    it('revertGameIdentity puts back only the details, keeping changes made meanwhile', async () => {
        const original = sub({ identityVerifiedAt: '2026-11-02T00:00:00.000Z' });
        const store = storeWith(dataWith(['u1', original]));
        const service = getGachaDataService();
        await service.updateGameIdentity('u1', 'bd2', 'NewName');
        await service.switchSubscriptionMode('u1', 'bd2', 'notification-only');

        expect(await service.revertGameIdentity('u1', 'bd2', { userId: 'NewName' })).toBe(true);

        expect(store.read().subscriptions[0].games.bd2).toEqual({ ...original, mode: 'notification-only' });
    });

    it('revertGameIdentity does nothing once the details have moved on', async () => {
        const store = storeWith(dataWith(['u1', sub({ identityVerifiedAt: '2026-11-02T00:00:00.000Z' })]));
        const service = getGachaDataService();
        await service.updateGameIdentity('u1', 'bd2', 'NewName');
        await service.updateGameIdentity('u1', 'bd2', 'Newer');

        expect(await service.revertGameIdentity('u1', 'bd2', { userId: 'NewName' })).toBe(false);
        expect(store.read().subscriptions[0].games.bd2!.gameUserId).toBe('Newer');
    });
});

describe('CZN redemption outside the six-hourly run', () => {
    // These two paths passed only the membership number, so STOVE was never
    // sent the nickname and server and every attempt failed.
    const czn = sub({
        gameId: 'czn',
        gameUserId: '12345678901',
        gameUserFields: { nickname: 'Tester', world: 'world_live_global' },
        redeemedCodes: [],
    });
    let fetchMock: ReturnType<typeof vi.fn>;
    const bot = () => ({
        users: { fetch: vi.fn().mockResolvedValue({ send: vi.fn().mockResolvedValue({}) }) },
    }) as unknown as Client;
    const sentBodies = () => fetchMock.mock.calls.map(c => JSON.parse(c[1].body));

    beforeEach(() => {
        vi.useFakeTimers();
        fetchMock = vi.fn().mockResolvedValue({
            ok: true, status: 200, json: async () => ({ code: 0, value: { result: '000' } }),
        });
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('a new code is redeemed with the full identity, and verifies the account', async () => {
        const data = dataWith(['u1', czn]);
        const store = storeWith(data);
        const coupon = { code: 'FRESHCODE', gameId: 'czn', rewards: 'x', isActive: true, expirationDate: null, addedBy: 'm', addedAt: '' };

        const p = getGachaRedemptionService().notifyNewCode(bot(), coupon as any);
        await vi.runAllTimersAsync();
        await p;

        expect(sentBodies()).toContainEqual(expect.objectContaining({
            guid: '12345678901', nick_name: 'Tester', world_id: 'world_live_global', coupon_no: 'FRESHCODE',
        }));
        expect(store.read().subscriptions[0].games.czn!.identityVerifiedAt).toBeDefined();
    });

    it('a 🔁 re-run is redeemed with the full identity', async () => {
        const data = dataWith(['u1', czn]);
        data.coupons = [{ code: 'RERUNCODE', gameId: 'czn', rewards: 'x', isActive: true, expirationDate: null, addedBy: 'm', addedAt: '' }];
        storeWith(data);

        const p = (getGachaRedemptionService() as any).processForceRerun(bot(), 'u1', 'czn', '12345678901');
        await vi.runAllTimersAsync();
        await p;

        expect(sentBodies()).toContainEqual(expect.objectContaining({
            guid: '12345678901', nick_name: 'Tester', world_id: 'world_live_global', coupon_no: 'RERUNCODE',
        }));
    });
});

describe('six-hourly run: a rejected account', () => {
    const coupons = [{ code: 'NEW1', gameId: 'bd2', rewards: 'x', isActive: true, expirationDate: null, addedBy: 'm', addedAt: '' }];
    let fetchMock: ReturnType<typeof vi.fn>;
    let dm: ReturnType<typeof vi.fn>;
    const bot = () => ({ users: { fetch: vi.fn().mockResolvedValue({ send: dm }) } }) as unknown as Client;

    beforeEach(() => {
        vi.useFakeTimers();
        fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false, error: 'IncorrectUser' }) });
        vi.stubGlobal('fetch', fetchMock);
        dm = vi.fn().mockResolvedValue({});
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    async function run(subscription: GameSubscription, extraCodes: string[] = []) {
        const data = dataWith(['u1', subscription]);
        data.coupons = [...coupons, ...extraCodes.map(code => ({ ...coupons[0], code }))] as any;
        const store = storeWith(data);
        const p = getGachaRedemptionService().processGameAutoRedemptions(bot(), 'bd2');
        await vi.runAllTimersAsync();
        await p;
        return store;
    }

    const dmText = () =>
        vi.mocked(EmbedBuilder).mock.results
            .map(r => r.value as any)
            .flatMap(e => [...e.setTitle.mock.calls, ...e.setDescription.mock.calls].map((c: any[]) => c[0]))
            .join('\n');

    beforeEach(() => vi.mocked(EmbedBuilder).mockClear());

    it('keeps an account the game accepted before, and tells the user once', async () => {
        const store = await run(sub({ redeemedCodes: [], identityVerifiedAt: '2026-11-01T00:00:00.000Z' }));

        const saved = store.read().subscriptions[0]?.games.bd2;
        expect(saved).toBeDefined();
        expect(saved!.identityRejectedAt).toBeDefined();
        expect(dm).toHaveBeenCalledTimes(1);
        expect(dmText()).toContain('/redeem edit game:bd2');
        expect(dmText()).toContain('subscription is kept');
    });

    it("doesn't repeat the message on later runs", async () => {
        const store = await run(sub({
            redeemedCodes: [],
            identityVerifiedAt: '2026-11-01T00:00:00.000Z',
            identityRejectedAt: '2026-11-10T00:00:00.000Z',
        }));

        expect(store.read().subscriptions[0]?.games.bd2).toBeDefined();
        expect(dm).not.toHaveBeenCalled();
    });

    it('still removes an account the game never accepted, and says how to subscribe again', async () => {
        const store = await run(sub({ redeemedCodes: [] }));

        expect(store.read().subscriptions).toHaveLength(0);
        expect(dmText()).toContain('Subscription Removed');
        expect(dmText()).toContain('A form will ask for each detail');
    });

    it("doesn't delete a subscription edited while the run was redeeming", async () => {
        // The review's race: the run reads the old details, the user edits,
        // then the run gets its rejection for the old details.
        fetchMock.mockImplementationOnce(async () => {
            await getGachaDataService().updateGameIdentity('u1', 'bd2', 'EditedMidRun');
            return { ok: true, json: async () => ({ success: false, error: 'IncorrectUser' }) };
        });

        const store = await run(sub({ redeemedCodes: [] }));

        const saved = store.read().subscriptions[0]?.games.bd2;
        expect(saved?.gameUserId).toBe('EditedMidRun');
        expect(dm).not.toHaveBeenCalled();
    });

    it("doesn't credit details edited mid-run with the old account's codes", async () => {
        fetchMock.mockImplementationOnce(async () => {
            await getGachaDataService().updateGameIdentity('u1', 'bd2', 'EditedMidRun');
            return { ok: true, json: async () => ({ success: true }) };
        });

        const store = await run(sub({ redeemedCodes: [] }));

        const saved = store.read().subscriptions[0].games.bd2!;
        expect(saved.redeemedCodes).toEqual([]);
        expect(saved.identityVerifiedAt).toBeUndefined();
    });

    it('puts accepted details back when a later run rejects an unchecked edit', async () => {
        // Edited while no codes were active, so nothing checked the typo then.
        const store = await run(sub({
            gameUserId: 'Typo',
            redeemedCodes: [],
            previousIdentity: { gameUserId: 'Tester', redeemedCodes: [], identityVerifiedAt: '2026-11-01T00:00:00.000Z' },
        }));

        expect(store.read().subscriptions[0].games.bd2!.gameUserId).toBe('Tester');
        expect(dmText()).toContain('previous details, which worked, are back');
    });

    it('stops sending codes after the first "account not recognised"', async () => {
        await run(sub({ redeemedCodes: [] }), ['NEW2', 'NEW3']);

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('stamps an account the game accepted during the run', async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

        const store = await run(sub({ redeemedCodes: [] }));

        expect(store.read().subscriptions[0].games.bd2!.identityVerifiedAt).toBeDefined();
    });
});
