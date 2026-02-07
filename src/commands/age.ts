import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder ,
    MessageFlags
} from 'discord.js';
import { getUptimeService } from '../services/uptimeService';
import { ChatCommandRateLimiter } from '../utils/chatCommandRateLimiter';
import { logger } from '../utils/logger.js';

/**
 * Command export for Discord.js
 * Shows bot uptime and system information
 */
export default {
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
            const startedAt = new Date(deploymentInfo.startTime).toLocaleString();
            
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('System Uptime')
                .setDescription(`I have been running for ${deploymentInfo.formattedUptime}!`)
                .addFields(
                    { name: '📅 Started At', value: startedAt, inline: true },
                    { name: '⚡ Commands (Server)', value: `**${serverCommands.toLocaleString()}**`, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true }, // Blank field to force new row
                    { name: '🌐 Servers Connected', value: `**${serverCount}**`, inline: true },
                    { name: '🌍 Commands (Global)', value: `**${globalCommands.toLocaleString()}**`, inline: true }
                )
                .setFooter({ 
                    text: 'Stay safe on the surface, Commander!', 
                    iconURL: interaction.client.user?.displayAvatarURL() 
                })
                .setTimestamp();

            await interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });
            
        } catch (error) {
            logger.error`Error in age command: ${error}`;
            await interaction.reply({
                content: 'Commander, there was an error getting the uptime information.',
                flags: MessageFlags.Ephemeral
            });
        }
    },
}; 