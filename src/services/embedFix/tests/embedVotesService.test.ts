import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock S3 client
vi.mock('../../../utils/cdn/config', () => ({
    s3Client: {
        send: vi.fn(),
    },
    S3_BUCKET: 'test-bucket',
}));

// Mock config
vi.mock('../../../utils/data/embedFixConfig', () => ({
    EMBED_FIX_CONFIG: {
        S3_VOTES_KEY: 'data/embed-fix/test-votes.json',
        VOTES_CACHE_TTL: 1000,
    },
}));

import { s3Client } from '../../../utils/cdn/config';
import { EmbedVotesService, getEmbedVotesService } from '../embedVotesService';
import { EmbedVotesData } from '../../../utils/interfaces/EmbedFix.interface';

describe('EmbedVotesService', () => {
    let service: EmbedVotesService;
    let mockData: EmbedVotesData;

    beforeEach(() => {
        // Reset singleton
        (EmbedVotesService as any).instance = null;
        service = getEmbedVotesService();
        service.invalidateCache();

        vi.mocked(s3Client.send).mockReset();

        // Create mock data
        const now = new Date().toISOString();
        mockData = {
            votes: {
                'twitter:123456': {
                    artworkId: 'twitter:123456',
                    originalUrl: 'https://twitter.com/artist/status/123456',
                    platform: 'twitter',
                    artistUsername: 'artist',
                    artistName: 'Test Artist',
                    guildVotes: {
                        'guild1': {
                            voters: ['user1', 'user2'],
                            voteCount: 2,
                            sharedBy: 'user1',
                            sharedAt: now,
                            messageId: 'msg1',
                            channelId: 'chan1',
                        },
                    },
                    globalVoteCount: 2,
                    firstSharedAt: now,
                    lastVotedAt: now,
                },
            },
            timeAggregations: {
                weekly: { byGuild: { 'guild1': 2 }, global: 2, topArtwork: [], topArtists: { 'artist': 2 } },
                monthly: { byGuild: { 'guild1': 2 }, global: 2, topArtwork: [], topArtists: { 'artist': 2 } },
                yearly: { byGuild: { 'guild1': 2 }, global: 2, topArtwork: [], topArtists: { 'artist': 2 } },
                lastReset: { weekly: now, monthly: now, yearly: now },
            },
            schemaVersion: 1,
            lastUpdated: now,
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('getData', () => {
        it('should fetch data from S3', async () => {
            vi.mocked(s3Client.send).mockResolvedValueOnce({
                Body: {
                    transformToString: () => Promise.resolve(JSON.stringify(mockData)),
                },
            } as any);

            const data = await service.getData();
            expect(data).toEqual(mockData);
            expect(s3Client.send).toHaveBeenCalledTimes(1);
        });

        it('should return cached data on subsequent calls', async () => {
            vi.mocked(s3Client.send).mockResolvedValueOnce({
                Body: {
                    transformToString: () => Promise.resolve(JSON.stringify(mockData)),
                },
            } as any);

            await service.getData();
            await service.getData();

            expect(s3Client.send).toHaveBeenCalledTimes(1);
        });

        it('should create default data if file not found', async () => {
            vi.mocked(s3Client.send)
                .mockRejectedValueOnce({ name: 'NoSuchKey' })
                .mockResolvedValueOnce({} as any); // For saveData

            const data = await service.getData();
            expect(data.votes).toEqual({});
            expect(data.schemaVersion).toBe(1);
        });
    });

    describe('toggleVote', () => {
        beforeEach(() => {
            vi.mocked(s3Client.send)
                .mockResolvedValueOnce({
                    Body: {
                        transformToString: () => Promise.resolve(JSON.stringify(mockData)),
                    },
                } as any)
                .mockResolvedValue({} as any); // For saveData
        });

        it('should add vote when user has not voted', async () => {
            const result = await service.toggleVote('twitter:123456', 'guild1', 'user3');

            expect(result.added).toBe(true);
            expect(result.newCount).toBe(3);
        });

        it('should remove vote when user has already voted', async () => {
            const result = await service.toggleVote('twitter:123456', 'guild1', 'user1');

            expect(result.added).toBe(false);
            expect(result.newCount).toBe(1);
        });

        it('should return 0 count for non-existent artwork', async () => {
            const result = await service.toggleVote('twitter:nonexistent', 'guild1', 'user1');

            expect(result.added).toBe(false);
            expect(result.newCount).toBe(0);
        });
    });

    describe('getVoteCount', () => {
        beforeEach(() => {
            vi.mocked(s3Client.send).mockResolvedValue({
                Body: {
                    transformToString: () => Promise.resolve(JSON.stringify(mockData)),
                },
            } as any);
        });

        it('should return guild vote count when guildId provided', async () => {
            const count = await service.getVoteCount('twitter:123456', 'guild1');
            expect(count).toBe(2);
        });

        it('should return global vote count when no guildId', async () => {
            const count = await service.getVoteCount('twitter:123456');
            expect(count).toBe(2);
        });

        it('should return 0 for non-existent artwork', async () => {
            const count = await service.getVoteCount('twitter:nonexistent');
            expect(count).toBe(0);
        });
    });

    describe('hasUserVoted', () => {
        beforeEach(() => {
            vi.mocked(s3Client.send).mockResolvedValue({
                Body: {
                    transformToString: () => Promise.resolve(JSON.stringify(mockData)),
                },
            } as any);
        });

        it('should return true when user has voted', async () => {
            const hasVoted = await service.hasUserVoted('twitter:123456', 'guild1', 'user1');
            expect(hasVoted).toBe(true);
        });

        it('should return false when user has not voted', async () => {
            const hasVoted = await service.hasUserVoted('twitter:123456', 'guild1', 'user3');
            expect(hasVoted).toBe(false);
        });

        it('should return false for non-existent artwork', async () => {
            const hasVoted = await service.hasUserVoted('twitter:nonexistent', 'guild1', 'user1');
            expect(hasVoted).toBe(false);
        });
    });

    describe('recordArtwork', () => {
        beforeEach(() => {
            vi.mocked(s3Client.send)
                .mockResolvedValueOnce({
                    Body: {
                        transformToString: () => Promise.resolve(JSON.stringify(mockData)),
                    },
                } as any)
                .mockResolvedValue({} as any);
        });

        it('should create new artwork entry', async () => {
            await service.recordArtwork('twitter:999999', {
                originalUrl: 'https://twitter.com/new/status/999999',
                platform: 'twitter',
                artistUsername: 'newartist',
                artistName: 'New Artist',
                guildId: 'guild2',
                channelId: 'chan2',
                messageId: 'msg2',
                sharedBy: 'user5',
            });

            // Verify saveData was called
            expect(s3Client.send).toHaveBeenCalledTimes(2);
        });

        it('should add guild entry to existing artwork', async () => {
            await service.recordArtwork('twitter:123456', {
                originalUrl: 'https://twitter.com/artist/status/123456',
                platform: 'twitter',
                artistUsername: 'artist',
                artistName: 'Test Artist',
                guildId: 'guild2',
                channelId: 'chan2',
                messageId: 'msg2',
                sharedBy: 'user5',
            });

            expect(s3Client.send).toHaveBeenCalledTimes(2);
        });
    });

    describe('getStats', () => {
        beforeEach(() => {
            vi.mocked(s3Client.send).mockResolvedValue({
                Body: {
                    transformToString: () => Promise.resolve(JSON.stringify(mockData)),
                },
            } as any);
        });

        it('should return alltime stats', async () => {
            const stats = await service.getStats('guild1', 'alltime');

            expect(stats.guildVotes).toBe(2);
            expect(stats.globalVotes).toBe(2);
            expect(stats.topArtists.length).toBeGreaterThan(0);
        });

        it('should return weekly stats', async () => {
            const stats = await service.getStats('guild1', 'weekly');

            expect(stats.guildVotes).toBe(2);
            expect(stats.globalVotes).toBe(2);
        });

        it('should return 0 for guild without votes', async () => {
            const stats = await service.getStats('guild999', 'weekly');

            expect(stats.guildVotes).toBe(0);
        });
    });

    describe('resetPeriod', () => {
        beforeEach(() => {
            vi.mocked(s3Client.send)
                .mockResolvedValueOnce({
                    Body: {
                        transformToString: () => Promise.resolve(JSON.stringify(mockData)),
                    },
                } as any)
                .mockResolvedValue({} as any);
        });

        it('should reset weekly aggregations', async () => {
            await service.resetPeriod('weekly');

            // Verify saveData was called
            expect(s3Client.send).toHaveBeenCalledTimes(2);
        });
    });

    describe('generateArtworkId', () => {
        it('should generate ID for Twitter URL', () => {
            const id = EmbedVotesService.generateArtworkId('twitter', 'https://twitter.com/user/status/123456789');
            expect(id).toBe('twitter:123456789');
        });

        it('should handle URL without status ID', () => {
            const id = EmbedVotesService.generateArtworkId('twitter', 'https://twitter.com/user');
            expect(id).toBe('twitter:https://twitter.com/user');
        });
    });

    describe('singleton', () => {
        it('should return same instance', () => {
            const instance1 = getEmbedVotesService();
            const instance2 = getEmbedVotesService();
            expect(instance1).toBe(instance2);
        });
    });
});
