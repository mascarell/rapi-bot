/**
 * URL Fix Service
 *
 * Replaces Twitter/X URLs with fixupx.com to leverage their embed service.
 * No API calls, no complex logic - just URL replacement.
 *
 * This fixes the infinite loop bug by:
 * 1. Early bot message filtering (CRITICAL: first check)
 * 2. Suppress original message embeds BEFORE replying
 * 3. Simple text replies (no embeds that trigger more events)
 * 4. Message ID tracking to prevent duplicates
 * 5. No messageUpdate processing
 */

import { Message, TextChannel } from 'discord.js';
import { logger } from '../../utils/logger.js';

// Fixup service domains that we should skip (already fixed)
const FIXUP_DOMAINS = [
    'vxtwitter.com',
    'fxtwitter.com',
    'fixupx.com',
    'fixvx.com',
    'twittpr.com',
    'girlcockx.com',
    'cunnyx.com'
];

// Pixiv proxy domain
const PIXIV_PROXY = 'phixiv.net';

// Track content IDs we've already processed (prevent duplicate replies)
// Format: "twitter:{statusId}" or "pixiv:{artworkId}"
// Maps content ID to original message info (for linking back)
interface OriginalMessageInfo {
    messageId: string;
    channelId: string;
    guildId: string;
}
const processedContentIds = new Map<string, OriginalMessageInfo>();

// Clean old entries every 5 minutes to prevent memory growth
setInterval(() => {
    if (processedContentIds.size > 1000) {
        processedContentIds.clear();
    }
}, 5 * 60 * 1000);

/**
 * URL Fix Service
 * Singleton pattern for consistent behavior
 */
export class UrlFixService {
    private static instance: UrlFixService;

    private constructor() {}

    public static getInstance(): UrlFixService {
        if (!UrlFixService.instance) {
            UrlFixService.instance = new UrlFixService();
        }
        return UrlFixService.instance;
    }

    /**
     * Clear all tracked content IDs (for testing)
     */
    public clearTrackedContent(): void {
        processedContentIds.clear();
    }

    /**
     * Extract Twitter status IDs from message content
     * Returns array of objects with contentId and fixedUrl
     */
    private extractTwitterUrls(content: string): Array<{ contentId: string; fixedUrl: string; platform: string }> {
        const allDomains = ['twitter\\.com', 'x\\.com', ...FIXUP_DOMAINS.map(d => d.replace('.', '\\.'))].join('|');

        const twitterRegex = new RegExp(
            `https?:\\/\\/(www\\.)?(mobile\\.)?(${allDomains})\\/(\\w+\\/)?status\\/(\\d+)`,
            'gi'
        );

        const urlMatches = [...content.matchAll(twitterRegex)];
        const results: Array<{ contentId: string; fixedUrl: string; platform: string }> = [];
        const seenIds = new Set<string>();

        for (const match of urlMatches) {
            const statusId = match[match.length - 1];
            if (statusId && !seenIds.has(statusId)) {
                seenIds.add(statusId);
                results.push({
                    contentId: `twitter:${statusId}`,
                    fixedUrl: `https://fixupx.com/i/status/${statusId}`,
                    platform: 'Twitter'
                });
            }
        }

        return results;
    }

    /**
     * Extract Pixiv artwork IDs from message content
     * Returns array of objects with contentId and fixedUrl
     */
    private extractPixivUrls(content: string): Array<{ contentId: string; fixedUrl: string; platform: string }> {
        // Regex patterns for Pixiv URLs:
        // 1. Standard: https://www.pixiv.net/artworks/123456
        // 2. With language: https://www.pixiv.net/en/artworks/123456
        // 3. Legacy: https://www.pixiv.net/member_illust.php?illust_id=123456
        // 4. Phixiv proxy: https://phixiv.net/artworks/123456

        const pixivRegex = /https?:\/\/(www\.)?(pixiv\.net|phixiv\.net)\/(en\/)?(artworks\/|member_illust\.php\?.*illust_id=)(\d+)/gi;

        const urlMatches = [...content.matchAll(pixivRegex)];
        const results: Array<{ contentId: string; fixedUrl: string; platform: string }> = [];
        const seenIds = new Set<string>();

        for (const match of urlMatches) {
            // Artwork ID is in the last capture group (group 5)
            const artworkId = match[5];
            if (artworkId && !seenIds.has(artworkId)) {
                seenIds.add(artworkId);
                results.push({
                    contentId: `pixiv:${artworkId}`,
                    fixedUrl: `https://${PIXIV_PROXY}/artworks/${artworkId}`,
                    platform: 'Pixiv'
                });
            }
        }

        return results;
    }

    /**
     * Process a message and replace Twitter/X and Pixiv URLs with proxy URLs
     *
     * Flow:
     * 1. Check if message is from a bot → return early
     * 2. Check if message is in #art or #nsfw channel → return early if not
     * 3. Extract content IDs from ALL supported URLs:
     *    - Twitter: status IDs from twitter.com, x.com, and proxy services
     *    - Pixiv: artwork IDs from pixiv.net and phixiv.net
     * 4. Check which content IDs are NEW (not already processed)
     * 5. Skip if all content IDs already processed (prevents duplicate replies)
     * 6. Convert to proxy formats:
     *    - Twitter: https://fixupx.com/i/status/{statusId}
     *    - Pixiv: https://phixiv.net/artworks/{artworkId}
     * 7. Reply with the fixed URL(s)
     * 8. Track content IDs → original message ID mapping
     * 9. Suppress original message embeds
     */
    public async processMessage(message: Message): Promise<void> {
        // CRITICAL: Bot check must be FIRST to prevent infinite loops
        if (message.author.bot) {
            return;
        }

        // Fast path checks (order matters for performance)
        if (!message.guild) {
            return;
        }
        if (!message.content.includes('http')) {
            return;
        }

        // Only process in art-focused channels
        const channelName = (message.channel as TextChannel).name?.toLowerCase() ?? '';
        if (!['art', 'nsfw'].includes(channelName)) {
            return;
        }

        // Extract content IDs from all supported URL formats (Twitter + Pixiv)
        const twitterUrls = this.extractTwitterUrls(message.content);
        const pixivUrls = this.extractPixivUrls(message.content);
        const allUrls = [...twitterUrls, ...pixivUrls];

        if (allUrls.length === 0) {
            return;
        }

        // Check which content IDs we haven't processed yet
        const newUrls: Array<{ contentId: string; fixedUrl: string; platform: string }> = [];
        const duplicateContentInfo: Array<{ contentId: string; platform: string; originalInfo: OriginalMessageInfo }> = [];

        for (const urlInfo of allUrls) {
            if (processedContentIds.has(urlInfo.contentId)) {
                const originalInfo = processedContentIds.get(urlInfo.contentId)!;
                duplicateContentInfo.push({
                    contentId: urlInfo.contentId,
                    platform: urlInfo.platform,
                    originalInfo
                });
                logger.debug`${urlInfo.platform} content ${urlInfo.contentId} already processed in message ${originalInfo.messageId}`;
            } else {
                newUrls.push(urlInfo);
            }
        }

        // If all content IDs are duplicates, reply with duplicate notification
        if (newUrls.length === 0 && duplicateContentInfo.length > 0) {
            // Suppress embeds on the duplicate message
            try {
                await message.suppressEmbeds(true).catch(() => {});

                // Create message links for all duplicates
                const duplicateLinks = duplicateContentInfo.map(({ contentId, originalInfo }) => {
                    const messageLink = `https://discord.com/channels/${originalInfo.guildId}/${originalInfo.channelId}/${originalInfo.messageId}`;
                    return `[Original](${messageLink})`;
                });

                // Reply with duplicate notification
                await message.reply({
                    content: `🔄 This was already shared → ${duplicateLinks.join(', ')}`,
                    allowedMentions: { repliedUser: false }
                });

                // Suppress again after delay
                setTimeout(async () => {
                    await message.suppressEmbeds(true).catch(() => {});
                }, 1500);

            } catch (error) {
                logger.error`Error sending duplicate notification: ${error}`;
            }
            return;
        }

        // If no new URLs found, skip
        if (newUrls.length === 0) {
            return;
        }

        // Get fixed URLs for all new content
        const fixedUrls = newUrls.map(urlInfo => urlInfo.fixedUrl);

        // Reply with fixed URLs (one per line)
        const replyContent = fixedUrls.join('\n');

        try {
            // Helper function to suppress embeds on the original message
            const suppressOriginalEmbeds = async () => {
                await message.suppressEmbeds(true).catch(() => {
                    // Ignore if we can't suppress embeds (missing permissions)
                });
            };

            // Suppress embeds immediately if they already exist
            if (message.embeds.length > 0) {
                await suppressOriginalEmbeds();
            }

            // Reply with fixed URLs
            const botReply = await message.reply({
                content: replyContent,
                allowedMentions: { repliedUser: false } // Don't ping the user
            });

            // Mark all new content IDs as processed, linking to this message
            for (const urlInfo of newUrls) {
                processedContentIds.set(urlInfo.contentId, {
                    messageId: message.id,
                    channelId: message.channel.id,
                    guildId: message.guild!.id
                });
            }

            // Suppress embeds again after a delay to catch Discord's async embed generation
            // Discord generates embeds asynchronously, so we need to wait and suppress again
            setTimeout(async () => {
                await suppressOriginalEmbeds();
            }, 1500);

        } catch (error) {
            logger.error`Error replying to message: ${error}`;
        }
    }
}

/**
 * Get the singleton instance of UrlFixService
 */
export const getUrlFixService = (): UrlFixService =>
    UrlFixService.getInstance();

/**
 * Export function for discord.ts messageCreate handler
 * This function signature matches the old embedFixService for easy replacement
 */
export async function checkEmbedFixUrls(message: Message): Promise<void> {
    getUrlFixService().processMessage(message).catch(err => {
        logger.error`Unexpected error: ${err}`;
    });
}
