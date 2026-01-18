import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    TextChannel,
    MessageFlags
} from 'discord.js';
import { checkStreamStatus } from '../utils/twitch';

module.exports = {
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
        const url = interaction.options.get('url')?.value as string;
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
                    console.error(`Channel with ID ${channelId} not found.`);
                }
                await interaction.reply({ content: 'Stream announcement sent!', flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: 'Stream is not currently live.', flags: MessageFlags.Ephemeral });
            }
        } else {
            await interaction.reply({ content: `Commander, you can watch the stream here: ${url} ${twitchLink}`, flags: MessageFlags.Ephemeral });
        }
    },
};
