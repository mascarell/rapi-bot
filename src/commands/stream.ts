import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    TextChannel,
} from 'discord.js';
import { checkStreamStatus } from '../utils/twitch.js';
import { logger } from '../utils/logger.js';
import { replyEphemeral } from '../utils/interactionHelpers.js';

export default {
    data: new SlashCommandBuilder()
        .setName('stream')
        .setDescription("Announce the current stream or check stream status.")
        .addStringOption((option) =>
            option.setName('url')
                .setDescription('The URL of the stream (optional)')
                .setRequired(true)
        ),
    async execute(interaction: ChatInputCommandInteraction) {
        if (interaction.commandName !== 'stream') return;

        const url = interaction.options.getString('url', true);
        const twitchLink = `https://www.twitch.tv/sefhi_922`;
        const channelId = '1054761687779123270';
        const userId = '118451485221715977'; // Sefhi's user ID

        if (interaction.user.id === userId) {
            const isLive = await checkStreamStatus(interaction.client);

            if (isLive) {
                const channel = await interaction.client.channels.fetch(channelId) as TextChannel;
                if (channel) {
                    await channel.send(`@everyone Commander Sefhi is now streaming! You can watch on Youtube or Twitch here: ${url} ${twitchLink}`);
                } else {
                    logger.warning`Channel with ID ${channelId} not found.`;
                }
                await replyEphemeral(interaction, 'Stream announcement sent!');
            } else {
                await replyEphemeral(interaction, 'Stream is not currently live.');
            }
        } else {
            await replyEphemeral(interaction, `Commander, you can watch the stream here: ${url} ${twitchLink}`);
        }
    },
};
