import { Client, EmbedBuilder, Guild } from 'discord.js';
import schedule from 'node-schedule';
import { DailyResetConfig, DailyResetServiceConfig } from '../utils/interfaces/DailyResetConfig.interface';
import { findChannelByName, findRoleByName, logError } from '../utils/util';
import { getRandomCdnMediaUrl } from '../utils/cdn/mediaManager';

/**
 * Service for managing daily reset messages across multiple games
 */
export class DailyResetService {
    private bot: Client;
    private configs: DailyResetConfig[];
    private scheduledJobs: Map<string, schedule.Job> = new Map();
    private devModeInterval: number;
    private isDevelopment: boolean;

    constructor(bot: Client, config: DailyResetServiceConfig) {
        this.bot = bot;
        this.configs = config.games;
        this.devModeInterval = config.devModeInterval || 5;
        this.isDevelopment = process.env.NODE_ENV === 'development';

        if (this.isDevelopment) {
            console.log(`⚠️  DEV MODE: Daily reset messages will trigger every ${this.devModeInterval} minutes instead of daily schedules.`);
        }
    }

    /**
     * Initialize all daily reset schedules
     */
    public initializeSchedules(): void {
        this.configs.forEach(config => {
            this.scheduleResetMessage(config);
        });
    }

    /**
     * Calculate the warning time based on reset time and minutes before
     * Handles midnight wraparound (e.g., 00:30 reset - 60 min = 23:30 previous day)
     */
    private calculateWarningTime(resetHour: number, resetMinute: number, minutesBefore: number): { warningHour: number; warningMinute: number } {
        // Convert reset time to total minutes since midnight
        let totalMinutes = (resetHour * 60) + resetMinute;

        // Subtract the warning offset
        totalMinutes -= minutesBefore;

        // Handle negative wraparound (previous day)
        if (totalMinutes < 0) {
            totalMinutes += 1440; // 24 hours * 60 minutes
        }

        // Convert back to hours and minutes
        return {
            warningHour: Math.floor(totalMinutes / 60),
            warningMinute: totalMinutes % 60
        };
    }

    /**
     * Schedule a daily reset message for a specific game
     * Also schedules warning message if configured
     */
    private scheduleResetMessage(config: DailyResetConfig): void {
        if (this.isDevelopment) {
            // Dev mode: Schedule with fixed offset between warning and reset

            // Schedule warning if enabled
            if (config.warningConfig?.enabled) {
                const warningCron = `*/${this.devModeInterval} * * * *`;
                const warningJob = schedule.scheduleJob(warningCron, async () => {
                    await this.sendWarningMessage(config);
                });
                this.scheduledJobs.set(`${config.game}-warning`, warningJob);
                console.log(`[DEV] Scheduled warning for ${config.game} every ${this.devModeInterval} minutes`);
            }

            // Schedule reset with 2-minute offset from warning
            const resetOffset = 2; // minutes after warning
            const resetCron = `${resetOffset}-59/${this.devModeInterval} * * * *`;
            const resetJob = schedule.scheduleJob(resetCron, async () => {
                await this.sendResetMessage(config);
            });
            this.scheduledJobs.set(`${config.game}-reset`, resetJob);
            console.log(`[DEV] Scheduled reset for ${config.game} at +${resetOffset} min offset (repeats every ${this.devModeInterval} min)`);

        } else {
            // Production mode: Schedule at exact times

            // Schedule warning if enabled
            if (config.warningConfig?.enabled) {
                const { warningHour, warningMinute } = this.calculateWarningTime(
                    config.resetTime.hour,
                    config.resetTime.minute,
                    config.warningConfig.minutesBefore
                );
                const warningCron = `${warningMinute} ${warningHour} * * *`;
                const warningJob = schedule.scheduleJob(warningCron, async () => {
                    await this.sendWarningMessage(config);
                });
                this.scheduledJobs.set(`${config.game}-warning`, warningJob);
                console.log(`Scheduled warning for ${config.game} at ${String(warningHour).padStart(2, '0')}:${String(warningMinute).padStart(2, '0')} ${config.timezone} (${config.warningConfig.minutesBefore} min before reset)`);
            }

            // Schedule reset at configured time
            const resetCron = `${config.resetTime.minute} ${config.resetTime.hour} * * *`;
            const resetJob = schedule.scheduleJob(resetCron, async () => {
                await this.sendResetMessage(config);
            });
            this.scheduledJobs.set(`${config.game}-reset`, resetJob);
            console.log(`Scheduled reset for ${config.game} at ${String(config.resetTime.hour).padStart(2, '0')}:${String(config.resetTime.minute).padStart(2, '0')} ${config.timezone}`);
        }
    }

    /**
     * Send a daily reset message to all guilds
     */
    private async sendResetMessage(config: DailyResetConfig): Promise<void> {
        const guilds = this.bot.guilds.cache.values();

        for (const guild of guilds) {
            try {
                await this.sendResetMessageToGuild(guild, config);
            } catch (error) {
                logError(
                    guild.id,
                    guild.name,
                    error instanceof Error ? error : new Error(String(error)),
                    `Sending ${config.game} daily reset message`
                );
            }
        }
    }

    /**
     * Send a warning message to all guilds
     */
    private async sendWarningMessage(config: DailyResetConfig): Promise<void> {
        const guilds = this.bot.guilds.cache.values();

        for (const guild of guilds) {
            try {
                await this.sendWarningMessageToGuild(guild, config);
            } catch (error) {
                logError(
                    guild.id,
                    guild.name,
                    error instanceof Error ? error : new Error(String(error)),
                    `Sending ${config.game} warning message`
                );
            }
        }
    }

    /**
     * Send a daily reset message to a specific guild
     */
    private async sendResetMessageToGuild(guild: Guild, config: DailyResetConfig): Promise<void> {
        const channel = findChannelByName(guild, config.channelName);

        if (!channel) {
            console.log(`Channel '${config.channelName}' not found in server: ${guild.name}.`);
            return;
        }

        // Execute beforeSend hook if provided
        if (config.hooks?.beforeSend) {
            await config.hooks.beforeSend(channel.id, guild.id, this.bot);
        }

        // Send role ping if configured
        if (config.roleName) {
            const role = findRoleByName(guild, config.roleName);
            if (role) {
                await channel.send(`${role.toString()}`);
            }
        }

        // Build the embed
        const embed = await this.buildEmbed(guild, config);

        // Send the embed message
        const sentMessage = await channel.send({ embeds: [embed] });

        // Execute afterSend hook if provided
        if (config.hooks?.afterSend) {
            await config.hooks.afterSend(sentMessage, guild.id, this.bot);
        }
    }

    /**
     * Send a warning message to a specific guild
     */
    private async sendWarningMessageToGuild(guild: Guild, config: DailyResetConfig): Promise<void> {
        const channel = findChannelByName(guild, config.channelName);

        if (!channel) {
            console.log(`Channel '${config.channelName}' not found in server: ${guild.name}.`);
            return;
        }

        // Build the warning embed
        const embed = await this.buildWarningEmbed(guild, config);

        // Send the warning embed message (NO role ping as per requirements)
        const sentMessage = await channel.send({ embeds: [embed] });

        // Execute afterSend hook if provided (warnings can have hooks too)
        if (config.hooks?.afterSend) {
            await config.hooks.afterSend(sentMessage, guild.id, this.bot);
        }
    }

    /**
     * Build an embed for a daily reset message
     */
    private async buildEmbed(guild: Guild, config: DailyResetConfig): Promise<EmbedBuilder> {
        const embed = new EmbedBuilder()
            .setTitle(config.embedConfig.title)
            .setDescription(config.embedConfig.description)
            .setColor(config.embedConfig.color)
            .setTimestamp()
            .setFooter({
                text: config.embedConfig.footer.text,
                iconURL: config.embedConfig.footer.iconURL
            });

        // Add author if configured
        if (config.embedConfig.author) {
            embed.setAuthor({
                name: config.embedConfig.author.name,
                iconURL: config.embedConfig.author.iconURL
            });
        }

        // Add thumbnail if configured
        if (config.embedConfig.thumbnail) {
            embed.setThumbnail(config.embedConfig.thumbnail);
        }

        // Add static checklist fields
        config.checklist.forEach(field => {
            embed.addFields({
                name: field.name,
                value: field.value,
                inline: field.inline || false
            });
        });

        // Add dynamic fields if provided
        if (config.dynamicFields) {
            const dynamicFields = config.dynamicFields(new Date());
            dynamicFields.forEach(field => {
                embed.addFields({
                    name: field.name,
                    value: field.value,
                    inline: field.inline || false
                });
            });
        }

        // Add random media image if configured
        if (config.mediaConfig) {
            const randomMediaUrl = await getRandomCdnMediaUrl(
                config.mediaConfig.cdnPath,
                guild.id,
                {
                    extensions: config.mediaConfig.extensions,
                    trackLast: config.mediaConfig.trackLast
                }
            );
            embed.setImage(randomMediaUrl);
        }

        return embed;
    }

    /**
     * Build an embed for a warning message
     * Uses custom warning config if provided, otherwise uses default warning template
     */
    private async buildWarningEmbed(guild: Guild, config: DailyResetConfig): Promise<EmbedBuilder> {
        // Use custom warning embed config if provided, otherwise create default warning message
        const warningEmbedConfig = config.warningConfig?.embedConfig;
        const minutesBefore = config.warningConfig?.minutesBefore || 60;

        const embed = new EmbedBuilder()
            .setTitle(warningEmbedConfig?.title || `⚠️ ${config.game} Reset Warning!`)
            .setDescription(warningEmbedConfig?.description || `Server will reset in **${minutesBefore} minutes**!\n\nComplete your daily tasks before the reset!`)
            .setColor(warningEmbedConfig?.color || 0xFFA500) // Orange color for warnings
            .setTimestamp()
            .setFooter({
                text: warningEmbedConfig?.footer?.text || config.embedConfig.footer.text,
                iconURL: warningEmbedConfig?.footer?.iconURL || config.embedConfig.footer.iconURL
            });

        // Add author if configured (use custom or fallback to main config)
        const authorConfig = warningEmbedConfig?.author || config.embedConfig.author;
        if (authorConfig) {
            embed.setAuthor({
                name: authorConfig.name,
                iconURL: authorConfig.iconURL
            });
        }

        // Add thumbnail if configured (use custom or fallback to main config)
        const thumbnailUrl = warningEmbedConfig?.thumbnail || config.embedConfig.thumbnail;
        if (thumbnailUrl) {
            embed.setThumbnail(thumbnailUrl);
        }

        // Warning messages do NOT include checklist fields (as per requirements)
        // They are meant to be brief notifications

        // Add random media image if configured
        if (config.mediaConfig) {
            const randomMediaUrl = await getRandomCdnMediaUrl(
                config.mediaConfig.cdnPath,
                guild.id,
                {
                    extensions: config.mediaConfig.extensions,
                    trackLast: config.mediaConfig.trackLast
                }
            );
            embed.setImage(randomMediaUrl);
        }

        return embed;
    }

    /**
     * Cancel all scheduled jobs (useful for cleanup)
     */
    public cancelAllSchedules(): void {
        this.scheduledJobs.forEach((job, gameName) => {
            job.cancel();
            console.log(`Cancelled schedule for ${gameName}`);
        });
        this.scheduledJobs.clear();
    }

    /**
     * Get all scheduled jobs (useful for debugging)
     */
    public getScheduledJobs(): Map<string, schedule.Job> {
        return this.scheduledJobs;
    }
}
