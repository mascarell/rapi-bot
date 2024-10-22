import {
    SlashCommandBuilder,
    CommandInteraction,
    ActivityType,
    PresenceUpdateStatus,
    TextChannel,
} from 'discord.js';
import { setIsStreaming } from '../utils';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stream')
        .setDescription("Update the bot's streaming activity or watch the current stream.")
        .addStringOption((option) =>
            option.setName('url')
                .setDescription('The URL of the stream')
                .setRequired(false)
        ),
    async execute(interaction: CommandInteraction) {
        if (interaction.commandName !== 'stream') return;
        const url = interaction.options.get('url')?.value as string;
        const twitchLink = `https://www.twitch.tv/sefhi_922`;
        const channelId = '1054761687779123270';
        const userId = '118451485221715977'; // Sefhi's user ID

        if (interaction.user.id === userId) {
            if (url) {
                interaction.client.user?.setPresence({
                    status: 'online',
                    activities: [{
                        name: 'Loot & Waifus',
                        type: ActivityType.Streaming,
                        url: twitchLink,
                    }],
                });
                setIsStreaming(true);
                await interaction.reply({ content: `Streaming activity updated to: ${url}`, ephemeral: true });

                const channel = await interaction.client.channels.fetch(channelId) as TextChannel;
                if (channel) {
                    await channel.send(`@everyone Commander Sefhi is now streaming! You can watch on YouTube and Twitch here: ${url} ${twitchLink}`);
                } else {
                    console.error(`Channel with ID ${channelId} not found.`);
                }
            } else {
                setIsStreaming(false);
                interaction.client.user?.setPresence({
                    status: PresenceUpdateStatus.Online,
                    activities: [{
                        name: 'SIMULATION ROOM',
                        type: ActivityType.Competing,
                    }],
                });
                await interaction.reply({ content: 'Streaming activity cleared.', ephemeral: true });
            }
        } else {
            await interaction.reply({ content: `Commander, you can watch the stream here: ${twitchLink}`, ephemeral: true });
        }
    },
};
