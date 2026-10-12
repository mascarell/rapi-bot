import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    parseGachafeedPage,
    selectRedeemableEntries,
    fetchGachafeedEntries,
    GachafeedEntry,
} from '../gachafeedScraperService';
import { GACHAFEED_CONFIG } from '../../utils/data/gachafeedConfig.js';

/**
 * Shaped like a real /{slug}/codes/ page as of 2026-10-11: a JSON-LD block, an
 * unrelated application/json block, then the code payload.
 */
function page(payload: unknown, extra = ''): string {
    return [
        '<html><head>',
        '<script type="application/ld+json">[{"@context":"https://schema.org","@type":"WebPage"}]</script>',
        '</head><body>',
        '<script type="application/json">[{"@type":"ItemList","name":"decoy"}]</script>',
        extra,
        `<script type="application/json">${JSON.stringify(payload)}</script>`,
        '</body></html>',
    ].join('\n');
}

const entry = (overrides: Partial<GachafeedEntry> = {}): GachafeedEntry => ({
    game: 'czn',
    code: 'NIGHTMARECARNIVAL',
    status: 'active',
    reports: 0,
    rewards: 'Crystals ×1,000',
    sources: ['x-codes'],
    ...overrides,
});

const NOW = new Date('2026-10-11T00:00:00.000Z');

describe('parseGachafeedPage', () => {
    it('returns the code payload and ignores JSON-LD and unrelated JSON blocks', () => {
        const entries = parseGachafeedPage(page([entry(), entry({ code: 'CZNNEWPDGIFT3RD' })]), 'czn');

        expect(entries.map(e => e.code)).toEqual(['NIGHTMARECARNIVAL', 'CZNNEWPDGIFT3RD']);
    });

    it('keeps only entries for the requested game', () => {
        const entries = parseGachafeedPage(page([entry(), entry({ game: 'epic7', code: 'EPICWITHCZN' })]), 'czn');

        expect(entries.map(e => e.code)).toEqual(['NIGHTMARECARNIVAL']);
    });

    it('treats an empty payload as "no codes", not as an error', () => {
        expect(parseGachafeedPage(page([]), 'nikke')).toEqual([]);
    });

    it('throws when the payload is missing, so a layout change is not read as "every code vanished"', () => {
        const html = '<html><script type="application/json">[{"@type":"ItemList"}]</script></html>';

        expect(() => parseGachafeedPage(html, 'czn')).toThrow(/layout may have changed/);
    });

    it('skips a malformed JSON block and still finds the payload', () => {
        const html = page([entry()], '<script type="application/json">{not json</script>');

        expect(parseGachafeedPage(html, 'czn')).toHaveLength(1);
    });
});

describe('selectRedeemableEntries', () => {
    it('accepts an active, unreported, unexpired code', () => {
        const { redeemable, heldBack, expired } = selectRedeemableEntries(
            [entry({ expiresAt: '2026-11-30T14:59:00.000Z' })],
            NOW
        );

        expect(heldBack).toEqual([]);
        expect(expired).toEqual([]);
        expect(redeemable).toEqual([{
            code: 'NIGHTMARECARNIVAL',
            rewards: 'Crystals ×1,000',
            expirationDate: '2026-11-30T14:59:00.000Z',
            status: 'active',
        }]);
    });

    it('fills in unknown rewards and a missing end date', () => {
        const [code] = selectRedeemableEntries([entry({ rewards: undefined, expiresAt: undefined })], NOW).redeemable;

        expect(code.rewards).toBe('Unknown');
        expect(code.expirationDate).toBeNull();
    });

    it('holds back a code players have reported as not working', () => {
        // The CZN lockout case: firing this at every subscriber in parallel is
        // how an account ends up locked out of coupons for six hours.
        const { redeemable, heldBack } = selectRedeemableEntries([entry({ reports: 1 })], NOW);

        expect(redeemable).toEqual([]);
        expect(heldBack).toEqual([{ code: 'NIGHTMARECARNIVAL', reason: '1 player report that it does not work' }]);
    });

    it('pluralises the report count', () => {
        const [held] = selectRedeemableEntries([entry({ reports: 3 })], NOW).heldBack;

        expect(held.reason).toBe('3 player reports that it does not work');
    });

    it('holds back a status it does not recognise rather than guessing', () => {
        const { redeemable, heldBack } = selectRedeemableEntries([entry({ status: 'checking' })], NOW);

        expect(redeemable).toEqual([]);
        expect(heldBack[0].reason).toContain('checking');
    });

    it('drops a code Gachafeed lists as expired', () => {
        const { redeemable, expired } = selectRedeemableEntries(
            [entry({ code: 'FULLMOON26', status: 'expired', expiredReason: 'date' })],
            NOW
        );

        expect(redeemable).toEqual([]);
        expect(expired).toEqual(['FULLMOON26']);
    });

    it('drops an "active" code whose end date has already passed', () => {
        const { redeemable, expired } = selectRedeemableEntries(
            [entry({ expiresAt: '2026-10-10T14:59:00.000Z' })],
            NOW
        );

        expect(redeemable).toEqual([]);
        expect(expired).toEqual(['NIGHTMARECARNIVAL']);
    });

    it('normalises case and whitespace', () => {
        const [code] = selectRedeemableEntries([entry({ code: '  nightmareCarnival ' })], NOW).redeemable;

        expect(code.code).toBe('NIGHTMARECARNIVAL');
    });
});

describe('fetchGachafeedEntries', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('requests the game page with our own user agent', async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => page([entry()]) });

        const entries = await fetchGachafeedEntries('czn');

        expect(entries).toHaveLength(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://gachafeed.moe/czn/codes/');
        expect(init.headers['User-Agent']).toBe(GACHAFEED_CONFIG.USER_AGENT);
    });

    it('throws on a non-200 response', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 503, text: async () => '' });

        await expect(fetchGachafeedEntries('bd2')).rejects.toThrow('HTTP 503');
    });

    it('refuses a game Gachafeed does not cover, without a request', async () => {
        await expect(fetchGachafeedEntries('lost-sword')).rejects.toThrow('does not cover');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reports a timeout in words', async () => {
        const abort = new Error('aborted');
        abort.name = 'AbortError';
        fetchMock.mockRejectedValue(abort);

        await expect(fetchGachafeedEntries('czn')).rejects.toThrow(/timed out/);
    });
});
