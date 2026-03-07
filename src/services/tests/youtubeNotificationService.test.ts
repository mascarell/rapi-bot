import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Client, Guild, TextChannel, ChannelType } from 'discord.js';

// Set environment variable before any imports
vi.stubEnv('CDN_DOMAIN_URL', 'https://cdn.example.com');

// Mock EmbedBuilder
vi.mock('discord.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('discord.js')>();
    return {
        ...actual,
        EmbedBuilder: vi.fn().mockImplementation(() => ({
            setColor: vi.fn().mockReturnThis(),
            setTitle: vi.fn().mockReturnThis(),
            setURL: vi.fn().mockReturnThis(),
            setAuthor: vi.fn().mockReturnThis(),
            setImage: vi.fn().mockReturnThis(),
            setTimestamp: vi.fn().mockReturnThis(),
            setFooter: vi.fn().mockReturnThis(),
            setThumbnail: vi.fn().mockReturnThis(),
            setDescription: vi.fn().mockReturnThis(),
            toJSON: vi.fn().mockReturnValue({}),
        })),
    };
});

// Mock S3
vi.mock('../../utils/cdn/config', () => ({
    s3Client: {
        send: vi.fn(),
    },
    S3_BUCKET: 'test-bucket',
}));

// Mock guild config service
vi.mock('../gachaGuildConfigService', () => ({
    getGachaGuildConfigService: vi.fn(),
}));

import {
    getYouTubeNotificationService,
    _testResetYouTubeService,
    YouTubeNotificationData,
    YouTubeChannelConfig,
    YouTubeVideoEntry,
} from '../youtubeNotificationService';
import { s3Client } from '../../utils/cdn/config';
import { getGachaGuildConfigService } from '../gachaGuildConfigService';

// Sample RSS XML for testing
const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
  <title>Test Channel</title>
  <entry>
    <yt:videoId>video_newest</yt:videoId>
    <title>Newest Video Title</title>
    <author><name>Test Channel</name></author>
    <published>2026-03-05T12:00:00+00:00</published>
    <updated>2026-03-05T12:00:01+00:00</updated>
  </entry>
  <entry>
    <yt:videoId>video_middle</yt:videoId>
    <title>Middle Video Title</title>
    <author><name>Test Channel</name></author>
    <published>2026-03-04T12:00:00+00:00</published>
    <updated>2026-03-04T12:00:01+00:00</updated>
  </entry>
  <entry>
    <yt:videoId>video_oldest</yt:videoId>
    <title>Oldest Video Title</title>
    <author><name>Test Channel</name></author>
    <published>2026-03-03T12:00:00+00:00</published>
    <updated>2026-03-03T12:00:01+00:00</updated>
  </entry>
</feed>`;

const SAMPLE_RSS_WITH_ENTITIES = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <entry>
    <yt:videoId>video_entities</yt:videoId>
    <title>Tom &amp; Jerry&#39;s &quot;Adventure&quot;</title>
    <author><name>Test &amp; Channel</name></author>
    <published>2026-03-05T12:00:00+00:00</published>
  </entry>
</feed>`;

const SAMPLE_RSS_WITH_LIVE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <entry>
    <yt:videoId>live_stream_1</yt:videoId>
    <title>🔴LIVE — Playing games</title>
    <author><name>Test Channel</name></author>
    <published>2026-03-05T20:00:00+00:00</published>
    <updated>2026-03-05T23:30:00+00:00</updated>
  </entry>
  <entry>
    <yt:videoId>upload_1</yt:videoId>
    <title>Regular Upload Video</title>
    <author><name>Test Channel</name></author>
    <published>2026-03-05T14:00:00+00:00</published>
    <updated>2026-03-05T14:00:01+00:00</updated>
  </entry>
</feed>`;

const EMPTY_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <title>Empty Channel</title>
</feed>`;

function createMockS3Data(overrides: Partial<YouTubeNotificationData> = {}): YouTubeNotificationData {
    return {
        monitoredChannels: [
            { channelId: 'UC_test_channel', discordUserId: '118451485221715977' },
        ],
        lastSeenVideoIds: {},
        lastPolledAt: null,
        lastUpdated: new Date().toISOString(),
        schemaVersion: 1,
        ...overrides,
    };
}

function mockS3GetResponse(data: YouTubeNotificationData) {
    vi.mocked(s3Client.send).mockResolvedValueOnce({
        Body: {
            transformToString: () => Promise.resolve(JSON.stringify(data)),
        },
    } as any);
}

describe('YouTubeNotificationService', () => {
    let service: ReturnType<typeof getYouTubeNotificationService>;
    let mockGuildConfigService: any;
    let mockChannel: any;
    let mockGuild: any;
    let mockBot: any;

    beforeEach(() => {
        _testResetYouTubeService();
        service = getYouTubeNotificationService();
        service.clearCache();

        mockChannel = {
            name: 'videos',
            type: ChannelType.GuildText,
            isTextBased: vi.fn().mockReturnValue(true),
            send: vi.fn().mockResolvedValue({}),
        };

        mockGuild = {
            id: 'guild_123',
            name: 'Test Guild',
            channels: {
                cache: {
                    get: vi.fn().mockReturnValue(mockChannel),
                },
            },
        };

        mockBot = {
            guilds: {
                fetch: vi.fn().mockResolvedValue(mockGuild),
            },
        };

        mockGuildConfigService = {
            getConfig: vi.fn().mockResolvedValue({
                allowedGuildIds: ['guild_123'],
                youtubeNotifications: [
                    { guildId: 'guild_123', channelId: 'channel_videos_123' },
                ],
                lastUpdated: new Date().toISOString(),
                schemaVersion: 1,
            }),
        };

        vi.mocked(getGachaGuildConfigService).mockReturnValue(mockGuildConfigService);

        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('parseRssXml', () => {
        it('should parse a valid YouTube RSS feed with multiple entries', () => {
            const entries = service.parseRssXml(SAMPLE_RSS, 'UC_test');
            expect(entries).toHaveLength(3);
        });

        it('should extract videoId, title, channelName, publishedAt from each entry', () => {
            const entries = service.parseRssXml(SAMPLE_RSS, 'UC_test');

            expect(entries[0].videoId).toBe('video_newest');
            expect(entries[0].title).toBe('Newest Video Title');
            expect(entries[0].channelName).toBe('Test Channel');
            expect(entries[0].publishedAt).toBe('2026-03-05T12:00:00+00:00');
        });

        it('should construct correct thumbnailUrl and videoUrl from videoId', () => {
            const entries = service.parseRssXml(SAMPLE_RSS, 'UC_test');

            expect(entries[0].thumbnailUrl).toBe('https://i.ytimg.com/vi/video_newest/hqdefault.jpg');
            expect(entries[0].videoUrl).toBe('https://www.youtube.com/watch?v=video_newest');
        });

        it('should set channelId on each entry', () => {
            const entries = service.parseRssXml(SAMPLE_RSS, 'UC_test');
            expect(entries[0].channelId).toBe('UC_test');
            expect(entries[2].channelId).toBe('UC_test');
        });

        it('should return empty array for empty feed (no entries)', () => {
            const entries = service.parseRssXml(EMPTY_RSS, 'UC_test');
            expect(entries).toHaveLength(0);
        });

        it('should return empty array for malformed/invalid XML', () => {
            const entries = service.parseRssXml('not xml at all', 'UC_test');
            expect(entries).toHaveLength(0);
        });

        it('should handle HTML entities in video titles', () => {
            const entries = service.parseRssXml(SAMPLE_RSS_WITH_ENTITIES, 'UC_test');
            expect(entries[0].title).toBe('Tom & Jerry\'s "Adventure"');
        });

        it('should filter out live streams based on published/updated gap', () => {
            const entries = service.parseRssXml(SAMPLE_RSS_WITH_LIVE, 'UC_test');
            expect(entries).toHaveLength(1);
            expect(entries[0].videoId).toBe('upload_1');
        });

        it('should keep entries without updated tag (treated as uploads)', () => {
            const rssNoUpdated = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <entry>
    <yt:videoId>no_updated</yt:videoId>
    <title>No Updated Tag</title>
    <author><name>TC</name></author>
    <published>2026-03-05T12:00:00+00:00</published>
  </entry>
</feed>`;
            const entries = service.parseRssXml(rssNoUpdated, 'UC_test');
            expect(entries).toHaveLength(1);
            expect(entries[0].videoId).toBe('no_updated');
        });
    });

    describe('fetchRssFeed', () => {
        it('should fetch RSS feed for a given channel ID', async () => {
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(SAMPLE_RSS),
            } as Response);

            const entries = await service.fetchRssFeed('UC_test');
            expect(entries).toHaveLength(3);
            expect(global.fetch).toHaveBeenCalledWith(
                'https://www.youtube.com/feeds/videos.xml?channel_id=UC_test',
                expect.objectContaining({ signal: expect.any(AbortSignal) })
            );
        });

        it('should retry on transient 404 and succeed', async () => {
            vi.useFakeTimers();
            vi.mocked(global.fetch)
                .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
                .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(SAMPLE_RSS) } as Response);

            const promise = service.fetchRssFeed('UC_test');
            await vi.advanceTimersByTimeAsync(10000);
            const entries = await promise;

            expect(entries).toHaveLength(3);
            expect(global.fetch).toHaveBeenCalledTimes(2);
            vi.useRealTimers();
        });

        it('should retry on 500 and succeed', async () => {
            vi.useFakeTimers();
            vi.mocked(global.fetch)
                .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
                .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(SAMPLE_RSS) } as Response);

            const promise = service.fetchRssFeed('UC_test');
            await vi.advanceTimersByTimeAsync(10000);
            const entries = await promise;

            expect(entries).toHaveLength(3);
            vi.useRealTimers();
        });

        it('should return empty after all retries exhausted', async () => {
            vi.useFakeTimers();
            vi.mocked(global.fetch)
                .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
                .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
                .mockResolvedValueOnce({ ok: false, status: 404 } as Response);

            const promise = service.fetchRssFeed('UC_test');
            await vi.advanceTimersByTimeAsync(30000);
            const entries = await promise;

            expect(entries).toHaveLength(0);
            expect(global.fetch).toHaveBeenCalledTimes(3);
            vi.useRealTimers();
        });

        it('should not retry on non-transient client errors', async () => {
            vi.mocked(global.fetch).mockResolvedValueOnce({ ok: false, status: 403 } as Response);

            const entries = await service.fetchRssFeed('UC_test');
            expect(entries).toHaveLength(0);
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });

        it('should retry on network error and succeed', async () => {
            vi.useFakeTimers();
            vi.mocked(global.fetch)
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(SAMPLE_RSS) } as Response);

            const promise = service.fetchRssFeed('UC_test');
            await vi.advanceTimersByTimeAsync(10000);
            const entries = await promise;

            expect(entries).toHaveLength(3);
            vi.useRealTimers();
        });
    });

    describe('checkForNewVideos', () => {
        it('should detect new videos by walking entries until lastSeenVideoId is hit', async () => {
            const data = createMockS3Data({
                lastSeenVideoIds: { 'UC_test_channel': 'video_oldest' },
            });
            mockS3GetResponse(data);

            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(SAMPLE_RSS),
            } as Response);

            // Mock saveData S3 call
            vi.mocked(s3Client.send).mockResolvedValueOnce({} as any);

            const results = await service.checkForNewVideos();

            expect(results).toHaveLength(1);
            expect(results[0].videos).toHaveLength(2);
            // Should be oldest-first
            expect(results[0].videos[0].videoId).toBe('video_middle');
            expect(results[0].videos[1].videoId).toBe('video_newest');
        });

        it('should post only the most recent video and seed on first run', async () => {
            const data = createMockS3Data({
                lastSeenVideoIds: {}, // No prior state
            });
            mockS3GetResponse(data);

            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(SAMPLE_RSS),
            } as Response);

            // Mock saveData S3 call
            vi.mocked(s3Client.send).mockResolvedValueOnce({} as any);

            const results = await service.checkForNewVideos();

            expect(results).toHaveLength(1);
            expect(results[0].videos).toHaveLength(1);
            expect(results[0].videos[0].videoId).toBe('video_newest');
            // Should have saved the seeded ID
            expect(s3Client.send).toHaveBeenCalledTimes(2); // getData + saveData
        });

        it('should handle multiple monitored channels independently', async () => {
            const data = createMockS3Data({
                monitoredChannels: [
                    { channelId: 'UC_channel1', discordUserId: '111' },
                    { channelId: 'UC_channel2', discordUserId: '222' },
                ],
                lastSeenVideoIds: {
                    'UC_channel1': 'video_oldest',
                    'UC_channel2': 'video_newest', // Already up to date
                },
            });
            mockS3GetResponse(data);

            // Channel 1: has new videos
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(SAMPLE_RSS),
            } as Response);

            // Channel 2: same newest video (no new)
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(SAMPLE_RSS),
            } as Response);

            // Mock saveData
            vi.mocked(s3Client.send).mockResolvedValueOnce({} as any);

            const results = await service.checkForNewVideos();

            // Only channel 1 should have new videos
            expect(results).toHaveLength(1);
            expect(results[0].channelConfig.channelId).toBe('UC_channel1');
        });

        it('should return videos sorted oldest-first', async () => {
            const data = createMockS3Data({
                lastSeenVideoIds: { 'UC_test_channel': 'video_oldest' },
            });
            mockS3GetResponse(data);

            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(SAMPLE_RSS),
            } as Response);

            vi.mocked(s3Client.send).mockResolvedValueOnce({} as any);

            const results = await service.checkForNewVideos();
            const videos = results[0].videos;

            // video_middle should be before video_newest (oldest first)
            expect(videos[0].videoId).toBe('video_middle');
            expect(videos[1].videoId).toBe('video_newest');
        });

        it('should return empty array when newest entry matches lastSeenVideoId', async () => {
            const data = createMockS3Data({
                lastSeenVideoIds: { 'UC_test_channel': 'video_newest' },
            });
            mockS3GetResponse(data);

            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(SAMPLE_RSS),
            } as Response);

            const results = await service.checkForNewVideos();
            expect(results).toHaveLength(0);
        });

        it('should return empty array when no monitored channels configured', async () => {
            const data = createMockS3Data({
                monitoredChannels: [],
            });
            mockS3GetResponse(data);

            const results = await service.checkForNewVideos();
            expect(results).toHaveLength(0);
        });

        it('should post newest video and re-seed when lastSeenVideoId is not found in feed', async () => {
            const data = createMockS3Data({
                lastSeenVideoIds: { 'UC_test_channel': 'deleted_video_id' },
            });
            mockS3GetResponse(data);

            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(SAMPLE_RSS),
            } as Response);

            // Mock saveData
            vi.mocked(s3Client.send).mockResolvedValueOnce({} as any);

            const results = await service.checkForNewVideos();

            // Should post newest video instead of silently re-seeding
            expect(results).toHaveLength(1);
            expect(results[0].videos).toHaveLength(1);
            expect(results[0].videos[0].videoId).toBe('video_newest');
            // Should still save the re-seeded ID
            expect(s3Client.send).toHaveBeenCalledTimes(2);
        });

        it('should persist seeded IDs to S3 even when no new videos to post', async () => {
            const data = createMockS3Data({
                lastSeenVideoIds: {}, // First run
            });
            mockS3GetResponse(data);

            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(SAMPLE_RSS),
            } as Response);

            // Mock saveData
            vi.mocked(s3Client.send).mockResolvedValueOnce({} as any);

            await service.checkForNewVideos();

            // getData (1 call) + saveData (1 call) = 2 total
            expect(s3Client.send).toHaveBeenCalledTimes(2);
        });
    });

    describe('postNotifications', () => {
        const sampleVideoGroups = [{
            videos: [{
                videoId: 'vid1',
                title: 'Test Video',
                channelName: 'Test Channel',
                channelId: 'UC_test',
                publishedAt: '2026-03-05T12:00:00+00:00',
                thumbnailUrl: 'https://i.ytimg.com/vi/vid1/hqdefault.jpg',
                videoUrl: 'https://www.youtube.com/watch?v=vid1',
            }] as YouTubeVideoEntry[],
            channelConfig: {
                channelId: 'UC_test',
                discordUserId: '118451485221715977',
            } as YouTubeChannelConfig,
        }];

        it('should post video URL to configured channel in each target guild', async () => {
            const result = await service.postNotifications(mockBot as Client, sampleVideoGroups);

            expect(result.notified).toBe(1);
            expect(result.errors).toBe(0);
            expect(mockChannel.send).toHaveBeenCalledTimes(1);
            expect(mockGuild.channels.cache.get).toHaveBeenCalledWith('channel_videos_123');

            const sendCall = mockChannel.send.mock.calls[0][0];
            expect(sendCall.content).toContain('@everyone');
            expect(sendCall.content).toContain('<@118451485221715977>');
            expect(sendCall.content).toContain('https://www.youtube.com/watch?v=vid1');
        });

        it('should skip targets where channel does not exist', async () => {
            mockGuild.channels.cache.get.mockReturnValueOnce(undefined);

            const result = await service.postNotifications(mockBot as Client, sampleVideoGroups);

            expect(result.notified).toBe(0);
            expect(mockChannel.send).not.toHaveBeenCalled();
        });

        it('should skip targets where channel is not text-based', async () => {
            mockGuild.channels.cache.get.mockReturnValueOnce({
                isTextBased: vi.fn().mockReturnValue(false),
            });

            const result = await service.postNotifications(mockBot as Client, sampleVideoGroups);

            expect(result.notified).toBe(0);
            expect(mockChannel.send).not.toHaveBeenCalled();
        });

        it('should skip guilds the bot is not a member of', async () => {
            mockBot.guilds.fetch.mockRejectedValueOnce(new Error('Unknown Guild'));

            const result = await service.postNotifications(mockBot as Client, sampleVideoGroups);

            expect(result.notified).toBe(0);
            expect(mockChannel.send).not.toHaveBeenCalled();
        });

        it('should handle channel.send() failure gracefully', async () => {
            mockChannel.send.mockRejectedValueOnce(new Error('Missing Permissions'));

            const result = await service.postNotifications(mockBot as Client, sampleVideoGroups);

            expect(result.errors).toBe(1);
            expect(result.notified).toBe(0);
        });

        it('should skip when no youtubeNotifications configured', async () => {
            mockGuildConfigService.getConfig.mockResolvedValueOnce({
                allowedGuildIds: ['guild_123'],
                lastUpdated: new Date().toISOString(),
                schemaVersion: 1,
            });

            const result = await service.postNotifications(mockBot as Client, sampleVideoGroups);

            expect(result.notified).toBe(0);
            expect(result.errors).toBe(0);
            expect(mockChannel.send).not.toHaveBeenCalled();
        });

        it('should post to multiple target guilds', async () => {
            const mockChannel2 = {
                name: 'videos',
                isTextBased: vi.fn().mockReturnValue(true),
                send: vi.fn().mockResolvedValue({}),
            };
            const mockGuild2 = {
                id: 'guild_456',
                name: 'Test Guild 2',
                channels: { cache: { get: vi.fn().mockReturnValue(mockChannel2) } },
            };

            mockGuildConfigService.getConfig.mockResolvedValueOnce({
                allowedGuildIds: ['guild_123', 'guild_456'],
                youtubeNotifications: [
                    { guildId: 'guild_123', channelId: 'channel_videos_123' },
                    { guildId: 'guild_456', channelId: 'channel_videos_456' },
                ],
                lastUpdated: new Date().toISOString(),
                schemaVersion: 1,
            });

            mockBot.guilds.fetch
                .mockResolvedValueOnce(mockGuild)
                .mockResolvedValueOnce(mockGuild2);

            const result = await service.postNotifications(mockBot as Client, sampleVideoGroups);

            expect(result.notified).toBe(2);
            expect(mockChannel.send).toHaveBeenCalledTimes(1);
            expect(mockChannel2.send).toHaveBeenCalledTimes(1);
        });

        it('should post multiple videos for a channel in order', async () => {
            const videoGroups = [{
                videos: [
                    {
                        videoId: 'vid1', title: 'First', channelName: 'TC', channelId: 'UC_test',
                        publishedAt: '2026-03-04T12:00:00Z',
                        thumbnailUrl: 'https://i.ytimg.com/vi/vid1/hqdefault.jpg',
                        videoUrl: 'https://www.youtube.com/watch?v=vid1',
                    },
                    {
                        videoId: 'vid2', title: 'Second', channelName: 'TC', channelId: 'UC_test',
                        publishedAt: '2026-03-05T12:00:00Z',
                        thumbnailUrl: 'https://i.ytimg.com/vi/vid2/hqdefault.jpg',
                        videoUrl: 'https://www.youtube.com/watch?v=vid2',
                    },
                ] as YouTubeVideoEntry[],
                channelConfig: { channelId: 'UC_test', discordUserId: '123' } as YouTubeChannelConfig,
            }];

            const result = await service.postNotifications(mockBot as Client, videoGroups);

            expect(result.notified).toBe(2);
            expect(mockChannel.send).toHaveBeenCalledTimes(2);
        });
    });

    describe('pollAndNotify', () => {
        it('should do nothing when no new videos found', async () => {
            const data = createMockS3Data({
                lastSeenVideoIds: { 'UC_test_channel': 'video_newest' },
            });
            mockS3GetResponse(data);

            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(SAMPLE_RSS),
            } as Response);

            const result = await service.pollAndNotify(mockBot as Client);

            expect(result.notified).toBe(0);
            expect(result.errors).toBe(0);
            expect(mockChannel.send).not.toHaveBeenCalled();
        });

        it('should fetch, detect, and post new videos end-to-end', async () => {
            const data = createMockS3Data({
                lastSeenVideoIds: { 'UC_test_channel': 'video_middle' },
            });
            mockS3GetResponse(data);

            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(SAMPLE_RSS),
            } as Response);

            // Mock saveData
            vi.mocked(s3Client.send).mockResolvedValueOnce({} as any);

            const result = await service.pollAndNotify(mockBot as Client);

            expect(result.notified).toBe(1); // 1 new video (video_newest)
            expect(mockChannel.send).toHaveBeenCalledTimes(1);
        });

        it('should return correct notified/error counts', async () => {
            const data = createMockS3Data({
                lastSeenVideoIds: { 'UC_test_channel': 'video_oldest' },
            });
            mockS3GetResponse(data);

            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(SAMPLE_RSS),
            } as Response);

            // Mock saveData
            vi.mocked(s3Client.send).mockResolvedValueOnce({} as any);

            // First send succeeds, second fails
            mockChannel.send
                .mockResolvedValueOnce({})
                .mockRejectedValueOnce(new Error('fail'));

            const result = await service.pollAndNotify(mockBot as Client);

            expect(result.notified).toBe(1);
            expect(result.errors).toBe(1);
        });
    });

    describe('S3 Data Management', () => {
        it('should cache S3 data with TTL', async () => {
            const data = createMockS3Data();
            mockS3GetResponse(data);

            // First call - fetches from S3
            await service.getData();
            // Second call - should use cache
            await service.getData();

            // Only 1 S3 call
            expect(s3Client.send).toHaveBeenCalledTimes(1);
        });

        it('should create default data if S3 key does not exist', async () => {
            const noSuchKeyError = new Error('NoSuchKey');
            (noSuchKeyError as any).name = 'NoSuchKey';
            vi.mocked(s3Client.send)
                .mockRejectedValueOnce(noSuchKeyError)
                .mockResolvedValueOnce({} as any); // saveData call

            const data = await service.getData();

            expect(data.monitoredChannels).toHaveLength(0);
            expect(data.lastSeenVideoIds).toEqual({});
            expect(data.schemaVersion).toBe(1);
        });
    });
});
