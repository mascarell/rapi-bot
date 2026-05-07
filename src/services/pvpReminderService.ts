import { Client, EmbedBuilder, Guild } from 'discord.js';
import schedule from 'node-schedule';
import { PvpEventConfig, PvpWarningConfig, PvpReminderServiceConfig } from '../utils/interfaces/PvpEventConfig.interface.js';
import { findChannelByName, logError } from '../utils/util.js';
import { getRandomCdnMediaUrl } from '../utils/cdn/mediaManager.js';
import { getNotificationSubscriptionService } from './notificationSubscriptionService.js';
import { logger } from '../utils/logger.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const RESTART_DEDUP_WINDOW_MS = 5 * 60 * 1000;        // suppress duplicate fires within 5 min
const RESTART_DEDUP_TTL_MS = 14 * DAY_MS;              // sweep dedup keys older than 14 days

/**
 * Service for scheduling weekly (or biweekly+) PVP event warnings.
 *
 * Separate from DailyResetService because PVP events use weekly (day-of-week)
 * scheduling rather than daily. Supports optional `cyclePhase` for events that
 * fire less than every week (e.g. biweekly Avalon).
 */
export class PvpReminderService {
    private bot: Client;
    private config: PvpReminderServiceConfig;
    private scheduledJobs: Map<string, schedule.Job> = new Map();
    private isDevelopment: boolean;
    /** restart de-dup: `${event.id}:${warning.label}:${ymd}` → fire timestamp */
    private lastFiredAt: Map<string, number> = new Map();

    constructor(bot: Client, config: PvpReminderServiceConfig) {
        this.bot = bot;
        this.config = config;
        this.isDevelopment = process.env.NODE_ENV === 'development';
    }

    /**
     * Initialize all PVP event warning schedules.
     * Validates cyclePhase invariants and logs the next planned fire per event.
     */
    public initializeSchedules(): void {
        this.validateCyclePhaseInvariants(this.config.events);

        for (const event of this.config.events) {
            this.scheduleEventWarnings(event);
            this.logNextActiveEnd(event);
        }
    }

    /**
     * Schedule all warnings for a single PVP event
     */
    private scheduleEventWarnings(event: PvpEventConfig): void {
        for (const warning of event.warnings) {
            const jobId = `${event.id}-${warning.label}`;

            let job: schedule.Job | null;
            if (this.isDevelopment) {
                const interval = this.config.devModeInterval || 3;
                // Dev mode: ignore TZ pin (every-N-min cron is TZ-agnostic).
                job = schedule.scheduleJob(`*/${interval} * * * *`, async () => {
                    await this.sendWarningToAllGuilds(event, warning);
                });
            } else {
                const cron = this.calculateWarningCron(event, warning);
                // Pin to UTC so DST shifts don't move the cron.
                job = schedule.scheduleJob({ rule: cron, tz: 'Etc/UTC' }, async () => {
                    await this.sendWarningToAllGuilds(event, warning);
                });
            }

            if (job) {
                this.scheduledJobs.set(jobId, job);
                logger.debug`[PVP] Scheduled ${event.id} ${warning.label} warning`;
            }
        }
    }

    /**
     * Calculate cron expression for a warning relative to the event's season end.
     *
     * @returns node-schedule cron: "minute hour * * dayOfWeek"
     */
    public calculateWarningCron(event: PvpEventConfig, warning: PvpWarningConfig): string {
        const { dayOfWeek, hour, minute } = event.seasonEnd;

        let totalMinutes = (dayOfWeek * 24 * 60) + (hour * 60) + minute;
        totalMinutes -= warning.minutesBefore;

        if (totalMinutes < 0) {
            totalMinutes += 7 * 24 * 60;
        }

        const warningDay = Math.floor(totalMinutes / (24 * 60));
        const remainingMinutes = totalMinutes % (24 * 60);
        const warningHour = Math.floor(remainingMinutes / 60);
        const warningMinute = remainingMinutes % 60;

        return `${warningMinute} ${warningHour} * * ${warningDay}`;
    }

    /**
     * Send a warning to all guilds the bot is in.
     * Gates on `isActiveCycle` and restart-dedup; both checked once per call (not per guild).
     */
    private async sendWarningToAllGuilds(event: PvpEventConfig, warning: PvpWarningConfig): Promise<void> {
        const now = new Date();

        // Cycle gate: skip on off-cycle weeks for biweekly+ events.
        if (!this.isDevelopment && !this.isActiveCycle(event, warning, now)) {
            return;
        }

        // Restart de-dup: suppress if same warning already fired within the dedup window.
        const targetTs = this.getNextSeasonEndTimestamp(event, now);
        const dedupKey = `${event.id}:${warning.label}:${ymdUtc(new Date(targetTs * 1000))}`;
        const lastFired = this.lastFiredAt.get(dedupKey);
        if (lastFired && (now.getTime() - lastFired) < RESTART_DEDUP_WINDOW_MS) {
            return;
        }
        this.lastFiredAt.set(dedupKey, now.getTime());
        this.sweepDedupMap(now.getTime());

        for (const guild of this.bot.guilds.cache.values()) {
            try {
                await this.sendWarningToGuild(guild, event, warning);
            } catch (error) {
                logError(
                    guild.id,
                    guild.name,
                    error instanceof Error ? error : new Error(String(error)),
                    `Sending ${event.id} ${warning.label} PVP warning`
                );
            }
        }

        if (warning.sendDM) {
            try {
                const firstGuild = this.bot.guilds.cache.values().next().value;
                if (firstGuild) {
                    const notificationService = getNotificationSubscriptionService();
                    const notificationType = `pvp-warning:${event.id}`;
                    const dmEmbed = await this.buildWarningEmbed(firstGuild, event, warning);
                    await notificationService.sendNotification(this.bot, notificationType, dmEmbed);
                }
            } catch (error) {
                logger.error`[PVP] Failed to send DM notifications for ${event.id} ${warning.label}: ${error}`;
            }
        }
    }

    /**
     * Returns true if the season-end this warning anticipates falls in the active cycle phase.
     *
     * Computes the target Sunday inline by projecting `now + minutesBefore`, then locating
     * the next weekly Sunday season-end at-or-after that projected instant. Does NOT walk
     * past off-cycle weeks — answering "should I fire for THIS Sunday?" not "what's the
     * next active Sunday?".
     *
     * For events without `cyclePhase`, always returns true (current weekly behavior).
     */
    public isActiveCycle(event: PvpEventConfig, warning: PvpWarningConfig, now: Date = new Date()): boolean {
        if (!event.cyclePhase || event.cyclePhase.intervalWeeks <= 1) return true;

        // Project forward by minutesBefore to identify which Sunday this warning anticipates
        const projected = new Date(now.getTime() + warning.minutesBefore * 60 * 1000);
        const target = this.weeklySeasonEndAtOrAfter(event, projected);
        const targetIso = target.toISOString();

        // Skip explicit holiday/maintenance dates: don't fire even if cycle phase matches
        if (event.cyclePhase.skipSeasonEnds?.includes(targetIso)) return false;

        const anchorMs = Date.parse(event.cyclePhase.anchor);
        if (Number.isNaN(anchorMs)) return false;

        // Round-to-nearest week — anchor and target both land on the same UTC weekday/hour/minute.
        // round() (vs floor()) avoids fractional-week drift from leap seconds.
        const weeksFromAnchor = Math.round((target.getTime() - anchorMs) / WEEK_MS);
        const phaseOffset = event.cyclePhase.phaseOffset ?? 0;
        const intervalWeeks = event.cyclePhase.intervalWeeks;

        // Negative-safe modulo: ((x % n) + n) % n
        const phase = (((weeksFromAnchor - phaseOffset) % intervalWeeks) + intervalWeeks) % intervalWeeks;
        return phase === 0;
    }

    /**
     * Internal: next weekly Sunday season-end strictly-at-or-after `now`. Biweekly-blind.
     * If `now` lands exactly on a season-end instant, returns that instant.
     */
    private weeklySeasonEndAtOrAfter(event: PvpEventConfig, now: Date): Date {
        const { dayOfWeek, hour, minute } = event.seasonEnd;
        const target = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            hour,
            minute,
            0
        ));
        const currentDay = target.getUTCDay();
        let daysUntil = dayOfWeek - currentDay;
        if (daysUntil < 0) daysUntil += 7;
        // Strictly-less-than: at exact equality `target == now`, stay on this Sunday
        if (daysUntil === 0 && target.getTime() < now.getTime()) daysUntil = 7;
        target.setUTCDate(target.getUTCDate() + daysUntil);
        return target;
    }

    /**
     * Send a warning to a specific guild's channel
     */
    private async sendWarningToGuild(guild: Guild, event: PvpEventConfig, warning: PvpWarningConfig): Promise<void> {
        const channel = findChannelByName(guild, event.channelName);

        if (!channel) {
            logger.warn`[PVP] Channel '${event.channelName}' not found in server: ${guild.name}`;
            return;
        }

        const embed = await this.buildWarningEmbed(guild, event, warning);
        const sentMessage = await channel.send({ embeds: [embed] });

        const notificationService = getNotificationSubscriptionService();
        const notificationType = `pvp-warning:${event.id}`;
        await notificationService.seedSubscribeReaction(sentMessage, notificationType);
    }

    /**
     * Compute the Unix timestamp (seconds) for the next active-cycle occurrence
     * of this event's season end. Used to generate Discord dynamic timestamps.
     *
     * For weekly events, returns the next Sunday season-end after `now`.
     * For biweekly+ events, walks forward in 7-day steps until phase matches and
     * the date isn't in `skipSeasonEnds`.
     */
    public getNextSeasonEndTimestamp(event: PvpEventConfig, now: Date = new Date()): number {
        const { dayOfWeek, hour, minute } = event.seasonEnd;

        // Find the next weekly Sunday season-end (not yet phase-aware)
        const target = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            hour,
            minute,
            0
        ));

        const currentDay = target.getUTCDay();
        let daysUntil = dayOfWeek - currentDay;
        if (daysUntil < 0) daysUntil += 7;
        if (daysUntil === 0 && target.getTime() <= now.getTime()) daysUntil = 7;
        target.setUTCDate(target.getUTCDate() + daysUntil);

        // For weekly events, that's the answer.
        if (!event.cyclePhase || event.cyclePhase.intervalWeeks <= 1) {
            return Math.floor(target.getTime() / 1000);
        }

        // Biweekly+: walk forward in 7-day steps until target is in active phase
        // and isn't in skipSeasonEnds. Cap iterations to one full year (52 steps)
        // to avoid infinite loop on a misconfigured anchor.
        const anchorMs = Date.parse(event.cyclePhase.anchor);
        const phaseOffset = event.cyclePhase.phaseOffset ?? 0;
        const intervalWeeks = event.cyclePhase.intervalWeeks;
        const skip = event.cyclePhase.skipSeasonEnds ?? [];

        for (let i = 0; i < 52; i++) {
            const targetMs = target.getTime();
            const weeksFromAnchor = Math.round((targetMs - anchorMs) / WEEK_MS);
            const phase = (((weeksFromAnchor - phaseOffset) % intervalWeeks) + intervalWeeks) % intervalWeeks;
            const targetIso = target.toISOString();
            if (phase === 0 && !skip.includes(targetIso)) {
                return Math.floor(targetMs / 1000);
            }
            target.setUTCDate(target.getUTCDate() + 7);
        }

        // Shouldn't happen with sane config; fall back to the first weekly Sunday.
        logger.warn`[PVP] getNextSeasonEndTimestamp: 52-week walk found no active cycle for ${event.id} (config likely misconfigured)`;
        return Math.floor(target.getTime() / 1000);
    }

    /**
     * Build an embed for a PVP warning message
     */
    private async buildWarningEmbed(guild: Guild, event: PvpEventConfig, warning: PvpWarningConfig): Promise<EmbedBuilder> {
        const { embedConfig } = warning;
        const seasonEndTs = this.getNextSeasonEndTimestamp(event);

        const description = typeof embedConfig.description === 'function'
            ? embedConfig.description(seasonEndTs)
            : embedConfig.description;

        const fields = typeof embedConfig.fields === 'function'
            ? embedConfig.fields(seasonEndTs)
            : embedConfig.fields;

        const embed = new EmbedBuilder()
            .setTitle(embedConfig.title)
            .setDescription(description)
            .setColor(embedConfig.color)
            .setTimestamp()
            .setFooter({
                text: embedConfig.footer.text,
                iconURL: embedConfig.footer.iconURL,
            });

        if (embedConfig.author) {
            embed.setAuthor({
                name: embedConfig.author.name,
                iconURL: embedConfig.author.iconURL,
            });
        }

        if (embedConfig.thumbnail) {
            embed.setThumbnail(embedConfig.thumbnail);
        }

        if (fields) {
            for (const field of fields) {
                embed.addFields({
                    name: field.name,
                    value: field.value,
                    inline: field.inline || false,
                });
            }
        }

        if (event.mediaConfig) {
            try {
                const mediaUrl = await getRandomCdnMediaUrl(
                    event.mediaConfig.cdnPath,
                    guild.id,
                    {
                        extensions: event.mediaConfig.extensions,
                        trackLast: event.mediaConfig.trackLast,
                    }
                );
                if (mediaUrl && mediaUrl.startsWith('http')) {
                    embed.setImage(mediaUrl);
                }
            } catch (error) {
                logger.warn`[PVP] Failed to fetch media for ${event.id} in guild ${guild.name}: ${error}`;
            }
        }

        return embed;
    }

    /**
     * Validate cyclePhase invariants. Throws on misconfiguration to fail fast at boot.
     *
     * Invariants:
     * 1. `anchor` parses as a valid ISO datetime
     * 2. `anchor` weekday matches `seasonEnd.dayOfWeek`
     * 3. `anchor` hour:minute matches `seasonEnd.hour:minute`
     * 4. No two events sharing `channelName` and `cyclePhase.intervalWeeks` collide
     *    on `phaseOffset` (catches anchor-typo class of bugs that would dual-fire)
     */
    private validateCyclePhaseInvariants(events: PvpEventConfig[]): void {
        for (const event of events) {
            if (!event.cyclePhase) continue;
            const anchorMs = Date.parse(event.cyclePhase.anchor);
            if (Number.isNaN(anchorMs)) {
                throw new Error(`[PVP] ${event.id}: cyclePhase.anchor is not a valid ISO datetime: ${event.cyclePhase.anchor}`);
            }
            const anchor = new Date(anchorMs);
            if (anchor.getUTCDay() !== event.seasonEnd.dayOfWeek) {
                throw new Error(
                    `[PVP] ${event.id}: cyclePhase.anchor weekday (${anchor.getUTCDay()}) ` +
                    `does not match seasonEnd.dayOfWeek (${event.seasonEnd.dayOfWeek})`
                );
            }
            if (
                anchor.getUTCHours() !== event.seasonEnd.hour ||
                anchor.getUTCMinutes() !== event.seasonEnd.minute
            ) {
                throw new Error(
                    `[PVP] ${event.id}: cyclePhase.anchor time (${anchor.getUTCHours()}:${anchor.getUTCMinutes()} UTC) ` +
                    `does not match seasonEnd time (${event.seasonEnd.hour}:${event.seasonEnd.minute} UTC)`
                );
            }
        }

        // Cross-event collision check: events sharing channel + interval must have unique phaseOffset
        const seen = new Map<string, string>();
        for (const event of events) {
            if (!event.cyclePhase) continue;
            const offset = event.cyclePhase.phaseOffset ?? 0;
            const key = `${event.channelName}|${event.cyclePhase.intervalWeeks}|${offset}`;
            const existing = seen.get(key);
            if (existing) {
                throw new Error(
                    `[PVP] cyclePhase collision: ${event.id} and ${existing} both target ` +
                    `channel '${event.channelName}' with intervalWeeks=${event.cyclePhase.intervalWeeks} ` +
                    `and phaseOffset=${offset} — they would fire on the same Sunday`
                );
            }
            seen.set(key, event.id);
        }
    }

    /**
     * Log the next planned fire times for a biweekly event so deploys make the
     * config visible in production logs.
     */
    private logNextActiveEnd(event: PvpEventConfig): void {
        if (!event.cyclePhase || this.isDevelopment) return;
        const targetTs = this.getNextSeasonEndTimestamp(event);
        const targetIso = new Date(targetTs * 1000).toISOString();
        const warningTimes = event.warnings.map(w => {
            const ms = targetTs * 1000 - w.minutesBefore * 60 * 1000;
            return `${w.label}=${new Date(ms).toISOString()}`;
        }).join('; ');
        logger.info`[PVP] ${event.id} next active end: ${targetIso} | warnings: ${warningTimes}`;
    }

    private sweepDedupMap(nowMs: number): void {
        for (const [key, ts] of this.lastFiredAt) {
            if (nowMs - ts > RESTART_DEDUP_TTL_MS) {
                this.lastFiredAt.delete(key);
            }
        }
    }

    /**
     * Cancel all scheduled jobs
     */
    public cancelAllSchedules(): void {
        for (const [, job] of this.scheduledJobs) {
            job.cancel();
        }
        this.scheduledJobs.clear();
    }

    /**
     * Get all scheduled jobs (for debugging)
     */
    public getScheduledJobs(): Map<string, schedule.Job> {
        return this.scheduledJobs;
    }
}

/** YYYY-MM-DD in UTC */
function ymdUtc(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
