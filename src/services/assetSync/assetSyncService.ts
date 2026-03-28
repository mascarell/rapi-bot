import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import pLimit from 'p-limit';
import { s3Client, S3_BUCKET } from '../../utils/cdn/config.js';
import { logger } from '../../utils/logger.js';
import { GameAssetProvider, GameManifest, ManifestEntry, SyncResult, SyncAllResult } from './types.js';
import { getAllProviders } from './providers/index.js';

const ASSETS_PREFIX = 'assets/gacha';
const MANIFEST_FILENAME = 'manifest.json';
const CURRENT_SCHEMA_VERSION = 1;
const DOWNLOAD_CONCURRENCY = 5;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB safety limit
const MIN_CHARACTER_RATIO = 0.8; // Abort if API returns <80% of known characters

/**
 * Core orchestrator for syncing game character assets to S3.
 *
 * Uses a manifest (JSON in S3) as the source of truth for what's been synced.
 * Supports incremental sync (only new/changed) and full re-sync.
 */
export class AssetSyncService {
    private static instance: AssetSyncService;
    private providers: GameAssetProvider[];

    private constructor() {
        this.providers = getAllProviders();
    }

    public static getInstance(): AssetSyncService {
        if (!AssetSyncService.instance) {
            AssetSyncService.instance = new AssetSyncService();
        }
        return AssetSyncService.instance;
    }

    public getRegisteredGameIds(): string[] {
        return this.providers.map(p => p.getGameId());
    }

    public async syncAll(mode: 'full' | 'incremental' = 'incremental'): Promise<SyncAllResult> {
        const results: SyncResult[] = [];
        for (const provider of this.providers) {
            const result = await this.syncGame(provider, mode);
            results.push(result);
        }
        return {
            results,
            totalSynced: results.reduce((sum, r) => sum + r.synced, 0),
            totalSkipped: results.reduce((sum, r) => sum + r.skipped, 0),
            totalFailed: results.reduce((sum, r) => sum + r.failed, 0),
        };
    }

    public async syncIncremental(): Promise<SyncAllResult> {
        return this.syncAll('incremental');
    }

    public async syncFull(): Promise<SyncAllResult> {
        return this.syncAll('full');
    }

    public async syncGameById(gameId: string, mode: 'full' | 'incremental' = 'incremental'): Promise<SyncResult> {
        const provider = this.providers.find(p => p.getGameId() === gameId);
        if (!provider) throw new Error(`No provider registered for game: ${gameId}`);
        return this.syncGame(provider, mode);
    }

    private async syncGame(provider: GameAssetProvider, mode: 'full' | 'incremental'): Promise<SyncResult> {
        const startTime = Date.now();
        const gameId = provider.getGameId();
        const gameName = provider.getGameDisplayName();

        logger.info`[AssetSync] Starting ${mode} sync for ${gameName}...`;

        const result: SyncResult = {
            gameId,
            synced: 0,
            skipped: 0,
            failed: 0,
            errors: [],
            duration: 0,
        };

        try {
            // 1. Fetch character list from external API
            const characters = await provider.fetchCharacterList();
            logger.info`[AssetSync] ${gameName}: fetched ${characters.length} characters from API`;

            // 2. Load existing manifest
            const manifest = await this.loadManifest(gameId);
            const manifestMap = new Map(manifest.characters.map(e => [e.code, e]));

            // 3. Sanity check: abort if API returns too few characters
            if (manifest.characters.length > 0 && characters.length < manifest.characters.length * MIN_CHARACTER_RATIO) {
                const msg = `API returned ${characters.length} characters but manifest has ${manifest.characters.length}. Aborting to prevent data loss.`;
                logger.error`[AssetSync] ${gameName}: ${msg}`;
                result.errors.push({ name: '__sanity_check__', error: msg });
                result.duration = Date.now() - startTime;
                return result;
            }

            // 4. Detect slug collisions before syncing
            const slugMap = new Map<string, string>(); // s3Key → character name
            for (const character of characters) {
                const targetRarity = provider.resolveTargetRarity(character);
                const slug = provider.slugifyName(character.name);
                const s3Key = `${ASSETS_PREFIX}/${gameId}/rarities/${targetRarity}/${slug}.webp`;
                const existing = slugMap.get(s3Key);
                if (existing) {
                    logger.warn`[AssetSync] ${gameName}: slug collision! "${character.name}" and "${existing}" both map to ${s3Key}`;
                }
                slugMap.set(s3Key, character.name);
            }

            // 5. Rate-limited sync
            // Note: manifestMap/result mutations below are safe — JS is single-threaded
            // and all mutations happen between await points within the same event loop.
            const limit = pLimit(DOWNLOAD_CONCURRENCY);
            const tasks = characters.map(character => limit(async () => {
                const targetRarity = provider.resolveTargetRarity(character);
                const slug = provider.slugifyName(character.name);
                const s3Key = `${ASSETS_PREFIX}/${gameId}/rarities/${targetRarity}/${slug}.webp`;

                // Incremental: check manifest for existing entry
                if (mode === 'incremental') {
                    const existing = manifestMap.get(character.code);
                    if (existing) {
                        // Check if image has changed via HEAD request (Content-Length comparison)
                        // If HEAD fails or Content-Length unavailable, trust manifest and skip
                        try {
                            const headResponse = await fetch(character.imageUrl, { method: 'HEAD' });
                            const remoteSize = parseInt(headResponse.headers.get('content-length') || '0', 10);
                            if (remoteSize === 0 || remoteSize === existing.imageSize) {
                                // Size matches or unavailable — trust manifest, skip
                                result.skipped++;
                                return;
                            }
                            // Size changed — re-download below
                        } catch {
                            // HEAD failed — trust manifest and skip (use --full to force)
                            result.skipped++;
                            return;
                        }
                    }
                }

                try {
                    // Download image — try primary URL, then fallback on 404
                    let imageResponse = await fetch(character.imageUrl);

                    if (!imageResponse.ok && imageResponse.status === 404 && provider.getFallbackImageUrl) {
                        const fallbackUrl = await provider.getFallbackImageUrl(character);
                        if (fallbackUrl) {
                            logger.debug`[AssetSync] ${gameName}: primary 404 for ${character.name}, trying fallback`;
                            imageResponse = await fetch(fallbackUrl);
                        }
                    }

                    if (!imageResponse.ok) {
                        throw new Error(`HTTP ${imageResponse.status} downloading ${character.name}`);
                    }

                    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

                    // Safety: reject unexpectedly large files
                    if (imageBuffer.length > MAX_IMAGE_SIZE_BYTES) {
                        throw new Error(`Image too large: ${imageBuffer.length} bytes (max ${MAX_IMAGE_SIZE_BYTES})`);
                    }

                    // Validate image format (WebP: RIFF+WEBP, or PNG: 89504E47)
                    const isWebP = imageBuffer.length >= 12 &&
                        imageBuffer.toString('ascii', 0, 4) === 'RIFF' &&
                        imageBuffer.toString('ascii', 8, 12) === 'WEBP';
                    const isPNG = imageBuffer.length >= 4 &&
                        imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 &&
                        imageBuffer[2] === 0x4E && imageBuffer[3] === 0x47;

                    if (!isWebP && !isPNG) {
                        throw new Error('Downloaded file is not a valid image (expected WebP or PNG)');
                    }

                    // Upload to S3 (keep original format — S3 key uses .webp but content may be PNG from fallback)
                    const contentType = isPNG ? 'image/png' : 'image/webp';
                    await s3Client.send(new PutObjectCommand({
                        Bucket: S3_BUCKET,
                        Key: s3Key,
                        Body: imageBuffer,
                        ContentType: contentType,
                        ACL: 'public-read',
                    }));

                    // Update manifest entry
                    const entry: ManifestEntry = {
                        code: character.code,
                        name: character.name,
                        slug,
                        rarity: targetRarity,
                        imageSize: imageBuffer.length,
                        s3Key,
                        syncedAt: new Date().toISOString(),
                    };

                    manifestMap.set(character.code, entry);
                    result.synced++;
                    logger.debug`[AssetSync] ${gameName}: synced ${character.name} -> ${s3Key}`;
                } catch (error: any) {
                    result.failed++;
                    result.errors.push({ name: character.name, error: error.message });
                    logger.error`[AssetSync] ${gameName}: failed to sync ${character.name}: ${error.message}`;
                }
            }));

            await Promise.all(tasks);

            // 6. Save updated manifest (note: not atomic — crash before this loses tracking but images are safe in S3)
            manifest.characters = [...manifestMap.values()];
            manifest.lastSyncAt = new Date().toISOString();
            await this.saveManifest(gameId, manifest);

        } catch (error: any) {
            logger.error`[AssetSync] ${gameName}: sync failed entirely: ${error.message}`;
            result.errors.push({ name: '__fetchCharacterList__', error: error.message });
        }

        result.duration = Date.now() - startTime;
        logger.info`[AssetSync] ${gameName}: sync complete - synced=${result.synced} skipped=${result.skipped} failed=${result.failed} (${result.duration}ms)`;
        return result;
    }

    // ── Manifest Management ──

    private getManifestKey(gameId: string): string {
        return `${ASSETS_PREFIX}/${gameId}/${MANIFEST_FILENAME}`;
    }

    private async loadManifest(gameId: string): Promise<GameManifest> {
        try {
            const response = await s3Client.send(new GetObjectCommand({
                Bucket: S3_BUCKET,
                Key: this.getManifestKey(gameId),
            }));

            const body = await response.Body?.transformToString();
            if (body) {
                return JSON.parse(body) as GameManifest;
            }
        } catch (error: any) {
            if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
                logger.info`[AssetSync] No existing manifest for ${gameId}, creating new one`;
            } else {
                logger.warn`[AssetSync] Error loading manifest for ${gameId}: ${error.message}`;
            }
        }

        return {
            gameId,
            lastSyncAt: '',
            characters: [],
            schemaVersion: CURRENT_SCHEMA_VERSION,
        };
    }

    private async saveManifest(gameId: string, manifest: GameManifest): Promise<void> {
        manifest.schemaVersion = CURRENT_SCHEMA_VERSION;

        await s3Client.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: this.getManifestKey(gameId),
            Body: JSON.stringify(manifest, null, 2),
            ContentType: 'application/json',
            ACL: 'public-read',
        }));

        logger.debug`[AssetSync] Saved manifest for ${gameId} (${manifest.characters.length} characters)`;
    }

    /**
     * Get the last sync timestamp for a game (for startup logging).
     */
    public async getLastSyncTime(gameId: string): Promise<string | null> {
        const manifest = await this.loadManifest(gameId);
        return manifest.lastSyncAt || null;
    }
}

export function getAssetSyncService(): AssetSyncService {
    return AssetSyncService.getInstance();
}
