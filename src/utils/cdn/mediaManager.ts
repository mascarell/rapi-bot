import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { s3Client, S3_BUCKET, CDN_DOMAIN_URL } from "./config";
import { mediaLogger } from "../logger.js";

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
        const mediaKeys = await fetchAndFilterMediaKeys(prefix, maxSizeMB, extensions);
        const randomKey = await getRandomUniqueKey(mediaKeys, guildId, prefix, trackLast);
        
        return `${CDN_DOMAIN_URL}/${randomKey}`;
    } catch (error) {
        mediaLogger.error`Error retrieving CDN media for guild ${guildId}: ${error}`;
        throw error instanceof Error ? error : new Error('Error retrieving CDN media');
    }
}

function validateInputs(prefix: string, guildId: string): void {
    if (!prefix || typeof prefix !== 'string') {
        mediaLogger.warning`Invalid prefix provided: ${prefix}`;
        throw new Error('Valid prefix path is required');
    }

    if (!guildId || typeof guildId !== 'string') {
        mediaLogger.warning`Invalid guildId provided: ${guildId}`;
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
        recentlySentMediaKeys.set(guildId, new Map());
    }

    const guildTracking = recentlySentMediaKeys.get(guildId)!;
    if (!guildTracking.has(prefix)) {
        guildTracking.set(prefix, []);
    }
} 