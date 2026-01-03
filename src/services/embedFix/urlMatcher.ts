/**
 * URL Matcher for embed fix feature
 * Compiles regex patterns once at initialization and matches URLs against handlers
 */

import { EmbedPlatform, MatchedUrl, PlatformHandler } from '../../utils/interfaces/EmbedFix.interface';

class UrlMatcher {
    private handlers: Map<EmbedPlatform, PlatformHandler> = new Map();

    /**
     * Register a platform handler
     * @param handler The handler to register
     */
    registerHandler(handler: PlatformHandler): void {
        this.handlers.set(handler.platform, handler);
    }

    /**
     * Get a registered handler by platform
     * @param platform The platform to get handler for
     */
    getHandler(platform: EmbedPlatform): PlatformHandler | undefined {
        return this.handlers.get(platform);
    }

    /**
     * Get all registered handlers
     */
    getHandlers(): PlatformHandler[] {
        return Array.from(this.handlers.values());
    }

    /**
     * Match a single URL against registered handlers
     * @param url The URL to match
     * @returns The matched URL info or null if no match
     */
    matchUrl(url: string): MatchedUrl | null {
        for (const handler of this.handlers.values()) {
            const match = handler.match(url);
            if (match) {
                return {
                    url,
                    platform: handler.platform,
                    match,
                    handler,
                };
            }
        }
        return null;
    }

    /**
     * Extract all URLs from content and match against handlers
     * @param content The message content to search
     * @returns Array of matched URLs (may be empty)
     */
    matchAllUrls(content: string): MatchedUrl[] {
        // Early exit if no http present
        if (!content.includes('http')) {
            return [];
        }

        // Extract all URLs from the content
        const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
        const urls = content.match(urlRegex);

        if (!urls) {
            return [];
        }

        // Match each URL against handlers
        const matches: MatchedUrl[] = [];
        const seenUrls = new Set<string>();

        for (const url of urls) {
            // Skip duplicates
            if (seenUrls.has(url)) {
                continue;
            }
            seenUrls.add(url);

            const matched = this.matchUrl(url);
            if (matched) {
                matches.push(matched);
            }
        }

        return matches;
    }

    /**
     * Check if any handlers are registered
     */
    hasHandlers(): boolean {
        return this.handlers.size > 0;
    }

    /**
     * Clear all handlers (for testing)
     */
    clear(): void {
        this.handlers.clear();
    }
}

// Export singleton instance
export const urlMatcher = new UrlMatcher();
