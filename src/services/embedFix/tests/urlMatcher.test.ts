import { describe, it, expect, beforeEach } from 'vitest';
import { urlMatcher } from '../urlMatcher';
import { EmbedData, PlatformHandler } from '../../../utils/interfaces/EmbedFix.interface';

// Create a mock handler for testing
class MockHandler implements PlatformHandler {
    platform = 'twitter' as const;
    patterns = [
        /https?:\/\/(www\.)?(twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/i,
    ];

    match(url: string): RegExpMatchArray | null {
        for (const pattern of this.patterns) {
            const match = url.match(pattern);
            if (match) return match;
        }
        return null;
    }

    async fetchEmbed(match: RegExpMatchArray, url: string): Promise<EmbedData | null> {
        return {
            platform: 'twitter',
            author: {
                name: 'Test Author',
                username: match[3],
                url: `https://twitter.com/${match[3]}`,
            },
            images: [],
            color: 0x1DA1F2,
            originalUrl: url,
        };
    }
}

describe('UrlMatcher', () => {
    beforeEach(() => {
        urlMatcher.clear();
    });

    describe('registerHandler', () => {
        it('should register a handler', () => {
            const handler = new MockHandler();
            urlMatcher.registerHandler(handler);
            expect(urlMatcher.hasHandlers()).toBe(true);
        });
    });

    describe('getHandler', () => {
        it('should return registered handler', () => {
            const handler = new MockHandler();
            urlMatcher.registerHandler(handler);
            expect(urlMatcher.getHandler('twitter')).toBe(handler);
        });

        it('should return undefined for non-registered platform', () => {
            expect(urlMatcher.getHandler('pixiv')).toBeUndefined();
        });
    });

    describe('matchUrl', () => {
        beforeEach(() => {
            urlMatcher.registerHandler(new MockHandler());
        });

        it('should match valid Twitter URL', () => {
            const result = urlMatcher.matchUrl('https://twitter.com/user/status/123456789');
            expect(result).not.toBeNull();
            expect(result?.platform).toBe('twitter');
            expect(result?.url).toBe('https://twitter.com/user/status/123456789');
        });

        it('should match x.com URL', () => {
            const result = urlMatcher.matchUrl('https://x.com/user/status/123456789');
            expect(result).not.toBeNull();
            expect(result?.platform).toBe('twitter');
        });

        it('should return null for non-matching URL', () => {
            const result = urlMatcher.matchUrl('https://example.com/page');
            expect(result).toBeNull();
        });

        it('should return null for empty URL', () => {
            const result = urlMatcher.matchUrl('');
            expect(result).toBeNull();
        });
    });

    describe('matchAllUrls', () => {
        beforeEach(() => {
            urlMatcher.registerHandler(new MockHandler());
        });

        it('should return empty array for content without http', () => {
            const result = urlMatcher.matchAllUrls('Just some text without links');
            expect(result).toEqual([]);
        });

        it('should match single URL in content', () => {
            const content = 'Check out this tweet: https://twitter.com/user/status/123456789';
            const result = urlMatcher.matchAllUrls(content);
            expect(result).toHaveLength(1);
            expect(result[0].platform).toBe('twitter');
        });

        it('should match multiple URLs in content', () => {
            const content = `
                First: https://twitter.com/user1/status/111
                Second: https://x.com/user2/status/222
                Third: https://twitter.com/user3/status/333
            `;
            const result = urlMatcher.matchAllUrls(content);
            expect(result).toHaveLength(3);
        });

        it('should skip duplicate URLs', () => {
            const content = `
                https://twitter.com/user/status/123
                Same again: https://twitter.com/user/status/123
            `;
            const result = urlMatcher.matchAllUrls(content);
            expect(result).toHaveLength(1);
        });

        it('should skip non-matching URLs', () => {
            const content = `
                https://twitter.com/user/status/123
                https://example.com/not-twitter
                https://twitter.com/user/status/456
            `;
            const result = urlMatcher.matchAllUrls(content);
            expect(result).toHaveLength(2);
        });
    });

    describe('hasHandlers', () => {
        it('should return false when no handlers registered', () => {
            expect(urlMatcher.hasHandlers()).toBe(false);
        });

        it('should return true when handlers are registered', () => {
            urlMatcher.registerHandler(new MockHandler());
            expect(urlMatcher.hasHandlers()).toBe(true);
        });
    });

    describe('clear', () => {
        it('should remove all handlers', () => {
            urlMatcher.registerHandler(new MockHandler());
            expect(urlMatcher.hasHandlers()).toBe(true);

            urlMatcher.clear();
            expect(urlMatcher.hasHandlers()).toBe(false);
        });
    });
});
