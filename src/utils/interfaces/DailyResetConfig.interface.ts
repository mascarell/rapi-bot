import { Client, Message } from 'discord.js';
import { Moment } from 'moment-timezone';

/**
 * Configuration for the time when a daily reset occurs
 */
export interface ResetTime {
    hour: number;
    minute: number;
}

/**
 * Configuration for an embed field in the daily reset message
 */
export interface EmbedField {
    name: string;
    value: string;
    inline?: boolean;
}

/**
 * Configuration for the embed message appearance
 */
export interface EmbedConfig {
    title: string;
    description: string;
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
}

/**
 * Configuration for CDN media assets
 */
export interface MediaConfig {
    cdnPath: string;
    extensions?: string[];
    trackLast?: number;
}

/**
 * Optional dynamic field generator function
 * Allows for fields that change based on date/time (like boss rotations)
 */
export type DynamicFieldGenerator = (currentDate: Date) => EmbedField[];

/**
 * Optional hook functions for custom behavior
 */
export interface ResetMessageHooks {
    /**
     * Called before the message is sent
     * Can be used to add role pinging or other pre-send actions
     */
    beforeSend?: (channelId: string, guildId: string, bot: Client) => Promise<void>;

    /**
     * Called after the message is sent
     * Can be used to add reactions, collectors, or other post-send actions
     */
    afterSend?: (message: Message, guildId: string, bot: Client) => Promise<void>;
}

/**
 * Main configuration interface for a game's daily reset message
 */
export interface DailyResetConfig {
    /**
     * Game name (used for logging and identification)
     */
    game: string;

    /**
     * Discord channel name where the message should be sent
     */
    channelName: string;

    /**
     * Optional role name to ping before the message
     */
    roleName?: string;

    /**
     * Reset time configuration
     */
    resetTime: ResetTime;

    /**
     * Timezone for the reset time (e.g., "UTC", "America/New_York")
     */
    timezone: string;

    /**
     * Embed configuration for the message
     */
    embedConfig: EmbedConfig;

    /**
     * Static checklist fields for the embed
     */
    checklist: EmbedField[];

    /**
     * Optional dynamic fields that change based on date/time
     */
    dynamicFields?: DynamicFieldGenerator;

    /**
     * Media configuration for random images/videos
     */
    mediaConfig: MediaConfig;

    /**
     * Optional hooks for custom behavior
     */
    hooks?: ResetMessageHooks;
}

/**
 * Configuration for all daily reset messages in the bot
 */
export interface DailyResetServiceConfig {
    games: DailyResetConfig[];

    /**
     * Optional dev mode interval in minutes
     * When NODE_ENV is 'development', schedules will use this interval instead of daily resets
     * @default 5
     */
    devModeInterval?: number;
}
