import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { getUptimeService } from '../services/uptimeService';

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
            
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('🕒 Bot Uptime')
                .setDescription(`**I have been running for ${deploymentInfo.formattedUptime}!**`)
                .addFields(
                    {
                        name: '📅 Started At',
                        value: new Date(deploymentInfo.startTime).toLocaleString(),
                        inline: true
                    },
                    {
                        name: '🚀 Session ID',
                        value: deploymentInfo.deploymentId,
                        inline: true
                    }
                )
                .setTimestamp()
                .setFooter({ 
                    text: 'Stay safe on the surface, Commander!', 
                    iconURL: interaction.client.user?.displayAvatarURL() 
                });

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
            
        } catch (error) {
            console.error('Error in uptime command:', error);
            await interaction.reply({
                content: 'Commander, there was an error getting the uptime information.',
                ephemeral: true
            });
        }
    },
}; 