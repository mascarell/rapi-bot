/**
 * A single character asset to be synced to S3.
 */
export interface CharacterAsset {
    /** Display name, e.g. "Scarlet: Black Shadow" */
    name: string;
    /** Game-specific identifier code, e.g. "c225" */
    code: string;
    /** Source rarity string from the API, e.g. "SSR", "SR", "R" */
    sourceRarity: string;
    /** Full URL to download the image */
    imageUrl: string;
    /** Extra metadata from the provider (e.g. manufacturer for Pilgrim detection) */
    metadata?: Record<string, unknown>;
}

/**
 * Abstract adapter that each game must implement.
 * To add a new game: create a class implementing this interface,
 * then register it in providers/index.ts.
 */
export interface GameAssetProvider {
    /** Unique game identifier used in S3 paths, e.g. "nikke" */
    getGameId(): string;

    /** Human-readable game name for logging */
    getGameDisplayName(): string;

    /**
     * Fetch the full character list from the external data source.
     * Provider is responsible for mapping source data to CharacterAsset[].
     */
    fetchCharacterList(): Promise<CharacterAsset[]>;

    /**
     * Resolve the target rarity folder name for a character.
     * Allows providers to override rarity classification
     * (e.g. NIKKE Pilgrims show as "SSR" in API but map to "pilgrim").
     */
    resolveTargetRarity(character: CharacterAsset): string;

    /**
     * Convert a character display name to a slugified filename (without extension).
     */
    slugifyName(name: string): string;

    /**
     * Optional: resolve a fallback image URL when the primary imageUrl returns 404.
     * Return null if no fallback is available.
     */
    getFallbackImageUrl?(character: CharacterAsset): Promise<string | null>;
}

/**
 * A single entry in the sync manifest (persisted in S3).
 */
export interface ManifestEntry {
    /** Game-specific character code, e.g. "c225" */
    code: string;
    /** Original display name (preserves colons, special chars) */
    name: string;
    /** Slugified filename (without extension) */
    slug: string;
    /** Target rarity folder name, e.g. "pilgrim", "ssr", "sr", "r" */
    rarity: string;
    /** Image file size in bytes (for change detection) */
    imageSize: number;
    /** Full S3 key where the image is stored */
    s3Key: string;
    /** ISO timestamp of when this character was last synced */
    syncedAt: string;
}

/**
 * Per-game manifest stored in S3 at assets/gacha/{gameId}/manifest.json.
 * Source of truth for what has been synced.
 */
export interface GameManifest {
    gameId: string;
    lastSyncAt: string;
    characters: ManifestEntry[];
    schemaVersion: number;
}

/**
 * Result of syncing a single game.
 */
export interface SyncResult {
    gameId: string;
    synced: number;
    skipped: number;
    failed: number;
    errors: Array<{ name: string; error: string }>;
    duration: number;
}

/**
 * Combined result across all games.
 */
export interface SyncAllResult {
    results: SyncResult[];
    totalSynced: number;
    totalSkipped: number;
    totalFailed: number;
}
