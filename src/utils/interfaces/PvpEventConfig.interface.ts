/**
 * Day of week (0 = Sunday, 6 = Saturday) — matches JS Date.getDay()
 */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * A specific weekly time in UTC (day + hour + minute)
 */
export interface WeeklyTime {
    dayOfWeek: DayOfWeek;
    hour: number;   // 0-23 UTC
    minute: number; // 0-59
}

/**
 * Embed appearance configuration for PVP warnings
 */
export interface PvpEmbedConfig {
    title: string;
    /** Static string or function that receives the season end Unix timestamp (seconds) */
    description: string | ((seasonEndTimestamp: number) => string);
    color: number;
    footer: {
        text: string;
        iconURL?: string;
    };
    thumbnail?: string;
    author?: {
        name: string;
        iconURL?: string;
    };
    /** Static fields or function that receives the season end Unix timestamp (seconds) */
    fields?: Array<{ name: string; value: string; inline?: boolean }> | ((seasonEndTimestamp: number) => Array<{ name: string; value: string; inline?: boolean }>);
}

/**
 * Configuration for a warning sent before a PVP event ends
 */
export interface PvpWarningConfig {
    /** Human-readable label, e.g. "1 day", "1 hour" — used for logging and job IDs */
    label: string;
    /** Minutes before event end to send this warning */
    minutesBefore: number;
    /** Embed configuration for this warning */
    embedConfig: PvpEmbedConfig;
}

/**
 * Media configuration for random CDN images (same shape as daily reset)
 */
export interface PvpMediaConfig {
    cdnPath: string;
    extensions?: string[];
    trackLast?: number;
}

/**
 * Configuration for a recurring weekly PVP event
 */
export interface PvpEventConfig {
    /** Unique identifier, e.g. "bd2-mirror-wars" */
    id: string;
    /** Human-readable game name */
    game: string;
    /** Human-readable event name */
    eventName: string;
    /** Discord channel name to post in */
    channelName: string;
    /** Optional role name to ping */
    roleName?: string;
    /** When the event season ends each week (UTC) */
    seasonEnd: WeeklyTime;
    /** Warning configurations — supports multiple warnings at different intervals */
    warnings: PvpWarningConfig[];
    /** Optional CDN media config for random images */
    mediaConfig?: PvpMediaConfig;
}

/**
 * Top-level config for the PVP reminder service
 */
export interface PvpReminderServiceConfig {
    events: PvpEventConfig[];
    /** Dev mode interval in minutes (overrides weekly schedule) */
    devModeInterval?: number;
}
