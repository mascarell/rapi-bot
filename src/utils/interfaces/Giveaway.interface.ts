/**
 * Giveaway System - Type Definitions
 *
 * This module provides interfaces for the Discord bot giveaway system
 * with Wheel of Names integration.
 *
 * DATA MODEL DESIGN NOTES (NoSQL Ready):
 * =====================================
 * The data model is designed for easy migration to DynamoDB or similar NoSQL databases:
 *
 * 1. GIVEAWAYS COLLECTION/TABLE:
 *    - Primary Key: { guildId (PK), id (SK) }
 *    - GSI1: { status (PK), createdAt (SK) } - for querying active/ended giveaways
 *
 * 2. WINNERS COLLECTION/TABLE:
 *    - Primary Key: { discordId (PK), wonAt (SK) }
 *    - GSI1: { guildId (PK), wonAt (SK) } - for guild-wide winner history
 *
 * 3. USER_STATS COLLECTION/TABLE:
 *    - Primary Key: { discordId (PK) }
 *    - For tracking user participation and win counts
 *
 * Current S3 JSON structure maintains these as arrays for simplicity,
 * but the interface design supports direct NoSQL migration.
 */

/**
 * Status of a giveaway
 */
export type GiveawayStatus = 'active' | 'ended' | 'cancelled' | 'scheduled';

/**
 * End condition type for giveaways
 */
export type EndConditionType = 'manual' | 'scheduled' | 'entry_count';

/**
 * Giveaway entry with timestamp
 */
export interface GiveawayEntry {
    /** Discord user ID */
    discordId: string;
    /** ISO timestamp when user entered */
    enteredAt: string;
    /** Cached username for display (avoids Discord API calls) */
    username: string;
}

/**
 * Winner record with prize details
 */
export interface GiveawayWinner {
    /** Discord user ID of winner */
    discordId: string;
    /** Giveaway ID this win is for */
    giveawayId: string;
    /** ISO timestamp when winner was selected */
    wonAt: string;
    /** Name of the prize won */
    prizeName: string;
    /** Whether winner has been notified via DM */
    notified: boolean;
    /** ISO timestamp when notification was sent */
    notifiedAt?: string;
}

/**
 * End condition configuration
 */
export interface EndCondition {
    /** Type of end condition */
    type: EndConditionType;
    /** ISO timestamp for scheduled end (only for scheduled type) */
    scheduledEndTime?: string;
    /** Maximum number of entries before auto-end (only for entry_count type) */
    maxEntries?: number;
}

/**
 * Main giveaway structure
 * NoSQL Key: { guildId (PK), id (SK) }
 */
export interface Giveaway {
    /** Unique identifier (UUID) */
    id: string;
    /** Discord server ID where giveaway is running */
    guildId: string;
    /** Discord user ID of creator (mod) */
    createdBy: string;
    /** ISO timestamp when giveaway was created */
    createdAt: string;

    // Giveaway details
    /** Title of the giveaway */
    title: string;
    /** Description of the giveaway */
    description: string;
    /** Name of the prize */
    prizeName: string;

    // State
    /** Current status of the giveaway */
    status: GiveawayStatus;
    /** Array of user entries */
    entries: GiveawayEntry[];
    /** Discord ID of winner (if selected) */
    winnerId?: string;

    // End conditions
    /** Array of end conditions (can have multiple) */
    endConditions: EndCondition[];
    /** ISO timestamp when giveaway ended */
    endedAt?: string;
    /** Discord ID of who ended it */
    endedBy?: string;

    // Wheel of Names integration
    /** Generated Wheel of Names URL */
    wheelUrl?: string;
    /** ISO timestamp when mod spun the wheel */
    wheelSpunAt?: string;

    // Metadata
    /** Channel ID where mod announcements are posted */
    modChannelId?: string;
}

/**
 * User statistics across all giveaways
 * NoSQL Key: { discordId (PK) }
 */
export interface UserGiveawayStats {
    /** Discord user ID */
    discordId: string;
    /** Total number of giveaways entered */
    totalEntered: number;
    /** Total number of giveaways won */
    totalWon: number;
    /** Array of wins with details */
    wins: Array<{
        /** Giveaway ID */
        giveawayId: string;
        /** Prize name */
        prizeName: string;
        /** ISO timestamp when won */
        wonAt: string;
    }>;
    /** ISO timestamp of last entry */
    lastEnteredAt?: string;
}

/**
 * Root data structure for S3 storage
 */
export interface GiveawayData {
    /** All giveaways across all guilds */
    giveaways: Giveaway[];
    /** All winners across all giveaways */
    winners: GiveawayWinner[];
    /** User statistics across all giveaways */
    userStats: UserGiveawayStats[];
    /** ISO timestamp of last data update */
    lastUpdated: string;
    /** Schema version for future migrations */
    schemaVersion: number;
}
