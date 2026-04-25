/**
 * Configuration for the slur auto-moderation system.
 *
 * Detects identity-targeting slurs in guild messages and times out offenders.
 * Slur list itself is loaded dynamically from S3 (data/slur-moderation/slur-list.json)
 * — see SlurModerationService for fetch/cache behavior. There is no hardcoded
 * fallback list by design; on S3 fetch failure the service notifies the
 * mod channel and detection no-ops until S3 recovers.
 */

const isDevelopment = process.env.NODE_ENV === 'development';

export const SLUR_MOD_CONFIG = {
    /** Discord member.timeout duration applied on detection (30 minutes). */
    TIMEOUT_DURATION_MS: 30 * 60 * 1000,

    /** Discord audit-log reason text for the timeout. */
    TIMEOUT_REASON: 'Auto-moderation: severe language',

    /** S3 key for the slur list document. */
    SLUR_LIST_S3_KEY: isDevelopment
        ? 'data/slur-moderation/dev-slur-list.json'
        : 'data/slur-moderation/slur-list.json',

    /** S3 key for persistent offense history. */
    OFFENSES_S3_KEY: isDevelopment
        ? 'data/slur-moderation/dev-offenses.json'
        : 'data/slur-moderation/offenses.json',

    /** In-memory cache TTL for both the slur list and the offense store. */
    CACHE_TTL_MS: 5 * 60 * 1000,

    /** Debounce window for batched S3 writes of offense data. */
    WRITE_DEBOUNCE_MS: 5_000,

    /** Per-message message-content snapshot length in the mod-log embed. */
    MESSAGE_PREVIEW_LENGTH: 200,

    /** Max history entries kept per user; older entries get truncated. */
    HISTORY_CAP: 20,

    /** Mods see at most one mod-log embed per minute per offender; the rest roll up. */
    MOD_LOG_RATE_LIMIT_PER_USER_MS: 60 * 1000,

    /** Suppress repeat "S3 degraded" / "S3 recovered" notifications to once per hour. */
    DEGRADED_NOTIFY_COOLDOWN_MS: 60 * 60 * 1000,

    /** Channel name (case-insensitive) the bot looks up in each guild for mod alerts. */
    MOD_LOG_CHANNEL_NAME: 'moderator-only',

    /** Schema version for the offense store (bump on breaking changes). */
    OFFENSES_SCHEMA_VERSION: 1,

    /** Schema version expected for the slur list document. */
    SLUR_LIST_SCHEMA_VERSION: 1,
} as const;
