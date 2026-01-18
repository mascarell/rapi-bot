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

// Track messages we've already replied to (prevent duplicates)
const repliedMessages = new Set<string>();

// Clean old entries every 5 minutes to prevent memory growth
setInterval(() => {
    if (repliedMessages.size > 1000) {
        console.log(`[UrlFix] Clearing ${repliedMessages.size} tracked messages`);
        repliedMessages.clear();
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
     * Process a message and replace Twitter/X URLs with fixupx.com
     *
     * Flow:
     * 1. Check if message is from a bot → return early
     * 2. Check if message is in #art or #nsfw channel → return early if not
     * 3. Skip if message contains fixup service URLs (already fixed)
     * 4. Extract status IDs from Twitter/X URLs
     * 5. Convert to fixupx.com format: https://fixupx.com/i/status/{statusId}
     * 6. Reply with the fixed URL(s)
     * 7. Suppress original message embeds
     */
    public async processMessage(message: Message): Promise<void> {
        console.log(`[UrlFix] processMessage called for message from ${message.author.username} in ${message.guild?.name}`);

        // CRITICAL: Bot check must be FIRST to prevent infinite loops
        if (message.author.bot) {
            console.log('[UrlFix] Skipping bot message');
            return;
        }

        // Fast path checks (order matters for performance)
        if (!message.guild) {
            console.log('[UrlFix] Skipping non-guild message');
            return;
        }
        if (!message.content.includes('http')) {
            console.log('[UrlFix] No URLs detected in message');
            return;
        }

        // Only process in art-focused channels
        const channelName = (message.channel as TextChannel).name?.toLowerCase() ?? '';
        console.log(`[UrlFix] Channel name: #${channelName}`);
        if (!['art', 'nsfw'].includes(channelName)) {
            console.log(`[UrlFix] Skipping channel #${channelName} (not art or nsfw)`);
            return;
        }

        console.log('[UrlFix] Channel check passed, processing message');

        // Check if we already replied to this message (deduplication)
        if (repliedMessages.has(message.id)) {
            console.log(`[UrlFix] Skipping duplicate message ${message.id}`);
            return;
        }

        // Check if message contains fixup service URLs (skip if already fixed)
        const hasFixupUrl = FIXUP_DOMAINS.some(domain => message.content.includes(domain));
        if (hasFixupUrl) {
            console.log('[UrlFix] Message contains fixup service URL, skipping (already fixed)');
            return;
        }

        // Extract Twitter/X URLs and their status IDs
        // Matches: https://x.com/username/status/123456 or https://twitter.com/username/status/123456
        // Also matches mobile URLs, www variants, and fixup service URLs
        console.log(`[UrlFix] Message content: ${message.content}`);

        // Regex to extract status IDs from Twitter URLs
        // Captures: username and status ID from /username/status/statusId
        const twitterRegex = /https?:\/\/(www\.)?(mobile\.)?(twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/gi;
        const urlMatches = [...message.content.matchAll(twitterRegex)];

        console.log(`[UrlFix] Found ${urlMatches.length} Twitter/X URLs with status IDs`);

        if (urlMatches.length === 0) {
            console.log('[UrlFix] No Twitter/X status URLs found, skipping');
            return;
        }

        // Convert all URLs to fixupx.com format: https://fixupx.com/i/status/{statusId}
        const fixedUrls = urlMatches.map(match => {
            const statusId = match[5]; // Status ID is in capture group 5
            return `https://fixupx.com/i/status/${statusId}`;
        });

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

            // Mark as replied to prevent duplicates
            repliedMessages.add(message.id);

            // Suppress embeds again after a delay to catch Discord's async embed generation
            // Discord generates embeds asynchronously, so we need to wait and suppress again
            setTimeout(async () => {
                await suppressOriginalEmbeds();
            }, 1500);

            console.log(`[UrlFix] Replied to ${message.author.username} with ${fixedUrls.length} fixed URL(s) in #${channelName}`);
        } catch (error) {
            console.error('[UrlFix] Error replying to message:', error);
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
        console.error('[UrlFix] Unexpected error:', err);
    });
}
