import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  EmbedColors,
  successEmbed,
  errorEmbed,
  infoEmbed,
  warningEmbed,
  gachaEmbed,
  gachaSuccessEmbed,
  gachaErrorEmbed,
  gachaInfoEmbed,
  customEmbed,
  EmbedTemplates
} from './embedTemplates.js';

describe('embedTemplates.ts', () => {
  const originalCdnUrl = process.env.CDN_DOMAIN_URL;

  beforeEach(() => {
    process.env.CDN_DOMAIN_URL = 'https://test-cdn.example.com';
  });

  afterEach(() => {
    process.env.CDN_DOMAIN_URL = originalCdnUrl;
  });

  describe('EmbedColors', () => {
    it('should have correct color values', () => {
      expect(EmbedColors.SUCCESS).toBe(0x00FF00);
      expect(EmbedColors.ERROR).toBe(0xFF0000);
      expect(EmbedColors.INFO).toBe(0x3498DB);
      expect(EmbedColors.WARNING).toBe(0xFFA500);
      expect(EmbedColors.GACHA).toBe(0x00FF00);
      expect(EmbedColors.PURPLE).toBe(0x9B59B6);
      expect(EmbedColors.GOLD).toBe(0xFFD700);
    });
  });

  describe('successEmbed', () => {
    it('should create success embed with title only', () => {
      const embed = successEmbed('Success Title');

      expect(embed.data.title).toBe('Success Title');
      expect(embed.data.color).toBe(EmbedColors.SUCCESS);
      expect(embed.data.thumbnail?.url).toBe('https://test-cdn.example.com/assets/rapi-bot-thumbnail.jpg');
      expect(embed.data.timestamp).toBeDefined();
      expect(embed.data.description).toBeUndefined();
    });

    it('should create success embed with title and description', () => {
      const embed = successEmbed('Success Title', 'Success description');

      expect(embed.data.title).toBe('Success Title');
      expect(embed.data.description).toBe('Success description');
      expect(embed.data.color).toBe(EmbedColors.SUCCESS);
    });
  });

  describe('errorEmbed', () => {
    it('should create error embed with title only', () => {
      const embed = errorEmbed('Error Title');

      expect(embed.data.title).toBe('Error Title');
      expect(embed.data.color).toBe(EmbedColors.ERROR);
      expect(embed.data.thumbnail?.url).toBe('https://test-cdn.example.com/assets/rapi-bot-thumbnail.jpg');
      expect(embed.data.timestamp).toBeDefined();
    });

    it('should create error embed with title and description', () => {
      const embed = errorEmbed('Error Title', 'Error details');

      expect(embed.data.title).toBe('Error Title');
      expect(embed.data.description).toBe('Error details');
      expect(embed.data.color).toBe(EmbedColors.ERROR);
    });
  });

  describe('infoEmbed', () => {
    it('should create info embed with title only', () => {
      const embed = infoEmbed('Info Title');

      expect(embed.data.title).toBe('Info Title');
      expect(embed.data.color).toBe(EmbedColors.INFO);
      expect(embed.data.thumbnail?.url).toBe('https://test-cdn.example.com/assets/rapi-bot-thumbnail.jpg');
      expect(embed.data.timestamp).toBeDefined();
    });

    it('should create info embed with title and description', () => {
      const embed = infoEmbed('Info Title', 'Info details');

      expect(embed.data.title).toBe('Info Title');
      expect(embed.data.description).toBe('Info details');
    });
  });

  describe('warningEmbed', () => {
    it('should create warning embed with title only', () => {
      const embed = warningEmbed('Warning Title');

      expect(embed.data.title).toBe('Warning Title');
      expect(embed.data.color).toBe(EmbedColors.WARNING);
      expect(embed.data.thumbnail?.url).toBe('https://test-cdn.example.com/assets/rapi-bot-thumbnail.jpg');
    });

    it('should create warning embed with title and description', () => {
      const embed = warningEmbed('Warning Title', 'Warning details');

      expect(embed.data.description).toBe('Warning details');
    });
  });

  describe('gachaEmbed', () => {
    it('should create gacha embed with default color', () => {
      const embed = gachaEmbed('Gacha Title');

      expect(embed.data.title).toBe('Gacha Title');
      expect(embed.data.color).toBe(EmbedColors.GACHA);
      expect(embed.data.footer?.text).toBe('Gacha Coupon System');
      expect(embed.data.footer?.icon_url).toBe('https://test-cdn.example.com/assets/rapi-bot-thumbnail.jpg');
      expect(embed.data.thumbnail?.url).toBe('https://test-cdn.example.com/assets/rapi-bot-thumbnail.jpg');
      expect(embed.data.timestamp).toBeDefined();
    });

    it('should create gacha embed with custom color', () => {
      const embed = gachaEmbed('Gacha Title', EmbedColors.PURPLE);

      expect(embed.data.title).toBe('Gacha Title');
      expect(embed.data.color).toBe(EmbedColors.PURPLE);
      expect(embed.data.footer?.text).toBe('Gacha Coupon System');
    });
  });

  describe('gachaSuccessEmbed', () => {
    it('should create gacha success embed with footer', () => {
      const embed = gachaSuccessEmbed('Success');

      expect(embed.data.title).toBe('Success');
      expect(embed.data.color).toBe(EmbedColors.SUCCESS);
      expect(embed.data.footer?.text).toBe('Gacha Coupon System');
    });

    it('should create gacha success embed with description', () => {
      const embed = gachaSuccessEmbed('Success', 'Details here');

      expect(embed.data.title).toBe('Success');
      expect(embed.data.description).toBe('Details here');
    });
  });

  describe('gachaErrorEmbed', () => {
    it('should create gacha error embed with footer', () => {
      const embed = gachaErrorEmbed('Error');

      expect(embed.data.title).toBe('Error');
      expect(embed.data.color).toBe(EmbedColors.ERROR);
      expect(embed.data.footer?.text).toBe('Gacha Coupon System');
    });

    it('should create gacha error embed with description', () => {
      const embed = gachaErrorEmbed('Error', 'Error details');

      expect(embed.data.description).toBe('Error details');
    });
  });

  describe('gachaInfoEmbed', () => {
    it('should create gacha info embed with footer', () => {
      const embed = gachaInfoEmbed('Information');

      expect(embed.data.title).toBe('Information');
      expect(embed.data.color).toBe(EmbedColors.INFO);
      expect(embed.data.footer?.text).toBe('Gacha Coupon System');
    });

    it('should create gacha info embed with description', () => {
      const embed = gachaInfoEmbed('Information', 'Info details');

      expect(embed.data.description).toBe('Info details');
    });
  });

  describe('customEmbed', () => {
    it('should create custom embed with specified color', () => {
      const customColor = 0xABCDEF;
      const embed = customEmbed('Custom Title', customColor);

      expect(embed.data.title).toBe('Custom Title');
      expect(embed.data.color).toBe(customColor);
      expect(embed.data.thumbnail?.url).toBe('https://test-cdn.example.com/assets/rapi-bot-thumbnail.jpg');
      expect(embed.data.timestamp).toBeDefined();
    });

    it('should create custom embed with description', () => {
      const embed = customEmbed('Custom Title', 0x123456, 'Custom description');

      expect(embed.data.title).toBe('Custom Title');
      expect(embed.data.description).toBe('Custom description');
      expect(embed.data.color).toBe(0x123456);
    });
  });

  describe('EmbedTemplates class', () => {
    it('should provide static methods that call function equivalents', () => {
      const successResult = EmbedTemplates.success('Test');
      expect(successResult.data.title).toBe('Test');
      expect(successResult.data.color).toBe(EmbedColors.SUCCESS);

      const errorResult = EmbedTemplates.error('Error');
      expect(errorResult.data.color).toBe(EmbedColors.ERROR);

      const infoResult = EmbedTemplates.info('Info');
      expect(infoResult.data.color).toBe(EmbedColors.INFO);

      const warningResult = EmbedTemplates.warning('Warning');
      expect(warningResult.data.color).toBe(EmbedColors.WARNING);

      const gachaResult = EmbedTemplates.gacha('Gacha');
      expect(gachaResult.data.footer?.text).toBe('Gacha Coupon System');

      const customResult = EmbedTemplates.custom('Custom', 0xFFFFFF);
      expect(customResult.data.color).toBe(0xFFFFFF);
    });

    it('should support gacha-specific methods', () => {
      const successResult = EmbedTemplates.gachaSuccess('Success');
      expect(successResult.data.footer?.text).toBe('Gacha Coupon System');
      expect(successResult.data.color).toBe(EmbedColors.SUCCESS);

      const errorResult = EmbedTemplates.gachaError('Error');
      expect(errorResult.data.footer?.text).toBe('Gacha Coupon System');
      expect(errorResult.data.color).toBe(EmbedColors.ERROR);

      const infoResult = EmbedTemplates.gachaInfo('Info');
      expect(infoResult.data.footer?.text).toBe('Gacha Coupon System');
      expect(infoResult.data.color).toBe(EmbedColors.INFO);
    });
  });

  describe('Common embed properties', () => {
    it('all embeds should have timestamp', () => {
      expect(successEmbed('Test').data.timestamp).toBeDefined();
      expect(errorEmbed('Test').data.timestamp).toBeDefined();
      expect(infoEmbed('Test').data.timestamp).toBeDefined();
      expect(warningEmbed('Test').data.timestamp).toBeDefined();
      expect(gachaEmbed('Test').data.timestamp).toBeDefined();
    });

    it('all embeds should have thumbnail', () => {
      const thumbnailUrl = 'https://test-cdn.example.com/assets/rapi-bot-thumbnail.jpg';
      expect(successEmbed('Test').data.thumbnail?.url).toBe(thumbnailUrl);
      expect(errorEmbed('Test').data.thumbnail?.url).toBe(thumbnailUrl);
      expect(infoEmbed('Test').data.thumbnail?.url).toBe(thumbnailUrl);
      expect(warningEmbed('Test').data.thumbnail?.url).toBe(thumbnailUrl);
      expect(gachaEmbed('Test').data.thumbnail?.url).toBe(thumbnailUrl);
    });
  });

  describe('Edge cases', () => {
    it('should throw error for empty title (Discord.js validation)', () => {
      // Discord.js does not allow empty titles
      expect(() => successEmbed('')).toThrow();
    });

    it('should not set description for empty string', () => {
      // Empty string is falsy, so description won't be set
      const embed = successEmbed('Title', '');
      expect(embed.data.description).toBeUndefined();
    });

    it('should set description for whitespace string', () => {
      const embed = successEmbed('Title', ' ');
      expect(embed.data.description).toBe(' ');
    });
  });
});
