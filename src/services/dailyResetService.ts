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
     * Schedule a daily reset message for a specific game
     */
    private scheduleResetMessage(config: DailyResetConfig): void {
        let cronTime: string;
        let scheduleDescription: string;

        if (this.isDevelopment) {
            // Dev mode: Run every N minutes
            cronTime = `*/${this.devModeInterval} * * * *`;
            scheduleDescription = `every ${this.devModeInterval} minutes (DEV MODE)`;
        } else {
            // Production mode: Run at configured daily time
            cronTime = `${config.resetTime.minute} ${config.resetTime.hour} * * *`;
            scheduleDescription = `${cronTime} (${config.timezone})`;
        }

        const job = schedule.scheduleJob(cronTime, async () => {
            await this.sendResetMessage(config);
        });

        this.scheduledJobs.set(config.game, job);
        console.log(`Scheduled daily reset message for ${config.game} at ${scheduleDescription}`);
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
