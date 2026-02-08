/**
 * Embed templates for Discord messages
 *
 * Provides reusable EmbedBuilder templates to eliminate 17+ duplicate
 * embed creation patterns across the codebase.
 */

import { EmbedBuilder } from 'discord.js';
import { getAssetUrls } from '../config/assets.js';

/**
 * Color constants for embeds
 */
export const EmbedColors = {
  SUCCESS: 0x00FF00,      // Green
  ERROR: 0xFF0000,        // Red
  INFO: 0x3498DB,         // Blue
  WARNING: 0xFFA500,      // Orange
  GACHA: 0x00FF00,        // Green (default for gacha system)
  PURPLE: 0x9B59B6,       // Purple
  GOLD: 0xFFD700          // Gold
} as const;

/**
 * Base embed with thumbnail and timestamp
 */
function createBaseEmbed(color: number): EmbedBuilder {
  const assetUrls = getAssetUrls();
  return new EmbedBuilder()
    .setColor(color)
    .setThumbnail(assetUrls.rapiBot.thumbnail)
    .setTimestamp();
}

/**
 * Success embed (green)
 */
export function successEmbed(title: string, description?: string): EmbedBuilder {
  const embed = createBaseEmbed(EmbedColors.SUCCESS).setTitle(title);
  if (description) {
    embed.setDescription(description);
  }
  return embed;
}

/**
 * Error embed (red)
 */
export function errorEmbed(title: string, description?: string): EmbedBuilder {
  const embed = createBaseEmbed(EmbedColors.ERROR).setTitle(title);
  if (description) {
    embed.setDescription(description);
  }
  return embed;
}

/**
 * Info embed (blue)
 */
export function infoEmbed(title: string, description?: string): EmbedBuilder {
  const embed = createBaseEmbed(EmbedColors.INFO).setTitle(title);
  if (description) {
    embed.setDescription(description);
  }
  return embed;
}

/**
 * Warning embed (orange)
 */
export function warningEmbed(title: string, description?: string): EmbedBuilder {
  const embed = createBaseEmbed(EmbedColors.WARNING).setTitle(title);
  if (description) {
    embed.setDescription(description);
  }
  return embed;
}

/**
 * Gacha system embed with footer
 */
export function gachaEmbed(title: string, color: number = EmbedColors.GACHA): EmbedBuilder {
  const assetUrls = getAssetUrls();
  return createBaseEmbed(color)
    .setTitle(title)
    .setFooter({
      text: 'Gacha Coupon System',
      iconURL: assetUrls.rapiBot.thumbnail
    });
}

/**
 * Gacha success embed (green with footer)
 */
export function gachaSuccessEmbed(title: string, description?: string): EmbedBuilder {
  const embed = gachaEmbed(title, EmbedColors.SUCCESS);
  if (description) {
    embed.setDescription(description);
  }
  return embed;
}

/**
 * Gacha error embed (red with footer)
 */
export function gachaErrorEmbed(title: string, description?: string): EmbedBuilder {
  const embed = gachaEmbed(title, EmbedColors.ERROR);
  if (description) {
    embed.setDescription(description);
  }
  return embed;
}

/**
 * Gacha info embed (blue with footer)
 */
export function gachaInfoEmbed(title: string, description?: string): EmbedBuilder {
  const embed = gachaEmbed(title, EmbedColors.INFO);
  if (description) {
    embed.setDescription(description);
  }
  return embed;
}

/**
 * Custom embed with specific color
 */
export function customEmbed(
  title: string,
  color: number,
  description?: string
): EmbedBuilder {
  const embed = createBaseEmbed(color).setTitle(title);
  if (description) {
    embed.setDescription(description);
  }
  return embed;
}

/**
 * EmbedTemplates class (alternative API style matching InteractionHelper)
 */
export class EmbedTemplates {
  static success(title: string, description?: string): EmbedBuilder {
    return successEmbed(title, description);
  }

  static error(title: string, description?: string): EmbedBuilder {
    return errorEmbed(title, description);
  }

  static info(title: string, description?: string): EmbedBuilder {
    return infoEmbed(title, description);
  }

  static warning(title: string, description?: string): EmbedBuilder {
    return warningEmbed(title, description);
  }

  static gacha(title: string, color: number = EmbedColors.GACHA): EmbedBuilder {
    return gachaEmbed(title, color);
  }

  static gachaSuccess(title: string, description?: string): EmbedBuilder {
    return gachaSuccessEmbed(title, description);
  }

  static gachaError(title: string, description?: string): EmbedBuilder {
    return gachaErrorEmbed(title, description);
  }

  static gachaInfo(title: string, description?: string): EmbedBuilder {
    return gachaInfoEmbed(title, description);
  }

  static custom(title: string, color: number, description?: string): EmbedBuilder {
    return customEmbed(title, color, description);
  }
}
