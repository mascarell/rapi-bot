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
     * 3. Extract Twitter/X URLs using regex
     * 4. Replace x.com/twitter.com with fixupx.com
     * 5. Reply with the modified URL(s)
     */
    public async processMessage(message: Message): Promise<void> {
        // CRITICAL: Bot check must be FIRST to prevent infinite loops
        if (message.author.bot) return;

        // Fast path checks (order matters for performance)
        if (!message.guild) return;
        if (!message.content.includes('http')) return;

        // Only process in art-focused channels
        const channelName = (message.channel as TextChannel).name?.toLowerCase() ?? '';
        if (!['art', 'nsfw'].includes(channelName)) return;

        // Check if we already replied to this message (deduplication)
        if (repliedMessages.has(message.id)) {
            console.log(`[SimpleEmbedFix] Skipping duplicate message ${message.id}`);
            return;
        }

        // Extract Twitter/X URLs using regex
        // Matches: https://x.com/user/status/123 or https://twitter.com/user/status/123
        const twitterRegex = /https?:\/\/(x\.com|twitter\.com)\/[^\s]+/g;
        const matches = message.content.match(twitterRegex);

        if (!matches || matches.length === 0) return;

        // Replace domains with fixupx.com
        const fixedUrls = matches.map(url =>
            url.replace(/(x\.com|twitter\.com)/, 'fixupx.com')
        );

        // Reply with fixed URLs (one per line)
        const replyContent = fixedUrls.join('\n');

        try {
            // Suppress the original message's embeds to prevent Discord's auto-embed
            // This must happen BEFORE we reply to avoid triggering our own processing
            await message.suppressEmbeds(true).catch(err => {
                console.error('[UrlFix] Failed to suppress embeds:', err);
                // Continue anyway - suppression failure shouldn't stop the reply
            });

            await message.reply({
                content: replyContent,
                allowedMentions: { repliedUser: false } // Don't ping the user
            });

            // Mark as replied to prevent duplicates
            repliedMessages.add(message.id);

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
