/**
 * Main Embed Fix Service
 * Orchestrates URL detection, caching, rate limiting, and embed generation
 */

import { DeleteObjectsCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    EmbedBuilder,
    Message,
    MessageFlags,
    MessageReaction,
    PartialMessageReaction,
    PartialUser,
    TextChannel,
    User,
} from 'discord.js';
import { CDN_DOMAIN_URL, s3Client, S3_BUCKET } from '../../utils/cdn/config';
import { EMBED_FIX_CONFIG } from '../../utils/data/embedFixConfig';
import { EmbedData, EmbedPlatform, MatchedUrl } from '../../utils/interfaces/EmbedFix.interface';
import { logError } from '../../utils/util';
import { circuitBreaker } from './circuitBreaker';
import { embedCache } from './embedCache';
import { EmbedVotesService, getEmbedVotesService } from './embedVotesService';
import { instagramHandler } from './handlers/instagramHandler';
import { pixivHandler } from './handlers/pixivHandler';
import { twitterHandler } from './handlers/twitterHandler';
import { embedFixRateLimiter } from './rateLimiter';
import { urlMatcher } from './urlMatcher';

// S3 prefix for temporary upload batch images
const TEMP_UPLOAD_PREFIX = 'data/embed-fix/temp-uploads';

/**
 * Download an image from URL and upload to S3 temporary storage
 * Returns the S3 key and CDN URL, or null on failure
 */
async function downloadAndStoreImage(
    imageUrl: string,
    filename: string,
    batchKey: string
): Promise<{ s3Key: string; cdnUrl: string; filename: string } | null> {
    try {
        // Download the image
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);  // 10 second timeout

        const response = await fetch(imageUrl, { signal: controller.signal });
        clearTimeout(timeout);

        if (!response.ok) {
            console.log(`[EmbedFix] Image download failed: ${response.status} for ${filename}`);
            return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Generate unique S3 key
        const timestamp = Date.now();
        const uniqueId = Math.random().toString(36).substring(2, 8);
        const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const s3Key = `${TEMP_UPLOAD_PREFIX}/${batchKey}/${timestamp}_${uniqueId}_${sanitizedFilename}`;

        // Detect content type
        const contentType = response.headers.get('content-type') || 'image/png';

        // Upload to S3
        await s3Client.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: s3Key,
            Body: buffer,
            ContentType: contentType,
            ACL: 'public-read',  // Make publicly accessible via CDN
        }));

        const cdnUrl = `${CDN_DOMAIN_URL}/${s3Key}`;
        console.log(`[EmbedFix] Uploaded temp image to S3: ${s3Key}`);

        return { s3Key, cdnUrl, filename };
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.log(`[EmbedFix] Image download timed out: ${filename}`);
        } else {
            console.error(`[EmbedFix] Image download/upload error for ${filename}:`, error);
        }
        return null;
    }
}

/**
 * Delete temporary images from S3 after batch is complete
 */
async function cleanupTempImages(s3Keys: string[]): Promise<void> {
    if (s3Keys.length === 0) return;

    try {
        await s3Client.send(new DeleteObjectsCommand({
            Bucket: S3_BUCKET,
            Delete: {
                Objects: s3Keys.map(Key => ({ Key })),
                Quiet: true,
            },
        }));
        console.log(`[EmbedFix] Cleaned up ${s3Keys.length} temp images from S3`);
    } catch (error) {
        console.error('[EmbedFix] Error cleaning up temp images:', error);
    }
}

/**
 * Download an image from S3 CDN URL for attachment
 */
async function downloadFromCdn(cdnUrl: string): Promise<Buffer | null> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(cdnUrl, { signal: controller.signal });
        clearTimeout(timeout);

        if (!response.ok) {
            console.log(`[EmbedFix] CDN download failed: ${response.status}`);
            return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (error) {
        console.error('[EmbedFix] CDN download error:', error);
        return null;
    }
}

/**
 * Download a video file, checking size constraints
 * Returns the buffer if under limit, or null to trigger fallback
 */
async function downloadVideo(
    videoUrl: string,
    maxSize: number = EMBED_FIX_CONFIG.MAX_VIDEO_SIZE_BYTES
): Promise<{ buffer: Buffer; filename: string } | null> {
    try {
        // First, check file size with HEAD request
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        try {
            const headResponse = await fetch(videoUrl, {
                method: 'HEAD',
                signal: controller.signal,
            });
            clearTimeout(timeout);

            const contentLength = headResponse.headers.get('content-length');
            if (contentLength && parseInt(contentLength) > maxSize) {
                console.log(`[EmbedFix] Video too large: ${contentLength} bytes > ${maxSize} limit`);
                return null;
            }
        } catch {
            clearTimeout(timeout);
            // HEAD request failed, try downloading anyway
        }

        // Download the video
        const downloadController = new AbortController();
        const downloadTimeout = setTimeout(
            () => downloadController.abort(),
            EMBED_FIX_CONFIG.VIDEO_DOWNLOAD_TIMEOUT_MS
        );

        const response = await fetch(videoUrl, { signal: downloadController.signal });
        clearTimeout(downloadTimeout);

        if (!response.ok) {
            console.log(`[EmbedFix] Video download failed: ${response.status}`);
            return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Check actual size
        if (buffer.length > maxSize) {
            console.log(`[EmbedFix] Downloaded video too large: ${buffer.length} bytes`);
            return null;
        }

        // Extract filename from URL
        const urlPath = new URL(videoUrl).pathname;
        const filename = urlPath.split('/').pop() || 'video.mp4';

        return { buffer, filename };
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.log('[EmbedFix] Video download timed out');
        } else {
            console.error('[EmbedFix] Video download error:', error);
        }
        return null;
    }
}

/**
 * Find the best video URL that fits within size limit
 * Tries variants from highest to lowest quality
 */
async function findBestVideoUrl(
    video: NonNullable<EmbedData['videos']>[0],
    maxSize: number = EMBED_FIX_CONFIG.MAX_VIDEO_SIZE_BYTES
): Promise<string | null> {
    // If we have variants, try them in order (highest quality first)
    if (video.variants && video.variants.length > 0) {
        for (const variant of video.variants) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);

                const headResponse = await fetch(variant.url, {
                    method: 'HEAD',
                    signal: controller.signal,
                });
                clearTimeout(timeout);

                const contentLength = headResponse.headers.get('content-length');
                if (contentLength && parseInt(contentLength) <= maxSize) {
                    return variant.url;
                }
            } catch {
                // Try next variant
                continue;
            }
        }
    }

    // Fallback to main URL if no suitable variant found
    return video.url;
}

// Stored image data (on S3)
interface StoredImage {
    s3Key: string;      // S3 key for cleanup
    cdnUrl: string;     // Public CDN URL for embedding
    filename: string;
}

// Batch data structure for grouping uploads from same user
interface UploadBatch {
    images: StoredImage[];               // Images stored on S3
    videos: Array<{ url: string; thumbnail?: string }>;
    firstAuthor: {                       // First uploader's info
        name: string;
        username: string;
        avatarUrl: string | undefined;
    };
    description: string | undefined;     // First message's content
    guildId: string;
    channelId: string;
    sentMessageId: string | null;        // Bot's embed message ID (for editing)
    firstUploadTime: number;
    timerHandle: NodeJS.Timeout | null;
    cleanupHandle: NodeJS.Timeout | null;  // Timer for S3 cleanup
}

class EmbedFixService {
    private static instance: EmbedFixService;
    private initialized = false;

    // Track recent uploads by guildId:userId:filename -> timestamp
    // Used for duplicate detection within the same guild
    private recentUploads = new Map<string, number>();

    // Track upload batches by guildId:userId -> batch data
    // Used for batching multiple uploads from same user within 2-minute window
    private uploadBatches = new Map<string, UploadBatch>();

    private constructor() {
        // Private constructor for singleton
        // Periodically clean up old entries (every 10 minutes)
        setInterval(() => this.cleanupRecentUploads(), 10 * 60 * 1000);
        setInterval(() => this.cleanupBatches(), 10 * 60 * 1000);
    }

    /**
     * Clean up expired upload tracking entries
     */
    private cleanupRecentUploads(): void {
        const now = Date.now();
        const expireTime = EMBED_FIX_CONFIG.DUPLICATE_WINDOW_MS;
        for (const [key, timestamp] of this.recentUploads) {
            if (now - timestamp > expireTime) {
                this.recentUploads.delete(key);
            }
        }
    }

    /**
     * Check if an upload is a duplicate (same user, same filename, same guild, within window)
     */
    private checkUploadDuplicate(guildId: string, userId: string, filenames: string[]): boolean {
        const now = Date.now();
        for (const filename of filenames) {
            const key = `${guildId}:${userId}:${filename}`;
            const lastUpload = this.recentUploads.get(key);
            if (lastUpload && now - lastUpload < EMBED_FIX_CONFIG.DUPLICATE_WINDOW_MS) {
                return true;  // Duplicate found
            }
        }
        return false;
    }

    /**
     * Record uploads for duplicate tracking
     */
    private recordUploads(guildId: string, userId: string, filenames: string[]): void {
        const now = Date.now();
        for (const filename of filenames) {
            const key = `${guildId}:${userId}:${filename}`;
            this.recentUploads.set(key, now);
        }
    }

    /**
     * Clean up expired batch entries and their S3 images
     */
    private cleanupBatches(): void {
        const now = Date.now();
        // Use longer expiry for cleanup check (batch window + 10 min buffer for S3 cleanup)
        const expiryThreshold = EMBED_FIX_CONFIG.UPLOAD_BATCH_WINDOW_MS + 10 * 60 * 1000;

        for (const [key, batch] of this.uploadBatches) {
            // Remove batches that are older than the threshold and have no pending timers
            if (now - batch.firstUploadTime > expiryThreshold && !batch.timerHandle && !batch.cleanupHandle) {
                // Clean up any remaining S3 images that weren't cleaned up
                const s3Keys = batch.images.map(img => img.s3Key);
                if (s3Keys.length > 0) {
                    cleanupTempImages(s3Keys);
                }
                this.uploadBatches.delete(key);
            }
        }
    }

    /**
     * Generate batch key for user
     */
    private getBatchKey(guildId: string, userId: string): string {
        return `${guildId}:${userId}`;
    }

    /**
     * Build embeds and attachments from batch data
     * Downloads images from S3 and creates Discord attachments
     */
    private async buildBatchEmbedsWithAttachments(batch: UploadBatch): Promise<{
        embeds: EmbedBuilder[];
        files: AttachmentBuilder[];
    }> {
        const embeds: EmbedBuilder[] = [];
        const files: AttachmentBuilder[] = [];
        const imageCount = Math.min(batch.images.length, EMBED_FIX_CONFIG.MAX_IMAGES_PER_BATCH);

        // Download all images from S3 CDN in parallel
        const downloadPromises = batch.images.slice(0, imageCount).map(async (image, i) => {
            const buffer = await downloadFromCdn(image.cdnUrl);
            return { buffer, image, index: i };
        });
        const downloadResults = await Promise.all(downloadPromises);

        for (const { buffer, image, index } of downloadResults) {
            if (!buffer) {
                console.log(`[EmbedFix] Skipping image ${index} - download failed`);
                continue;
            }

            // Create attachment with unique filename
            const attachmentFilename = `image_${index}_${image.filename}`;
            files.push(new AttachmentBuilder(buffer, { name: attachmentFilename }));

            const embed = new EmbedBuilder()
                .setColor(EMBED_FIX_CONFIG.EMBED_COLOR_UPLOAD)
                .setURL(`https://discord.com/channels/${batch.guildId}/${batch.channelId}`)  // Same URL groups embeds
                .setImage(`attachment://${attachmentFilename}`);  // Reference the attachment

            // First embed gets full metadata
            if (embeds.length === 0) {
                embed.setAuthor({
                    name: `@${batch.firstAuthor.username}`,
                    iconURL: batch.firstAuthor.avatarUrl,
                });
                if (batch.description) {
                    embed.setDescription(batch.description.slice(0, 4096));
                }
                embed.setTimestamp(new Date(batch.firstUploadTime));
            }

            embeds.push(embed);
        }

        return { embeds, files };
    }

    /**
     * Send or edit the batch embed message
     * Downloads images from S3 and attaches to Discord message
     * S3 cleanup happens after the batch window expires (scheduled elsewhere)
     */
    private async sendOrEditBatchEmbed(batch: UploadBatch, channel: TextChannel): Promise<void> {
        const { embeds, files } = await this.buildBatchEmbedsWithAttachments(batch);
        if (embeds.length === 0) return;

        try {
            if (batch.sentMessageId) {
                // Edit existing message - need to delete and resend since we can't edit attachments
                try {
                    const existingMessage = await channel.messages.fetch(batch.sentMessageId);
                    await existingMessage.delete();
                } catch {
                    // Ignore delete failures
                }
                // Send new message with updated images
                const newMessage = await channel.send({ embeds, files, allowedMentions: { users: [] } });
                batch.sentMessageId = newMessage.id;
                await newMessage.react('❤️').catch(() => {});
                await newMessage.react('✉️').catch(() => {});
            } else {
                // Send new message
                const newMessage = await channel.send({ embeds, files, allowedMentions: { users: [] } });
                batch.sentMessageId = newMessage.id;
                await newMessage.react('❤️').catch(() => {});
                await newMessage.react('✉️').catch(() => {});
            }
            // Note: S3 cleanup happens after batch window expires via scheduled cleanup
        } catch (error) {
            console.error('[EmbedFix] Error sending/editing batch embed:', error);
        }
    }

    static getInstance(): EmbedFixService {
        if (!EmbedFixService.instance) {
            EmbedFixService.instance = new EmbedFixService();
        }
        return EmbedFixService.instance;
    }

    /**
     * Initialize the service and register handlers
     */
    initialize(): void {
        if (this.initialized) {
            return;
        }

        // Register platform handlers
        urlMatcher.registerHandler(twitterHandler);
        urlMatcher.registerHandler(pixivHandler);
        urlMatcher.registerHandler(instagramHandler);

        this.initialized = true;
        console.log('[EmbedFix] Service initialized with handlers:', urlMatcher.getHandlers().map(h => h.platform).join(', '));
    }

    /**
     * Check if message has image/video attachments
     */
    private hasMediaAttachments(message: Message): boolean {
        if (message.attachments.size === 0) return false;
        return message.attachments.some(att =>
            att.contentType?.startsWith('image/') ||
            att.contentType?.startsWith('video/') ||
            /\.(jpg|jpeg|png|gif|webp|mp4|webm|mov)$/i.test(att.name || '')
        );
    }

    /**
     * Create EmbedData from user-uploaded attachments
     */
    private createUploadEmbedData(message: Message): EmbedData {
        const images: string[] = [];
        const videos: Array<{ url: string; thumbnail?: string }> = [];

        message.attachments.forEach(att => {
            const isImage = att.contentType?.startsWith('image/') ||
                /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name || '');
            const isVideo = att.contentType?.startsWith('video/') ||
                /\.(mp4|webm|mov)$/i.test(att.name || '');

            if (isImage) {
                images.push(att.url);
            } else if (isVideo) {
                videos.push({
                    url: att.url,
                    thumbnail: att.proxyURL,
                });
            }
        });

        return {
            platform: 'upload',
            author: {
                name: message.author.displayName || message.author.username,
                username: message.author.username,
                url: message.url,  // Link to original message
                iconUrl: message.author.displayAvatarURL() || undefined,
            },
            images,
            videos: videos.length > 0 ? videos : undefined,
            color: EMBED_FIX_CONFIG.EMBED_COLOR_UPLOAD,
            originalUrl: message.url,
            description: message.content || undefined,
            timestamp: message.createdAt.toISOString(),
        };
    }

    /**
     * Process user-uploaded images/videos (with batching and duplicate detection)
     */
    private async processUserUpload(message: Message): Promise<void> {
        if (!message.guild) return;

        const guildId = message.guild.id;
        const userId = message.author.id;
        const channelId = message.channel.id;

        console.log(`[EmbedFix] processUserUpload: user=${message.author.username}, messageId=${message.id}`);

        // Extract media info from attachments
        const imageInfos: Array<{ url: string; filename: string }> = [];
        const videos: Array<{ url: string; thumbnail?: string }> = [];
        const filenames: string[] = [];

        message.attachments.forEach(att => {
            const isImage = att.contentType?.startsWith('image/') ||
                /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name || '');
            const isVideo = att.contentType?.startsWith('video/') ||
                /\.(mp4|webm|mov)$/i.test(att.name || '');

            if (isImage) {
                imageInfos.push({ url: att.url, filename: att.name || 'image.png' });
                filenames.push(att.name || 'unknown');
            } else if (isVideo) {
                videos.push({ url: att.url, thumbnail: att.proxyURL });
                filenames.push(att.name || 'unknown');
            }
        });

        console.log(`[EmbedFix] Found ${imageInfos.length} images, ${videos.length} videos, filenames: ${filenames.join(', ')}`);

        if (imageInfos.length === 0 && videos.length === 0) return;

        // Check if there's an active batch for this user - if so, skip duplicate check
        // (we want to allow adding to an existing batch even with same filename)
        const batchKey = this.getBatchKey(guildId, userId);
        const existingBatch = this.uploadBatches.get(batchKey);
        const now = Date.now();
        const hasActiveBatch = existingBatch &&
            (now - existingBatch.firstUploadTime <= EMBED_FIX_CONFIG.UPLOAD_BATCH_WINDOW_MS) &&
            existingBatch.channelId === channelId;

        // Only check for duplicates if there's no active batch
        // This prevents blocking legitimate batch additions while still catching reposts
        if (!hasActiveBatch && this.checkUploadDuplicate(guildId, userId, filenames)) {
            console.log(`[EmbedFix] Duplicate detected (no active batch), skipping`);
            return;
        }

        // Record this upload for duplicate tracking (only if not in active batch)
        if (!hasActiveBatch) {
            this.recordUploads(guildId, userId, filenames);
        }

        // Videos get reactions only (no batching)
        if (imageInfos.length === 0 && videos.length > 0) {
            try {
                await message.react('❤️').catch(() => {});
                await message.react('✉️').catch(() => {});
            } catch {
                // Ignore reaction failures
            }
            return;
        }

        // Download images and upload to S3 temporary storage
        // This ensures we have the data before the original message might be deleted
        console.log(`[EmbedFix] Downloading and storing ${imageInfos.length} images to S3...`);
        const downloadPromises = imageInfos.map(info => downloadAndStoreImage(info.url, info.filename, batchKey));
        const downloadResults = await Promise.all(downloadPromises);
        const storedImages = downloadResults.filter((img): img is StoredImage => img !== null);

        if (storedImages.length === 0) {
            console.log(`[EmbedFix] All image downloads failed, skipping`);
            return;
        }
        console.log(`[EmbedFix] Successfully stored ${storedImages.length}/${imageInfos.length} images to S3`);

        // Handle image batching (batchKey and now already computed above for duplicate check)
        let batch = existingBatch;

        console.log(`[EmbedFix] Batch check: key=${batchKey}, existingBatch=${!!batch}, existingImages=${batch?.images.length ?? 0}, sentMessageId=${batch?.sentMessageId ?? 'none'}`);

        // Check if existing batch is expired or in a different channel
        if (batch && (now - batch.firstUploadTime > EMBED_FIX_CONFIG.UPLOAD_BATCH_WINDOW_MS || batch.channelId !== channelId)) {
            console.log(`[EmbedFix] Batch expired or different channel, clearing`);
            // Clear old batch
            if (batch.timerHandle) clearTimeout(batch.timerHandle);
            if (batch.cleanupHandle) clearTimeout(batch.cleanupHandle);
            this.uploadBatches.delete(batchKey);
            batch = undefined;
        }

        if (!batch) {
            console.log(`[EmbedFix] Creating new batch`);
            // Create new batch
            batch = {
                images: [],
                videos: [],
                firstAuthor: {
                    name: message.author.displayName || message.author.username,
                    username: message.author.username,
                    avatarUrl: message.author.displayAvatarURL() || undefined,
                },
                description: message.content || undefined,
                guildId,
                channelId,
                sentMessageId: null,
                firstUploadTime: now,
                timerHandle: null,
                cleanupHandle: null,
            };
            this.uploadBatches.set(batchKey, batch);
        }

        // Check if adding these images would overflow the batch
        const spaceAvailable = EMBED_FIX_CONFIG.MAX_IMAGES_PER_BATCH - batch.images.length;

        if (spaceAvailable <= 0) {
            // Current batch is full - start a new one (but keep cleanup scheduled for old batch images)
            if (batch.timerHandle) clearTimeout(batch.timerHandle);
            // Note: Don't clear cleanupHandle - let old batch images get cleaned up on their schedule
            batch = {
                images: [],
                videos: [],
                firstAuthor: {
                    name: message.author.displayName || message.author.username,
                    username: message.author.username,
                    avatarUrl: message.author.displayAvatarURL() || undefined,
                },
                description: message.content || undefined,
                guildId,
                channelId,
                sentMessageId: null,
                firstUploadTime: now,
                timerHandle: null,
                cleanupHandle: null,
            };
            this.uploadBatches.set(batchKey, batch);
        }

        // Add stored images to batch (up to available space)
        const spaceInBatch = EMBED_FIX_CONFIG.MAX_IMAGES_PER_BATCH - batch.images.length;
        const imagesToAdd = storedImages.slice(0, spaceInBatch);
        batch.images.push(...imagesToAdd);

        console.log(`[EmbedFix] Added ${imagesToAdd.length} images to batch, total now: ${batch.images.length}, will ${batch.sentMessageId ? 'EDIT' : 'SEND NEW'}`);

        const channel = message.channel as TextChannel;

        // Send/edit embed with S3 CDN URLs
        await this.sendOrEditBatchEmbed(batch, channel);
        console.log(`[EmbedFix] After sendOrEditBatchEmbed, sentMessageId=${batch.sentMessageId}`);

        // Now delete the original message (safe since we already stored images to S3)
        try {
            await message.delete();
        } catch {
            // Silently ignore delete failures
        }

        // Schedule S3 cleanup after batch window + buffer time
        // We keep images for 5 minutes after batch window to ensure Discord has cached them
        const scheduleCleanup = (batchToClean: UploadBatch) => {
            if (batchToClean.cleanupHandle) clearTimeout(batchToClean.cleanupHandle);
            batchToClean.cleanupHandle = setTimeout(() => {
                const s3Keys = batchToClean.images.map(img => img.s3Key);
                cleanupTempImages(s3Keys);
            }, EMBED_FIX_CONFIG.UPLOAD_BATCH_WINDOW_MS + 5 * 60 * 1000);  // batch window + 5 min buffer
        };

        // Handle overflow - if we couldn't add all images, process remainder
        const overflowImages = storedImages.slice(spaceInBatch);
        if (overflowImages.length > 0) {
            // Clear current batch timer and schedule cleanup
            if (batch.timerHandle) clearTimeout(batch.timerHandle);
            batch.timerHandle = null;
            scheduleCleanup(batch);

            // Create new batch for overflow
            const overflowBatch: UploadBatch = {
                images: overflowImages,
                videos: [],
                firstAuthor: batch.firstAuthor,
                description: undefined,  // Only first batch gets description
                guildId,
                channelId,
                sentMessageId: null,
                firstUploadTime: now,
                timerHandle: null,
                cleanupHandle: null,
            };
            this.uploadBatches.set(batchKey, overflowBatch);
            await this.sendOrEditBatchEmbed(overflowBatch, channel);
            scheduleCleanup(overflowBatch);
        } else {
            // Reset/set batch expiry timer
            if (batch.timerHandle) clearTimeout(batch.timerHandle);
            batch.timerHandle = setTimeout(() => {
                // Clean up batch tracking after window expires
                const currentBatch = this.uploadBatches.get(batchKey);
                if (currentBatch && currentBatch.firstUploadTime === batch!.firstUploadTime) {
                    this.uploadBatches.delete(batchKey);
                }
            }, EMBED_FIX_CONFIG.UPLOAD_BATCH_WINDOW_MS);

            // Schedule S3 cleanup
            scheduleCleanup(batch);
        }
    }

    /**
     * Process a message for embed-worthy URLs
     * This is the main entry point called from the message handler
     * @param message The Discord message to process
     */
    async processMessage(message: Message): Promise<void> {
        // Fast path checks
        if (message.author.bot) return;
        if (!message.guild) return;

        // Check for URLs or media attachments
        const hasUrls = message.content.includes('http');
        const hasMediaUploads = this.hasMediaAttachments(message);
        if (!hasUrls && !hasMediaUploads) return;

        // Only process in art-focused channels (#art, #nsfw)
        const channelName = (message.channel as TextChannel).name?.toLowerCase() ?? '';
        if (!['art', 'nsfw'].includes(channelName)) return;

        // Handle user uploads (with batching)
        if (hasMediaUploads && !hasUrls) {
            await this.processUserUpload(message);
            return;
        }

        // From here on, we're processing URL-based embeds
        if (!hasUrls) return;

        // Check rate limits
        if (!embedFixRateLimiter.check(message.guild.id, message.author.id)) {
            return;
        }

        // Find matching URLs
        const matches = urlMatcher.matchAllUrls(message.content);
        if (matches.length === 0) return;

        // Check for duplicate (repost detection) - check first URL
        const firstMatch = matches[0];
        const firstEmbedData = await this.processUrl(firstMatch);
        if (firstEmbedData) {
            const artworkId = this.generateArtworkId(firstEmbedData);
            const duplicateCheck = await getEmbedVotesService().checkDuplicate(
                artworkId,
                message.guild.id,
                EMBED_FIX_CONFIG.DUPLICATE_WINDOW_MS
            );

            if (duplicateCheck.isDuplicate && duplicateCheck.originalShare) {
                await this.sendDuplicateNotice(message, duplicateCheck.originalShare);
                return;
            }
        }

        // Limit to max embeds per message
        const limitedMatches = matches.slice(0, EMBED_FIX_CONFIG.MAX_EMBEDS_PER_MESSAGE);
        const skippedCount = matches.length - limitedMatches.length;

        // Process each URL in parallel (skip first since we already processed it)
        const embedPromises = limitedMatches.slice(1).map(match => this.processUrl(match));
        const results = await Promise.all(embedPromises);

        // Combine first result with rest
        const allResults = firstEmbedData ? [firstEmbedData, ...results] : results;

        // Track which URLs failed (for fallback message)
        const failedFixupUrls: string[] = [];
        limitedMatches.forEach((match, index) => {
            const result = index === 0 ? firstEmbedData : results[index - 1];
            if (!result && this.isFixupUrl(match.url)) {
                failedFixupUrls.push(match.url);
            }
        });

        // Filter out null results
        const validEmbeds = allResults.filter((data): data is EmbedData => data !== null);

        // If we had fixup URLs that failed, send fallback message
        if (failedFixupUrls.length > 0 && validEmbeds.length === 0) {
            await this.sendFixupFallbackMessage(message, failedFixupUrls);
            return;
        }

        if (validEmbeds.length === 0) return;

        // Send the response
        await this.sendEmbedResponse(message, validEmbeds, skippedCount);
    }

    /**
     * Check if a URL is from a fixup service (vxtwitter, fxtwitter, etc.)
     */
    private isFixupUrl(url: string): boolean {
        const lowerUrl = url.toLowerCase();
        return EMBED_FIX_CONFIG.FIXUP_DOMAINS.some(domain => lowerUrl.includes(domain));
    }

    /**
     * Send a fallback message when fixup URLs couldn't be processed
     */
    private async sendFixupFallbackMessage(message: Message, failedUrls: string[]): Promise<void> {
        try {
            await message.reply({
                content: `⚠️ Couldn't process the fixup link. Try using the original \`twitter.com\` or \`x.com\` URL instead for embed enhancement.`,
                allowedMentions: { repliedUser: false },
            });
        } catch (error) {
            // Ignore if we can't reply
        }
    }

    /**
     * Send a notice when a duplicate/repost is detected
     */
    private async sendDuplicateNotice(
        message: Message,
        originalShare: {
            sharedBy: string;
            sharedAt: string;
            messageId: string;
            channelId: string;
        }
    ): Promise<void> {
        const timeAgo = this.getRelativeTime(originalShare.sharedAt);
        const messageLink = `https://discord.com/channels/${message.guild!.id}/${originalShare.channelId}/${originalShare.messageId}`;

        try {
            // Suppress the duplicate message's embeds so Discord doesn't show them
            await message.suppressEmbeds(true).catch(() => {
                // Ignore if we can't suppress embeds (missing permissions)
            });

            await message.reply({
                content: `🔄 This was shared ${timeAgo} → [Jump to original](${messageLink})`,
                allowedMentions: { repliedUser: false },
            });
        } catch (error) {
            // Ignore if we can't reply
        }
    }

    /**
     * Convert ISO timestamp to relative time string
     */
    private getRelativeTime(isoTimestamp: string): string {
        const diff = Date.now() - new Date(isoTimestamp).getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 0) {
            return `${hours}h ${minutes}m ago`;
        }
        return `${minutes}m ago`;
    }

    /**
     * Process a single URL for embed generation
     * Used by both message handler and /embed command
     * @param url The URL to process
     */
    async processUrl(matched: MatchedUrl): Promise<EmbedData | null> {
        const { platform, match, handler, url } = matched;

        // Check circuit breaker
        if (circuitBreaker.isOpen(platform)) {
            console.log(`[EmbedFix] Circuit breaker open for ${platform}, skipping ${url}`);
            return null;
        }

        // Generate cache key
        const cacheKey = `${platform}:${url}`;

        // Check positive cache
        const cached = embedCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        // Check negative cache
        if (embedCache.isNegativelyCached(cacheKey)) {
            return null;
        }

        try {
            // Fetch from API
            const embedData = await handler.fetchEmbed(match, url);

            if (embedData) {
                // Cache successful result
                embedCache.set(cacheKey, embedData);
                circuitBreaker.recordSuccess(platform);
                return embedData;
            } else {
                // Cache negative result
                embedCache.setNegative(cacheKey);
                circuitBreaker.recordFailure(platform);
                return null;
            }
        } catch (error) {
            console.error(`[EmbedFix] Error processing ${url}:`, error);
            embedCache.setNegative(cacheKey);
            circuitBreaker.recordFailure(platform);
            return null;
        }
    }

    /**
     * Process a single URL string (convenience method for /embed command)
     * @param url The URL string to process
     */
    async processUrlString(url: string): Promise<EmbedData | null> {
        const matched = urlMatcher.matchUrl(url);
        if (!matched) return null;
        return this.processUrl(matched);
    }

    /**
     * Send embed response to a message
     */
    private async sendEmbedResponse(
        message: Message,
        embedDataList: EmbedData[],
        skippedCount: number
    ): Promise<void> {
        const embeds: EmbedBuilder[] = [];
        const urlRewrites: string[] = [];
        const files: AttachmentBuilder[] = [];
        let videoFallbackUrl: string | undefined;

        for (const data of embedDataList) {
            if (data._useUrlRewrite && data._rewrittenUrl) {
                // URL rewrite approach (Pixiv, Instagram)
                urlRewrites.push(data._rewrittenUrl);
            } else if (data.videos && data.videos.length > 0 && data.images.length === 0) {
                // Video tweet - try to download and attach
                const video = data.videos[0];
                const bestVideoUrl = await findBestVideoUrl(video);

                if (bestVideoUrl) {
                    const downloaded = await downloadVideo(bestVideoUrl);

                    if (downloaded) {
                        // Successfully downloaded - attach the video
                        files.push(new AttachmentBuilder(downloaded.buffer, { name: downloaded.filename }));
                        // Build embed with metadata only (no thumbnail - video attachment will play inline)
                        const embed = this.buildVideoEmbed(data, downloaded.filename);
                        embeds.push(embed);
                    } else {
                        // Video too large - use vxtwitter fallback
                        videoFallbackUrl = this.getVxTwitterFallbackUrl(data.originalUrl);
                    }
                } else {
                    // No suitable video URL found - use vxtwitter fallback
                    videoFallbackUrl = this.getVxTwitterFallbackUrl(data.originalUrl);
                }
            } else {
                // Image tweet or text-only - create one embed per image
                const imageCount = Math.min(
                    data.images.length || 1,  // At least 1 for text-only tweets
                    EMBED_FIX_CONFIG.MAX_IMAGES_PER_TWEET
                );
                for (let i = 0; i < imageCount; i++) {
                    // Stop if we've hit Discord's 10 embed limit
                    if (embeds.length >= 10) break;
                    embeds.push(this.buildEmbed(data, i));
                }
            }
        }

        // Build content string
        let content = '';
        if (videoFallbackUrl) {
            // Use vxtwitter URL for large videos (Discord will embed it natively)
            content = videoFallbackUrl;
        } else if (urlRewrites.length > 0) {
            content = urlRewrites.join('\n');
        }
        if (skippedCount > 0) {
            content += content ? '\n' : '';
            content += `...and ${skippedCount} more ${skippedCount === 1 ? 'link' : 'links'}`;
        }

        // Generate artwork ID for voting (use first embed)
        const primaryEmbed = embedDataList[0];
        const artworkId = this.generateArtworkId(primaryEmbed);

        const hasEmbedsOrVideo = embeds.length > 0 || files.length > 0;

        try {
            // Helper to suppress embeds on the original message
            const suppressOriginalEmbeds = async () => {
                await message.suppressEmbeds(true).catch(() => {
                    // Ignore if we can't suppress embeds (missing permissions)
                });
            };

            // Suppress embeds immediately if they exist
            if (message.embeds.length > 0) {
                await suppressOriginalEmbeds();
            }

            // Send the fixed embed(s) with optional video attachment (no buttons - use reactions)
            const reply = await message.reply({
                content: content || undefined,
                embeds: embeds.length > 0 ? embeds : undefined,
                files: files.length > 0 ? files : undefined,
                allowedMentions: { repliedUser: false },
            });

            // Suppress embeds again after a short delay
            // Discord generates embeds asynchronously, so we need to wait and suppress again
            // to catch any embeds that appeared after our initial check
            setTimeout(async () => {
                await suppressOriginalEmbeds();
            }, 1500);

            // Add emoji reactions for voting and DM (heart first, then envelope)
            if (hasEmbedsOrVideo && !videoFallbackUrl) {
                await reply.react('❤️').catch(() => {
                    // Ignore if we can't react (missing permissions)
                });
                await reply.react('✉️').catch(() => {
                    // Ignore if we can't react (missing permissions)
                });
            }

            // Record artwork for voting (fire-and-forget)
            if (hasEmbedsOrVideo && message.guild) {
                getEmbedVotesService().recordArtwork(artworkId, {
                    originalUrl: primaryEmbed.originalUrl,
                    platform: primaryEmbed.platform,
                    artistUsername: primaryEmbed.author.username,
                    artistName: primaryEmbed.author.name,
                    guildId: message.guild.id,
                    channelId: message.channel.id,
                    messageId: reply.id,
                    sharedBy: message.author.id,
                }).catch(err => {
                    console.error('[EmbedFix] Failed to record artwork:', err);
                });
            }
        } catch (error) {
            if (message.guild) {
                logError(message.guild.id, message.guild.name, error as Error, 'EmbedFix.sendEmbedResponse');
            }
        }
    }

    /**
     * Build embed for video tweets (shows metadata, video plays inline via attachment)
     * @param videoFilename The filename of the attached video (e.g., "video.mp4")
     */
    private buildVideoEmbed(data: EmbedData, videoFilename: string): EmbedBuilder {
        // Build engagement fields
        const fields: Array<{ name: string; value: string; inline: boolean }> = [];
        if (data.engagement && data.platform === 'twitter') {
            if (data.engagement.likes !== undefined) {
                fields.push({
                    name: '❤️ Likes',
                    value: this.formatNumber(data.engagement.likes),
                    inline: true,
                });
            }
            if (data.engagement.retweets !== undefined) {
                fields.push({
                    name: '🔁 Retweets',
                    value: this.formatNumber(data.engagement.retweets),
                    inline: true,
                });
            }
            if (data.engagement.views !== undefined && data.engagement.views > 0) {
                fields.push({
                    name: '👁️ Views',
                    value: this.formatNumber(data.engagement.views),
                    inline: true,
                });
            }
        }

        // Use constructor with video property (like saucy-bot does)
        // This allows the attached video to play inline in Discord
        const embed = new EmbedBuilder({
            url: data.originalUrl,
            color: data.color,
            description: data.description && !data.description.match(/^https?:\/\//)
                ? data.description.slice(0, 4096)
                : undefined,
            author: {
                name: `@${data.author.username}`,
                url: data.author.url,
                icon_url: data.author.iconUrl,
            },
            video: {
                url: `attachment://${videoFilename}`,
            },
            fields: fields.length > 0 ? fields : undefined,
            footer: {
                text: 'Twitter',
                icon_url: EMBED_FIX_CONFIG.TWITTER_ICON_URL,
            },
            timestamp: data.timestamp ? new Date(data.timestamp).toISOString() : undefined,
        });

        return embed;
    }

    /**
     * Format large numbers (e.g., 1234567 -> "1.2M")
     */
    private formatNumber(num: number): string {
        if (num >= 1_000_000) {
            return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
        }
        if (num >= 1_000) {
            return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
        }
        return num.toString();
    }

    /**
     * Convert original Twitter/X URL to vxtwitter fallback
     */
    private getVxTwitterFallbackUrl(originalUrl: string): string {
        // Replace twitter.com or x.com with vxtwitter.com
        return originalUrl
            .replace(/https?:\/\/(www\.)?(twitter\.com|x\.com)/, EMBED_FIX_CONFIG.VXTWITTER_FALLBACK)
            .replace(/https?:\/\/(www\.)?(vxtwitter|fxtwitter|fixupx|fixvx|twittpr)\.com/, EMBED_FIX_CONFIG.VXTWITTER_FALLBACK);
    }

    /**
     * Generate artwork ID from embed data
     */
    generateArtworkId(data: EmbedData): string {
        return EmbedVotesService.generateArtworkId(data.platform, data.originalUrl);
    }

    /**
     * Build a Discord embed from embed data (artist spotlight design)
     * @param data The embed data
     * @param imageIndex Which image to display (0 = first, with full metadata)
     */
    buildEmbed(data: EmbedData, imageIndex: number = 0): EmbedBuilder {
        const isFirstImage = imageIndex === 0;
        const embed = new EmbedBuilder()
            .setColor(data.color)
            .setURL(data.originalUrl);  // Same URL groups embeds visually in Discord

        if (isFirstImage) {
            // Author with avatar and profile link
            embed.setAuthor({
                name: `@${data.author.username}`,
                url: data.author.url,
                iconURL: data.author.iconUrl,
            });

            // Tweet text as description (if present and not just a URL)
            if (data.description && !data.description.match(/^https?:\/\//)) {
                embed.setDescription(data.description.slice(0, 4096));
            }

            // Add engagement metrics as inline fields (like saucy-bot)
            if (data.engagement && data.platform === 'twitter') {
                const fields = [];
                if (data.engagement.likes !== undefined) {
                    fields.push({
                        name: '❤️ Likes',
                        value: this.formatNumber(data.engagement.likes),
                        inline: true,
                    });
                }
                if (data.engagement.retweets !== undefined) {
                    fields.push({
                        name: '🔁 Retweets',
                        value: this.formatNumber(data.engagement.retweets),
                        inline: true,
                    });
                }
                if (data.engagement.views !== undefined && data.engagement.views > 0) {
                    fields.push({
                        name: '👁️ Views',
                        value: this.formatNumber(data.engagement.views),
                        inline: true,
                    });
                }
                if (fields.length > 0) {
                    embed.addFields(fields);
                }
            }

            // Footer with platform branding
            if (data.platform === 'twitter') {
                embed.setFooter({
                    text: 'Twitter',
                    iconURL: EMBED_FIX_CONFIG.TWITTER_ICON_URL,
                });
            }

            // Timestamp
            if (data.timestamp) {
                embed.setTimestamp(new Date(data.timestamp));
            }
        }

        // Set image for this index
        if (data.images[imageIndex]) {
            embed.setImage(data.images[imageIndex]);
        }

        return embed;
    }

    /**
     * Create action buttons (vote + DM)
     */
    createActionButtons(messageId: string, artworkId: string, voteCount: number): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`embed_vote:${artworkId}`)
                .setLabel(voteCount.toString())
                .setEmoji('❤️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`embed_save:${messageId}`)
                .setLabel('DM')
                .setEmoji('✉️')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    /**
     * Handle DM button interaction
     */
    async handleBookmarkInteraction(interaction: ButtonInteraction): Promise<void> {
        try {
            const originalMessage = interaction.message;
            const embed = originalMessage.embeds[0];

            if (!embed?.url) {
                await interaction.reply({
                    content: 'Could not find the original link.',
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            // Send DM with the link
            await interaction.user.send({
                content: embed.url,
                embeds: [EmbedBuilder.from(embed)],
            });

            await interaction.reply({
                content: 'Sent to your DMs!',
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            await interaction.reply({
                content: 'Could not send DM. Please check your privacy settings.',
                flags: MessageFlags.Ephemeral,
            });
        }
    }

    /**
     * Handle envelope emoji reaction for DM functionality
     * @param reaction The reaction that was added
     * @param user The user who added the reaction
     */
    async handleEnvelopeReaction(
        reaction: MessageReaction | PartialMessageReaction,
        user: User | PartialUser
    ): Promise<void> {
        try {
            // Fetch partial reaction if needed
            if (reaction.partial) {
                await reaction.fetch();
            }

            const message = reaction.message;

            // Only process if it's on a bot message with embeds
            if (!message.author?.bot || message.embeds.length === 0) {
                return;
            }

            const embed = message.embeds[0];
            if (!embed?.url) {
                return;
            }

            // Send DM with the link and embed
            const fullUser = user.partial ? await user.fetch() : user;
            await fullUser.send({
                content: embed.url,
                embeds: [EmbedBuilder.from(embed)],
            });
        } catch (error) {
            // Silently fail - user likely has DMs disabled
            console.log(`[EmbedFix] Could not send DM to user ${user.id}: ${error}`);
        }
    }

    /**
     * Handle envelope reaction on user upload bot replies
     * Sends image URLs from embeds via DM
     */
    async handleUploadEnvelopeReaction(
        message: Message,
        user: User | PartialUser
    ): Promise<void> {
        try {
            // Get image URLs from embeds
            const imageUrls = message.embeds
                .map(embed => embed.image?.url)
                .filter((url): url is string => Boolean(url))
                .join('\n');

            if (!imageUrls) return;

            const fullUser = user.partial ? await user.fetch() : user;
            await fullUser.send({
                content: `📎 **Saved from ${message.guild?.name || 'a server'}:**\n${imageUrls}`,
            });
        } catch (error) {
            console.log(`[EmbedFix] Could not send upload DM to user ${user.id}: ${error}`);
        }
    }

    /**
     * Check if a URL is supported
     */
    isUrlSupported(url: string): boolean {
        return urlMatcher.matchUrl(url) !== null;
    }

    /**
     * Get supported platforms
     */
    getSupportedPlatforms(): string[] {
        return urlMatcher.getHandlers().map(h => h.platform);
    }

    /**
     * Process a message edit - re-check for embed-worthy URLs
     * Only processes edits within the configured time window
     */
    async processMessageEdit(oldMessage: Message, newMessage: Message): Promise<void> {
        // Fast path checks
        if (!newMessage.content.includes('http')) return;
        if (newMessage.author.bot) return;
        if (!newMessage.guild) return;

        // Only process in art-focused channels
        const channelName = (newMessage.channel as TextChannel).name?.toLowerCase() ?? '';
        if (!['art', 'nsfw'].includes(channelName)) return;

        // Check if message is within edit window (72h)
        const messageAge = Date.now() - newMessage.createdTimestamp;
        if (messageAge > EMBED_FIX_CONFIG.MESSAGE_EDIT_WINDOW_MS) {
            return;
        }

        // Check if message has any supported URLs
        const newUrls = urlMatcher.matchAllUrls(newMessage.content);
        if (newUrls.length === 0) return;

        // Always suppress embeds on edited messages with supported URLs
        // Discord regenerates embeds on edit, so we need to suppress them again
        const suppressEmbeds = async () => {
            await newMessage.suppressEmbeds(true).catch(() => {});
        };

        // Suppress immediately if embeds exist
        if (newMessage.embeds.length > 0) {
            await suppressEmbeds();
        }

        // Delayed suppression to catch Discord's async embed generation
        setTimeout(async () => {
            await suppressEmbeds();
        }, 1500);

        // Check if URLs changed (avoid reprocessing identical content for new embeds)
        const oldUrls = urlMatcher.matchAllUrls(oldMessage.content ?? '');

        // Get URL strings for comparison
        const oldUrlSet = new Set(oldUrls.map(m => m.url));

        // Check if there are any new URLs
        const hasNewUrls = newUrls.some(m => !oldUrlSet.has(m.url));
        if (!hasNewUrls) {
            return;
        }

        // Check rate limits
        if (!embedFixRateLimiter.check(newMessage.guild.id, newMessage.author.id)) {
            return;
        }

        // Process the edited message like a new message
        // Find URLs that weren't in the old message
        const newMatches = newUrls.filter(m => !oldUrlSet.has(m.url));
        if (newMatches.length === 0) return;

        // Check for duplicate
        const firstMatch = newMatches[0];
        const firstEmbedData = await this.processUrl(firstMatch);
        if (firstEmbedData) {
            const artworkId = this.generateArtworkId(firstEmbedData);
            const duplicateCheck = await getEmbedVotesService().checkDuplicate(
                artworkId,
                newMessage.guild.id,
                EMBED_FIX_CONFIG.DUPLICATE_WINDOW_MS
            );

            if (duplicateCheck.isDuplicate && duplicateCheck.originalShare) {
                await this.sendDuplicateNotice(newMessage, duplicateCheck.originalShare);
                return;
            }
        }

        // Process remaining new URLs
        const limitedMatches = newMatches.slice(0, EMBED_FIX_CONFIG.MAX_EMBEDS_PER_MESSAGE);
        const embedPromises = limitedMatches.slice(1).map(match => this.processUrl(match));
        const results = await Promise.all(embedPromises);
        const allResults = firstEmbedData ? [firstEmbedData, ...results] : results;

        // Track failed fixup URLs
        const failedFixupUrls: string[] = [];
        limitedMatches.forEach((match, index) => {
            const result = index === 0 ? firstEmbedData : results[index - 1];
            if (!result && this.isFixupUrl(match.url)) {
                failedFixupUrls.push(match.url);
            }
        });

        const validEmbeds = allResults.filter((data): data is EmbedData => data !== null);

        if (failedFixupUrls.length > 0 && validEmbeds.length === 0) {
            await this.sendFixupFallbackMessage(newMessage, failedFixupUrls);
            return;
        }

        if (validEmbeds.length === 0) return;

        await this.sendEmbedResponse(newMessage, validEmbeds, 0);
    }
}

// Export singleton getter
export function getEmbedFixService(): EmbedFixService {
    return EmbedFixService.getInstance();
}

// Export for message handler hook
export async function checkEmbedFixUrls(message: Message): Promise<void> {
    // Fast path checks
    const hasUrls = message.content.includes('http');
    const hasAttachments = message.attachments.size > 0;
    if (!hasUrls && !hasAttachments) return;
    if (message.author.bot) return;
    if (!message.guild) return;

    // Fire-and-forget - errors are logged internally
    getEmbedFixService().processMessage(message).catch(err => {
        if (message.guild) {
            logError(message.guild.id, message.guild.name, err as Error, 'EmbedFix');
        }
    });
}

// Export for message edit handler hook
export async function checkEmbedFixUrlsOnEdit(oldMessage: Message, newMessage: Message): Promise<void> {
    // Fast path checks
    if (!newMessage.content?.includes('http')) return;
    if (newMessage.author?.bot) return;
    if (!newMessage.guild) return;

    // Fire-and-forget - errors are logged internally
    getEmbedFixService().processMessageEdit(oldMessage, newMessage).catch(err => {
        if (newMessage.guild) {
            logError(newMessage.guild.id, newMessage.guild.name, err as Error, 'EmbedFix.Edit');
        }
    });
}
