import { describe, it, expect, beforeEach } from 'vitest';
import { PixivHandler, pixivHandler } from '../handlers/pixivHandler';

describe('PixivHandler', () => {
    let handler: PixivHandler;

    beforeEach(() => {
        handler = new PixivHandler();
    });

    describe('patterns', () => {
        it('should match standard artwork URLs', () => {
            const match = handler.match('https://pixiv.net/artworks/12345678');
            expect(match).not.toBeNull();
        });

        it('should match artwork URLs with www', () => {
            const match = handler.match('https://www.pixiv.net/artworks/12345678');
            expect(match).not.toBeNull();
        });

        it('should match English artwork URLs', () => {
            const match = handler.match('https://pixiv.net/en/artworks/12345678');
            expect(match).not.toBeNull();
        });

        it('should match legacy illustration URLs', () => {
            const match = handler.match('https://pixiv.net/member_illust.php?mode=medium&illust_id=12345678');
            expect(match).not.toBeNull();
        });

        it('should match phixiv proxy URLs', () => {
            const match = handler.match('https://phixiv.net/artworks/12345678');
            expect(match).not.toBeNull();
        });

        it('should not match user profile URLs', () => {
            const match = handler.match('https://pixiv.net/users/12345678');
            expect(match).toBeNull();
        });

        it('should not match non-pixiv URLs', () => {
            const match = handler.match('https://example.com/artworks/12345678');
            expect(match).toBeNull();
        });
    });

    describe('fetchEmbed', () => {
        it('should return URL rewrite data for standard artwork URL', async () => {
            const match = handler.match('https://pixiv.net/artworks/12345678')!;
            const result = await handler.fetchEmbed(match, 'https://pixiv.net/artworks/12345678');

            expect(result).not.toBeNull();
            expect(result?.platform).toBe('pixiv');
            expect(result?._useUrlRewrite).toBe(true);
            expect(result?._rewrittenUrl).toBe('https://phixiv.net/artworks/12345678');
            expect(result?.originalUrl).toBe('https://pixiv.net/artworks/12345678');
        });

        it('should return URL rewrite data for English artwork URL', async () => {
            const match = handler.match('https://pixiv.net/en/artworks/87654321')!;
            const result = await handler.fetchEmbed(match, 'https://pixiv.net/en/artworks/87654321');

            expect(result?._rewrittenUrl).toBe('https://phixiv.net/artworks/87654321');
        });

        it('should return URL rewrite data for legacy URL', async () => {
            const match = handler.match('https://pixiv.net/member_illust.php?illust_id=11111111')!;
            const result = await handler.fetchEmbed(match, 'https://pixiv.net/member_illust.php?illust_id=11111111');

            expect(result?._rewrittenUrl).toBe('https://phixiv.net/artworks/11111111');
        });

        it('should have correct color', async () => {
            const match = handler.match('https://pixiv.net/artworks/12345678')!;
            const result = await handler.fetchEmbed(match, 'https://pixiv.net/artworks/12345678');

            expect(result?.color).toBe(0x0096FA);
        });
    });

    describe('singleton instance', () => {
        it('should export a singleton instance', () => {
            expect(pixivHandler).toBeInstanceOf(PixivHandler);
            expect(pixivHandler.platform).toBe('pixiv');
        });
    });
});
