import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ASSET_PATHS,
  getAssetUrls,
  DEFAULT_IMAGE_EXTENSIONS,
  DEFAULT_VIDEO_EXTENSIONS,
  DEFAULT_MEDIA_EXTENSIONS,
  getCdnUrl,
  isSupportedImageExtension,
  isSupportedVideoExtension,
  isSupportedMediaExtension
} from './assets.js';

describe('assets.ts', () => {
  const originalCdnUrl = process.env.CDN_DOMAIN_URL;

  beforeEach(() => {
    // Set a test CDN URL
    process.env.CDN_DOMAIN_URL = 'https://test-cdn.example.com';
  });

  afterEach(() => {
    // Restore original CDN URL
    process.env.CDN_DOMAIN_URL = originalCdnUrl;
  });

  describe('ASSET_PATHS', () => {
    it('should have rapiBot paths', () => {
      expect(ASSET_PATHS.rapiBot.thumbnail).toBe('assets/rapi-bot-thumbnail.jpg');
      expect(ASSET_PATHS.rapiBot.icon).toBe('assets/rapi-bot-icon.png');
    });

    it('should have logo paths', () => {
      expect(ASSET_PATHS.logos.gfl2).toBe('assets/logos/gfl2-logo.png');
      expect(ASSET_PATHS.logos.nikke).toBe('assets/logos/nikke-logo.png');
      expect(ASSET_PATHS.logos.blueArchive).toBe('assets/logos/blue-archive-logo.png');
    });

    it('should have command paths', () => {
      expect(ASSET_PATHS.commands.skillissue).toBe('commands/skillissue/');
      expect(ASSET_PATHS.commands.seggs).toBe('commands/seggs/');
    });
  });

  describe('getAssetUrls', () => {
    it('should construct full URLs for rapiBot assets', () => {
      const urls = getAssetUrls();
      expect(urls.rapiBot.thumbnail).toBe(
        'https://test-cdn.example.com/assets/rapi-bot-thumbnail.jpg'
      );
      expect(urls.rapiBot.icon).toBe(
        'https://test-cdn.example.com/assets/rapi-bot-icon.png'
      );
    });

    it('should construct full URLs for logos', () => {
      const urls = getAssetUrls();
      expect(urls.logos.gfl2).toBe(
        'https://test-cdn.example.com/assets/logos/gfl2-logo.png'
      );
      expect(urls.logos.nikke).toBe(
        'https://test-cdn.example.com/assets/logos/nikke-logo.png'
      );
      expect(urls.logos.blueArchive).toBe(
        'https://test-cdn.example.com/assets/logos/blue-archive-logo.png'
      );
    });

    it('should return empty CDN domain when not set', () => {
      delete process.env.CDN_DOMAIN_URL;
      const urls = getAssetUrls();
      expect(urls.rapiBot.thumbnail).toBe('/assets/rapi-bot-thumbnail.jpg');
    });
  });

  describe('DEFAULT_IMAGE_EXTENSIONS', () => {
    it('should contain standard image extensions', () => {
      expect(DEFAULT_IMAGE_EXTENSIONS).toEqual(['.gif', '.png', '.jpg', '.webp']);
    });

    it('should have correct length', () => {
      expect(DEFAULT_IMAGE_EXTENSIONS.length).toBe(4);
    });
  });

  describe('DEFAULT_VIDEO_EXTENSIONS', () => {
    it('should contain standard video extensions', () => {
      expect(DEFAULT_VIDEO_EXTENSIONS).toEqual(['.mp4']);
    });

    it('should have correct length', () => {
      expect(DEFAULT_VIDEO_EXTENSIONS.length).toBe(1);
    });
  });

  describe('DEFAULT_MEDIA_EXTENSIONS', () => {
    it('should combine image and video extensions', () => {
      expect(DEFAULT_MEDIA_EXTENSIONS).toEqual(['.gif', '.png', '.jpg', '.webp', '.mp4']);
    });

    it('should have correct length', () => {
      expect(DEFAULT_MEDIA_EXTENSIONS.length).toBe(5);
    });
  });

  describe('getCdnUrl', () => {
    it('should construct CDN URL from path', () => {
      const result = getCdnUrl('assets/test.png');
      expect(result).toBe('https://test-cdn.example.com/assets/test.png');
    });

    it('should handle paths with leading slash', () => {
      const result = getCdnUrl('/assets/test.png');
      expect(result).toBe('https://test-cdn.example.com/assets/test.png');
    });

    it('should handle paths without leading slash', () => {
      const result = getCdnUrl('assets/test.png');
      expect(result).toBe('https://test-cdn.example.com/assets/test.png');
    });

    it('should throw error if CDN_DOMAIN_URL is not set', () => {
      delete process.env.CDN_DOMAIN_URL;
      expect(() => getCdnUrl('test.png')).toThrow('CDN_DOMAIN_URL environment variable is not set');
    });

    it('should handle empty path', () => {
      const result = getCdnUrl('');
      expect(result).toBe('https://test-cdn.example.com/');
    });
  });

  describe('isSupportedImageExtension', () => {
    it('should return true for supported image extensions', () => {
      expect(isSupportedImageExtension('.gif')).toBe(true);
      expect(isSupportedImageExtension('.png')).toBe(true);
      expect(isSupportedImageExtension('.jpg')).toBe(true);
      expect(isSupportedImageExtension('.webp')).toBe(true);
    });

    it('should return false for unsupported extensions', () => {
      expect(isSupportedImageExtension('.svg')).toBe(false);
      expect(isSupportedImageExtension('.bmp')).toBe(false);
      expect(isSupportedImageExtension('.mp4')).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(isSupportedImageExtension('.PNG')).toBe(false);
      expect(isSupportedImageExtension('.Jpg')).toBe(false);
    });

    it('should handle extensions without dot', () => {
      expect(isSupportedImageExtension('png')).toBe(false);
    });
  });

  describe('isSupportedVideoExtension', () => {
    it('should return true for supported video extensions', () => {
      expect(isSupportedVideoExtension('.mp4')).toBe(true);
    });

    it('should return false for unsupported extensions', () => {
      expect(isSupportedVideoExtension('.avi')).toBe(false);
      expect(isSupportedVideoExtension('.mov')).toBe(false);
      expect(isSupportedVideoExtension('.png')).toBe(false);
    });
  });

  describe('isSupportedMediaExtension', () => {
    it('should return true for both image and video extensions', () => {
      expect(isSupportedMediaExtension('.gif')).toBe(true);
      expect(isSupportedMediaExtension('.png')).toBe(true);
      expect(isSupportedMediaExtension('.jpg')).toBe(true);
      expect(isSupportedMediaExtension('.webp')).toBe(true);
      expect(isSupportedMediaExtension('.mp4')).toBe(true);
    });

    it('should return false for unsupported extensions', () => {
      expect(isSupportedMediaExtension('.svg')).toBe(false);
      expect(isSupportedMediaExtension('.avi')).toBe(false);
      expect(isSupportedMediaExtension('.txt')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isSupportedMediaExtension('')).toBe(false);
      expect(isSupportedMediaExtension('.')).toBe(false);
    });
  });
});
