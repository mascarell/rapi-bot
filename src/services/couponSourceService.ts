/**
 * Coupon Source Service
 *
 * One entry point for "go and find new coupon codes", across every source:
 *
 *   1. Gachafeed — primary, for every game it covers (bd2, czn).
 *   2. BD2 Pulse — secondary, BD2 only.
 *
 * Both sources are collected first, merged, then stored once. For BD2 that
 * means Gachafeed decides attribution for any code both know about, while BD2
 * Pulse fills in what Gachafeed leaves blank — Gachafeed carries no reward text
 * for BD2 codes, and BD2 Pulse does — and contributes any code only it has.
 * BD2 auto-redemption already worked on BD2 Pulse alone, so keeping it in the
 * loop means BD2 coverage cannot get worse than it was, only better. Either
 * source failing leaves the other's codes intact.
 *
 * One consequence, accepted on purpose: a BD2 code Gachafeed holds back (say,
 * because players reported it) can still arrive via BD2 Pulse. That is how BD2
 * behaved before, and BD2 does not penalise invalid attempts. CZN does, which is
 * why CZN has no secondary source.
 *
 * Any code this stores is active, and the next auto-redemption run fires it at
 * every subscriber. Confidence checks therefore happen before storage — see
 * selectRedeemableEntries() in gachafeedScraperService.
 */

import { GachaGameId } from '../utils/interfaces/GachaCoupon.interface.js';
import { GACHAFEED_CONFIG } from '../utils/data/gachafeedConfig.js';
import { getGachaDataService } from './gachaDataService.js';
import { fetchGachafeedEntries, selectRedeemableEntries } from './gachafeedScraperService.js';
import { scrapeBD2PulseCodes, getScraperInfo, ScrapedCode } from './bd2PulseScraperService.js';
import { logger } from '../utils/logger.js';

export type CouponSourceName = 'Gachafeed' | 'BD2 Pulse';

export interface GameCodeRef {
    gameId: GachaGameId;
    code: string;
}

export interface SourcedCode extends ScrapedCode {
    gameId: GachaGameId;
    source: CouponSourceName;
}

export interface SourceOutcome {
    source: CouponSourceName;
    gameId: GachaGameId;
    success: boolean;
    /** Codes the source listed, before any filtering. */
    found: number;
    error?: string;
}

export interface CouponSyncResult {
    /** True when at least one source succeeded. */
    success: boolean;
    outcomes: SourceOutcome[];
    /** Every live code, after merging sources. */
    codes: SourcedCode[];
    /** Codes stored by this run, and therefore about to be auto-redeemed. */
    added: (GameCodeRef & { source: CouponSourceName })[];
    /** Live according to a source, but not confident enough to auto-redeem. */
    heldBack: (GameCodeRef & { reason: string })[];
    skippedExpired: GameCodeRef[];
    skippedExisting: GameCodeRef[];
}

/** How each source signs the coupons it stores. BD2 Pulse's are unchanged from before. */
const SOURCE_RECORD: Record<CouponSourceName, () => { addedBy: string; label: string }> = {
    'Gachafeed': () => ({ addedBy: GACHAFEED_CONFIG.BOT_USER_ID, label: GACHAFEED_CONFIG.SOURCE_LABEL }),
    'BD2 Pulse': () => ({ addedBy: getScraperInfo().botUserId, label: 'BD2 Pulse (Auto)' }),
};

const errorMessage = (error: unknown) => (error as Error)?.message ?? String(error);

function pushUnique(list: GameCodeRef[], ref: GameCodeRef): void {
    if (!list.some(r => r.gameId === ref.gameId && r.code === ref.code)) list.push(ref);
}

async function collectGachafeed(gameId: GachaGameId, result: CouponSyncResult): Promise<SourcedCode[]> {
    try {
        const entries = await fetchGachafeedEntries(gameId);
        const selection = selectRedeemableEntries(entries);

        result.outcomes.push({ source: 'Gachafeed', gameId, success: true, found: entries.length });
        for (const held of selection.heldBack) {
            result.heldBack.push({ gameId, ...held });
            logger.debug`[Gachafeed] Holding back ${gameId} code ${held.code}: ${held.reason}`;
        }
        for (const code of selection.expired) {
            pushUnique(result.skippedExpired, { gameId, code });
        }
        return selection.redeemable.map(c => ({ ...c, gameId, source: 'Gachafeed' as const }));
    } catch (error) {
        result.outcomes.push({ source: 'Gachafeed', gameId, success: false, found: 0, error: errorMessage(error) });
        logger.warn`[Gachafeed] ${gameId} unavailable: ${errorMessage(error)}`;
        return [];
    }
}

async function collectBD2Pulse(result: CouponSyncResult): Promise<SourcedCode[]> {
    try {
        const scraped = await scrapeBD2PulseCodes();
        result.outcomes.push({ source: 'BD2 Pulse', gameId: 'bd2', success: true, found: scraped.length });

        const now = new Date();
        const live: SourcedCode[] = [];
        for (const code of scraped) {
            if (code.expirationDate && new Date(code.expirationDate) <= now) {
                pushUnique(result.skippedExpired, { gameId: 'bd2', code: code.code });
            } else {
                live.push({ ...code, gameId: 'bd2', source: 'BD2 Pulse' });
            }
        }
        return live;
    } catch (error) {
        result.outcomes.push({ source: 'BD2 Pulse', gameId: 'bd2', success: false, found: 0, error: errorMessage(error) });
        logger.warn`[BD2 Pulse] unavailable: ${errorMessage(error)}`;
        return [];
    }
}

/**
 * Primary decides which codes exist and who gets the credit; secondary fills
 * the fields primary left blank, then adds the codes primary does not have.
 */
export function mergeSources(primary: SourcedCode[], secondary: SourcedCode[]): SourcedCode[] {
    const fromSecondary = new Map(secondary.map(c => [c.code, c]));
    const merged = primary.map(p => {
        const s = fromSecondary.get(p.code);
        if (!s) return p;
        return {
            ...p,
            rewards: p.rewards === 'Unknown' ? s.rewards : p.rewards,
            expirationDate: p.expirationDate ?? s.expirationDate,
        };
    });
    const known = new Set(primary.map(p => p.code));
    return [...merged, ...secondary.filter(s => !known.has(s.code))];
}

async function storeCodes(gameId: GachaGameId, codes: SourcedCode[], result: CouponSyncResult): Promise<void> {
    if (codes.length === 0) return;

    const dataService = getGachaDataService();
    // Inactive coupons count too: a code a moderator removed must not come back.
    const known = new Set((await dataService.getAllCoupons(gameId)).map(c => c.code.toUpperCase()));

    for (const code of codes) {
        result.codes.push(code);

        if (known.has(code.code)) {
            result.skippedExisting.push({ gameId, code: code.code });
            continue;
        }

        const { addedBy, label } = SOURCE_RECORD[code.source]();
        try {
            await dataService.addCoupon({
                code: code.code,
                gameId,
                rewards: code.rewards,
                expirationDate: code.expirationDate,
                addedBy,
                addedAt: new Date().toISOString(),
                isActive: true,
                source: label,
            });
            known.add(code.code);
            result.added.push({ gameId, code: code.code, source: code.source });
        } catch (error) {
            // Lost a race with a manual /redeem add — the code is stored either way.
            if (!errorMessage(error).includes('already exists')) {
                logger.error`[Coupon sync] Failed to add ${gameId} code ${code.code}: ${errorMessage(error)}`;
            }
        }
    }
}

/**
 * Pull codes from every source and store the new ones.
 * Never throws; inspect `outcomes` for per-source failures.
 */
export async function syncCouponSources(): Promise<CouponSyncResult> {
    const result: CouponSyncResult = {
        success: false,
        outcomes: [],
        codes: [],
        added: [],
        heldBack: [],
        skippedExpired: [],
        skippedExisting: [],
    };

    const byGame = new Map<GachaGameId, SourcedCode[]>();
    for (const gameId of Object.keys(GACHAFEED_CONFIG.SLUGS) as GachaGameId[]) {
        byGame.set(gameId, await collectGachafeed(gameId, result));
    }
    byGame.set('bd2', mergeSources(byGame.get('bd2') ?? [], await collectBD2Pulse(result)));

    for (const [gameId, codes] of byGame) {
        await storeCodes(gameId, codes, result);
    }

    result.success = result.outcomes.some(o => o.success);
    return result;
}

/** Distinct games that gained at least one code in this run. */
export function gamesWithNewCodes(result: CouponSyncResult): GachaGameId[] {
    return [...new Set(result.added.map(a => a.gameId))];
}
