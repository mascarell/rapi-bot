/**
 * Configuration constants for the Embed Fix feature
 * Similar pattern to gachaConfig.ts
 */

const isDevelopment = process.env.NODE_ENV === 'development';

export const EMBED_FIX_CONFIG = {
    // Timeouts
    API_TIMEOUT_MS: 8000,

    // Rate limits
    GUILD_RATE_LIMIT: 15,      // Max requests per guild per minute
    USER_RATE_LIMIT: 5,        // Max requests per user per minute
    RATE_WINDOW_MS: 60_000,    // 1 minute window

    // Caching
    EMBED_CACHE_TTL: 30 * 60 * 1000,      // 30 minutes
    EMBED_CACHE_MAX_SIZE: 500,             // Max cached entries
    NEGATIVE_CACHE_TTL: 5 * 60 * 1000,     // 5 minutes for failed requests

    // Circuit breaker
    CIRCUIT_BREAKER_THRESHOLD: 5,          // Failures before opening
    CIRCUIT_BREAKER_TIMEOUT: 2 * 60 * 1000, // 2 minutes cooldown

    // External APIs
    TWITTER_API: 'https://api.fxtwitter.com',
    PIXIV_PROXY: 'https://phixiv.net',
    INSTAGRAM_PROXY: 'ddinstagram.com',

    // Embed settings
    MAX_EMBEDS_PER_MESSAGE: 4,
    BOOKMARK_BUTTON_TIMEOUT: 5 * 60 * 1000, // 5 minutes

    // Embed colors (hex)
    EMBED_COLOR_TWITTER: 0x1DA1F2,
    EMBED_COLOR_PIXIV: 0x0096FA,
    EMBED_COLOR_INSTAGRAM: 0xE1306C,

    // S3 paths (PR4 - stats only)
    DATA_PATH: 'data/embed-fix',
    S3_STATS_KEY: isDevelopment
        ? 'data/embed-fix/dev-embed-fix-stats.json'
        : 'data/embed-fix/embed-fix-stats.json',

    // Channel patterns for stats tracking (PR4)
    TRACKED_CHANNEL_PATTERNS: ['art', 'nsfw', 'gallery', 'fanart'],
} as const;
