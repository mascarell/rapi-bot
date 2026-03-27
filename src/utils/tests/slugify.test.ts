import { describe, it, expect } from 'vitest';
import { slugify } from '../slugify';

describe('slugify', () => {
    it('should convert simple names', () => {
        expect(slugify('Rapi')).toBe('rapi');
        expect(slugify('Modernia')).toBe('modernia');
    });

    it('should handle names with colons', () => {
        expect(slugify('Rapi: Red Hood')).toBe('rapi-red-hood');
        expect(slugify('Scarlet: Black Shadow')).toBe('scarlet-black-shadow');
        expect(slugify('D: Killer Wife')).toBe('d-killer-wife');
        expect(slugify('Dorothy: Serendipity')).toBe('dorothy-serendipity');
    });

    it('should handle names with spaces', () => {
        expect(slugify('Red Hood')).toBe('red-hood');
        expect(slugify('Snow White')).toBe('snow-white');
        expect(slugify('Soldier EG')).toBe('soldier-eg');
    });

    it('should handle alphanumeric names', () => {
        expect(slugify('2B')).toBe('2b');
        expect(slugify('A2')).toBe('a2');
        expect(slugify('N102')).toBe('n102');
    });

    it('should handle special casing names', () => {
        expect(slugify('iDoll Ocean')).toBe('idoll-ocean');
        expect(slugify('iDoll Flower')).toBe('idoll-flower');
    });

    it('should handle names with parentheses', () => {
        expect(slugify('Rei Ayanami (Tentative Name)')).toBe('rei-ayanami-tentative-name');
    });

    it('should collapse consecutive hyphens', () => {
        expect(slugify('Mica: Snow Buddy')).toBe('mica-snow-buddy');
        expect(slugify('Emma: Tactical Upgrade')).toBe('emma-tactical-upgrade');
    });

    it('should trim leading/trailing hyphens', () => {
        expect(slugify(' Rapi ')).toBe('rapi');
    });

    it('should throw on empty input', () => {
        expect(() => slugify('')).toThrow('slugify requires a non-empty string');
    });

    it('should throw on non-string input', () => {
        expect(() => slugify(null as any)).toThrow('slugify requires a non-empty string');
        expect(() => slugify(undefined as any)).toThrow('slugify requires a non-empty string');
    });

    it('should handle Product/Soldier names', () => {
        expect(slugify('Product 08')).toBe('product-08');
        expect(slugify('Product 12')).toBe('product-12');
        expect(slugify('Soldier FA')).toBe('soldier-fa');
        expect(slugify('Soldier OW')).toBe('soldier-ow');
    });
});
