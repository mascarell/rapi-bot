import {
    SlashCommandBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    Role
} from 'discord.js';
import { SlashCommand } from '../utils/interfaces/Command.interface';
import { ChatCommandRateLimiter, CHAT_COMMAND_RATE_LIMIT } from '../utils/chatCommandRateLimiter';

// Asset URLs (import from discord.ts or create a shared config)
const RAPI_BOT_THUMBNAIL_URL = process.env.CDN_DOMAIN_URL + '/assets/rapi-bot-thumbnail.jpg';

/**
 * Spam Management Command
 * 
 * This command provides comprehensive spam control and monitoring functionality for chat commands.
 * It allows users to check their rate limit status and administrators to view detailed statistics
 * about command usage patterns and violators.
 * 
 * Features:
 * - Personal rate limit status checking
 * - Administrative statistics with detailed metrics
 * - Top violator tracking
 * - Most spammed command analysis
 * - System health monitoring
 * 
 * Rate Limit Configuration:
 * - 3 commands per hour per user per guild
 * - Violators tracked after 5+ attempts
 * - Automatic cleanup every 2 hours
 * 
 * @author Rapi Bot Development Team
 * @version 2.0.0
 * @since 2024-01-01
 */
const command = {
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
                .addStringOption(option =>
                    option
                        .setName('guild')
                        .setDescription('Guild ID to check stats for (defaults to current guild)')
                        .setRequired(false)
                )
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
            await interaction.reply({ 
                content: 'This command can only be used in a server.', 
                ephemeral: true 
            });
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
                    await interaction.reply({ 
                        content: 'Unknown subcommand.', 
                        ephemeral: true 
                    });
            }
        } catch (error) {
            console.error('Error in spam command:', error);
            await interaction.reply({ 
                content: 'An error occurred while processing your request.', 
                ephemeral: true 
            });
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
        
        const embed = new EmbedBuilder()
            .setColor(remainingCommands > 0 ? 0x00ff00 : 0xff0000)
            .setTitle('🛡️ Rate Limit Status')
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
                    name: 'ℹ️ Rate Limit Info',
                    value: `• **${CHAT_COMMAND_RATE_LIMIT.maxCommands} commands per hour**\n• Resets automatically\n• Per-guild tracking`,
                    inline: false
                }
            )
            .setTimestamp()
            .setFooter({ 
                text: 'Stay safe on the surface, Commander!', 
                iconURL: interaction.client.user?.displayAvatarURL() 
            });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    /**
     * Handles the 'stats' subcommand - displays comprehensive administrative statistics
     * 
     * @param interaction - The slash command interaction
     * @param guild - The Discord guild
     */
    async handleStats(interaction: ChatInputCommandInteraction, guild: any) {
        // Check for admin permissions
        const member = await guild.members.fetch(interaction.user.id);
        const hasAdminRole = member.roles.cache.some((role: Role) => 
            role.name.toLowerCase() === 'mods' || role.name.toLowerCase() === 'king'
        );
        
        if (!hasAdminRole && !member.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ 
                content: 'Commander, you need administrator permissions or the "mods"/"king" role to view statistics.', 
                ephemeral: true 
            });
            return;
        }

        const targetGuildId = interaction.options.getString('guild') || guild.id;
        const stats = ChatCommandRateLimiter.getUsageStats(targetGuildId);
        
        // Calculate additional metrics
        const avgUsagePerUser = stats.totalUsers > 0 ? (stats.totalUsage / stats.totalUsers).toFixed(1) : '0';
        const violatorPercentage = stats.totalUsers > 0 ? ((stats.topViolators.length / stats.totalUsers) * 100).toFixed(1) : '0';
        
        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('📈 Spam Protection Statistics')
            .setDescription(`**Comprehensive analysis for ${guild.name}**`)
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

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    /**
     * Handles the 'reset' subcommand - resets rate limit for a specific user
     * 
     * @param interaction - The slash command interaction
     * @param guild - The Discord guild
     */
    async handleReset(interaction: ChatInputCommandInteraction, guild: any) {
        // Check for admin permissions
        const member = await guild.members.fetch(interaction.user.id);
        const hasAdminRole = member.roles.cache.some((role: Role) => 
            role.name.toLowerCase() === 'mods' || role.name.toLowerCase() === 'king'
        );
        
        if (!hasAdminRole && !member.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ 
                content: 'Commander, you need administrator permissions or the "mods"/"king" role to reset rate limits.', 
                ephemeral: true 
            });
            return;
        }

        const targetUser = interaction.options.getUser('user');
        if (!targetUser) {
            await interaction.reply({ 
                content: 'Please specify a valid user to reset.', 
                ephemeral: true 
            });
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

        await interaction.reply({ embeds: [embed], ephemeral: true });
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

export default command; 