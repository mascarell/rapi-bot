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
    MAX_IMAGES_PER_TWEET: 10,  // Max images to display per tweet (Discord's limit)
    BOOKMARK_BUTTON_TIMEOUT: 5 * 60 * 1000, // 5 minutes

    // Video settings
    MAX_VIDEO_SIZE_BYTES: 8_388_119,  // ~8MB - Discord's non-nitro limit
    VIDEO_DOWNLOAD_TIMEOUT_MS: 30_000,  // 30 seconds for video download
    VXTWITTER_FALLBACK: 'https://vxtwitter.com',  // Fallback for large videos

    // Embed colors (hex)
    EMBED_COLOR_TWITTER: 0x1DA1F2,
    EMBED_COLOR_PIXIV: 0x0096FA,
    EMBED_COLOR_INSTAGRAM: 0xE1306C,

    // Platform icons for footer
    TWITTER_ICON_URL: 'https://abs.twimg.com/icons/apple-touch-icon-192x192.png',

    // S3 paths
    DATA_PATH: 'data/embed-fix',
    S3_STATS_KEY: isDevelopment
        ? 'data/embed-fix/dev-embed-fix-stats.json'
        : 'data/embed-fix/embed-fix-stats.json',
    S3_VOTES_KEY: isDevelopment
        ? 'data/embed-fix/dev-embed-votes.json'
        : 'data/embed-fix/embed-votes.json',

    // Votes cache
    VOTES_CACHE_TTL: 60_000,  // 1 minute cache for votes data

    // Duplicate detection
    DUPLICATE_WINDOW_MS: 24 * 60 * 60 * 1000,  // 24 hours

    // Message edit monitoring window
    MESSAGE_EDIT_WINDOW_MS: 72 * 60 * 60 * 1000,  // 72 hours - monitor edits for this long

    // Fixup service domains (used to detect when to show fallback message)
    FIXUP_DOMAINS: ['vxtwitter.com', 'fxtwitter.com', 'fixupx.com', 'fixvx.com', 'twittpr.com', 'girlcockx.com', 'cunnyx.com'],

    // Channel patterns for stats tracking (PR4)
    TRACKED_CHANNEL_PATTERNS: ['art', 'nsfw', 'gallery', 'fanart'],
} as const;
