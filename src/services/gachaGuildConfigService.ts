import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_BUCKET } from "../utils/cdn/config";
import { GACHA_CONFIG } from "../utils/data/gachaConfig";
import { logger } from '../utils/logger.js';

const isDevelopment = process.env.NODE_ENV === 'development';
const CONFIG_KEY = isDevelopment
    ? `${GACHA_CONFIG.DATA_PATH}/dev-guild-config.json`
    : `${GACHA_CONFIG.DATA_PATH}/guild-config.json`;

/**
 * Configuration for a Discord channel monitor (for auto-detecting coupon codes)
 */
export interface ChannelMonitorConfig {
    /** Discord guild/server ID where the channel is located */
    guildId: string;
    /** Channel ID to monitor in production */
    prodChannelId: string;
    /** Channel ID to monitor in development (for testing) */
    devChannelId: string;
}

/**
 * Guild configuration for the gacha coupon system
 * Stored in S3 to keep server IDs private (not in open source code)
 */
export interface GachaGuildConfig {
    /** List of Discord server IDs allowed to use the gacha coupon system */
    allowedGuildIds: string[];
    /** Channel monitoring configurations keyed by game ID */
    channelMonitors?: Record<string, ChannelMonitorConfig>;
    /** Rules message configuration for primary server */
    rulesConfig?: {
        /** Discord guild/server ID where rules message is managed */
        guildId: string;
        /** Channel ID for rules channel */
        channelId: string;
        /** Message ID of the rules message (null if not yet created) */
        messageId: string | null;
    };
    /** ISO timestamp of last update */
    lastUpdated: string;
    /** Schema version for future migrations */
    schemaVersion: number;
}

/**
 * Service for managing guild configuration from S3
 * Provides caching to minimize S3 reads
 */
class GachaGuildConfigService {
    private static instance: GachaGuildConfigService;
    private cache: GachaGuildConfig | null = null;
    private cacheExpiry: number = 0;
    private readonly CACHE_TTL = GACHA_CONFIG.CACHE_TTL;

    private constructor() {}

    public static getInstance(): GachaGuildConfigService {
        if (!GachaGuildConfigService.instance) {
            GachaGuildConfigService.instance = new GachaGuildConfigService();
        }
        return GachaGuildConfigService.instance;
    }

    /**
     * Get the guild configuration from S3 (with caching)
     */
    public async getConfig(): Promise<GachaGuildConfig> {
        if (this.cache && Date.now() < this.cacheExpiry) {
            return this.cache;
        }

        try {
            const response = await s3Client.send(new GetObjectCommand({
                Bucket: S3_BUCKET,
                Key: CONFIG_KEY,
            }));

            const bodyContents = await response.Body?.transformToString();
            if (!bodyContents) {
                return this.getDefaultConfig();
            }

            this.cache = JSON.parse(bodyContents) as GachaGuildConfig;
            this.cacheExpiry = Date.now() + this.CACHE_TTL;
            return this.cache;
        } catch (error: any) {
            if (error.name === 'NoSuchKey' || error.Code === 'NoSuchKey') {
                logger.warn`Guild config not found at ${CONFIG_KEY}, creating default...`;
                const defaultConfig = this.getDefaultConfig();
                await this.saveConfig(defaultConfig);
                return defaultConfig;
            }
            logger.error`Error fetching guild config: ${error}`;
            throw error;
        }
    }

    /**
     * Check if a guild is allowed to use the gacha coupon system
     */
    public async isGuildAllowed(guildId: string | null): Promise<boolean> {
        if (!guildId) return false;

        const config = await this.getConfig();
        return config.allowedGuildIds.includes(guildId);
    }

    /**
     * Get the list of allowed guild IDs
     */
    public async getAllowedGuildIds(): Promise<string[]> {
        const config = await this.getConfig();
        return config.allowedGuildIds;
    }

    /**
     * Get all channel monitor configurations
     */
    public async getChannelMonitors(): Promise<Record<string, ChannelMonitorConfig>> {
        const config = await this.getConfig();
        return config.channelMonitors || {};
    }

    /**
     * Get channel monitor config for a specific game
     */
    public async getChannelMonitorForGame(gameId: string): Promise<ChannelMonitorConfig | null> {
        const monitors = await this.getChannelMonitors();
        return monitors[gameId] || null;
    }

    /**
     * Get the active channel ID for a game (based on environment)
     */
    public async getActiveChannelId(gameId: string): Promise<string | null> {
        const monitor = await this.getChannelMonitorForGame(gameId);
        if (!monitor) return null;
        return isDevelopment ? monitor.devChannelId : monitor.prodChannelId;
    }

    /**
     * Add a guild to the allowed list (admin operation)
     */
    public async addAllowedGuild(guildId: string): Promise<void> {
        const config = await this.getConfig();

        if (config.allowedGuildIds.includes(guildId)) {
            return; // Already allowed
        }

        config.allowedGuildIds.push(guildId);
        config.lastUpdated = new Date().toISOString();
        await this.saveConfig(config);
    }

    /**
     * Remove a guild from the allowed list (admin operation)
     */
    public async removeAllowedGuild(guildId: string): Promise<boolean> {
        const config = await this.getConfig();
        const index = config.allowedGuildIds.indexOf(guildId);

        if (index === -1) {
            return false; // Not in list
        }

        config.allowedGuildIds.splice(index, 1);
        config.lastUpdated = new Date().toISOString();
        await this.saveConfig(config);
        return true;
    }

    /**
     * Save configuration to S3
     */
    private async saveConfig(config: GachaGuildConfig): Promise<void> {
        config.lastUpdated = new Date().toISOString();

        await s3Client.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: CONFIG_KEY,
            Body: JSON.stringify(config, null, 2),
            ContentType: 'application/json',
        }));

        this.cache = config;
        this.cacheExpiry = Date.now() + this.CACHE_TTL;
    }

    /**
     * Get default configuration (empty - must be configured via S3)
     */
    private getDefaultConfig(): GachaGuildConfig {
        return {
            allowedGuildIds: [],
            lastUpdated: new Date().toISOString(),
            schemaVersion: 1,
        };
    }

    /**
     * Clear cache (for testing or forced refresh)
     */
    public clearCache(): void {
        this.cache = null;
        this.cacheExpiry = 0;
    }
}

/**
 * Get the singleton instance
 */
export const getGachaGuildConfigService = (): GachaGuildConfigService =>
    GachaGuildConfigService.getInstance();
