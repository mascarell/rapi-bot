/**
 * Game-Agnostic Gacha Coupon Redemption System - Type Definitions
 *
 * This module provides extensible interfaces for supporting multiple gacha games
 * with coupon redemption functionality.
 *
 * DATA MODEL DESIGN NOTES (NoSQL Ready):
 * =====================================
 * The data model is designed for easy migration to DynamoDB or similar NoSQL databases:
 *
 * 1. COUPONS COLLECTION/TABLE:
 *    - Primary Key: { gameId (PK), code (SK) }
 *    - GSI1: { isActive (PK), expirationDate (SK) } - for querying active/expiring coupons
 *    - GSI2: { gameId (PK), addedAt (SK) } - for chronological listing per game
 *
 * 2. SUBSCRIPTIONS COLLECTION/TABLE:
 *    - Primary Key: { discordId (PK), gameId (SK) }
 *    - GSI1: { gameId (PK), mode (SK) } - for querying subscribers by game and mode
 *
 * 3. REDEMPTION_HISTORY COLLECTION/TABLE (future):
 *    - Primary Key: { discordId#gameId (PK), timestamp (SK) }
 *    - For audit trail and analytics
 *
 * Current S3 JSON structure maintains these as arrays for simplicity,
 * but the interface design supports direct NoSQL migration.
 */

/**
 * Supported gacha games for coupon redemption
 * Add new games here as they are supported
 * TODO: Re-add 'nikke' | 'blue-archive' when those games are implemented
 */
export type GachaGameId = 'bd2' | 'lost-sword';

/**
 * Configuration for a supported gacha game
 */
export interface GachaGameConfig {
    /** Unique identifier for the game */
    id: GachaGameId;
    /** Display name of the game */
    name: string;
    /** Short display name for embeds */
    shortName: string;
    /** API endpoint for coupon redemption (if supported) */
    apiEndpoint?: string;
    /** Additional API configuration */
    apiConfig?: {
        appId?: string;
        method?: 'POST' | 'GET';
        headers?: Record<string, string>;
    };
    /** URL for manual redemption page */
    manualRedeemUrl?: string;
    /** Whether auto-redemption is supported */
    supportsAutoRedeem: boolean;
    /** CDN path for game logo */
    logoPath: string;
    /** Embed color (hex) */
    embedColor: number;
    /** Maximum nickname length */
    maxNicknameLength: number;
    /** Maximum coupon code length */
    maxCodeLength: number;
    /** Field name for user identifier (e.g., "nickname", "UID", "player ID") */
    userIdFieldName: string;
    /** Whether this game requires a user ID for subscription (e.g., for auto-redeem API calls) */
    requiresUserId: boolean;
    /** Whether this game uses Discord channel monitoring for code announcements */
    hasChannelMonitor?: boolean;
    /** Regex patterns for parsing announcement messages */
    parsePatterns?: {
        /** Pattern to extract coupon code */
        code: RegExp;
        /** Pattern to extract rewards description */
        rewards: RegExp;
        /** Pattern to extract expiration date/time */
        expiration: RegExp;
    };
}

/**
 * Represents a coupon code with metadata (game-agnostic)
 * NoSQL Key: { gameId (PK), code (SK) }
 */
export interface GachaCoupon {
    /** The coupon code itself (Sort Key in NoSQL) */
    code: string;
    /** Which game this coupon is for (Partition Key in NoSQL) */
    gameId: GachaGameId;
    /** Description of rewards (e.g., "500 Dia + 10 Summon Tickets") */
    rewards: string;
    /** ISO date string for expiration, or null if no known expiry */
    expirationDate: string | null;
    /** Discord user ID who added the code */
    addedBy: string;
    /** ISO timestamp when code was added */
    addedAt: string;
    /** Whether the coupon is still active */
    isActive: boolean;
    /** Optional source (e.g., "Official Twitter", "Reddit") */
    source?: string;
    /** Optional: Total redemption count (for analytics) */
    redemptionCount?: number;
    /** Optional: Region restrictions (for future multi-region support) */
    regions?: string[];
    /** Optional: Tags for categorization */
    tags?: string[];
}

/**
 * Subscription mode for users
 */
export type SubscriptionMode = 'auto-redeem' | 'notification-only';

/**
 * Represents a user's subscription for a specific game
 * NoSQL Key: { discordId (PK), gameId (SK) }
 */
export interface GameSubscription {
    /** Which game this subscription is for (Sort Key in NoSQL) */
    gameId: GachaGameId;
    /** In-game identifier (nickname, UID, etc.) */
    gameUserId: string;
    /** Subscription mode: auto-redeem or notification-only */
    mode: SubscriptionMode;
    /** ISO timestamp when user subscribed */
    subscribedAt: string;
    /** Array of coupon codes already redeemed for this user */
    redeemedCodes: string[];
    /** Array of coupon codes user chose to ignore (no more warnings) */
    ignoredCodes?: string[];
    /** ISO timestamp of last notification sent */
    lastNotified?: string;
    /** ISO timestamp of last force re-run request (for cooldown tracking) */
    lastForceRerun?: string;
    /** Optional: Total successful redemptions count */
    totalRedemptions?: number;
    /** Whether DMs are disabled for this user (failed to send) */
    dmDisabled?: boolean;
    /** ISO timestamp when DM failure was first detected */
    dmDisabledAt?: string;
    /** Optional: Notification preferences */
    preferences?: {
        /** Receive expiration warnings */
        expirationWarnings?: boolean;
        /** Receive weekly digests */
        weeklyDigest?: boolean;
        /** Receive new code notifications */
        newCodeAlerts?: boolean;
    };
}

/**
 * Represents a user with their game subscriptions
 * NoSQL: In DynamoDB, each GameSubscription would be a separate item
 * with { discordId (PK), gameId (SK) }
 */
export interface UserSubscription {
    /** Discord user ID (Partition Key in NoSQL) */
    discordId: string;
    /** Map of game subscriptions by game ID */
    games: Partial<Record<GachaGameId, GameSubscription>>;
    /** Optional: User-level metadata */
    metadata?: {
        /** First subscription date */
        firstSubscribedAt?: string;
        /** Total games subscribed to historically */
        totalGamesSubscribed?: number;
    };
}

/**
 * Redemption history entry (for future audit trail)
 * NoSQL Key: { discordId#gameId (PK), timestamp (SK) }
 */
export interface RedemptionHistoryEntry {
    /** Discord user ID */
    discordId: string;
    /** Which game */
    gameId: GachaGameId;
    /** The coupon code */
    code: string;
    /** ISO timestamp of redemption attempt */
    timestamp: string;
    /** Whether it succeeded */
    success: boolean;
    /** Error code if failed */
    errorCode?: string;
    /** Redemption method: 'auto' | 'manual' */
    method: 'auto' | 'manual';
}

/**
 * Result of a coupon redemption attempt
 */
export interface RedemptionResult {
    /** Whether the redemption was successful */
    success: boolean;
    /** The coupon code that was attempted */
    code: string;
    /** Which game the redemption was for */
    gameId: GachaGameId;
    /** Human-readable message about the result */
    message: string;
    /** ISO timestamp of the attempt */
    timestamp: string;
    /** Error code if failed */
    errorCode?: string;
}

/**
 * Common error codes across games
 */
export type CommonRedemptionError =
    | 'ValidationFailed'
    | 'InvalidCode'
    | 'ExpiredCode'
    | 'AlreadyUsed'
    | 'ExceededUses'
    | 'UnavailableCode'
    | 'IncorrectUser'
    | 'ClaimRewardsFailed'
    | 'NetworkError'
    | 'RateLimited'
    | 'Unknown';

/**
 * Root data structure stored in S3
 */
export interface GachaCouponData {
    /** All registered coupon codes across all games */
    coupons: GachaCoupon[];
    /** All user subscriptions */
    subscriptions: UserSubscription[];
    /** Redemption history log (NoSQL: separate table with PK: discordId#gameId, SK: timestamp) */
    redemptionHistory?: RedemptionHistoryEntry[];
    /** ISO timestamp of last data update */
    lastUpdated: string;
    /** Schema version for future migrations */
    schemaVersion: number;
}

/**
 * Result of batch redemption process
 */
export interface BatchRedemptionResult {
    gameId: GachaGameId;
    usersProcessed: number;
    totalRedemptions: number;
    successful: number;
    failed: number;
    skipped: number;
}
