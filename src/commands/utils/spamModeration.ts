import { ChatInputCommandInteraction, EmbedBuilder, Guild } from 'discord.js';
import { ChatCommandRateLimiter, CHAT_COMMAND_RATE_LIMIT } from '../../utils/chatCommandRateLimiter.js';
import { replyEphemeral, replyWithEmbed } from '../../utils/interactionHelpers.js';

/**
 * Spam protection moderator tools, served by `/mod spam`. The /mod gate has
 * already checked the caller, so nothing here re-checks permissions.
 */

/** Shows spam protection statistics for the server (ephemeral). */
export async function handleSpamStats(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const stats = ChatCommandRateLimiter.getUsageStats(guild.id);
    
    // Calculate additional metrics
    const avgUsagePerUser = stats.totalUsers > 0 ? (stats.totalUsage / stats.totalUsers).toFixed(1) : '0';
    const violatorPercentage = stats.totalUsers > 0 ? ((stats.topViolators.length / stats.totalUsers) * 100).toFixed(1) : '0';
    
    const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('📈 Spam Protection Statistics (Moderator Only)')
        .setDescription(`**Comprehensive analysis for ${guild.name}**\n\n*Moderator Only: These stats are visible to moderators.*`)
        .addFields(
            {
                name: '👥 User Activity',
                value: `• **Total Users:** ${stats.totalUsers}\n• **Active Users:** ${stats.activeUsers}\n• **Total Commands:** ${stats.totalUsage}\n• **Avg/User:** ${avgUsagePerUser}`,
                inline: true
            },
            {
                name: '⚠️ Violation Tracking',
                value: `• **Violators:** ${stats.topViolators.length}\n• **Violation Rate:** ${violatorPercentage}%\n• **Threshold:** ${CHAT_COMMAND_RATE_LIMIT.violatorThreshold}+ attempts`,
                inline: true
            },
            {
                name: '⚙️ System Health',
                value: `• **Rate Limit:** ${CHAT_COMMAND_RATE_LIMIT.maxCommands}/hour\n• **Window:** 1 hour\n• **Cleanup:** ${CHAT_COMMAND_RATE_LIMIT.cleanupIntervalMs / 3_600_000} hours`,
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
    const recommendations = generateRecommendations(stats);
    if (recommendations.length > 0) {
        embed.addFields({
            name: '💡 System Recommendations',
            value: recommendations.join('\n'),
            inline: false
        });
    }

    await replyWithEmbed(interaction, embed, true);
}

/** Resets the chat command rate limit for one member (ephemeral). */
export async function handleSpamReset(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
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
}

/**
 * Generates system recommendations based on current statistics
 *
 * @param stats - Current usage statistics
 * @returns Array of recommendation strings
 */
export function generateRecommendations(stats: any): string[] {
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
