/**
 * Main Embed Fix Service
 * Orchestrates URL detection, caching, rate limiting, and embed generation
 */

import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    EmbedBuilder,
    Message,
    MessageFlags,
    MessageReaction,
    PartialMessageReaction,
    PartialUser,
    TextChannel,
    User,
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

/**
 * Download a video file, checking size constraints
 * Returns the buffer if under limit, or null to trigger fallback
 */
async function downloadVideo(
    videoUrl: string,
    maxSize: number = EMBED_FIX_CONFIG.MAX_VIDEO_SIZE_BYTES
): Promise<{ buffer: Buffer; filename: string } | null> {
    try {
        // First, check file size with HEAD request
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        try {
            const headResponse = await fetch(videoUrl, {
                method: 'HEAD',
                signal: controller.signal,
            });
            clearTimeout(timeout);

            const contentLength = headResponse.headers.get('content-length');
            if (contentLength && parseInt(contentLength) > maxSize) {
                console.log(`[EmbedFix] Video too large: ${contentLength} bytes > ${maxSize} limit`);
                return null;
            }
        } catch {
            clearTimeout(timeout);
            // HEAD request failed, try downloading anyway
        }

        // Download the video
        const downloadController = new AbortController();
        const downloadTimeout = setTimeout(
            () => downloadController.abort(),
            EMBED_FIX_CONFIG.VIDEO_DOWNLOAD_TIMEOUT_MS
        );

        const response = await fetch(videoUrl, { signal: downloadController.signal });
        clearTimeout(downloadTimeout);

        if (!response.ok) {
            console.log(`[EmbedFix] Video download failed: ${response.status}`);
            return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Check actual size
        if (buffer.length > maxSize) {
            console.log(`[EmbedFix] Downloaded video too large: ${buffer.length} bytes`);
            return null;
        }

        // Extract filename from URL
        const urlPath = new URL(videoUrl).pathname;
        const filename = urlPath.split('/').pop() || 'video.mp4';

        return { buffer, filename };
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.log('[EmbedFix] Video download timed out');
        } else {
            console.error('[EmbedFix] Video download error:', error);
        }
        return null;
    }
}

/**
 * Find the best video URL that fits within size limit
 * Tries variants from highest to lowest quality
 */
async function findBestVideoUrl(
    video: NonNullable<EmbedData['videos']>[0],
    maxSize: number = EMBED_FIX_CONFIG.MAX_VIDEO_SIZE_BYTES
): Promise<string | null> {
    // If we have variants, try them in order (highest quality first)
    if (video.variants && video.variants.length > 0) {
        for (const variant of video.variants) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);

                const headResponse = await fetch(variant.url, {
                    method: 'HEAD',
                    signal: controller.signal,
                });
                clearTimeout(timeout);

                const contentLength = headResponse.headers.get('content-length');
                if (contentLength && parseInt(contentLength) <= maxSize) {
                    return variant.url;
                }
            } catch {
                // Try next variant
                continue;
            }
        }
    }

    // Fallback to main URL if no suitable variant found
    return video.url;
}

class EmbedFixService {
    private static instance: EmbedFixService;
    private initialized = false;

    // Track recent uploads by guildId:userId:filename -> timestamp
    // Used for duplicate detection within the same guild
    private recentUploads = new Map<string, number>();

    private constructor() {
        // Private constructor for singleton
        // Periodically clean up old entries (every 10 minutes)
        setInterval(() => this.cleanupRecentUploads(), 10 * 60 * 1000);
    }

    /**
     * Clean up expired upload tracking entries
     */
    private cleanupRecentUploads(): void {
        const now = Date.now();
        const expireTime = EMBED_FIX_CONFIG.DUPLICATE_WINDOW_MS;
        for (const [key, timestamp] of this.recentUploads) {
            if (now - timestamp > expireTime) {
                this.recentUploads.delete(key);
            }
        }
    }

    /**
     * Check if an upload is a duplicate (same user, same filename, same guild, within window)
     */
    private checkUploadDuplicate(guildId: string, userId: string, filenames: string[]): boolean {
        const now = Date.now();
        for (const filename of filenames) {
            const key = `${guildId}:${userId}:${filename}`;
            const lastUpload = this.recentUploads.get(key);
            if (lastUpload && now - lastUpload < EMBED_FIX_CONFIG.DUPLICATE_WINDOW_MS) {
                return true;  // Duplicate found
            }
        }
        return false;
    }

    /**
     * Record uploads for duplicate tracking
     */
    private recordUploads(guildId: string, userId: string, filenames: string[]): void {
        const now = Date.now();
        for (const filename of filenames) {
            const key = `${guildId}:${userId}:${filename}`;
            this.recentUploads.set(key, now);
        }
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
     * Check if message has image/video attachments
     */
    private hasMediaAttachments(message: Message): boolean {
        if (message.attachments.size === 0) return false;
        return message.attachments.some(att =>
            att.contentType?.startsWith('image/') ||
            att.contentType?.startsWith('video/') ||
            /\.(jpg|jpeg|png|gif|webp|mp4|webm|mov)$/i.test(att.name || '')
        );
    }

    /**
     * Create EmbedData from user-uploaded attachments
     */
    private createUploadEmbedData(message: Message): EmbedData {
        const images: string[] = [];
        const videos: Array<{ url: string; thumbnail?: string }> = [];

        message.attachments.forEach(att => {
            const isImage = att.contentType?.startsWith('image/') ||
                /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name || '');
            const isVideo = att.contentType?.startsWith('video/') ||
                /\.(mp4|webm|mov)$/i.test(att.name || '');

            if (isImage) {
                images.push(att.url);
            } else if (isVideo) {
                videos.push({
                    url: att.url,
                    thumbnail: att.proxyURL,
                });
            }
        });

        return {
            platform: 'upload',
            author: {
                name: message.author.displayName || message.author.username,
                username: message.author.username,
                url: message.url,  // Link to original message
                iconUrl: message.author.displayAvatarURL() || undefined,
            },
            images,
            videos: videos.length > 0 ? videos : undefined,
            color: EMBED_FIX_CONFIG.EMBED_COLOR_UPLOAD,
            originalUrl: message.url,
            description: message.content || undefined,
            timestamp: message.createdAt.toISOString(),
        };
    }

    /**
     * Process user-uploaded images/videos (with duplicate detection)
     */
    private async processUserUpload(message: Message): Promise<void> {
        // Get filenames for duplicate checking
        const filenames = message.attachments
            .filter(att =>
                att.contentType?.startsWith('image/') ||
                att.contentType?.startsWith('video/') ||
                /\.(jpg|jpeg|png|gif|webp|mp4|webm|mov)$/i.test(att.name || '')
            )
            .map(att => att.name || 'unknown');

        if (filenames.length === 0) return;

        // Check for duplicate (same user posting same filename within 24h)
        if (message.guild && this.checkUploadDuplicate(message.guild.id, message.author.id, filenames)) {
            // Silently skip duplicates from same user
            return;
        }

        const embedData = this.createUploadEmbedData(message);

        // Skip if no media found
        if (embedData.images.length === 0 && (!embedData.videos || embedData.videos.length === 0)) {
            return;
        }

        // Record this upload for duplicate tracking
        if (message.guild) {
            this.recordUploads(message.guild.id, message.author.id, filenames);
        }

        // Send embed response
        await this.sendUploadEmbedResponse(message, embedData);
    }

    /**
     * Send embed response for user uploads (delete original, repost as embed)
     */
    private async sendUploadEmbedResponse(message: Message, embedData: EmbedData): Promise<void> {
        const embeds: EmbedBuilder[] = [];

        // Create one embed per image
        const imageCount = Math.min(embedData.images.length, 10);  // Discord's limit
        for (let i = 0; i < imageCount; i++) {
            embeds.push(this.buildEmbed(embedData, i));
        }

        // If no images but has videos, just add reactions to the original message
        // since we can't easily re-embed user-uploaded videos
        if (embeds.length === 0 && embedData.videos && embedData.videos.length > 0) {
            try {
                await message.react('❤️').catch(() => {});
                await message.react('✉️').catch(() => {});
            } catch {
                // Ignore reaction failures
            }
            return;
        }

        if (embeds.length === 0) return;

        const channel = message.channel as TextChannel;

        try {
            // Send embed FIRST while original message (and its CDN URLs) still exist
            // Discord fetches the images when rendering the embed, so the URLs must be valid at send time
            // Note: Don't include message content - it's already in the embed description
            const newMessage = await channel.send({
                embeds,
                allowedMentions: { users: [] },
            });

            // Add reactions
            await newMessage.react('❤️').catch(() => {});
            await newMessage.react('✉️').catch(() => {});

            // NOW delete the original message after embed is sent
            // The images are already fetched/cached by Discord at this point
            try {
                await message.delete();
            } catch {
                console.log('[EmbedFix] Could not delete original upload message');
            }
        } catch (error) {
            if (message.guild) {
                logError(message.guild.id, message.guild.name, error as Error, 'EmbedFix.sendUploadEmbedResponse');
            }
        }
    }

    /**
     * Process a message for embed-worthy URLs
     * This is the main entry point called from the message handler
     * @param message The Discord message to process
     */
    async processMessage(message: Message): Promise<void> {
        // Fast path checks
        if (message.author.bot) return;
        if (!message.guild) return;

        // Check for URLs or media attachments
        const hasUrls = message.content.includes('http');
        const hasMediaUploads = this.hasMediaAttachments(message);
        if (!hasUrls && !hasMediaUploads) return;

        // Only process in art-focused channels (#art, #nsfw)
        const channelName = (message.channel as TextChannel).name?.toLowerCase() ?? '';
        if (!['art', 'nsfw'].includes(channelName)) return;

        // Handle user uploads (embeds but no tracking)
        if (hasMediaUploads && !hasUrls) {
            await this.processUserUpload(message);
            return;
        }

        // From here on, we're processing URL-based embeds
        if (!hasUrls) return;

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

        // Track which URLs failed (for fallback message)
        const failedFixupUrls: string[] = [];
        limitedMatches.forEach((match, index) => {
            const result = index === 0 ? firstEmbedData : results[index - 1];
            if (!result && this.isFixupUrl(match.url)) {
                failedFixupUrls.push(match.url);
            }
        });

        // Filter out null results
        const validEmbeds = allResults.filter((data): data is EmbedData => data !== null);

        // If we had fixup URLs that failed, send fallback message
        if (failedFixupUrls.length > 0 && validEmbeds.length === 0) {
            await this.sendFixupFallbackMessage(message, failedFixupUrls);
            return;
        }

        if (validEmbeds.length === 0) return;

        // Send the response
        await this.sendEmbedResponse(message, validEmbeds, skippedCount);
    }

    /**
     * Check if a URL is from a fixup service (vxtwitter, fxtwitter, etc.)
     */
    private isFixupUrl(url: string): boolean {
        const lowerUrl = url.toLowerCase();
        return EMBED_FIX_CONFIG.FIXUP_DOMAINS.some(domain => lowerUrl.includes(domain));
    }

    /**
     * Send a fallback message when fixup URLs couldn't be processed
     */
    private async sendFixupFallbackMessage(message: Message, failedUrls: string[]): Promise<void> {
        try {
            await message.reply({
                content: `⚠️ Couldn't process the fixup link. Try using the original \`twitter.com\` or \`x.com\` URL instead for embed enhancement.`,
                allowedMentions: { repliedUser: false },
            });
        } catch (error) {
            // Ignore if we can't reply
        }
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
        const files: AttachmentBuilder[] = [];
        let videoFallbackUrl: string | undefined;

        for (const data of embedDataList) {
            if (data._useUrlRewrite && data._rewrittenUrl) {
                // URL rewrite approach (Pixiv, Instagram)
                urlRewrites.push(data._rewrittenUrl);
            } else if (data.videos && data.videos.length > 0 && data.images.length === 0) {
                // Video tweet - try to download and attach
                const video = data.videos[0];
                const bestVideoUrl = await findBestVideoUrl(video);

                if (bestVideoUrl) {
                    const downloaded = await downloadVideo(bestVideoUrl);

                    if (downloaded) {
                        // Successfully downloaded - attach the video
                        files.push(new AttachmentBuilder(downloaded.buffer, { name: downloaded.filename }));
                        // Build embed with metadata only (no thumbnail - video attachment will play inline)
                        const embed = this.buildVideoEmbed(data, downloaded.filename);
                        embeds.push(embed);
                    } else {
                        // Video too large - use vxtwitter fallback
                        videoFallbackUrl = this.getVxTwitterFallbackUrl(data.originalUrl);
                    }
                } else {
                    // No suitable video URL found - use vxtwitter fallback
                    videoFallbackUrl = this.getVxTwitterFallbackUrl(data.originalUrl);
                }
            } else {
                // Image tweet or text-only - create one embed per image
                const imageCount = Math.min(
                    data.images.length || 1,  // At least 1 for text-only tweets
                    EMBED_FIX_CONFIG.MAX_IMAGES_PER_TWEET
                );
                for (let i = 0; i < imageCount; i++) {
                    // Stop if we've hit Discord's 10 embed limit
                    if (embeds.length >= 10) break;
                    embeds.push(this.buildEmbed(data, i));
                }
            }
        }

        // Build content string
        let content = '';
        if (videoFallbackUrl) {
            // Use vxtwitter URL for large videos (Discord will embed it natively)
            content = videoFallbackUrl;
        } else if (urlRewrites.length > 0) {
            content = urlRewrites.join('\n');
        }
        if (skippedCount > 0) {
            content += content ? '\n' : '';
            content += `...and ${skippedCount} more ${skippedCount === 1 ? 'link' : 'links'}`;
        }

        // Generate artwork ID for voting (use first embed)
        const primaryEmbed = embedDataList[0];
        const artworkId = this.generateArtworkId(primaryEmbed);

        const hasEmbedsOrVideo = embeds.length > 0 || files.length > 0;

        try {
            // Helper to suppress embeds on the original message
            const suppressOriginalEmbeds = async () => {
                await message.suppressEmbeds(true).catch(() => {
                    // Ignore if we can't suppress embeds (missing permissions)
                });
            };

            // Suppress embeds immediately if they exist
            if (message.embeds.length > 0) {
                await suppressOriginalEmbeds();
            }

            // Send the fixed embed(s) with optional video attachment (no buttons - use reactions)
            const reply = await message.reply({
                content: content || undefined,
                embeds: embeds.length > 0 ? embeds : undefined,
                files: files.length > 0 ? files : undefined,
                allowedMentions: { repliedUser: false },
            });

            // Suppress embeds again after a short delay
            // Discord generates embeds asynchronously, so we need to wait and suppress again
            // to catch any embeds that appeared after our initial check
            setTimeout(async () => {
                await suppressOriginalEmbeds();
            }, 1500);

            // Add emoji reactions for voting and DM (heart first, then envelope)
            if (hasEmbedsOrVideo && !videoFallbackUrl) {
                await reply.react('❤️').catch(() => {
                    // Ignore if we can't react (missing permissions)
                });
                await reply.react('✉️').catch(() => {
                    // Ignore if we can't react (missing permissions)
                });
            }

            // Record artwork for voting (fire-and-forget)
            if (hasEmbedsOrVideo && message.guild) {
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
     * Build embed for video tweets (shows metadata, video plays inline via attachment)
     * @param videoFilename The filename of the attached video (e.g., "video.mp4")
     */
    private buildVideoEmbed(data: EmbedData, videoFilename: string): EmbedBuilder {
        // Build engagement fields
        const fields: Array<{ name: string; value: string; inline: boolean }> = [];
        if (data.engagement && data.platform === 'twitter') {
            if (data.engagement.likes !== undefined) {
                fields.push({
                    name: '❤️ Likes',
                    value: this.formatNumber(data.engagement.likes),
                    inline: true,
                });
            }
            if (data.engagement.retweets !== undefined) {
                fields.push({
                    name: '🔁 Retweets',
                    value: this.formatNumber(data.engagement.retweets),
                    inline: true,
                });
            }
            if (data.engagement.views !== undefined && data.engagement.views > 0) {
                fields.push({
                    name: '👁️ Views',
                    value: this.formatNumber(data.engagement.views),
                    inline: true,
                });
            }
        }

        // Use constructor with video property (like saucy-bot does)
        // This allows the attached video to play inline in Discord
        const embed = new EmbedBuilder({
            url: data.originalUrl,
            color: data.color,
            description: data.description && !data.description.match(/^https?:\/\//)
                ? data.description.slice(0, 4096)
                : undefined,
            author: {
                name: `@${data.author.username}`,
                url: data.author.url,
                icon_url: data.author.iconUrl,
            },
            video: {
                url: `attachment://${videoFilename}`,
            },
            fields: fields.length > 0 ? fields : undefined,
            footer: {
                text: 'Twitter',
                icon_url: EMBED_FIX_CONFIG.TWITTER_ICON_URL,
            },
            timestamp: data.timestamp ? new Date(data.timestamp).toISOString() : undefined,
        });

        return embed;
    }

    /**
     * Format large numbers (e.g., 1234567 -> "1.2M")
     */
    private formatNumber(num: number): string {
        if (num >= 1_000_000) {
            return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
        }
        if (num >= 1_000) {
            return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
        }
        return num.toString();
    }

    /**
     * Convert original Twitter/X URL to vxtwitter fallback
     */
    private getVxTwitterFallbackUrl(originalUrl: string): string {
        // Replace twitter.com or x.com with vxtwitter.com
        return originalUrl
            .replace(/https?:\/\/(www\.)?(twitter\.com|x\.com)/, EMBED_FIX_CONFIG.VXTWITTER_FALLBACK)
            .replace(/https?:\/\/(www\.)?(vxtwitter|fxtwitter|fixupx|fixvx|twittpr)\.com/, EMBED_FIX_CONFIG.VXTWITTER_FALLBACK);
    }

    /**
     * Generate artwork ID from embed data
     */
    generateArtworkId(data: EmbedData): string {
        return EmbedVotesService.generateArtworkId(data.platform, data.originalUrl);
    }

    /**
     * Build a Discord embed from embed data (artist spotlight design)
     * @param data The embed data
     * @param imageIndex Which image to display (0 = first, with full metadata)
     */
    buildEmbed(data: EmbedData, imageIndex: number = 0): EmbedBuilder {
        const isFirstImage = imageIndex === 0;
        const embed = new EmbedBuilder()
            .setColor(data.color)
            .setURL(data.originalUrl);  // Same URL groups embeds visually in Discord

        if (isFirstImage) {
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

            // Add engagement metrics as inline fields (like saucy-bot)
            if (data.engagement && data.platform === 'twitter') {
                const fields = [];
                if (data.engagement.likes !== undefined) {
                    fields.push({
                        name: '❤️ Likes',
                        value: this.formatNumber(data.engagement.likes),
                        inline: true,
                    });
                }
                if (data.engagement.retweets !== undefined) {
                    fields.push({
                        name: '🔁 Retweets',
                        value: this.formatNumber(data.engagement.retweets),
                        inline: true,
                    });
                }
                if (data.engagement.views !== undefined && data.engagement.views > 0) {
                    fields.push({
                        name: '👁️ Views',
                        value: this.formatNumber(data.engagement.views),
                        inline: true,
                    });
                }
                if (fields.length > 0) {
                    embed.addFields(fields);
                }
            }

            // Footer with platform branding
            if (data.platform === 'twitter') {
                embed.setFooter({
                    text: 'Twitter',
                    iconURL: EMBED_FIX_CONFIG.TWITTER_ICON_URL,
                });
            }

            // Timestamp
            if (data.timestamp) {
                embed.setTimestamp(new Date(data.timestamp));
            }
        }

        // Set image for this index
        if (data.images[imageIndex]) {
            embed.setImage(data.images[imageIndex]);
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
     * Handle envelope emoji reaction for DM functionality
     * @param reaction The reaction that was added
     * @param user The user who added the reaction
     */
    async handleEnvelopeReaction(
        reaction: MessageReaction | PartialMessageReaction,
        user: User | PartialUser
    ): Promise<void> {
        try {
            // Fetch partial reaction if needed
            if (reaction.partial) {
                await reaction.fetch();
            }

            const message = reaction.message;

            // Only process if it's on a bot message with embeds
            if (!message.author?.bot || message.embeds.length === 0) {
                return;
            }

            const embed = message.embeds[0];
            if (!embed?.url) {
                return;
            }

            // Send DM with the link and embed
            const fullUser = user.partial ? await user.fetch() : user;
            await fullUser.send({
                content: embed.url,
                embeds: [EmbedBuilder.from(embed)],
            });
        } catch (error) {
            // Silently fail - user likely has DMs disabled
            console.log(`[EmbedFix] Could not send DM to user ${user.id}: ${error}`);
        }
    }

    /**
     * Handle envelope reaction on user upload bot replies
     * Sends image URLs from embeds via DM
     */
    async handleUploadEnvelopeReaction(
        message: Message,
        user: User | PartialUser
    ): Promise<void> {
        try {
            // Get image URLs from embeds
            const imageUrls = message.embeds
                .map(embed => embed.image?.url)
                .filter((url): url is string => Boolean(url))
                .join('\n');

            if (!imageUrls) return;

            const fullUser = user.partial ? await user.fetch() : user;
            await fullUser.send({
                content: `📎 **Saved from ${message.guild?.name || 'a server'}:**\n${imageUrls}`,
            });
        } catch (error) {
            console.log(`[EmbedFix] Could not send upload DM to user ${user.id}: ${error}`);
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

    /**
     * Process a message edit - re-check for embed-worthy URLs
     * Only processes edits within the configured time window
     */
    async processMessageEdit(oldMessage: Message, newMessage: Message): Promise<void> {
        // Fast path checks
        if (!newMessage.content.includes('http')) return;
        if (newMessage.author.bot) return;
        if (!newMessage.guild) return;

        // Only process in art-focused channels
        const channelName = (newMessage.channel as TextChannel).name?.toLowerCase() ?? '';
        if (!['art', 'nsfw'].includes(channelName)) return;

        // Check if message is within edit window (72h)
        const messageAge = Date.now() - newMessage.createdTimestamp;
        if (messageAge > EMBED_FIX_CONFIG.MESSAGE_EDIT_WINDOW_MS) {
            return;
        }

        // Check if message has any supported URLs
        const newUrls = urlMatcher.matchAllUrls(newMessage.content);
        if (newUrls.length === 0) return;

        // Always suppress embeds on edited messages with supported URLs
        // Discord regenerates embeds on edit, so we need to suppress them again
        const suppressEmbeds = async () => {
            await newMessage.suppressEmbeds(true).catch(() => {});
        };

        // Suppress immediately if embeds exist
        if (newMessage.embeds.length > 0) {
            await suppressEmbeds();
        }

        // Delayed suppression to catch Discord's async embed generation
        setTimeout(async () => {
            await suppressEmbeds();
        }, 1500);

        // Check if URLs changed (avoid reprocessing identical content for new embeds)
        const oldUrls = urlMatcher.matchAllUrls(oldMessage.content ?? '');

        // Get URL strings for comparison
        const oldUrlSet = new Set(oldUrls.map(m => m.url));

        // Check if there are any new URLs
        const hasNewUrls = newUrls.some(m => !oldUrlSet.has(m.url));
        if (!hasNewUrls) {
            return;
        }

        // Check rate limits
        if (!embedFixRateLimiter.check(newMessage.guild.id, newMessage.author.id)) {
            return;
        }

        // Process the edited message like a new message
        // Find URLs that weren't in the old message
        const newMatches = newUrls.filter(m => !oldUrlSet.has(m.url));
        if (newMatches.length === 0) return;

        // Check for duplicate
        const firstMatch = newMatches[0];
        const firstEmbedData = await this.processUrl(firstMatch);
        if (firstEmbedData) {
            const artworkId = this.generateArtworkId(firstEmbedData);
            const duplicateCheck = await getEmbedVotesService().checkDuplicate(
                artworkId,
                newMessage.guild.id,
                EMBED_FIX_CONFIG.DUPLICATE_WINDOW_MS
            );

            if (duplicateCheck.isDuplicate && duplicateCheck.originalShare) {
                await this.sendDuplicateNotice(newMessage, duplicateCheck.originalShare);
                return;
            }
        }

        // Process remaining new URLs
        const limitedMatches = newMatches.slice(0, EMBED_FIX_CONFIG.MAX_EMBEDS_PER_MESSAGE);
        const embedPromises = limitedMatches.slice(1).map(match => this.processUrl(match));
        const results = await Promise.all(embedPromises);
        const allResults = firstEmbedData ? [firstEmbedData, ...results] : results;

        // Track failed fixup URLs
        const failedFixupUrls: string[] = [];
        limitedMatches.forEach((match, index) => {
            const result = index === 0 ? firstEmbedData : results[index - 1];
            if (!result && this.isFixupUrl(match.url)) {
                failedFixupUrls.push(match.url);
            }
        });

        const validEmbeds = allResults.filter((data): data is EmbedData => data !== null);

        if (failedFixupUrls.length > 0 && validEmbeds.length === 0) {
            await this.sendFixupFallbackMessage(newMessage, failedFixupUrls);
            return;
        }

        if (validEmbeds.length === 0) return;

        await this.sendEmbedResponse(newMessage, validEmbeds, 0);
    }
}

// Export singleton getter
export function getEmbedFixService(): EmbedFixService {
    return EmbedFixService.getInstance();
}

// Export for message handler hook
export async function checkEmbedFixUrls(message: Message): Promise<void> {
    // Fast path checks
    const hasUrls = message.content.includes('http');
    const hasAttachments = message.attachments.size > 0;
    if (!hasUrls && !hasAttachments) return;
    if (message.author.bot) return;
    if (!message.guild) return;

    // Fire-and-forget - errors are logged internally
    getEmbedFixService().processMessage(message).catch(err => {
        if (message.guild) {
            logError(message.guild.id, message.guild.name, err as Error, 'EmbedFix');
        }
    });
}

// Export for message edit handler hook
export async function checkEmbedFixUrlsOnEdit(oldMessage: Message, newMessage: Message): Promise<void> {
    // Fast path checks
    if (!newMessage.content?.includes('http')) return;
    if (newMessage.author?.bot) return;
    if (!newMessage.guild) return;

    // Fire-and-forget - errors are logged internally
    getEmbedFixService().processMessageEdit(oldMessage, newMessage).catch(err => {
        if (newMessage.guild) {
            logError(newMessage.guild.id, newMessage.guild.name, err as Error, 'EmbedFix.Edit');
        }
    });
}
