import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, S3_BUCKET } from '../utils/cdn/config.js';
import {
    NotificationType,
    NotificationUserSubscription,
    NotificationSubscriptionData,
} from '../utils/interfaces/NotificationSubscription.interface.js';
import { NOTIFICATION_CONFIG } from '../utils/data/notificationConfig.js';
import { logger } from '../utils/logger.js';

const isDevelopment = process.env.NODE_ENV === 'development';
const DATA_KEY = isDevelopment
    ? `${NOTIFICATION_CONFIG.S3_DATA_PATH}/dev-subscriptions.json`
    : `${NOTIFICATION_CONFIG.S3_DATA_PATH}/subscriptions.json`;
const CURRENT_SCHEMA_VERSION = 1;

/**
 * S3-backed data service for notification subscriptions.
 * Follows the same singleton + cache pattern as GachaDataService.
 */
export class NotificationSubscriptionDataService {
    private static instance: NotificationSubscriptionDataService;
    private cache: NotificationSubscriptionData | null = null;
    private cacheExpiry: number = 0;
    private readonly CACHE_TTL = NOTIFICATION_CONFIG.CACHE_TTL;

    private constructor() {}

    public static getInstance(): NotificationSubscriptionDataService {
        if (!NotificationSubscriptionDataService.instance) {
            NotificationSubscriptionDataService.instance = new NotificationSubscriptionDataService();
        }
        return NotificationSubscriptionDataService.instance;
    }

    /**
     * Fetch data from S3 with caching
     */
    public async getData(): Promise<NotificationSubscriptionData> {
        if (this.cache && Date.now() < this.cacheExpiry) {
            return this.cache;
        }

        try {
            const response = await s3Client.send(new GetObjectCommand({
                Bucket: S3_BUCKET,
                Key: DATA_KEY,
            }));

            const body = await response.Body?.transformToString();
            if (!body) {
                return this.getDefaultData();
            }

            this.cache = JSON.parse(body) as NotificationSubscriptionData;
            this.cacheExpiry = Date.now() + this.CACHE_TTL;
            return this.cache;
        } catch (error: any) {
            if (error.name === 'NoSuchKey' || error.Code === 'NoSuchKey') {
                logger.warn`Notification subscription data not found at ${DATA_KEY}, creating default...`;
                const defaultData = this.getDefaultData();
                await this.saveData(defaultData);
                return defaultData;
            }
            logger.error`Error fetching notification subscription data: ${error}`;
            throw error;
        }
    }

    /**
     * Save data to S3 and update cache
     */
    public async saveData(data: NotificationSubscriptionData): Promise<void> {
        data.lastUpdated = new Date().toISOString();

        await s3Client.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: DATA_KEY,
            Body: JSON.stringify(data, null, 2),
            ContentType: 'application/json',
        }));

        this.cache = data;
        this.cacheExpiry = Date.now() + this.CACHE_TTL;
    }

    /**
     * Get all subscribers for a notification type
     */
    public async getSubscribers(notificationType: NotificationType): Promise<NotificationUserSubscription[]> {
        const data = await this.getData();
        return data.subscriptions[notificationType] || [];
    }

    /**
     * Add a subscription. Returns false if already subscribed.
     */
    public async addSubscription(
        discordId: string,
        guildId: string,
        notificationType: NotificationType
    ): Promise<boolean> {
        const data = await this.getData();

        if (!data.subscriptions[notificationType]) {
            data.subscriptions[notificationType] = [];
        }

        const existing = data.subscriptions[notificationType].find(
            sub => sub.discordId === discordId
        );
        if (existing) {
            return false;
        }

        data.subscriptions[notificationType].push({
            discordId,
            guildId,
            notificationType,
            subscribedAt: new Date().toISOString(),
        });

        await this.saveData(data);
        return true;
    }

    /**
     * Remove a subscription. Returns false if not found.
     */
    public async removeSubscription(
        discordId: string,
        notificationType: NotificationType
    ): Promise<boolean> {
        const data = await this.getData();

        const subs = data.subscriptions[notificationType];
        if (!subs) return false;

        const index = subs.findIndex(sub => sub.discordId === discordId);
        if (index === -1) return false;

        subs.splice(index, 1);
        await this.saveData(data);
        return true;
    }

    /**
     * Check if a user is subscribed to a notification type
     */
    public async isSubscribed(
        discordId: string,
        notificationType: NotificationType
    ): Promise<boolean> {
        const subs = await this.getSubscribers(notificationType);
        return subs.some(sub => sub.discordId === discordId);
    }

    /**
     * Mark a user's DM as disabled for a notification type
     */
    public async markDMDisabled(
        discordId: string,
        notificationType: NotificationType
    ): Promise<void> {
        const data = await this.getData();
        const subs = data.subscriptions[notificationType];
        if (!subs) return;

        const sub = subs.find(s => s.discordId === discordId);
        if (sub) {
            sub.dmDisabled = true;
            sub.dmDisabledAt = new Date().toISOString();
            await this.saveData(data);
        }
    }

    /**
     * Clear DM disabled status for a user
     */
    public async clearDMDisabled(
        discordId: string,
        notificationType: NotificationType
    ): Promise<void> {
        const data = await this.getData();
        const subs = data.subscriptions[notificationType];
        if (!subs) return;

        const sub = subs.find(s => s.discordId === discordId);
        if (sub && sub.dmDisabled) {
            sub.dmDisabled = undefined;
            sub.dmDisabledAt = undefined;
            await this.saveData(data);
        }
    }

    /**
     * Get all subscriptions for a specific user
     */
    public async getSubscriptionsForUser(discordId: string): Promise<NotificationUserSubscription[]> {
        const data = await this.getData();
        const results: NotificationUserSubscription[] = [];

        for (const subs of Object.values(data.subscriptions)) {
            const userSub = subs.find(s => s.discordId === discordId);
            if (userSub) {
                results.push(userSub);
            }
        }

        return results;
    }

    /**
     * Invalidate cache (useful for testing)
     */
    public invalidateCache(): void {
        this.cache = null;
        this.cacheExpiry = 0;
    }

    private getDefaultData(): NotificationSubscriptionData {
        return {
            subscriptions: {},
            lastUpdated: new Date().toISOString(),
            schemaVersion: CURRENT_SCHEMA_VERSION,
        };
    }
}

export const getNotificationSubscriptionDataService = (): NotificationSubscriptionDataService =>
    NotificationSubscriptionDataService.getInstance();
