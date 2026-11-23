import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { scheduleJob, errorLog } = vi.hoisted(() => ({
    scheduleJob: vi.fn(),
    errorLog: vi.fn(),
}));

vi.mock('node-schedule', () => ({ default: { scheduleJob } }));
vi.mock('../../../utils/logger.js', () => ({
    logger: new Proxy({}, {
        get: (_target, level) => (level === 'error' ? errorLog : () => undefined),
    }),
}));

import { JobScheduler, getJobScheduler, resetJobScheduler } from '../jobScheduler';

/** Callbacks node-schedule was given, in order, with a cancel spy each. */
let cronCallbacks: Array<() => unknown>;
let cancelSpies: Array<ReturnType<typeof vi.fn>>;

describe('JobScheduler', () => {
    let scheduler: JobScheduler;

    beforeEach(() => {
        vi.useFakeTimers();
        cronCallbacks = [];
        cancelSpies = [];
        scheduleJob.mockReset().mockImplementation((_spec: unknown, cb: () => unknown) => {
            const cancel = vi.fn();
            cronCallbacks.push(cb);
            cancelSpies.push(cancel);
            return { cancel, nextInvocation: () => new Date('2030-01-01T00:00:00Z') };
        });
        errorLog.mockClear();
        scheduler = new JobScheduler();
    });

    afterEach(() => {
        scheduler.cancelAll();
        vi.useRealTimers();
    });

    describe('cron jobs', () => {
        it('hands a bare cron string to node-schedule when there is no timezone', () => {
            scheduler.register({ name: 'a', cron: '15 */6 * * *' }, () => undefined);
            expect(scheduleJob).toHaveBeenCalledWith('15 */6 * * *', expect.any(Function));
        });

        it('hands { rule, tz } to node-schedule when a timezone is given', () => {
            scheduler.register({ name: 'a', cron: '59 14 * * 6', tz: 'Etc/UTC' }, () => undefined);
            expect(scheduleJob).toHaveBeenCalledWith({ rule: '59 14 * * 6', tz: 'Etc/UTC' }, expect.any(Function));
        });

        it('runs the job when node-schedule fires', async () => {
            const fn = vi.fn();
            scheduler.register({ name: 'a', cron: '* * * * *' }, fn);
            await cronCallbacks[0]();
            expect(fn).toHaveBeenCalledWith({ trigger: 'schedule' });
        });

        it('does not register a job node-schedule rejects (null)', () => {
            scheduleJob.mockReturnValueOnce(null);
            scheduler.register({ name: 'bad', cron: 'nonsense' }, () => undefined);
            expect(scheduler.has('bad')).toBe(false);
            expect(errorLog).toHaveBeenCalled();
        });

        it('reports the next run when node-schedule can tell', () => {
            scheduler.register({ name: 'a', cron: '* * * * *' }, () => undefined);
            expect(scheduler.get('a')?.nextRunAt).toEqual(new Date('2030-01-01T00:00:00Z'));
        });
    });

    describe('interval jobs', () => {
        it('runs every intervalMs', async () => {
            const fn = vi.fn();
            scheduler.register({ name: 'tick', intervalMs: 1000 }, fn);
            await vi.advanceTimersByTimeAsync(3500);
            expect(fn).toHaveBeenCalledTimes(3);
            expect(scheduleJob).not.toHaveBeenCalled();
        });

        it('runs the first time one interval after registering, not at once', async () => {
            const fn = vi.fn();
            scheduler.register({ name: 'tick', intervalMs: 1000 }, fn);
            expect(fn).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(999);
            expect(fn).not.toHaveBeenCalled();
        });
    });

    describe('spec validation', () => {
        it('needs exactly one of cron and intervalMs', () => {
            expect(() => scheduler.register({ name: 'none' }, () => undefined)).toThrow(/exactly one/);
            expect(() => scheduler.register({ name: 'both', cron: '* * * * *', intervalMs: 5 }, () => undefined)).toThrow(/exactly one/);
        });

        it('rejects a non-positive interval and a tz on an interval', () => {
            expect(() => scheduler.register({ name: 'zero', intervalMs: 0 }, () => undefined)).toThrow(/positive/);
            expect(() => scheduler.register({ name: 'tz', intervalMs: 5, tz: 'Etc/UTC' }, () => undefined)).toThrow(/tz/);
        });
    });

    describe('startup run', () => {
        it('runs once after runOnStartupAfterMs, in addition to the schedule', async () => {
            const fn = vi.fn();
            scheduler.register({ name: 'sync', cron: '0 * * * *', runOnStartupAfterMs: 5000 }, fn);
            await vi.advanceTimersByTimeAsync(4999);
            expect(fn).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(1);
            expect(fn).toHaveBeenCalledTimes(1);
            expect(fn).toHaveBeenCalledWith({ trigger: 'startup' });
            await vi.advanceTimersByTimeAsync(60_000);
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('is not scheduled when the delay is left out', async () => {
            const fn = vi.fn();
            scheduler.register({ name: 'sync', cron: '0 * * * *' }, fn);
            await vi.advanceTimersByTimeAsync(120_000);
            expect(fn).not.toHaveBeenCalled();
        });

        it('shares the overlap guard with the schedule', async () => {
            let finish!: () => void;
            const fn = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
            scheduler.register({ name: 'sync', cron: '0 * * * *', runOnStartupAfterMs: 1000 }, fn);
            await vi.advanceTimersByTimeAsync(1000);
            await cronCallbacks[0]();
            expect(fn).toHaveBeenCalledTimes(1);
            finish();
        });

        it('runOnce fires a single time after the delay', async () => {
            const fn = vi.fn();
            scheduler.runOnce({ name: 'boot', delayMs: 2000 }, fn);
            expect(scheduler.get('boot')).toMatchObject({ kind: 'once', startupDelayMs: 2000 });
            await vi.advanceTimersByTimeAsync(10_000);
            expect(fn).toHaveBeenCalledTimes(1);
        });
    });

    describe('overlap guard', () => {
        it('skips a run while the previous one is still going, then runs again', async () => {
            let finish!: () => void;
            const fn = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
            scheduler.register({ name: 'slow', cron: '* * * * *' }, fn);

            const first = cronCallbacks[0]();
            expect(scheduler.get('slow')?.running).toBe(true);
            await cronCallbacks[0]();
            expect(fn).toHaveBeenCalledTimes(1);

            finish();
            await first;
            expect(scheduler.get('slow')?.running).toBe(false);

            const third = cronCallbacks[0]();
            expect(fn).toHaveBeenCalledTimes(2);
            finish();
            await third;
        });

        it('guards each job on its own', async () => {
            let finish!: () => void;
            const slow = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
            const other = vi.fn();
            scheduler.register({ name: 'slow', cron: '* * * * *' }, slow);
            scheduler.register({ name: 'other', cron: '* * * * *' }, other);

            const pending = cronCallbacks[0]();
            await cronCallbacks[1]();
            expect(other).toHaveBeenCalledTimes(1);
            finish();
            await pending;
        });
    });

    describe('errors', () => {
        it('catches a throwing job, logs it and runs it again next time', async () => {
            const fn = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);
            scheduler.register({ name: 'flaky', cron: '* * * * *' }, fn);

            await expect(cronCallbacks[0]()).resolves.toBeUndefined();
            expect(errorLog).toHaveBeenCalledTimes(1);
            expect(scheduler.get('flaky')).toMatchObject({ running: false, lastError: 'boom' });

            await cronCallbacks[0]();
            expect(fn).toHaveBeenCalledTimes(2);
            expect(scheduler.get('flaky')?.lastError).toBeNull();
        });

        it('catches a synchronous throw as well', async () => {
            scheduler.register({ name: 'sync-throw', cron: '* * * * *' }, () => { throw new Error('sync'); });
            await cronCallbacks[0]();
            expect(scheduler.get('sync-throw')?.lastError).toBe('sync');
        });
    });

    describe('status', () => {
        it('records lastRunAt, lastDurationMs and runCount', async () => {
            vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
            scheduler.register({ name: 'timed', cron: '* * * * *' }, () => new Promise<void>(resolve => setTimeout(resolve, 250)));
            expect(scheduler.get('timed')).toMatchObject({ lastRunAt: null, lastDurationMs: null, runCount: 0 });

            const run = cronCallbacks[0]();
            await vi.advanceTimersByTimeAsync(250);
            await run;

            expect(scheduler.get('timed')).toMatchObject({
                lastRunAt: new Date('2026-01-01T00:00:00Z'),
                lastDurationMs: 250,
                runCount: 1,
                running: false,
            });
        });

        it('lists every job with its timing', () => {
            scheduler.register({ name: 'c', cron: '0 * * * *', tz: 'Etc/UTC', runOnStartupAfterMs: 100 }, () => undefined);
            scheduler.register({ name: 'i', intervalMs: 500 }, () => undefined);
            expect(scheduler.list().map(j => [j.name, j.kind, j.cron, j.tz, j.intervalMs, j.startupDelayMs])).toEqual([
                ['c', 'cron', '0 * * * *', 'Etc/UTC', undefined, 100],
                ['i', 'interval', undefined, undefined, 500, undefined],
            ]);
        });
    });

    describe('duplicate names', () => {
        it('throws on a second register of the same name and keeps the first', () => {
            const first = vi.fn();
            scheduler.register({ name: 'dup', cron: '* * * * *' }, first);
            expect(() => scheduler.register({ name: 'dup', intervalMs: 10 }, () => undefined)).toThrow(/already registered/);
            expect(() => scheduler.runOnce({ name: 'dup', delayMs: 10 }, () => undefined)).toThrow(/already registered/);
            expect(scheduler.list()).toHaveLength(1);
        });

        it('registerIfAbsent leaves an existing name alone', () => {
            expect(scheduler.registerIfAbsent({ name: 'x', intervalMs: 10 }, () => undefined)).toBe(true);
            expect(scheduler.registerIfAbsent({ name: 'x', intervalMs: 10 }, () => undefined)).toBe(false);
            expect(scheduler.list()).toHaveLength(1);
        });
    });

    describe('cancel', () => {
        it('cancel stops one job and frees its name', async () => {
            const fn = vi.fn();
            scheduler.register({ name: 'tick', intervalMs: 100 }, fn);
            scheduler.register({ name: 'cron', cron: '* * * * *' }, fn);

            expect(scheduler.cancel('tick')).toBe(true);
            expect(scheduler.cancel('tick')).toBe(false);
            await vi.advanceTimersByTimeAsync(1000);
            expect(fn).not.toHaveBeenCalled();
            expect(scheduler.has('cron')).toBe(true);

            expect(() => scheduler.register({ name: 'tick', intervalMs: 100 }, fn)).not.toThrow();
        });

        it('cancelAll clears cron jobs, intervals and pending startup timers', async () => {
            const fn = vi.fn();
            scheduler.register({ name: 'cron', cron: '0 * * * *', runOnStartupAfterMs: 1000 }, fn);
            scheduler.register({ name: 'interval', intervalMs: 100 }, fn);
            scheduler.runOnce({ name: 'once', delayMs: 500 }, fn);

            scheduler.cancelAll();

            expect(cancelSpies[0]).toHaveBeenCalledTimes(1);
            expect(vi.getTimerCount()).toBe(0);
            await vi.advanceTimersByTimeAsync(10_000);
            expect(fn).not.toHaveBeenCalled();
            expect(scheduler.list()).toEqual([]);
        });
    });

    describe('singleton', () => {
        it('getJobScheduler returns one instance until reset', () => {
            resetJobScheduler();
            const a = getJobScheduler();
            expect(getJobScheduler()).toBe(a);
            a.register({ name: 'x', intervalMs: 10 }, () => undefined);
            resetJobScheduler();
            expect(getJobScheduler()).not.toBe(a);
            expect(getJobScheduler().list()).toEqual([]);
            resetJobScheduler();
        });
    });
});
