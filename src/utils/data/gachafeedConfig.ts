import { GachaGameId } from '../interfaces/GachaCoupon.interface.js';

/**
 * Gachafeed (https://gachafeed.moe) — the primary source of coupon codes.
 *
 * A fan site that tracks codes for 25 gacha games, checked every minute against
 * official X accounts, Discord announcements and code lists. robots.txt is
 * `Allow: /`, so polling it is welcome rather than tolerated.
 *
 * Each `/{slug}/codes/` page embeds the full code list as a
 * `<script type="application/json">` payload, one object per code:
 *
 *   { game, code, status: "active" | "expired", reports, rewards?, expiresAt?,
 *     firstSeenAt, lastSeenAt, sources, expiredReason? }
 *
 * That payload is an implementation detail of their Astro build, not a
 * documented API, so the parser treats "payload not found" as a failure of this
 * source rather than as "no codes".
 *
 * See the vault ADR `decisions/2026-10-11-gachafeed-becomes-the-code-source`.
 */
export const GACHAFEED_CONFIG = {
    BASE_URL: 'https://gachafeed.moe',
    /**
     * Our game id -> Gachafeed slug. Lost Sword is not one of the games
     * Gachafeed covers, so its codes stay manual.
     */
    SLUGS: {
        bd2: 'bd2',
        czn: 'czn',
    } as Partial<Record<GachaGameId, string>>,
    /** Recorded as `addedBy` on codes this source adds. */
    BOT_USER_ID: 'gachafeed-scraper',
    /** Recorded as `source` on codes this source adds. */
    SOURCE_LABEL: 'Gachafeed (Auto)',
    /** Identify ourselves honestly; nothing here needs a browser user agent. */
    USER_AGENT: 'rapi-bot (+https://github.com/mascarell/rapi-bot)',
    TIMEOUT_MS: 15_000,
} as const;
