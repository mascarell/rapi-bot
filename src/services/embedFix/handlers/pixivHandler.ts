/**
 * Pixiv Handler
 * Uses URL rewrite approach with phixiv.net proxy
 */

import { EMBED_FIX_CONFIG } from '../../../utils/data/embedFixConfig';
import { EmbedData, EmbedPlatform } from '../../../utils/interfaces/EmbedFix.interface';
import { BaseHandler } from './baseHandler';

export class PixivHandler extends BaseHandler {
    platform: EmbedPlatform = 'pixiv';

    patterns: RegExp[] = [
        // Standard artwork URLs
        /https?:\/\/(www\.)?pixiv\.net\/(en\/)?artworks\/(\d+)/i,
        // Legacy illustration URLs
        /https?:\/\/(www\.)?pixiv\.net\/member_illust\.php\?.*illust_id=(\d+)/i,
        // Phixiv proxy URLs (already fixed)
        /https?:\/\/(www\.)?phixiv\.net\/artworks\/(\d+)/i,
    ];

    async fetchEmbed(match: RegExpMatchArray, url: string): Promise<EmbedData | null> {
        // Extract artwork ID from different URL patterns
        const artworkId = this.extractArtworkId(match, url);
        if (!artworkId) {
            console.log(`[PixivHandler] Could not extract artwork ID from ${url}`);
            return null;
        }

        // Use URL rewrite approach - phixiv.net handles the embed
        const rewrittenUrl = `${EMBED_FIX_CONFIG.PIXIV_PROXY}/artworks/${artworkId}`;

        // Always use canonical pixiv.net URL for originalUrl
        // This ensures duplicate detection works for both pixiv.net and phixiv.net URLs
        const canonicalUrl = `https://www.pixiv.net/artworks/${artworkId}`;

        return {
            platform: 'pixiv',
            author: {
                name: 'Pixiv Artist',
                username: 'pixiv',
                url: canonicalUrl,
            },
            images: [],
            color: EMBED_FIX_CONFIG.EMBED_COLOR_PIXIV,
            originalUrl: canonicalUrl,
            _useUrlRewrite: true,
            _rewrittenUrl: rewrittenUrl,
        };
    }

    /**
     * Extract artwork ID from various Pixiv URL formats
     */
    private extractArtworkId(match: RegExpMatchArray, url: string): string | null {
        // Check for illust_id parameter in legacy URLs
        const paramMatch = url.match(/illust_id=(\d+)/);
        if (paramMatch) return paramMatch[1];

        // Return last captured group that is numeric (artwork ID)
        for (let i = match.length - 1; i >= 0; i--) {
            if (match[i] && /^\d+$/.test(match[i])) {
                return match[i];
            }
        }
        return null;
    }
}

export const pixivHandler = new PixivHandler();
