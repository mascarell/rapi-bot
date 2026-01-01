/**
 * Centralized configuration for the Gacha Coupon Redemption System
 * All tunable parameters in one place for easy adjustment
 */

export const GACHA_CONFIG = {
    // API settings
    API_TIMEOUT_MS: 10000,
    MAX_RETRIES: 3,
    RATE_LIMIT_DELAY: 2000,

    // Discord settings
    DM_RATE_LIMIT_DELAY: 100,
    CONCURRENT_SUBSCRIBER_LIMIT: 5,

    // Cache settings
    CACHE_TTL: 5 * 60 * 1000, // 5 minutes

    // Circuit breaker
    CIRCUIT_BREAKER_THRESHOLD: 5,
    CIRCUIT_BREAKER_COOLDOWN: 60000, // 60 seconds

    // Force re-run settings
    FORCE_RERUN_COOLDOWN: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    FORCE_RERUN_REACTION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours to react

    // Rate limit backoff settings
    INITIAL_BACKOFF_MS: 1000,
    MAX_BACKOFF_MS: 30000,
    BACKOFF_MULTIPLIER: 2,

    // S3 paths
    DATA_PATH: 'data/gacha-coupons',
    BACKUP_PATH: 'data/gacha-coupons/backups',
} as const;

export type GachaConfig = typeof GACHA_CONFIG;
