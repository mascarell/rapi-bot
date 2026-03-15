import { Client, EmbedBuilder, Guild } from 'discord.js';
import schedule from 'node-schedule';
import { PvpEventConfig, PvpWarningConfig, PvpReminderServiceConfig } from '../utils/interfaces/PvpEventConfig.interface.js';
import { findChannelByName, logError } from '../utils/util.js';
import { getRandomCdnMediaUrl } from '../utils/cdn/mediaManager.js';
import { getNotificationSubscriptionService } from './notificationSubscriptionService.js';
import { logger } from '../utils/logger.js';

/**
 * Service for scheduling weekly PVP event warnings.
 *
 * Separate from DailyResetService because PVP events use weekly (day-of-week)
 * scheduling rather than daily. Follows the same node-schedule + guild iteration pattern.
 */
export class PvpReminderService {
    private bot: Client;
    private config: PvpReminderServiceConfig;
    private scheduledJobs: Map<string, schedule.Job> = new Map();
    private isDevelopment: boolean;

    constructor(bot: Client, config: PvpReminderServiceConfig) {
        this.bot = bot;
        this.config = config;
        this.isDevelopment = process.env.NODE_ENV === 'development';
    }

    /**
     * Initialize all PVP event warning schedules
     */
    public initializeSchedules(): void {
        for (const event of this.config.events) {
            this.scheduleEventWarnings(event);
        }
    }

    /**
     * Schedule all warnings for a single PVP event
     */
    private scheduleEventWarnings(event: PvpEventConfig): void {
        for (const warning of event.warnings) {
            const jobId = `${event.id}-${warning.label}`;

            let cron: string;
            if (this.isDevelopment) {
                const interval = this.config.devModeInterval || 3;
                cron = `*/${interval} * * * *`;
            } else {
                cron = this.calculateWarningCron(event, warning);
            }

            const job = schedule.scheduleJob(cron, async () => {
                await this.sendWarningToAllGuilds(event, warning);
            });

            if (job) {
                this.scheduledJobs.set(jobId, job);
                logger.debug`[PVP] Scheduled ${event.id} ${warning.label} warning: ${cron}`;
            }
        }
    }

    /**
     * Calculate cron expression for a warning relative to the event's season end.
     *
     * Converts seasonEnd time to total minutes in the week, subtracts minutesBefore,
     * and handles wraparound (e.g., warning before Monday 00:00 wraps to Sunday).
     *
     * @returns node-schedule cron: "minute hour * * dayOfWeek"
     */
    public calculateWarningCron(event: PvpEventConfig, warning: PvpWarningConfig): string {
        const { dayOfWeek, hour, minute } = event.seasonEnd;

        // Total minutes into the week (Sunday 00:00 = 0)
        let totalMinutes = (dayOfWeek * 24 * 60) + (hour * 60) + minute;
        totalMinutes -= warning.minutesBefore;

        // Wrap around the week (7 days = 10080 minutes)
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
     * Send a warning to all guilds the bot is in
     */
    private async sendWarningToAllGuilds(event: PvpEventConfig, warning: PvpWarningConfig): Promise<void> {
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

        // Seed subscribe reaction and send DM notifications
        const notificationService = getNotificationSubscriptionService();
        const notificationType = `pvp-warning:${event.id}`;
        await notificationService.seedSubscribeReaction(sentMessage, notificationType);
        await notificationService.sendNotification(this.bot, notificationType, EmbedBuilder.from(embed.data));
    }

    /**
     * Compute the Unix timestamp (seconds) for the next occurrence of the season end.
     * Used to generate Discord dynamic timestamps like <t:1234567890:F>.
     */
    public getNextSeasonEndTimestamp(event: PvpEventConfig): number {
        const now = new Date();
        const { dayOfWeek, hour, minute } = event.seasonEnd;

        // Start from today, find next matching day of week
        const target = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            hour,
            minute,
            0
        ));

        // Adjust to the correct day of week
        const currentDay = target.getUTCDay();
        let daysUntil = dayOfWeek - currentDay;
        if (daysUntil < 0) daysUntil += 7;
        if (daysUntil === 0 && target.getTime() <= now.getTime()) daysUntil = 7;
        target.setUTCDate(target.getUTCDate() + daysUntil);

        return Math.floor(target.getTime() / 1000);
    }

    /**
     * Build an embed for a PVP warning message
     */
    private async buildWarningEmbed(guild: Guild, event: PvpEventConfig, warning: PvpWarningConfig): Promise<EmbedBuilder> {
        const { embedConfig } = warning;
        const seasonEndTs = this.getNextSeasonEndTimestamp(event);

        // Resolve dynamic description and fields
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

        // Random media image (same pattern as daily reset)
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
