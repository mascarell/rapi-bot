import { Client, Message, TextChannel } from 'discord.js';
import { getGachaGuildConfigService, ChannelMonitorConfig } from './gachaGuildConfigService';
import { getGachaDataService } from './gachaDataService';
import { getGachaRedemptionService } from './gachaRedemptionService';
import { GachaGameId, GachaCoupon } from '../utils/interfaces/GachaCoupon.interface';
import { GACHA_GAMES, getGameConfig } from '../utils/data/gachaGamesConfig';

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Parsed coupon information from an announcement message
 */
export interface ParsedCoupon {
    code: string;
    rewards: string;
    expirationDate: string | null;
}

/**
 * Mapping of channel IDs to their corresponding game IDs
 */
interface ChannelToGameMap {
    channelId: string;
    gameId: GachaGameId;
    config: ChannelMonitorConfig;
}

/**
 * Service for monitoring Discord channels for coupon announcements
 * Generic implementation that works with any game that has parsePatterns defined
 */
class ChannelMonitorService {
    private static instance: ChannelMonitorService;
    private monitoredChannels: Map<string, ChannelToGameMap> = new Map();
    private initialized: boolean = false;

    private constructor() {}

    public static getInstance(): ChannelMonitorService {
        if (!ChannelMonitorService.instance) {
            ChannelMonitorService.instance = new ChannelMonitorService();
        }
        return ChannelMonitorService.instance;
    }

    /**
     * Initialize the service by loading channel configurations from S3
     */
    public async initialize(): Promise<void> {
        if (this.initialized) return;

        const configService = getGachaGuildConfigService();
        const channelMonitors = await configService.getChannelMonitors();

        // Build the channel-to-game mapping
        for (const [gameId, config] of Object.entries(channelMonitors)) {
            // Verify the game exists and has parsePatterns
            if (!this.isValidGameId(gameId) || !GACHA_GAMES[gameId as GachaGameId].parsePatterns) {
                console.warn(`[ChannelMonitor] Skipping ${gameId}: no parsePatterns defined`);
                continue;
            }

            const channelId = isDevelopment ? config.devChannelId : config.prodChannelId;

            this.monitoredChannels.set(channelId, {
                channelId,
                gameId: gameId as GachaGameId,
                config,
            });

            console.log(`[ChannelMonitor] Monitoring channel ${channelId} for ${gameId} (${isDevelopment ? 'dev' : 'prod'})`);
        }

        this.initialized = true;
        console.log(`[ChannelMonitor] Initialized with ${this.monitoredChannels.size} channels`);
    }

    /**
     * Check if a game ID is valid
     */
    private isValidGameId(gameId: string): gameId is GachaGameId {
        return gameId in GACHA_GAMES;
    }

    /**
     * Check if a channel is being monitored and return the game ID
     */
    public isMonitoredChannel(channelId: string): GachaGameId | null {
        const mapping = this.monitoredChannels.get(channelId);
        return mapping ? mapping.gameId : null;
    }

    /**
     * Get all monitored channel IDs
     */
    public getMonitoredChannelIds(): string[] {
        return Array.from(this.monitoredChannels.keys());
    }

    /**
     * Parse an announcement message and extract coupon information
     */
    public parseAnnouncementMessage(gameId: GachaGameId, content: string): ParsedCoupon | null {
        const gameConfig = GACHA_GAMES[gameId];
        if (!gameConfig.parsePatterns) {
            console.warn(`[ChannelMonitor] No parse patterns for game: ${gameId}`);
            return null;
        }

        const { code: codePattern, rewards: rewardsPattern, expiration: expirationPattern } = gameConfig.parsePatterns;

        // Extract coupon code
        const codeMatch = content.match(codePattern);
        if (!codeMatch || !codeMatch[1]) {
            return null;
        }
        const code = codeMatch[1].trim().toUpperCase();

        // Extract rewards
        const rewardsMatch = content.match(rewardsPattern);
        const rewards = rewardsMatch?.[1]?.trim() || 'Unknown rewards';

        // Extract expiration date
        const expirationMatch = content.match(expirationPattern);
        const expirationDate = expirationMatch?.[1]
            ? this.parseExpirationDate(expirationMatch[1])
            : null;

        return { code, rewards, expirationDate };
    }

    /**
     * Parse expiration date string to ISO format
     * Handles format: "January 21, 23:59 (UTC+9)"
     */
    public parseExpirationDate(dateString: string): string | null {
        try {
            // Pattern: "January 21, 23:59 (UTC+9)" or "January 21 23:59 (UTC+9)"
            const pattern = /(\w+)\s+(\d{1,2}),?\s+(\d{1,2}):(\d{2})\s*\(UTC([+-]\d+)\)/i;
            const match = dateString.match(pattern);

            if (!match) {
                // Try simpler format: "January 21"
                const simplePattern = /(\w+)\s+(\d{1,2})/i;
                const simpleMatch = dateString.match(simplePattern);
                if (simpleMatch) {
                    const [, month, day] = simpleMatch;
                    const year = new Date().getFullYear();
                    const monthIndex = this.getMonthIndex(month);
                    if (monthIndex === -1) return null;

                    // Assume end of day in UTC for simple dates
                    const date = new Date(Date.UTC(year, monthIndex, parseInt(day), 23, 59, 59));

                    // If the date is in the past, assume next year
                    if (date < new Date()) {
                        date.setFullYear(date.getFullYear() + 1);
                    }

                    return date.toISOString();
                }
                return null;
            }

            const [, month, day, hour, minute, utcOffset] = match;
            const year = new Date().getFullYear();
            const monthIndex = this.getMonthIndex(month);
            if (monthIndex === -1) return null;

            // Parse the UTC offset (e.g., "+9" -> 9)
            const offsetHours = parseInt(utcOffset);

            // Create date in the specified timezone, then convert to UTC
            const date = new Date(Date.UTC(
                year,
                monthIndex,
                parseInt(day),
                parseInt(hour) - offsetHours, // Convert to UTC
                parseInt(minute),
                59 // End of minute
            ));

            // If the date is in the past, assume next year
            if (date < new Date()) {
                date.setFullYear(date.getFullYear() + 1);
            }

            return date.toISOString();
        } catch (error) {
            console.error('[ChannelMonitor] Failed to parse expiration date:', dateString, error);
            return null;
        }
    }

    /**
     * Get month index from month name
     */
    private getMonthIndex(monthName: string): number {
        const months: Record<string, number> = {
            'january': 0, 'jan': 0,
            'february': 1, 'feb': 1,
            'march': 2, 'mar': 2,
            'april': 3, 'apr': 3,
            'may': 4,
            'june': 5, 'jun': 5,
            'july': 6, 'jul': 6,
            'august': 7, 'aug': 7,
            'september': 8, 'sep': 8, 'sept': 8,
            'october': 9, 'oct': 9,
            'november': 10, 'nov': 10,
            'december': 11, 'dec': 11,
        };
        return months[monthName.toLowerCase()] ?? -1;
    }

    /**
     * Handle a message from a monitored channel
     * Parses the message, adds the coupon if new, and notifies subscribers
     */
    public async handleMonitoredMessage(bot: Client, message: Message): Promise<void> {
        const gameId = this.isMonitoredChannel(message.channelId);
        if (!gameId) return;

        const content = message.content;
        console.log(`[ChannelMonitor] Processing message in ${gameId} channel: ${content.substring(0, 100)}...`);

        // Parse the announcement
        const parsed = this.parseAnnouncementMessage(gameId, content);
        if (!parsed) {
            console.log(`[ChannelMonitor] No coupon found in message`);
            return;
        }

        console.log(`[ChannelMonitor] Found coupon: ${parsed.code}, Rewards: ${parsed.rewards}, Expires: ${parsed.expirationDate}`);

        // Check if coupon already exists
        const dataService = getGachaDataService();
        const existingCoupons = await dataService.getAllCoupons(gameId);
        const exists = existingCoupons.some(
            c => c.code.toUpperCase() === parsed.code.toUpperCase()
        );

        if (exists) {
            console.log(`[ChannelMonitor] Coupon ${parsed.code} already exists, skipping`);
            return;
        }

        // Create the coupon object
        const coupon: GachaCoupon = {
            code: parsed.code,
            gameId,
            rewards: parsed.rewards,
            expirationDate: parsed.expirationDate,
            addedBy: 'channel-monitor',
            addedAt: new Date().toISOString(),
            isActive: true,
            source: 'Discord Announcement',
        };

        // Add the coupon
        try {
            await dataService.addCoupon(coupon);
            console.log(`[ChannelMonitor] Added new coupon: ${coupon.code}`);

            // Notify subscribers
            const redemptionService = getGachaRedemptionService();
            await redemptionService.notifyNewCode(bot, coupon);
            console.log(`[ChannelMonitor] Notifications sent for: ${coupon.code}`);
        } catch (error) {
            console.error(`[ChannelMonitor] Error adding coupon:`, error);
        }
    }

    /**
     * Set up the messageCreate event listener
     */
    public startMonitoring(bot: Client): void {
        bot.on('messageCreate', async (message: Message) => {
            // Ignore bot messages
            if (message.author.bot) return;

            // Check if this is a monitored channel
            const gameId = this.isMonitoredChannel(message.channelId);
            if (!gameId) return;

            try {
                await this.handleMonitoredMessage(bot, message);
            } catch (error) {
                console.error(`[ChannelMonitor] Error handling message:`, error);
            }
        });

        console.log(`[ChannelMonitor] Message monitoring started`);
    }

    /**
     * Convert an ISO date to Discord epoch timestamp
     */
    public toDiscordTimestamp(isoDate: string | null, format: 'R' | 'F' | 'f' | 'D' | 'd' | 'T' | 't' = 'R'): string {
        if (!isoDate) return 'No expiration';
        const epoch = Math.floor(new Date(isoDate).getTime() / 1000);
        return `<t:${epoch}:${format}>`;
    }

    /**
     * Reset the service (for testing)
     */
    public reset(): void {
        this.monitoredChannels.clear();
        this.initialized = false;
    }
}

/**
 * Get the singleton instance
 */
export const getChannelMonitorService = (): ChannelMonitorService =>
    ChannelMonitorService.getInstance();
