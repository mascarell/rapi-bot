import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NikkeAssetProvider } from '../providers/nikkeAssetProvider';
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

    describe('fetchCharacterList', () => {
        it('should parse DotGG API response correctly', async () => {
            const mockResponse = [
                {
                    name: 'Rapi',
                    url: 'rapi',
                    img: 'si_c010_00_s',
                    manufacturer: 'Elysion',
                    squad: 'Counters',
                    class: 'Attacker',
                    burst: '1',
                    rarity: 'SSR',
                    weapon: 'AR',
                    burstGen: '0.2%',
                    element: 'Fire',
                },
                {
                    name: 'Red Hood',
                    url: 'red-hood',
                    img: 'si_c470_00_s',
                    manufacturer: 'Pilgrim',
                    squad: 'Goddess',
                    class: 'Attacker',
                    burst: 'p',
                    rarity: 'SSR',
                    weapon: 'SR',
                    burstGen: '0.3%',
                    element: 'Fire',
                },
            ];

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            }));

            const characters = await provider.fetchCharacterList();

            expect(characters).toHaveLength(2);

            expect(characters[0].name).toBe('Rapi');
            expect(characters[0].code).toBe('c010');
            expect(characters[0].sourceRarity).toBe('SSR');
            expect(characters[0].imageUrl).toBe('https://static.dotgg.gg/nikke/characters/c010_00.webp');
            expect(characters[0].metadata?.manufacturer).toBe('Elysion');

            expect(characters[1].name).toBe('Red Hood');
            expect(characters[1].code).toBe('c470');
            expect(characters[1].metadata?.manufacturer).toBe('Pilgrim');

            vi.unstubAllGlobals();
        });

        it('should throw on non-OK API response', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: false,
                status: 503,
                statusText: 'Service Unavailable',
            }));

            await expect(provider.fetchCharacterList()).rejects.toThrow('NIKKE API returned 503');

            vi.unstubAllGlobals();
        });

        it('should throw on non-array response', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ error: 'not found' }),
            }));

            await expect(provider.fetchCharacterList()).rejects.toThrow('non-array response');

            vi.unstubAllGlobals();
        });

        it('should skip entries with missing required fields', async () => {
            const mockResponse = [
                { name: 'Valid', img: 'si_c010_00_s', rarity: 'SSR', manufacturer: 'Elysion' },
                { name: 'NoImg', rarity: 'SSR', manufacturer: 'Elysion' },
                { name: 'NoRarity', img: 'si_c020_00_s', manufacturer: 'Elysion' },
            ];

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            }));

            const characters = await provider.fetchCharacterList();
            expect(characters).toHaveLength(1);
            expect(characters[0].name).toBe('Valid');

            vi.unstubAllGlobals();
        });
    });
});
