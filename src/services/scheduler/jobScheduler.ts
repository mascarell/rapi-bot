import schedule from 'node-schedule';
import { logger } from '../../utils/logger.js';

/** What started a run: a cron tick, an interval tick, or the startup / one-off timer. */
export type JobTrigger = 'schedule' | 'startup';

export interface JobContext {
    trigger: JobTrigger;
}

export type JobFn = (ctx: JobContext) => void | Promise<unknown>;

/**
 * How a job is timed. Exactly one of `cron` and `intervalMs`.
 * `tz` only applies to `cron`; without it node-schedule uses the server's
 * local time, as a bare cron string always did.
 */
export interface JobSpec {
    /** Unique name; shows up in logs and list(). */
    name: string;
    /** node-schedule cron expression. */
    cron?: string;
    /** IANA timezone for `cron` (e.g. 'Etc/UTC'). */
    tz?: string;
    /** Fixed interval in milliseconds. */
    intervalMs?: number;
    /** Also run once this long after register(), in addition to the schedule. */
    runOnStartupAfterMs?: number;
}

export interface OneShotSpec {
    name: string;
    delayMs: number;
}

export type JobKind = 'cron' | 'interval' | 'once';

/** Snapshot of one job, for logs, tests and a future `/mod jobs`. */
export interface JobInfo {
    name: string;
    kind: JobKind;
    cron?: string;
    tz?: string;
    intervalMs?: number;
    /** Delay of the startup run (`runOnStartupAfterMs`) or of a one-shot. */
    startupDelayMs?: number;
    running: boolean;
    runCount: number;
    lastRunAt: Date | null;
    lastDurationMs: number | null;
    lastError: string | null;
    /** Next cron firing, when node-schedule can tell. */
    nextRunAt: Date | null;
}

interface JobEntry {
    spec: JobSpec & { kind: JobKind; startupDelayMs?: number };
    fn: JobFn;
    cronJob?: schedule.Job;
    interval?: ReturnType<typeof setInterval>;
    startupTimer?: ReturnType<typeof setTimeout>;
    running: boolean;
    runCount: number;
    lastRunAt: Date | null;
    lastDurationMs: number | null;
    lastError: string | null;
}

/**
 * One place for every timed job in the bot.
 *
 * Wraps node-schedule (cron), setInterval and one-off timers with the same
 * behaviour for each: a job whose previous run is still going is skipped, an
 * error is logged under the job's name instead of escaping, and the last run
 * is recorded so it can be listed.
 */
export class JobScheduler {
    private jobs = new Map<string, JobEntry>();

    /** Register a recurring job. Throws on a duplicate name or an invalid spec. */
    register(spec: JobSpec, fn: JobFn): void {
        const hasCron = spec.cron !== undefined;
        const hasInterval = spec.intervalMs !== undefined;
        if (hasCron === hasInterval) {
            throw new Error(`Job "${spec.name}": give exactly one of cron or intervalMs`);
        }
        if (hasInterval && !(spec.intervalMs! > 0)) {
            throw new Error(`Job "${spec.name}": intervalMs must be positive`);
        }
        if (spec.tz !== undefined && !hasCron) {
            throw new Error(`Job "${spec.name}": tz only applies to cron jobs`);
        }
        this.assertFree(spec.name);

        const entry: JobEntry = {
            spec: {
                ...spec,
                kind: hasCron ? 'cron' : 'interval',
                startupDelayMs: spec.runOnStartupAfterMs,
            },
            fn,
            running: false,
            runCount: 0,
            lastRunAt: null,
            lastDurationMs: null,
            lastError: null,
        };

        if (hasCron) {
            const job = spec.tz
                ? schedule.scheduleJob({ rule: spec.cron!, tz: spec.tz }, () => this.run(entry, 'schedule'))
                : schedule.scheduleJob(spec.cron!, () => this.run(entry, 'schedule'));
            if (!job) {
                // node-schedule returns null for an expression it cannot parse.
                logger.error`[Scheduler] Job ${spec.name} not scheduled: invalid cron ${spec.cron}`;
                return;
            }
            entry.cronJob = job;
        } else {
            entry.interval = setInterval(() => this.run(entry, 'schedule'), spec.intervalMs);
        }

        if (spec.runOnStartupAfterMs !== undefined && spec.runOnStartupAfterMs >= 0) {
            entry.startupTimer = setTimeout(() => {
                entry.startupTimer = undefined;
                void this.run(entry, 'startup');
            }, spec.runOnStartupAfterMs);
        }

        this.jobs.set(spec.name, entry);
        logger.debug`[Scheduler] Registered ${spec.name} (${spec.cron ?? `every ${spec.intervalMs}ms`})`;
    }

    /**
     * Like register(), but a name that is already taken is left alone.
     * For wiring that can legitimately run twice (module-level cleanup timers,
     * an init() that more than one caller may reach). Returns true if it registered.
     */
    registerIfAbsent(spec: JobSpec, fn: JobFn): boolean {
        if (this.jobs.has(spec.name)) return false;
        this.register(spec, fn);
        return true;
    }

    /** Register a job that runs once after `delayMs`. */
    runOnce(spec: OneShotSpec, fn: JobFn): void {
        this.assertFree(spec.name);
        const entry: JobEntry = {
            spec: { name: spec.name, kind: 'once', startupDelayMs: spec.delayMs },
            fn,
            running: false,
            runCount: 0,
            lastRunAt: null,
            lastDurationMs: null,
            lastError: null,
        };
        entry.startupTimer = setTimeout(() => {
            entry.startupTimer = undefined;
            void this.run(entry, 'startup');
        }, spec.delayMs);
        this.jobs.set(spec.name, entry);
    }

    has(name: string): boolean {
        return this.jobs.has(name);
    }

    get(name: string): JobInfo | undefined {
        const entry = this.jobs.get(name);
        return entry ? this.describe(entry) : undefined;
    }

    list(): JobInfo[] {
        return [...this.jobs.values()].map(entry => this.describe(entry));
    }

    /** Stop one job (cron, interval and pending startup run). Returns false if unknown. */
    cancel(name: string): boolean {
        const entry = this.jobs.get(name);
        if (!entry) return false;
        this.stop(entry);
        this.jobs.delete(name);
        return true;
    }

    /** Stop every job. A run already in flight is left to finish. */
    cancelAll(): void {
        for (const entry of this.jobs.values()) this.stop(entry);
        this.jobs.clear();
    }

    private assertFree(name: string): void {
        if (this.jobs.has(name)) {
            throw new Error(`Job "${name}" is already registered`);
        }
    }

    private stop(entry: JobEntry): void {
        entry.cronJob?.cancel();
        if (entry.interval) clearInterval(entry.interval);
        if (entry.startupTimer) clearTimeout(entry.startupTimer);
        entry.cronJob = undefined;
        entry.interval = undefined;
        entry.startupTimer = undefined;
    }

    private async run(entry: JobEntry, trigger: JobTrigger): Promise<void> {
        const { name } = entry.spec;
        if (entry.running) {
            logger.debug`[Scheduler] Skipping ${name}: previous run still going`;
            return;
        }

        entry.running = true;
        const started = Date.now();
        entry.lastRunAt = new Date(started);
        entry.runCount++;
        try {
            await entry.fn({ trigger });
            entry.lastError = null;
        } catch (error) {
            entry.lastError = error instanceof Error ? error.message : String(error);
            logger.error`[Scheduler] Job ${name} failed: ${error}`;
        } finally {
            entry.lastDurationMs = Date.now() - started;
            entry.running = false;
        }
    }

    private describe(entry: JobEntry): JobInfo {
        const { spec } = entry;
        let nextRunAt: Date | null = null;
        try {
            const next = entry.cronJob?.nextInvocation?.();
            if (next) nextRunAt = new Date(next.getTime());
        } catch {
            // Informational only.
        }
        return {
            name: spec.name,
            kind: spec.kind,
            cron: spec.cron,
            tz: spec.tz,
            intervalMs: spec.intervalMs,
            startupDelayMs: spec.startupDelayMs,
            running: entry.running,
            runCount: entry.runCount,
            lastRunAt: entry.lastRunAt,
            lastDurationMs: entry.lastDurationMs,
            lastError: entry.lastError,
            nextRunAt,
        };
    }
}

let instance: JobScheduler | null = null;

export function getJobScheduler(): JobScheduler {
    if (!instance) instance = new JobScheduler();
    return instance;
}

/** Stop every job and drop the singleton. For tests; production uses cancelAll(). */
export function resetJobScheduler(): void {
    instance?.cancelAll();
    instance = null;
}
