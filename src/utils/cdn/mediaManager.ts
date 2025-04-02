import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { s3Client, S3_BUCKET, CDN_DOMAIN_URL } from "./config";

// Track recently sent media keys per guild and prefix
const recentlySentMediaKeys: Map<string, Map<string, string[]>> = new Map();

/**
 * Retrieves and filters media from the CDN based on specified criteria, with guild-based tracking 
 * to prevent recent repeats within each server.
 */
export async function getRandomCdnMediaUrl(
    prefix: string,
    guildId: string,
    options: {
        maxSizeMB?: number;
        extensions?: string[];
        trackLast?: number;
    } = {}
): Promise<string> {
    validateInputs(prefix, guildId);

    const maxSizeMB = options.maxSizeMB ?? 100;
    const extensions = options.extensions ?? [];
    const trackLast = options.trackLast ?? 5;

    try {
        console.log(`Fetching media for prefix: ${prefix} in guild: ${guildId}`);

        const mediaKeys = await fetchAndFilterMediaKeys(prefix, maxSizeMB, extensions);
        const randomKey = await getRandomUniqueKey(mediaKeys, guildId, prefix, trackLast);
        
        return `${CDN_DOMAIN_URL}/${randomKey}`;
    } catch (error) {
        console.error(`Error retrieving CDN media for guild ${guildId}:`, error);
        throw error instanceof Error ? error : new Error('Error retrieving CDN media');
    }
}

function validateInputs(prefix: string, guildId: string): void {
    if (!prefix || typeof prefix !== 'string') {
        console.error('Invalid prefix provided:', prefix);
        throw new Error('Valid prefix path is required');
    }

    if (!guildId || typeof guildId !== 'string') {
        console.error('Invalid guildId provided:', guildId);
        throw new Error('Valid guild ID is required');
    }
}

async function fetchAndFilterMediaKeys(
    prefix: string,
    maxSizeMB: number,
    extensions: string[]
): Promise<string[]> {
    const response = await s3Client.send(new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: prefix,
    }));

    if (!response.Contents || response.Contents.length === 0) {
        throw new Error('No media files available');
    }

    const mediaKeys = response.Contents
        .filter(obj => {
            const sizeInMB = (obj.Size || 0) / (1024 * 1024);
            return sizeInMB <= maxSizeMB;
        })
        .map(obj => obj.Key)
        .filter(key => key && (extensions.length === 0 || extensions.some(ext => 
            key.toLowerCase().endsWith(ext)
        )));

    if (mediaKeys.length === 0) {
        throw new Error(`No valid media files found under ${maxSizeMB}MB with extensions: ${extensions.join(', ')}`);
    }

    return mediaKeys.filter(key => key !== undefined) as string[];
}

async function getRandomUniqueKey(
    mediaKeys: string[],
    guildId: string,
    prefix: string,
    trackLast: number
): Promise<string> {
    initializeTracking(guildId, prefix);
    
    const guildTracking = recentlySentMediaKeys.get(guildId)!;
    const recentKeys = guildTracking.get(prefix)!;
    
    const availableKeys = mediaKeys.filter(key => !recentKeys.includes(key));

    if (availableKeys.length === 0) {
        console.log(`All media for ${prefix} have been recently used in guild: ${guildId}. Resetting tracking.`);
        guildTracking.set(prefix, []);
        const randomKey = mediaKeys[Math.floor(Math.random() * mediaKeys.length)]!;
        guildTracking.get(prefix)!.push(randomKey);
        return randomKey;
    }

    const randomKey = availableKeys[Math.floor(Math.random() * availableKeys.length)]!;
    
    recentKeys.push(randomKey);
    if (recentKeys.length > trackLast) {
        recentKeys.shift();
    }

    return randomKey;
}

function initializeTracking(guildId: string, prefix: string): void {
    if (!recentlySentMediaKeys.has(guildId)) {
        console.log(`Initializing tracking for new guild: ${guildId}`);
        recentlySentMediaKeys.set(guildId, new Map());
    }

    const guildTracking = recentlySentMediaKeys.get(guildId)!;
    if (!guildTracking.has(prefix)) {
        console.log(`Initializing tracking for prefix: ${prefix} in guild: ${guildId}`);
        guildTracking.set(prefix, []);
    }
} 