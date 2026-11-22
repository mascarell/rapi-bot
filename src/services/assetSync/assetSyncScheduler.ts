import schedule from 'node-schedule';
import { getAssetSyncService } from './assetSyncService.js';
import { logger } from '../../utils/logger.js';
import { SyncAllResult, SyncResult } from './types.js';

/** Production cron: every hour, on the hour. */
export const PROD_SYNC_CRON = '0 * * * *';

interface AssetSyncSchedulerConfig {
    /** Cron interval for periodic sync in dev mode (minutes). Default: 10 */
    devSyncIntervalMinutes?: number;
    /** Whether to log last sync time on startup. Default: true */
    logLastSyncOnStartup?: boolean;
    /**
     * Delay before the sync that runs after startup, so a new deploy picks up
     * new characters at once without slowing the bot's own start. Default: 60s.
     * Negative turns it off.
     */
    startupSyncDelayMs?: number;
}

/**
 * Schedules asset sync and provides manual trigger methods.
 *
 * Production: syncs every hour (PROD_SYNC_CRON), plus once shortly after startup.
 * Dev: syncs every N minutes (configurable), plus once shortly after startup.
 * Incremental syncs only download new characters, so they're cheap.
 */
export class AssetSyncScheduler {
    private scheduledJobs: Map<string, schedule.Job> = new Map();
    private startupTimer: ReturnType<typeof setTimeout> | null = null;
    private runningTasks: Set<string> = new Set();
    private isDevelopment: boolean;
    private config: Required<AssetSyncSchedulerConfig>;

    constructor(config?: AssetSyncSchedulerConfig) {
        this.isDevelopment = process.env.NODE_ENV === 'development';
        this.config = {
            devSyncIntervalMinutes: config?.devSyncIntervalMinutes ?? 10,
            logLastSyncOnStartup: config?.logLastSyncOnStartup ?? true,
            startupSyncDelayMs: config?.startupSyncDelayMs ?? 60_000,
        };
    }

    public initializeSchedules(): void {
        this.schedulePeriodicSync();
        this.scheduleStartupSync();

        if (this.config.logLastSyncOnStartup) {
            this.logLastSyncTimes();
        }
    }

    /** One incremental sync of every game; skipped if one is already running. */
    public async runIncrementalSync(reason: 'periodic' | 'startup'): Promise<SyncAllResult | null> {
        const taskName = 'asset-sync-incremental';
        if (this.runningTasks.has(taskName)) {
            logger.debug`[AssetSync] Skipping ${reason} sync — already running`;
            return null;
        }

        this.runningTasks.add(taskName);
        try {
            const result = await getAssetSyncService().syncIncremental();
            logger.info`[AssetSync] ${reason} sync complete: synced=${result.totalSynced} skipped=${result.totalSkipped} failed=${result.totalFailed}`;
            return result;
        } catch (error) {
            logger.error`[AssetSync] ${reason} sync error: ${error}`;
            return null;
        } finally {
            this.runningTasks.delete(taskName);
        }
    }

    private schedulePeriodicSync(): void {
        const cronExpression = this.isDevelopment
            ? `*/${this.config.devSyncIntervalMinutes} * * * *`
            : PROD_SYNC_CRON;

        const job = schedule.scheduleJob(cronExpression, () => this.runIncrementalSync('periodic'));

        if (job) {
            this.scheduledJobs.set('asset-sync-periodic', job);
            logger.info`[AssetSync] Periodic sync scheduled: ${cronExpression}`;
        }
    }

    private scheduleStartupSync(): void {
        if (this.config.startupSyncDelayMs < 0) return;
        this.startupTimer = setTimeout(() => {
            this.startupTimer = null;
            void this.runIncrementalSync('startup');
        }, this.config.startupSyncDelayMs);
    }

    private async logLastSyncTimes(): Promise<void> {
        const service = getAssetSyncService();
        for (const gameId of service.getRegisteredGameIds()) {
            try {
                const lastSync = await service.getLastSyncTime(gameId);
                if (lastSync) {
                    logger.info`[AssetSync] ${gameId}: last synced at ${lastSync}`;
                } else {
                    logger.warn`[AssetSync] ${gameId}: never synced — run scripts/sync-assets.ts for initial sync`;
                }
            } catch {
                // Non-critical — don't fail startup
            }
        }
    }

    // ── Manual Triggers ──

    public async triggerSync(gameId?: string, mode: 'full' | 'incremental' = 'incremental'): Promise<SyncAllResult | SyncResult> {
        const service = getAssetSyncService();
        if (gameId) {
            return service.syncGameById(gameId, mode);
        }
        return service.syncAll(mode);
    }

    public cancelAllSchedules(): void {
        for (const [, job] of this.scheduledJobs) {
            job.cancel();
        }
        this.scheduledJobs.clear();
        if (this.startupTimer) {
            clearTimeout(this.startupTimer);
            this.startupTimer = null;
        }
    }
}
