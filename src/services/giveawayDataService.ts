import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_BUCKET } from "../utils/cdn/config.js";
import {
    GiveawayData,
    Giveaway,
    GiveawayEntry,
    GiveawayWinner,
    GiveawayStatus,
    UserGiveawayStats,
} from "../utils/interfaces/Giveaway.interface.js";
import { GIVEAWAY_CONFIG } from "../utils/data/giveawayConfig.js";
import { logger } from "../utils/logger.js";
import { randomUUID } from "crypto";

const isDevelopment = process.env.NODE_ENV === 'development';
const DATA_KEY = isDevelopment
    ? `${GIVEAWAY_CONFIG.DATA_PATH}/dev-giveaways.json`
    : `${GIVEAWAY_CONFIG.DATA_PATH}/giveaways.json`;
const CURRENT_SCHEMA_VERSION = 1;

export class GiveawayDataService {
    private static instance: GiveawayDataService;
    private cache: GiveawayData | null = null;
    private cacheExpiry: number = 0;

    private constructor() {}

    public static getInstance(): GiveawayDataService {
        if (!GiveawayDataService.instance) {
            GiveawayDataService.instance = new GiveawayDataService();
        }
        return GiveawayDataService.instance;
    }

    public async getData(): Promise<GiveawayData> {
        if (this.cache && Date.now() < this.cacheExpiry) {
            return this.cache;
        }

        try {
            const response = await s3Client.send(new GetObjectCommand({
                Bucket: S3_BUCKET,
                Key: DATA_KEY,
            }));

            const body = await response.Body?.transformToString();
            if (!body) return this.getDefaultData();

            this.cache = JSON.parse(body) as GiveawayData;
            this.cacheExpiry = Date.now() + GIVEAWAY_CONFIG.CACHE_TTL;
            return this.cache;
        } catch (error: any) {
            if (error.name === 'NoSuchKey' || error.Code === 'NoSuchKey') {
                logger.debug`[Giveaway] Data file not found, creating default`;
                const defaultData = this.getDefaultData();
                await this.saveData(defaultData);
                return defaultData;
            }
            throw error;
        }
    }

    public async saveData(data: GiveawayData): Promise<void> {
        data.lastUpdated = new Date().toISOString();

        await s3Client.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: DATA_KEY,
            Body: JSON.stringify(data, null, 2),
            ContentType: 'application/json',
        }));

        this.cache = data;
        this.cacheExpiry = Date.now() + GIVEAWAY_CONFIG.CACHE_TTL;
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

    public async getGiveaway(id: string): Promise<Giveaway | null> {
        const data = await this.getData();
        return data.giveaways.find(g => g.id === id) || null;
    }

    public async getActiveGiveaways(guildId: string): Promise<Giveaway[]> {
        const data = await this.getData();
        return data.giveaways.filter(g => g.guildId === guildId && g.status === 'active');
    }

    public async getAllGiveaways(guildId: string): Promise<Giveaway[]> {
        const data = await this.getData();
        return data.giveaways.filter(g => g.guildId === guildId);
    }

    public async updateGiveaway(id: string, updates: Partial<Giveaway>): Promise<void> {
        const data = await this.getData();
        const giveaway = data.giveaways.find(g => g.id === id);
        if (!giveaway) throw new Error(`Giveaway ${id} not found`);
        Object.assign(giveaway, updates);
        await this.saveData(data);
    }

    // ==================== Entry Operations ====================

    public async enterGiveaway(
        giveawayId: string,
        entry: GiveawayEntry
    ): Promise<{ success: boolean; error?: string; previousGiveaway?: string }> {
        const data = await this.getData();
        const giveaway = data.giveaways.find(g => g.id === giveawayId);

        if (!giveaway) return { success: false, error: 'Giveaway not found' };
        if (giveaway.status !== 'active') return { success: false, error: 'Giveaway is not active' };
        if (giveaway.entries.some(e => e.discordId === entry.discordId)) {
            return { success: false, error: 'You have already entered this giveaway' };
        }

        const maxEntriesCondition = giveaway.endConditions.find(c => c.type === 'entry_count');
        if (maxEntriesCondition?.maxEntries && giveaway.entries.length >= maxEntriesCondition.maxEntries) {
            return { success: false, error: 'Giveaway is full' };
        }

        // Auto-remove from other active giveaway (one-entry-at-a-time rule)
        let previousGiveaway: string | undefined;
        for (const g of data.giveaways) {
            if (g.status === 'active' && g.id !== giveawayId) {
                const idx = g.entries.findIndex(e => e.discordId === entry.discordId);
                if (idx !== -1) {
                    previousGiveaway = g.title;
                    g.entries.splice(idx, 1);
                    break;
                }
            }
        }

        // Add entry and update stats in a single save
        giveaway.entries.push(entry);

        let userStats = data.userStats.find(s => s.discordId === entry.discordId);
        if (!userStats) {
            userStats = { discordId: entry.discordId, totalEntered: 0, totalWon: 0, wins: [] };
            data.userStats.push(userStats);
        }
        userStats.totalEntered++;
        userStats.lastEnteredAt = new Date().toISOString();

        await this.saveData(data);
        return { success: true, previousGiveaway };
    }

    public async removeEntry(giveawayId: string, discordId: string): Promise<boolean> {
        const data = await this.getData();
        const giveaway = data.giveaways.find(g => g.id === giveawayId);
        if (!giveaway) return false;

        const index = giveaway.entries.findIndex(e => e.discordId === discordId);
        if (index === -1) return false;

        giveaway.entries.splice(index, 1);
        await this.saveData(data);
        return true;
    }

    public async getUserActiveEntry(discordId: string): Promise<{ giveawayId: string; giveaway: Giveaway } | null> {
        const data = await this.getData();
        for (const giveaway of data.giveaways) {
            if (giveaway.status === 'active' && giveaway.entries.some(e => e.discordId === discordId)) {
                return { giveawayId: giveaway.id, giveaway };
            }
        }
        return null;
    }

    // ==================== Winner Operations ====================

    public async setWinner(giveawayId: string, winnerId: string, endedBy: string): Promise<void> {
        const data = await this.getData();
        const giveaway = data.giveaways.find(g => g.id === giveawayId);
        if (!giveaway) throw new Error(`Giveaway ${giveawayId} not found`);
        if (!giveaway.entries.some(e => e.discordId === winnerId)) {
            throw new Error('Winner is not an entrant in this giveaway');
        }

        const now = new Date().toISOString();
        giveaway.winnerId = winnerId;
        giveaway.status = 'ended';
        giveaway.endedAt = now;
        giveaway.endedBy = endedBy;

        data.winners.push({
            discordId: winnerId,
            giveawayId,
            wonAt: now,
            prizeName: giveaway.prizeName,
            notified: false,
        });

        let userStats = data.userStats.find(s => s.discordId === winnerId);
        if (!userStats) {
            userStats = { discordId: winnerId, totalEntered: 0, totalWon: 0, wins: [] };
            data.userStats.push(userStats);
        }
        userStats.totalWon++;
        userStats.wins.push({ giveawayId, prizeName: giveaway.prizeName, wonAt: now });

        await this.saveData(data);
    }

    public async markWinnerNotified(giveawayId: string): Promise<void> {
        const data = await this.getData();
        const winner = data.winners.find(w => w.giveawayId === giveawayId);
        if (winner) {
            winner.notified = true;
            winner.notifiedAt = new Date().toISOString();
            await this.saveData(data);
        }
    }

    public async getGuildWinners(guildId: string, limit?: number): Promise<GiveawayWinner[]> {
        const data = await this.getData();
        const guildGiveawayIds = new Set(
            data.giveaways.filter(g => g.guildId === guildId).map(g => g.id)
        );

        const winners = data.winners
            .filter(w => guildGiveawayIds.has(w.giveawayId))
            .sort((a, b) => new Date(b.wonAt).getTime() - new Date(a.wonAt).getTime());

        return limit ? winners.slice(0, limit) : winners;
    }

    // ==================== Statistics ====================

    public async getUserStats(discordId: string): Promise<UserGiveawayStats> {
        const data = await this.getData();
        return data.userStats.find(s => s.discordId === discordId) || {
            discordId, totalEntered: 0, totalWon: 0, wins: [],
        };
    }

    public async getGuildStats(guildId: string): Promise<{
        totalGiveaways: number;
        activeCount: number;
        endedCount: number;
        totalWinners: number;
        totalEntries: number;
    }> {
        const data = await this.getData();
        const guildGiveaways = data.giveaways.filter(g => g.guildId === guildId);
        const guildGiveawayIds = new Set(guildGiveaways.map(g => g.id));

        return {
            totalGiveaways: guildGiveaways.length,
            activeCount: guildGiveaways.filter(g => g.status === 'active').length,
            endedCount: guildGiveaways.filter(g => g.status === 'ended').length,
            totalWinners: data.winners.filter(w => guildGiveawayIds.has(w.giveawayId)).length,
            totalEntries: guildGiveaways.reduce((sum, g) => sum + g.entries.length, 0),
        };
    }

    public async getExpiredScheduledGiveaways(): Promise<Giveaway[]> {
        const data = await this.getData();
        const now = new Date();

        return data.giveaways.filter(g => {
            if (g.status !== 'active') return false;
            const scheduled = g.endConditions.find(c => c.type === 'scheduled');
            return scheduled?.scheduledEndTime && new Date(scheduled.scheduledEndTime) <= now;
        });
    }

    /** @internal Test helper */
    public static _testResetInstance(): void {
        GiveawayDataService.instance = undefined as any;
    }
}

export const getGiveawayDataService = (): GiveawayDataService => GiveawayDataService.getInstance();
