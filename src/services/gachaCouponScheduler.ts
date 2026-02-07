import { Client } from 'discord.js';
import schedule from 'node-schedule';
import { getGachaRedemptionService } from './gachaRedemptionService.js';
import { getGachaDataService } from './gachaDataService.js';
import { getSupportedGameIds, getAutoRedeemGames } from '../utils/data/gachaGamesConfig';
import { GachaGameId } from '../utils/interfaces/GachaCoupon.interface';
import { syncBD2PulseCodes, ScrapeResult } from './bd2PulseScraperService.js';
import { schedulerLogger } from '../utils/logger.js';

/**
 * Configuration for dev mode intervals (in minutes)
 */
interface DevModeConfig {
    /** Interval for weekly digest in dev mode (default: 10 minutes) */
    weeklyDigestInterval: number;
    /** Interval for expiration warnings in dev mode (default: 5 minutes) */
    expirationWarningInterval: number;
    /** Interval for auto-redemption in dev mode (default: 3 minutes) */
    autoRedemptionInterval: number;
    /** Interval for code scraping in dev mode (default: 2 minutes) */
    codeScrapingInterval: number;
    /** Interval for expired code cleanup in dev mode (default: 15 minutes) */
    expiredCleanupInterval: number;
    /** Whether to trigger tasks immediately on startup (default: false) */
    triggerOnStartup: boolean;
    /** Delay before initial trigger in seconds (default: 10) */
    startupDelay: number;
}

const DEFAULT_DEV_CONFIG: DevModeConfig = {
    weeklyDigestInterval: 10,
    expirationWarningInterval: 5,
    autoRedemptionInterval: 3,
    codeScrapingInterval: 2,
    expiredCleanupInterval: 15,
    triggerOnStartup: false,
    startupDelay: 10,
};

/**
 * Scheduler for gacha coupon-related tasks
 * Handles weekly digests, expiration warnings, and auto-redemption for all supported games
 */
export class GachaCouponScheduler {
    private bot: Client;
    private scheduledJobs: Map<string, schedule.Job> = new Map();
    private runningTasks: Set<string> = new Set(); // Prevents duplicate task execution
    private isDevelopment: boolean;
    private devConfig: DevModeConfig;

    constructor(bot: Client, devConfig?: Partial<DevModeConfig>) {
        this.bot = bot;
        this.isDevelopment = process.env.NODE_ENV === 'development';
        this.devConfig = { ...DEFAULT_DEV_CONFIG, ...devConfig };
    }

    /**
     * Initialize all scheduled jobs
     */
    public initializeSchedules(): void {
        this.scheduleWeeklyDigest();
        this.scheduleExpirationWarnings();
        this.scheduleAutoRedemption();
        this.scheduleCodeScraping();
        this.scheduleExpiredCodeCleanup();

        // Always scrape codes on startup (after a short delay to let bot fully initialize)
        // This ensures we have the latest codes immediately after restart/deploy
        const startupDelay = this.isDevelopment ? this.devConfig.startupDelay : 15;
        setTimeout(async () => {
            try {
                const result = await this.triggerCodeScraping();
                if (result.success) {
                    if (result.newCodes.length > 0) {
                        schedulerLogger.debug`[Startup] Found ${result.newCodes.length} new codes: ${result.newCodes.join(', ')}`;
                    }
                } else {
                    schedulerLogger.error`[Startup] Code scraping failed: ${result.error}`;
                }
            } catch (error) {
                schedulerLogger.error`[Startup] Code scraping error: ${error}`;
            }
        }, startupDelay * 1000);

        // In dev mode, optionally trigger all tasks after a short delay for immediate testing
        if (this.isDevelopment && this.devConfig.triggerOnStartup) {
            setTimeout(async () => {
                await this.triggerAllTasks();
            }, this.devConfig.startupDelay * 1000);
        }
    }

    /**
     * Trigger all scheduled tasks immediately (for testing)
     */
    public async triggerAllTasks(): Promise<void> {
        try {
            await this.triggerExpirationWarnings();
        } catch (error) {
            schedulerLogger.error`Expiration warnings failed: ${error}`;
        }

        try {
            await this.triggerWeeklyDigest();
        } catch (error) {
            schedulerLogger.error`Weekly digest failed: ${error}`;
        }

        try {
            await this.triggerAutoRedemption();
        } catch (error) {
            schedulerLogger.error`Auto-redemption failed: ${error}`;
        }

        try {
            await this.triggerCodeScraping();
        } catch (error) {
            schedulerLogger.error`Code scraping failed: ${error}`;
        }

        try {
            await this.triggerExpiredCodeCleanup();
        } catch (error) {
            schedulerLogger.error`Expired code cleanup failed: ${error}`;
        }
    }

    /**
     * Schedule weekly digest - Sundays at 12:00 UTC
     * Sends digest for all games to all subscribers
     */
    private scheduleWeeklyDigest(): void {
        const interval = this.devConfig.weeklyDigestInterval;
        const cronExpression = this.isDevelopment
            ? `*/${interval} * * * *`  // Every N minutes in dev
            : '0 12 * * 0';            // Sundays at 12:00 UTC

        const taskName = 'weekly-digest';
        const job = schedule.scheduleJob(cronExpression, async () => {
            if (this.runningTasks.has(taskName)) {
                return;
            }

            this.runningTasks.add(taskName);
            try {
                const redemptionService = getGachaRedemptionService();
                const gameIds = getSupportedGameIds();

                for (const gameId of gameIds) {
                    await redemptionService.sendWeeklyDigest(this.bot, gameId);
                }
            } catch (error) {
                schedulerLogger.error`Error running gacha weekly digest: ${error}`;
            } finally {
                this.runningTasks.delete(taskName);
            }
        });

        this.scheduledJobs.set('gacha-weekly-digest', job);
    }

    /**
     * Schedule expiration warnings - Daily at 09:00 UTC
     */
    private scheduleExpirationWarnings(): void {
        const interval = this.devConfig.expirationWarningInterval;
        const cronExpression = this.isDevelopment
            ? `*/${interval} * * * *`  // Every N minutes in dev
            : '0 9 * * *';             // Daily at 09:00 UTC

        const taskName = 'expiration-warnings';
        const job = schedule.scheduleJob(cronExpression, async () => {
            if (this.runningTasks.has(taskName)) {
                return;
            }

            this.runningTasks.add(taskName);
            try {
                const redemptionService = getGachaRedemptionService();
                const gameIds = getSupportedGameIds();

                for (const gameId of gameIds) {
                    await redemptionService.sendExpirationWarnings(this.bot, gameId);
                }
            } catch (error) {
                schedulerLogger.error`Error running gacha expiration warnings: ${error}`;
            } finally {
                this.runningTasks.delete(taskName);
            }
        });

        this.scheduledJobs.set('gacha-expiration-warnings', job);
    }

    /**
     * Schedule auto-redemption - Every 6 hours
     * Only runs for games that support auto-redemption
     */
    private scheduleAutoRedemption(): void {
        const interval = this.devConfig.autoRedemptionInterval;
        const cronExpression = this.isDevelopment
            ? `*/${interval} * * * *`  // Every N minutes in dev
            : '0 */6 * * *';           // Every 6 hours

        const taskName = 'auto-redemption';
        const job = schedule.scheduleJob(cronExpression, async () => {
            if (this.runningTasks.has(taskName)) {
                return;
            }

            this.runningTasks.add(taskName);
            try {
                const redemptionService = getGachaRedemptionService();
                await redemptionService.processAllAutoRedemptions(this.bot);
            } catch (error) {
                schedulerLogger.error`Error running gacha auto-redemption: ${error}`;
            } finally {
                this.runningTasks.delete(taskName);
            }
        });

        this.scheduledJobs.set('gacha-auto-redemption', job);
    }

    /**
     * Schedule code scraping from BD2 Pulse - Every 30 minutes
     * Fetches new codes and adds them to the database automatically
     */
    private scheduleCodeScraping(): void {
        const interval = this.devConfig.codeScrapingInterval;
        const cronExpression = this.isDevelopment
            ? `*/${interval} * * * *`  // Every N minutes in dev
            : '*/30 * * * *';          // Every 30 minutes in production

        const taskName = 'code-scraping';
        const job = schedule.scheduleJob(cronExpression, async () => {
            if (this.runningTasks.has(taskName)) {
                return;
            }

            this.runningTasks.add(taskName);
            try {
                const result = await syncBD2PulseCodes();

                if (result.success) {
                    if (result.newCodes.length > 0) {
                        // Trigger auto-redemption for new codes with notification enabled
                        const redemptionService = getGachaRedemptionService();
                        await redemptionService.processGameAutoRedemptions(this.bot, 'bd2', { hasNewCodes: true });
                    }
                } else {
                    schedulerLogger.error`[BD2 Pulse] Scraping failed: ${result.error}`;
                }
            } catch (error) {
                schedulerLogger.error`Error running code scraping: ${error}`;
            } finally {
                this.runningTasks.delete(taskName);
            }
        });

        this.scheduledJobs.set('gacha-code-scraping', job);
    }

    /**
     * Schedule expired code cleanup - Daily at 00:00 UTC
     * Marks expired coupons as inactive to keep the active list clean
     */
    private scheduleExpiredCodeCleanup(): void {
        const interval = this.devConfig.expiredCleanupInterval;
        const cronExpression = this.isDevelopment
            ? `*/${interval} * * * *`  // Every N minutes in dev
            : '0 0 * * *';             // Daily at midnight UTC

        const taskName = 'expired-cleanup';
        const job = schedule.scheduleJob(cronExpression, async () => {
            if (this.runningTasks.has(taskName)) {
                return;
            }

            this.runningTasks.add(taskName);
            try {
                const dataService = getGachaDataService();
                await dataService.cleanupExpiredCoupons();
            } catch (error) {
                schedulerLogger.error`Error running expired code cleanup: ${error}`;
            } finally {
                this.runningTasks.delete(taskName);
            }
        });

        this.scheduledJobs.set('gacha-expired-cleanup', job);
    }

    /**
     * Cancel all scheduled jobs
     */
    public cancelAllSchedules(): void {
        this.scheduledJobs.forEach((job, name) => {
            job.cancel();
        });
        this.scheduledJobs.clear();
    }

    /**
     * Get all scheduled jobs (for debugging)
     */
    public getScheduledJobs(): Map<string, schedule.Job> {
        return this.scheduledJobs;
    }

    // Manual triggers for testing

    public async triggerWeeklyDigest(gameId?: GachaGameId): Promise<void> {
        const redemptionService = getGachaRedemptionService();
        const gameIds = gameId ? [gameId] : getSupportedGameIds();

        for (const gId of gameIds) {
            await redemptionService.sendWeeklyDigest(this.bot, gId);
        }
    }

    public async triggerExpirationWarnings(gameId?: GachaGameId): Promise<void> {
        const redemptionService = getGachaRedemptionService();
        const gameIds = gameId ? [gameId] : getSupportedGameIds();

        for (const gId of gameIds) {
            await redemptionService.sendExpirationWarnings(this.bot, gId);
        }
    }

    public async triggerAutoRedemption(gameId?: GachaGameId): Promise<void> {
        const redemptionService = getGachaRedemptionService();

        if (gameId) {
            await redemptionService.processGameAutoRedemptions(this.bot, gameId);
        } else {
            await redemptionService.processAllAutoRedemptions(this.bot);
        }
    }

    public async triggerCodeScraping(): Promise<ScrapeResult> {
        const result = await syncBD2PulseCodes();

        if (result.success && result.newCodes.length > 0) {
            // Trigger auto-redemption for new codes with notification enabled
            const redemptionService = getGachaRedemptionService();
            await redemptionService.processGameAutoRedemptions(this.bot, 'bd2', { hasNewCodes: true });
        }

        return result;
    }

    public async triggerExpiredCodeCleanup(): Promise<{ cleaned: number; byGame: Record<string, number> }> {
        const dataService = getGachaDataService();
        return dataService.cleanupExpiredCoupons();
    }
}
