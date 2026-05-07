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
    /** Whether to send DM notifications to subscribers for this warning (default: false) */
    sendDM?: boolean;
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
 * Optional multi-week cycle definition for events that don't fire every week.
 *
 * Models a phase wheel: for biweekly Lost Sword events, Avalon and Star
 * Reincarnation alternate. The shared anchor + per-event `phaseOffset` makes
 * collision impossible by construction (no two events with the same offset
 * fire on the same Sunday).
 */
export interface CyclePhase {
    /**
     * Full ISO datetime of a known season-end inside the active cycle.
     * MUST be a real season-end instant (matches `seasonEnd` weekday/hour/minute in UTC).
     * Validated at service init.
     */
    anchor: string; // e.g. '2026-04-26T15:00:00Z'

    /** Cycle length in weeks. 2 = biweekly. */
    intervalWeeks: number;

    /**
     * Which week within the cycle this event fires in.
     * Default 0. For biweekly: Avalon=0, Star Reincarnation=1.
     */
    phaseOffset?: number;

    /**
     * ISO datetimes of season-ends to skip (game maintenance, holidays).
     * Each entry must match the format the bot computes for season-ends.
     */
    skipSeasonEnds?: string[];
}

/**
 * Configuration for a recurring weekly (or multi-week) PVP event
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
    /** When the event season ends (UTC, day-of-week + hour:minute) */
    seasonEnd: WeeklyTime;
    /**
     * Optional cycle phase. Absent => fires every week (default behavior,
     * matches Mirror Wars). Present => only fires on cycle-active weeks.
     */
    cyclePhase?: CyclePhase;
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
