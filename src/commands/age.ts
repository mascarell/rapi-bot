import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { getUptimeService } from '../services/uptimeService.js';
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
            const commandsExecuted = uptimeService.getCommandsExecuted();
            const startedTimestamp = Math.floor(deploymentInfo.startTime / 1000);

            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('System Uptime')
                .setDescription(`I have been running for **${deploymentInfo.formattedUptime}**!`)
                .addFields(
                    { name: '📅 Started At', value: `<t:${startedTimestamp}:F>\n(<t:${startedTimestamp}:R>)`, inline: true },
                    { name: '🌐 Servers Connected', value: `**${serverCount}**`, inline: true },
                    { name: '⚡ Commands since start', value: `**${commandsExecuted.toLocaleString()}**`, inline: true },
                )
                .setFooter({
                    text: `Stay safe on the surface, Commander! | v${version}`,
                    iconURL: interaction.client.user?.displayAvatarURL()
                })
                .setTimestamp();

            await replyWithEmbed(interaction, embed, true);
        } catch (error) {
            await handleCommandError(interaction, error, 'age');
        }
    },
}; 