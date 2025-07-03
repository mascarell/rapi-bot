import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { getUptimeService } from '../services/uptimeService';
import { ChatCommandRateLimiter } from '../utils/chatCommandRateLimiter';

/**
 * Command export for Discord.js
 * Shows bot uptime and system information
 */
module.exports = {
    data: new SlashCommandBuilder()
        .setName('age')
        .setDescription('Show how long the bot has been running'),
    
    async execute(interaction: ChatInputCommandInteraction) {
        try {
            const uptimeService = getUptimeService();
            const deploymentInfo = uptimeService.getDeploymentInfo();
            const serverCount = interaction.client.guilds.cache.size;
            const guildId = interaction.guildId;
            const serverCommands = guildId ? ChatCommandRateLimiter.getGuildCommandCount(guildId) : 0;
            const globalCommands = ChatCommandRateLimiter.getGlobalCommandCount();
            
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('System Uptime')
                .setDescription(`I have been running for ${deploymentInfo.formattedUptime}!`)
                .addFields(
                    {
                        name: '📅 Started At',
                        value: new Date(deploymentInfo.startTime).toLocaleString(),
                        inline: false
                    },
                    {
                        name: '⚡ Commands Executed (This Server)',
                        value: serverCommands.toLocaleString(),
                        inline: true
                    },
                    {
                        name: '🌐 Servers Connected',
                        value: serverCount.toString(),
                        inline: true
                    },
                    {
                        name: '🌍 Commands Executed (Global)',
                        value: globalCommands.toLocaleString(),
                        inline: true
                    }
                )
                .setFooter({ 
                    text: 'Stats are for this server unless otherwise specified. Stay safe on the surface, Commander!', 
                    iconURL: interaction.client.user?.displayAvatarURL() 
                })
                .setTimestamp();

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
            
        } catch (error) {
            console.error('Error in age command:', error);
            await interaction.reply({
                content: 'Commander, there was an error getting the uptime information.',
                ephemeral: true
            });
        }
    },
}; 