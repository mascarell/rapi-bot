import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GachaDataService, getGachaDataService } from '../gachaDataService';
import { GachaCouponData, GachaCoupon, GachaGameId } from '../../utils/interfaces/GachaCoupon.interface';

// Mock the S3 client
vi.mock('../../utils/cdn/config', () => ({
    s3Client: {
        send: vi.fn()
    },
    S3_BUCKET: 'test-bucket'
}));

// Import the mocked module
import { s3Client } from '../../utils/cdn/config';

describe('GachaDataService', () => {
    let service: GachaDataService;
    let mockData: GachaCouponData;

    beforeEach(() => {
        // Reset singleton for each test
        (GachaDataService as any).instance = null;
        service = getGachaDataService();

        // Create mock data
        mockData = {
            coupons: [
                {
                    code: 'TESTCODE1',
                    gameId: 'bd2',
                    rewards: '500 Dia',
                    expirationDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
                    addedBy: 'user123',
                    addedAt: new Date().toISOString(),
                    isActive: true,
                    source: 'Twitter'
                },
                {
                    code: 'TESTCODE2',
                    gameId: 'bd2',
                    rewards: '1000 Dia',
                    expirationDate: null,
                    addedBy: 'user456',
                    addedAt: new Date().toISOString(),
                    isActive: true
                },
                {
                    code: 'EXPIREDCODE',
                    gameId: 'bd2',
                    rewards: '100 Dia',
                    expirationDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday
                    addedBy: 'user123',
                    addedAt: new Date().toISOString(),
                    isActive: true
                },
                {
                    code: 'INACTIVECODE',
                    gameId: 'bd2',
                    rewards: '50 Dia',
                    expirationDate: null,
                    addedBy: 'user123',
                    addedAt: new Date().toISOString(),
                    isActive: false
                },
                {
                    code: 'NIKKECODE',
                    gameId: 'nikke',
                    rewards: '300 Gems',
                    expirationDate: null,
                    addedBy: 'user789',
                    addedAt: new Date().toISOString(),
                    isActive: true
                }
            ],
            subscriptions: [
                {
                    discordId: 'discord123',
                    games: {
                        'bd2': {
                            gameId: 'bd2',
                            gameUserId: 'Player1',
                            mode: 'auto-redeem',
                            subscribedAt: new Date().toISOString(),
                            redeemedCodes: ['OLDCODE1']
                        }
                    }
                },
                {
                    discordId: 'discord456',
                    games: {
                        'bd2': {
                            gameId: 'bd2',
                            gameUserId: 'Player2',
                            mode: 'notification-only',
                            subscribedAt: new Date().toISOString(),
                            redeemedCodes: []
                        },
                        'nikke': {
                            gameId: 'nikke',
                            gameUserId: 'Commander1',
                            mode: 'notification-only',
                            subscribedAt: new Date().toISOString(),
                            redeemedCodes: []
                        }
                    }
                }
            ],
            lastUpdated: new Date().toISOString(),
            schemaVersion: 1
        };

        // Setup default mock behavior
        vi.mocked(s3Client.send).mockImplementation(async (command: any) => {
            if (command.constructor.name === 'GetObjectCommand') {
                return {
                    Body: {
                        transformToString: async () => JSON.stringify(mockData)
                    }
                };
            }
            if (command.constructor.name === 'PutObjectCommand') {
                return {};
            }
            return {};
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Singleton Pattern', () => {
        it('should return the same instance', () => {
            const instance1 = getGachaDataService();
            const instance2 = getGachaDataService();
            expect(instance1).toBe(instance2);
        });
    });

    describe('getData', () => {
        it('should fetch data from S3', async () => {
            const data = await service.getData();

            expect(data.coupons.length).toBe(5);
            expect(data.subscriptions.length).toBe(2);
        });

        it('should return cached data on subsequent calls', async () => {
            await service.getData();
            await service.getData();

            // S3 should only be called once due to caching
            expect(s3Client.send).toHaveBeenCalledTimes(1);
        });

        it('should create default data if file does not exist', async () => {
            vi.mocked(s3Client.send).mockRejectedValueOnce({ name: 'NoSuchKey' });

            const data = await service.getData();

            expect(data.coupons).toEqual([]);
            expect(data.subscriptions).toEqual([]);
            expect(data.schemaVersion).toBe(1);
        });
    });

    describe('invalidateCache', () => {
        it('should force fresh data fetch after invalidation', async () => {
            await service.getData();
            service.invalidateCache();
            await service.getData();

            expect(s3Client.send).toHaveBeenCalledTimes(2);
        });
    });

    // ==================== Coupon Operations ====================

    describe('addCoupon', () => {
        it('should add a new coupon', async () => {
            const newCoupon: GachaCoupon = {
                code: 'NEWCODE',
                gameId: 'bd2',
                rewards: '2000 Dia',
                expirationDate: null,
                addedBy: 'userNew',
                addedAt: new Date().toISOString(),
                isActive: true
            };

            await service.addCoupon(newCoupon);

            const data = await service.getData();
            const added = data.coupons.find(c => c.code === 'NEWCODE');
            expect(added).toBeDefined();
            expect(added?.rewards).toBe('2000 Dia');
        });

        it('should normalize code to uppercase', async () => {
            const newCoupon: GachaCoupon = {
                code: 'lowercase',
                gameId: 'bd2',
                rewards: '100 Dia',
                expirationDate: null,
                addedBy: 'user',
                addedAt: new Date().toISOString(),
                isActive: true
            };

            await service.addCoupon(newCoupon);

            const data = await service.getData();
            const added = data.coupons.find(c => c.code === 'LOWERCASE');
            expect(added).toBeDefined();
        });

        it('should throw error for duplicate code in same game', async () => {
            const duplicate: GachaCoupon = {
                code: 'TESTCODE1',
                gameId: 'bd2',
                rewards: 'Different rewards',
                expirationDate: null,
                addedBy: 'user',
                addedAt: new Date().toISOString(),
                isActive: true
            };

            await expect(service.addCoupon(duplicate)).rejects.toThrow('already exists');
        });

        it('should allow same code for different games', async () => {
            const sameCodeDifferentGame: GachaCoupon = {
                code: 'TESTCODE1',
                gameId: 'nikke', // Different game
                rewards: '500 Gems',
                expirationDate: null,
                addedBy: 'user',
                addedAt: new Date().toISOString(),
                isActive: true
            };

            await expect(service.addCoupon(sameCodeDifferentGame)).resolves.not.toThrow();
        });
    });

    describe('removeCoupon', () => {
        it('should mark coupon as inactive', async () => {
            const result = await service.removeCoupon('bd2', 'TESTCODE1');

            expect(result).toBe(true);
            const data = await service.getData();
            const coupon = data.coupons.find(c => c.code === 'TESTCODE1');
            expect(coupon?.isActive).toBe(false);
        });

        it('should return false for non-existent code', async () => {
            const result = await service.removeCoupon('bd2', 'NONEXISTENT');
            expect(result).toBe(false);
        });

        it('should be case-insensitive', async () => {
            const result = await service.removeCoupon('bd2', 'testcode1');
            expect(result).toBe(true);
        });
    });

    describe('getActiveCoupons', () => {
        it('should return only active, non-expired coupons for a game', async () => {
            const coupons = await service.getActiveCoupons('bd2');

            expect(coupons.length).toBe(2); // TESTCODE1 and TESTCODE2
            expect(coupons.every(c => c.isActive)).toBe(true);
            expect(coupons.every(c => c.gameId === 'bd2')).toBe(true);
        });

        it('should exclude expired coupons', async () => {
            const coupons = await service.getActiveCoupons('bd2');

            const expired = coupons.find(c => c.code === 'EXPIREDCODE');
            expect(expired).toBeUndefined();
        });

        it('should exclude inactive coupons', async () => {
            const coupons = await service.getActiveCoupons('bd2');

            const inactive = coupons.find(c => c.code === 'INACTIVECODE');
            expect(inactive).toBeUndefined();
        });

        it('should return empty array for game with no coupons', async () => {
            const coupons = await service.getActiveCoupons('blue-archive');
            expect(coupons).toEqual([]);
        });
    });

    describe('getAllCoupons', () => {
        it('should return all coupons for a game including inactive', async () => {
            const coupons = await service.getAllCoupons('bd2');

            expect(coupons.length).toBe(4); // All BD2 coupons
            expect(coupons.some(c => !c.isActive)).toBe(true);
        });
    });

    describe('getExpiringCoupons', () => {
        it('should return coupons expiring within specified days', async () => {
            const expiring = await service.getExpiringCoupons('bd2', 10);

            expect(expiring.length).toBe(1); // TESTCODE1 expires in 7 days
            expect(expiring[0].code).toBe('TESTCODE1');
        });

        it('should not include already expired coupons', async () => {
            const expiring = await service.getExpiringCoupons('bd2', 10);

            const expired = expiring.find(c => c.code === 'EXPIREDCODE');
            expect(expired).toBeUndefined();
        });

        it('should not include coupons without expiration date', async () => {
            const expiring = await service.getExpiringCoupons('bd2', 10);

            const noExpiry = expiring.find(c => c.code === 'TESTCODE2');
            expect(noExpiry).toBeUndefined();
        });
    });

    describe('getCoupon', () => {
        it('should return specific coupon', async () => {
            const coupon = await service.getCoupon('bd2', 'TESTCODE1');

            expect(coupon).toBeDefined();
            expect(coupon?.rewards).toBe('500 Dia');
        });

        it('should be case-insensitive', async () => {
            const coupon = await service.getCoupon('bd2', 'testcode1');
            expect(coupon).toBeDefined();
        });

        it('should return null for non-existent coupon', async () => {
            const coupon = await service.getCoupon('bd2', 'NONEXISTENT');
            expect(coupon).toBeNull();
        });

        it('should return null for wrong game', async () => {
            const coupon = await service.getCoupon('nikke', 'TESTCODE1');
            expect(coupon).toBeNull();
        });
    });

    // ==================== Subscription Operations ====================

    describe('subscribe', () => {
        it('should add new subscription for new user', async () => {
            await service.subscribe('newUser', 'bd2', 'NewPlayer', 'auto-redeem');

            const sub = await service.getGameSubscription('newUser', 'bd2');
            expect(sub).toBeDefined();
            expect(sub?.gameUserId).toBe('NewPlayer');
            expect(sub?.mode).toBe('auto-redeem');
        });

        it('should add game subscription to existing user', async () => {
            await service.subscribe('discord123', 'nikke', 'Commander2', 'notification-only');

            const sub = await service.getGameSubscription('discord123', 'nikke');
            expect(sub).toBeDefined();
            expect(sub?.gameUserId).toBe('Commander2');
        });

        it('should throw error for duplicate subscription', async () => {
            await expect(
                service.subscribe('discord123', 'bd2', 'AnotherPlayer', 'auto-redeem')
            ).rejects.toThrow('already subscribed');
        });
    });

    describe('unsubscribe', () => {
        it('should remove game subscription', async () => {
            const result = await service.unsubscribe('discord123', 'bd2');

            expect(result).toBe(true);
            const sub = await service.getGameSubscription('discord123', 'bd2');
            expect(sub).toBeNull();
        });

        it('should remove user record if no games left', async () => {
            await service.unsubscribe('discord123', 'bd2');

            const userSubs = await service.getUserSubscriptions('discord123');
            expect(userSubs).toBeNull();
        });

        it('should keep user record if other games remain', async () => {
            await service.unsubscribe('discord456', 'bd2');

            const userSubs = await service.getUserSubscriptions('discord456');
            expect(userSubs).toBeDefined();
            expect(userSubs?.games['nikke']).toBeDefined();
        });

        it('should return false for non-existent subscription', async () => {
            const result = await service.unsubscribe('nonexistent', 'bd2');
            expect(result).toBe(false);
        });
    });

    describe('getGameSubscription', () => {
        it('should return subscription for specific game', async () => {
            const sub = await service.getGameSubscription('discord123', 'bd2');

            expect(sub).toBeDefined();
            expect(sub?.gameUserId).toBe('Player1');
            expect(sub?.mode).toBe('auto-redeem');
        });

        it('should return null for non-subscribed game', async () => {
            const sub = await service.getGameSubscription('discord123', 'nikke');
            expect(sub).toBeNull();
        });
    });

    describe('getUserSubscriptions', () => {
        it('should return all subscriptions for a user', async () => {
            const subs = await service.getUserSubscriptions('discord456');

            expect(subs).toBeDefined();
            expect(Object.keys(subs!.games).length).toBe(2);
        });

        it('should return null for user with no subscriptions', async () => {
            const subs = await service.getUserSubscriptions('nonexistent');
            expect(subs).toBeNull();
        });
    });

    describe('getGameSubscribers', () => {
        it('should return all subscribers for a game', async () => {
            const subs = await service.getGameSubscribers('bd2');

            expect(subs.length).toBe(2);
        });

        it('should filter by mode when specified', async () => {
            const autoRedeemSubs = await service.getGameSubscribers('bd2', 'auto-redeem');

            expect(autoRedeemSubs.length).toBe(1);
            expect(autoRedeemSubs[0].subscription.mode).toBe('auto-redeem');
        });

        it('should return empty array for game with no subscribers', async () => {
            const subs = await service.getGameSubscribers('blue-archive');
            expect(subs).toEqual([]);
        });
    });

    describe('markCodesRedeemed', () => {
        it('should add codes to redeemed list', async () => {
            await service.markCodesRedeemed('discord123', 'bd2', ['TESTCODE1', 'TESTCODE2']);

            const sub = await service.getGameSubscription('discord123', 'bd2');
            expect(sub?.redeemedCodes).toContain('TESTCODE1');
            expect(sub?.redeemedCodes).toContain('TESTCODE2');
        });

        it('should normalize codes to uppercase', async () => {
            await service.markCodesRedeemed('discord123', 'bd2', ['lowercase']);

            const sub = await service.getGameSubscription('discord123', 'bd2');
            expect(sub?.redeemedCodes).toContain('LOWERCASE');
        });

        it('should not duplicate existing codes', async () => {
            await service.markCodesRedeemed('discord123', 'bd2', ['OLDCODE1', 'NEWCODE']);

            const sub = await service.getGameSubscription('discord123', 'bd2');
            const oldCodeCount = sub?.redeemedCodes.filter(c => c === 'OLDCODE1').length;
            expect(oldCodeCount).toBe(1);
        });

        it('should return false for non-existent subscription', async () => {
            const result = await service.markCodesRedeemed('nonexistent', 'bd2', ['CODE']);
            expect(result).toBe(false);
        });
    });

    describe('getUnredeemedCodes', () => {
        it('should return codes not yet redeemed by user', async () => {
            const unredeemed = await service.getUnredeemedCodes('discord456', 'bd2');

            // discord456 has empty redeemedCodes, so should get all active BD2 codes
            expect(unredeemed.length).toBe(2); // TESTCODE1 and TESTCODE2
        });

        it('should exclude already redeemed codes', async () => {
            // First mark a code as redeemed
            await service.markCodesRedeemed('discord456', 'bd2', ['TESTCODE1']);

            const unredeemed = await service.getUnredeemedCodes('discord456', 'bd2');

            expect(unredeemed.length).toBe(1);
            expect(unredeemed[0].code).toBe('TESTCODE2');
        });

        it('should return all active codes for non-subscribed user', async () => {
            const unredeemed = await service.getUnredeemedCodes('nonexistent', 'bd2');

            expect(unredeemed.length).toBe(2);
        });
    });

    describe('getGameStats', () => {
        it('should return correct subscriber counts', async () => {
            const stats = await service.getGameStats('bd2');

            expect(stats.total).toBe(2);
            expect(stats.autoRedeem).toBe(1);
            expect(stats.notifyOnly).toBe(1);
        });

        it('should return zeros for game with no subscribers', async () => {
            const stats = await service.getGameStats('blue-archive');

            expect(stats.total).toBe(0);
            expect(stats.autoRedeem).toBe(0);
            expect(stats.notifyOnly).toBe(0);
        });
    });

    describe('updateLastNotified', () => {
        it('should update lastNotified timestamp', async () => {
            const before = await service.getGameSubscription('discord123', 'bd2');
            expect(before?.lastNotified).toBeUndefined();

            await service.updateLastNotified('discord123', 'bd2');

            const after = await service.getGameSubscription('discord123', 'bd2');
            expect(after?.lastNotified).toBeDefined();
        });
    });
});
