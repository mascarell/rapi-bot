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
export type GachaGameId = 'bd2' | 'lost-sword' | 'czn';

/**
 * A user's in-game identity for a redemption request.
 *
 * Most games need one value (BD2: a nickname), which is `userId`. Chaos Zero
 * Nightmare needs three — STOVE membership number, character nickname and
 * world — so the extras live in `fields`, keyed by `GachaGameConfig.extraUserFields[].key`.
 *
 * Anywhere an identity is accepted, a bare string is still valid and means
 * `{ userId: value }`, so existing single-field games and callers are unchanged.
 */
export interface RedemptionIdentity {
    /** The primary identifier. See GachaGameConfig.userIdFieldName for its label. */
    userId: string;
    /** Additional game-specific identifiers, keyed by extraUserFields[].key */
    fields?: Record<string, string>;
}

/** Either a bare primary identifier or a full multi-field identity. */
export type RedemptionIdentityInput = string | RedemptionIdentity;

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
    /**
     * Where a player finds their `userIdFieldName`, shown under the field in
     * the subscribe form and in /redeem help. At most 100 characters, which
     * is Discord's limit for a form field's description.
     */
    userIdHint?: string;
    /**
     * Stricter format for the primary identifier than the default
     * letters/digits/`_`/`-` check, with the message shown when it fails.
     * Applied to new input only; stored subscriptions are never re-validated.
     */
    userIdFormat?: { pattern: RegExp; message: string };
    /**
     * Extra user-supplied identifiers this game needs beyond `userIdFieldName`.
     *
     * Stored on the subscription as `gameUserFields[key]` and read back by the
     * game's redemption handler. Declared here so /redeem can validate and
     * label them without the command knowing anything game-specific.
     *
     * Only Chaos Zero Nightmare uses this; a game with a single identifier
     * leaves it undefined.
     */
    extraUserFields?: ReadonlyArray<{
        /** Key under which the value is stored in GameSubscription.gameUserFields */
        key: string;
        /**
         * Name of the /redeem subscribe option that supplies the value, when it
         * differs from `key`. CZN stores `world` (STOVE's term) but asks for
         * `server` (the player's term).
         */
        optionName?: string;
        /** Human label, used in prompts and error messages */
        label: string;
        /** Where to find the value; shown under the field in the form (max 100 chars) */
        hint?: string;
        /** Maximum accepted length, validated at subscribe time */
        maxLength?: number;
        /** Closed set of accepted values; when present, input must match one */
        choices?: ReadonlyArray<{ label: string; value: string }>;
    }>;
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

/** The account-specific part of a subscription, as saved before an edit. */
export interface StoredIdentity {
    gameUserId: string;
    gameUserFields?: Record<string, string>;
    redeemedCodes: string[];
    identityVerifiedAt?: string;
    identityRejectedAt?: string;
}

/**
 * Represents a user's subscription for a specific game
 * NoSQL Key: { discordId (PK), gameId (SK) }
 */
export interface GameSubscription {
    /** Which game this subscription is for (Sort Key in NoSQL) */
    gameId: GachaGameId;
    /** In-game identifier (nickname, UID, etc.) */
    gameUserId: string;
    /**
     * Extra identifiers for games whose config declares `extraUserFields`
     * (currently only CZN: character nickname and world). Absent for
     * single-identifier games, which keeps older records valid as-is.
     */
    gameUserFields?: Record<string, string>;
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
    /**
     * ISO timestamp of the last time the game accepted this identity: a code
     * was redeemed, or the game said it was already used on this account.
     * Absent until that first happens. Optional and additive, so records
     * written before it existed stay valid with no migration.
     */
    identityVerifiedAt?: string;
    /**
     * ISO timestamp of when the game first stopped recognising an identity it
     * had previously accepted. Set once, so the user is told once; cleared by
     * the next acceptance or by editing the details.
     */
    identityRejectedAt?: string;
    /**
     * The account details as they were before the last `/redeem edit`, kept
     * until the game accepts the new ones. If it rejects them instead, these
     * go back in rather than the subscription being deleted.
     */
    previousIdentity?: StoredIdentity;
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
    | 'RestrictedCode'
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
