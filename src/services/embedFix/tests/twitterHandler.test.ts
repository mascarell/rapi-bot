import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock config
vi.mock('../../../utils/data/embedFixConfig', () => ({
    EMBED_FIX_CONFIG: {
        API_TIMEOUT_MS: 5000,
        TWITTER_API: 'https://api.fxtwitter.com',
        EMBED_COLOR_TWITTER: 0x1DA1F2,
    },
}));

import { TwitterHandler, twitterHandler } from '../handlers/twitterHandler';

describe('TwitterHandler', () => {
    let handler: TwitterHandler;

    beforeEach(() => {
        handler = new TwitterHandler();
        mockFetch.mockReset();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('patterns', () => {
        it('should match twitter.com URLs', () => {
            const match = handler.match('https://twitter.com/user/status/1234567890');
            expect(match).not.toBeNull();
            expect(match?.[3]).toBe('user');
            expect(match?.[4]).toBe('1234567890');
        });

        it('should match x.com URLs', () => {
            const match = handler.match('https://x.com/someuser/status/9876543210');
            expect(match).not.toBeNull();
            expect(match?.[3]).toBe('someuser');
            expect(match?.[4]).toBe('9876543210');
        });

        it('should match www URLs', () => {
            const match = handler.match('https://www.twitter.com/user/status/123');
            expect(match).not.toBeNull();
        });

        it('should match mobile URLs', () => {
            const match = handler.match('https://mobile.twitter.com/user/status/123');
            expect(match).not.toBeNull();
        });

        it('should match vxtwitter URLs', () => {
            const match = handler.match('https://vxtwitter.com/user/status/123');
            expect(match).not.toBeNull();
        });

        it('should match fxtwitter URLs', () => {
            const match = handler.match('https://fxtwitter.com/user/status/123');
            expect(match).not.toBeNull();
        });

        it('should not match invalid URLs', () => {
            expect(handler.match('https://twitter.com/user')).toBeNull();
            expect(handler.match('https://twitter.com/user/following')).toBeNull();
            expect(handler.match('https://example.com/tweet')).toBeNull();
        });
    });

    describe('fetchEmbed', () => {
        const mockApiResponse = {
            code: 200,
            message: 'OK',
            tweet: {
                text: 'Hello, world!',
                created_at: '2024-01-15T12:00:00Z',
                author: {
                    name: 'Test User',
                    screen_name: 'testuser',
                    avatar_url: 'https://example.com/avatar.jpg',
                },
                media: {
                    photos: [
                        { url: 'https://pbs.twimg.com/media/photo1.jpg' },
                        { url: 'https://pbs.twimg.com/media/photo2.jpg' },
                    ],
                },
                possibly_sensitive: false,
            },
        };

        it('should fetch and parse tweet data successfully', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockApiResponse),
            });

            const match = handler.match('https://twitter.com/testuser/status/123456')!;
            const result = await handler.fetchEmbed(match, 'https://twitter.com/testuser/status/123456');

            expect(result).not.toBeNull();
            expect(result?.platform).toBe('twitter');
            expect(result?.description).toBe('Hello, world!');
            expect(result?.author.name).toBe('Test User');
            expect(result?.author.username).toBe('testuser');
            expect(result?.author.iconUrl).toBe('https://example.com/avatar.jpg');
            expect(result?.images).toHaveLength(2);
            expect(result?.isNsfw).toBe(false);
            expect(result?.color).toBe(0x1DA1F2);
        });

        it('should return null on API error', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
            });

            const match = handler.match('https://twitter.com/testuser/status/123456')!;
            const result = await handler.fetchEmbed(match, 'https://twitter.com/testuser/status/123456');

            expect(result).toBeNull();
        });

        it('should return null on invalid API response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ code: 404, message: 'Not found' }),
            });

            const match = handler.match('https://twitter.com/testuser/status/123456')!;
            const result = await handler.fetchEmbed(match, 'https://twitter.com/testuser/status/123456');

            expect(result).toBeNull();
        });

        it('should handle tweet with video', async () => {
            const responseWithVideo = {
                ...mockApiResponse,
                tweet: {
                    ...mockApiResponse.tweet,
                    media: {
                        videos: [
                            {
                                url: 'https://video.twimg.com/video.mp4',
                                thumbnail_url: 'https://pbs.twimg.com/thumb.jpg',
                            },
                        ],
                    },
                },
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(responseWithVideo),
            });

            const match = handler.match('https://twitter.com/testuser/status/123456')!;
            const result = await handler.fetchEmbed(match, 'https://twitter.com/testuser/status/123456');

            expect(result?.videos).toHaveLength(1);
            expect(result?.videos?.[0].url).toBe('https://video.twimg.com/video.mp4');
            expect(result?.videos?.[0].thumbnail).toBe('https://pbs.twimg.com/thumb.jpg');
        });

        it('should handle sensitive tweet', async () => {
            const sensitiveResponse = {
                ...mockApiResponse,
                tweet: {
                    ...mockApiResponse.tweet,
                    possibly_sensitive: true,
                },
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(sensitiveResponse),
            });

            const match = handler.match('https://twitter.com/testuser/status/123456')!;
            const result = await handler.fetchEmbed(match, 'https://twitter.com/testuser/status/123456');

            expect(result?.isNsfw).toBe(true);
        });

        it('should handle fetch error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const match = handler.match('https://twitter.com/testuser/status/123456')!;
            const result = await handler.fetchEmbed(match, 'https://twitter.com/testuser/status/123456');

            expect(result).toBeNull();
        });
    });

    describe('singleton instance', () => {
        it('should export a singleton instance', () => {
            expect(twitterHandler).toBeInstanceOf(TwitterHandler);
            expect(twitterHandler.platform).toBe('twitter');
        });
    });
});
