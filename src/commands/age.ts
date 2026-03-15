import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { getUptimeService } from '../services/uptimeService.js';
import { ChatCommandRateLimiter } from '../utils/chatCommandRateLimiter.js';
import { handleCommandError } from '../utils/commandErrorHandler.js';
import { replyWithEmbed } from '../utils/interactionHelpers.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

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
            const startedTimestamp = Math.floor(deploymentInfo.startTime / 1000);

            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('System Uptime')
                .setDescription(`I have been running for **${deploymentInfo.formattedUptime}**!`)
                .addFields(
                    { name: '📅 Started At', value: `<t:${startedTimestamp}:F>\n(<t:${startedTimestamp}:R>)`, inline: true },
                    { name: '⚡ Commands (Server)', value: `**${serverCommands.toLocaleString()}**`, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true },
                    { name: '🌐 Servers Connected', value: `**${serverCount}**`, inline: true },
                    { name: '🌍 Commands (Global)', value: `**${globalCommands.toLocaleString()}**`, inline: true },
                    { name: '🏷️ Version', value: `\`v${version}\``, inline: true },
                )
                .setFooter({
                    text: 'Stay safe on the surface, Commander!',
                    iconURL: interaction.client.user?.displayAvatarURL()
                })
                .setTimestamp();

            await replyWithEmbed(interaction, embed, true);
        } catch (error) {
            await handleCommandError(interaction, error, 'age');
        }
    },
}; 