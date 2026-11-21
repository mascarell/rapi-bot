import {
    SlashCommandBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
} from 'discord.js';
import { SlashCommand } from '../utils/interfaces/Command.interface.js';
import { ChatCommandRateLimiter, CHAT_COMMAND_RATE_LIMIT } from '../utils/chatCommandRateLimiter.js';
import { getAssetUrls } from '../config/assets.js';
import { replyEphemeral, replyWithEmbed } from '../utils/interactionHelpers.js';
import { handleCommandError } from '../utils/commandErrorHandler.js';

const ASSET_URLS = getAssetUrls();

/**
 * Command export for Discord.js
 * Members check their own rate limit; moderator tools moved to /mod spam
 */
export default {
    data: new SlashCommandBuilder()
        .setName('spam')
        .setDescription('Check your chat command limit')
        .addSubcommand(subcommand =>
            subcommand
                .setName('check')
                .setDescription('Check your current rate limit status')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Moved to /mod spam stats')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Moved to /mod spam reset')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('User to reset rate limit for')
                        .setRequired(true)
                )
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();
        const guild = interaction.guild;
        
        if (!guild) {
            await replyEphemeral(interaction, 'This command can only be used in a server.');
            return;
        }

        try {
            switch (subcommand) {
                case 'check':
                    await this.handleCheck(interaction, guild);
                    break;
                case 'stats':
                    await replyEphemeral(interaction, 'This moved to `/mod spam stats`.');
                    break;
                case 'reset':
                    await replyEphemeral(interaction, 'This moved to `/mod spam reset`.');
                    break;
                default:
                    await replyEphemeral(interaction, 'Unknown subcommand.');
            }
        } catch (error) {
            await handleCommandError(interaction, error, 'spam');
        }
    },

    /**
     * Handles the 'check' subcommand - displays user's current rate limit status
     * 
     * @param interaction - The slash command interaction
     * @param guild - The Discord guild
     */
    async handleCheck(interaction: ChatInputCommandInteraction, guild: any) {
        const userId = interaction.user.id;
        const remainingCommands = ChatCommandRateLimiter.getRemainingCommands(guild.id, userId);
        const remainingTime = ChatCommandRateLimiter.getRemainingTime(guild.id, userId);
        const stats = ChatCommandRateLimiter.getUsageStats(guild.id);
        const hourKey = (new Date()).getUTCFullYear() + '-' + (new Date()).getUTCMonth() + '-' + (new Date()).getUTCDate() + '-' + (new Date()).getUTCHours();
        const usageObj = (ChatCommandRateLimiter as any).usage?.[guild.id] || {};
        const userUsage = usageObj[userId]?.hourKey === hourKey ? usageObj[userId].count : 0;
        // Rank: sort all users by count descending, find index of this user
        const allCounts = Object.values(usageObj).filter((u: any) => u.hourKey === hourKey).map((u: any) => u.count);
        const sorted = [...allCounts].sort((a, b) => b - a);
        const userRank = userUsage > 0 ? (sorted.indexOf(userUsage) + 1) : stats.totalUsers;
        // Get most used command
        const mostUsedCommand = stats.mostSpammedCommands.length > 0 ? stats.mostSpammedCommands[0] : null;
        // Calculate server average
        const serverAverage = stats.totalUsers > 0 ? (stats.totalUsage / stats.totalUsers).toFixed(1) : '0';
        const embed = new EmbedBuilder()
            .setColor(remainingCommands > 0 ? 0x00ff00 : 0xff0000)
            .setTitle('🛡️ Spam Status')
            .setDescription(`**Commander ${interaction.user}**, here's your current status:`)
            .addFields(
                { 
                    name: '📊 Commands Remaining', 
                    value: `${remainingCommands}/${CHAT_COMMAND_RATE_LIMIT.maxCommands}`, 
                    inline: true 
                },
                { 
                    name: '⏰ Time Until Reset', 
                    value: remainingTime > 0 ? `${Math.ceil(remainingTime / 1000)} seconds` : 'Ready to use!', 
                    inline: true 
                },
                {
                    name: '🔥 Most Used Chat Command',
                    value: mostUsedCommand ? `"${mostUsedCommand.command}" (${mostUsedCommand.count} times)` : 'None yet',
                    inline: true
                },
                {
                    name: '🏆 Your Usage Rank',
                    value: `#${userRank} of ${stats.totalUsers} users`,
                    inline: true
                },
                {
                    name: '📈 Server Average',
                    value: `${serverAverage} commands/user`,
                    inline: true
                }
            )
            .setTimestamp()
            .setFooter({ 
                text: 'Stay safe on the surface, Commander!', 
                iconURL: interaction.client.user?.displayAvatarURL() 
            });
        await replyWithEmbed(interaction, embed, true);
    }
};
