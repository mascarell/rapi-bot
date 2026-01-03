/**
 * Main Embed Fix Service
 * Orchestrates URL detection, caching, rate limiting, and embed generation
 */

import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    EmbedBuilder,
    Message,
    MessageFlags,
    TextChannel,
} from 'discord.js';
import { EMBED_FIX_CONFIG } from '../../utils/data/embedFixConfig';
import { EmbedData, EmbedPlatform, MatchedUrl } from '../../utils/interfaces/EmbedFix.interface';
import { logError } from '../../utils/util';
import { circuitBreaker } from './circuitBreaker';
import { embedCache } from './embedCache';
import { EmbedVotesService, getEmbedVotesService } from './embedVotesService';
import { instagramHandler } from './handlers/instagramHandler';
import { pixivHandler } from './handlers/pixivHandler';
import { twitterHandler } from './handlers/twitterHandler';
import { embedFixRateLimiter } from './rateLimiter';
import { urlMatcher } from './urlMatcher';

class EmbedFixService {
    private static instance: EmbedFixService;
    private initialized = false;

    private constructor() {
        // Private constructor for singleton
    }

    static getInstance(): EmbedFixService {
        if (!EmbedFixService.instance) {
            EmbedFixService.instance = new EmbedFixService();
        }
        return EmbedFixService.instance;
    }

    /**
     * Initialize the service and register handlers
     */
    initialize(): void {
        if (this.initialized) {
            return;
        }

        // Register platform handlers
        urlMatcher.registerHandler(twitterHandler);
        urlMatcher.registerHandler(pixivHandler);
        urlMatcher.registerHandler(instagramHandler);

        this.initialized = true;
        console.log('[EmbedFix] Service initialized with handlers:', urlMatcher.getHandlers().map(h => h.platform).join(', '));
    }

    /**
     * Process a message for embed-worthy URLs
     * This is the main entry point called from the message handler
     * @param message The Discord message to process
     */
    async processMessage(message: Message): Promise<void> {
        // Fast path checks
        if (!message.content.includes('http')) return;
        if (message.author.bot) return;
        if (!message.guild) return;

        // Only process in art-focused channels (#art, #nsfw)
        const channelName = (message.channel as TextChannel).name?.toLowerCase() ?? '';
        if (!['art', 'nsfw'].includes(channelName)) return;

        // Check rate limits
        if (!embedFixRateLimiter.check(message.guild.id, message.author.id)) {
            return;
        }

        // Find matching URLs
        const matches = urlMatcher.matchAllUrls(message.content);
        if (matches.length === 0) return;

        // Check for duplicate (repost detection) - check first URL
        const firstMatch = matches[0];
        const firstEmbedData = await this.processUrl(firstMatch);
        if (firstEmbedData) {
            const artworkId = this.generateArtworkId(firstEmbedData);
            const duplicateCheck = await getEmbedVotesService().checkDuplicate(
                artworkId,
                message.guild.id,
                EMBED_FIX_CONFIG.DUPLICATE_WINDOW_MS
            );

            if (duplicateCheck.isDuplicate && duplicateCheck.originalShare) {
                await this.sendDuplicateNotice(message, duplicateCheck.originalShare);
                return;
            }
        }

        // Limit to max embeds per message
        const limitedMatches = matches.slice(0, EMBED_FIX_CONFIG.MAX_EMBEDS_PER_MESSAGE);
        const skippedCount = matches.length - limitedMatches.length;

        // Process each URL in parallel (skip first since we already processed it)
        const embedPromises = limitedMatches.slice(1).map(match => this.processUrl(match));
        const results = await Promise.all(embedPromises);

        // Combine first result with rest
        const allResults = firstEmbedData ? [firstEmbedData, ...results] : results;

        // Filter out null results
        const validEmbeds = allResults.filter((data): data is EmbedData => data !== null);

        if (validEmbeds.length === 0) return;

        // Send the response
        await this.sendEmbedResponse(message, validEmbeds, skippedCount);
    }

    /**
     * Send a notice when a duplicate/repost is detected
     */
    private async sendDuplicateNotice(
        message: Message,
        originalShare: {
            sharedBy: string;
            sharedAt: string;
            messageId: string;
            channelId: string;
        }
    ): Promise<void> {
        const timeAgo = this.getRelativeTime(originalShare.sharedAt);
        const messageLink = `https://discord.com/channels/${message.guild!.id}/${originalShare.channelId}/${originalShare.messageId}`;

        try {
            // Suppress the duplicate message's embeds so Discord doesn't show them
            await message.suppressEmbeds(true).catch(() => {
                // Ignore if we can't suppress embeds (missing permissions)
            });

            await message.reply({
                content: `🔄 This was shared ${timeAgo} → [Jump to original](${messageLink})`,
                allowedMentions: { repliedUser: false },
            });
        } catch (error) {
            // Ignore if we can't reply
        }
    }

    /**
     * Convert ISO timestamp to relative time string
     */
    private getRelativeTime(isoTimestamp: string): string {
        const diff = Date.now() - new Date(isoTimestamp).getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 0) {
            return `${hours}h ${minutes}m ago`;
        }
        return `${minutes}m ago`;
    }

    /**
     * Process a single URL for embed generation
     * Used by both message handler and /embed command
     * @param url The URL to process
     */
    async processUrl(matched: MatchedUrl): Promise<EmbedData | null> {
        const { platform, match, handler, url } = matched;

        // Check circuit breaker
        if (circuitBreaker.isOpen(platform)) {
            console.log(`[EmbedFix] Circuit breaker open for ${platform}, skipping ${url}`);
            return null;
        }

        // Generate cache key
        const cacheKey = `${platform}:${url}`;

        // Check positive cache
        const cached = embedCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        // Check negative cache
        if (embedCache.isNegativelyCached(cacheKey)) {
            return null;
        }

        try {
            // Fetch from API
            const embedData = await handler.fetchEmbed(match, url);

            if (embedData) {
                // Cache successful result
                embedCache.set(cacheKey, embedData);
                circuitBreaker.recordSuccess(platform);
                return embedData;
            } else {
                // Cache negative result
                embedCache.setNegative(cacheKey);
                circuitBreaker.recordFailure(platform);
                return null;
            }
        } catch (error) {
            console.error(`[EmbedFix] Error processing ${url}:`, error);
            embedCache.setNegative(cacheKey);
            circuitBreaker.recordFailure(platform);
            return null;
        }
    }

    /**
     * Process a single URL string (convenience method for /embed command)
     * @param url The URL string to process
     */
    async processUrlString(url: string): Promise<EmbedData | null> {
        const matched = urlMatcher.matchUrl(url);
        if (!matched) return null;
        return this.processUrl(matched);
    }

    /**
     * Send embed response to a message
     */
    private async sendEmbedResponse(
        message: Message,
        embedDataList: EmbedData[],
        skippedCount: number
    ): Promise<void> {
        const embeds: EmbedBuilder[] = [];
        const urlRewrites: string[] = [];

        for (const data of embedDataList) {
            if (data._useUrlRewrite && data._rewrittenUrl) {
                // URL rewrite approach (Pixiv, Instagram)
                urlRewrites.push(data._rewrittenUrl);
            } else {
                // Custom embed approach (Twitter)
                embeds.push(this.buildEmbed(data));
            }
        }

        // Build content string
        let content = '';
        if (urlRewrites.length > 0) {
            content = urlRewrites.join('\n');
        }
        if (skippedCount > 0) {
            content += content ? '\n' : '';
            content += `...and ${skippedCount} more ${skippedCount === 1 ? 'link' : 'links'}`;
        }

        // Generate artwork ID for voting (use first embed)
        const primaryEmbed = embedDataList[0];
        const artworkId = this.generateArtworkId(primaryEmbed);

        // Create action buttons (vote + DM)
        const row = this.createActionButtons(message.id, artworkId, 0);

        try {
            // Suppress the original message's embeds
            if (message.embeds.length > 0 || message.content.includes('http')) {
                await message.suppressEmbeds(true).catch(() => {
                    // Ignore if we can't suppress embeds (missing permissions)
                });
            }

            // Send the fixed embed(s)
            const reply = await message.reply({
                content: content || undefined,
                embeds: embeds.length > 0 ? embeds : undefined,
                components: embeds.length > 0 ? [row] : undefined,
                allowedMentions: { repliedUser: false },
            });

            // Record artwork for voting (fire-and-forget)
            if (embeds.length > 0 && message.guild) {
                getEmbedVotesService().recordArtwork(artworkId, {
                    originalUrl: primaryEmbed.originalUrl,
                    platform: primaryEmbed.platform,
                    artistUsername: primaryEmbed.author.username,
                    artistName: primaryEmbed.author.name,
                    guildId: message.guild.id,
                    channelId: message.channel.id,
                    messageId: reply.id,
                    sharedBy: message.author.id,
                }).catch(err => {
                    console.error('[EmbedFix] Failed to record artwork:', err);
                });
            }
        } catch (error) {
            if (message.guild) {
                logError(message.guild.id, message.guild.name, error as Error, 'EmbedFix.sendEmbedResponse');
            }
        }
    }

    /**
     * Generate artwork ID from embed data
     */
    generateArtworkId(data: EmbedData): string {
        return EmbedVotesService.generateArtworkId(data.platform, data.originalUrl);
    }

    /**
     * Build a Discord embed from embed data (artist spotlight design)
     */
    buildEmbed(data: EmbedData): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setColor(data.color)
            .setURL(data.originalUrl)
            .setTitle(`Artwork by ${data.author.name}`)
            .setFooter({ text: 'Click ❤️ to vote • ✉️ to DM' });

        // Author with avatar and profile link
        embed.setAuthor({
            name: `@${data.author.username}`,
            url: data.author.url,
            iconURL: data.author.iconUrl,
        });

        // Tweet text as description (if present and not just a URL)
        if (data.description && !data.description.match(/^https?:\/\//)) {
            embed.setDescription(data.description.slice(0, 4096));
        }

        // Artwork image
        if (data.images.length > 0) {
            embed.setImage(data.images[0]);
        }

        // Timestamp
        if (data.timestamp) {
            embed.setTimestamp(new Date(data.timestamp));
        }

        return embed;
    }

    /**
     * Create action buttons (vote + DM)
     */
    createActionButtons(messageId: string, artworkId: string, voteCount: number): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`embed_vote:${artworkId}`)
                .setLabel(voteCount.toString())
                .setEmoji('❤️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`embed_save:${messageId}`)
                .setLabel('DM')
                .setEmoji('✉️')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    /**
     * Handle DM button interaction
     */
    async handleBookmarkInteraction(interaction: ButtonInteraction): Promise<void> {
        try {
            const originalMessage = interaction.message;
            const embed = originalMessage.embeds[0];

            if (!embed?.url) {
                await interaction.reply({
                    content: 'Could not find the original link.',
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            // Send DM with the link
            await interaction.user.send({
                content: embed.url,
                embeds: [EmbedBuilder.from(embed)],
            });

            await interaction.reply({
                content: 'Sent to your DMs!',
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            await interaction.reply({
                content: 'Could not send DM. Please check your privacy settings.',
                flags: MessageFlags.Ephemeral,
            });
        }
    }

    /**
     * Check if a URL is supported
     */
    isUrlSupported(url: string): boolean {
        return urlMatcher.matchUrl(url) !== null;
    }

    /**
     * Get supported platforms
     */
    getSupportedPlatforms(): string[] {
        return urlMatcher.getHandlers().map(h => h.platform);
    }
}

// Export singleton getter
export function getEmbedFixService(): EmbedFixService {
    return EmbedFixService.getInstance();
}

// Export for message handler hook
export async function checkEmbedFixUrls(message: Message): Promise<void> {
    // Fast path checks
    if (!message.content.includes('http')) return;
    if (message.author.bot) return;
    if (!message.guild) return;

    // Fire-and-forget - errors are logged internally
    getEmbedFixService().processMessage(message).catch(err => {
        if (message.guild) {
            logError(message.guild.id, message.guild.name, err as Error, 'EmbedFix');
        }
    });
}
