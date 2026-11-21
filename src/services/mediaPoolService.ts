import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, S3_BUCKET } from '../utils/cdn/config.js';
import { invalidateMediaListCache } from '../utils/cdn/mediaManager.js';
import { logger } from '../utils/logger.js';
import {
    DOWNLOAD_TIMEOUT_MS,
    MAX_UPLOAD_BYTES,
    MEDIA_POOLS,
    MediaPoolName,
} from '../utils/data/mediaPoolConfig.js';
import type { GameManifest, ManifestEntry } from './assetSync/types.js';

const NIKKE_MANIFEST_KEY = 'assets/gacha/nikke/manifest.json';
const MANIFEST_TTL_MS = 60 * 60 * 1000;
const MAX_NAME_ATTEMPTS = 1000;

/** A problem the moderator can act on; its message is safe to show them. */
export class MediaUserError extends Error {}

let manifestCache: { characters: ManifestEntry[]; expiry: number } | null = null;

/** Drop the cached character list (tests). */
export function resetMediaPoolCaches(): void {
    manifestCache = null;
}

/** NIKKE characters from the asset-sync manifest, cached for an hour. */
export async function getNikkeCharacters(): Promise<ManifestEntry[]> {
    if (manifestCache && Date.now() < manifestCache.expiry) return manifestCache.characters;
    const response = await s3Client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: NIKKE_MANIFEST_KEY }));
    const body = await response.Body?.transformToString();
    if (!body) throw new Error('The character list is empty.');
    const manifest = JSON.parse(body) as GameManifest;
    const characters = Array.isArray(manifest.characters) ? manifest.characters : [];
    manifestCache = { characters, expiry: Date.now() + MANIFEST_TTL_MS };
    return characters;
}

/** Characters whose display name contains `query` (case-insensitive), at most `limit`. */
export function searchCharacters(characters: ManifestEntry[], query: string, limit = 25): ManifestEntry[] {
    const q = query.toLowerCase().trim();
    return characters.filter(c => c.name.toLowerCase().includes(q)).slice(0, limit);
}

/** Lowercase `[a-z0-9_]` only; anything else becomes one underscore, repeats collapsed, ends trimmed. */
export function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
}

/**
 * `<character>[_<variant>]_<suffix>.gif`; `n` > 1 inserts the counter before
 * the suffix: `<character>[_<variant>]_<n>_<suffix>.gif`.
 */
export function buildFileName(pool: MediaPoolName, characterSlug: string, variant: string | null, n = 1): string {
    const parts = [slugify(characterSlug), variant ? slugify(variant) : ''].filter(Boolean);
    if (n > 1) parts.push(String(n));
    parts.push(MEDIA_POOLS[pool].suffix);
    return `${parts.join('_')}.gif`;
}

async function keyExists(key: string): Promise<boolean> {
    try {
        await s3Client.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
        return true;
    } catch (error: any) {
        if (error?.name === 'NotFound' || error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
            return false;
        }
        throw error;
    }
}

/** First file name in the pool that nothing else uses, so an upload never overwrites. */
export async function findFreeFileName(
    pool: MediaPoolName,
    characterSlug: string,
    variant: string | null
): Promise<string> {
    const { prefix } = MEDIA_POOLS[pool];
    for (let n = 1; n <= MAX_NAME_ATTEMPTS; n++) {
        const name = buildFileName(pool, characterSlug, variant, n);
        if (!(await keyExists(`${prefix}${name}`))) return name;
    }
    throw new MediaUserError('Too many files with that name already.');
}

export function cdnUrlForKey(key: string): string {
    return `${process.env.CDN_DOMAIN_URL}/${key}`;
}

export interface AttachmentLike {
    url: string;
    name: string;
    contentType?: string | null;
    size: number;
}

const LIMIT_MB = MAX_UPLOAD_BYTES / (1024 * 1024);

/** Reason the attachment can't be added, or null if it looks fine. */
export function validateAttachment(attachment: AttachmentLike): string | null {
    if (attachment.contentType !== 'image/gif' || !attachment.name.toLowerCase().endsWith('.gif')) {
        return 'Only .gif images can be added.';
    }
    if (attachment.size > MAX_UPLOAD_BYTES) {
        return `That file is too large. The limit is ${LIMIT_MB} MB.`;
    }
    return null;
}

export function isGifBytes(bytes: Uint8Array): boolean {
    if (bytes.length < 6) return false;
    const head = String.fromCharCode(...bytes.subarray(0, 6));
    return head === 'GIF87a' || head === 'GIF89a';
}

async function downloadGif(url: string): Promise<Buffer> {
    const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`Download failed (${response.status}).`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_UPLOAD_BYTES) {
        throw new MediaUserError(`That file is too large. The limit is ${LIMIT_MB} MB.`);
    }
    if (!isGifBytes(bytes)) throw new MediaUserError('That file is not a real GIF.');
    return bytes;
}

export interface AddMediaResult {
    fileName: string;
    key: string;
    url: string;
}

/**
 * Download the attachment, check it, and upload it to the pool under a free
 * name. Nothing is written unless every check passed. The pool's cached
 * listing is dropped so the chat command can pick the file immediately.
 */
export async function addMediaToPool(
    pool: MediaPoolName,
    characterSlug: string,
    variant: string | null,
    attachment: AttachmentLike
): Promise<AddMediaResult> {
    const invalid = validateAttachment(attachment);
    if (invalid) throw new MediaUserError(invalid);

    const bytes = await downloadGif(attachment.url);
    const { prefix } = MEDIA_POOLS[pool];
    const fileName = await findFreeFileName(pool, characterSlug, variant);
    const key = `${prefix}${fileName}`;

    await s3Client.send(
        new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            Body: bytes,
            ContentType: 'image/gif',
            ACL: 'public-read',
        })
    );
    invalidateMediaListCache(prefix);
    logger.info`[media] added ${key}`;
    return { fileName, key, url: cdnUrlForKey(key) };
}
