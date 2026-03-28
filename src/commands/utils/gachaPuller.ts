import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { s3Client, S3_BUCKET } from '../../utils/cdn/config.js';
import { CONSTANTS } from './gachaConstants';
import { GachaGameConfig, PullResult } from './gachaTypes';
import { NikkeUtil } from './nikkeUtil.js';
import { GameManifest } from '../../services/assetSync/types.js';
import { logger } from '../../utils/logger.js';

const RARITY_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const rarityCache = new Map<string, { files: string[]; expiry: number }>();

// Manifest cache (collab exclusion list)
const MANIFEST_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
let manifestCache: { collabSlugs: Set<string>; expiry: number } | null = null;

export class GachaPuller {
    static async pull(pullType: string, gameConfig: GachaGameConfig): Promise<PullResult[]> {
        const pulls = pullType === 'multi' ? 10 : 1;
        const results: PullResult[] = [];

        for (let i = 0; i < pulls; i++) {
            const rarity = this.determineRarity(gameConfig.rates);
            const character = await this.getRandomCharacter('nikke', rarity);
            results.push(character);
        }

        return results;
    }

    private static determineRarity(rates: Record<string, number>): string {
        const rand = Math.random();
        let cumulativeRate = 0;

        for (const [rarity, rate] of Object.entries(rates)) {
            cumulativeRate += rate;
            if (rand < cumulativeRate) return rarity;
        }

        return Object.keys(rates)[0];
    }

    /**
     * Load collab slugs from the manifest to exclude from the gacha pool.
     */
    private static async getCollabSlugs(game: string): Promise<Set<string>> {
        if (manifestCache && Date.now() < manifestCache.expiry) {
            return manifestCache.collabSlugs;
        }

        const collabSlugs = new Set<string>();

        try {
            const response = await s3Client.send(new GetObjectCommand({
                Bucket: S3_BUCKET,
                Key: `assets/gacha/${game}/manifest.json`,
            }));

            const body = await response.Body?.transformToString();
            if (body) {
                const manifest: GameManifest = JSON.parse(body);
                for (const entry of manifest.characters) {
                    if (entry.collab) {
                        // Match the filename as it appears in S3 (slug.webp or slug.png)
                        collabSlugs.add(`${entry.slug}.webp`);
                        collabSlugs.add(`${entry.slug}.png`);
                    }
                }
            }
        } catch {
            // No manifest or read error — don't exclude anything
        }

        manifestCache = { collabSlugs, expiry: Date.now() + MANIFEST_CACHE_TTL };
        return collabSlugs;
    }

    private static async getRarityFiles(game: string, rarity: string): Promise<string[]> {
        const cacheKey = `${game}/${rarity.toLowerCase()}`;
        const cached = rarityCache.get(cacheKey);

        if (cached && Date.now() < cached.expiry) {
            return cached.files;
        }

        const prefix = `assets/gacha/${game}/rarities/${rarity.toLowerCase()}`;
        const response = await s3Client.send(new ListObjectsV2Command({
            Bucket: S3_BUCKET,
            Prefix: prefix,
        }));

        if (!response.Contents?.length) {
            throw new Error(`No characters found for ${rarity}`);
        }

        // Get collab exclusion list
        const collabSlugs = await this.getCollabSlugs(game);

        const validFiles = response.Contents
            .map(obj => obj.Key?.split('/').pop())
            .filter((name): name is string => {
                if (!name) return false;
                if (!name.endsWith('.webp') && !name.endsWith('.png')) return false;
                // Exclude collab characters from the pool
                if (collabSlugs.has(name)) return false;
                return true;
            });

        if (!validFiles.length) {
            throw new Error(`No valid character files found for ${rarity}`);
        }

        rarityCache.set(cacheKey, { files: validFiles, expiry: Date.now() + RARITY_CACHE_TTL });
        return validFiles;
    }

    private static async getRandomCharacter(
        game: string,
        rarity: string
    ): Promise<PullResult> {
        const prefix = `assets/gacha/${game}/rarities/${rarity.toLowerCase()}`;
        const validFiles = await this.getRarityFiles(game, rarity);
        const randomFile = validFiles[Math.floor(Math.random() * validFiles.length)];

        return {
            rarity,
            name: NikkeUtil.fileToCharacterName(randomFile),
            imageUrl: `${CONSTANTS.cdnDomainUrl}/${prefix}/${randomFile}`
        };
    }
}
