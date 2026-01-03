/**
 * Base class for platform-specific embed handlers
 * Provides common functionality and defines the contract for handlers
 */

import { EMBED_FIX_CONFIG } from '../../../utils/data/embedFixConfig';
import { EmbedData, EmbedPlatform, PlatformHandler } from '../../../utils/interfaces/EmbedFix.interface';

export abstract class BaseHandler implements PlatformHandler {
    abstract platform: EmbedPlatform;
    abstract patterns: RegExp[];

    /**
     * Match a URL against this handler's patterns
     * @param url The URL to match
     * @returns The regex match array if matched, null otherwise
     */
    match(url: string): RegExpMatchArray | null {
        for (const pattern of this.patterns) {
            const match = url.match(pattern);
            if (match) {
                return match;
            }
        }
        return null;
    }

    /**
     * Fetch embed data from the platform's API
     * Must be implemented by subclasses
     */
    abstract fetchEmbed(match: RegExpMatchArray, url: string): Promise<EmbedData | null>;

    /**
     * Fetch with timeout helper
     * @param url The URL to fetch
     * @param timeout Timeout in ms (defaults to config)
     */
    protected async fetchWithTimeout(
        url: string,
        timeout: number = EMBED_FIX_CONFIG.API_TIMEOUT_MS
    ): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'RapiBot/1.0 (Discord Bot)',
                },
            });
            return response;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Generate a cache key for this platform
     * @param identifier Unique identifier (e.g., tweet ID, artwork ID)
     */
    protected getCacheKey(identifier: string): string {
        return `${this.platform}:${identifier}`;
    }
}
