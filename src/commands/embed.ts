/**
 * /embed command - Generate fixed embeds for social media URLs
 */

import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    InteractionContextType,
} from 'discord.js';
import { getEmbedFixService } from '../services/embedFix/embedFixService.js';
import { getEmbedVotesService } from '../services/embedFix/embedVotesService.js';
import { replyEphemeral } from '../utils/interactionHelpers.js';
import { handleCommandError } from '../utils/commandErrorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setContexts(InteractionContextType.Guild)
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
            await replyEphemeral(interaction, 'Please provide a valid URL starting with http:// or https://');
            return;
        }

        const service = getEmbedFixService();

        // Check if URL is supported
        if (!service.isUrlSupported(url)) {
            const supportedPlatforms = service.getSupportedPlatforms();
            await replyEphemeral(
                interaction,
                `This URL is not supported. Currently supported platforms: ${supportedPlatforms.join(', ')}`
            );
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

            // Generate artwork ID for voting
            const artworkId = service.generateArtworkId(embedData);

            // Handle URL rewrite platforms differently
            if (embedData._useUrlRewrite && embedData._rewrittenUrl) {
                await interaction.editReply({
                    content: embedData._rewrittenUrl,
                });
            } else {
                await interaction.editReply({
                    embeds: [embed],
                });

                // Record artwork for voting if in a guild
                if (interaction.guildId && interaction.channel) {
                    const reply = await interaction.fetchReply();
                    await getEmbedVotesService().recordArtwork(artworkId, {
                        originalUrl: embedData.originalUrl,
                        platform: embedData.platform,
                        artistUsername: embedData.author.username,
                        artistName: embedData.author.name,
                        guildId: interaction.guildId,
                        channelId: interaction.channel.id,
                        messageId: reply.id,
                        sharedBy: interaction.user.id,
                    });
                }
            }
        } catch (error) {
            await handleCommandError(interaction, error, 'embed');
        }
    },
};
