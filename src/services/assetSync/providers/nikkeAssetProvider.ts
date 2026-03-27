import { GameAssetProvider, CharacterAsset } from '../types.js';
import { slugify } from '../../../utils/slugify.js';
import { logger } from '../../../utils/logger.js';

const NIKKE_API_URL = 'https://api.dotgg.gg/nikke/characters/';
const NIKKE_IMAGE_BASE = 'https://static.dotgg.gg/nikke/characters';

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
