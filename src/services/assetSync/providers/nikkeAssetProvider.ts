import { GameAssetProvider, CharacterAsset } from '../types.js';
import { slugify } from '../../../utils/slugify.js';
import { logger } from '../../../utils/logger.js';
import { USER_AGENT } from '../../../utils/userAgent.js';

/** Loot & Waifus' public JSON dump of NIKKE characters (https://lootandwaifus.com/api/). */
const NIKKE_API_URL = 'https://lootandwaifus.com/api/nikke/characters.json';
const LOOT_AND_WAIFUS_BASE = 'https://lootandwaifus.com';
/** DotGG still serves art for the characters it knew; new ones 404 and use the fallback. */
const NIKKE_IMAGE_BASE = 'https://static.dotgg.gg/nikke/characters';
const FANDOM_API_BASE = 'https://nikke-goddess-of-victory-international.fandom.com/api.php';
/** Wiki full-body art is 1-3 MB at full size; the wiki serves a scaled copy. */
const FALLBACK_IMAGE_WIDTH = 800;
/** Not a manufacturer: a tag some characters carry next to their real one. */
const OVER_SPEC = 'over-spec';

interface LootAndWaifusCharacter {
    id: number;
    name: string;
    rarity: string;
    manufacturer: string | string[];
    icon?: string;
}

/** `['Over-Spec', 'Elysion']` -> `Elysion`; a plain string is returned as is. */
export function primaryManufacturer(value: string | string[] | undefined): string | null {
    const list = (Array.isArray(value) ? value : [value])
        .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
        .map(v => v.trim());
    return list.find(v => v.toLowerCase() !== OVER_SPEC) ?? list[0] ?? null;
}

/** `601` -> `c601`, `16` -> `c016`: the code DotGG used, so existing manifest entries match. */
export function characterCode(id: number): string {
    return `c${String(id).padStart(3, '0')}`;
}

/** `Scarlet: Goddeath` -> `File:Scarlet Goddeath FB.png`, the wiki's full-body art. */
export function wikiFullBodyTitle(name: string): string {
    return `File:${name.replace(/:/g, '').replace(/\s+/g, ' ').trim()} FB.png`;
}

/**
 * NIKKE asset provider. The character list comes from Loot & Waifus; art
 * comes from DotGG's image server, which still has every character synced
 * before late October 2026. New characters 404 there and fall back to the
 * wiki's full-body art, then to the Loot & Waifus icon.
 *
 * DotGG's character API (api.dotgg.gg/nikke/characters/), the previous list
 * source, returns 410 Gone.
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

    /** The wiki's full-body art, scaled; else the Loot & Waifus icon. */
    async getFallbackImageUrl(character: CharacterAsset): Promise<string | null> {
        try {
            const params = new URLSearchParams({
                action: 'query',
                prop: 'imageinfo',
                iiprop: 'url',
                iiurlwidth: String(FALLBACK_IMAGE_WIDTH),
                titles: wikiFullBodyTitle(character.name),
                format: 'json',
                formatversion: '2',
            });
            const response = await fetch(`${FANDOM_API_BASE}?${params}`, {
                headers: { 'User-Agent': USER_AGENT },
            });
            if (response.ok) {
                const data = await response.json() as {
                    query?: { pages?: Array<{ imageinfo?: Array<{ url?: string; thumburl?: string }> }> };
                };
                const info = data.query?.pages?.[0]?.imageinfo?.[0];
                const url = info?.thumburl || info?.url;
                if (url) {
                    logger.debug`[AssetSync:NIKKE] Wiki fallback for ${character.name}`;
                    return url;
                }
            }
        } catch (error) {
            logger.warn`[AssetSync:NIKKE] Wiki fallback failed for ${character.name}: ${error}`;
        }

        const icon = character.metadata?.iconUrl;
        return typeof icon === 'string' ? icon : null;
    }

    async fetchCharacterList(): Promise<CharacterAsset[]> {
        const response = await fetch(NIKKE_API_URL, { headers: { 'User-Agent': USER_AGENT } });
        if (!response.ok) {
            throw new Error(`NIKKE API returned ${response.status}: ${response.statusText}`);
        }

        const data: unknown = await response.json();

        if (!Array.isArray(data)) {
            throw new Error('NIKKE API returned non-array response');
        }

        const characters: CharacterAsset[] = [];

        for (const entry of data) {
            const char = entry as LootAndWaifusCharacter;
            const manufacturer = primaryManufacturer(char.manufacturer);

            if (!Number.isInteger(char.id) || char.id < 0 || !char.name || !char.rarity || !manufacturer) {
                logger.warn`[AssetSync:NIKKE] Skipping entry with missing fields: ${JSON.stringify({ id: char.id, name: char.name })}`;
                continue;
            }

            const code = characterCode(char.id);

            characters.push({
                name: char.name,
                code,
                sourceRarity: char.rarity,
                imageUrl: `${NIKKE_IMAGE_BASE}/${code}_00.webp`,
                collab: manufacturer === 'Abnormal',
                metadata: {
                    manufacturer,
                    ...(char.icon ? { iconUrl: `${LOOT_AND_WAIFUS_BASE}/${char.icon.replace(/^\/+/, '')}` } : {}),
                },
            });
        }

        return characters;
    }
}
