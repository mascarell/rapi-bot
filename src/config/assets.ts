/**
 * Centralized asset paths and CDN URL configuration
 *
 * This module provides a single source of truth for all asset URLs,
 * paths, and media file extensions used throughout the bot.
 */

/**
 * Get CDN domain URL from environment (with validation)
 */
function getCdnDomain(): string {
  return process.env.CDN_DOMAIN_URL || '';
}

/**
 * Asset path constants (relative to CDN root)
 */
export const ASSET_PATHS = {
  rapiBot: {
    thumbnail: 'assets/rapi-bot-thumbnail.jpg',
    icon: 'assets/rapi-bot-icon.png',
  },
  logos: {
    gfl2: 'assets/logos/gfl2-logo.png',
    nikke: 'assets/logos/nikke-logo.png',
    blueArchive: 'assets/logos/blue-archive-logo.png',
  },
  commands: {
    // Command-specific media paths can be added here
    skillissue: 'commands/skillissue/',
    seggs: 'commands/seggs/',
    // Add more as needed during Phase 3
  }
} as const;

/**
 * Get full CDN URLs for commonly used assets
 * Computed at runtime to support environment variable changes
 */
export function getAssetUrls() {
  const cdnDomain = getCdnDomain();
  return {
    rapiBot: {
      thumbnail: `${cdnDomain}/${ASSET_PATHS.rapiBot.thumbnail}`,
      icon: `${cdnDomain}/${ASSET_PATHS.rapiBot.icon}`,
    },
    logos: {
      gfl2: `${cdnDomain}/${ASSET_PATHS.logos.gfl2}`,
      nikke: `${cdnDomain}/${ASSET_PATHS.logos.nikke}`,
      blueArchive: `${cdnDomain}/${ASSET_PATHS.logos.blueArchive}`,
    }
  };
}

/**
 * Backward compatibility: ASSET_URLS constant (lazy evaluated)
 */
export const ASSET_URLS = getAssetUrls();

/**
 * Default file extensions for media commands
 */
export const DEFAULT_IMAGE_EXTENSIONS = ['.gif', '.png', '.jpg', '.webp'] as const;
export const DEFAULT_VIDEO_EXTENSIONS = ['.mp4'] as const;
export const DEFAULT_MEDIA_EXTENSIONS = [
  ...DEFAULT_IMAGE_EXTENSIONS,
  ...DEFAULT_VIDEO_EXTENSIONS
] as const;

/**
 * Helper function to construct CDN URL from path
 */
export function getCdnUrl(path: string): string {
  const cdnDomain = getCdnDomain();
  if (!cdnDomain) {
    throw new Error('CDN_DOMAIN_URL environment variable is not set');
  }
  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${cdnDomain}/${cleanPath}`;
}

/**
 * Type guard to check if a file extension is supported
 */
export function isSupportedImageExtension(ext: string): ext is typeof DEFAULT_IMAGE_EXTENSIONS[number] {
  return (DEFAULT_IMAGE_EXTENSIONS as readonly string[]).includes(ext);
}

export function isSupportedVideoExtension(ext: string): ext is typeof DEFAULT_VIDEO_EXTENSIONS[number] {
  return (DEFAULT_VIDEO_EXTENSIONS as readonly string[]).includes(ext);
}

export function isSupportedMediaExtension(ext: string): ext is typeof DEFAULT_MEDIA_EXTENSIONS[number] {
  return isSupportedImageExtension(ext) || isSupportedVideoExtension(ext);
}
