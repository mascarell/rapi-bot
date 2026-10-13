/**
 * Gachafeed Scraper Service
 *
 * Reads coupon codes from https://gachafeed.moe — the primary code source for
 * every game it covers (see GACHAFEED_CONFIG.SLUGS). Plain HTTP and JSON: no
 * browser, no API key.
 *
 * The important part is selectRedeemableEntries(). A code this module returns
 * is stored as active, and the next auto-redemption run fires it at every
 * subscriber. For Chaos Zero Nightmare an invalid code is not free — STOVE
 * counts failed attempts and locks redemption for ~6 hours — so anything
 * Gachafeed is not confident in is held back here, before it is stored.
 */

import { GachaGameId } from '../utils/interfaces/GachaCoupon.interface.js';
import { GACHAFEED_CONFIG } from '../utils/data/gachafeedConfig.js';
import { ScrapedCode } from './bd2PulseScraperService.js';
import { logger } from '../utils/logger.js';

/** One entry of the JSON payload embedded in a `/{slug}/codes/` page. */
export interface GachafeedEntry {
    game: string;
    code: string;
    status: string;
    /** Player "didn't work" votes. Gachafeed never retires a code on these alone. */
    reports?: number;
    rewards?: string;
    expiresAt?: string;
    expiredReason?: string;
    sources?: string[];
}

export interface HeldBackCode {
    code: string;
    reason: string;
}

export interface GachafeedSelection {
    /** Safe to store and auto-redeem. */
    redeemable: ScrapedCode[];
    /** Live by Gachafeed's account, but not confident enough to fire. */
    heldBack: HeldBackCode[];
    /** Expired by status or by date. */
    expired: string[];
}

function isEntry(value: unknown): value is GachafeedEntry {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return typeof v.code === 'string' && typeof v.game === 'string' && typeof v.status === 'string';
}

/**
 * Extract the code payload from a Gachafeed game page.
 *
 * Throws when no payload can be found. That is deliberate: an empty array means
 * "this game has no codes right now", while a missing payload means the page
 * changed shape, and the two must not be confused — the second one would
 * otherwise read as every code having quietly disappeared.
 */
export function parseGachafeedPage(html: string, slug: string): GachafeedEntry[] {
    const scripts = html.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g);

    let sawEmptyPayload = false;
    for (const match of scripts) {
        let data: unknown;
        try {
            data = JSON.parse(match[1]);
        } catch {
            continue;
        }
        if (!Array.isArray(data)) continue;
        if (data.length === 0) {
            sawEmptyPayload = true;
            continue;
        }
        if (data.every(isEntry)) {
            return data.filter(entry => entry.game === slug);
        }
    }

    if (sawEmptyPayload) return [];
    throw new Error(`Gachafeed /${slug}/codes/ has no code payload — the page layout may have changed`);
}

/**
 * Split entries into what is safe to auto-redeem and what is not.
 *
 * Redeemable means all of: Gachafeed lists it as active, no player has
 * reported it as not working, and its end date (when one is known) is in the
 * future.
 */
export function selectRedeemableEntries(entries: GachafeedEntry[], now: Date = new Date()): GachafeedSelection {
    const redeemable: ScrapedCode[] = [];
    const heldBack: HeldBackCode[] = [];
    const expired: string[] = [];

    for (const entry of entries) {
        const code = entry.code.trim().toUpperCase();
        if (!code) continue;

        if (entry.status === 'expired') {
            expired.push(code);
            continue;
        }
        if (entry.expiresAt && new Date(entry.expiresAt) <= now) {
            expired.push(code);
            continue;
        }
        if (entry.status !== 'active') {
            heldBack.push({ code, reason: `listed as "${entry.status}"` });
            continue;
        }
        if (typeof entry.reports === 'number' && entry.reports > 0) {
            const n = entry.reports;
            heldBack.push({ code, reason: `${n} player report${n === 1 ? '' : 's'} that it does not work` });
            continue;
        }

        redeemable.push({
            code,
            rewards: entry.rewards?.trim() || 'Unknown',
            expirationDate: entry.expiresAt ? new Date(entry.expiresAt).toISOString() : null,
            status: 'active',
        });
    }

    return { redeemable, heldBack, expired };
}

/**
 * Fetch and parse the code list for one game.
 * Throws on any transport or parse failure so the caller can fall back.
 */
export async function fetchGachafeedEntries(gameId: GachaGameId): Promise<GachafeedEntry[]> {
    const slug = GACHAFEED_CONFIG.SLUGS[gameId];
    if (!slug) {
        throw new Error(`Gachafeed does not cover ${gameId}`);
    }

    const url = `${GACHAFEED_CONFIG.BASE_URL}/${slug}/codes/`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GACHAFEED_CONFIG.TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': GACHAFEED_CONFIG.USER_AGENT, Accept: 'text/html' },
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`Gachafeed returned HTTP ${response.status} for /${slug}/codes/`);
        }
        const entries = parseGachafeedPage(await response.text(), slug);
        logger.debug`[Gachafeed] ${gameId}: ${entries.length} entries`;
        return entries;
    } catch (error: any) {
        if (error?.name === 'AbortError') {
            throw new Error(`Gachafeed timed out after ${GACHAFEED_CONFIG.TIMEOUT_MS}ms for /${slug}/codes/`);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}
