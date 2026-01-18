import { Client, TextChannel, User, EmbedBuilder } from 'discord.js';
import { getGiveawayDataService } from './giveawayDataService';
import {
    Giveaway,
    GiveawayEntry,
    GiveawayWinner,
    EndCondition
} from '../utils/interfaces/Giveaway.interface';
import { GIVEAWAY_CONFIG } from '../utils/data/giveawayConfig';

const RAPI_BOT_THUMBNAIL_URL = process.env.CDN_DOMAIN_URL + '/assets/rapi-bot-thumbnail.jpg';

/**
 * Service for managing giveaway business logic
 * Handles lifecycle, notifications, and end condition checking
 */
export class GiveawayManagementService {
    private static instance: GiveawayManagementService;

    private constructor() {}

    public static getInstance(): GiveawayManagementService {
        if (!GiveawayManagementService.instance) {
            GiveawayManagementService.instance = new GiveawayManagementService();
        }
        return GiveawayManagementService.instance;
    }

    // ==================== Lifecycle Management ====================

    /**
     * Create a new giveaway
     */
    public async createGiveaway(
        bot: Client,
        guildId: string,
        createdBy: string,
        config: {
            title: string;
            description: string;
            prizeName: string;
            endConditions: EndCondition[];
        }
    ): Promise<Giveaway> {
        const dataService = getGiveawayDataService();

        // Check guild limit
        const activeGiveaways = await dataService.getActiveGiveaways(guildId);
        if (activeGiveaways.length >= GIVEAWAY_CONFIG.MAX_ACTIVE_GIVEAWAYS_PER_GUILD) {
            throw new Error(`Maximum of ${GIVEAWAY_CONFIG.MAX_ACTIVE_GIVEAWAYS_PER_GUILD} active giveaways reached for this server`);
        }

        // Validate mod channel exists
        const modChannel = await this.findModChannel(bot, guildId);
        if (!modChannel) {
            throw new Error(`Moderator channel "${GIVEAWAY_CONFIG.MOD_CHANNEL_NAME}" not found in this server`);
        }

        // Create giveaway
        const giveaway = await dataService.createGiveaway({
            guildId,
            createdBy,
            title: config.title,
            description: config.description,
            prizeName: config.prizeName,
            status: 'active',
            entries: [],
            endConditions: config.endConditions,
            modChannelId: modChannel.id,
        });

        // Announce to mod channel
        await this.announceGiveawayStart(bot, giveaway);

        return giveaway;
    }

    /**
     * End a giveaway and select winner
     */
    public async endGiveaway(
        bot: Client,
        giveawayId: string,
        endedBy: string,
        winnerId?: string
    ): Promise<void> {
        const dataService = getGiveawayDataService();
        const giveaway = await dataService.getGiveaway(giveawayId);

        if (!giveaway) {
            throw new Error('Giveaway not found');
        }

        if (giveaway.status !== 'active') {
            throw new Error('Giveaway is not active');
        }

        if (giveaway.entries.length === 0) {
            throw new Error('Cannot end giveaway with no entries');
        }

        if (!winnerId) {
            throw new Error('Winner ID is required');
        }

        // Set winner (this also updates status to 'ended')
        await dataService.setWinner(giveawayId, winnerId);
        await dataService.updateGiveaway(giveawayId, { endedBy });

        // Get updated giveaway
        const updatedGiveaway = await dataService.getGiveaway(giveawayId);
        if (!updatedGiveaway) return;

        // Notify winner
        try {
            const winner = await bot.users.fetch(winnerId);
            const winnerRecord: GiveawayWinner = {
                discordId: winnerId,
                giveawayId: giveawayId,
                wonAt: new Date().toISOString(),
                prizeName: updatedGiveaway.prizeName,
                notified: false,
            };

            const notified = await this.notifyWinner(bot, winnerRecord, updatedGiveaway);
            if (notified) {
                await dataService.markWinnerNotified(giveawayId);
            }

            // Announce to mod channel
            await this.announceWinnerToModChannel(bot, updatedGiveaway, winner);
        } catch (error) {
            console.error(`Error notifying winner for giveaway ${giveawayId}:`, error);
            // Still announce to mod channel even if winner notification fails
            const modChannel = await this.findModChannel(bot, updatedGiveaway.guildId);
            if (modChannel) {
                await modChannel.send({
                    content: `⚠️ Giveaway ended but failed to notify winner <@${winnerId}>. Please notify them manually.`
                });
            }
        }
    }

    /**
     * Cancel a giveaway
     */
    public async cancelGiveaway(giveawayId: string, cancelledBy: string, reason?: string): Promise<void> {
        const dataService = getGiveawayDataService();
        const giveaway = await dataService.getGiveaway(giveawayId);

        if (!giveaway) {
            throw new Error('Giveaway not found');
        }

        if (giveaway.status !== 'active') {
            throw new Error('Giveaway is not active');
        }

        await dataService.updateGiveaway(giveawayId, {
            status: 'cancelled',
            endedAt: new Date().toISOString(),
            endedBy: cancelledBy,
        });
    }

    // ==================== Entry Management ====================

    /**
     * Enter a giveaway (with one-active-entry enforcement)
     */
    public async enterGiveaway(
        bot: Client,
        giveawayId: string,
        user: User
    ): Promise<{ success: boolean; error?: string; previousGiveaway?: string }> {
        const dataService = getGiveawayDataService();

        // Check if user has another active entry
        const existingEntry = await dataService.getUserActiveEntry(user.id);
        let previousGiveaway: string | undefined;

        if (existingEntry && existingEntry.giveawayId !== giveawayId) {
            // Auto-remove from previous giveaway
            await dataService.removeEntry(existingEntry.giveawayId, user.id);
            previousGiveaway = existingEntry.giveaway.title;
        }

        // Add entry to new giveaway
        const entry: GiveawayEntry = {
            discordId: user.id,
            enteredAt: new Date().toISOString(),
            username: user.username,
        };

        const result = await dataService.addEntry(giveawayId, entry);

        if (result.success) {
            // Update user stats
            await dataService.updateUserEntryStats(user.id);

            // Check if entry limit reached
            await this.checkEndConditions(bot, giveawayId);
        }

        return {
            ...result,
            previousGiveaway,
        };
    }

    /**
     * Leave a giveaway
     */
    public async leaveGiveaway(giveawayId: string, discordId: string): Promise<boolean> {
        const dataService = getGiveawayDataService();
        return await dataService.removeEntry(giveawayId, discordId);
    }

    // ==================== Notifications ====================

    /**
     * Notify winner via DM with retry logic
     */
    public async notifyWinner(bot: Client, winner: GiveawayWinner, giveaway: Giveaway): Promise<boolean> {
        try {
            const user = await bot.users.fetch(winner.discordId);

            const dmEmbed = new EmbedBuilder()
                .setColor(0xFFD700) // Gold
                .setTitle('🎉 Congratulations! You Won!')
                .setDescription(`You've won the giveaway for:\n**${giveaway.prizeName}**`)
                .addFields(
                    { name: '🎁 Prize', value: giveaway.prizeName, inline: false },
                    { name: '🏆 Giveaway', value: giveaway.title, inline: false },
                    { name: '📋 Next Steps', value: 'Please contact a moderator in the server to claim your prize.', inline: false },
                    { name: '💬 Moderator Channel', value: `Look for the #${GIVEAWAY_CONFIG.MOD_CHANNEL_NAME} channel or DM a moderator.`, inline: false }
                )
                .setFooter({ text: 'Giveaway System', iconURL: RAPI_BOT_THUMBNAIL_URL })
                .setTimestamp();

            // Retry logic
            for (let attempt = 0; attempt < GIVEAWAY_CONFIG.DM_RETRY_ATTEMPTS; attempt++) {
                try {
                    await user.send({ embeds: [dmEmbed] });
                    console.log(`[Giveaway] Winner ${user.username} notified successfully`);
                    return true;
                } catch (error) {
                    console.error(`[Giveaway] DM attempt ${attempt + 1} failed for ${user.username}:`, error);
                    if (attempt < GIVEAWAY_CONFIG.DM_RETRY_ATTEMPTS - 1) {
                        await new Promise(resolve => setTimeout(resolve, GIVEAWAY_CONFIG.DM_RETRY_DELAY));
                    }
                }
            }

            // All retries failed
            console.error(`[Giveaway] Failed to DM winner ${user.username} after ${GIVEAWAY_CONFIG.DM_RETRY_ATTEMPTS} attempts`);
            return false;
        } catch (error) {
            console.error('[Giveaway] Error in notifyWinner:', error);
            return false;
        }
    }

    /**
     * Announce winner to moderator channel
     */
    public async announceWinnerToModChannel(bot: Client, giveaway: Giveaway, winner: User): Promise<void> {
        const modChannel = await this.findModChannel(bot, giveaway.guildId);
        if (!modChannel) return;

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🎊 Giveaway Winner Selected!')
            .setDescription(`**${giveaway.title}** has ended.`)
            .addFields(
                { name: '🏆 Winner', value: `<@${winner.id}> (${winner.username})`, inline: true },
                { name: '🎁 Prize', value: giveaway.prizeName, inline: true },
                { name: '📊 Total Entries', value: giveaway.entries.length.toString(), inline: true },
                { name: '📋 Next Steps', value: 'Please coordinate with the winner to deliver their prize.', inline: false }
            )
            .setFooter({ text: 'Giveaway System', iconURL: RAPI_BOT_THUMBNAIL_URL })
            .setTimestamp();

        await modChannel.send({ embeds: [embed] });
    }

    /**
     * Announce giveaway start to moderator channel
     */
    public async announceGiveawayStart(bot: Client, giveaway: Giveaway): Promise<void> {
        const modChannel = await this.findModChannel(bot, giveaway.guildId);
        if (!modChannel) return;

        const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('🎁 New Giveaway Created!')
            .setDescription(giveaway.description)
            .addFields(
                { name: 'Title', value: giveaway.title, inline: false },
                { name: 'Prize', value: giveaway.prizeName, inline: false },
                { name: 'Giveaway ID', value: `\`${giveaway.id}\``, inline: false },
                { name: 'End Conditions', value: this.formatEndConditions(giveaway.endConditions), inline: false }
            )
            .setFooter({ text: 'Giveaway System', iconURL: RAPI_BOT_THUMBNAIL_URL })
            .setTimestamp();

        await modChannel.send({ embeds: [embed] });
    }

    // ==================== Channel Management ====================

    /**
     * Find moderator channel by name
     */
    public async findModChannel(bot: Client, guildId: string): Promise<TextChannel | null> {
        try {
            const guild = await bot.guilds.fetch(guildId);
            const channel = guild.channels.cache.find(
                ch => ch.name === GIVEAWAY_CONFIG.MOD_CHANNEL_NAME && ch.isTextBased()
            ) as TextChannel | undefined;

            if (!channel) {
                console.warn(`[Giveaway] Mod channel "${GIVEAWAY_CONFIG.MOD_CHANNEL_NAME}" not found in guild ${guild.name}`);
                return null;
            }

            return channel;
        } catch (error) {
            console.error('[Giveaway] Error finding mod channel:', error);
            return null;
        }
    }

    // ==================== End Condition Checking ====================

    /**
     * Check if any end conditions are met for a giveaway
     */
    public async checkEndConditions(bot: Client, giveawayId: string): Promise<boolean> {
        const dataService = getGiveawayDataService();
        const giveaway = await dataService.getGiveaway(giveawayId);

        if (!giveaway || giveaway.status !== 'active') {
            return false;
        }

        // Check entry count limit
        const entryCountCondition = giveaway.endConditions.find(c => c.type === 'entry_count');
        if (entryCountCondition?.maxEntries && giveaway.entries.length >= entryCountCondition.maxEntries) {
            console.log(`[Giveaway] Entry limit reached for ${giveaway.id}, auto-ending...`);

            // Notify mod channel that giveaway is ready for winner selection
            const modChannel = await this.findModChannel(bot, giveaway.guildId);
            if (modChannel) {
                const embed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle('⚠️ Giveaway Entry Limit Reached!')
                    .setDescription(`The giveaway **${giveaway.title}** has reached its entry limit of ${entryCountCondition.maxEntries}.`)
                    .addFields(
                        { name: 'Giveaway ID', value: `\`${giveaway.id}\``, inline: false },
                        { name: 'Next Step', value: 'Use `/giveaway spin` to generate the Wheel of Names URL, then `/giveaway select-winner` to choose the winner.', inline: false }
                    )
                    .setFooter({ text: 'Giveaway System', iconURL: RAPI_BOT_THUMBNAIL_URL })
                    .setTimestamp();

                await modChannel.send({ embeds: [embed] });
            }

            return true;
        }

        // Check scheduled end time
        const scheduledCondition = giveaway.endConditions.find(c => c.type === 'scheduled');
        if (scheduledCondition?.scheduledEndTime) {
            const endTime = new Date(scheduledCondition.scheduledEndTime);
            if (new Date() >= endTime) {
                console.log(`[Giveaway] Scheduled end time reached for ${giveaway.id}`);

                // Notify mod channel
                const modChannel = await this.findModChannel(bot, giveaway.guildId);
                if (modChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(0xFFA500)
                        .setTitle('⏰ Giveaway Time Limit Reached!')
                        .setDescription(`The giveaway **${giveaway.title}** has reached its scheduled end time.`)
                        .addFields(
                            { name: 'Giveaway ID', value: `\`${giveaway.id}\``, inline: false },
                            { name: 'Total Entries', value: giveaway.entries.length.toString(), inline: true },
                            { name: 'Next Step', value: 'Use `/giveaway spin` to generate the Wheel of Names URL, then `/giveaway select-winner` to choose the winner.', inline: false }
                        )
                        .setFooter({ text: 'Giveaway System', iconURL: RAPI_BOT_THUMBNAIL_URL })
                        .setTimestamp();

                    await modChannel.send({ embeds: [embed] });
                }

                return true;
            }
        }

        return false;
    }

    /**
     * Check and notify about expired giveaways on bot startup
     */
    public async checkAndEndExpiredGiveaways(bot: Client): Promise<number> {
        const dataService = getGiveawayDataService();
        const expiredGiveaways = await dataService.getExpiredScheduledGiveaways();

        for (const giveaway of expiredGiveaways) {
            console.log(`[Giveaway] Found expired giveaway ${giveaway.id}, notifying mods...`);

            const modChannel = await this.findModChannel(bot, giveaway.guildId);
            if (modChannel) {
                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('⏰ Expired Giveaway Detected!')
                    .setDescription(`The giveaway **${giveaway.title}** passed its scheduled end time while the bot was offline.`)
                    .addFields(
                        { name: 'Giveaway ID', value: `\`${giveaway.id}\``, inline: false },
                        { name: 'Total Entries', value: giveaway.entries.length.toString(), inline: true },
                        { name: 'Next Step', value: 'Use `/giveaway spin` to generate the Wheel of Names URL, then `/giveaway select-winner` to choose the winner.', inline: false }
                    )
                    .setFooter({ text: 'Giveaway System', iconURL: RAPI_BOT_THUMBNAIL_URL })
                    .setTimestamp();

                await modChannel.send({ embeds: [embed] });
            }
        }

        return expiredGiveaways.length;
    }

    // ==================== Helper Methods ====================

    /**
     * Format end conditions for display
     */
    private formatEndConditions(conditions: EndCondition[]): string {
        const formatted = conditions.map(c => {
            if (c.type === 'manual') return '🔧 Manual end';
            if (c.type === 'scheduled') return `⏰ Ends at <t:${Math.floor(new Date(c.scheduledEndTime!).getTime() / 1000)}:F>`;
            if (c.type === 'entry_count') return `👥 Max ${c.maxEntries} entries`;
            return 'Unknown';
        });

        return formatted.join('\n');
    }
}

/**
 * Get the singleton instance of GiveawayManagementService
 */
export const getGiveawayManagementService = (): GiveawayManagementService =>
    GiveawayManagementService.getInstance();
