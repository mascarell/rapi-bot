import { Client, EmbedBuilder } from 'discord.js';
import { getGachaDataService } from './gachaDataService';
import {
    RedemptionResult,
    GachaCoupon,
    GachaGameId,
    BatchRedemptionResult,
    CommonRedemptionError
} from '../utils/interfaces/GachaCoupon.interface';
import { getGameConfig, getAutoRedeemGames, GACHA_GAMES } from '../utils/data/gachaGamesConfig';

const RAPI_BOT_THUMBNAIL_URL = process.env.CDN_DOMAIN_URL + '/assets/rapi-bot-thumbnail.jpg';

/**
 * Human-readable error messages
 */
const ERROR_MESSAGES: Record<CommonRedemptionError, string> = {
    'ValidationFailed': 'Invalid input - please check your game ID and code',
    'InvalidCode': 'This coupon code is invalid or does not exist',
    'ExpiredCode': 'This coupon code has expired',
    'AlreadyUsed': 'You have already redeemed this code',
    'ExceededUses': 'This coupon has reached its maximum redemption limit',
    'UnavailableCode': 'This coupon is currently unavailable',
    'IncorrectUser': 'The provided ID does not match any account',
    'ClaimRewardsFailed': 'Failed to deliver rewards - please try again later',
    'NetworkError': 'Unable to connect to game servers',
    'RateLimited': 'Too many requests - please try again later',
    'Unknown': 'An unknown error occurred',
};

/**
 * Abstract interface for game-specific redemption implementations
 */
interface GameRedemptionHandler {
    redeem(gameUserId: string, code: string): Promise<RedemptionResult>;
}

/**
 * BD2-specific redemption handler
 */
class BD2RedemptionHandler implements GameRedemptionHandler {
    private readonly gameId: GachaGameId = 'bd2';

    async redeem(gameUserId: string, code: string): Promise<RedemptionResult> {
        const config = getGameConfig(this.gameId);

        if (!config.apiEndpoint) {
            return this.createResult(code, false, 'Auto-redemption not supported for this game');
        }

        try {
            const response = await fetch(config.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    appId: config.apiConfig?.appId,
                    userId: gameUserId.trim(),
                    code: code.toUpperCase().trim(),
                }),
            });

            const data = await response.json();

            if (data.success) {
                return this.createResult(code, true, 'Code redeemed successfully! Check your in-game mailbox.');
            } else {
                const errorCode = data.error || 'Unknown';
                const errorMessage = ERROR_MESSAGES[errorCode as CommonRedemptionError] || `Redemption failed: ${errorCode}`;
                return this.createResult(code, false, errorMessage, errorCode);
            }
        } catch (error: any) {
            console.error('BD2 API Error:', error);
            return this.createResult(code, false, `Network error: ${error.message || 'Unable to connect'}`, 'NetworkError');
        }
    }

    private createResult(code: string, success: boolean, message: string, errorCode?: string): RedemptionResult {
        return {
            success,
            code: code.toUpperCase(),
            gameId: this.gameId,
            message,
            timestamp: new Date().toISOString(),
            errorCode,
        };
    }
}

/**
 * Service for handling coupon redemption across multiple gacha games
 */
export class GachaRedemptionService {
    private static instance: GachaRedemptionService;
    private readonly RATE_LIMIT_DELAY = 2000; // 2 seconds between API requests
    private lastRequestTime: Map<GachaGameId, number> = new Map();
    private handlers: Map<GachaGameId, GameRedemptionHandler> = new Map();

    private constructor() {
        // Register game-specific handlers
        this.handlers.set('bd2', new BD2RedemptionHandler());
        // Add more handlers here as games are supported
        // this.handlers.set('nikke', new NikkeRedemptionHandler());
    }

    public static getInstance(): GachaRedemptionService {
        if (!GachaRedemptionService.instance) {
            GachaRedemptionService.instance = new GachaRedemptionService();
        }
        return GachaRedemptionService.instance;
    }

    /**
     * Enforce rate limiting between API calls per game
     */
    private async enforceRateLimit(gameId: GachaGameId): Promise<void> {
        const now = Date.now();
        const lastRequest = this.lastRequestTime.get(gameId) || 0;
        const timeSince = now - lastRequest;

        if (timeSince < this.RATE_LIMIT_DELAY) {
            await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_DELAY - timeSince));
        }

        this.lastRequestTime.set(gameId, Date.now());
    }

    /**
     * Check if a game supports auto-redemption
     */
    public supportsAutoRedeem(gameId: GachaGameId): boolean {
        return getGameConfig(gameId).supportsAutoRedeem && this.handlers.has(gameId);
    }

    /**
     * Redeem a single coupon code
     */
    public async redeemCode(gameId: GachaGameId, gameUserId: string, code: string): Promise<RedemptionResult> {
        const handler = this.handlers.get(gameId);

        if (!handler) {
            return {
                success: false,
                code: code.toUpperCase(),
                gameId,
                message: `Auto-redemption is not supported for ${getGameConfig(gameId).name}`,
                timestamp: new Date().toISOString(),
                errorCode: 'UnavailableCode',
            };
        }

        await this.enforceRateLimit(gameId);
        return handler.redeem(gameUserId, code);
    }

    /**
     * Redeem multiple codes for a user
     */
    public async redeemMultipleCodes(
        gameId: GachaGameId,
        gameUserId: string,
        codes: string[]
    ): Promise<RedemptionResult[]> {
        const results: RedemptionResult[] = [];

        for (const code of codes) {
            const result = await this.redeemCode(gameId, gameUserId, code);
            results.push(result);

            // Stop on rate limit or network errors
            if (result.errorCode === 'RateLimited' || result.errorCode === 'NetworkError') {
                console.log(`Stopping batch redemption for ${gameId} due to: ${result.message}`);
                break;
            }
        }

        return results;
    }

    /**
     * Process auto-redemptions for all subscribers of a game
     */
    public async processGameAutoRedemptions(bot: Client, gameId: GachaGameId): Promise<BatchRedemptionResult> {
        const dataService = getGachaDataService();
        const subscribers = await dataService.getGameSubscribers(gameId, 'auto-redeem');
        const activeCoupons = await dataService.getActiveCoupons(gameId);

        const result: BatchRedemptionResult = {
            gameId,
            usersProcessed: subscribers.length,
            totalRedemptions: 0,
            successful: 0,
            failed: 0,
            skipped: 0,
        };

        for (const { discordId, subscription } of subscribers) {
            const codesToRedeem = activeCoupons
                .filter(c => !subscription.redeemedCodes.includes(c.code.toUpperCase()))
                .map(c => c.code);

            if (codesToRedeem.length === 0) {
                result.skipped++;
                continue;
            }

            console.log(`Processing ${codesToRedeem.length} codes for ${subscription.gameUserId} in ${gameId}`);

            const redemptionResults = await this.redeemMultipleCodes(
                gameId,
                subscription.gameUserId,
                codesToRedeem
            );

            result.totalRedemptions += redemptionResults.length;

            const successfulCodes = redemptionResults.filter(r => r.success).map(r => r.code);
            result.successful += successfulCodes.length;
            result.failed += redemptionResults.length - successfulCodes.length;

            if (successfulCodes.length > 0) {
                await dataService.markCodesRedeemed(discordId, gameId, successfulCodes);
            }

            await this.sendRedemptionResultsDM(bot, discordId, gameId, redemptionResults);
        }

        return result;
    }

    /**
     * Process auto-redemptions for all games that support it
     */
    public async processAllAutoRedemptions(bot: Client): Promise<BatchRedemptionResult[]> {
        const results: BatchRedemptionResult[] = [];

        for (const game of getAutoRedeemGames()) {
            if (this.handlers.has(game.id)) {
                const result = await this.processGameAutoRedemptions(bot, game.id);
                results.push(result);
            }
        }

        return results;
    }

    /**
     * Send DM to user about redemption results
     */
    private async sendRedemptionResultsDM(
        bot: Client,
        discordId: string,
        gameId: GachaGameId,
        results: RedemptionResult[]
    ): Promise<void> {
        if (results.length === 0) return;

        try {
            const user = await bot.users.fetch(discordId);
            const gameConfig = getGameConfig(gameId);

            const successCount = results.filter(r => r.success).length;
            const failCount = results.length - successCount;

            const embed = new EmbedBuilder()
                .setColor(successCount > 0 ? 0x00FF00 : 0xFF0000)
                .setTitle(`🎟️ ${gameConfig.shortName} Coupon Redemption Report`)
                .setThumbnail(gameConfig.logoPath)
                .setDescription(`Auto-redemption completed for your account.`)
                .addFields(
                    { name: '✅ Successful', value: `${successCount}`, inline: true },
                    { name: '❌ Failed', value: `${failCount}`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'Gacha Coupon System', iconURL: RAPI_BOT_THUMBNAIL_URL });

            const successList = results.filter(r => r.success).map(r => `• \`${r.code}\``).join('\n');
            const failList = results.filter(r => !r.success).map(r => `• \`${r.code}\`: ${r.message}`).join('\n');

            if (successList) {
                embed.addFields({ name: 'Redeemed Codes', value: successList });
            }
            if (failList) {
                embed.addFields({ name: 'Failed Codes', value: failList.substring(0, 1024) });
            }

            await user.send({ embeds: [embed] });
        } catch (error) {
            console.error(`Failed to send redemption DM to ${discordId}:`, error);
        }
    }

    /**
     * Notify subscribers about a new coupon code
     */
    public async notifyNewCode(bot: Client, coupon: GachaCoupon): Promise<void> {
        const dataService = getGachaDataService();
        const gameConfig = getGameConfig(coupon.gameId);
        const subscribers = await dataService.getGameSubscribers(coupon.gameId);

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`🆕 New ${gameConfig.shortName} Coupon Code!`)
            .setThumbnail(gameConfig.logoPath)
            .setDescription('A new coupon code has been added.')
            .addFields(
                { name: 'Code', value: `\`${coupon.code}\``, inline: true },
                { name: 'Rewards', value: coupon.rewards, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'Gacha Coupon System', iconURL: RAPI_BOT_THUMBNAIL_URL });

        if (coupon.expirationDate) {
            const expiry = new Date(coupon.expirationDate).toLocaleDateString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric'
            });
            embed.addFields({ name: '⏰ Expires', value: expiry, inline: true });
        }

        if (coupon.source) {
            embed.addFields({ name: '📍 Source', value: coupon.source, inline: true });
        }

        // Process notification-only subscribers first
        const notifyOnlySubs = subscribers.filter(s => s.subscription.mode === 'notification-only');
        for (const { discordId } of notifyOnlySubs) {
            try {
                const user = await bot.users.fetch(discordId);
                await user.send({ embeds: [embed] });
            } catch (error) {
                console.error(`Failed to notify ${discordId} about new code:`, error);
            }
        }

        // Process auto-redeem subscribers
        if (this.supportsAutoRedeem(coupon.gameId)) {
            const autoRedeemSubs = subscribers.filter(s => s.subscription.mode === 'auto-redeem');
            for (const { discordId, subscription } of autoRedeemSubs) {
                const result = await this.redeemCode(coupon.gameId, subscription.gameUserId, coupon.code);

                if (result.success) {
                    await dataService.markCodesRedeemed(discordId, coupon.gameId, [coupon.code]);
                }

                await this.sendRedemptionResultsDM(bot, discordId, coupon.gameId, [result]);
            }
        }
    }

    /**
     * Send expiration warning DMs for a game
     */
    public async sendExpirationWarnings(bot: Client, gameId: GachaGameId): Promise<void> {
        const dataService = getGachaDataService();
        const gameConfig = getGameConfig(gameId);
        const expiringCoupons = await dataService.getExpiringCoupons(gameId, 3);

        if (expiringCoupons.length === 0) return;

        const subscribers = await dataService.getGameSubscribers(gameId);

        for (const { discordId, subscription } of subscribers) {
            const unredeemed = expiringCoupons.filter(
                c => !subscription.redeemedCodes.includes(c.code.toUpperCase())
            );

            if (unredeemed.length === 0) continue;

            try {
                const user = await bot.users.fetch(discordId);

                const embed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle(`⚠️ ${gameConfig.shortName} Coupons Expiring Soon!`)
                    .setThumbnail(gameConfig.logoPath)
                    .setDescription(`You have ${unredeemed.length} coupon(s) expiring within 3 days.`)
                    .setTimestamp()
                    .setFooter({ text: 'Gacha Coupon System', iconURL: RAPI_BOT_THUMBNAIL_URL });

                for (const coupon of unredeemed.slice(0, 10)) {
                    const expiry = coupon.expirationDate
                        ? new Date(coupon.expirationDate).toLocaleDateString('en-US', {
                            year: 'numeric', month: 'short', day: 'numeric'
                        })
                        : 'Unknown';

                    embed.addFields({
                        name: `\`${coupon.code}\``,
                        value: `${coupon.rewards}\n⏰ Expires: ${expiry}`,
                    });
                }

                if (subscription.mode === 'notification-only' && gameConfig.manualRedeemUrl) {
                    embed.addFields({
                        name: '📌 How to Redeem',
                        value: `Use the [official redemption page](${gameConfig.manualRedeemUrl}) or redeem in-game.`,
                    });
                }

                await user.send({ embeds: [embed] });
            } catch (error) {
                console.error(`Failed to send expiration warning to ${discordId}:`, error);
            }
        }
    }

    /**
     * Send weekly digest DMs for a game
     */
    public async sendWeeklyDigest(bot: Client, gameId: GachaGameId): Promise<void> {
        const dataService = getGachaDataService();
        const gameConfig = getGameConfig(gameId);
        const subscribers = await dataService.getGameSubscribers(gameId);
        const activeCoupons = await dataService.getActiveCoupons(gameId);
        const expiringCoupons = await dataService.getExpiringCoupons(gameId, 7);

        for (const { discordId, subscription } of subscribers) {
            try {
                const user = await bot.users.fetch(discordId);
                const unredeemed = await dataService.getUnredeemedCodes(discordId, gameId);

                const embed = new EmbedBuilder()
                    .setColor(gameConfig.embedColor)
                    .setTitle(`📬 Weekly ${gameConfig.shortName} Coupon Digest`)
                    .setThumbnail(gameConfig.logoPath)
                    .setDescription(`Here's your weekly summary for **${subscription.gameUserId}**.`)
                    .addFields(
                        { name: '📊 Active Codes', value: `${activeCoupons.length}`, inline: true },
                        { name: '✅ Redeemed', value: `${subscription.redeemedCodes.length}`, inline: true },
                        { name: '📌 Pending', value: `${unredeemed.length}`, inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Sent every Sunday', iconURL: RAPI_BOT_THUMBNAIL_URL });

                if (unredeemed.length > 0) {
                    const codeList = unredeemed.slice(0, 5).map(c => {
                        const expiry = c.expirationDate
                            ? `(expires ${new Date(c.expirationDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`
                            : '';
                        return `• \`${c.code}\` - ${c.rewards} ${expiry}`;
                    }).join('\n');

                    embed.addFields({
                        name: '🎟️ Unredeemed Codes',
                        value: codeList + (unredeemed.length > 5 ? `\n...and ${unredeemed.length - 5} more` : ''),
                    });
                }

                if (expiringCoupons.length > 0) {
                    const expiringUnredeemed = expiringCoupons.filter(
                        c => !subscription.redeemedCodes.includes(c.code.toUpperCase())
                    );
                    if (expiringUnredeemed.length > 0) {
                        embed.addFields({
                            name: '⚠️ Expiring This Week',
                            value: expiringUnredeemed.map(c => `\`${c.code}\``).join(', '),
                        });
                    }
                }

                await dataService.updateLastNotified(discordId, gameId);
                await user.send({ embeds: [embed] });
            } catch (error) {
                console.error(`Failed to send weekly digest to ${discordId}:`, error);
            }
        }
    }
}

/**
 * Get the singleton instance
 */
export const getGachaRedemptionService = (): GachaRedemptionService => GachaRedemptionService.getInstance();
