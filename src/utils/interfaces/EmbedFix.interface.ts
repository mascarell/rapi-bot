/**
 * Embed Fix Feature Interfaces
 * Types for the SaucyBot-like embed fixing functionality
 */

/**
 * Supported platforms for embed fixing
 */
export type EmbedPlatform = 'twitter' | 'pixiv' | 'instagram';

/**
 * Data extracted from a platform's API for building embeds
 */
export interface EmbedData {
    platform: EmbedPlatform;
    title?: string;
    description?: string;
    author: {
        name: string;
        username: string;
        url: string;
        iconUrl?: string;
    };
    images: string[];
    videos?: Array<{
        url: string;
        thumbnail?: string;
        /** Video variants sorted by quality (highest first) */
        variants?: Array<{
            url: string;
            bitrate?: number;
            content_type?: string;
        }>;
        type?: 'video' | 'gif';
    }>;
    timestamp?: string;
    color: number;
    originalUrl: string;
    isNsfw?: boolean;
    /** If true, use URL rewrite instead of custom embed */
    _useUrlRewrite?: boolean;
    /** The rewritten URL for platforms that use URL proxies */
    _rewrittenUrl?: string;
    /** Video attachment data (after download) */
    _videoAttachment?: {
        buffer: Buffer;
        filename: string;
    };
    /** Fallback URL if video is too large to attach */
    _videoFallbackUrl?: string;
}

/**
 * Interface for platform-specific handlers
 */
export interface PlatformHandler {
    /** The platform this handler supports */
    platform: EmbedPlatform;
    /** Regex patterns to match URLs for this platform */
    patterns: RegExp[];
    /**
     * Try to match a URL against this handler's patterns
     * @param url The URL to match
     * @returns The regex match array if matched, null otherwise
     */
    match(url: string): RegExpMatchArray | null;
    /**
     * Fetch embed data from the platform's API
     * @param match The regex match from the URL
     * @param url The original URL
     * @returns The embed data or null if fetch failed
     */
    fetchEmbed(match: RegExpMatchArray, url: string): Promise<EmbedData | null>;
}

/**
 * Cached embed entry with TTL
 */
export interface CachedEmbed {
    data: EmbedData;
    timestamp: number;
    expiresAt: number;
}

/**
 * Rate limit entry for a guild or user
 */
export interface RateLimitEntry {
    count: number;
    windowStart: number;
}

/**
 * Circuit breaker state for an API
 */
export interface CircuitBreakerState {
    failures: number;
    lastFailure: number;
    isOpen: boolean;
    openUntil: number;
}

/**
 * Result of URL matching
 */
export interface MatchedUrl {
    url: string;
    platform: EmbedPlatform;
    match: RegExpMatchArray;
    handler: PlatformHandler;
}

/**
 * Stats data for a user (PR4)
 */
export interface UserStats {
    totalShares: number;
    weeklyShares: number;
    lastShare: string;
    byPlatform: Record<EmbedPlatform, number>;
}

/**
 * Guild stats data (PR4)
 */
export interface GuildStats {
    users: Record<string, UserStats>;
    weekStarted: string;
}

/**
 * Root stats data structure for S3 (PR4)
 */
export interface EmbedStatsData {
    stats: Record<string, GuildStats>;
    schemaVersion: number;
    lastUpdated: string;
}

/**
 * Leaderboard entry
 */
export interface LeaderboardEntry extends UserStats {
    userId: string;
}

// ============================================
// Voting/Like System Interfaces
// ============================================

/**
 * Root document for votes stored in S3
 */
export interface EmbedVotesData {
    votes: Record<string, ArtworkVotes>;  // Keyed by artworkId (platform:id)
    timeAggregations: VoteTimeAggregations;
    schemaVersion: number;
    lastUpdated: string;
}

/**
 * Per-artwork vote tracking
 */
export interface ArtworkVotes {
    artworkId: string;           // e.g., "twitter:1234567890"
    originalUrl: string;
    platform: EmbedPlatform;
    artistUsername: string;
    artistName: string;
    guildVotes: Record<string, GuildVoteData>;  // Keyed by guildId
    globalVoteCount: number;     // Denormalized all-time count
    firstSharedAt: string;
    lastVotedAt: string;
}

/**
 * Per-guild vote data for an artwork
 */
export interface GuildVoteData {
    voters: string[];            // Array of discordIds who voted
    voteCount: number;           // Denormalized count
    sharedBy: string;            // Original poster's discordId
    sharedAt: string;
    messageId: string;
    channelId: string;
}

/**
 * Time-based vote aggregations
 */
export interface VoteTimeAggregations {
    weekly: VotePeriodData;
    monthly: VotePeriodData;
    yearly: VotePeriodData;
    lastReset: {
        weekly: string;
        monthly: string;
        yearly: string;
    };
}

/**
 * Vote data for a specific time period
 */
export interface VotePeriodData {
    byGuild: Record<string, number>;     // guildId -> vote count
    global: number;
    topArtwork: string[];                // Top artworkIds for period
    topArtists: Record<string, number>;  // artistUsername -> vote count
}
