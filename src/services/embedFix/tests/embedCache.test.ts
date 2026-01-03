import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock the config before importing
vi.mock('../../../utils/data/embedFixConfig', () => ({
    EMBED_FIX_CONFIG: {
        EMBED_CACHE_TTL: 1000, // 1 second for testing
        EMBED_CACHE_MAX_SIZE: 3,
        NEGATIVE_CACHE_TTL: 500, // 0.5 second for testing
    },
}));

// Import after mocking
import { embedCache } from '../embedCache';
import { EmbedData } from '../../../utils/interfaces/EmbedFix.interface';

describe('EmbedCache', () => {
    const createMockEmbedData = (id: string): EmbedData => ({
        platform: 'twitter',
        author: {
            name: `Test Author ${id}`,
            username: `testuser${id}`,
            url: `https://twitter.com/testuser${id}`,
        },
        images: ['https://example.com/image.jpg'],
        color: 0x1DA1F2,
        originalUrl: `https://twitter.com/test/status/${id}`,
    });

    beforeEach(() => {
        embedCache.clear();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('get/set', () => {
        it('should store and retrieve embed data', () => {
            const data = createMockEmbedData('1');
            embedCache.set('twitter:1', data);

            const retrieved = embedCache.get('twitter:1');
            expect(retrieved).toEqual(data);
        });

        it('should return null for non-existent key', () => {
            expect(embedCache.get('nonexistent')).toBeNull();
        });

        it('should return null for expired entries', () => {
            const data = createMockEmbedData('1');
            embedCache.set('twitter:1', data);

            // Advance time past TTL
            vi.advanceTimersByTime(1100);

            expect(embedCache.get('twitter:1')).toBeNull();
        });

        it('should enforce max size by removing oldest entries', () => {
            embedCache.set('twitter:1', createMockEmbedData('1'));
            embedCache.set('twitter:2', createMockEmbedData('2'));
            embedCache.set('twitter:3', createMockEmbedData('3'));
            embedCache.set('twitter:4', createMockEmbedData('4')); // Should evict twitter:1

            expect(embedCache.get('twitter:1')).toBeNull();
            expect(embedCache.get('twitter:2')).not.toBeNull();
            expect(embedCache.get('twitter:3')).not.toBeNull();
            expect(embedCache.get('twitter:4')).not.toBeNull();
        });
    });

    describe('negative cache', () => {
        it('should mark key as negatively cached', () => {
            embedCache.setNegative('twitter:failed');
            expect(embedCache.isNegativelyCached('twitter:failed')).toBe(true);
        });

        it('should return false for non-negative cached keys', () => {
            expect(embedCache.isNegativelyCached('twitter:unknown')).toBe(false);
        });

        it('should expire negative cache entries', () => {
            embedCache.setNegative('twitter:failed');
            expect(embedCache.isNegativelyCached('twitter:failed')).toBe(true);

            // Advance time past negative cache TTL
            vi.advanceTimersByTime(600);

            expect(embedCache.isNegativelyCached('twitter:failed')).toBe(false);
        });
    });

    describe('delete', () => {
        it('should delete entry from positive cache', () => {
            embedCache.set('twitter:1', createMockEmbedData('1'));
            embedCache.delete('twitter:1');
            expect(embedCache.get('twitter:1')).toBeNull();
        });

        it('should delete entry from negative cache', () => {
            embedCache.setNegative('twitter:failed');
            embedCache.delete('twitter:failed');
            expect(embedCache.isNegativelyCached('twitter:failed')).toBe(false);
        });
    });

    describe('getStats', () => {
        it('should return correct stats', () => {
            embedCache.set('twitter:1', createMockEmbedData('1'));
            embedCache.set('twitter:2', createMockEmbedData('2'));
            embedCache.setNegative('twitter:failed1');
            embedCache.setNegative('twitter:failed2');
            embedCache.setNegative('twitter:failed3');

            const stats = embedCache.getStats();
            expect(stats.size).toBe(2);
            expect(stats.negativeSize).toBe(3);
            expect(stats.maxSize).toBe(3);
        });
    });

    describe('clear', () => {
        it('should clear all cache entries', () => {
            embedCache.set('twitter:1', createMockEmbedData('1'));
            embedCache.setNegative('twitter:failed');

            embedCache.clear();

            const stats = embedCache.getStats();
            expect(stats.size).toBe(0);
            expect(stats.negativeSize).toBe(0);
        });
    });
});
