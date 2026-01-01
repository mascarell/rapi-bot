/**
 * Game-Agnostic Gacha Coupon Redemption System - Type Definitions
 *
 * This module provides extensible interfaces for supporting multiple gacha games
 * with coupon redemption functionality.
 */

/**
 * Supported gacha games for coupon redemption
 * Add new games here as they are supported
 */
export type GachaGameId = 'bd2' | 'nikke' | 'blue-archive';

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
}

/**
 * Represents a coupon code with metadata (game-agnostic)
 */
export interface GachaCoupon {
    /** The coupon code itself */
    code: string;
    /** Which game this coupon is for */
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
}

/**
 * Subscription mode for users
 */
export type SubscriptionMode = 'auto-redeem' | 'notification-only';

/**
 * Represents a user's subscription for a specific game
 */
export interface GameSubscription {
    /** Which game this subscription is for */
    gameId: GachaGameId;
    /** In-game identifier (nickname, UID, etc.) */
    gameUserId: string;
    /** Subscription mode: auto-redeem or notification-only */
    mode: SubscriptionMode;
    /** ISO timestamp when user subscribed */
    subscribedAt: string;
    /** Array of coupon codes already redeemed for this user */
    redeemedCodes: string[];
    /** ISO timestamp of last notification sent */
    lastNotified?: string;
}

/**
 * Represents a user with their game subscriptions
 */
export interface UserSubscription {
    /** Discord user ID */
    discordId: string;
    /** Map of game subscriptions by game ID */
    games: Partial<Record<GachaGameId, GameSubscription>>;
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
