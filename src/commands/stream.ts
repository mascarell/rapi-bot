import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    TextChannel,
    MessageFlags,
    InteractionContextType,
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
        .setContexts(InteractionContextType.Guild)
        .setName('stream')
        .setDescription('Get the stream link (the streamer can also announce a live stream)')
        .addStringOption((option) =>
            option.setName('url')
                .setDescription('Streamer only: the stream link to include in the announcement')
                .setRequired(false)
        ),
    async execute(interaction: ChatInputCommandInteraction) {
        if (interaction.user.id !== STREAMER_USER_ID) {
            await replyEphemeral(interaction, `Commander, you can watch the stream here: <${TWITCH_LINK}>`);
            return;
        }

        const url = interaction.options.getString('url');
        if (!url) {
            await replyEphemeral(interaction, 'Add the stream link in `url` to announce the stream.');
            return;
        }

        // checkStreamStatus can make several Twitch HTTP calls, so defer first
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const isLive = await checkStreamStatus(interaction.client);
        if (!isLive) {
            await interaction.editReply('Stream is not currently live.');
            return;
        }

        try {
            // fetch throws (never returns null) when the channel is gone or hidden
            const channel = await interaction.client.channels.fetch(ANNOUNCE_CHANNEL_ID) as TextChannel;
            await channel.send(`@here Commander Sefhi is now streaming! You can watch on Youtube or Twitch here: <${url}> <${TWITCH_LINK}>`);
        } catch (error) {
            logger.warning`Stream announcement to ${ANNOUNCE_CHANNEL_ID} failed: ${error}`;
            await interaction.editReply('Could not post the announcement: the announcement channel is missing or the bot cannot post there.');
            return;
        }
        await interaction.editReply('Stream announcement sent!');
    },
};
