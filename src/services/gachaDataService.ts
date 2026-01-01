import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_BUCKET } from "../utils/cdn/config";
import {
    GachaCouponData,
    GachaCoupon,
    UserSubscription,
    GameSubscription,
    GachaGameId,
    SubscriptionMode
} from "../utils/interfaces/GachaCoupon.interface";
import { getGameConfig } from "../utils/data/gachaGamesConfig";

const DATA_KEY = 'data/gacha-coupons/coupons.json';
const CURRENT_SCHEMA_VERSION = 1;

/**
 * Service for managing gacha coupon data in S3
 * Supports multiple games with a unified data structure
 */
export class GachaDataService {
    private static instance: GachaDataService;
    private cache: GachaCouponData | null = null;
    private cacheExpiry: number = 0;
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    private constructor() {}

    public static getInstance(): GachaDataService {
        if (!GachaDataService.instance) {
            GachaDataService.instance = new GachaDataService();
        }
        return GachaDataService.instance;
    }

    /**
     * Fetch data from S3 with caching
     */
    public async getData(): Promise<GachaCouponData> {
        if (this.cache && Date.now() < this.cacheExpiry) {
            return this.cache;
        }

        try {
            const response = await s3Client.send(new GetObjectCommand({
                Bucket: S3_BUCKET,
                Key: DATA_KEY,
            }));

            const bodyContents = await response.Body?.transformToString();
            if (!bodyContents) {
                return this.getDefaultData();
            }

            this.cache = JSON.parse(bodyContents) as GachaCouponData;
            this.cacheExpiry = Date.now() + this.CACHE_TTL;
            return this.cache;
        } catch (error: any) {
            if (error.name === 'NoSuchKey' || error.Code === 'NoSuchKey') {
                console.log('Gacha coupon data file not found, creating default...');
                const defaultData = this.getDefaultData();
                await this.saveData(defaultData);
                return defaultData;
            }
            console.error('Error fetching gacha coupon data:', error);
            throw error;
        }
    }

    /**
     * Save data to S3 and update cache
     */
    public async saveData(data: GachaCouponData): Promise<void> {
        data.lastUpdated = new Date().toISOString();

        await s3Client.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: DATA_KEY,
            Body: JSON.stringify(data, null, 2),
            ContentType: 'application/json',
        }));

        this.cache = data;
        this.cacheExpiry = Date.now() + this.CACHE_TTL;
        console.log('Gacha coupon data saved to S3');
    }

    private getDefaultData(): GachaCouponData {
        return {
            coupons: [],
            subscriptions: [],
            lastUpdated: new Date().toISOString(),
            schemaVersion: CURRENT_SCHEMA_VERSION,
        };
    }

    public invalidateCache(): void {
        this.cache = null;
        this.cacheExpiry = 0;
    }

    // ==================== Coupon Operations ====================

    /**
     * Add a new coupon code for a specific game
     */
    public async addCoupon(coupon: GachaCoupon): Promise<void> {
        const data = await this.getData();

        const existing = data.coupons.find(
            c => c.code.toUpperCase() === coupon.code.toUpperCase() && c.gameId === coupon.gameId
        );
        if (existing) {
            throw new Error(`Coupon code "${coupon.code}" already exists for ${getGameConfig(coupon.gameId).name}`);
        }

        coupon.code = coupon.code.toUpperCase().trim();
        data.coupons.push(coupon);
        await this.saveData(data);
    }

    /**
     * Remove a coupon code (marks as inactive)
     */
    public async removeCoupon(gameId: GachaGameId, code: string): Promise<boolean> {
        const data = await this.getData();
        const coupon = data.coupons.find(
            c => c.code.toUpperCase() === code.toUpperCase() && c.gameId === gameId
        );

        if (!coupon) {
            return false;
        }

        coupon.isActive = false;
        await this.saveData(data);
        return true;
    }

    /**
     * Get all active coupons for a specific game
     */
    public async getActiveCoupons(gameId: GachaGameId): Promise<GachaCoupon[]> {
        const data = await this.getData();
        const now = new Date();

        return data.coupons.filter(coupon => {
            if (coupon.gameId !== gameId || !coupon.isActive) return false;
            if (coupon.expirationDate) {
                return new Date(coupon.expirationDate) > now;
            }
            return true;
        });
    }

    /**
     * Get all coupons for a game (including inactive)
     */
    public async getAllCoupons(gameId: GachaGameId): Promise<GachaCoupon[]> {
        const data = await this.getData();
        return data.coupons.filter(c => c.gameId === gameId);
    }

    /**
     * Get coupons expiring within specified days for a game
     */
    public async getExpiringCoupons(gameId: GachaGameId, withinDays: number): Promise<GachaCoupon[]> {
        const data = await this.getData();
        const now = new Date();
        const threshold = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);

        return data.coupons.filter(coupon => {
            if (coupon.gameId !== gameId || !coupon.isActive || !coupon.expirationDate) return false;
            const expiry = new Date(coupon.expirationDate);
            return expiry > now && expiry <= threshold;
        });
    }

    /**
     * Get a specific coupon
     */
    public async getCoupon(gameId: GachaGameId, code: string): Promise<GachaCoupon | null> {
        const data = await this.getData();
        return data.coupons.find(
            c => c.code.toUpperCase() === code.toUpperCase() && c.gameId === gameId
        ) || null;
    }

    // ==================== Subscription Operations ====================

    /**
     * Get or create a user subscription record
     */
    private async getOrCreateUserSubscription(discordId: string): Promise<{ user: UserSubscription; data: GachaCouponData }> {
        const data = await this.getData();
        let user = data.subscriptions.find(s => s.discordId === discordId);

        if (!user) {
            user = {
                discordId,
                games: {},
            };
            data.subscriptions.push(user);
        }

        return { user, data };
    }

    /**
     * Subscribe a user to a game
     */
    public async subscribe(
        discordId: string,
        gameId: GachaGameId,
        gameUserId: string,
        mode: SubscriptionMode
    ): Promise<void> {
        const { user, data } = await this.getOrCreateUserSubscription(discordId);

        if (user.games[gameId]) {
            throw new Error(`You are already subscribed to ${getGameConfig(gameId).name}. Use unsubscribe first to change.`);
        }

        user.games[gameId] = {
            gameId,
            gameUserId,
            mode,
            subscribedAt: new Date().toISOString(),
            redeemedCodes: [],
        };

        await this.saveData(data);
    }

    /**
     * Unsubscribe a user from a game
     */
    public async unsubscribe(discordId: string, gameId: GachaGameId): Promise<boolean> {
        const data = await this.getData();
        const user = data.subscriptions.find(s => s.discordId === discordId);

        if (!user || !user.games[gameId]) {
            return false;
        }

        delete user.games[gameId];

        // Clean up empty user records
        if (Object.keys(user.games).length === 0) {
            const index = data.subscriptions.indexOf(user);
            data.subscriptions.splice(index, 1);
        }

        await this.saveData(data);
        return true;
    }

    /**
     * Get a user's subscription for a specific game
     */
    public async getGameSubscription(discordId: string, gameId: GachaGameId): Promise<GameSubscription | null> {
        const data = await this.getData();
        const user = data.subscriptions.find(s => s.discordId === discordId);
        return user?.games[gameId] || null;
    }

    /**
     * Get all game subscriptions for a user
     */
    public async getUserSubscriptions(discordId: string): Promise<UserSubscription | null> {
        const data = await this.getData();
        return data.subscriptions.find(s => s.discordId === discordId) || null;
    }

    /**
     * Get all subscribers for a specific game with a specific mode
     */
    public async getGameSubscribers(gameId: GachaGameId, mode?: SubscriptionMode): Promise<Array<{ discordId: string; subscription: GameSubscription }>> {
        const data = await this.getData();
        const results: Array<{ discordId: string; subscription: GameSubscription }> = [];

        for (const user of data.subscriptions) {
            const gameSub = user.games[gameId];
            if (gameSub && (!mode || gameSub.mode === mode)) {
                results.push({
                    discordId: user.discordId,
                    subscription: gameSub,
                });
            }
        }

        return results;
    }

    /**
     * Mark codes as redeemed for a user in a specific game
     */
    public async markCodesRedeemed(discordId: string, gameId: GachaGameId, codes: string[]): Promise<boolean> {
        const data = await this.getData();
        const user = data.subscriptions.find(s => s.discordId === discordId);
        const gameSub = user?.games[gameId];

        if (!gameSub) {
            return false;
        }

        const normalizedCodes = codes.map(c => c.toUpperCase());
        const newCodes = normalizedCodes.filter(c => !gameSub.redeemedCodes.includes(c));
        gameSub.redeemedCodes.push(...newCodes);

        await this.saveData(data);
        return true;
    }

    /**
     * Update last notified timestamp for a user's game subscription
     */
    public async updateLastNotified(discordId: string, gameId: GachaGameId): Promise<void> {
        const data = await this.getData();
        const user = data.subscriptions.find(s => s.discordId === discordId);
        const gameSub = user?.games[gameId];

        if (gameSub) {
            gameSub.lastNotified = new Date().toISOString();
            await this.saveData(data);
        }
    }

    /**
     * Get unredeemed codes for a user in a specific game
     */
    public async getUnredeemedCodes(discordId: string, gameId: GachaGameId): Promise<GachaCoupon[]> {
        const activeCoupons = await this.getActiveCoupons(gameId);
        const subscription = await this.getGameSubscription(discordId, gameId);

        if (!subscription) {
            return activeCoupons;
        }

        return activeCoupons.filter(c => !subscription.redeemedCodes.includes(c.code.toUpperCase()));
    }

    /**
     * Get subscriber statistics for a game
     */
    public async getGameStats(gameId: GachaGameId): Promise<{ total: number; autoRedeem: number; notifyOnly: number }> {
        const subscribers = await this.getGameSubscribers(gameId);
        return {
            total: subscribers.length,
            autoRedeem: subscribers.filter(s => s.subscription.mode === 'auto-redeem').length,
            notifyOnly: subscribers.filter(s => s.subscription.mode === 'notification-only').length,
        };
    }
}

/**
 * Get the singleton instance of GachaDataService
 */
export const getGachaDataService = (): GachaDataService => GachaDataService.getInstance();
