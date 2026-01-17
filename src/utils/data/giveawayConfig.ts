/**
 * Configuration constants for the giveaway system
 * Centralized tunable parameters for easy adjustment
 */

export const GIVEAWAY_CONFIG = {
    // S3 storage paths
    DATA_PATH: 'data/giveaways',
    BACKUP_PATH: 'data/giveaways/backups',

    // Cache settings (5 minutes)
    CACHE_TTL: 5 * 60 * 1000,

    // Giveaway limits
    MAX_ACTIVE_GIVEAWAYS_PER_GUILD: 5,
    MAX_TITLE_LENGTH: 100,
    MAX_DESCRIPTION_LENGTH: 500,
    MAX_PRIZE_NAME_LENGTH: 200,

    // DM notification settings
    DM_RETRY_ATTEMPTS: 3,
    DM_RETRY_DELAY: 2000, // 2 seconds between retries

    // Wheel of Names integration
    WHEEL_BASE_URL: 'https://wheelofnames.com',
    WHEEL_SPIN_TIMEOUT: 5 * 60 * 1000, // 5 minutes

    // Discord channel configuration
    MOD_CHANNEL_NAME: 'moderator-only',

    // Pagination
    ENTRIES_PER_PAGE: 20,
    WINNERS_PER_PAGE: 10,
    GIVEAWAYS_PER_PAGE: 10,
} as const;
