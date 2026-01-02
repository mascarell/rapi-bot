import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Client, User } from 'discord.js';

// Set environment variable before any imports
vi.stubEnv('CDN_DOMAIN_URL', 'https://cdn.example.com');

// Mock EmbedBuilder to avoid validation issues in tests
vi.mock('discord.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('discord.js')>();
    return {
        ...actual,
        EmbedBuilder: vi.fn().mockImplementation(() => ({
            setColor: vi.fn().mockReturnThis(),
            setTitle: vi.fn().mockReturnThis(),
            setThumbnail: vi.fn().mockReturnThis(),
            setDescription: vi.fn().mockReturnThis(),
            addFields: vi.fn().mockReturnThis(),
            setTimestamp: vi.fn().mockReturnThis(),
            setFooter: vi.fn().mockReturnThis(),
            toJSON: vi.fn().mockReturnValue({}),
        })),
    };
});

// Mock the dependencies before importing the service
vi.mock('../gachaDataService', () => ({
    getGachaDataService: vi.fn(),
}));

vi.mock('../../utils/data/gachaGamesConfig', () => ({
    getGameConfig: vi.fn(),
    getAutoRedeemGames: vi.fn(),
    GACHA_GAMES: {
        'bd2': {
            id: 'bd2',
            name: 'Brown Dust 2',
            shortName: 'BD2',
            apiEndpoint: 'https://test-api.example.com/coupon',
            apiConfig: { appId: 'bd2-live', method: 'POST' },
            supportsAutoRedeem: true,
            logoPath: 'https://cdn.example.com/bd2.png',
            embedColor: 0x8B4513,
            maxNicknameLength: 24,
            maxCodeLength: 20,
            userIdFieldName: 'Nickname',
        },
        'nikke': {
            id: 'nikke',
            name: 'NIKKE',
            shortName: 'NIKKE',
            manualRedeemUrl: 'https://nikke.example.com/redeem',
            supportsAutoRedeem: false,
            logoPath: 'https://cdn.example.com/nikke.png',
            embedColor: 0xFF69B4,
            maxNicknameLength: 20,
            maxCodeLength: 20,
            userIdFieldName: 'Player ID',
        },
    },
}));

import { GachaRedemptionService, getGachaRedemptionService, _testResetCircuitBreaker } from '../gachaRedemptionService';
import { getGachaDataService } from '../gachaDataService';
import { getGameConfig, getAutoRedeemGames } from '../../utils/data/gachaGamesConfig';
import { GachaCoupon, GameSubscription, GachaGameId } from '../../utils/interfaces/GachaCoupon.interface';

describe('GachaRedemptionService', () => {
    let mockDataService: any;
    let mockBot: Partial<Client>;
    let mockUser: Partial<User>;

    beforeEach(() => {
        // Reset singleton for each test
        (GachaRedemptionService as any).instance = undefined;

        // Reset circuit breaker state between tests
        _testResetCircuitBreaker();

        // Setup mock user
        mockUser = {
            send: vi.fn().mockResolvedValue({}),
        };

        // Setup mock bot
        mockBot = {
            users: {
                fetch: vi.fn().mockResolvedValue(mockUser),
            } as any,
        };

        // Setup mock data service
        mockDataService = {
            getActiveCoupons: vi.fn().mockResolvedValue([]),
            getGameSubscribers: vi.fn().mockResolvedValue([]),
            // New optimized batch method that includes preferences and DM status
            getSubscribersForNotification: vi.fn().mockResolvedValue([]),
            markCodesRedeemed: vi.fn().mockResolvedValue(true),
            batchMarkCodesRedeemed: vi.fn().mockResolvedValue({ success: 0, failed: 0 }),
            addBatchRedemptionHistory: vi.fn().mockResolvedValue(undefined),
            getExpiringCoupons: vi.fn().mockResolvedValue([]),
            getUnredeemedCodes: vi.fn().mockResolvedValue([]),
            updateLastNotified: vi.fn().mockResolvedValue(undefined),
            canForceRerun: vi.fn().mockResolvedValue({ allowed: false }),
            getNextForceRerunTime: vi.fn().mockResolvedValue(null),
            recordForceRerun: vi.fn().mockResolvedValue(undefined),
            getGameSubscription: vi.fn().mockResolvedValue(null),
            // DM failure tracking
            markDMDisabled: vi.fn().mockResolvedValue(undefined),
            clearDMDisabled: vi.fn().mockResolvedValue(undefined),
            // Notification preferences - defaults to all enabled
            getNotificationPreferences: vi.fn().mockResolvedValue({
                expirationWarnings: true,
                weeklyDigest: true,
                newCodeAlerts: true,
            }),
        };
        vi.mocked(getGachaDataService).mockReturnValue(mockDataService);

        // Setup game config mock
        vi.mocked(getGameConfig).mockImplementation((gameId: GachaGameId) => {
            const configs: any = {
                'bd2': {
                    id: 'bd2',
                    name: 'Brown Dust 2',
                    shortName: 'BD2',
                    apiEndpoint: 'https://test-api.example.com/coupon',
                    apiConfig: { appId: 'bd2-live', method: 'POST' },
                    supportsAutoRedeem: true,
                    logoPath: 'https://cdn.example.com/bd2.png',
                    embedColor: 0x8B4513,
                    maxNicknameLength: 24,
                    maxCodeLength: 20,
                    userIdFieldName: 'Nickname',
                },
                'nikke': {
                    id: 'nikke',
                    name: 'NIKKE',
                    shortName: 'NIKKE',
                    manualRedeemUrl: 'https://nikke.example.com/redeem',
                    supportsAutoRedeem: false,
                    logoPath: 'https://cdn.example.com/nikke.png',
                    embedColor: 0xFF69B4,
                    maxNicknameLength: 20,
                    maxCodeLength: 20,
                    userIdFieldName: 'Player ID',
                },
            };
            return configs[gameId];
        });

        vi.mocked(getAutoRedeemGames).mockReturnValue([
            {
                id: 'bd2',
                name: 'Brown Dust 2',
                shortName: 'BD2',
                apiEndpoint: 'https://test-api.example.com/coupon',
                apiConfig: { appId: 'bd2-live', method: 'POST' },
                supportsAutoRedeem: true,
                logoPath: 'https://cdn.example.com/bd2.png',
                embedColor: 0x8B4513,
                maxNicknameLength: 24,
                maxCodeLength: 20,
                userIdFieldName: 'Nickname',
            },
        ]);

        // Reset fetch mock
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Singleton Pattern', () => {
        it('should return the same instance', () => {
            const instance1 = getGachaRedemptionService();
            const instance2 = getGachaRedemptionService();
            expect(instance1).toBe(instance2);
        });
    });

    describe('supportsAutoRedeem', () => {
        it('should return true for BD2', () => {
            const service = getGachaRedemptionService();
            expect(service.supportsAutoRedeem('bd2')).toBe(true);
        });

        it('should return false for games without handler', () => {
            const service = getGachaRedemptionService();
            expect(service.supportsAutoRedeem('nikke')).toBe(false);
        });
    });

    describe('redeemCode', () => {
        it('should successfully redeem a valid code', async () => {
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true }),
            } as Response);

            const service = getGachaRedemptionService();
            const result = await service.redeemCode('bd2', 'TestUser', 'TESTCODE');

            expect(result.success).toBe(true);
            expect(result.code).toBe('TESTCODE');
            expect(result.gameId).toBe('bd2');
            expect(result.message).toContain('successfully');
        });

        it('should handle API errors gracefully', async () => {
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: false, error: 'InvalidCode' }),
            } as Response);

            const service = getGachaRedemptionService();
            const result = await service.redeemCode('bd2', 'TestUser', 'BADCODE');

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('InvalidCode');
            expect(result.message).toContain('invalid');
        });

        it('should handle AlreadyUsed error', async () => {
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: false, error: 'AlreadyUsed' }),
            } as Response);

            const service = getGachaRedemptionService();
            const result = await service.redeemCode('bd2', 'TestUser', 'USEDCODE');

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('AlreadyUsed');
            expect(result.message).toContain('already redeemed');
        });

        it('should handle ExpiredCode error', async () => {
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: false, error: 'ExpiredCode' }),
            } as Response);

            const service = getGachaRedemptionService();
            const result = await service.redeemCode('bd2', 'TestUser', 'EXPIREDCODE');

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('ExpiredCode');
            expect(result.message).toContain('expired');
        });

        it('should handle network errors', async () => {
            vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network failure'));

            const service = getGachaRedemptionService();
            const result = await service.redeemCode('bd2', 'TestUser', 'CODE');

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('NetworkError');
            expect(result.message).toContain('Network error');
        });

        it('should return error for unsupported game', async () => {
            const service = getGachaRedemptionService();
            const result = await service.redeemCode('nikke', 'TestUser', 'CODE');

            expect(result.success).toBe(false);
            expect(result.message).toContain('not supported');
        });

        it('should normalize code to uppercase', async () => {
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true }),
            } as Response);

            const service = getGachaRedemptionService();
            const result = await service.redeemCode('bd2', 'TestUser', 'lowercase');

            expect(result.code).toBe('LOWERCASE');
        });
    });

    describe('redeemMultipleCodes', () => {
        it('should redeem multiple codes sequentially', async () => {
            vi.mocked(global.fetch)
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ success: true }),
                } as Response)
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ success: true }),
                } as Response);

            const service = getGachaRedemptionService();
            const results = await service.redeemMultipleCodes('bd2', 'TestUser', ['CODE1', 'CODE2']);

            expect(results).toHaveLength(2);
            expect(results[0].success).toBe(true);
            expect(results[1].success).toBe(true);
        });

        it('should stop on rate limit error', async () => {
            vi.mocked(global.fetch)
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ success: false, error: 'RateLimited' }),
                } as Response)
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ success: true }),
                } as Response);

            const service = getGachaRedemptionService();
            const results = await service.redeemMultipleCodes('bd2', 'TestUser', ['CODE1', 'CODE2', 'CODE3']);

            // Should stop after rate limit
            expect(results).toHaveLength(1);
            expect(results[0].errorCode).toBe('RateLimited');
        });

        it('should stop on network error', async () => {
            vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Connection lost'));

            const service = getGachaRedemptionService();
            const results = await service.redeemMultipleCodes('bd2', 'TestUser', ['CODE1', 'CODE2']);

            expect(results).toHaveLength(1);
            expect(results[0].errorCode).toBe('NetworkError');
        });
    });

    describe('processGameAutoRedemptions', () => {
        it('should process auto-redemptions for all subscribers', async () => {
            const mockCoupons: Partial<GachaCoupon>[] = [
                { code: 'CODE1', gameId: 'bd2', rewards: 'Reward 1', isActive: true },
                { code: 'CODE2', gameId: 'bd2', rewards: 'Reward 2', isActive: true },
            ];

            // Use new format with preferences and dmDisabled
            const mockSubscribers = [
                {
                    discordId: 'user123',
                    subscription: {
                        gameId: 'bd2',
                        gameUserId: 'TestPlayer',
                        mode: 'auto-redeem',
                        subscribedAt: new Date().toISOString(),
                        redeemedCodes: [],
                    } as GameSubscription,
                    preferences: { expirationWarnings: true, weeklyDigest: true, newCodeAlerts: true },
                    dmDisabled: false,
                },
            ];

            mockDataService.getActiveCoupons.mockResolvedValue(mockCoupons);
            mockDataService.getSubscribersForNotification.mockResolvedValue(mockSubscribers);

            vi.mocked(global.fetch)
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true }) } as Response)
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true }) } as Response);

            const service = getGachaRedemptionService();
            const result = await service.processGameAutoRedemptions(mockBot as Client, 'bd2');

            expect(result.usersProcessed).toBe(1);
            expect(result.successful).toBe(2);
            expect(result.failed).toBe(0);
            // Now uses batch write instead of individual calls
            expect(mockDataService.batchMarkCodesRedeemed).toHaveBeenCalledWith([
                { discordId: 'user123', gameId: 'bd2', codes: ['CODE1', 'CODE2'] }
            ]);
        });

        it('should skip users with all codes redeemed', async () => {
            const mockCoupons: Partial<GachaCoupon>[] = [
                { code: 'CODE1', gameId: 'bd2', rewards: 'Reward 1', isActive: true },
            ];

            const mockSubscribers = [
                {
                    discordId: 'user123',
                    subscription: {
                        gameId: 'bd2',
                        gameUserId: 'TestPlayer',
                        mode: 'auto-redeem',
                        subscribedAt: new Date().toISOString(),
                        redeemedCodes: ['CODE1'],
                    } as GameSubscription,
                    preferences: { expirationWarnings: true, weeklyDigest: true, newCodeAlerts: true },
                    dmDisabled: false,
                },
            ];

            mockDataService.getActiveCoupons.mockResolvedValue(mockCoupons);
            mockDataService.getSubscribersForNotification.mockResolvedValue(mockSubscribers);

            const service = getGachaRedemptionService();
            const result = await service.processGameAutoRedemptions(mockBot as Client, 'bd2');

            expect(result.skipped).toBe(1);
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('should handle mixed success and failure', async () => {
            const mockCoupons: Partial<GachaCoupon>[] = [
                { code: 'GOOD', gameId: 'bd2', rewards: 'Reward 1', isActive: true },
                { code: 'BAD', gameId: 'bd2', rewards: 'Reward 2', isActive: true },
            ];

            const mockSubscribers = [
                {
                    discordId: 'user123',
                    subscription: {
                        gameId: 'bd2',
                        gameUserId: 'TestPlayer',
                        mode: 'auto-redeem',
                        subscribedAt: new Date().toISOString(),
                        redeemedCodes: [],
                    } as GameSubscription,
                    preferences: { expirationWarnings: true, weeklyDigest: true, newCodeAlerts: true },
                    dmDisabled: false,
                },
            ];

            mockDataService.getActiveCoupons.mockResolvedValue(mockCoupons);
            mockDataService.getSubscribersForNotification.mockResolvedValue(mockSubscribers);

            // AlreadyUsed is now categorized separately, not as a failure
            vi.mocked(global.fetch)
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true }) } as Response)
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: false, error: 'AlreadyUsed' }) } as Response);

            const service = getGachaRedemptionService();
            const result = await service.processGameAutoRedemptions(mockBot as Client, 'bd2');

            expect(result.successful).toBe(1);
            // AlreadyUsed is not counted as failed anymore (it's informational)
            expect(result.failed).toBe(0);
            // Both successful codes and AlreadyUsed codes are marked to avoid retrying
            expect(mockDataService.batchMarkCodesRedeemed).toHaveBeenCalledWith([
                { discordId: 'user123', gameId: 'bd2', codes: ['GOOD', 'BAD'] }
            ]);
        });

        it('should count actual API failures separately', async () => {
            const mockCoupons: Partial<GachaCoupon>[] = [
                { code: 'GOOD', gameId: 'bd2', rewards: 'Reward 1', isActive: true },
                { code: 'BAD', gameId: 'bd2', rewards: 'Reward 2', isActive: true },
            ];

            const mockSubscribers = [
                {
                    discordId: 'user123',
                    subscription: {
                        gameId: 'bd2',
                        gameUserId: 'TestPlayer',
                        mode: 'auto-redeem',
                        subscribedAt: new Date().toISOString(),
                        redeemedCodes: [],
                    } as GameSubscription,
                    preferences: { expirationWarnings: true, weeklyDigest: true, newCodeAlerts: true },
                    dmDisabled: false,
                },
            ];

            mockDataService.getActiveCoupons.mockResolvedValue(mockCoupons);
            mockDataService.getSubscribersForNotification.mockResolvedValue(mockSubscribers);

            // InvalidCode is an actual failure (not AlreadyUsed or ExpiredCode)
            vi.mocked(global.fetch)
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true }) } as Response)
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: false, error: 'InvalidCode' }) } as Response);

            const service = getGachaRedemptionService();
            const result = await service.processGameAutoRedemptions(mockBot as Client, 'bd2');

            expect(result.successful).toBe(1);
            // InvalidCode counts as actual failure
            expect(result.failed).toBe(1);
            // Only the successful code is marked (InvalidCode might be retried)
            expect(mockDataService.batchMarkCodesRedeemed).toHaveBeenCalledWith([
                { discordId: 'user123', gameId: 'bd2', codes: ['GOOD'] }
            ]);
        });

        it('should send DM with redemption results', async () => {
            const mockCoupons: Partial<GachaCoupon>[] = [
                { code: 'CODE1', gameId: 'bd2', rewards: 'Reward 1', isActive: true },
            ];

            const mockSubscribers = [
                {
                    discordId: 'user123',
                    subscription: {
                        gameId: 'bd2',
                        gameUserId: 'TestPlayer',
                        mode: 'auto-redeem',
                        subscribedAt: new Date().toISOString(),
                        redeemedCodes: [],
                    } as GameSubscription,
                    preferences: { expirationWarnings: true, weeklyDigest: true, newCodeAlerts: true },
                    dmDisabled: false,
                },
            ];

            mockDataService.getActiveCoupons.mockResolvedValue(mockCoupons);
            mockDataService.getSubscribersForNotification.mockResolvedValue(mockSubscribers);

            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true }),
            } as Response);

            const service = getGachaRedemptionService();
            await service.processGameAutoRedemptions(mockBot as Client, 'bd2');

            expect(mockBot.users?.fetch).toHaveBeenCalledWith('user123');
            expect(mockUser.send).toHaveBeenCalled();
        });
    });

    describe('processAllAutoRedemptions', () => {
        it('should process all games that support auto-redeem', async () => {
            mockDataService.getActiveCoupons.mockResolvedValue([]);
            mockDataService.getGameSubscribers.mockResolvedValue([]);

            const service = getGachaRedemptionService();
            const results = await service.processAllAutoRedemptions(mockBot as Client);

            expect(results).toHaveLength(1);
            expect(results[0].gameId).toBe('bd2');
        });
    });

    describe('notifyNewCode', () => {
        it('should notify notification-only subscribers via DM', async () => {
            const mockCoupon: GachaCoupon = {
                code: 'NEWCODE',
                gameId: 'bd2',
                rewards: '100 Gems',
                isActive: true,
                addedBy: 'mod123',
                addedAt: new Date().toISOString(),
            };

            const mockSubscribers = [
                {
                    discordId: 'user123',
                    subscription: {
                        gameId: 'bd2',
                        gameUserId: 'TestPlayer',
                        mode: 'notification-only',
                        subscribedAt: new Date().toISOString(),
                        redeemedCodes: [],
                    } as GameSubscription,
                    preferences: { expirationWarnings: true, weeklyDigest: true, newCodeAlerts: true },
                    dmDisabled: false,
                },
            ];

            mockDataService.getSubscribersForNotification.mockResolvedValue(mockSubscribers);

            const service = getGachaRedemptionService();
            await service.notifyNewCode(mockBot as Client, mockCoupon);

            expect(mockBot.users?.fetch).toHaveBeenCalledWith('user123');
            expect(mockUser.send).toHaveBeenCalled();
            // Should not call fetch (API) for notification-only users
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('should auto-redeem for auto-redeem subscribers', async () => {
            const mockCoupon: GachaCoupon = {
                code: 'NEWCODE',
                gameId: 'bd2',
                rewards: '100 Gems',
                isActive: true,
                addedBy: 'mod123',
                addedAt: new Date().toISOString(),
            };

            const mockSubscribers = [
                {
                    discordId: 'user456',
                    subscription: {
                        gameId: 'bd2',
                        gameUserId: 'AutoPlayer',
                        mode: 'auto-redeem',
                        subscribedAt: new Date().toISOString(),
                        redeemedCodes: [],
                    } as GameSubscription,
                    preferences: { expirationWarnings: true, weeklyDigest: true, newCodeAlerts: true },
                    dmDisabled: false,
                },
            ];

            mockDataService.getSubscribersForNotification.mockResolvedValue(mockSubscribers);
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ success: true }),
            } as Response);

            const service = getGachaRedemptionService();
            await service.notifyNewCode(mockBot as Client, mockCoupon);

            expect(global.fetch).toHaveBeenCalled();
            expect(mockDataService.markCodesRedeemed).toHaveBeenCalledWith('user456', 'bd2', ['NEWCODE']);
        });

        it('should include expiration date in notification', async () => {
            // Use future date to ensure code isn't skipped as expired
            const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            const mockCoupon: GachaCoupon = {
                code: 'EXPIRING',
                gameId: 'bd2',
                rewards: '100 Gems',
                isActive: true,
                addedBy: 'mod123',
                addedAt: new Date().toISOString(),
                expirationDate: futureDate,
            };

            mockDataService.getSubscribersForNotification.mockResolvedValue([
                {
                    discordId: 'user123',
                    subscription: {
                        gameId: 'bd2',
                        gameUserId: 'TestPlayer',
                        mode: 'notification-only',
                        subscribedAt: new Date().toISOString(),
                        redeemedCodes: [],
                    } as GameSubscription,
                    preferences: { expirationWarnings: true, weeklyDigest: true, newCodeAlerts: true },
                    dmDisabled: false,
                },
            ]);

            const service = getGachaRedemptionService();
            await service.notifyNewCode(mockBot as Client, mockCoupon);

            expect(mockUser.send).toHaveBeenCalled();
            const embedCall = (mockUser.send as any).mock.calls[0][0];
            expect(embedCall.embeds).toBeDefined();
        });

        it('should skip notification for already expired codes', async () => {
            // Use past date to simulate expired code
            const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const mockCoupon: GachaCoupon = {
                code: 'EXPIREDCODE',
                gameId: 'bd2',
                rewards: '100 Gems',
                isActive: true,
                addedBy: 'mod123',
                addedAt: new Date().toISOString(),
                expirationDate: pastDate,
            };

            mockDataService.getSubscribersForNotification.mockResolvedValue([
                {
                    discordId: 'user123',
                    subscription: {
                        gameId: 'bd2',
                        gameUserId: 'TestPlayer',
                        mode: 'notification-only',
                        subscribedAt: new Date().toISOString(),
                        redeemedCodes: [],
                    } as GameSubscription,
                    preferences: { expirationWarnings: true, weeklyDigest: true, newCodeAlerts: true },
                    dmDisabled: false,
                },
            ]);

            const service = getGachaRedemptionService();
            await service.notifyNewCode(mockBot as Client, mockCoupon);

            // Should NOT send any DMs for expired codes
            expect(mockUser.send).not.toHaveBeenCalled();
        });
    });

    describe('sendExpirationWarnings', () => {
        it('should send warnings for expiring unredeemed codes', async () => {
            const mockExpiringCoupons: Partial<GachaCoupon>[] = [
                {
                    code: 'EXPIRING1',
                    gameId: 'bd2',
                    rewards: 'Reward',
                    isActive: true,
                    expirationDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
                },
            ];

            const mockSubscribers = [
                {
                    discordId: 'user123',
                    subscription: {
                        gameId: 'bd2',
                        gameUserId: 'TestPlayer',
                        mode: 'notification-only',
                        subscribedAt: new Date().toISOString(),
                        redeemedCodes: [],
                    } as GameSubscription,
                    preferences: { expirationWarnings: true, weeklyDigest: true, newCodeAlerts: true },
                    dmDisabled: false,
                },
            ];

            mockDataService.getExpiringCoupons.mockResolvedValue(mockExpiringCoupons);
            mockDataService.getSubscribersForNotification.mockResolvedValue(mockSubscribers);

            const service = getGachaRedemptionService();
            await service.sendExpirationWarnings(mockBot as Client, 'bd2');

            expect(mockBot.users?.fetch).toHaveBeenCalledWith('user123');
            expect(mockUser.send).toHaveBeenCalled();
        });

        it('should not warn users who already redeemed the code', async () => {
            const mockExpiringCoupons: Partial<GachaCoupon>[] = [
                {
                    code: 'EXPIRING1',
                    gameId: 'bd2',
                    rewards: 'Reward',
                    isActive: true,
                    expirationDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
                },
            ];

            const mockSubscribers = [
                {
                    discordId: 'user123',
                    subscription: {
                        gameId: 'bd2',
                        gameUserId: 'TestPlayer',
                        mode: 'notification-only',
                        subscribedAt: new Date().toISOString(),
                        redeemedCodes: ['EXPIRING1'],
                    } as GameSubscription,
                    preferences: { expirationWarnings: true, weeklyDigest: true, newCodeAlerts: true },
                    dmDisabled: false,
                },
            ];

            mockDataService.getExpiringCoupons.mockResolvedValue(mockExpiringCoupons);
            mockDataService.getSubscribersForNotification.mockResolvedValue(mockSubscribers);

            const service = getGachaRedemptionService();
            await service.sendExpirationWarnings(mockBot as Client, 'bd2');

            expect(mockUser.send).not.toHaveBeenCalled();
        });

        it('should do nothing if no expiring coupons', async () => {
            mockDataService.getExpiringCoupons.mockResolvedValue([]);

            const service = getGachaRedemptionService();
            await service.sendExpirationWarnings(mockBot as Client, 'bd2');

            expect(mockDataService.getSubscribersForNotification).not.toHaveBeenCalled();
        });
    });

    describe('sendWeeklyDigest', () => {
        it('should send digest to all subscribers', async () => {
            const mockCoupons: Partial<GachaCoupon>[] = [
                { code: 'CODE1', gameId: 'bd2', rewards: 'Reward 1', isActive: true },
            ];

            const mockSubscribers = [
                {
                    discordId: 'user123',
                    subscription: {
                        gameId: 'bd2',
                        gameUserId: 'TestPlayer',
                        mode: 'notification-only',
                        subscribedAt: new Date().toISOString(),
                        redeemedCodes: [],
                    } as GameSubscription,
                    preferences: { expirationWarnings: true, weeklyDigest: true, newCodeAlerts: true },
                    dmDisabled: false,
                },
            ];

            mockDataService.getSubscribersForNotification.mockResolvedValue(mockSubscribers);
            mockDataService.getActiveCoupons.mockResolvedValue(mockCoupons);
            mockDataService.getExpiringCoupons.mockResolvedValue([]);
            mockDataService.getUnredeemedCodes.mockResolvedValue(mockCoupons);

            const service = getGachaRedemptionService();
            await service.sendWeeklyDigest(mockBot as Client, 'bd2');

            expect(mockBot.users?.fetch).toHaveBeenCalledWith('user123');
            expect(mockUser.send).toHaveBeenCalled();
            expect(mockDataService.updateLastNotified).toHaveBeenCalledWith('user123', 'bd2');
        });

        it('should include unredeemed codes in digest', async () => {
            const mockCoupons: Partial<GachaCoupon>[] = [
                { code: 'CODE1', gameId: 'bd2', rewards: 'Reward 1', isActive: true },
                { code: 'CODE2', gameId: 'bd2', rewards: 'Reward 2', isActive: true },
            ];

            const mockSubscribers = [
                {
                    discordId: 'user123',
                    subscription: {
                        gameId: 'bd2',
                        gameUserId: 'TestPlayer',
                        mode: 'notification-only',
                        subscribedAt: new Date().toISOString(),
                        redeemedCodes: ['CODE1'],
                    } as GameSubscription,
                    preferences: { expirationWarnings: true, weeklyDigest: true, newCodeAlerts: true },
                    dmDisabled: false,
                },
            ];

            const unredeemedCodes: Partial<GachaCoupon>[] = [
                { code: 'CODE2', gameId: 'bd2', rewards: 'Reward 2', isActive: true },
            ];

            mockDataService.getSubscribersForNotification.mockResolvedValue(mockSubscribers);
            mockDataService.getActiveCoupons.mockResolvedValue(mockCoupons);
            mockDataService.getExpiringCoupons.mockResolvedValue([]);
            mockDataService.getUnredeemedCodes.mockResolvedValue(unredeemedCodes);

            const service = getGachaRedemptionService();
            await service.sendWeeklyDigest(mockBot as Client, 'bd2');

            expect(mockUser.send).toHaveBeenCalled();
        });

        it('should handle DM failure gracefully', async () => {
            const mockSubscribers = [
                {
                    discordId: 'user123',
                    subscription: {
                        gameId: 'bd2',
                        gameUserId: 'TestPlayer',
                        mode: 'notification-only',
                        subscribedAt: new Date().toISOString(),
                        redeemedCodes: [],
                    } as GameSubscription,
                    preferences: { expirationWarnings: true, weeklyDigest: true, newCodeAlerts: true },
                    dmDisabled: false,
                },
            ];

            mockDataService.getSubscribersForNotification.mockResolvedValue(mockSubscribers);
            mockDataService.getActiveCoupons.mockResolvedValue([]);
            mockDataService.getExpiringCoupons.mockResolvedValue([]);
            mockDataService.getUnredeemedCodes.mockResolvedValue([]);
            mockUser.send = vi.fn().mockRejectedValue(new Error('Cannot send DM'));

            const service = getGachaRedemptionService();

            // Should not throw
            await expect(service.sendWeeklyDigest(mockBot as Client, 'bd2')).resolves.toBeUndefined();
        });

        it('should skip digest if user has no unredeemed codes', async () => {
            const mockSubscribers = [
                {
                    discordId: 'user123',
                    subscription: {
                        gameId: 'bd2',
                        gameUserId: 'TestPlayer',
                        mode: 'notification-only',
                        subscribedAt: new Date().toISOString(),
                        redeemedCodes: ['CODE1', 'CODE2'], // User has redeemed all codes
                    } as GameSubscription,
                    preferences: { expirationWarnings: true, weeklyDigest: true, newCodeAlerts: true },
                    dmDisabled: false,
                },
            ];

            mockDataService.getSubscribersForNotification.mockResolvedValue(mockSubscribers);
            mockDataService.getActiveCoupons.mockResolvedValue([]);
            mockDataService.getExpiringCoupons.mockResolvedValue([]);
            mockDataService.getUnredeemedCodes.mockResolvedValue([]); // No unredeemed codes

            const service = getGachaRedemptionService();
            await service.sendWeeklyDigest(mockBot as Client, 'bd2');

            // Should NOT send DM when user has no unredeemed codes
            expect(mockUser.send).not.toHaveBeenCalled();
        });
    });

    describe('Rate Limiting', () => {
        it('should enforce rate limiting between requests', async () => {
            vi.mocked(global.fetch)
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true }) } as Response)
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true }) } as Response);

            const service = getGachaRedemptionService();

            const start = Date.now();
            await service.redeemCode('bd2', 'TestUser', 'CODE1');
            await service.redeemCode('bd2', 'TestUser', 'CODE2');
            const elapsed = Date.now() - start;

            // Should have at least ~2000ms delay between calls
            expect(elapsed).toBeGreaterThanOrEqual(1900); // Allow some tolerance
        });
    });

    describe('Notification Preferences', () => {
        it('should skip expiration warnings if user disabled them', async () => {
            const mockExpiringCoupons: Partial<GachaCoupon>[] = [
                {
                    code: 'EXPIRING1',
                    gameId: 'bd2',
                    rewards: 'Reward',
                    isActive: true,
                    expirationDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
                },
            ];

            // Use new format with preferences inline (disabled expiration warnings)
            const mockSubscribers = [
                {
                    discordId: 'user123',
                    subscription: {
                        gameId: 'bd2',
                        gameUserId: 'TestPlayer',
                        mode: 'notification-only',
                        subscribedAt: new Date().toISOString(),
                        redeemedCodes: [],
                    } as GameSubscription,
                    preferences: { expirationWarnings: false, weeklyDigest: true, newCodeAlerts: true },
                    dmDisabled: false,
                },
            ];

            mockDataService.getExpiringCoupons.mockResolvedValue(mockExpiringCoupons);
            mockDataService.getSubscribersForNotification.mockResolvedValue(mockSubscribers);

            const service = getGachaRedemptionService();
            await service.sendExpirationWarnings(mockBot as Client, 'bd2');

            // User disabled expiration warnings, so no DM should be sent
            expect(mockUser.send).not.toHaveBeenCalled();
        });

        it('should skip weekly digest if user disabled it', async () => {
            const mockCoupons: Partial<GachaCoupon>[] = [
                { code: 'CODE1', gameId: 'bd2', rewards: 'Reward 1', isActive: true },
            ];

            // Use new format with preferences inline (disabled weekly digest)
            const mockSubscribers = [
                {
                    discordId: 'user123',
                    subscription: {
                        gameId: 'bd2',
                        gameUserId: 'TestPlayer',
                        mode: 'notification-only',
                        subscribedAt: new Date().toISOString(),
                        redeemedCodes: [],
                    } as GameSubscription,
                    preferences: { expirationWarnings: true, weeklyDigest: false, newCodeAlerts: true },
                    dmDisabled: false,
                },
            ];

            mockDataService.getSubscribersForNotification.mockResolvedValue(mockSubscribers);
            mockDataService.getActiveCoupons.mockResolvedValue(mockCoupons);
            mockDataService.getExpiringCoupons.mockResolvedValue([]);
            mockDataService.getUnredeemedCodes.mockResolvedValue(mockCoupons);

            const service = getGachaRedemptionService();
            await service.sendWeeklyDigest(mockBot as Client, 'bd2');

            // User disabled weekly digest, so no DM should be sent
            expect(mockUser.send).not.toHaveBeenCalled();
        });

        it('should skip new code alerts if user disabled them', async () => {
            const mockCoupon: GachaCoupon = {
                code: 'NEWCODE',
                gameId: 'bd2',
                rewards: '500 Gems',
                expirationDate: null,
                addedBy: 'admin123',
                addedAt: new Date().toISOString(),
                isActive: true,
            };

            // Use new format with preferences inline (disabled new code alerts)
            const mockSubscribers = [
                {
                    discordId: 'user123',
                    subscription: {
                        gameId: 'bd2',
                        gameUserId: 'TestPlayer',
                        mode: 'notification-only',
                        subscribedAt: new Date().toISOString(),
                        redeemedCodes: [],
                    } as GameSubscription,
                    preferences: { expirationWarnings: true, weeklyDigest: true, newCodeAlerts: false },
                    dmDisabled: false,
                },
            ];

            mockDataService.getSubscribersForNotification.mockResolvedValue(mockSubscribers);

            const service = getGachaRedemptionService();
            await service.notifyNewCode(mockBot as Client, mockCoupon);

            // User disabled new code alerts, so no DM should be sent
            expect(mockUser.send).not.toHaveBeenCalled();
        });

        it('should send notifications when preferences are enabled (default)', async () => {
            const mockExpiringCoupons: Partial<GachaCoupon>[] = [
                {
                    code: 'EXPIRING1',
                    gameId: 'bd2',
                    rewards: 'Reward',
                    isActive: true,
                    expirationDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
                },
            ];

            // Use new format with all preferences enabled
            const mockSubscribers = [
                {
                    discordId: 'user123',
                    subscription: {
                        gameId: 'bd2',
                        gameUserId: 'TestPlayer',
                        mode: 'notification-only',
                        subscribedAt: new Date().toISOString(),
                        redeemedCodes: [],
                    } as GameSubscription,
                    preferences: { expirationWarnings: true, weeklyDigest: true, newCodeAlerts: true },
                    dmDisabled: false,
                },
            ];

            mockDataService.getExpiringCoupons.mockResolvedValue(mockExpiringCoupons);
            mockDataService.getSubscribersForNotification.mockResolvedValue(mockSubscribers);

            const service = getGachaRedemptionService();
            await service.sendExpirationWarnings(mockBot as Client, 'bd2');

            // User has default preferences, so DM should be sent
            expect(mockBot.users?.fetch).toHaveBeenCalledWith('user123');
            expect(mockUser.send).toHaveBeenCalled();
        });
    });
});
