import { Client } from 'discord.js';
import schedule from 'node-schedule';
import { getYouTubeNotificationService } from './youtubeNotificationService.js';
import { logger } from '../utils/logger.js';

/**
 * Scheduler for YouTube upload notification polling
 */
export class YouTubeNotificationScheduler {
    private bot: Client;
    private scheduledJobs: Map<string, schedule.Job> = new Map();
    private runningTasks: Set<string> = new Set();
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
            : '*/10 * * * *';   // Every 10 minutes in prod

        const taskName = 'youtube-poll';
        const job = schedule.scheduleJob(cronExpression, async () => {
            if (this.runningTasks.has(taskName)) return;
            this.runningTasks.add(taskName);

            try {
                const service = getYouTubeNotificationService();
                const result = await service.pollAndNotify(this.bot);
                if (result.notified > 0) {
                    logger.info`[YouTube] Notified ${result.notified} new video(s), ${result.errors} error(s)`;
                }
            } catch (error) {
                logger.error`[YouTube] Poll error: ${error}`;
            } finally {
                this.runningTasks.delete(taskName);
            }
        });

        if (job) {
            this.scheduledJobs.set(taskName, job);
            logger.debug`[YouTube] Scheduled polling: ${cronExpression}`;
        }
    }

    public cancelAllSchedules(): void {
        for (const [name, job] of this.scheduledJobs) {
            job.cancel();
            logger.debug`[YouTube] Cancelled scheduled job: ${name}`;
        }
        this.scheduledJobs.clear();
    }
}
