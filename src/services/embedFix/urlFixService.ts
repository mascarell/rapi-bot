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
     * 3. Extract status IDs from ALL Twitter/X URLs (twitter.com, x.com, AND fixup services)
     * 4. Deduplicate status IDs (in case same tweet posted multiple times)
     * 5. Convert to consistent fixupx.com format: https://fixupx.com/i/status/{statusId}
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

        console.log(`[UrlFix] Message content: ${message.content}`);

        // Extract status IDs from all supported Twitter/X URL formats
        // This includes: twitter.com, x.com, and all fixup service domains
        const allDomains = ['twitter\\.com', 'x\\.com', ...FIXUP_DOMAINS.map(d => d.replace('.', '\\.'))].join('|');

        // Regex to extract status IDs from any Twitter URL format
        // Pattern 1: /username/status/statusId (standard Twitter format)
        // Pattern 2: /i/status/statusId (fixupx.com format)
        const twitterRegex = new RegExp(
            `https?:\\/\\/(www\\.)?(mobile\\.)?(${allDomains})\\/(\\w+\\/)?status\\/(\\d+)`,
            'gi'
        );

        const urlMatches = [...message.content.matchAll(twitterRegex)];

        console.log(`[UrlFix] Found ${urlMatches.length} Twitter/X URLs with status IDs`);

        if (urlMatches.length === 0) {
            console.log('[UrlFix] No Twitter/X status URLs found, skipping');
            return;
        }

        // Extract unique status IDs and convert to fixupx.com format
        const statusIds = new Set<string>();
        for (const match of urlMatches) {
            // Status ID is in the last capture group
            const statusId = match[match.length - 1];
            if (statusId) {
                statusIds.add(statusId);
            }
        }

        console.log(`[UrlFix] Extracted ${statusIds.size} unique status IDs`);

        // Convert all to fixupx.com format: https://fixupx.com/i/status/{statusId}
        const fixedUrls = Array.from(statusIds).map(statusId =>
            `https://fixupx.com/i/status/${statusId}`
        );

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
