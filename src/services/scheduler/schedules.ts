/**
 * Timings for jobs that are wired up in files too heavy to import in a test
 * (discord.ts, utils/twitch.ts), kept here so the schedule inventory test can
 * see them.
 */

/** Rotate the bot's presence: every 4 hours, on the hour (server local time). */
export const BOT_ACTIVITY_CRON = '0 */4 * * *';

/** Random Rapi message in #nikke: every 6 hours, on the hour (server local time). */
export const RANDOM_MESSAGES_CRON = '0 */6 * * *';

/** Twitch live check. */
export const TWITCH_STREAM_CHECK_INTERVAL_MS = 5 * 60 * 1000;
