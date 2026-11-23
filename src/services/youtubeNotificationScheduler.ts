import { Client } from 'discord.js';
import { getYouTubeNotificationService } from './youtubeNotificationService.js';
import { logger } from '../utils/logger.js';
import { getJobScheduler } from './scheduler/jobScheduler.js';

const YOUTUBE_POLL_JOB = 'youtube-poll';

/**
 * Scheduler for YouTube upload notification polling
 */
export class YouTubeNotificationScheduler {
    private bot: Client;
    private isDevelopment: boolean;

    constructor(bot: Client) {
        this.bot = bot;
        this.isDevelopment = process.env.NODE_ENV === 'development';
    }

    public async initializeSchedules(): Promise<void> {
        await this.runPollOnce();
        this.scheduleYouTubePoll();
    }

    private async runPollOnce(): Promise<void> {
        try {
            const service = getYouTubeNotificationService();
            const result = await service.pollAndNotify(this.bot);
            if (result.notified > 0) {
                logger.info`[YouTube] Startup poll: notified ${result.notified} new video(s), ${result.errors} error(s)`;
            }
        } catch (error) {
            logger.error`[YouTube] Startup poll error: ${error}`;
        }
    }

    private scheduleYouTubePoll(): void {
        const cronExpression = this.isDevelopment
            ? '*/3 * * * *'     // Every 3 minutes in dev
            : '*/5 * * * *';    // Every 5 minutes in prod

        // The central scheduler skips a tick while the previous poll is still running.
        getJobScheduler().register({ name: YOUTUBE_POLL_JOB, cron: cronExpression }, async () => {
            try {
                const service = getYouTubeNotificationService();
                const result = await service.pollAndNotify(this.bot);
                if (result.notified > 0) {
                    logger.info`[YouTube] Notified ${result.notified} new video(s), ${result.errors} error(s)`;
                }
            } catch (error) {
                logger.error`[YouTube] Poll error: ${error}`;
            }
        });

        logger.debug`[YouTube] Scheduled polling: ${cronExpression}`;
    }

    public cancelAllSchedules(): void {
        if (getJobScheduler().cancel(YOUTUBE_POLL_JOB)) {
            logger.debug`[YouTube] Cancelled scheduled job: ${YOUTUBE_POLL_JOB}`;
        }
    }
}
