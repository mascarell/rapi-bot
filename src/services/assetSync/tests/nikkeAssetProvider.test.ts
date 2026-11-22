import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NikkeAssetProvider, primaryManufacturer, characterCode, wikiFullBodyTitle } from '../providers/nikkeAssetProvider';
import { CharacterAsset } from '../types';

describe('NikkeAssetProvider', () => {
    let provider: NikkeAssetProvider;

    beforeEach(() => {
        provider = new NikkeAssetProvider();
    });

    describe('getGameId', () => {
        it('should return nikke', () => {
            expect(provider.getGameId()).toBe('nikke');
        });
    });

    describe('getGameDisplayName', () => {
        it('should return NIKKE', () => {
            expect(provider.getGameDisplayName()).toBe('NIKKE');
        });
    });

    describe('resolveTargetRarity', () => {
        it('should map Pilgrim manufacturer to pilgrim rarity', () => {
            const character: CharacterAsset = {
                name: 'Red Hood',
                code: 'c470',
                sourceRarity: 'SSR',
                imageUrl: 'https://example.com/c470_00.webp',
                metadata: { manufacturer: 'Pilgrim' },
            };
            expect(provider.resolveTargetRarity(character)).toBe('pilgrim');
        });

        it('should map SSR rarity for non-Pilgrim characters', () => {
            const character: CharacterAsset = {
                name: 'Rapi',
                code: 'c010',
                sourceRarity: 'SSR',
                imageUrl: 'https://example.com/c010_00.webp',
                metadata: { manufacturer: 'Elysion' },
            };
            expect(provider.resolveTargetRarity(character)).toBe('ssr');
        });

        it('should map SR rarity', () => {
            const character: CharacterAsset = {
                name: 'Anis',
                code: 'c012',
                sourceRarity: 'SR',
                imageUrl: 'https://example.com/c012_00.webp',
                metadata: { manufacturer: 'Tetra' },
            };
            expect(provider.resolveTargetRarity(character)).toBe('sr');
        });

        it('should map R rarity', () => {
            const character: CharacterAsset = {
                name: 'Neon',
                code: 'c011',
                sourceRarity: 'R',
                imageUrl: 'https://example.com/c011_00.webp',
                metadata: { manufacturer: 'Elysion' },
            };
            expect(provider.resolveTargetRarity(character)).toBe('r');
        });

        it('should handle all 22 Pilgrim characters (manufacturer check)', () => {
            // Modernia is a Pilgrim but shows as SSR in API
            const modernia: CharacterAsset = {
                name: 'Modernia',
                code: 'c260',
                sourceRarity: 'SSR',
                imageUrl: 'https://example.com/c260_00.webp',
                metadata: { manufacturer: 'Pilgrim' },
            };
            expect(provider.resolveTargetRarity(modernia)).toBe('pilgrim');
        });

        it('should fall back to lowercase rarity for unknown values', () => {
            const character: CharacterAsset = {
                name: 'Unknown',
                code: 'c999',
                sourceRarity: 'LEGENDARY',
                imageUrl: 'https://example.com/c999_00.webp',
                metadata: { manufacturer: 'Unknown' },
            };
            expect(provider.resolveTargetRarity(character)).toBe('legendary');
        });
    });

    describe('slugifyName', () => {
        it('should slugify character names correctly', () => {
            expect(provider.slugifyName('Scarlet: Black Shadow')).toBe('scarlet-black-shadow');
            expect(provider.slugifyName('Rapi: Red Hood')).toBe('rapi-red-hood');
            expect(provider.slugifyName('2B')).toBe('2b');
            expect(provider.slugifyName('Snow White')).toBe('snow-white');
        });
    });

    describe('helpers', () => {
        it('picks the real manufacturer next to Over-Spec', () => {
            expect(primaryManufacturer(['Over-Spec', 'Elysion'])).toBe('Elysion');
            expect(primaryManufacturer('Pilgrim')).toBe('Pilgrim');
            expect(primaryManufacturer(['Over-Spec'])).toBe('Over-Spec');
            expect(primaryManufacturer([])).toBeNull();
            expect(primaryManufacturer(undefined)).toBeNull();
        });

        it('pads ids to the DotGG code', () => {
            expect(characterCode(16)).toBe('c016');
            expect(characterCode(530)).toBe('c530');
            expect(characterCode(8004)).toBe('c8004');
        });

        it('builds the wiki full-body file title', () => {
            expect(wikiFullBodyTitle('Scarlet: Goddeath')).toBe('File:Scarlet Goddeath FB.png');
            expect(wikiFullBodyTitle('Sky')).toBe('File:Sky FB.png');
        });
    });

    describe('fetchCharacterList', () => {
        afterEach(() => vi.unstubAllGlobals());

        it('parses the Loot & Waifus list', async () => {
            const mockResponse = [
                { id: 10, name: 'Rapi', manufacturer: 'Elysion', rarity: 'SSR', icon: 'characters/nikke/mi_c010_00_s.webp' },
                { id: 470, name: 'Red Hood', manufacturer: 'Pilgrim', rarity: 'SSR' },
                { id: 16, name: 'Rapi: Red Hood', manufacturer: ['Over-Spec', 'Elysion'], rarity: 'SSR' },
                { id: 840, name: 'Ada Wong', manufacturer: 'Abnormal', rarity: 'SSR' },
            ];
            const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockResponse) });
            vi.stubGlobal('fetch', fetchMock);

            const characters = await provider.fetchCharacterList();

            expect(fetchMock.mock.calls[0][0]).toBe('https://lootandwaifus.com/api/nikke/characters.json');
            expect(fetchMock.mock.calls[0][1].headers['User-Agent']).toMatch(/^RapiBot\/\d+\.\d+\.\d+ /);
            expect(characters).toHaveLength(4);
            expect(characters[0]).toEqual({
                name: 'Rapi',
                code: 'c010',
                sourceRarity: 'SSR',
                imageUrl: 'https://static.dotgg.gg/nikke/characters/c010_00.webp',
                collab: false,
                metadata: { manufacturer: 'Elysion', iconUrl: 'https://lootandwaifus.com/characters/nikke/mi_c010_00_s.webp' },
            });
            expect(provider.resolveTargetRarity(characters[1])).toBe('pilgrim');
            expect(characters[2].code).toBe('c016');
            expect(characters[2].metadata?.manufacturer).toBe('Elysion');
            expect(characters[3].collab).toBe(true);
        });

        it('should throw on non-OK API response', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: false,
                status: 503,
                statusText: 'Service Unavailable',
            }));

            await expect(provider.fetchCharacterList()).rejects.toThrow('NIKKE API returned 503');
        });

        it('should throw on non-array response', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ error: 'not found' }),
            }));

            await expect(provider.fetchCharacterList()).rejects.toThrow('non-array response');
        });

        it('should skip entries with missing required fields', async () => {
            const mockResponse = [
                { id: 10, name: 'Valid', rarity: 'SSR', manufacturer: 'Elysion' },
                { name: 'NoId', rarity: 'SSR', manufacturer: 'Elysion' },
                { id: 20, name: 'NoRarity', manufacturer: 'Elysion' },
                { id: 30, name: 'NoMaker', rarity: 'SSR', manufacturer: [] },
            ];
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            }));

            const characters = await provider.fetchCharacterList();
            expect(characters.map(c => c.name)).toEqual(['Valid']);
        });
    });

    describe('getFallbackImageUrl', () => {
        const sky: CharacterAsset = {
            name: 'Sky', code: 'c530', sourceRarity: 'SSR', imageUrl: 'x',
            metadata: { manufacturer: 'Elysion', iconUrl: 'https://lootandwaifus.com/characters/nikke/mi_c530_00_s.webp' },
        };

        afterEach(() => vi.unstubAllGlobals());

        it('prefers the scaled wiki full-body art', async () => {
            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ query: { pages: [{ imageinfo: [{ url: 'https://wiki/full', thumburl: 'https://wiki/800' }] }] } }),
            });
            vi.stubGlobal('fetch', fetchMock);

            expect(await provider.getFallbackImageUrl(sky)).toBe('https://wiki/800');
            const query = new URL(fetchMock.mock.calls[0][0]).searchParams;
            expect(query.get('titles')).toBe('File:Sky FB.png');
        });

        it('falls back to the Loot & Waifus icon when the wiki has no art', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ query: { pages: [{ missing: true }] } }),
            }));
            expect(await provider.getFallbackImageUrl(sky)).toBe('https://lootandwaifus.com/characters/nikke/mi_c530_00_s.webp');
        });

        it('falls back to the icon when the wiki request fails', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
            expect(await provider.getFallbackImageUrl(sky)).toBe('https://lootandwaifus.com/characters/nikke/mi_c530_00_s.webp');
        });
    });
});
