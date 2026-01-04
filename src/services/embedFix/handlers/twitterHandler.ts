/**
 * Twitter/X Handler
 * Uses FxTwitter API to fetch tweet data for embed generation
 */

import { EMBED_FIX_CONFIG } from '../../../utils/data/embedFixConfig';
import { EmbedData, EmbedPlatform } from '../../../utils/interfaces/EmbedFix.interface';
import { BaseHandler } from './baseHandler';

interface FxTwitterAuthor {
    name: string;
    screen_name: string;
    avatar_url?: string;
    url?: string;
}

interface FxTwitterVideoVariant {
    url: string;
    bitrate?: number;
    content_type?: string;
}

interface FxTwitterVideo {
    url: string;
    thumbnail_url?: string;
    duration?: number;
    format?: string;
    type?: 'video' | 'gif';
    variants?: FxTwitterVideoVariant[];
}

interface FxTwitterMedia {
    photos?: Array<{ url: string }>;
    videos?: FxTwitterVideo[];
}

interface FxTwitterTweet {
    text: string;
    created_at?: string;
    author: FxTwitterAuthor;
    media?: FxTwitterMedia;
    possibly_sensitive?: boolean;
}

interface FxTwitterResponse {
    code: number;
    message: string;
    tweet?: FxTwitterTweet;
}

export class TwitterHandler extends BaseHandler {
    platform: EmbedPlatform = 'twitter';

    patterns: RegExp[] = [
        // Standard twitter.com and x.com URLs
        /https?:\/\/(www\.)?(twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/i,
        // Mobile URLs
        /https?:\/\/(mobile\.)?(twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/i,
        // Fixup services (vxtwitter, fxtwitter, fixupx, fixvx, twittpr, etc.)
        /https?:\/\/(www\.)?(vxtwitter\.com|fxtwitter\.com|fixupx\.com|fixvx\.com|twittpr\.com)\/(\w+)\/status\/(\d+)/i,
    ];

    async fetchEmbed(match: RegExpMatchArray, url: string): Promise<EmbedData | null> {
        // Extract username and status ID from the match
        // Pattern groups: [full, www?, domain, username, statusId]
        const username = match[3];
        const statusId = match[4];

        if (!username || !statusId) {
            console.log('[TwitterHandler] Could not extract username or statusId from URL:', url);
            return null;
        }

        try {
            const apiUrl = `${EMBED_FIX_CONFIG.TWITTER_API}/${username}/status/${statusId}`;
            const response = await this.fetchWithTimeout(apiUrl);

            if (!response.ok) {
                console.log(`[TwitterHandler] API returned ${response.status} for ${url}`);
                return null;
            }

            const data: FxTwitterResponse = await response.json();

            if (data.code !== 200 || !data.tweet) {
                console.log(`[TwitterHandler] Invalid response for ${url}:`, data.message);
                return null;
            }

            const tweet = data.tweet;
            const author = tweet.author;

            // Extract images from media
            const images: string[] = [];
            if (tweet.media?.photos) {
                for (const photo of tweet.media.photos) {
                    if (photo.url) {
                        images.push(photo.url);
                    }
                }
            }

            // Extract videos from media (with variants for quality selection)
            const videos: Array<{
                url: string;
                thumbnail?: string;
                variants?: Array<{ url: string; bitrate?: number; content_type?: string }>;
                type?: 'video' | 'gif';
            }> = [];
            if (tweet.media?.videos) {
                for (const video of tweet.media.videos) {
                    if (video.url) {
                        // Sort variants by bitrate (highest first) for quality selection
                        const sortedVariants = video.variants
                            ?.filter(v => v.content_type === 'video/mp4')
                            .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

                        videos.push({
                            url: video.url,
                            thumbnail: video.thumbnail_url,
                            variants: sortedVariants,
                            type: video.type,
                        });
                    }
                }
            }

            return {
                platform: 'twitter',
                description: tweet.text,
                author: {
                    name: author.name,
                    username: author.screen_name,
                    url: `https://twitter.com/${author.screen_name}`,
                    iconUrl: author.avatar_url,
                },
                images,
                videos: videos.length > 0 ? videos : undefined,
                timestamp: tweet.created_at,
                color: EMBED_FIX_CONFIG.EMBED_COLOR_TWITTER,
                originalUrl: url,
                isNsfw: tweet.possibly_sensitive,
            };
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                console.log(`[TwitterHandler] Request timed out for ${url}`);
            } else {
                console.error(`[TwitterHandler] Error fetching ${url}:`, error);
            }
            return null;
        }
    }

    /**
     * Get cache key for a Twitter URL
     * @param match The regex match from the URL
     */
    getCacheKeyFromMatch(match: RegExpMatchArray): string {
        const statusId = match[4];
        return this.getCacheKey(statusId);
    }
}

// Export singleton instance
export const twitterHandler = new TwitterHandler();
