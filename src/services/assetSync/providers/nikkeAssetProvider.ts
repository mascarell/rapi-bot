import { GameAssetProvider, CharacterAsset } from '../types.js';
import { slugify } from '../../../utils/slugify.js';
import { logger } from '../../../utils/logger.js';

const NIKKE_API_URL = 'https://api.dotgg.gg/nikke/characters/';
const NIKKE_IMAGE_BASE = 'https://static.dotgg.gg/nikke/characters';
const FANDOM_API_BASE = 'https://nikke-goddess-of-victory-international.fandom.com/api.php';

interface DotGGCharacter {
    name: string;
    img: string;
    rarity: string;
    manufacturer: string;
    url?: string;
    squad?: string;
    class?: string;
    burst?: string;
    weapon?: string;
    burstGen?: string;
    element?: string;
}

/**
 * NIKKE asset provider — fetches character data from the DotGG API.
 *
 * API: GET https://api.dotgg.gg/nikke/characters/
 * Images: https://static.dotgg.gg/nikke/characters/c{code}_00.webp
 * Rarity: manufacturer === "Pilgrim" → pilgrim tier, else use rarity field
 */
export class NikkeAssetProvider implements GameAssetProvider {
    getGameId(): string {
        return 'nikke';
    }

    getGameDisplayName(): string {
        return 'NIKKE';
    }

    resolveTargetRarity(character: CharacterAsset): string {
        if (character.metadata?.manufacturer === 'Pilgrim') {
            return 'pilgrim';
        }

        const mapping: Record<string, string> = {
            'SSR': 'ssr',
            'SR': 'sr',
            'R': 'r',
        };

        return mapping[character.sourceRarity] || character.sourceRarity.toLowerCase();
    }

    slugifyName(name: string): string {
        return slugify(name);
    }

    /**
     * Fallback: search the Fandom wiki for full-body art (_FB.png) when DotGG 404s.
     * Uses the MediaWiki allimages API to search by character name prefix.
     */
    async getFallbackImageUrl(character: CharacterAsset): Promise<string | null> {
        try {
            // Extract the base name (before colon) for wiki search prefix
            const baseName = character.name.split(':')[0].trim().replace(/ /g, '_');

            const params = new URLSearchParams({
                action: 'query',
                list: 'allimages',
                aiprefix: baseName,
                ailimit: '50',
                format: 'json',
            });

            const response = await fetch(`${FANDOM_API_BASE}?${params}`, {
                headers: { 'User-Agent': 'RapiBot/1.0 (Discord Bot)' },
            });

            if (!response.ok) return null;

            const data = await response.json() as {
                query?: { allimages?: Array<{ name: string }> };
            };

            const allImages = data.query?.allimages || [];
            const fbImages = allImages
                .filter(img => img.name.endsWith('_FB.png'))
                .map(img => img.name);

            if (fbImages.length === 0) return null;

            // Try to find the best match:
            // 1. Exact base name match (e.g., "Chime_FB.png" for "Chime")
            // 2. First FB image that contains the base name
            const exactMatch = fbImages.find(f => f === `${baseName}_FB.png`);
            const bestMatch = exactMatch || fbImages[0];

            // Resolve the actual URL via imageinfo API
            const infoParams = new URLSearchParams({
                action: 'query',
                titles: `File:${bestMatch}`,
                prop: 'imageinfo',
                iiprop: 'url',
                format: 'json',
            });

            const infoResponse = await fetch(`${FANDOM_API_BASE}?${infoParams}`, {
                headers: { 'User-Agent': 'RapiBot/1.0 (Discord Bot)' },
            });

            if (!infoResponse.ok) return null;

            const infoData = await infoResponse.json() as {
                query?: { pages?: Record<string, { imageinfo?: Array<{ url: string }> }> };
            };

            const pages = infoData.query?.pages || {};
            for (const page of Object.values(pages)) {
                const url = page.imageinfo?.[0]?.url;
                if (url) {
                    logger.debug`[AssetSync:NIKKE] Fandom fallback for ${character.name}: ${bestMatch}`;
                    return url;
                }
            }
        } catch (error) {
            logger.warn`[AssetSync:NIKKE] Fandom fallback failed for ${character.name}: ${error}`;
        }

        return null;
    }

    async fetchCharacterList(): Promise<CharacterAsset[]> {
        const response = await fetch(NIKKE_API_URL);
        if (!response.ok) {
            throw new Error(`NIKKE API returned ${response.status}: ${response.statusText}`);
        }

        const data: unknown = await response.json();

        if (!Array.isArray(data)) {
            throw new Error('NIKKE API returned non-array response');
        }

        const characters: CharacterAsset[] = [];

        for (const entry of data) {
            const char = entry as DotGGCharacter;

            if (!char.name || !char.img || !char.rarity || !char.manufacturer) {
                logger.warn`[AssetSync:NIKKE] Skipping entry with missing fields: ${JSON.stringify(char)}`;
                continue;
            }

            const codeMatch = char.img.match(/c(\d+)/);
            if (!codeMatch) {
                logger.warn`[AssetSync:NIKKE] Could not extract code from img: ${char.img}`;
                continue;
            }

            const code = `c${codeMatch[1]}`;

            characters.push({
                name: char.name,
                code,
                sourceRarity: char.rarity,
                imageUrl: `${NIKKE_IMAGE_BASE}/${code}_00.webp`,
                metadata: {
                    manufacturer: char.manufacturer,
                },
            });
        }

        return characters;
    }
}
