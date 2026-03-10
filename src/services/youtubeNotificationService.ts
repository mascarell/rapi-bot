import { Client, TextChannel } from 'discord.js';
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
    /** Discord user ID of the content creator to mention in notifications */
    discordUserId: string;
}

export interface YouTubeNotificationData {
    monitoredChannels: YouTubeChannelConfig[];
    /** Last seen video ID per YouTube channel */
    lastSeenVideoIds: Record<string, string>;
    /** Last N seen video IDs per channel for resilient dedup (survives deletions) */
    recentVideoIds?: Record<string, string[]>;
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
     * Convert YouTube channel ID to uploads playlist ID (UC... -> UU...)
     */
    private channelIdToPlaylistId(channelId: string): string {
        if (channelId.startsWith('UC')) {
            return 'UU' + channelId.slice(2);
        }
        return channelId;
    }

    /**
     * Fetch videos from YouTube Data API v3 using playlistItems.list
     */
    public async fetchPlaylistItems(channelId: string): Promise<YouTubeVideoEntry[]> {
        const apiKey = process.env.YOUTUBE_API_KEY;
        if (!apiKey) {
            logger.error`[YouTube] YOUTUBE_API_KEY not set`;
            return [];
        }

        const playlistId = this.channelIdToPlaylistId(channelId);
        const url = `${YOUTUBE_CONFIG.PLAYLIST_API_URL}?part=snippet&playlistId=${playlistId}&maxResults=${YOUTUBE_CONFIG.API_MAX_RESULTS}&key=${apiKey}`;

        for (let attempt = 1; attempt <= YOUTUBE_CONFIG.FETCH_MAX_RETRIES; attempt++) {
            try {
                const response = await fetch(url, {
                    signal: AbortSignal.timeout(YOUTUBE_CONFIG.FETCH_TIMEOUT_MS),
                });

                if (response.ok) {
                    const data = await response.json() as any;
                    const entries = this.parseApiResponse(data, channelId);
                    const filtered = await this.filterLiveStreams(entries, apiKey);
                    logger.debug`[YouTube] Fetched ${entries.length} video(s), ${filtered.length} upload(s) for ${channelId}`;
                    return filtered;
                }

                // 403 = quota exceeded or forbidden, don't retry
                if (response.status === 403) {
                    logger.warning`[YouTube] API returned 403 for channel ${channelId} (quota exceeded or forbidden)`;
                    return [];
                }

                logger.debug`[YouTube] API returned ${response.status} for channel ${channelId} (attempt ${attempt}/${YOUTUBE_CONFIG.FETCH_MAX_RETRIES})`;
            } catch (error: any) {
                logger.debug`[YouTube] Fetch error for ${channelId} (attempt ${attempt}/${YOUTUBE_CONFIG.FETCH_MAX_RETRIES}): ${error.message}`;
            }

            if (attempt < YOUTUBE_CONFIG.FETCH_MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, YOUTUBE_CONFIG.FETCH_RETRY_DELAY_MS * attempt));
            }
        }

        logger.warning`[YouTube] API failed after ${YOUTUBE_CONFIG.FETCH_MAX_RETRIES} retries for channel ${channelId}`;
        return [];
    }

    /**
     * Parse YouTube Data API playlistItems response into video entries
     */
    private parseApiResponse(data: any, channelId: string): YouTubeVideoEntry[] {
        const items = data?.items;
        if (!Array.isArray(items)) return [];

        const entries: YouTubeVideoEntry[] = [];
        for (const item of items) {
            const snippet = item?.snippet;
            if (!snippet) continue;

            const videoId = snippet.resourceId?.videoId;
            if (!videoId) continue;

            entries.push({
                videoId,
                title: snippet.title || '',
                channelName: snippet.videoOwnerChannelTitle || '',
                channelId,
                publishedAt: snippet.publishedAt || '',
                thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
            });
        }

        return entries;
    }

    /**
     * Filter out live streams/premieres using videos.list with liveStreamingDetails.
     * Videos with liveStreamingDetails are live streams; those without are regular uploads.
     */
    private async filterLiveStreams(entries: YouTubeVideoEntry[], apiKey: string): Promise<YouTubeVideoEntry[]> {
        if (entries.length === 0) return [];

        const ids = entries.map(e => e.videoId).join(',');
        const url = `${YOUTUBE_CONFIG.VIDEOS_API_URL}?part=liveStreamingDetails&id=${ids}&key=${apiKey}`;

        try {
            const response = await fetch(url, {
                signal: AbortSignal.timeout(YOUTUBE_CONFIG.FETCH_TIMEOUT_MS),
            });

            if (!response.ok) {
                logger.warning`[YouTube] videos.list returned ${response.status}, skipping live stream filter`;
                return entries;
            }

            const data = await response.json() as any;
            const liveVideoIds = new Set<string>();

            for (const item of data?.items || []) {
                if (item.liveStreamingDetails) {
                    liveVideoIds.add(item.id);
                }
            }

            if (liveVideoIds.size > 0) {
                logger.debug`[YouTube] Filtered out ${liveVideoIds.size} live stream(s)`;
            }

            return entries.filter(e => !liveVideoIds.has(e.videoId));
        } catch (error: any) {
            logger.warning`[YouTube] Failed to check live stream status: ${error.message}`;
            return entries;
        }
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

        // Initialize recentVideoIds if missing (backward compat)
        if (!data.recentVideoIds) {
            data.recentVideoIds = {};
        }

        logger.debug`[YouTube] Checking ${data.monitoredChannels.length} monitored channel(s)`;

        for (const channelConfig of data.monitoredChannels) {
            const entries = await this.fetchPlaylistItems(channelConfig.channelId);
            if (entries.length === 0) {
                logger.debug`[YouTube] No entries returned for ${channelConfig.channelId}, skipping`;
                continue;
            }

            const lastSeenId = data.lastSeenVideoIds[channelConfig.channelId];
            const knownIds = new Set(data.recentVideoIds[channelConfig.channelId] || []);

            if (!lastSeenId) {
                // First run: post only the most recent video, then seed
                results.push({ videos: [entries[0]], channelConfig });
                data.lastSeenVideoIds[channelConfig.channelId] = entries[0].videoId;
                data.recentVideoIds[channelConfig.channelId] = entries.map(e => e.videoId);
                dataChanged = true;
                logger.debug`[YouTube] First run for ${channelConfig.channelId}, posting latest: ${entries[0].videoId}`;
                continue;
            }

            // Walk entries (newest first) until we hit the last seen ID
            const newVideos: YouTubeVideoEntry[] = [];
            for (const entry of entries) {
                if (entry.videoId === lastSeenId) break;
                newVideos.push(entry);
            }

            if (newVideos.length === 0) {
                logger.debug`[YouTube] No new videos for ${channelConfig.channelId}, last seen ${lastSeenId} is current`;
            }

            if (newVideos.length > 0) {
                if (newVideos.length === entries.length) {
                    // lastSeenVideoId not found in feed — video was likely deleted.
                    // Use recentVideoIds to find a fallback reference point and only
                    // return genuinely new videos (ones we haven't seen before).
                    const genuinelyNew = entries.filter(e => !knownIds.has(e.videoId));

                    if (genuinelyNew.length > 0) {
                        logger.warning`[YouTube] lastSeenVideoId not found for ${channelConfig.channelId}, posting ${genuinelyNew.length} new video(s) using history`;
                        genuinelyNew.reverse();
                        results.push({ videos: genuinelyNew, channelConfig });
                    } else {
                        logger.debug`[YouTube] lastSeenVideoId not found for ${channelConfig.channelId}, but all videos already known — re-seeding only`;
                    }

                    data.lastSeenVideoIds[channelConfig.channelId] = entries[0].videoId;
                    data.recentVideoIds[channelConfig.channelId] = entries.map(e => e.videoId);
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

            // Always update recentVideoIds with the current feed snapshot
            data.recentVideoIds[channelConfig.channelId] = entries.map(e => e.videoId);
            dataChanged = true;
        }

        // Persist seeded IDs or updated last seen IDs
        if (dataChanged) {
            data.lastPolledAt = new Date().toISOString();
            await this.saveData(data);
        }

        return results;
    }

    /**
     * Fetch recent messages from a channel for dedup, returning null on failure
     */
    private async fetchRecentMessages(channel: TextChannel): Promise<string[] | null> {
        try {
            const messages = await channel.messages.fetch({ limit: YOUTUBE_CONFIG.CHANNEL_DEDUP_MESSAGE_LIMIT });
            return messages.map(msg => msg.content);
        } catch {
            logger.debug`[YouTube] Could not fetch messages for dedup in #${channel.name}, proceeding`;
            return null;
        }
    }

    /**
     * Post new video notifications only to explicitly configured guild+channel pairs.
     * Checks last 20 Discord channel messages to prevent duplicate notifications
     * (e.g., when a video is deleted and re-uploaded, causing a re-seed).
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

            // Fetch recent messages once per channel for dedup
            const recentMessages = await this.fetchRecentMessages(channel);

            for (const { videos, channelConfig } of newVideoGroups) {
                for (const video of videos) {
                    try {
                        if (recentMessages?.some(content => content.includes(video.videoUrl) || content.includes(video.videoId))) {
                            logger.debug`[YouTube] Skipping ${video.videoId} in ${guild.name}#${channel.name} — already posted in recent messages`;
                            continue;
                        }

                        const phrase = this.getRandomAnnouncementPhrase(channelConfig.discordUserId);
                        await channel.send({ content: `@everyone\n${phrase}\n${video.videoUrl}` });
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
     * Main entry point: poll YouTube API and post notifications for new videos
     */
    public async pollAndNotify(bot: Client): Promise<{ notified: number; errors: number }> {
        if (!process.env.YOUTUBE_API_KEY) {
            logger.error`[YouTube] YOUTUBE_API_KEY not set, skipping poll`;
            return { notified: 0, errors: 0 };
        }

        const newVideoGroups = await this.checkForNewVideos();

        if (newVideoGroups.length === 0) {
            logger.debug`[YouTube] Poll complete, no new videos found`;
            return { notified: 0, errors: 0 };
        }

        const totalNewVideos = newVideoGroups.reduce((sum, g) => sum + g.videos.length, 0);
        logger.debug`[YouTube] Found ${totalNewVideos} new video(s) to notify`;

        return this.postNotifications(bot, newVideoGroups);
    }

    /**
     * Get a random Rapi-themed announcement phrase with the user mention inserted
     */
    private getRandomAnnouncementPhrase(discordUserId: string): string {
        const phrases = YOUTUBE_CONFIG.ANNOUNCEMENT_PHRASES;
        const phrase = phrases[Math.floor(Math.random() * phrases.length)];
        return phrase.replace('{user}', `<@${discordUserId}>`);
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
