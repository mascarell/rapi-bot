/**
 * /embed command - Generate fixed embeds for social media URLs
 */

import {
    ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
    SlashCommandBuilder,
} from 'discord.js';
import { getEmbedFixService } from '../services/embedFix/embedFixService';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('embed')
        .setDescription('Generate a fixed embed for a social media URL')
        .addStringOption(option =>
            option
                .setName('url')
                .setDescription('The URL to generate an embed for (Twitter/X supported)')
                .setRequired(true)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const url = interaction.options.getString('url', true);

        // Validate URL format
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            await interaction.reply({
                content: 'Please provide a valid URL starting with http:// or https://',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const service = getEmbedFixService();

        // Check if URL is supported
        if (!service.isUrlSupported(url)) {
            const supportedPlatforms = service.getSupportedPlatforms();
            await interaction.reply({
                content: `This URL is not supported. Currently supported platforms: ${supportedPlatforms.join(', ')}`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // Defer reply as API call may take time
        await interaction.deferReply();

        try {
            const embedData = await service.processUrlString(url);

            if (!embedData) {
                await interaction.editReply({
                    content: 'Could not fetch embed data for this URL. The content may be unavailable or private.',
                });
                return;
            }

            // Build the embed
            const embed = service.buildEmbed(embedData);

            // Create bookmark button
            const row = service.createBookmarkButton(interaction.id);

            // Handle URL rewrite platforms differently
            if (embedData._useUrlRewrite && embedData._rewrittenUrl) {
                await interaction.editReply({
                    content: embedData._rewrittenUrl,
                });
            } else {
                await interaction.editReply({
                    embeds: [embed],
                    components: [row],
                });
            }
        } catch (error) {
            console.error('[/embed] Error processing URL:', error);
            await interaction.editReply({
                content: 'An error occurred while processing the URL. Please try again later.',
            });
        }
    },
};
