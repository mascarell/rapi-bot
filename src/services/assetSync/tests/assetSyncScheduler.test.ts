import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { syncIncremental, scheduleJob } = vi.hoisted(() => ({
    syncIncremental: vi.fn(),
    scheduleJob: vi.fn(() => ({ cancel: vi.fn() })),
}));

vi.mock('node-schedule', () => ({ default: { scheduleJob } }));
vi.mock('../assetSyncService.js', () => ({
    getAssetSyncService: () => ({
        syncIncremental,
        getRegisteredGameIds: () => [],
        getLastSyncTime: vi.fn(),
    }),
}));
vi.mock('../../../utils/logger.js', () => ({
    logger: new Proxy({}, { get: () => () => undefined }),
}));

import { AssetSyncScheduler, PROD_SYNC_CRON } from '../assetSyncScheduler';
import { resetJobScheduler } from '../../scheduler/jobScheduler';

const RESULT = { results: [], totalSynced: 1, totalSkipped: 0, totalFailed: 0 };

describe('AssetSyncScheduler', () => {
    const env = process.env.NODE_ENV;

    beforeEach(() => {
        resetJobScheduler();
        vi.useFakeTimers();
        syncIncremental.mockReset().mockResolvedValue(RESULT);
        scheduleJob.mockClear();
        process.env.NODE_ENV = 'production';
    });

    afterEach(() => {
        vi.useRealTimers();
        process.env.NODE_ENV = env;
    });

    it('schedules the production sync every hour', () => {
        new AssetSyncScheduler({ logLastSyncOnStartup: false }).initializeSchedules();
        expect(PROD_SYNC_CRON).toBe('0 * * * *');
        expect(scheduleJob).toHaveBeenCalledWith('0 * * * *', expect.any(Function));
    });

    it('syncs once after the startup delay', async () => {
        new AssetSyncScheduler({ logLastSyncOnStartup: false, startupSyncDelayMs: 5000 }).initializeSchedules();
        await vi.advanceTimersByTimeAsync(4999);
        expect(syncIncremental).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(syncIncremental).toHaveBeenCalledTimes(1);
    });

    it('skips the startup sync when turned off or cancelled', async () => {
        new AssetSyncScheduler({ logLastSyncOnStartup: false, startupSyncDelayMs: -1 }).initializeSchedules();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(syncIncremental).not.toHaveBeenCalled();

        // One central scheduler holds one 'asset-sync-periodic' job at a time.
        resetJobScheduler();
        const cancelled = new AssetSyncScheduler({ logLastSyncOnStartup: false, startupSyncDelayMs: 1000 });
        cancelled.initializeSchedules();
        cancelled.cancelAllSchedules();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(syncIncremental).not.toHaveBeenCalled();
    });

    it('does not start a second sync while one is running', async () => {
        let finish!: (v: typeof RESULT) => void;
        syncIncremental.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
        const scheduler = new AssetSyncScheduler({ logLastSyncOnStartup: false, startupSyncDelayMs: -1 });

        const first = scheduler.runIncrementalSync('startup');
        expect(await scheduler.runIncrementalSync('periodic')).toBeNull();
        finish(RESULT);
        expect(await first).toBe(RESULT);
        expect(syncIncremental).toHaveBeenCalledTimes(1);
    });

    it('returns null and keeps going when a sync throws', async () => {
        syncIncremental.mockRejectedValueOnce(new Error('down'));
        const scheduler = new AssetSyncScheduler({ logLastSyncOnStartup: false, startupSyncDelayMs: -1 });
        expect(await scheduler.runIncrementalSync('periodic')).toBeNull();
        expect(await scheduler.runIncrementalSync('periodic')).toBe(RESULT);
    });
});
