// Dependencies
const { SlashCommandBuilder } = require("discord.js");
const { setIsStreaming } = require('../utils')

module.exports = {
    data: new SlashCommandBuilder()
        .setName("stream")
        .setDescription("Update the bot's streaming activity or watch the current stream.")
        // Note: All users will see this option, but only the specified ID can use it effectively.
        .addStringOption(option =>
            option.setName("url")
                .setDescription("The URL of the stream")
                .setRequired(false)), // Make URL optional for general users
    async execute(interaction) {

        if (!interaction.isCommand() || interaction.commandName !== "stream") return;

        const url = interaction.options.getString("url");
        const twitchLink = `https://www.twitch.tv/sefhi_922`;
        // Youtube not allowed because Twitch is just better KeK
        // const youtubeLink = `https://www.youtube.com/@lootandwaifus`;
        const channelId = "1054761687779123270"; // The ID of the specific channel where the link will be posted

        // Check if the user is Commander Sefhi
        if (interaction.user.id === "118451485221715977") {
            if (url) {

                // Update the bot's activity if the URL is provided
                await interaction.client.user.setActivity(url, { type: "STREAMING", url });
                setIsStreaming(true);
                await interaction.reply({ content: `Streaming activity updated to: ${url}`, ephemeral: true });

                // Post the video link into the specific channel
                const channel = await interaction.client.channels.fetch(channelId);
                if (channel) {
                    await channel.send(`@everyone Commander Sefhi is now streaming! Watch here: ${url}`);
                } else {
                    console.error(`Channel with ID ${channelId} not found.`);
                }

            } else {
                // Clear the streaming activity
                setIsStreaming(false);
                //TODO: This can be replaced with a call to reset to dynamic activities
                interaction.client.user.setActivity("SIMULATION ROOM", { type: "PLAYING" }); 
                await interaction.reply({ content: "Streaming activity cleared.", ephemeral: true });
            }
        } else {
            // For other users, show the streaming link
            await interaction.reply({ content: `Commander, you can watch the stream here: ${twitchLink}`, ephemeral: true });
        }
    },
};
