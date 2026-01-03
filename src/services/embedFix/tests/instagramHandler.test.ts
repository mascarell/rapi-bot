import { describe, it, expect, beforeEach } from 'vitest';
import { InstagramHandler, instagramHandler } from '../handlers/instagramHandler';

describe('InstagramHandler', () => {
    let handler: InstagramHandler;

    beforeEach(() => {
        handler = new InstagramHandler();
    });

    describe('patterns', () => {
        it('should match post URLs', () => {
            const match = handler.match('https://instagram.com/p/ABC123xyz/');
            expect(match).not.toBeNull();
        });

        it('should match post URLs with www', () => {
            const match = handler.match('https://www.instagram.com/p/ABC123xyz/');
            expect(match).not.toBeNull();
        });

        it('should match reel URLs', () => {
            const match = handler.match('https://instagram.com/reel/XYZ789abc/');
            expect(match).not.toBeNull();
        });

        it('should match TV URLs', () => {
            const match = handler.match('https://instagram.com/tv/DEF456ghi/');
            expect(match).not.toBeNull();
        });

        it('should match ddinstagram proxy URLs', () => {
            const match = handler.match('https://ddinstagram.com/p/ABC123xyz/');
            expect(match).not.toBeNull();
        });

        it('should match ddinstagram reel URLs', () => {
            const match = handler.match('https://ddinstagram.com/reel/XYZ789abc/');
            expect(match).not.toBeNull();
        });

        it('should not match user profile URLs', () => {
            const match = handler.match('https://instagram.com/username');
            expect(match).toBeNull();
        });

        it('should not match story URLs', () => {
            const match = handler.match('https://instagram.com/stories/username/123456');
            expect(match).toBeNull();
        });

        it('should not match non-instagram URLs', () => {
            const match = handler.match('https://example.com/p/ABC123xyz/');
            expect(match).toBeNull();
        });
    });

    describe('fetchEmbed', () => {
        it('should return URL rewrite data for post URL', async () => {
            const match = handler.match('https://instagram.com/p/ABC123xyz/')!;
            const result = await handler.fetchEmbed(match, 'https://instagram.com/p/ABC123xyz/');

            expect(result).not.toBeNull();
            expect(result?.platform).toBe('instagram');
            expect(result?._useUrlRewrite).toBe(true);
            expect(result?._rewrittenUrl).toBe('https://ddinstagram.com/p/ABC123xyz/');
            expect(result?.originalUrl).toBe('https://instagram.com/p/ABC123xyz/');
        });

        it('should return URL rewrite data for reel URL', async () => {
            const match = handler.match('https://instagram.com/reel/XYZ789abc/')!;
            const result = await handler.fetchEmbed(match, 'https://instagram.com/reel/XYZ789abc/');

            expect(result?._rewrittenUrl).toBe('https://ddinstagram.com/reel/XYZ789abc/');
        });

        it('should strip www from URL', async () => {
            const match = handler.match('https://www.instagram.com/p/ABC123xyz/')!;
            const result = await handler.fetchEmbed(match, 'https://www.instagram.com/p/ABC123xyz/');

            expect(result?._rewrittenUrl).toBe('https://ddinstagram.com/p/ABC123xyz/');
        });

        it('should have correct color', async () => {
            const match = handler.match('https://instagram.com/p/ABC123xyz/')!;
            const result = await handler.fetchEmbed(match, 'https://instagram.com/p/ABC123xyz/');

            expect(result?.color).toBe(0xE1306C);
        });
    });

    describe('singleton instance', () => {
        it('should export a singleton instance', () => {
            expect(instagramHandler).toBeInstanceOf(InstagramHandler);
            expect(instagramHandler.platform).toBe('instagram');
        });
    });
});
