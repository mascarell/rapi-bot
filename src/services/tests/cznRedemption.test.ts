import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Only the URL helper needs stubbing — EmbedBuilder.setThumbnail rejects the
// relative paths the real helper returns when CDN_DOMAIN_URL is unset. Keep
// everything else (cacheBust and friends) real.
vi.mock('../../config/assets.js', async importOriginal => {
    const actual = await importOriginal<typeof import('../../config/assets.js')>();
    return {
        ...actual,
        getAssetUrls: () => ({
            ...actual.getAssetUrls(),
            rapiBot: { thumbnail: 'https://example.com/thumb.png' },
        }),
    };
});

vi.mock('../gachaDataService.js', () => ({
    getGachaDataService: () => ({
        getActiveCoupons: vi.fn().mockResolvedValue([]),
        getSubscribersForNotification: vi.fn().mockResolvedValue([]),
        markCodesRedeemed: vi.fn().mockResolvedValue(undefined),
        addBatchRedemptionHistory: vi.fn().mockResolvedValue(undefined),
        unsubscribe: vi.fn().mockResolvedValue(undefined),
    }),
}));

import { getGachaRedemptionService } from '../gachaRedemptionService';
import { CZN_CONFIG } from '../../utils/data/cznCouponConfig.js';

const ENDPOINT = 'https://api.onstove.com/pub-comm/v1.0/common/coupons';

const IDENTITY = {
    userId: '20026387683',
    fields: { nickname: 'Bryant', world: 'world_live_global' },
};

/** STOVE always answers HTTP 200; failure lives in the body. */
function stoveResponse(body: unknown, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Error',
        json: async () => body,
        text: async () => JSON.stringify(body),
    } as any;
}

const okOuter = (result: string, message?: string) =>
    stoveResponse({ code: 0, message: 'OK', value: { result, ...(message ? { message } : {}) } });

let fetchMock: ReturnType<typeof vi.fn>;

describe('CZN redemption', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        getGachaRedemptionService().clearPoisonedCodes();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    /** Drives redeemCode past its internal rate-limit sleep. */
    async function redeem(code: string, identity: any = IDENTITY) {
        const p = getGachaRedemptionService().redeemCode('czn', identity, code);
        await vi.runAllTimersAsync();
        return p;
    }

    describe('request shape', () => {
        it('posts the seven fields STOVE requires to the guest endpoint', async () => {
            fetchMock.mockResolvedValue(okOuter(CZN_CONFIG.SUCCESS_RESULT));

            await redeem('NIGHTMARECARNIVAL');

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [url, init] = fetchMock.mock.calls[0];
            expect(url).toBe(ENDPOINT);
            expect(init.method).toBe('POST');
            expect(JSON.parse(init.body)).toEqual({
                coupon_no: 'NIGHTMARECARNIVAL',
                game_code: 'STOVE_CHAOSZERO',
                game_id: 'czn',
                lang_code: 'en',
                guid: '20026387683',
                nick_name: 'Bryant',
                world_id: 'world_live_global',
            });
        });

        it('sends no Authorization header or cookie — the guest path needs neither', async () => {
            fetchMock.mockResolvedValue(okOuter(CZN_CONFIG.SUCCESS_RESULT));

            await redeem('CODE');

            const headers = fetchMock.mock.calls[0][1].headers;
            expect(Object.keys(headers).map(h => h.toLowerCase())).toEqual(['content-type']);
        });
    });

    describe('response interpretation', () => {
        it('treats result 000 as success', async () => {
            fetchMock.mockResolvedValue(okOuter('000'));

            const r = await redeem('GOODCODE');

            expect(r.success).toBe(true);
            expect(r.message).toContain('mailbox');
        });

        it('maps 5157 to AlreadyUsed', async () => {
            fetchMock.mockResolvedValue(okOuter('5157', 'Can only be used once per character.'));

            const r = await redeem('USEDCODE');

            expect(r.success).toBe(false);
            expect(r.errorCode).toBe('AlreadyUsed');
        });

        it('maps 5105 to InvalidCode', async () => {
            fetchMock.mockResolvedValue(okOuter('5105', 'Invalid coupon code.'));

            const r = await redeem('BADCODE');

            expect(r.errorCode).toBe('InvalidCode');
        });

        it('maps 5135 to ExpiredCode', async () => {
            fetchMock.mockResolvedValue(okOuter('5135', 'This coupon has expired.'));

            const r = await redeem('OLDCODE');

            expect(r.errorCode).toBe('ExpiredCode');
        });

        it('maps outer -90009 to IncorrectUser without leaking STOVE Korean text', async () => {
            // STOVE returns this message in Korean whatever lang_code says.
            fetchMock.mockResolvedValue(
                stoveResponse({ code: -90009, message: '회원번호와 캐릭터명을 다시 한 번 확인해주세요.' })
            );

            const r = await redeem('ANYCODE');

            expect(r.errorCode).toBe('IncorrectUser');
            expect(r.message).not.toMatch(/[ㄱ-힝]/); // no Hangul
            expect(r.message).toContain('membership number');
            expect(r.message).toContain('server');
        });

        it('does not read a failure body as success just because HTTP was 200', async () => {
            // The trap: response.ok is true for every CZN failure.
            fetchMock.mockResolvedValue(okOuter('5157'));

            const r = await redeem('USEDCODE');

            expect(r.success).toBe(false);
        });

        it('treats result as a string, so "000" does not collide with 0', async () => {
            fetchMock.mockResolvedValue(stoveResponse({ code: 0, value: { result: 0 } }));

            const r = await redeem('WEIRD');

            expect(r.success).toBe(false);
            expect(r.errorCode).toBe('Unknown');
        });

        it('surfaces the six-hour lockout explicitly', async () => {
            fetchMock.mockResolvedValue(okOuter(CZN_CONFIG.LOCKOUT_RESULT));

            const r = await redeem('CODE');

            expect(r.errorCode).toBe('RateLimited');
            expect(r.message).toContain('6 hours');
        });

        it('maps maintenance (outer -90003) to UnavailableCode', async () => {
            fetchMock.mockResolvedValue(stoveResponse({ code: -90003, message: 'maintenance' }));

            const r = await redeem('CODE');

            expect(r.errorCode).toBe('UnavailableCode');
        });
    });

    describe('identity validation', () => {
        it('refuses to call STOVE when the nickname is missing', async () => {
            const r = await redeem('CODE', { userId: '20026387683', fields: { world: 'world_live_global' } });

            expect(fetchMock).not.toHaveBeenCalled();
            expect(r.errorCode).toBe('ValidationFailed');
            expect(r.message).toContain('character nickname');
        });

        it('refuses to call STOVE when the server is missing', async () => {
            const r = await redeem('CODE', { userId: '20026387683', fields: { nickname: 'Bryant' } });

            expect(fetchMock).not.toHaveBeenCalled();
            expect(r.message).toContain('server');
        });

        it('refuses a bare string identity, which cannot carry the extra fields', async () => {
            const r = await redeem('CODE', '20026387683');

            expect(fetchMock).not.toHaveBeenCalled();
            expect(r.errorCode).toBe('ValidationFailed');
        });
    });

    describe('invalid-code lockout protection', () => {
        it('does not send a code a second time once STOVE called it invalid', async () => {
            fetchMock.mockResolvedValue(okOuter('5105'));

            const first = await redeem('TYPO');
            expect(first.errorCode).toBe('InvalidCode');
            expect(fetchMock).toHaveBeenCalledTimes(1);

            // A second subscriber in the same run must not spend another
            // invalid attempt against STOVE's failure counter.
            const second = await redeem('TYPO', {
                userId: '99999999999',
                fields: { nickname: 'Someone', world: 'world_live_global' },
            });

            expect(second.errorCode).toBe('InvalidCode');
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('keeps sending codes that failed for other reasons', async () => {
            fetchMock.mockResolvedValue(okOuter('5157'));

            await redeem('USEDCODE');
            await redeem('USEDCODE');

            // AlreadyUsed is per-account and carries no penalty, so other
            // subscribers must still be tried.
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it('never retries a 200 response, however bad the result code', async () => {
            fetchMock.mockResolvedValue(okOuter('5105'));

            await redeem('TYPO');

            // Retrying an invalid code is what walks an account into the lockout.
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('transport failures', () => {
        it('maps a 5xx to NetworkError after retrying', async () => {
            fetchMock.mockResolvedValue(stoveResponse({}, 500));

            const r = await redeem('CODE');

            expect(r.errorCode).toBe('NetworkError');
            expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
        });

        it('maps a thrown abort to NetworkError', async () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            fetchMock.mockRejectedValue(err);

            const r = await redeem('CODE');

            expect(r.errorCode).toBe('NetworkError');
            expect(r.message).toContain('timed out');
        });
    });
});
