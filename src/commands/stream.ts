import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    TextChannel,
} from 'discord.js';
import { checkStreamStatus } from '../utils/twitch.js';
import { logger } from '../utils/logger.js';
import { replyEphemeral } from '../utils/interactionHelpers.js';

const TWITCH_LINK = 'https://www.twitch.tv/sefhi_922';
const ANNOUNCE_CHANNEL_ID = '1054761687779123270';
const STREAMER_USER_ID = '118451485221715977'; // Sefhi

/**
 * /stream: Sefhi announces a live stream (with the YouTube or other link in
 * `url`); everyone else gets the Twitch link. `url` is only needed for the
 * announcement, so it's optional.
 */
export default {
    data: new SlashCommandBuilder()
        .setName('stream')
        .setDescription('Get the stream link (the streamer can also announce a live stream)')
        .addStringOption((option) =>
            option.setName('url')
                .setDescription('Streamer only: the stream link to include in the announcement')
                .setRequired(false)
        ),
    async execute(interaction: ChatInputCommandInteraction) {
        if (interaction.commandName !== 'stream') return;

        if (interaction.user.id !== STREAMER_USER_ID) {
            await replyEphemeral(interaction, `Commander, you can watch the stream here: <${TWITCH_LINK}>`);
            return;
        }

        const url = interaction.options.getString('url');
        if (!url) {
            await replyEphemeral(interaction, 'Add the stream link in `url` to announce the stream.');
            return;
        }

        const isLive = await checkStreamStatus(interaction.client);
        if (!isLive) {
            await replyEphemeral(interaction, 'Stream is not currently live.');
            return;
        }

        const channel = await interaction.client.channels.fetch(ANNOUNCE_CHANNEL_ID) as TextChannel;
        if (channel) {
            await channel.send(`@here Commander Sefhi is now streaming! You can watch on Youtube or Twitch here: <${url}> <${TWITCH_LINK}>`);
        } else {
            logger.warning`Channel with ID ${ANNOUNCE_CHANNEL_ID} not found.`;
        }
        await replyEphemeral(interaction, 'Stream announcement sent!');
    },
};
