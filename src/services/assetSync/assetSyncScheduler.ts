import schedule from 'node-schedule';
import { getAssetSyncService } from './assetSyncService.js';
import { logger } from '../../utils/logger.js';
import { SyncAllResult, SyncResult } from './types.js';

interface AssetSyncSchedulerConfig {
    /** Cron interval for periodic sync in dev mode (minutes). Default: 10 */
    devSyncIntervalMinutes?: number;
    /** Whether to log last sync time on startup. Default: true */
    logLastSyncOnStartup?: boolean;
}

/**
 * Schedules periodic asset sync and provides manual trigger methods.
 *
 * Production: syncs every 6 hours (0 *​/6 * * *)
 * Dev: syncs every N minutes (configurable)
 *
 * Does NOT sync on startup — just logs last sync time.
 * Use triggerSync() for manual/on-demand syncs.
 */
export class AssetSyncScheduler {
    private scheduledJobs: Map<string, schedule.Job> = new Map();
    private runningTasks: Set<string> = new Set();
    private isDevelopment: boolean;
    private config: Required<AssetSyncSchedulerConfig>;

    constructor(config?: AssetSyncSchedulerConfig) {
        this.isDevelopment = process.env.NODE_ENV === 'development';
        this.config = {
            devSyncIntervalMinutes: config?.devSyncIntervalMinutes ?? 10,
            logLastSyncOnStartup: config?.logLastSyncOnStartup ?? true,
        };
    }

    public initializeSchedules(): void {
        this.schedulePeriodicSync();

        if (this.config.logLastSyncOnStartup) {
            this.logLastSyncTimes();
        }
    }

    private schedulePeriodicSync(): void {
        const cronExpression = this.isDevelopment
            ? `*/${this.config.devSyncIntervalMinutes} * * * *`
            : '0 */6 * * *'; // Every 6 hours in production

        const taskName = 'asset-sync-incremental';
        const job = schedule.scheduleJob(cronExpression, async () => {
            if (this.runningTasks.has(taskName)) {
                logger.debug`[AssetSync] Skipping periodic sync — already running`;
                return;
            }

            this.runningTasks.add(taskName);
            try {
                const result = await getAssetSyncService().syncIncremental();
                logger.info`[AssetSync] Periodic sync complete: synced=${result.totalSynced} skipped=${result.totalSkipped} failed=${result.totalFailed}`;
            } catch (error) {
                logger.error`[AssetSync] Periodic sync error: ${error}`;
            } finally {
                this.runningTasks.delete(taskName);
            }
        });

        if (job) {
            this.scheduledJobs.set('asset-sync-periodic', job);
            logger.info`[AssetSync] Periodic sync scheduled: ${cronExpression}`;
        }
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
    }
}
