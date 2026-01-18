/**
 * Instagram Handler
 * Uses URL rewrite approach with ddinstagram.com proxy
 */

import { EMBED_FIX_CONFIG } from '../../../utils/data/embedFixConfig';
import { EmbedData, EmbedPlatform } from '../../../utils/interfaces/EmbedFix.interface';
import { BaseHandler } from './baseHandler.js';

export class InstagramHandler extends BaseHandler {
    platform: EmbedPlatform = 'instagram';

    patterns: RegExp[] = [
        // Post URLs
        /https?:\/\/(www\.)?instagram\.com\/p\/([A-Za-z0-9_-]+)/i,
        // Reel URLs
        /https?:\/\/(www\.)?instagram\.com\/reel\/([A-Za-z0-9_-]+)/i,
        // TV URLs
        /https?:\/\/(www\.)?instagram\.com\/tv\/([A-Za-z0-9_-]+)/i,
        // Already-fixed ddinstagram URLs
        /https?:\/\/(www\.)?ddinstagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)/i,
    ];

    async fetchEmbed(match: RegExpMatchArray, url: string): Promise<EmbedData | null> {
        // Rewrite instagram.com to ddinstagram.com
        const rewrittenUrl = url
            .replace(/instagram\.com/, EMBED_FIX_CONFIG.INSTAGRAM_PROXY)
            .replace(/www\./, '');

        return {
            platform: 'instagram',
            author: {
                name: 'Instagram',
                username: 'instagram',
                url: url,
            },
            images: [],
            color: EMBED_FIX_CONFIG.EMBED_COLOR_INSTAGRAM,
            originalUrl: url,
            _useUrlRewrite: true,
            _rewrittenUrl: rewrittenUrl,
        };
    }
}

export const instagramHandler = new InstagramHandler();
