import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { GachaCoupon } from '../../utils/interfaces/GachaCoupon.interface';
import type { ScrapedCode } from '../bd2PulseScraperService';

// In-memory coupon store that behaves like the real one where it matters:
// lookups see inactive coupons too, and a duplicate add throws.
const store: GachaCoupon[] = [];
const addCoupon = vi.fn(async (coupon: GachaCoupon) => {
    if (store.some(c => c.gameId === coupon.gameId && c.code.toUpperCase() === coupon.code.toUpperCase())) {
        throw new Error(`Coupon code "${coupon.code}" already exists`);
    }
    store.push({ ...coupon, code: coupon.code.toUpperCase() });
});

vi.mock('../gachaDataService.js', () => ({
    getGachaDataService: () => ({
        getAllCoupons: async (gameId: string) => store.filter(c => c.gameId === gameId),
        addCoupon,
    }),
}));

// BD2 Pulse is the secondary source. Mocking it here also keeps Puppeteer out
// of the test run entirely.
const scrapeBD2PulseCodes = vi.fn<() => Promise<ScrapedCode[]>>();
vi.mock('../bd2PulseScraperService.js', () => ({
    scrapeBD2PulseCodes: () => scrapeBD2PulseCodes(),
    getScraperInfo: () => ({ botUserId: 'bd2pulse-scraper' }),
}));

import { syncCouponSources, gamesWithNewCodes, mergeSources, SourcedCode } from '../couponSourceService';

function page(entries: unknown[]): string {
    return `<html><script type="application/json">${JSON.stringify(entries)}</script></html>`;
}

const gf = (game: string, code: string, extra: Record<string, unknown> = {}) => ({
    game, code, status: 'active', reports: 0, sources: ['x-codes'], ...extra,
});

const pulse = (code: string, extra: Partial<ScrapedCode> = {}): ScrapedCode => ({
    code, rewards: `${code} pulse rewards`, expirationDate: null, status: 'active', ...extra,
});

/** Gachafeed pages by slug; a value that is an Error makes that page fail. */
let pages: Record<string, string | Error>;

const existing = (gameId: 'bd2' | 'czn', code: string, isActive = true): GachaCoupon => ({
    code, gameId, rewards: '', expirationDate: null, addedBy: 'mod', addedAt: '2026-10-01T00:00:00Z', isActive,
});

const stored = (gameId: string, code: string) => store.find(c => c.gameId === gameId && c.code === code);

describe('syncCouponSources', () => {
    beforeEach(() => {
        // Only Date is faked: expiry checks run against a fixed "now" instead of
        // the wall clock, and nothing here waits on a timer.
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-11T00:00:00.000Z'));

        store.length = 0;
        addCoupon.mockClear();
        scrapeBD2PulseCodes.mockReset().mockResolvedValue([]);
        pages = { bd2: page([]), czn: page([]) };

        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            const slug = url.match(/gachafeed\.moe\/([^/]+)\/codes\//)?.[1] ?? '';
            const body = pages[slug];
            if (body instanceof Error) throw body;
            return { ok: body !== undefined, status: body === undefined ? 404 : 200, text: async () => body ?? '' };
        }));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('stores Gachafeed codes for both games, attributed to Gachafeed', async () => {
        pages.czn = page([gf('czn', 'NIGHTMARECARNIVAL', { rewards: 'Crystals ×1,000', expiresAt: '2026-11-09T14:59:00.000Z' })]);
        pages.bd2 = page([gf('bd2', '2026BD2OCT')]);

        const result = await syncCouponSources();

        expect(result.success).toBe(true);
        expect(result.added).toEqual([
            { gameId: 'bd2', code: '2026BD2OCT', source: 'Gachafeed' },
            { gameId: 'czn', code: 'NIGHTMARECARNIVAL', source: 'Gachafeed' },
        ]);
        expect(stored('czn', 'NIGHTMARECARNIVAL')).toMatchObject({
            isActive: true,
            addedBy: 'gachafeed-scraper',
            source: 'Gachafeed (Auto)',
            rewards: 'Crystals ×1,000',
            expirationDate: '2026-11-09T14:59:00.000Z',
        });
        expect(gamesWithNewCodes(result)).toEqual(['bd2', 'czn']);
    });

    it('never stores a CZN code players have reported, so it is never auto-redeemed', async () => {
        pages.czn = page([
            gf('czn', 'GOODCODE'),
            gf('czn', 'REPORTEDCODE', { reports: 2 }),
        ]);

        const result = await syncCouponSources();

        const storedCodes = addCoupon.mock.calls.map(([c]) => c.code);
        expect(storedCodes).toEqual(['GOODCODE']);
        expect(result.heldBack).toEqual([
            { gameId: 'czn', code: 'REPORTEDCODE', reason: '2 player reports that it does not work' },
        ]);
    });

    it('never stores a code that is expired by status or by date', async () => {
        pages.czn = page([
            gf('czn', 'DEADBYSTATUS', { status: 'expired' }),
            gf('czn', 'DEADBYDATE', { expiresAt: '2026-10-01T00:00:00.000Z' }),
        ]);
        scrapeBD2PulseCodes.mockResolvedValue([pulse('OLDPULSE', { expirationDate: '2026-09-01T00:00:00.000Z' })]);

        const result = await syncCouponSources();

        expect(addCoupon).not.toHaveBeenCalled();
        expect(result.skippedExpired.map(r => `${r.gameId}:${r.code}`).sort())
            .toEqual(['bd2:OLDPULSE', 'czn:DEADBYDATE', 'czn:DEADBYSTATUS']);
    });

    it('does not re-add a code a moderator already removed', async () => {
        store.push(existing('czn', 'REMOVEDBYMOD', false));
        pages.czn = page([gf('czn', 'REMOVEDBYMOD')]);

        const result = await syncCouponSources();

        expect(addCoupon).not.toHaveBeenCalled();
        expect(result.skippedExisting).toEqual([{ gameId: 'czn', code: 'REMOVEDBYMOD' }]);
    });

    it('credits Gachafeed for a BD2 code both know, but keeps BD2 Pulse\'s reward text', async () => {
        // Gachafeed lists BD2 codes without rewards; BD2 Pulse has them. The
        // new-code notification reads rewards off the stored coupon, so losing
        // them here would be a visible regression for BD2 subscribers.
        pages.bd2 = page([gf('bd2', '2026BD2OCT', { expiresAt: '2026-10-31T14:59:00.000Z' })]);
        scrapeBD2PulseCodes.mockResolvedValue([pulse('2026BD2OCT', { rewards: 'Dia ×300' })]);

        const result = await syncCouponSources();

        expect(result.added).toEqual([{ gameId: 'bd2', code: '2026BD2OCT', source: 'Gachafeed' }]);
        expect(stored('bd2', '2026BD2OCT')).toMatchObject({
            addedBy: 'gachafeed-scraper',
            rewards: 'Dia ×300',
            expirationDate: '2026-10-31T14:59:00.000Z',
        });
        expect(result.codes.filter(c => c.code === '2026BD2OCT')).toHaveLength(1);
    });

    it('stores a BD2 code only BD2 Pulse knows, signed the way BD2 Pulse always signed it', async () => {
        pages.bd2 = page([gf('bd2', '2026BD2OCT')]);
        scrapeBD2PulseCodes.mockResolvedValue([pulse('2026BD2OCT'), pulse('PULSEONLY', { rewards: 'Gold ×1' })]);

        const result = await syncCouponSources();

        expect(result.added).toEqual([
            { gameId: 'bd2', code: '2026BD2OCT', source: 'Gachafeed' },
            { gameId: 'bd2', code: 'PULSEONLY', source: 'BD2 Pulse' },
        ]);
        expect(stored('bd2', 'PULSEONLY')).toMatchObject({
            addedBy: 'bd2pulse-scraper',
            source: 'BD2 Pulse (Auto)',
            rewards: 'Gold ×1',
        });
    });

    it('still gets BD2 codes from BD2 Pulse when Gachafeed is down, and says so', async () => {
        pages.bd2 = new Error('getaddrinfo ENOTFOUND gachafeed.moe');
        scrapeBD2PulseCodes.mockResolvedValue([pulse('PULSEONLY')]);

        const result = await syncCouponSources();

        expect(result.success).toBe(true);
        expect(result.added).toEqual([{ gameId: 'bd2', code: 'PULSEONLY', source: 'BD2 Pulse' }]);
        expect(result.outcomes).toContainEqual(expect.objectContaining({
            source: 'Gachafeed', gameId: 'bd2', success: false, error: 'getaddrinfo ENOTFOUND gachafeed.moe',
        }));
    });

    it('treats a changed page layout as a failed source, not as "no codes"', async () => {
        pages.czn = '<html>redesigned</html>';

        const result = await syncCouponSources();

        expect(result.outcomes).toContainEqual(expect.objectContaining({ source: 'Gachafeed', gameId: 'czn', success: false }));
    });

    it('reports overall failure only when every source failed', async () => {
        pages.bd2 = new Error('down');
        pages.czn = new Error('down');
        scrapeBD2PulseCodes.mockRejectedValue(new Error('browser crashed'));

        const result = await syncCouponSources();

        expect(result.success).toBe(false);
        expect(result.outcomes).toHaveLength(3);
        expect(result.outcomes.every(o => !o.success)).toBe(true);
        expect(result.added).toEqual([]);
    });

    it('lists a game once in gamesWithNewCodes however many codes it gained', async () => {
        pages.czn = page([gf('czn', 'A'), gf('czn', 'B')]);

        const result = await syncCouponSources();

        expect(gamesWithNewCodes(result)).toEqual(['czn']);
    });
});

describe('mergeSources', () => {
    const code = (c: string, source: SourcedCode['source'], extra: Partial<SourcedCode> = {}): SourcedCode => ({
        code: c, rewards: 'Unknown', expirationDate: null, status: 'active', gameId: 'bd2', source, ...extra,
    });

    it('never lets the secondary overwrite a field the primary actually knows', () => {
        const [merged] = mergeSources(
            [code('X', 'Gachafeed', { rewards: 'Primary rewards', expirationDate: '2026-10-31T00:00:00.000Z' })],
            [code('X', 'BD2 Pulse', { rewards: 'Secondary rewards', expirationDate: '2026-12-31T00:00:00.000Z' })]
        );

        expect(merged).toMatchObject({
            source: 'Gachafeed',
            rewards: 'Primary rewards',
            expirationDate: '2026-10-31T00:00:00.000Z',
        });
    });

    it('fills a missing end date from the secondary', () => {
        const [merged] = mergeSources(
            [code('X', 'Gachafeed')],
            [code('X', 'BD2 Pulse', { expirationDate: '2026-12-31T00:00:00.000Z' })]
        );

        expect(merged.expirationDate).toBe('2026-12-31T00:00:00.000Z');
    });
});
