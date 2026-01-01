import { Client } from 'discord.js';
import schedule from 'node-schedule';
import { getGachaRedemptionService } from './gachaRedemptionService';
import { getGachaDataService } from './gachaDataService';
import { getSupportedGameIds, getAutoRedeemGames } from '../utils/data/gachaGamesConfig';
import { GachaGameId } from '../utils/interfaces/GachaCoupon.interface';
import { syncBD2PulseCodes, ScrapeResult } from './bd2PulseScraperService';

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

        if (this.isDevelopment) {
            console.log('⚠️  DEV MODE: Gacha coupon scheduler using shortened intervals for testing.');
            console.log(`   Weekly Digest: Every ${this.devConfig.weeklyDigestInterval} min`);
            console.log(`   Expiration Warnings: Every ${this.devConfig.expirationWarningInterval} min`);
            console.log(`   Auto-Redemption: Every ${this.devConfig.autoRedemptionInterval} min`);
            console.log(`   Code Scraping: Every ${this.devConfig.codeScrapingInterval} min`);
            console.log(`   Expired Cleanup: Every ${this.devConfig.expiredCleanupInterval} min`);
            if (this.devConfig.triggerOnStartup) {
                console.log(`   Startup Trigger: Enabled (${this.devConfig.startupDelay}s delay)`);
            }
        }
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

        console.log('Gacha Coupon Scheduler initialized');

        // In dev mode, optionally trigger all tasks after a short delay for immediate testing
        if (this.isDevelopment && this.devConfig.triggerOnStartup) {
            setTimeout(async () => {
                console.log('[DEV] Triggering all gacha tasks for immediate testing...');
                await this.triggerAllTasks();
            }, this.devConfig.startupDelay * 1000);
        }
    }

    /**
     * Trigger all scheduled tasks immediately (for testing)
     */
    public async triggerAllTasks(): Promise<void> {
        console.log('Triggering all gacha coupon tasks...');

        try {
            await this.triggerExpirationWarnings();
            console.log('  ✓ Expiration warnings sent');
        } catch (error) {
            console.error('  ✗ Expiration warnings failed:', error);
        }

        try {
            await this.triggerWeeklyDigest();
            console.log('  ✓ Weekly digest sent');
        } catch (error) {
            console.error('  ✗ Weekly digest failed:', error);
        }

        try {
            await this.triggerAutoRedemption();
            console.log('  ✓ Auto-redemption processed');
        } catch (error) {
            console.error('  ✗ Auto-redemption failed:', error);
        }

        try {
            await this.triggerCodeScraping();
            console.log('  ✓ Code scraping completed');
        } catch (error) {
            console.error('  ✗ Code scraping failed:', error);
        }

        try {
            await this.triggerExpiredCodeCleanup();
            console.log('  ✓ Expired code cleanup completed');
        } catch (error) {
            console.error('  ✗ Expired code cleanup failed:', error);
        }

        console.log('All gacha coupon tasks completed');
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
                console.log('Skipping gacha weekly digest - already running');
                return;
            }

            this.runningTasks.add(taskName);
            console.log('Running gacha weekly digest...');
            try {
                const redemptionService = getGachaRedemptionService();
                const gameIds = getSupportedGameIds();

                for (const gameId of gameIds) {
                    await redemptionService.sendWeeklyDigest(this.bot, gameId);
                }

                console.log('Gacha weekly digest completed for all games');
            } catch (error) {
                console.error('Error running gacha weekly digest:', error);
            } finally {
                this.runningTasks.delete(taskName);
            }
        });

        this.scheduledJobs.set('gacha-weekly-digest', job);
        console.log(`Scheduled gacha weekly digest: ${this.isDevelopment ? `Every ${interval} minutes (dev)` : 'Sundays at 12:00 UTC'}`);
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
                console.log('Skipping gacha expiration warnings - already running');
                return;
            }

            this.runningTasks.add(taskName);
            console.log('Running gacha expiration warnings...');
            try {
                const redemptionService = getGachaRedemptionService();
                const gameIds = getSupportedGameIds();

                for (const gameId of gameIds) {
                    await redemptionService.sendExpirationWarnings(this.bot, gameId);
                }

                console.log('Gacha expiration warnings completed');
            } catch (error) {
                console.error('Error running gacha expiration warnings:', error);
            } finally {
                this.runningTasks.delete(taskName);
            }
        });

        this.scheduledJobs.set('gacha-expiration-warnings', job);
        console.log(`Scheduled gacha expiration warnings: ${this.isDevelopment ? `Every ${interval} minutes (dev)` : 'Daily at 09:00 UTC'}`);
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
                console.log('Skipping gacha auto-redemption - already running');
                return;
            }

            this.runningTasks.add(taskName);
            console.log('Running gacha auto-redemption...');
            try {
                const redemptionService = getGachaRedemptionService();
                const results = await redemptionService.processAllAutoRedemptions(this.bot);

                for (const result of results) {
                    console.log(`${result.gameId}: ${result.usersProcessed} users, ${result.successful} successful, ${result.failed} failed`);
                }

                console.log('Gacha auto-redemption completed');
            } catch (error) {
                console.error('Error running gacha auto-redemption:', error);
            } finally {
                this.runningTasks.delete(taskName);
            }
        });

        this.scheduledJobs.set('gacha-auto-redemption', job);
        console.log(`Scheduled gacha auto-redemption: ${this.isDevelopment ? `Every ${interval} minutes (dev)` : 'Every 6 hours'}`);
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
                console.log('Skipping code scraping - already running');
                return;
            }

            this.runningTasks.add(taskName);
            console.log('Running BD2 Pulse code scraping...');
            try {
                const result = await syncBD2PulseCodes();

                if (result.success) {
                    if (result.newCodes.length > 0) {
                        console.log(`[BD2 Pulse] Added ${result.newCodes.length} new codes: ${result.newCodes.join(', ')}`);

                        // Trigger auto-redemption for new codes with notification enabled
                        const redemptionService = getGachaRedemptionService();
                        await redemptionService.processGameAutoRedemptions(this.bot, 'bd2', { hasNewCodes: true });
                    } else {
                        console.log('[BD2 Pulse] No new codes found');
                    }
                } else {
                    console.error('[BD2 Pulse] Scraping failed:', result.error);
                }
            } catch (error) {
                console.error('Error running code scraping:', error);
            } finally {
                this.runningTasks.delete(taskName);
            }
        });

        this.scheduledJobs.set('gacha-code-scraping', job);
        console.log(`Scheduled code scraping: ${this.isDevelopment ? `Every ${interval} minutes (dev)` : 'Every 30 minutes'}`);
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
                console.log('Skipping expired code cleanup - already running');
                return;
            }

            this.runningTasks.add(taskName);
            console.log('Running expired code cleanup...');
            try {
                const dataService = getGachaDataService();
                const result = await dataService.cleanupExpiredCoupons();

                if (result.cleaned > 0) {
                    console.log(`Expired code cleanup completed: ${result.cleaned} codes marked inactive`);
                    for (const [gameId, count] of Object.entries(result.byGame)) {
                        console.log(`  ${gameId}: ${count} codes`);
                    }
                } else {
                    console.log('Expired code cleanup: No expired codes found');
                }
            } catch (error) {
                console.error('Error running expired code cleanup:', error);
            } finally {
                this.runningTasks.delete(taskName);
            }
        });

        this.scheduledJobs.set('gacha-expired-cleanup', job);
        console.log(`Scheduled expired code cleanup: ${this.isDevelopment ? `Every ${interval} minutes (dev)` : 'Daily at 00:00 UTC'}`);
    }

    /**
     * Cancel all scheduled jobs
     */
    public cancelAllSchedules(): void {
        this.scheduledJobs.forEach((job, name) => {
            job.cancel();
            console.log(`Cancelled gacha schedule: ${name}`);
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
        console.log('Manually triggering BD2 Pulse code scraping...');
        const result = await syncBD2PulseCodes();

        if (result.success && result.newCodes.length > 0) {
            // Trigger auto-redemption for new codes with notification enabled
            const redemptionService = getGachaRedemptionService();
            await redemptionService.processGameAutoRedemptions(this.bot, 'bd2', { hasNewCodes: true });
        }

        return result;
    }

    public async triggerExpiredCodeCleanup(): Promise<{ cleaned: number; byGame: Record<string, number> }> {
        console.log('Manually triggering expired code cleanup...');
        const dataService = getGachaDataService();
        return dataService.cleanupExpiredCoupons();
    }
}
