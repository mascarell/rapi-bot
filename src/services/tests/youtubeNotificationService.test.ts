import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Client, Guild, TextChannel, ChannelType, Collection } from 'discord.js';

// Set environment variable before any imports
vi.stubEnv('CDN_DOMAIN_URL', 'https://cdn.example.com');
vi.stubEnv('YOUTUBE_API_KEY', 'test-api-key');

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

// Sample YouTube Data API responses
const SAMPLE_API_RESPONSE = {
    items: [
        {
            snippet: {
                resourceId: { videoId: 'video_newest' },
                title: 'Newest Video Title',
                videoOwnerChannelTitle: 'Test Channel',
                publishedAt: '2026-03-05T12:00:00Z',
                liveBroadcastContent: 'none',
            },
        },
        {
            snippet: {
                resourceId: { videoId: 'video_middle' },
                title: 'Middle Video Title',
                videoOwnerChannelTitle: 'Test Channel',
                publishedAt: '2026-03-04T12:00:00Z',
                liveBroadcastContent: 'none',
            },
        },
        {
            snippet: {
                resourceId: { videoId: 'video_oldest' },
                title: 'Oldest Video Title',
                videoOwnerChannelTitle: 'Test Channel',
                publishedAt: '2026-03-03T12:00:00Z',
                liveBroadcastContent: 'none',
            },
        },
    ],
};

const SAMPLE_API_WITH_LIVE = {
    items: [
        {
            snippet: {
                resourceId: { videoId: 'live_stream_1' },
                title: 'LIVE - Playing games',
                videoOwnerChannelTitle: 'Test Channel',
                publishedAt: '2026-03-05T20:00:00Z',
                liveBroadcastContent: 'live',
            },
        },
        {
            snippet: {
                resourceId: { videoId: 'upcoming_1' },
                title: 'Upcoming Premiere',
                videoOwnerChannelTitle: 'Test Channel',
                publishedAt: '2026-03-06T20:00:00Z',
                liveBroadcastContent: 'upcoming',
            },
        },
        {
            snippet: {
                resourceId: { videoId: 'upload_1' },
                title: 'Regular Upload Video',
                videoOwnerChannelTitle: 'Test Channel',
                publishedAt: '2026-03-05T14:00:00Z',
                liveBroadcastContent: 'none',
            },
        },
    ],
};

const EMPTY_API_RESPONSE = { items: [] };

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

function mockApiResponse(response: any) {
    vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(response),
    } as Response);
}

function createEmptyMessageCollection() {
    const col = new Collection<string, any>();
    // Give it a map() that returns string[] like the service expects
    return col;
}

describe('YouTubeNotificationService', () => {
    let service: ReturnType<typeof getYouTubeNotificationService>;
    let mockGuildConfigService: any;
    let mockChannel: any;
    let mockGuild: any;
    let mockBot: any;

    beforeEach(() => {
        vi.stubEnv('YOUTUBE_API_KEY', 'test-api-key');
        _testResetYouTubeService();
        service = getYouTubeNotificationService();
        service.clearCache();

        mockChannel = {
            name: 'videos',
            type: ChannelType.GuildText,
            isTextBased: vi.fn().mockReturnValue(true),
            send: vi.fn().mockResolvedValue({}),
            messages: {
                fetch: vi.fn().mockResolvedValue(createEmptyMessageCollection()),
            },
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

    describe('fetchPlaylistItems', () => {
        it('should call YouTube Data API with correct playlist ID (UC -> UU)', async () => {
            mockApiResponse(SAMPLE_API_RESPONSE);

            const entries = await service.fetchPlaylistItems('UC_test');
            expect(entries).toHaveLength(3);
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('playlistId=UU_test'),
                expect.objectContaining({ signal: expect.any(AbortSignal) })
            );
        });

        it('should include API key in request', async () => {
            mockApiResponse(SAMPLE_API_RESPONSE);

            await service.fetchPlaylistItems('UC_test');
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('key=test-api-key'),
                expect.any(Object)
            );
        });

        it('should map API response to YouTubeVideoEntry array', async () => {
            mockApiResponse(SAMPLE_API_RESPONSE);

            const entries = await service.fetchPlaylistItems('UC_test');

            expect(entries[0].videoId).toBe('video_newest');
            expect(entries[0].title).toBe('Newest Video Title');
            expect(entries[0].channelName).toBe('Test Channel');
            expect(entries[0].publishedAt).toBe('2026-03-05T12:00:00Z');
            expect(entries[0].thumbnailUrl).toBe('https://i.ytimg.com/vi/video_newest/hqdefault.jpg');
            expect(entries[0].videoUrl).toBe('https://www.youtube.com/watch?v=video_newest');
            expect(entries[0].channelId).toBe('UC_test');
        });

        it('should filter out live streams and upcoming premieres', async () => {
            mockApiResponse(SAMPLE_API_WITH_LIVE);

            const entries = await service.fetchPlaylistItems('UC_test');
            expect(entries).toHaveLength(1);
            expect(entries[0].videoId).toBe('upload_1');
        });

        it('should return empty array for empty response', async () => {
            mockApiResponse(EMPTY_API_RESPONSE);

            const entries = await service.fetchPlaylistItems('UC_test');
            expect(entries).toHaveLength(0);
        });

        it('should retry on transient 500 and succeed', async () => {
            vi.useFakeTimers();
            vi.mocked(global.fetch)
                .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(SAMPLE_API_RESPONSE) } as Response);

            const promise = service.fetchPlaylistItems('UC_test');
            await vi.advanceTimersByTimeAsync(10000);
            const entries = await promise;

            expect(entries).toHaveLength(3);
            expect(global.fetch).toHaveBeenCalledTimes(2);
            vi.useRealTimers();
        });

        it('should not retry on 403 (quota exceeded)', async () => {
            vi.mocked(global.fetch).mockResolvedValueOnce({ ok: false, status: 403 } as Response);

            const entries = await service.fetchPlaylistItems('UC_test');
            expect(entries).toHaveLength(0);
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });

        it('should retry on network error and succeed', async () => {
            vi.useFakeTimers();
            vi.mocked(global.fetch)
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(SAMPLE_API_RESPONSE) } as Response);

            const promise = service.fetchPlaylistItems('UC_test');
            await vi.advanceTimersByTimeAsync(10000);
            const entries = await promise;

            expect(entries).toHaveLength(3);
            vi.useRealTimers();
        });

        it('should return empty after all retries exhausted', async () => {
            vi.useFakeTimers();
            vi.mocked(global.fetch)
                .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
                .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
                .mockResolvedValueOnce({ ok: false, status: 500 } as Response);

            const promise = service.fetchPlaylistItems('UC_test');
            await vi.advanceTimersByTimeAsync(30000);
            const entries = await promise;

            expect(entries).toHaveLength(0);
            expect(global.fetch).toHaveBeenCalledTimes(3);
            vi.useRealTimers();
        });

        it('should return empty when YOUTUBE_API_KEY is not set', async () => {
            vi.stubEnv('YOUTUBE_API_KEY', '');

            const entries = await service.fetchPlaylistItems('UC_test');
            expect(entries).toHaveLength(0);
            expect(global.fetch).not.toHaveBeenCalled();
        });
    });

    describe('checkForNewVideos', () => {
        it('should detect new videos by walking entries until lastSeenVideoId is hit', async () => {
            const data = createMockS3Data({
                lastSeenVideoIds: { 'UC_test_channel': 'video_oldest' },
            });
            mockS3GetResponse(data);
            mockApiResponse(SAMPLE_API_RESPONSE);

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
            mockApiResponse(SAMPLE_API_RESPONSE);

            // Mock saveData S3 call
            vi.mocked(s3Client.send).mockResolvedValueOnce({} as any);

            const results = await service.checkForNewVideos();

            expect(results).toHaveLength(1);
            expect(results[0].videos).toHaveLength(1);
            expect(results[0].videos[0].videoId).toBe('video_newest');
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
            mockApiResponse(SAMPLE_API_RESPONSE);
            // Channel 2: same newest video (no new)
            mockApiResponse(SAMPLE_API_RESPONSE);

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
            mockApiResponse(SAMPLE_API_RESPONSE);
            vi.mocked(s3Client.send).mockResolvedValueOnce({} as any);

            const results = await service.checkForNewVideos();
            const videos = results[0].videos;

            expect(videos[0].videoId).toBe('video_middle');
            expect(videos[1].videoId).toBe('video_newest');
        });

        it('should return empty array when newest entry matches lastSeenVideoId', async () => {
            const data = createMockS3Data({
                lastSeenVideoIds: { 'UC_test_channel': 'video_newest' },
            });
            mockS3GetResponse(data);
            mockApiResponse(SAMPLE_API_RESPONSE);

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

        it('should post newest video and re-seed when lastSeenVideoId is not found', async () => {
            const data = createMockS3Data({
                lastSeenVideoIds: { 'UC_test_channel': 'deleted_video_id' },
            });
            mockS3GetResponse(data);
            mockApiResponse(SAMPLE_API_RESPONSE);
            vi.mocked(s3Client.send).mockResolvedValueOnce({} as any);

            const results = await service.checkForNewVideos();

            expect(results).toHaveLength(1);
            expect(results[0].videos).toHaveLength(1);
            expect(results[0].videos[0].videoId).toBe('video_newest');
            expect(s3Client.send).toHaveBeenCalledTimes(2);
        });

        it('should persist seeded IDs to S3 even when posting first-run video', async () => {
            const data = createMockS3Data({
                lastSeenVideoIds: {}, // First run
            });
            mockS3GetResponse(data);
            mockApiResponse(SAMPLE_API_RESPONSE);
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

        it('should skip video if already posted in channel', async () => {
            const existingMessages = new Collection<string, any>();
            existingMessages.set('msg1', {
                content: 'Check out https://www.youtube.com/watch?v=vid1',
            });
            mockChannel.messages.fetch.mockResolvedValueOnce(existingMessages);

            const result = await service.postNotifications(mockBot as Client, sampleVideoGroups);

            expect(result.notified).toBe(0);
            expect(mockChannel.send).not.toHaveBeenCalled();
        });

        it('should skip video if video ID found in channel messages', async () => {
            const existingMessages = new Collection<string, any>();
            existingMessages.set('msg1', {
                content: 'Great video vid1 by the creator',
            });
            mockChannel.messages.fetch.mockResolvedValueOnce(existingMessages);

            const result = await service.postNotifications(mockBot as Client, sampleVideoGroups);

            expect(result.notified).toBe(0);
            expect(mockChannel.send).not.toHaveBeenCalled();
        });

        it('should still post if dedup message fetch fails', async () => {
            mockChannel.messages.fetch.mockRejectedValueOnce(new Error('Missing Access'));

            const result = await service.postNotifications(mockBot as Client, sampleVideoGroups);

            expect(result.notified).toBe(1);
            expect(mockChannel.send).toHaveBeenCalledTimes(1);
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
                messages: { fetch: vi.fn().mockResolvedValue(createEmptyMessageCollection()) },
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
            mockApiResponse(SAMPLE_API_RESPONSE);

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
            mockApiResponse(SAMPLE_API_RESPONSE);

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
            mockApiResponse(SAMPLE_API_RESPONSE);

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

        it('should return early when YOUTUBE_API_KEY is not set', async () => {
            vi.stubEnv('YOUTUBE_API_KEY', '');

            const result = await service.pollAndNotify(mockBot as Client);

            expect(result.notified).toBe(0);
            expect(result.errors).toBe(0);
            expect(global.fetch).not.toHaveBeenCalled();
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
