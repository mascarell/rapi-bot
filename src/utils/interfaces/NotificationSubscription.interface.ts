/**
 * Notification type identifier.
 * Convention: "{category}:{specificId}" e.g., "pvp-warning:bd2-mirror-wars"
 */
export type NotificationType = string;

/**
 * Metadata for a registered notification type
 */
export interface NotificationTypeConfig {
    /** Unique type identifier */
    type: NotificationType;
    /** Human-readable display name, e.g. "BD2 Mirror Wars PVP" */
    displayName: string;
    /** Short description */
    description: string;
    /** Embed color for DM notifications */
    embedColor: number;
    /** Thumbnail URL for DM embeds */
    thumbnailUrl?: string;
}

/**
 * A user's subscription to a specific notification type
 */
export interface NotificationUserSubscription {
    /** Discord user ID */
    discordId: string;
    /** Guild ID where subscription was created */
    guildId: string;
    /** Notification type subscribed to */
    notificationType: NotificationType;
    /** ISO timestamp of subscription */
    subscribedAt: string;
    /** Whether DMs failed to send (error 50007) */
    dmDisabled?: boolean;
    /** ISO timestamp when DM failure was detected */
    dmDisabledAt?: string;
}

/**
 * Root data structure stored in S3
 */
export interface NotificationSubscriptionData {
    /** Subscriptions keyed by notification type for O(1) lookup */
    subscriptions: Record<NotificationType, NotificationUserSubscription[]>;
    /** ISO timestamp of last update */
    lastUpdated: string;
    /** Schema version for future migrations */
    schemaVersion: number;
}
