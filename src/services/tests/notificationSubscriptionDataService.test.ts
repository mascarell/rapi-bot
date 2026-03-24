import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NotificationSubscriptionDataService, getNotificationSubscriptionDataService } from '../notificationSubscriptionDataService';
import { NotificationSubscriptionData } from '../../utils/interfaces/NotificationSubscription.interface';

// Mock S3
vi.mock('../../utils/cdn/config', () => ({
    s3Client: { send: vi.fn() },
    S3_BUCKET: 'test-bucket',
}));

import { s3Client } from '../../utils/cdn/config';

function mockS3Get(data: NotificationSubscriptionData) {
    vi.mocked(s3Client.send).mockResolvedValueOnce({
        Body: {
            transformToString: () => Promise.resolve(JSON.stringify(data)),
        },
    } as any);
}

function mockS3Put() {
    vi.mocked(s3Client.send).mockResolvedValueOnce({} as any);
}

function createMockData(overrides: Partial<NotificationSubscriptionData> = {}): NotificationSubscriptionData {
    return {
        subscriptions: {},
        lastUpdated: new Date().toISOString(),
        schemaVersion: 1,
        ...overrides,
    };
}

describe('NotificationSubscriptionDataService', () => {
    let service: NotificationSubscriptionDataService;

    beforeEach(() => {
        // Reset singleton
        (NotificationSubscriptionDataService as any).instance = null;
        service = getNotificationSubscriptionDataService();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('getData', () => {
        it('should fetch from S3 and cache', async () => {
            const mockData = createMockData();
            mockS3Get(mockData);

            const data = await service.getData();
            expect(data.schemaVersion).toBe(1);
            expect(s3Client.send).toHaveBeenCalledTimes(1);

            // Second call should use cache
            const data2 = await service.getData();
            expect(data2).toBe(data);
            expect(s3Client.send).toHaveBeenCalledTimes(1);
        });

        it('should create default data when S3 key not found', async () => {
            vi.mocked(s3Client.send)
                .mockRejectedValueOnce({ name: 'NoSuchKey' })
                .mockResolvedValueOnce({} as any); // For saveData

            const data = await service.getData();
            expect(data.subscriptions).toEqual({});
            expect(data.schemaVersion).toBe(1);
        });
    });

    describe('addSubscription', () => {
        it('should add a new subscription', async () => {
            const mockData = createMockData();
            mockS3Get(mockData);
            mockS3Put();

            const result = await service.addSubscription('user1', 'guild1', 'pvp-warning:bd2');
            expect(result).toBe(true);
        });

        it('should return false if already subscribed', async () => {
            const mockData = createMockData({
                subscriptions: {
                    'pvp-warning:bd2': [{
                        discordId: 'user1',
                        guildId: 'guild1',
                        notificationType: 'pvp-warning:bd2',
                        subscribedAt: new Date().toISOString(),
                    }],
                },
            });
            mockS3Get(mockData);

            const result = await service.addSubscription('user1', 'guild1', 'pvp-warning:bd2');
            expect(result).toBe(false);
        });

        it('should create type array if it does not exist', async () => {
            const mockData = createMockData();
            mockS3Get(mockData);
            mockS3Put();

            await service.addSubscription('user1', 'guild1', 'new-type');

            // Verify the data was saved with the new type
            const saveCall = vi.mocked(s3Client.send).mock.calls[1];
            const savedBody = JSON.parse((saveCall[0] as any).input.Body);
            expect(savedBody.subscriptions['new-type']).toHaveLength(1);
            expect(savedBody.subscriptions['new-type'][0].discordId).toBe('user1');
        });
    });

    describe('removeSubscription', () => {
        it('should remove an existing subscription', async () => {
            const mockData = createMockData({
                subscriptions: {
                    'pvp-warning:bd2': [{
                        discordId: 'user1',
                        guildId: 'guild1',
                        notificationType: 'pvp-warning:bd2',
                        subscribedAt: new Date().toISOString(),
                    }],
                },
            });
            mockS3Get(mockData);
            mockS3Put();

            const result = await service.removeSubscription('user1', 'pvp-warning:bd2');
            expect(result).toBe(true);
        });

        it('should return false if not subscribed', async () => {
            const mockData = createMockData();
            mockS3Get(mockData);

            const result = await service.removeSubscription('user1', 'pvp-warning:bd2');
            expect(result).toBe(false);
        });

        it('should return false if type has no subscribers', async () => {
            const mockData = createMockData({
                subscriptions: { 'pvp-warning:bd2': [] },
            });
            mockS3Get(mockData);

            const result = await service.removeSubscription('user1', 'pvp-warning:bd2');
            expect(result).toBe(false);
        });
    });

    describe('isSubscribed', () => {
        it('should return true when subscribed', async () => {
            const mockData = createMockData({
                subscriptions: {
                    'pvp-warning:bd2': [{
                        discordId: 'user1',
                        guildId: 'guild1',
                        notificationType: 'pvp-warning:bd2',
                        subscribedAt: new Date().toISOString(),
                    }],
                },
            });
            mockS3Get(mockData);

            expect(await service.isSubscribed('user1', 'pvp-warning:bd2')).toBe(true);
        });

        it('should return false when not subscribed', async () => {
            const mockData = createMockData();
            mockS3Get(mockData);

            expect(await service.isSubscribed('user1', 'pvp-warning:bd2')).toBe(false);
        });
    });

    describe('markDMDisabled', () => {
        it('should mark DM as disabled', async () => {
            const mockData = createMockData({
                subscriptions: {
                    'pvp-warning:bd2': [{
                        discordId: 'user1',
                        guildId: 'guild1',
                        notificationType: 'pvp-warning:bd2',
                        subscribedAt: new Date().toISOString(),
                    }],
                },
            });
            mockS3Get(mockData);
            mockS3Put();

            await service.markDMDisabled('user1', 'pvp-warning:bd2');

            const saveCall = vi.mocked(s3Client.send).mock.calls[1];
            const savedBody = JSON.parse((saveCall[0] as any).input.Body);
            expect(savedBody.subscriptions['pvp-warning:bd2'][0].dmDisabled).toBe(true);
            expect(savedBody.subscriptions['pvp-warning:bd2'][0].dmDisabledAt).toBeDefined();
        });

        it('should no-op if user not found', async () => {
            const mockData = createMockData();
            mockS3Get(mockData);

            // Should not throw
            await service.markDMDisabled('unknown', 'pvp-warning:bd2');
            // Only 1 S3 call (getData), no saveData
            expect(s3Client.send).toHaveBeenCalledTimes(1);
        });
    });

    describe('clearDMDisabled', () => {
        it('should clear DM disabled status', async () => {
            const mockData = createMockData({
                subscriptions: {
                    'pvp-warning:bd2': [{
                        discordId: 'user1',
                        guildId: 'guild1',
                        notificationType: 'pvp-warning:bd2',
                        subscribedAt: new Date().toISOString(),
                        dmDisabled: true,
                        dmDisabledAt: new Date().toISOString(),
                    }],
                },
            });
            mockS3Get(mockData);
            mockS3Put();

            await service.clearDMDisabled('user1', 'pvp-warning:bd2');

            const saveCall = vi.mocked(s3Client.send).mock.calls[1];
            const savedBody = JSON.parse((saveCall[0] as any).input.Body);
            expect(savedBody.subscriptions['pvp-warning:bd2'][0].dmDisabled).toBeUndefined();
        });
    });

    describe('getSubscriptionsForUser', () => {
        it('should return all subscriptions for a user across types', async () => {
            const mockData = createMockData({
                subscriptions: {
                    'pvp-warning:bd2': [{
                        discordId: 'user1',
                        guildId: 'guild1',
                        notificationType: 'pvp-warning:bd2',
                        subscribedAt: new Date().toISOString(),
                    }],
                    'daily-reset:nikke': [{
                        discordId: 'user1',
                        guildId: 'guild1',
                        notificationType: 'daily-reset:nikke',
                        subscribedAt: new Date().toISOString(),
                    }],
                    'other-type': [{
                        discordId: 'user2',
                        guildId: 'guild1',
                        notificationType: 'other-type',
                        subscribedAt: new Date().toISOString(),
                    }],
                },
            });
            mockS3Get(mockData);

            const subs = await service.getSubscriptionsForUser('user1');
            expect(subs).toHaveLength(2);
            expect(subs.map(s => s.notificationType)).toContain('pvp-warning:bd2');
            expect(subs.map(s => s.notificationType)).toContain('daily-reset:nikke');
        });

        it('should return empty array for user with no subscriptions', async () => {
            const mockData = createMockData();
            mockS3Get(mockData);

            const subs = await service.getSubscriptionsForUser('nobody');
            expect(subs).toEqual([]);
        });
    });

    describe('getSubscribers', () => {
        it('should return subscribers for a type', async () => {
            const mockData = createMockData({
                subscriptions: {
                    'pvp-warning:bd2': [
                        { discordId: 'user1', guildId: 'g1', notificationType: 'pvp-warning:bd2', subscribedAt: '' },
                        { discordId: 'user2', guildId: 'g1', notificationType: 'pvp-warning:bd2', subscribedAt: '' },
                    ],
                },
            });
            mockS3Get(mockData);

            const subs = await service.getSubscribers('pvp-warning:bd2');
            expect(subs).toHaveLength(2);
        });

        it('should return empty array for unknown type', async () => {
            const mockData = createMockData();
            mockS3Get(mockData);

            const subs = await service.getSubscribers('unknown');
            expect(subs).toEqual([]);
        });
    });

    describe('invalidateCache', () => {
        it('should force re-fetch from S3', async () => {
            const mockData = createMockData();
            mockS3Get(mockData);

            await service.getData();
            expect(s3Client.send).toHaveBeenCalledTimes(1);

            service.invalidateCache();
            mockS3Get(mockData);

            await service.getData();
            expect(s3Client.send).toHaveBeenCalledTimes(2);
        });
    });
});
