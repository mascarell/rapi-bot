import {
    SlashCommandBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits
} from 'discord.js';
import { SlashCommand } from '../utils/interfaces/Command.interface';
import { ChatCommandRateLimiter } from '../utils/chatCommandRateLimiter';

// Asset URLs (import from discord.ts or create a shared config)
const RAPI_BOT_THUMBNAIL_URL = process.env.CDN_DOMAIN_URL + '/assets/rapi-bot-thumbnail.jpg';

/**
 * Command export for Discord.js
 * Handles rate limit checking and admin management
 */
module.exports = {
    data: new SlashCommandBuilder()
        .setName('spam')
        .setDescription('Check your spam limit status or manage spam limits (admin only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('check')
                .setDescription('Check your current rate limit status'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('View rate limit statistics (Mods/King only)'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Reset rate limit for a user (Mods/King only)')
                .addUserOption((option: any) =>
                    option.setName('user')
                        .setDescription('User to reset rate limit for')
                        .setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const subcommand = interaction.options.getSubcommand();
            const guildId = interaction.guildId!;
            const userId = interaction.user.id;

            switch (subcommand) {
                case 'check': {
                    const remainingCommands = ChatCommandRateLimiter.getRemainingCommands(guildId, userId);
                    const remainingTime = ChatCommandRateLimiter.getRemainingTime(guildId, userId);
                    
                    const embed = new EmbedBuilder()
                        .setAuthor({ 
                            name: 'Rapi BOT', 
                            iconURL: RAPI_BOT_THUMBNAIL_URL 
                        })
                        .setTitle('Your Rate Limit Status')
                        .setColor(remainingCommands > 0 ? 0x2ECC71 : 0xE74C3C)
                        .addFields(
                            { name: '🎯 Remaining Commands', value: `${remainingCommands}/3`, inline: true }
                        )
                        .setTimestamp()
                        .setFooter({   
                            text: 'Rate limiting helps keep the chat clean!',
                            iconURL: RAPI_BOT_THUMBNAIL_URL
                        });

                    if (remainingTime > 0) {
                        const remainingSeconds = Math.ceil(remainingTime / 1000);
                        embed.addFields({ name: '⏰ Time Until Reset', value: `${remainingSeconds} seconds`, inline: true });
                    } else {
                        embed.addFields({ name: '✅ Status', value: 'Rate limit window reset', inline: true });
                    }
                    
                    await interaction.followUp({
                        embeds: [embed],
                        ephemeral: true
                    });
                    break;
                }

                case 'stats': {
                    // Check for Mods or King role
                    const member = interaction.member;
                    if (!member || typeof member === 'string') {
                        await interaction.followUp({
                            content: "Commander, you don't have permission to use this command.",
                            ephemeral: true
                        });
                        return;
                    }

                    const hasModsRole = 'cache' in member.roles && member.roles.cache.some((role: any) => 
                        role.name.toLowerCase() === 'mods' || role.name.toLowerCase() === 'king'
                    );

                    if (!hasModsRole) {
                        await interaction.followUp({
                            content: "Commander, you need the Mods or King role to view statistics.",
                            ephemeral: true
                        });
                        return;
                    }

                    const stats = ChatCommandRateLimiter.getUsageStats(guildId);
                    
                    const embed = new EmbedBuilder()
                        .setAuthor({ 
                            name: 'Rapi BOT', 
                            iconURL: RAPI_BOT_THUMBNAIL_URL 
                        })
                        .setTitle('Rate Limit Statistics')
                        .setColor(0x3498DB)
                        .addFields(
                            { name: '📊 Total Users', value: `${stats.totalUsers}`, inline: true },
                            { name: '🎯 Active Users', value: `${stats.activeUsers}`, inline: true },
                            { name: '📈 Total Usage', value: `${stats.totalUsage}`, inline: true }
                        )
                        .setTimestamp()
                        .setFooter({   
                            text: 'Rate limiting helps keep the chat clean!',
                            iconURL: RAPI_BOT_THUMBNAIL_URL
                        });

                    // Add top violators if any exist
                    if (stats.topViolators.length > 0) {
                        const violatorList = stats.topViolators
                            .map((violator, index) => `${index + 1}. <@${violator.userId}> - ${violator.attempts} attempts`)
                            .join('\n');
                        embed.addFields({
                            name: '🚨 Top Violators (5+ attempts)',
                            value: violatorList,
                            inline: false
                        });
                    }

                    await interaction.followUp({
                        embeds: [embed],
                        ephemeral: true
                    });
                    break;
                }

                case 'reset': {
                    // Check for Mods or King role
                    const member = interaction.member;
                    if (!member || typeof member === 'string') {
                        await interaction.followUp({
                            content: "Commander, you don't have permission to use this command.",
                            ephemeral: true
                        });
                        return;
                    }

                    const hasModsRole = 'cache' in member.roles && member.roles.cache.some((role: any) => 
                        role.name.toLowerCase() === 'mods' || role.name.toLowerCase() === 'king'
                    );

                    if (!hasModsRole) {
                        await interaction.followUp({
                            content: "Commander, you need the Mods or King role to reset rate limits.",
                            ephemeral: true
                        });
                        return;
                    }

                    const targetUser = interaction.options.getUser('user');
                    if (!targetUser) {
                        await interaction.followUp({
                            content: "Commander, please specify a user to reset.",
                            ephemeral: true
                        });
                        return;
                    }

                    ChatCommandRateLimiter.resetUser(guildId, targetUser.id);
                    await interaction.followUp({
                        content: `Rate limit reset for user ${targetUser.toString()}`,
                        ephemeral: true
                    });
                    break;
                }
            }

        } catch (error) {
            console.error('Rate limit command error:', error);
            await interaction.followUp({
                content: 'Commander, there was an error with the rate limit system...',
                ephemeral: true
            });
        }
    }
} as SlashCommand; 