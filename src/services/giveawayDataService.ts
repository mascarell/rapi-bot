import { GetObjectCommand, PutObjectCommand, CopyObjectCommand, PutObjectTaggingCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_BUCKET } from "../utils/cdn/config";
import {
    GiveawayData,
    Giveaway,
    GiveawayEntry,
    GiveawayWinner,
    UserGiveawayStats,
    GiveawayStatus
} from "../utils/interfaces/Giveaway.interface";
import { GIVEAWAY_CONFIG } from "../utils/data/giveawayConfig";
import { randomUUID } from "crypto";

const isDevelopment = process.env.NODE_ENV === 'development';
const DATA_KEY = isDevelopment
    ? `${GIVEAWAY_CONFIG.DATA_PATH}/dev-giveaways.json`
    : `${GIVEAWAY_CONFIG.DATA_PATH}/giveaways.json`;
const CURRENT_SCHEMA_VERSION = 1;

/**
 * Service for managing giveaway data in S3
 * Follows singleton pattern with caching for optimal performance
 */
export class GiveawayDataService {
    private static instance: GiveawayDataService;
    private cache: GiveawayData | null = null;
    private cacheExpiry: number = 0;
    private readonly CACHE_TTL = GIVEAWAY_CONFIG.CACHE_TTL;

    private constructor() {}

    public static getInstance(): GiveawayDataService {
        if (!GiveawayDataService.instance) {
            GiveawayDataService.instance = new GiveawayDataService();
        }
        return GiveawayDataService.instance;
    }

    /**
     * Fetch data from S3 with caching
     */
    public async getData(): Promise<GiveawayData> {
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

            this.cache = JSON.parse(bodyContents) as GiveawayData;
            this.cacheExpiry = Date.now() + this.CACHE_TTL;
            return this.cache;
        } catch (error: any) {
            if (error.name === 'NoSuchKey' || error.Code === 'NoSuchKey') {
                console.log(`Giveaway data file not found at ${DATA_KEY}, creating default...`);
                const defaultData = this.getDefaultData();
                await this.saveData(defaultData);
                return defaultData;
            }
            console.error('Error fetching giveaway data:', error);
            throw error;
        }
    }

    /**
     * Save data to S3 and update cache
     * Creates a tagged backup before overwriting
     */
    public async saveData(data: GiveawayData): Promise<void> {
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
        console.log(`Giveaway data saved to S3 (${DATA_KEY})`);
    }

    /**
     * Create a tagged backup of current data before saving
     * Uses S3 object tagging for metadata (environment, type, timestamp)
     */
    private async backupBeforeSave(): Promise<void> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupKey = `${GIVEAWAY_CONFIG.BACKUP_PATH}/${timestamp}.json`;

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

            console.log(`Giveaway data backup created: ${backupKey}`);
        } catch (error: any) {
            // Don't fail save if backup fails (file might not exist yet on first save)
            if (error.name !== 'NoSuchKey' && error.Code !== 'NoSuchKey') {
                console.error('Giveaway data backup failed:', error.message);
            }
        }
    }

    private getDefaultData(): GiveawayData {
        return {
            giveaways: [],
            winners: [],
            userStats: [],
            lastUpdated: new Date().toISOString(),
            schemaVersion: CURRENT_SCHEMA_VERSION,
        };
    }

    public invalidateCache(): void {
        this.cache = null;
        this.cacheExpiry = 0;
    }

    // ==================== Giveaway Operations ====================

    /**
     * Create a new giveaway
     */
    public async createGiveaway(giveaway: Omit<Giveaway, 'id' | 'createdAt'>): Promise<Giveaway> {
        const data = await this.getData();

        const newGiveaway: Giveaway = {
            ...giveaway,
            id: randomUUID(),
            createdAt: new Date().toISOString(),
        };

        data.giveaways.push(newGiveaway);
        await this.saveData(data);

        return newGiveaway;
    }

    /**
     * Get a specific giveaway by ID
     */
    public async getGiveaway(id: string): Promise<Giveaway | null> {
        const data = await this.getData();
        return data.giveaways.find(g => g.id === id) || null;
    }

    /**
     * Get all active giveaways for a guild
     */
    public async getActiveGiveaways(guildId: string): Promise<Giveaway[]> {
        const data = await this.getData();
        return data.giveaways.filter(g => g.guildId === guildId && g.status === 'active');
    }

    /**
     * Get all giveaways for a guild (any status)
     */
    public async getAllGiveaways(guildId: string): Promise<Giveaway[]> {
        const data = await this.getData();
        return data.giveaways.filter(g => g.guildId === guildId);
    }

    /**
     * Update a giveaway
     */
    public async updateGiveaway(id: string, updates: Partial<Giveaway>): Promise<void> {
        const data = await this.getData();
        const giveaway = data.giveaways.find(g => g.id === id);

        if (!giveaway) {
            throw new Error(`Giveaway ${id} not found`);
        }

        Object.assign(giveaway, updates);
        await this.saveData(data);
    }

    /**
     * Get giveaways by status
     */
    public async getGiveawaysByStatus(guildId: string, status: GiveawayStatus): Promise<Giveaway[]> {
        const data = await this.getData();
        return data.giveaways.filter(g => g.guildId === guildId && g.status === status);
    }

    // ==================== Entry Operations ====================

    /**
     * Add an entry to a giveaway with atomic check for entry limits
     */
    public async addEntry(giveawayId: string, entry: GiveawayEntry): Promise<{ success: boolean; error?: string }> {
        const data = await this.getData();
        const giveaway = data.giveaways.find(g => g.id === giveawayId);

        if (!giveaway) {
            return { success: false, error: 'Giveaway not found' };
        }

        if (giveaway.status !== 'active') {
            return { success: false, error: 'Giveaway is not active' };
        }

        // Check if user already entered
        if (giveaway.entries.some(e => e.discordId === entry.discordId)) {
            return { success: false, error: 'You have already entered this giveaway' };
        }

        // Check max entries limit
        const maxEntriesCondition = giveaway.endConditions.find(c => c.type === 'entry_count');
        if (maxEntriesCondition?.maxEntries && giveaway.entries.length >= maxEntriesCondition.maxEntries) {
            return { success: false, error: 'Giveaway is full' };
        }

        // Add entry
        giveaway.entries.push(entry);
        await this.saveData(data);

        return { success: true };
    }

    /**
     * Remove an entry from a giveaway
     */
    public async removeEntry(giveawayId: string, discordId: string): Promise<boolean> {
        const data = await this.getData();
        const giveaway = data.giveaways.find(g => g.id === giveawayId);

        if (!giveaway) {
            return false;
        }

        const index = giveaway.entries.findIndex(e => e.discordId === discordId);
        if (index === -1) {
            return false;
        }

        giveaway.entries.splice(index, 1);
        await this.saveData(data);

        return true;
    }

    /**
     * Get user's current active entry (if any)
     * Enforces one-active-entry-per-user rule
     */
    public async getUserActiveEntry(discordId: string): Promise<{ giveawayId: string; giveaway: Giveaway } | null> {
        const data = await this.getData();

        for (const giveaway of data.giveaways) {
            if (giveaway.status === 'active' && giveaway.entries.some(e => e.discordId === discordId)) {
                return { giveawayId: giveaway.id, giveaway };
            }
        }

        return null;
    }

    /**
     * Check if user has entered a specific giveaway
     */
    public async hasUserEntered(giveawayId: string, discordId: string): Promise<boolean> {
        const giveaway = await this.getGiveaway(giveawayId);
        return giveaway?.entries.some(e => e.discordId === discordId) ?? false;
    }

    // ==================== Winner Operations ====================

    /**
     * Set winner for a giveaway and update status
     */
    public async setWinner(giveawayId: string, winnerId: string): Promise<void> {
        const data = await this.getData();
        const giveaway = data.giveaways.find(g => g.id === giveawayId);

        if (!giveaway) {
            throw new Error(`Giveaway ${giveawayId} not found`);
        }

        // Validate winner is an entrant
        if (!giveaway.entries.some(e => e.discordId === winnerId)) {
            throw new Error('Winner is not an entrant in this giveaway');
        }

        giveaway.winnerId = winnerId;
        giveaway.status = 'ended';
        giveaway.endedAt = new Date().toISOString();

        // Create winner record
        const winner: GiveawayWinner = {
            discordId: winnerId,
            giveawayId: giveawayId,
            wonAt: new Date().toISOString(),
            prizeName: giveaway.prizeName,
            notified: false,
        };

        data.winners.push(winner);

        // Update user stats
        let userStats = data.userStats.find(s => s.discordId === winnerId);
        if (!userStats) {
            userStats = {
                discordId: winnerId,
                totalEntered: 0,
                totalWon: 0,
                wins: [],
            };
            data.userStats.push(userStats);
        }

        userStats.totalWon++;
        userStats.wins.push({
            giveawayId: giveawayId,
            prizeName: giveaway.prizeName,
            wonAt: new Date().toISOString(),
        });

        await this.saveData(data);
    }

    /**
     * Mark winner as notified
     */
    public async markWinnerNotified(giveawayId: string): Promise<void> {
        const data = await this.getData();
        const winner = data.winners.find(w => w.giveawayId === giveawayId);

        if (winner) {
            winner.notified = true;
            winner.notifiedAt = new Date().toISOString();
            await this.saveData(data);
        }
    }

    /**
     * Get all winners for a guild
     */
    public async getGuildWinners(guildId: string, limit?: number): Promise<GiveawayWinner[]> {
        const data = await this.getData();
        const guildGiveaways = data.giveaways.filter(g => g.guildId === guildId);
        const guildGiveawayIds = new Set(guildGiveaways.map(g => g.id));

        let winners = data.winners
            .filter(w => guildGiveawayIds.has(w.giveawayId))
            .sort((a, b) => new Date(b.wonAt).getTime() - new Date(a.wonAt).getTime());

        if (limit && limit > 0) {
            winners = winners.slice(0, limit);
        }

        return winners;
    }

    // ==================== Statistics Operations ====================

    /**
     * Get user statistics
     */
    public async getUserStats(discordId: string): Promise<UserGiveawayStats> {
        const data = await this.getData();
        let userStats = data.userStats.find(s => s.discordId === discordId);

        if (!userStats) {
            userStats = {
                discordId,
                totalEntered: 0,
                totalWon: 0,
                wins: [],
            };
        }

        return userStats;
    }

    /**
     * Update user entry count statistics
     */
    public async updateUserEntryStats(discordId: string): Promise<void> {
        const data = await this.getData();
        let userStats = data.userStats.find(s => s.discordId === discordId);

        if (!userStats) {
            userStats = {
                discordId,
                totalEntered: 0,
                totalWon: 0,
                wins: [],
            };
            data.userStats.push(userStats);
        }

        userStats.totalEntered++;
        userStats.lastEnteredAt = new Date().toISOString();

        await this.saveData(data);
    }

    /**
     * Get guild-wide statistics
     */
    public async getGuildStats(guildId: string): Promise<{
        totalGiveaways: number;
        activeCount: number;
        endedCount: number;
        totalWinners: number;
        totalEntries: number;
    }> {
        const data = await this.getData();
        const guildGiveaways = data.giveaways.filter(g => g.guildId === guildId);

        const activeCount = guildGiveaways.filter(g => g.status === 'active').length;
        const endedCount = guildGiveaways.filter(g => g.status === 'ended').length;
        const totalEntries = guildGiveaways.reduce((sum, g) => sum + g.entries.length, 0);

        const guildGiveawayIds = new Set(guildGiveaways.map(g => g.id));
        const totalWinners = data.winners.filter(w => guildGiveawayIds.has(w.giveawayId)).length;

        return {
            totalGiveaways: guildGiveaways.length,
            activeCount,
            endedCount,
            totalWinners,
            totalEntries,
        };
    }

    /**
     * Get giveaways with scheduled end times that have passed
     */
    public async getExpiredScheduledGiveaways(): Promise<Giveaway[]> {
        const data = await this.getData();
        const now = new Date();

        return data.giveaways.filter(g => {
            if (g.status !== 'active') return false;

            const scheduledCondition = g.endConditions.find(c => c.type === 'scheduled');
            if (!scheduledCondition?.scheduledEndTime) return false;

            return new Date(scheduledCondition.scheduledEndTime) <= now;
        });
    }
}

/**
 * Get the singleton instance of GiveawayDataService
 */
export const getGiveawayDataService = (): GiveawayDataService => GiveawayDataService.getInstance();
