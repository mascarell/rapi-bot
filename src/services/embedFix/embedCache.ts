/**
 * LRU Cache for embed data
 * Caches successful API responses to reduce external API calls
 */

import { EMBED_FIX_CONFIG } from '../../utils/data/embedFixConfig';
import { CachedEmbed, EmbedData } from '../../utils/interfaces/EmbedFix.interface';

class EmbedCache {
    private cache: Map<string, CachedEmbed> = new Map();
    private negativeCache: Map<string, number> = new Map(); // Stores expiry time for failed requests
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor() {
        // Clean up expired entries every 10 minutes
        this.cleanupInterval = setInterval(() => this.cleanup(), 10 * 60 * 1000);
    }

    /**
     * Get cached embed data
     * @param key Cache key (usually platform:id)
     * @returns The cached embed data or null if not found/expired
     */
    get(key: string): EmbedData | null {
        const entry = this.cache.get(key);

        if (!entry) {
            return null;
        }

        // Check if expired
        if (Date.now() >= entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        return entry.data;
    }

    /**
     * Store embed data in cache
     * @param key Cache key (usually platform:id)
     * @param data The embed data to cache
     */
    set(key: string, data: EmbedData): void {
        // Enforce max size - remove oldest entries if at capacity
        if (this.cache.size >= EMBED_FIX_CONFIG.EMBED_CACHE_MAX_SIZE) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey) {
                this.cache.delete(oldestKey);
            }
        }

        const now = Date.now();
        this.cache.set(key, {
            data,
            timestamp: now,
            expiresAt: now + EMBED_FIX_CONFIG.EMBED_CACHE_TTL,
        });
    }

    /**
     * Check if a key is in the negative cache (recently failed)
     * @param key Cache key
     * @returns true if the key recently failed and should not be retried
     */
    isNegativelyCached(key: string): boolean {
        const expiresAt = this.negativeCache.get(key);

        if (!expiresAt) {
            return false;
        }

        if (Date.now() >= expiresAt) {
            this.negativeCache.delete(key);
            return false;
        }

        return true;
    }

    /**
     * Add a key to the negative cache (mark as recently failed)
     * @param key Cache key
     */
    setNegative(key: string): void {
        this.negativeCache.set(key, Date.now() + EMBED_FIX_CONFIG.NEGATIVE_CACHE_TTL);
    }

    /**
     * Remove an entry from the cache
     * @param key Cache key
     */
    delete(key: string): void {
        this.cache.delete(key);
        this.negativeCache.delete(key);
    }

    /**
     * Clean up expired entries
     */
    private cleanup(): void {
        const now = Date.now();

        // Clean positive cache
        for (const [key, entry] of this.cache) {
            if (now >= entry.expiresAt) {
                this.cache.delete(key);
            }
        }

        // Clean negative cache
        for (const [key, expiresAt] of this.negativeCache) {
            if (now >= expiresAt) {
                this.negativeCache.delete(key);
            }
        }
    }

    /**
     * Get cache stats (for debugging/monitoring)
     */
    getStats(): { size: number; negativeSize: number; maxSize: number } {
        return {
            size: this.cache.size,
            negativeSize: this.negativeCache.size,
            maxSize: EMBED_FIX_CONFIG.EMBED_CACHE_MAX_SIZE,
        };
    }

    /**
     * Clear all cache entries (for testing)
     */
    clear(): void {
        this.cache.clear();
        this.negativeCache.clear();
    }

    /**
     * Stop the cleanup interval (for graceful shutdown)
     */
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}

// Export singleton instance
export const embedCache = new EmbedCache();
