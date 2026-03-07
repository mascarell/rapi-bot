import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, S3_BUCKET } from '../utils/cdn/config.js';
import { YOUTUBE_CONFIG } from '../utils/data/youtubeConfig.js';
import { getGachaGuildConfigService } from './gachaGuildConfigService.js';
import { logger } from '../utils/logger.js';

const isDevelopment = process.env.NODE_ENV === 'development';
const CONFIG_KEY = isDevelopment
    ? `${YOUTUBE_CONFIG.DATA_PATH}/dev-config.json`
    : `${YOUTUBE_CONFIG.DATA_PATH}/config.json`;

export interface YouTubeChannelConfig {
    /** YouTube channel ID (e.g., "UCxxxxxxxx") */
    channelId: string;
    /** Human-readable label for logging */
    channelName: string;
    /** Discord user ID of the content creator to mention in notifications */
    discordUserId: string;
}

export interface YouTubeNotificationData {
    monitoredChannels: YouTubeChannelConfig[];
    /** Last seen video ID per YouTube channel */
    lastSeenVideoIds: Record<string, string>;
    lastPolledAt: string | null;
    lastUpdated: string;
    schemaVersion: number;
}

export interface YouTubeVideoEntry {
    videoId: string;
    title: string;
    channelName: string;
    channelId: string;
    publishedAt: string;
    thumbnailUrl: string;
    videoUrl: string;
}

class YouTubeNotificationService {
    private static instance: YouTubeNotificationService;
    private cache: YouTubeNotificationData | null = null;
    private cacheExpiry: number = 0;

    private constructor() {}

    public static getInstance(): YouTubeNotificationService {
        if (!YouTubeNotificationService.instance) {
            YouTubeNotificationService.instance = new YouTubeNotificationService();
        }
        return YouTubeNotificationService.instance;
    }

    /**
     * Get notification data from S3 (with caching)
     */
    public async getData(): Promise<YouTubeNotificationData> {
        if (this.cache && Date.now() < this.cacheExpiry) {
            return this.cache;
        }

        try {
            const response = await s3Client.send(new GetObjectCommand({
                Bucket: S3_BUCKET,
                Key: CONFIG_KEY,
            }));

            const bodyContents = await response.Body?.transformToString();
            if (!bodyContents) {
                return this.getDefaultData();
            }

            this.cache = JSON.parse(bodyContents) as YouTubeNotificationData;
            this.cacheExpiry = Date.now() + YOUTUBE_CONFIG.CACHE_TTL;
            return this.cache;
        } catch (error: any) {
            if (error.name === 'NoSuchKey' || error.Code === 'NoSuchKey') {
                logger.warning`[YouTube] Config not found at ${CONFIG_KEY}, creating default...`;
                const defaultData = this.getDefaultData();
                await this.saveData(defaultData);
                return defaultData;
            }
            logger.error`[YouTube] Error fetching config: ${error}`;
            throw error;
        }
    }

    /**
     * Save notification data to S3
     */
    public async saveData(data: YouTubeNotificationData): Promise<void> {
        data.lastUpdated = new Date().toISOString();

        await s3Client.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: CONFIG_KEY,
            Body: JSON.stringify(data, null, 2),
            ContentType: 'application/json',
        }));

        this.cache = data;
        this.cacheExpiry = Date.now() + YOUTUBE_CONFIG.CACHE_TTL;
    }

    /**
     * Fetch and parse YouTube RSS feed for a channel
     */
    public async fetchRssFeed(channelId: string): Promise<YouTubeVideoEntry[]> {
        try {
            const url = `${YOUTUBE_CONFIG.RSS_FEED_BASE_URL}${channelId}`;
            const response = await fetch(url, {
                signal: AbortSignal.timeout(YOUTUBE_CONFIG.FETCH_TIMEOUT_MS),
            });

            if (!response.ok) {
                logger.warning`[YouTube] RSS feed returned ${response.status} for channel ${channelId}`;
                return [];
            }

            const xml = await response.text();
            return this.parseRssXml(xml, channelId);
        } catch (error: any) {
            logger.warning`[YouTube] Failed to fetch RSS for channel ${channelId}: ${error.message}`;
            return [];
        }
    }

    /**
     * Parse YouTube RSS XML into video entries
     */
    public parseRssXml(xml: string, channelId: string): YouTubeVideoEntry[] {
        const entries: YouTubeVideoEntry[] = [];
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;

        let match;
        while ((match = entryRegex.exec(xml)) !== null) {
            const entryXml = match[1];

            const videoId = this.extractTag(entryXml, 'yt:videoId');
            const title = this.decodeHtmlEntities(this.extractTag(entryXml, 'title') || '');
            const channelName = this.extractTag(entryXml, 'name') || '';
            const publishedAt = this.extractTag(entryXml, 'published') || '';

            if (videoId) {
                entries.push({
                    videoId,
                    title,
                    channelName,
                    channelId,
                    publishedAt,
                    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
                });
            }
        }

        return entries;
    }

    /**
     * Check all monitored channels for new videos
     * Returns new videos to notify about, grouped with their channel config
     */
    public async checkForNewVideos(): Promise<{ videos: YouTubeVideoEntry[]; channelConfig: YouTubeChannelConfig }[]> {
        const cachedData = await this.getData();
        // Deep copy to avoid mutating cached S3 data before save succeeds
        const data: YouTubeNotificationData = JSON.parse(JSON.stringify(cachedData));
        const results: { videos: YouTubeVideoEntry[]; channelConfig: YouTubeChannelConfig }[] = [];
        let dataChanged = false;

        for (const channelConfig of data.monitoredChannels) {
            const entries = await this.fetchRssFeed(channelConfig.channelId);
            if (entries.length === 0) continue;

            const lastSeenId = data.lastSeenVideoIds[channelConfig.channelId];

            if (!lastSeenId) {
                // First run: seed with newest video ID, don't post anything
                data.lastSeenVideoIds[channelConfig.channelId] = entries[0].videoId;
                dataChanged = true;
                logger.debug`[YouTube] Seeded lastSeenVideoId for ${channelConfig.channelName}: ${entries[0].videoId}`;
                continue;
            }

            // Walk entries (newest first) until we hit the last seen ID
            const newVideos: YouTubeVideoEntry[] = [];
            for (const entry of entries) {
                if (entry.videoId === lastSeenId) break;
                newVideos.push(entry);
            }

            if (newVideos.length > 0) {
                // If we walked the entire feed without finding lastSeenId, the tracked video
                // was likely deleted or the feed changed significantly. Re-seed to avoid
                // flooding with up to 15 old videos.
                if (newVideos.length === entries.length) {
                    logger.warning`[YouTube] lastSeenVideoId not found in feed for ${channelConfig.channelName}, re-seeding`;
                    data.lastSeenVideoIds[channelConfig.channelId] = entries[0].videoId;
                    dataChanged = true;
                    continue;
                }

                // Reverse to post oldest first (chronological order)
                newVideos.reverse();
                results.push({ videos: newVideos, channelConfig });

                // Update last seen to newest
                data.lastSeenVideoIds[channelConfig.channelId] = entries[0].videoId;
                dataChanged = true;
            }
        }

        // Persist seeded IDs or updated last seen IDs
        if (dataChanged) {
            data.lastPolledAt = new Date().toISOString();
            await this.saveData(data);
        }

        return results;
    }

    /**
     * Post new video notifications only to explicitly configured guild+channel pairs
     */
    public async postNotifications(
        bot: Client,
        newVideoGroups: { videos: YouTubeVideoEntry[]; channelConfig: YouTubeChannelConfig }[]
    ): Promise<{ notified: number; errors: number }> {
        const guildConfigService = getGachaGuildConfigService();
        const guildConfig = await guildConfigService.getConfig();
        const targets = guildConfig.youtubeNotifications || [];

        if (targets.length === 0) {
            logger.debug`[YouTube] No youtubeNotifications configured, skipping`;
            return { notified: 0, errors: 0 };
        }

        let notified = 0;
        let errors = 0;

        for (const target of targets) {
            let guild;
            try {
                guild = await bot.guilds.fetch(target.guildId);
            } catch {
                logger.warning`[YouTube] Bot not in guild ${target.guildId}, skipping`;
                continue;
            }

            const fetched = guild.channels.cache.get(target.channelId);
            if (!fetched?.isTextBased()) {
                logger.warning`[YouTube] Channel ${target.channelId} not found in ${guild.name}`;
                continue;
            }
            const channel = fetched as TextChannel;

            for (const { videos, channelConfig } of newVideoGroups) {
                for (const video of videos) {
                    try {
                        const embed = this.createVideoEmbed(video);
                        const phrase = this.getRandomAnnouncementPhrase(channelConfig.discordUserId);
                        await channel.send({ content: `@everyone\n${phrase}`, embeds: [embed] });
                        notified++;
                    } catch (error: any) {
                        logger.error`[YouTube] Failed to post in ${guild.name}#${channel.name}: ${error.message}`;
                        errors++;
                    }
                }
            }
        }

        return { notified, errors };
    }

    /**
     * Main entry point: poll RSS feeds and post notifications for new videos
     */
    public async pollAndNotify(bot: Client): Promise<{ notified: number; errors: number }> {
        const newVideoGroups = await this.checkForNewVideos();

        if (newVideoGroups.length === 0) {
            return { notified: 0, errors: 0 };
        }

        const totalNewVideos = newVideoGroups.reduce((sum, g) => sum + g.videos.length, 0);
        logger.debug`[YouTube] Found ${totalNewVideos} new video(s) to notify`;

        return this.postNotifications(bot, newVideoGroups);
    }

    /**
     * Create a rich embed for a YouTube video
     */
    private createVideoEmbed(video: YouTubeVideoEntry): EmbedBuilder {
        return new EmbedBuilder()
            .setColor(YOUTUBE_CONFIG.EMBED_COLOR)
            .setTitle(video.title)
            .setURL(video.videoUrl)
            .setAuthor({ name: video.channelName })
            .setImage(video.thumbnailUrl)
            .setTimestamp(new Date(video.publishedAt));
    }

    /**
     * Get a random Rapi-themed announcement phrase with the user mention inserted
     */
    private getRandomAnnouncementPhrase(discordUserId: string): string {
        const phrases = YOUTUBE_CONFIG.ANNOUNCEMENT_PHRASES;
        const phrase = phrases[Math.floor(Math.random() * phrases.length)];
        return phrase.replace('{user}', `<@${discordUserId}>`);
    }

    private extractTag(xml: string, tagName: string): string | null {
        const regex = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`);
        const match = regex.exec(xml);
        return match ? match[1].trim() : null;
    }

    private decodeHtmlEntities(text: string): string {
        return text
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&#x27;/g, "'")
            .replace(/&#x2F;/g, '/');
    }

    private getDefaultData(): YouTubeNotificationData {
        return {
            monitoredChannels: [],
            lastSeenVideoIds: {},
            lastPolledAt: null,
            lastUpdated: new Date().toISOString(),
            schemaVersion: 1,
        };
    }

    public clearCache(): void {
        this.cache = null;
        this.cacheExpiry = 0;
    }
}

export const getYouTubeNotificationService = (): YouTubeNotificationService =>
    YouTubeNotificationService.getInstance();

/** Reset singleton for testing */
export const _testResetYouTubeService = (): void => {
    (YouTubeNotificationService as any).instance = undefined;
};
