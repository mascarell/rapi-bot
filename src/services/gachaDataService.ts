import { GetObjectCommand, PutObjectCommand, CopyObjectCommand, PutObjectTaggingCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_BUCKET } from "../utils/cdn/config";
import {
    GachaCouponData,
    GachaCoupon,
    UserSubscription,
    GameSubscription,
    GachaGameId,
    SubscriptionMode,
    RedemptionHistoryEntry
} from "../utils/interfaces/GachaCoupon.interface";
import { getGameConfig } from "../utils/data/gachaGamesConfig";
import { GACHA_CONFIG } from "../utils/data/gachaConfig";

const isDevelopment = process.env.NODE_ENV === 'development';
const DATA_KEY = isDevelopment
    ? `${GACHA_CONFIG.DATA_PATH}/dev-coupons.json`
    : `${GACHA_CONFIG.DATA_PATH}/coupons.json`;
const CURRENT_SCHEMA_VERSION = 1;

/**
 * Service for managing gacha coupon data in S3
 * Supports multiple games with a unified data structure
 */
export class GachaDataService {
    private static instance: GachaDataService;
    private cache: GachaCouponData | null = null;
    private cacheExpiry: number = 0;
    private readonly CACHE_TTL = GACHA_CONFIG.CACHE_TTL;

    // Pre-computed index of active coupons by game for O(1) lookup
    private activeCouponsIndex: Map<GachaGameId, GachaCoupon[]> | null = null;

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
            this.buildActiveCouponsIndex(this.cache);
            return this.cache;
        } catch (error: any) {
            if (error.name === 'NoSuchKey' || error.Code === 'NoSuchKey') {
                console.log(`Gacha coupon data file not found at ${DATA_KEY}, creating default...`);
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
     * Creates a tagged backup before overwriting
     */
    public async saveData(data: GachaCouponData): Promise<void> {
        data.lastUpdated = new Date().toISOString();

        // Create backup before saving (don't fail if backup fails)
        await this.backupBeforeSave();

        await s3Client.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: DATA_KEY,
            Body: JSON.stringify(data, null, 2),
            ContentType: 'application/json',
        }));

        this.cache = data;
        this.cacheExpiry = Date.now() + this.CACHE_TTL;
        this.buildActiveCouponsIndex(data);
        console.log(`Gacha coupon data saved to S3 (${DATA_KEY})`);
    }

    /**
     * Create a tagged backup of current data before saving
     * Uses S3 object tagging for metadata (environment, type, timestamp)
     */
    private async backupBeforeSave(): Promise<void> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupKey = `${GACHA_CONFIG.BACKUP_PATH}/${timestamp}.json`;

        try {
            // Copy current data to backup location
            await s3Client.send(new CopyObjectCommand({
                Bucket: S3_BUCKET,
                CopySource: `${S3_BUCKET}/${DATA_KEY}`,
                Key: backupKey,
            }));

            // Tag the backup with metadata
            await s3Client.send(new PutObjectTaggingCommand({
                Bucket: S3_BUCKET,
                Key: backupKey,
                Tagging: {
                    TagSet: [
                        { Key: 'environment', Value: isDevelopment ? 'dev' : 'prod' },
                        { Key: 'type', Value: 'backup' },
                        { Key: 'created', Value: new Date().toISOString() },
                    ]
                }
            }));

            console.log(`Gacha data backup created: ${backupKey}`);
        } catch (error: any) {
            // Don't fail save if backup fails (file might not exist yet on first save)
            if (error.name !== 'NoSuchKey' && error.Code !== 'NoSuchKey') {
                console.error('Gacha data backup failed:', error.message);
            }
        }
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
        this.activeCouponsIndex = null;
    }

    /**
     * Build pre-computed index of active coupons by game
     * Provides O(1) lookup instead of O(n) filtering
     */
    private buildActiveCouponsIndex(data: GachaCouponData): void {
        this.activeCouponsIndex = new Map();
        const now = new Date();

        for (const coupon of data.coupons) {
            if (!coupon.isActive) continue;
            if (coupon.expirationDate && new Date(coupon.expirationDate) <= now) continue;

            const existing = this.activeCouponsIndex.get(coupon.gameId) || [];
            existing.push(coupon);
            this.activeCouponsIndex.set(coupon.gameId, existing);
        }
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
     * Uses pre-computed index for O(1) lookup when cache is valid
     */
    public async getActiveCoupons(gameId: GachaGameId): Promise<GachaCoupon[]> {
        await this.getData(); // Ensure cache and index are populated

        const now = new Date();

        if (this.activeCouponsIndex) {
            // Filter by expiration at read time to catch codes that expired since cache was built
            const cached = this.activeCouponsIndex.get(gameId) || [];
            const activeCoupons = cached.filter(coupon => {
                if (coupon.expirationDate && new Date(coupon.expirationDate) <= now) {
                    return false;
                }
                return true;
            });

            // Update index to remove expired codes for future calls
            if (activeCoupons.length !== cached.length) {
                this.activeCouponsIndex.set(gameId, activeCoupons);
            }

            return activeCoupons;
        }

        // Fallback to filtering if index not available
        const data = this.cache!;

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

    /**
     * Mark expired coupons as inactive
     * Returns the number of coupons that were marked inactive
     */
    public async cleanupExpiredCoupons(): Promise<{ cleaned: number; byGame: Record<string, number> }> {
        const data = await this.getData();
        const now = new Date();
        let cleaned = 0;
        const byGame: Record<string, number> = {};

        // 24-hour grace period to account for timezone differences
        // Codes are already filtered from user views in real-time via getActiveCoupons()
        // This cleanup only affects the isActive flag for tracking/history purposes
        const gracePeriodMs = 24 * 60 * 60 * 1000; // 24 hours

        for (const coupon of data.coupons) {
            if (coupon.isActive && coupon.expirationDate) {
                const expiry = new Date(coupon.expirationDate);
                // Mark inactive only after grace period has passed
                if (expiry.getTime() + gracePeriodMs <= now.getTime()) {
                    coupon.isActive = false;
                    cleaned++;
                    byGame[coupon.gameId] = (byGame[coupon.gameId] || 0) + 1;
                }
            }
        }

        if (cleaned > 0) {
            await this.saveData(data);
            console.log(`[Cleanup] Marked ${cleaned} expired coupons as inactive (after 24h grace period)`);
        }

        return { cleaned, byGame };
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
     * Check if a gameUserId is already registered by another Discord user
     */
    public async isGameUserIdTaken(
        gameId: GachaGameId,
        gameUserId: string,
        excludeDiscordId?: string
    ): Promise<boolean> {
        const data = await this.getData();
        const normalizedUserId = gameUserId.trim().toLowerCase();

        for (const user of data.subscriptions) {
            if (excludeDiscordId && user.discordId === excludeDiscordId) continue;

            const gameSub = user.games[gameId];
            if (gameSub && gameSub.gameUserId.trim().toLowerCase() === normalizedUserId) {
                return true;
            }
        }

        return false;
    }

    /**
     * Find subscription by gameUserId
     */
    public async findSubscriptionByGameUserId(
        gameId: GachaGameId,
        gameUserId: string
    ): Promise<{ discordId: string; subscription: GameSubscription } | null> {
        const data = await this.getData();
        const normalizedUserId = gameUserId.trim().toLowerCase();

        for (const user of data.subscriptions) {
            const gameSub = user.games[gameId];
            if (gameSub && gameSub.gameUserId.trim().toLowerCase() === normalizedUserId) {
                return { discordId: user.discordId, subscription: gameSub };
            }
        }

        return null;
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

        // Check if gameUserId is already taken by another user
        const isTaken = await this.isGameUserIdTaken(gameId, gameUserId, discordId);
        if (isTaken) {
            throw new Error(`This game ID is already registered by another user. If this is your account, please contact a moderator or @strip3s to resolve.`);
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
     * Remove a code from a user's redeemed codes list
     */
    public async removeRedeemedCode(discordId: string, gameId: GachaGameId, code: string): Promise<boolean> {
        const data = await this.getData();
        const user = data.subscriptions.find(s => s.discordId === discordId);
        const gameSub = user?.games[gameId];

        if (!gameSub) {
            return false;
        }

        const normalizedCode = code.toUpperCase();
        const index = gameSub.redeemedCodes.indexOf(normalizedCode);
        if (index === -1) {
            return false;
        }

        gameSub.redeemedCodes.splice(index, 1);
        await this.saveData(data);
        return true;
    }

    /**
     * Add a code to a user's ignored codes list
     */
    public async addIgnoredCode(discordId: string, gameId: GachaGameId, code: string): Promise<boolean> {
        const data = await this.getData();
        const user = data.subscriptions.find(s => s.discordId === discordId);
        const gameSub = user?.games[gameId];

        if (!gameSub) {
            return false;
        }

        const normalizedCode = code.toUpperCase();
        if (!gameSub.ignoredCodes) {
            gameSub.ignoredCodes = [];
        }

        if (!gameSub.ignoredCodes.includes(normalizedCode)) {
            gameSub.ignoredCodes.push(normalizedCode);
            await this.saveData(data);
        }

        return true;
    }

    /**
     * Remove a code from a user's ignored codes list
     */
    public async removeIgnoredCode(discordId: string, gameId: GachaGameId, code: string): Promise<boolean> {
        const data = await this.getData();
        const user = data.subscriptions.find(s => s.discordId === discordId);
        const gameSub = user?.games[gameId];

        if (!gameSub || !gameSub.ignoredCodes) {
            return false;
        }

        const normalizedCode = code.toUpperCase();
        const index = gameSub.ignoredCodes.indexOf(normalizedCode);
        if (index === -1) {
            return false;
        }

        gameSub.ignoredCodes.splice(index, 1);
        await this.saveData(data);
        return true;
    }

    /**
     * Check if a code is ignored by a user
     */
    public async isCodeIgnored(discordId: string, gameId: GachaGameId, code: string): Promise<boolean> {
        const gameSub = await this.getGameSubscription(discordId, gameId);
        if (!gameSub || !gameSub.ignoredCodes) {
            return false;
        }
        return gameSub.ignoredCodes.includes(code.toUpperCase());
    }

    /**
     * Batch mark codes as redeemed for multiple users
     * Reduces S3 operations from N to 1 for batch processing
     */
    public async batchMarkCodesRedeemed(
        updates: Array<{ discordId: string; gameId: GachaGameId; codes: string[] }>
    ): Promise<{ success: number; failed: number }> {
        if (updates.length === 0) {
            return { success: 0, failed: 0 };
        }

        const data = await this.getData();
        let success = 0;
        let failed = 0;

        for (const update of updates) {
            const user = data.subscriptions.find(s => s.discordId === update.discordId);
            const gameSub = user?.games[update.gameId];

            if (!gameSub) {
                failed++;
                continue;
            }

            const normalizedCodes = update.codes.map(c => c.toUpperCase());
            const newCodes = normalizedCodes.filter(c => !gameSub.redeemedCodes.includes(c));
            gameSub.redeemedCodes.push(...newCodes);
            success++;
        }

        // Single S3 write for all updates
        if (success > 0) {
            await this.saveData(data);
        }

        return { success, failed };
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

    /**
     * Get full subscriber context in a single S3 read
     * Reduces S3 operations from 4 to 1 for status checks
     */
    public async getSubscriberContext(discordId: string, gameId: GachaGameId): Promise<{
        subscription: GameSubscription | null;
        activeCoupons: GachaCoupon[];
        unredeemed: GachaCoupon[];
    }> {
        const data = await this.getData();

        // Get user subscription
        const user = data.subscriptions.find(s => s.discordId === discordId);
        const subscription = user?.games[gameId] || null;

        // Get active coupons from index
        const activeCoupons = this.activeCouponsIndex?.get(gameId) || [];

        // Calculate unredeemed codes
        const unredeemed = subscription
            ? activeCoupons.filter(c => !subscription.redeemedCodes.includes(c.code.toUpperCase()))
            : activeCoupons;

        return { subscription, activeCoupons, unredeemed };
    }

    /**
     * Update notification preferences for a user's game subscription
     */
    public async updateNotificationPreferences(
        discordId: string,
        gameId: GachaGameId,
        preferences: Partial<GameSubscription['preferences']>
    ): Promise<void> {
        const data = await this.getData();
        const user = data.subscriptions.find(s => s.discordId === discordId);
        const gameSub = user?.games[gameId];

        if (!gameSub) {
            throw new Error('User is not subscribed to this game.');
        }

        // Merge with existing preferences
        gameSub.preferences = {
            ...gameSub.preferences,
            ...preferences,
        };

        await this.saveData(data);
    }

    /**
     * Get notification preferences for a user's game subscription
     */
    public async getNotificationPreferences(
        discordId: string,
        gameId: GachaGameId
    ): Promise<GameSubscription['preferences'] | null> {
        const subscription = await this.getGameSubscription(discordId, gameId);
        if (!subscription) {
            return null;
        }

        // Return defaults merged with user preferences
        return {
            expirationWarnings: true,
            weeklyDigest: true,
            newCodeAlerts: true,
            ...subscription.preferences,
        };
    }

    // ==================== Admin Operations ====================

    /**
     * Admin: Force unsubscribe a user from a game
     */
    public async adminUnsubscribe(discordId: string, gameId: GachaGameId): Promise<boolean> {
        return this.unsubscribe(discordId, gameId);
    }

    /**
     * Admin: Update a user's gameUserId
     */
    public async adminUpdateGameUserId(
        discordId: string,
        gameId: GachaGameId,
        newGameUserId: string
    ): Promise<void> {
        const data = await this.getData();
        const user = data.subscriptions.find(s => s.discordId === discordId);
        const gameSub = user?.games[gameId];

        if (!gameSub) {
            throw new Error('User is not subscribed to this game.');
        }

        // Check if new gameUserId is already taken
        const isTaken = await this.isGameUserIdTaken(gameId, newGameUserId, discordId);
        if (isTaken) {
            throw new Error('This game ID is already registered by another user.');
        }

        gameSub.gameUserId = newGameUserId.trim();
        await this.saveData(data);
    }

    /**
     * Admin: Reset a user's redeemed codes list
     */
    public async adminResetRedeemedCodes(discordId: string, gameId: GachaGameId): Promise<void> {
        const data = await this.getData();
        const user = data.subscriptions.find(s => s.discordId === discordId);
        const gameSub = user?.games[gameId];

        if (!gameSub) {
            throw new Error('User is not subscribed to this game.');
        }

        gameSub.redeemedCodes = [];
        await this.saveData(data);
    }

    // ==================== Subscription Mode Operations ====================

    /**
     * Switch a user's subscription mode (auto-redeem <-> notification-only)
     * Without requiring unsubscribe/resubscribe
     */
    public async switchSubscriptionMode(
        discordId: string,
        gameId: GachaGameId,
        newMode: SubscriptionMode
    ): Promise<void> {
        const data = await this.getData();
        const user = data.subscriptions.find(s => s.discordId === discordId);
        const gameSub = user?.games[gameId];

        if (!gameSub) {
            throw new Error('User is not subscribed to this game.');
        }

        if (gameSub.mode === newMode) {
            throw new Error(`Already in ${newMode} mode.`);
        }

        gameSub.mode = newMode;
        await this.saveData(data);
    }

    // ==================== DM Failure Tracking Operations ====================

    /**
     * Mark a user's DM as disabled (failed to send)
     */
    public async markDMDisabled(discordId: string, gameId: GachaGameId): Promise<void> {
        const data = await this.getData();
        const user = data.subscriptions.find(s => s.discordId === discordId);
        const gameSub = user?.games[gameId];

        if (!gameSub) return;

        // Only update if not already marked
        if (!gameSub.dmDisabled) {
            gameSub.dmDisabled = true;
            gameSub.dmDisabledAt = new Date().toISOString();
            await this.saveData(data);
        }
    }

    /**
     * Clear DM disabled status (e.g., when user successfully receives a DM)
     */
    public async clearDMDisabled(discordId: string, gameId: GachaGameId): Promise<void> {
        const data = await this.getData();
        const user = data.subscriptions.find(s => s.discordId === discordId);
        const gameSub = user?.games[gameId];

        if (!gameSub || !gameSub.dmDisabled) return;

        gameSub.dmDisabled = false;
        delete gameSub.dmDisabledAt;
        await this.saveData(data);
    }

    /**
     * Check if a user has DMs disabled
     */
    public async isDMDisabled(discordId: string, gameId: GachaGameId): Promise<boolean> {
        const subscription = await this.getGameSubscription(discordId, gameId);
        return subscription?.dmDisabled ?? false;
    }

    /**
     * Get all subscribers with DMs disabled for a game
     */
    public async getSubscribersWithDMDisabled(gameId: GachaGameId): Promise<string[]> {
        const data = await this.getData();
        const disabled: string[] = [];

        for (const user of data.subscriptions) {
            const gameSub = user.games[gameId];
            if (gameSub?.dmDisabled) {
                disabled.push(user.discordId);
            }
        }

        return disabled;
    }

    // ==================== Batch Notification Preferences ====================

    /**
     * Get all notification preferences for subscribers of a game in a single call
     * Returns a map of discordId -> preferences
     * More efficient than calling getNotificationPreferences for each subscriber
     */
    public async getBatchNotificationPreferences(
        gameId: GachaGameId
    ): Promise<Map<string, GameSubscription['preferences']>> {
        const data = await this.getData();
        const prefsMap = new Map<string, GameSubscription['preferences']>();

        for (const user of data.subscriptions) {
            const gameSub = user.games[gameId];
            if (gameSub) {
                // Return defaults merged with user preferences
                prefsMap.set(user.discordId, {
                    expirationWarnings: true,
                    weeklyDigest: true,
                    newCodeAlerts: true,
                    ...gameSub.preferences,
                });
            }
        }

        return prefsMap;
    }

    /**
     * Get subscribers with their preferences and DM status in one call
     * Optimized for batch notification processing
     */
    public async getSubscribersForNotification(
        gameId: GachaGameId,
        mode?: SubscriptionMode
    ): Promise<Array<{
        discordId: string;
        subscription: GameSubscription;
        preferences: GameSubscription['preferences'];
        dmDisabled: boolean;
    }>> {
        const data = await this.getData();
        const results: Array<{
            discordId: string;
            subscription: GameSubscription;
            preferences: GameSubscription['preferences'];
            dmDisabled: boolean;
        }> = [];

        for (const user of data.subscriptions) {
            const gameSub = user.games[gameId];
            if (gameSub && (!mode || gameSub.mode === mode)) {
                results.push({
                    discordId: user.discordId,
                    subscription: gameSub,
                    preferences: {
                        expirationWarnings: true,
                        weeklyDigest: true,
                        newCodeAlerts: true,
                        ...gameSub.preferences,
                    },
                    dmDisabled: gameSub.dmDisabled ?? false,
                });
            }
        }

        return results;
    }

    // ==================== Redemption History Operations ====================

    /**
     * Add a redemption history entry
     * NoSQL: This would be a separate table with PK: discordId#gameId, SK: timestamp
     */
    public async addRedemptionHistory(entry: RedemptionHistoryEntry): Promise<void> {
        const data = await this.getData();

        // Initialize history array if needed
        if (!data.redemptionHistory) {
            data.redemptionHistory = [];
        }

        data.redemptionHistory.push(entry);
        await this.saveData(data);
    }

    /**
     * Add multiple redemption history entries in a batch
     * More efficient than individual calls
     */
    public async addBatchRedemptionHistory(entries: RedemptionHistoryEntry[]): Promise<void> {
        if (entries.length === 0) return;

        const data = await this.getData();

        if (!data.redemptionHistory) {
            data.redemptionHistory = [];
        }

        data.redemptionHistory.push(...entries);
        await this.saveData(data);
    }

    /**
     * Get redemption history for a user in a game
     * NoSQL: Query by PK: discordId#gameId, sorted by SK: timestamp
     */
    public async getRedemptionHistory(
        discordId: string,
        gameId: GachaGameId,
        options: { limit?: number; since?: Date } = {}
    ): Promise<RedemptionHistoryEntry[]> {
        const data = await this.getData();
        const history = data.redemptionHistory || [];

        let filtered = history.filter(h =>
            h.discordId === discordId && h.gameId === gameId
        );

        // Filter by date if specified
        if (options.since) {
            const sinceTime = options.since.getTime();
            filtered = filtered.filter(h => new Date(h.timestamp).getTime() >= sinceTime);
        }

        // Sort by timestamp descending (most recent first)
        filtered.sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        // Apply limit
        if (options.limit && options.limit > 0) {
            filtered = filtered.slice(0, options.limit);
        }

        return filtered;
    }

    /**
     * Get recent redemption history for a code (across all users)
     * Useful for debugging and analytics
     */
    public async getCodeRedemptionHistory(
        gameId: GachaGameId,
        code: string,
        limit: number = 50
    ): Promise<RedemptionHistoryEntry[]> {
        const data = await this.getData();
        const history = data.redemptionHistory || [];

        const filtered = history
            .filter(h => h.gameId === gameId && h.code.toUpperCase() === code.toUpperCase())
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, limit);

        return filtered;
    }

    /**
     * Cleanup old redemption history entries (older than specified days)
     * Prevents unbounded growth of history data
     */
    public async cleanupOldRedemptionHistory(olderThanDays: number = 90): Promise<number> {
        const data = await this.getData();
        if (!data.redemptionHistory || data.redemptionHistory.length === 0) {
            return 0;
        }

        const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
        const originalLength = data.redemptionHistory.length;

        data.redemptionHistory = data.redemptionHistory.filter(h =>
            new Date(h.timestamp).getTime() >= cutoffTime
        );

        const removed = originalLength - data.redemptionHistory.length;
        if (removed > 0) {
            await this.saveData(data);
            console.log(`[Cleanup] Removed ${removed} redemption history entries older than ${olderThanDays} days`);
        }

        return removed;
    }

    // ==================== Force Re-run Operations ====================

    /**
     * Check if a user can request a force re-run (based on cooldown)
     */
    public async canForceRerun(discordId: string, gameId: GachaGameId): Promise<{ allowed: boolean; cooldownRemaining?: number }> {
        const subscription = await this.getGameSubscription(discordId, gameId);
        if (!subscription) {
            return { allowed: false };
        }

        if (!subscription.lastForceRerun) {
            return { allowed: true };
        }

        const lastRerun = new Date(subscription.lastForceRerun).getTime();
        const now = Date.now();
        const cooldownMs = GACHA_CONFIG.FORCE_RERUN_COOLDOWN;
        const timeSinceLastRerun = now - lastRerun;

        if (timeSinceLastRerun >= cooldownMs) {
            return { allowed: true };
        }

        return {
            allowed: false,
            cooldownRemaining: cooldownMs - timeSinceLastRerun,
        };
    }

    /**
     * Record a force re-run request and reset redeemed codes
     */
    public async recordForceRerun(discordId: string, gameId: GachaGameId): Promise<void> {
        const data = await this.getData();
        const user = data.subscriptions.find(s => s.discordId === discordId);
        const gameSub = user?.games[gameId];

        if (!gameSub) {
            throw new Error('User is not subscribed to this game.');
        }

        gameSub.lastForceRerun = new Date().toISOString();
        gameSub.redeemedCodes = [];
        await this.saveData(data);
    }

    /**
     * Get the next available force re-run time for display purposes
     */
    public async getNextForceRerunTime(discordId: string, gameId: GachaGameId): Promise<Date | null> {
        const subscription = await this.getGameSubscription(discordId, gameId);
        if (!subscription || !subscription.lastForceRerun) {
            return null;
        }

        const lastRerun = new Date(subscription.lastForceRerun).getTime();
        return new Date(lastRerun + GACHA_CONFIG.FORCE_RERUN_COOLDOWN);
    }

    // ==================== Analytics Operations ====================

    /**
     * Get comprehensive analytics for a game
     */
    public async getGameAnalytics(gameId: GachaGameId): Promise<{
        subscribers: { total: number; autoRedeem: number; notifyOnly: number };
        coupons: { total: number; active: number; expired: number; noExpiry: number };
        redemptions: { total: number; uniqueUsers: number; avgPerUser: number };
        topCodes: Array<{ code: string; redemptions: number; rewards: string }>;
    }> {
        const data = await this.getData();

        // Subscriber stats
        const gameSubscribers = data.subscriptions.filter(s => s.games[gameId]);
        const autoRedeemCount = gameSubscribers.filter(s => s.games[gameId]?.mode === 'auto-redeem').length;
        const notifyOnlyCount = gameSubscribers.filter(s => s.games[gameId]?.mode === 'notification-only').length;

        // Coupon stats
        const gameCoupons = data.coupons.filter(c => c.gameId === gameId);
        const now = new Date();
        const activeCoupons = gameCoupons.filter(c => c.isActive && (!c.expirationDate || new Date(c.expirationDate) > now));
        const expiredCoupons = gameCoupons.filter(c => !c.isActive || (c.expirationDate && new Date(c.expirationDate) <= now));
        const noExpiryCoupons = gameCoupons.filter(c => c.isActive && !c.expirationDate);

        // Redemption stats
        let totalRedemptions = 0;
        const usersWithRedemptions = gameSubscribers.filter(s => {
            const sub = s.games[gameId];
            if (sub && sub.redeemedCodes.length > 0) {
                totalRedemptions += sub.redeemedCodes.length;
                return true;
            }
            return false;
        });

        // Top codes by redemption count (calculated from all subscribers' redeemed codes)
        const codeRedemptionCounts = new Map<string, number>();
        for (const subscriber of gameSubscribers) {
            const sub = subscriber.games[gameId];
            if (sub) {
                for (const code of sub.redeemedCodes) {
                    codeRedemptionCounts.set(code, (codeRedemptionCounts.get(code) || 0) + 1);
                }
            }
        }

        const topCodes = Array.from(codeRedemptionCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([code, redemptions]) => {
                const coupon = gameCoupons.find(c => c.code.toUpperCase() === code.toUpperCase());
                return {
                    code,
                    redemptions,
                    rewards: coupon?.rewards || 'Unknown',
                };
            });

        return {
            subscribers: {
                total: gameSubscribers.length,
                autoRedeem: autoRedeemCount,
                notifyOnly: notifyOnlyCount,
            },
            coupons: {
                total: gameCoupons.length,
                active: activeCoupons.length,
                expired: expiredCoupons.length,
                noExpiry: noExpiryCoupons.length,
            },
            redemptions: {
                total: totalRedemptions,
                uniqueUsers: usersWithRedemptions.length,
                avgPerUser: usersWithRedemptions.length > 0 ? Math.round(totalRedemptions / usersWithRedemptions.length * 10) / 10 : 0,
            },
            topCodes,
        };
    }

    /**
     * Get system-wide analytics across all games
     */
    public async getSystemAnalytics(): Promise<{
        totalSubscribers: number;
        totalCoupons: number;
        totalRedemptions: number;
        byGame: Record<string, { subscribers: number; coupons: number; redemptions: number }>;
    }> {
        const data = await this.getData();

        const byGame: Record<string, { subscribers: number; coupons: number; redemptions: number }> = {};
        let totalSubscribers = 0;
        let totalCoupons = data.coupons.length;
        let totalRedemptions = 0;

        // Count by game
        const gameIds = new Set<string>();
        for (const coupon of data.coupons) {
            gameIds.add(coupon.gameId);
        }
        for (const subscription of data.subscriptions) {
            for (const gameId of Object.keys(subscription.games)) {
                gameIds.add(gameId);
            }
        }

        for (const gameId of gameIds) {
            const gameSubscribers = data.subscriptions.filter(s => s.games[gameId as GachaGameId]);
            const gameCoupons = data.coupons.filter(c => c.gameId === gameId);

            let gameRedemptions = 0;
            for (const subscriber of gameSubscribers) {
                const sub = subscriber.games[gameId as GachaGameId];
                if (sub) {
                    gameRedemptions += sub.redeemedCodes.length;
                }
            }

            byGame[gameId] = {
                subscribers: gameSubscribers.length,
                coupons: gameCoupons.length,
                redemptions: gameRedemptions,
            };

            totalSubscribers += gameSubscribers.length;
            totalRedemptions += gameRedemptions;
        }

        return {
            totalSubscribers,
            totalCoupons,
            totalRedemptions,
            byGame,
        };
    }

    /**
     * Increment redemption count on a coupon (for tracking)
     */
    public async incrementCouponRedemptionCount(gameId: GachaGameId, code: string): Promise<void> {
        const data = await this.getData();
        const coupon = data.coupons.find(
            c => c.code.toUpperCase() === code.toUpperCase() && c.gameId === gameId
        );

        if (coupon) {
            coupon.redemptionCount = (coupon.redemptionCount || 0) + 1;
            await this.saveData(data);
        }
    }
}

/**
 * Get the singleton instance of GachaDataService
 */
export const getGachaDataService = (): GachaDataService => GachaDataService.getInstance();
