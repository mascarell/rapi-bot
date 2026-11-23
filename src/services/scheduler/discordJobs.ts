import { getJobScheduler } from './jobScheduler.js';
import { BOT_ACTIVITY_CRON, RANDOM_MESSAGES_CRON } from './schedules.js';

/**
 * The two timed jobs wired up in discord.ts. They live here, with the bodies
 * passed in, so the schedule inventory test can run the real registration
 * without booting the Discord client.
 *
 * Neither had an overlap guard before the central scheduler and both talk to
 * Discord (and the random messages to S3), so a hung run is released after
 * 10 minutes, well under their 4 and 6 hour cadence.
 */
const MAX_RUN_MS = 10 * 60 * 1000;

export function registerBotActivityJob(rotateActivity: () => void): void {
    getJobScheduler().register({ name: 'bot-activity', cron: BOT_ACTIVITY_CRON, maxRunMs: MAX_RUN_MS }, rotateActivity);
}

export function registerRandomMessagesJob(sendRandomMessage: () => Promise<void>): void {
    getJobScheduler().register({ name: 'random-messages', cron: RANDOM_MESSAGES_CRON, maxRunMs: MAX_RUN_MS }, sendRandomMessage);
}
