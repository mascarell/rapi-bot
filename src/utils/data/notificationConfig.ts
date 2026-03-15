/**
 * Configuration constants for the notification subscription system
 */
export const NOTIFICATION_CONFIG = {
    /** Delay between DM sends to avoid Discord rate limits (ms) */
    DM_RATE_LIMIT_DELAY: 100,

    /** Max concurrent DM sends */
    CONCURRENT_DM_LIMIT: 5,

    /** S3 data path prefix */
    S3_DATA_PATH: 'data/notification-subscriptions',

    /** Emoji used on channel messages — react to subscribe */
    SUBSCRIBE_EMOJI: '✉️',

    /** Emoji used on DM messages — react to unsubscribe */
    UNSUBSCRIBE_EMOJI: '❌',

    /** Max entries in messageId → notificationType memory map before cleanup */
    MESSAGE_TYPE_MAP_MAX_SIZE: 500,

    /** Cache TTL for S3 data (ms) */
    CACHE_TTL: 5 * 60 * 1000, // 5 minutes
} as const;

/**
 * Regex to parse notification type from embed footer.
 * Format: "[type:some-notification-type]"
 */
export const NOTIFICATION_TYPE_FOOTER_REGEX = /\[type:([^\]]+)\]/;
