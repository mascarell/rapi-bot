import { Client } from 'discord.js';
import { getGachaRedemptionService } from './gachaRedemptionService.js';
import { getGachaDataService } from './gachaDataService.js';
import { getCouponAnnouncementService } from './couponAnnouncementService.js';
import { getSupportedGameIds, getAutoRedeemGames } from '../utils/data/gachaGamesConfig';
import { GachaGameId } from '../utils/interfaces/GachaCoupon.interface';
import { syncCouponSources, CouponSyncResult, gamesWithNewCodes } from './couponSourceService.js';
import { logger } from '../utils/logger.js';
import { getJobScheduler, JobInfo } from './scheduler/jobScheduler.js';

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
    /** Names of the jobs this scheduler registered with the central JobScheduler. */
    private scheduledJobs: Set<string> = new Set();
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
        this.scheduleUnpinFinished();

        // Always scrape codes on startup (after a short delay to let bot fully initialize)
        // This ensures we have the latest codes immediately after restart/deploy
        const startupDelay = this.isDevelopment ? this.devConfig.startupDelay : 15;
        this.runOnce('gacha-startup-code-scraping', startupDelay * 1000, async () => {
            try {
                const result = await this.triggerCodeScraping();
                if (result.success) {
                    if (result.added.length > 0) {
                        logger.debug`[Startup] Found ${result.added.length} new codes: ${result.added.map(a => `${a.gameId}:${a.code}`).join(', ')}`;
                    }
                } else {
                    logger.error`[Startup] Code scraping failed, every source: ${result.outcomes.map(o => `${o.source}/${o.gameId}: ${o.error}`).join('; ')}`;
                }
            } catch (error) {
                logger.error`[Startup] Code scraping error: ${error}`;
            }
        });

        // In dev mode, optionally trigger all tasks after a short delay for immediate testing
        if (this.isDevelopment && this.devConfig.triggerOnStartup) {
            this.runOnce('gacha-startup-trigger-all', this.devConfig.startupDelay * 1000, async () => {
                await this.triggerAllTasks();
            });
        }
    }

    /** One-off startup run on the central scheduler. */
    private runOnce(name: string, delayMs: number, fn: () => Promise<void>): void {
        getJobScheduler().runOnce({ name, delayMs }, fn);
        this.scheduledJobs.add(name);
    }

    /**
     * Trigger all scheduled tasks immediately (for testing)
     */
    public async triggerAllTasks(): Promise<void> {
        try {
            await this.triggerExpirationWarnings();
        } catch (error) {
            logger.error`Expiration warnings failed: ${error}`;
        }

        try {
            await this.triggerWeeklyDigest();
        } catch (error) {
            logger.error`Weekly digest failed: ${error}`;
        }

        try {
            await this.triggerAutoRedemption();
        } catch (error) {
            logger.error`Auto-redemption failed: ${error}`;
        }

        try {
            await this.triggerCodeScraping();
        } catch (error) {
            logger.error`Code scraping failed: ${error}`;
        }

        try {
            await this.triggerExpiredCodeCleanup();
        } catch (error) {
            logger.error`Expired code cleanup failed: ${error}`;
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

        this.scheduleJob('gacha-weekly-digest', cronExpression, async () => {
            try {
                const redemptionService = getGachaRedemptionService();
                const gameIds = getSupportedGameIds();

                for (const gameId of gameIds) {
                    await redemptionService.sendWeeklyDigest(this.bot, gameId);
                }
            } catch (error) {
                logger.error`Error running gacha weekly digest: ${error}`;
            }
        });
    }

    /**
     * Schedule expiration warnings - Daily at 09:00 UTC
     */
    private scheduleExpirationWarnings(): void {
        const interval = this.devConfig.expirationWarningInterval;
        const cronExpression = this.isDevelopment
            ? `*/${interval} * * * *`  // Every N minutes in dev
            : '0 9 * * *';             // Daily at 09:00 UTC

        this.scheduleJob('gacha-expiration-warnings', cronExpression, async () => {
            try {
                const redemptionService = getGachaRedemptionService();
                const gameIds = getSupportedGameIds();

                for (const gameId of gameIds) {
                    await redemptionService.sendExpirationWarnings(this.bot, gameId);
                }
            } catch (error) {
                logger.error`Error running gacha expiration warnings: ${error}`;
            }
        });
    }

    /**
     * Schedule auto-redemption - Every 6 hours, at quarter past
     * Only runs for games that support auto-redemption.
     *
     * Runs at 00:15/06:15/12:15/18:15 UTC rather than on the hour: the code
     * sync fires at :00 and :30 and the asset sync and random messages at
     * 00/06/12/18:00, so on the hour they all read and write the coupon data
     * at once. Quarter past sits between two code syncs, so codes found at :00
     * are stored before the run picks them up.
     */
    private scheduleAutoRedemption(): void {
        const interval = this.devConfig.autoRedemptionInterval;
        const cronExpression = this.isDevelopment
            ? `*/${interval} * * * *`  // Every N minutes in dev
            : '15 */6 * * *';          // Every 6 hours at :15

        this.scheduleJob('gacha-auto-redemption', cronExpression, async () => {
            try {
                const redemptionService = getGachaRedemptionService();
                await redemptionService.processAllAutoRedemptions(this.bot);
            } catch (error) {
                logger.error`Error running gacha auto-redemption: ${error}`;
            }
        });
    }

    /**
     * Schedule code scraping from every coupon source - Every 30 minutes
     * Gachafeed first (bd2, czn), then BD2 Pulse (bd2). New codes are added to
     * the database automatically; see couponSourceService.
     */
    private scheduleCodeScraping(): void {
        const interval = this.devConfig.codeScrapingInterval;
        const cronExpression = this.isDevelopment
            ? `*/${interval} * * * *`  // Every N minutes in dev
            : '*/30 * * * *';          // Every 30 minutes in production

        this.scheduleJob('gacha-code-scraping', cronExpression, async () => {
            try {
                const result = await syncCouponSources();

                if (result.success) {
                    if (result.added.length > 0) {
                        const redemptionService = getGachaRedemptionService();
                        const dataService = getGachaDataService();

                        // Notify subscribers for each new code (DMs + coupon alerts)
                        for (const { gameId, code } of result.added) {
                            try {
                                const coupon = await dataService.getCoupon(gameId, code);
                                if (coupon) {
                                    await redemptionService.notifyNewCode(this.bot, coupon);
                                }
                            } catch (error) {
                                logger.error`[Coupon sync] Failed to notify for ${gameId} code ${code}: ${error}`;
                            }
                        }
                    }
                } else {
                    logger.error`[Coupon sync] Every source failed: ${result.outcomes.map(o => `${o.source}/${o.gameId}: ${o.error}`).join('; ')}`;
                }
            } catch (error) {
                logger.error`Error running code scraping: ${error}`;
            }
        });
    }

    /**
     * Unpin channel posts for codes that expired or were removed - every 30
     * minutes at :05 and :35, clear of the :00/:30 code sync.
     */
    private scheduleUnpinFinished(): void {
        const interval = this.devConfig.codeScrapingInterval;
        const cronExpression = this.isDevelopment
            ? `*/${interval} * * * *`
            : '5,35 * * * *';

        // A failure is caught and logged by the scheduler.
        this.scheduleJob('gacha-unpin-finished', cronExpression, async () => {
            await getCouponAnnouncementService().unpinFinished(this.bot);
        });
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

        this.scheduleJob('gacha-expired-cleanup', cronExpression, async () => {
            try {
                const dataService = getGachaDataService();
                await dataService.cleanupExpiredCoupons();
            } catch (error) {
                logger.error`Error running expired code cleanup: ${error}`;
            }
        });
    }

    /** Register one cron job (server local time, as before) with the central scheduler. */
    private scheduleJob(name: string, cron: string, fn: () => Promise<void>): void {
        getJobScheduler().register({ name, cron }, fn);
        this.scheduledJobs.add(name);
    }

    /**
     * Cancel all scheduled jobs, including the startup runs still pending
     */
    public cancelAllSchedules(): void {
        const scheduler = getJobScheduler();
        for (const name of this.scheduledJobs) {
            scheduler.cancel(name);
        }
        this.scheduledJobs.clear();
    }

    /**
     * Get all scheduled jobs, keyed by job name (for debugging)
     */
    public getScheduledJobs(): Map<string, JobInfo> {
        const scheduler = getJobScheduler();
        const jobs = new Map<string, JobInfo>();
        for (const name of this.scheduledJobs) {
            const info = scheduler.get(name);
            if (info) jobs.set(name, info);
        }
        return jobs;
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

    public async triggerCodeScraping(): Promise<CouponSyncResult> {
        const result = await syncCouponSources();

        // Post each new code in its game's channel. This path redeems through
        // the batch run below rather than notifyNewCode, so it has to post
        // them itself, or codes found at startup would never be posted.
        const announcer = getCouponAnnouncementService();
        const dataService = getGachaDataService();
        for (const { gameId, code } of result.added ?? []) {
            const coupon = await dataService.getCoupon(gameId, code).catch(() => null);
            if (coupon) await announcer.announce(this.bot, coupon);
        }

        // Trigger auto-redemption, with notification, for each game that
        // gained a code.
        const redemptionService = getGachaRedemptionService();
        for (const gameId of gamesWithNewCodes(result)) {
            await redemptionService.processGameAutoRedemptions(this.bot, gameId, { hasNewCodes: true });
        }

        return result;
    }

    public async triggerExpiredCodeCleanup(): Promise<{ cleaned: number; byGame: Record<string, number> }> {
        const dataService = getGachaDataService();
        return dataService.cleanupExpiredCoupons();
    }
}
