import {
    SlashCommandBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    Role,
} from 'discord.js';
import { SlashCommand } from '../utils/interfaces/Command.interface.js';
import { ChatCommandRateLimiter, CHAT_COMMAND_RATE_LIMIT } from '../utils/chatCommandRateLimiter.js';
import { getAssetUrls } from '../config/assets.js';
import { replyEphemeral, replyWithEmbed } from '../utils/interactionHelpers.js';
import { handleCommandError } from '../utils/commandErrorHandler.js';
import { checkModPermission } from '../utils/permissionHelpers.js';

const ASSET_URLS = getAssetUrls();

/**
 * Command export for Discord.js
 * Handles rate limit checking and admin management
 */
export default {
    data: new SlashCommandBuilder()
        .setName('spam')
        .setDescription('Manage and monitor chat command spam protection')
        .addSubcommand(subcommand =>
            subcommand
                .setName('check')
                .setDescription('Check your current rate limit status')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('View detailed spam statistics (Admin only)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Reset rate limit for a user (Admin only)')
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
                    await this.handleStats(interaction, guild);
                    break;
                case 'reset':
                    await this.handleReset(interaction, guild);
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
    },

    /**
     * Handles the 'stats' subcommand - displays comprehensive administrative statistics
     * 
     * @param interaction - The slash command interaction
     * @param guild - The Discord guild
     */
    async handleStats(interaction: ChatInputCommandInteraction, guild: any) {
        // Check for admin permissions
        if (!(await checkModPermission(interaction))) {
            return;
        }

        const stats = ChatCommandRateLimiter.getUsageStats(guild.id);
        
        // Calculate additional metrics
        const avgUsagePerUser = stats.totalUsers > 0 ? (stats.totalUsage / stats.totalUsers).toFixed(1) : '0';
        const violatorPercentage = stats.totalUsers > 0 ? ((stats.topViolators.length / stats.totalUsers) * 100).toFixed(1) : '0';
        
        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('📈 Spam Protection Statistics (Moderator Only)')
            .setDescription(`**Comprehensive analysis for ${guild.name}**\n\n*Moderator Only: These stats are visible to users with the 'mods' role.*`)
            .addFields(
                {
                    name: '👥 User Activity',
                    value: `• **Total Users:** ${stats.totalUsers}\n• **Active Users:** ${stats.activeUsers}\n• **Total Commands:** ${stats.totalUsage}\n• **Avg/User:** ${avgUsagePerUser}`,
                    inline: true
                },
                {
                    name: '⚠️ Violation Tracking',
                    value: `• **Violators:** ${stats.topViolators.length}\n• **Violation Rate:** ${violatorPercentage}%\n• **Threshold:** 5+ attempts`,
                    inline: true
                },
                {
                    name: '⚙️ System Health',
                    value: `• **Rate Limit:** 3/hour\n• **Window:** 1 hour\n• **Cleanup:** 2 hours`,
                    inline: true
                }
            )
            .setTimestamp()
            .setFooter({ 
                text: 'Spam Protection System v2.0', 
                iconURL: interaction.client.user?.displayAvatarURL() 
            });

        // Add top violators if any exist
        if (stats.topViolators.length > 0) {
            const violatorList = stats.topViolators
                .map((v, index) => `${index + 1}. <@${v.userId}> - **${v.attempts}** attempts`)
                .join('\n');
            
            embed.addFields({
                name: '🚨 Top Violators',
                value: violatorList,
                inline: false
            });
        }

        // Add most spammed commands if any exist
        if (stats.mostSpammedCommands.length > 0) {
            const commandList = stats.mostSpammedCommands
                .map((cmd, index) => `${index + 1}. **${cmd.command}** - ${cmd.count} uses`)
                .join('\n');
            
            embed.addFields({
                name: '🔥 Most Spammed Commands',
                value: commandList,
                inline: false
            });
        }

        // Add system recommendations
        const recommendations = this.generateRecommendations(stats);
        if (recommendations.length > 0) {
            embed.addFields({
                name: '💡 System Recommendations',
                value: recommendations.join('\n'),
                inline: false
            });
        }

        await replyWithEmbed(interaction, embed, true);
    },

    /**
     * Handles the 'reset' subcommand - resets rate limit for a specific user
     * 
     * @param interaction - The slash command interaction
     * @param guild - The Discord guild
     */
    async handleReset(interaction: ChatInputCommandInteraction, guild: any) {
        // Check for admin permissions
        if (!(await checkModPermission(interaction))) {
            return;
        }

        const targetUser = interaction.options.getUser('user', true);
        if (!targetUser) {
            await replyEphemeral(interaction, 'Please specify a valid user to reset.');
            return;
        }

        ChatCommandRateLimiter.resetUser(guild.id, targetUser.id);
        
        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('✅ Rate Limit Reset')
            .setDescription(`**Rate limit has been reset for ${targetUser}**`)
            .addFields(
                {
                    name: '🔄 Reset Details',
                    value: `• **User:** ${targetUser.tag}\n• **Guild:** ${guild.name}\n• **Reset By:** ${interaction.user.tag}`,
                    inline: false
                }
            )
            .setTimestamp()
            .setFooter({ 
                text: 'Rate limit reset successful', 
                iconURL: interaction.client.user?.displayAvatarURL() 
            });

        await replyWithEmbed(interaction, embed, true);
    },

    /**
     * Generates system recommendations based on current statistics
     * 
     * @param stats - Current usage statistics
     * @returns Array of recommendation strings
     */
    generateRecommendations(stats: any): string[] {
        const recommendations: string[] = [];
        
        // High violation rate recommendation
        if (stats.totalUsers > 0 && (stats.topViolators.length / stats.totalUsers) > 0.1) {
            recommendations.push('⚠️ **High violation rate detected** - Consider adjusting rate limits');
        }
        
        // Low activity recommendation
        if (stats.activeUsers < 3) {
            recommendations.push('📉 **Low activity** - System is underutilized');
        }
        
        // High usage recommendation
        if (stats.totalUsage > 100) {
            recommendations.push('📊 **High command usage** - System is working effectively');
        }
        
        // Command-specific recommendations
        if (stats.mostSpammedCommands.length > 0) {
            const topCommand = stats.mostSpammedCommands[0];
            if (topCommand.count > 20) {
                recommendations.push(`🎯 **${topCommand.command}** is heavily used - Consider optimization`);
            }
        }
        
        return recommendations;
    }
}; 