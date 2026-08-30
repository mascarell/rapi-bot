import { Client, TextChannel, User } from 'discord.js';
import { getGiveawayDataService } from './giveawayDataService.js';
import { Giveaway, EndCondition } from '../utils/interfaces/Giveaway.interface.js';
import { GIVEAWAY_CONFIG } from '../utils/data/giveawayConfig.js';
import { logger } from '../utils/logger.js';
import { successEmbed, warningEmbed, errorEmbed, infoEmbed, EmbedColors, customEmbed } from '../utils/embedTemplates.js';
import { getAssetUrls } from '../config/assets.js';

export class GiveawayManagementService {
    private static instance: GiveawayManagementService;

    private constructor() {}

    public static getInstance(): GiveawayManagementService {
        if (!GiveawayManagementService.instance) {
            GiveawayManagementService.instance = new GiveawayManagementService();
        }
        return GiveawayManagementService.instance;
    }

    // ==================== Lifecycle ====================

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

        const activeGiveaways = await dataService.getActiveGiveaways(guildId);
        if (activeGiveaways.length >= GIVEAWAY_CONFIG.MAX_ACTIVE_GIVEAWAYS_PER_GUILD) {
            throw new Error(`Maximum of ${GIVEAWAY_CONFIG.MAX_ACTIVE_GIVEAWAYS_PER_GUILD} active giveaways reached`);
        }

        const modChannel = this.findModChannel(bot, guildId);
        if (!modChannel) {
            throw new Error(`Moderator channel "${GIVEAWAY_CONFIG.MOD_CHANNEL_NAME}" not found`);
        }

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

        await this.announceToModChannel(bot, guildId,
            infoEmbed('New Giveaway Created!', config.description)
                .addFields(
                    { name: 'Title', value: giveaway.title, inline: false },
                    { name: 'Prize', value: giveaway.prizeName, inline: false },
                    { name: 'Giveaway ID', value: `\`${giveaway.id}\``, inline: false },
                    { name: 'End Conditions', value: this.formatEndConditions(giveaway.endConditions), inline: false }
                )
        );

        return giveaway;
    }

    public async endGiveaway(
        bot: Client,
        giveawayId: string,
        endedBy: string,
        winnerId: string
    ): Promise<void> {
        const dataService = getGiveawayDataService();
        const giveaway = await dataService.getGiveaway(giveawayId);

        if (!giveaway) throw new Error('Giveaway not found');
        if (giveaway.status !== 'active') throw new Error('Giveaway is not active');
        if (giveaway.entries.length === 0) throw new Error('Cannot end giveaway with no entries');

        await dataService.setWinner(giveawayId, winnerId, endedBy);

        try {
            const winner = await bot.users.fetch(winnerId);
            const notified = await this.notifyWinner(winner, giveaway);
            if (notified) await dataService.markWinnerNotified(giveawayId);

            await this.announceToModChannel(bot, giveaway.guildId,
                successEmbed('Giveaway Winner Selected!', `**${giveaway.title}** has ended.`)
                    .addFields(
                        { name: 'Winner', value: `<@${winner.id}> (${winner.username})`, inline: true },
                        { name: 'Prize', value: giveaway.prizeName, inline: true },
                        { name: 'Total Entries', value: giveaway.entries.length.toString(), inline: true },
                    )
            );
        } catch (error) {
            logger.error`[Giveaway] Error notifying winner for ${giveawayId}: ${error}`;
            await this.announceToModChannel(bot, giveaway.guildId,
                warningEmbed('Winner Notification Failed',
                    `Giveaway ended but failed to notify <@${winnerId}>. Please notify them manually.`)
            );
        }
    }

    public async cancelGiveaway(
        bot: Client,
        giveawayId: string,
        cancelledBy: string,
        reason?: string
    ): Promise<Giveaway> {
        const dataService = getGiveawayDataService();
        const giveaway = await dataService.getGiveaway(giveawayId);

        if (!giveaway) throw new Error('Giveaway not found');
        if (giveaway.status !== 'active') throw new Error('Giveaway is not active');

        await dataService.updateGiveaway(giveawayId, {
            status: 'cancelled',
            endedAt: new Date().toISOString(),
            endedBy: cancelledBy,
        });

        const embed = errorEmbed('Giveaway Cancelled',
            `**${giveaway.title}** has been cancelled by <@${cancelledBy}>`)
            .addFields(
                { name: 'Prize', value: giveaway.prizeName, inline: true },
                { name: 'Entries', value: giveaway.entries.length.toString(), inline: true },
            );
        if (reason) embed.addFields({ name: 'Reason', value: reason, inline: false });

        await this.announceToModChannel(bot, giveaway.guildId, embed);
        return giveaway;
    }

    // ==================== End Condition Checking ====================

    public async checkEndConditions(bot: Client, giveawayId: string): Promise<boolean> {
        const dataService = getGiveawayDataService();
        const giveaway = await dataService.getGiveaway(giveawayId);
        if (!giveaway || giveaway.status !== 'active') return false;

        const entryCondition = giveaway.endConditions.find(c => c.type === 'entry_count');
        if (entryCondition?.maxEntries && giveaway.entries.length >= entryCondition.maxEntries) {
            logger.debug`[Giveaway] Entry limit reached for ${giveaway.id}`;
            await this.announceToModChannel(bot, giveaway.guildId,
                warningEmbed('Giveaway Entry Limit Reached!',
                    `**${giveaway.title}** reached its entry limit of ${entryCondition.maxEntries}.`)
                    .addFields(
                        { name: 'Giveaway ID', value: `\`${giveaway.id}\``, inline: false },
                        { name: 'Next Step', value: 'Use `/giveaway spin` then `/giveaway select-winner`', inline: false },
                    )
            );
            return true;
        }

        const scheduledCondition = giveaway.endConditions.find(c => c.type === 'scheduled');
        if (scheduledCondition?.scheduledEndTime && new Date() >= new Date(scheduledCondition.scheduledEndTime)) {
            logger.debug`[Giveaway] Scheduled end time reached for ${giveaway.id}`;
            await this.announceToModChannel(bot, giveaway.guildId,
                warningEmbed('Giveaway Time Limit Reached!',
                    `**${giveaway.title}** reached its scheduled end time.`)
                    .addFields(
                        { name: 'Giveaway ID', value: `\`${giveaway.id}\``, inline: false },
                        { name: 'Total Entries', value: giveaway.entries.length.toString(), inline: true },
                        { name: 'Next Step', value: 'Use `/giveaway spin` then `/giveaway select-winner`', inline: false },
                    )
            );
            return true;
        }

        return false;
    }

    public async checkAndEndExpiredGiveaways(bot: Client): Promise<number> {
        const dataService = getGiveawayDataService();
        const expired = await dataService.getExpiredScheduledGiveaways();

        for (const giveaway of expired) {
            logger.debug`[Giveaway] Found expired giveaway ${giveaway.id}`;
            await this.announceToModChannel(bot, giveaway.guildId,
                errorEmbed('Expired Giveaway Detected!',
                    `**${giveaway.title}** passed its scheduled end time while the bot was offline.`)
                    .addFields(
                        { name: 'Giveaway ID', value: `\`${giveaway.id}\``, inline: false },
                        { name: 'Total Entries', value: giveaway.entries.length.toString(), inline: true },
                        { name: 'Next Step', value: 'Use `/giveaway spin` then `/giveaway select-winner`', inline: false },
                    )
            );
        }

        return expired.length;
    }

    // ==================== Notifications ====================

    private async notifyWinner(user: User, giveaway: Giveaway): Promise<boolean> {
        const assetUrls = getAssetUrls();

        const embed = customEmbed('Congratulations! You Won!', EmbedColors.GOLD,
            `You've won the giveaway for:\n**${giveaway.prizeName}**`)
            .addFields(
                { name: 'Prize', value: giveaway.prizeName, inline: false },
                { name: 'Giveaway', value: giveaway.title, inline: false },
                { name: 'Next Steps', value: 'Please contact a moderator in the server to claim your prize.', inline: false },
            )
            .setFooter({ text: 'Giveaway System', iconURL: assetUrls.rapiBot.thumbnail });

        for (let attempt = 0; attempt < GIVEAWAY_CONFIG.DM_RETRY_ATTEMPTS; attempt++) {
            try {
                await user.send({ embeds: [embed] });
                logger.debug`[Giveaway] Winner ${user.username} notified`;
                return true;
            } catch (error) {
                logger.warning`[Giveaway] DM attempt ${attempt + 1} failed for ${user.username}: ${error}`;
                if (attempt < GIVEAWAY_CONFIG.DM_RETRY_ATTEMPTS - 1) {
                    await new Promise(resolve => setTimeout(resolve, GIVEAWAY_CONFIG.DM_RETRY_DELAY));
                }
            }
        }

        logger.error`[Giveaway] Failed to DM winner ${user.username} after ${GIVEAWAY_CONFIG.DM_RETRY_ATTEMPTS} attempts`;
        return false;
    }

    // ==================== Helpers ====================

    public findModChannel(bot: Client, guildId: string): TextChannel | null {
        const guild = bot.guilds.cache.get(guildId);
        if (!guild) return null;

        return guild.channels.cache.find(
            ch => ch.name === GIVEAWAY_CONFIG.MOD_CHANNEL_NAME && ch.isTextBased()
        ) as TextChannel | null;
    }

    private async announceToModChannel(
        bot: Client,
        guildId: string,
        embed: ReturnType<typeof infoEmbed>
    ): Promise<void> {
        const modChannel = this.findModChannel(bot, guildId);
        if (!modChannel) return;

        try {
            await modChannel.send({ embeds: [embed] });
        } catch (error) {
            logger.error`[Giveaway] Failed to send to mod channel: ${error}`;
        }
    }

    private formatEndConditions(conditions: EndCondition[]): string {
        return conditions.map(c => {
            if (c.type === 'manual') return 'Manual end';
            if (c.type === 'scheduled') return `Ends at <t:${Math.floor(new Date(c.scheduledEndTime!).getTime() / 1000)}:F>`;
            if (c.type === 'entry_count') return `Max ${c.maxEntries} entries`;
            return 'Unknown';
        }).join('\n');
    }

    /** @internal Test helper */
    public static _testResetInstance(): void {
        GiveawayManagementService.instance = undefined as any;
    }
}

export const getGiveawayManagementService = (): GiveawayManagementService =>
    GiveawayManagementService.getInstance();
