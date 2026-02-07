import { Client, EmbedBuilder, User, Message } from 'discord.js';
import pLimit from 'p-limit';
import { getGachaDataService } from './gachaDataService.js';
import { getReactionConfirmationService, CONFIRMATION_EMOJIS } from './reactionConfirmationService.js';
import { getChannelMonitorService } from './channelMonitorService.js';
import {
    RedemptionResult,
    GachaCoupon,
    GachaGameId,
    BatchRedemptionResult,
    CommonRedemptionError,
    RedemptionHistoryEntry
} from '../utils/interfaces/GachaCoupon.interface';
import { getGameConfig, getAutoRedeemGames } from '../utils/data/gachaGamesConfig';
import { GACHA_CONFIG } from '../utils/data/gachaConfig';
import { gachaLogger } from '../utils/logger.js';

const RERUN_EMOJI = '🔁';

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
 * Circuit breaker state for a game API
 */
interface CircuitState {
    failures: number;
    lastFailure: number;
    isOpen: boolean;
}

/**
 * Circuit breaker pattern to prevent cascading failures
 * Opens after consecutive failures, closes after cooldown period
 */
class CircuitBreaker {
    private circuits: Map<GachaGameId, CircuitState> = new Map();

    /**
     * Check if the circuit is open (blocking requests)
     */
    isOpen(gameId: GachaGameId): boolean {
        const circuit = this.circuits.get(gameId);
        if (!circuit || !circuit.isOpen) return false;

        // Check if cooldown has passed
        if (Date.now() - circuit.lastFailure >= GACHA_CONFIG.CIRCUIT_BREAKER_COOLDOWN) {
            circuit.isOpen = false;
            circuit.failures = 0;
            gachaLogger.debug`Circuit breaker CLOSED for ${gameId} (cooldown expired)`;
            return false;
        }
        return true;
    }

    /**
     * Record a successful API call (resets failure count)
     */
    recordSuccess(gameId: GachaGameId): void {
        const circuit = this.circuits.get(gameId);
        if (circuit) {
            circuit.failures = 0;
            circuit.isOpen = false;
        }
    }

    /**
     * Record a failed API call (may open circuit)
     */
    recordFailure(gameId: GachaGameId): void {
        let circuit = this.circuits.get(gameId);
        if (!circuit) {
            circuit = { failures: 0, lastFailure: 0, isOpen: false };
            this.circuits.set(gameId, circuit);
        }

        circuit.failures++;
        circuit.lastFailure = Date.now();

        if (circuit.failures >= GACHA_CONFIG.CIRCUIT_BREAKER_THRESHOLD) {
            circuit.isOpen = true;
            gachaLogger.warning`Circuit breaker OPEN for ${gameId} after ${circuit.failures} consecutive failures`;
        }
    }

    /**
     * Get circuit status for monitoring
     */
    getStatus(gameId: GachaGameId): { isOpen: boolean; failures: number; cooldownRemaining: number } {
        const circuit = this.circuits.get(gameId);
        if (!circuit) {
            return { isOpen: false, failures: 0, cooldownRemaining: 0 };
        }

        const cooldownRemaining = circuit.isOpen
            ? Math.max(0, GACHA_CONFIG.CIRCUIT_BREAKER_COOLDOWN - (Date.now() - circuit.lastFailure))
            : 0;

        return {
            isOpen: circuit.isOpen,
            failures: circuit.failures,
            cooldownRemaining,
        };
    }

    /**
     * Reset all circuits (for testing)
     */
    reset(): void {
        this.circuits.clear();
    }
}

// Singleton circuit breaker instance
const circuitBreaker = new CircuitBreaker();

/** Export for testing */
export const _testResetCircuitBreaker = () => circuitBreaker.reset();

/**
 * Abstract interface for game-specific redemption implementations
 */
interface GameRedemptionHandler {
    redeem(gameUserId: string, code: string): Promise<RedemptionResult>;
}

/**
 * BD2-specific redemption handler with retry logic and circuit breaker integration
 */
class BD2RedemptionHandler implements GameRedemptionHandler {
    private readonly gameId: GachaGameId = 'bd2';

    async redeem(gameUserId: string, code: string): Promise<RedemptionResult> {
        const config = getGameConfig(this.gameId);

        if (!config.apiEndpoint) {
            return this.createResult(code, false, 'Auto-redemption not supported for this game');
        }

        // Check circuit breaker before making request
        if (circuitBreaker.isOpen(this.gameId)) {
            const status = circuitBreaker.getStatus(this.gameId);
            const cooldownSecs = Math.ceil(status.cooldownRemaining / 1000);
            return this.createResult(
                code,
                false,
                `Game API temporarily unavailable (retry in ${cooldownSecs}s)`,
                'RateLimited'
            );
        }

        try {
            const requestBody = {
                appId: config.apiConfig?.appId,
                userId: gameUserId.trim(),
                code: code.toUpperCase().trim(),
            };

            gachaLogger.debug`BD2 API Request: userId=${requestBody.userId}, code=${requestBody.code}, appId=${requestBody.appId}`;

            const response = await this.fetchWithRetry(config.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': '*/*',
                    'Referer': 'https://thebd2pulse.com/',
                    'Origin': 'https://thebd2pulse.com',
                },
                body: JSON.stringify(requestBody),
            });

            // Handle HTTP-level errors
            if (!response.ok) {
                const responseText = await response.text();
                gachaLogger.error`BD2 API HTTP Error: ${response.status} ${response.statusText} - ${responseText}`;
                circuitBreaker.recordFailure(this.gameId);
                return this.createResult(code, false, `API error: ${response.status} ${response.statusText}`, 'NetworkError');
            }

            const data = await response.json();
            gachaLogger.debug`BD2 API Response: ${JSON.stringify(data)}`;

            if (data.success) {
                circuitBreaker.recordSuccess(this.gameId);
                return this.createResult(code, true, 'Code redeemed successfully! Check your in-game mailbox.');
            } else {
                const errorCode = data.error || 'Unknown';
                const errorMessage = ERROR_MESSAGES[errorCode as CommonRedemptionError] || `Redemption failed: ${errorCode}`;
                // Don't count business logic errors as circuit breaker failures
                if (errorCode !== 'InvalidCode' && errorCode !== 'AlreadyUsed' && errorCode !== 'ExpiredCode') {
                    circuitBreaker.recordFailure(this.gameId);
                }
                return this.createResult(code, false, errorMessage, errorCode);
            }
        } catch (error: any) {
            gachaLogger.error`BD2 API Error: ${error.message} ${error.stack}`;
            circuitBreaker.recordFailure(this.gameId);

            if (error.name === 'AbortError') {
                return this.createResult(code, false, 'Request timed out - game server may be slow', 'NetworkError');
            }
            return this.createResult(code, false, `Network error: ${error.message || 'Unable to connect'}`, 'NetworkError');
        }
    }

    /**
     * Fetch with retry logic and exponential backoff
     * Uses config values for initial backoff, max backoff, and multiplier
     */
    private async fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
        const maxRetries = GACHA_CONFIG.MAX_RETRIES;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), GACHA_CONFIG.API_TIMEOUT_MS);

            try {
                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                // Retry on server errors (5xx) or rate limits (429)
                if (response.status >= 500 || response.status === 429) {
                    if (attempt < maxRetries) {
                        const delay = this.calculateBackoffDelay(attempt);
                        gachaLogger.debug`BD2 API returned ${response.status}, retry ${attempt}/${maxRetries} after ${delay}ms`;
                        await new Promise(r => setTimeout(r, delay));
                        continue;
                    }
                }

                return response;
            } catch (error: any) {
                clearTimeout(timeoutId);

                // Retry on network/timeout errors
                if (attempt < maxRetries && this.isRetryableError(error)) {
                    const delay = this.calculateBackoffDelay(attempt);
                    gachaLogger.debug`BD2 API error: ${error.message}, retry ${attempt}/${maxRetries} after ${delay}ms`;
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }

                throw error;
            }
        }

        throw new Error('Max retries exceeded');
    }

    /**
     * Calculate exponential backoff delay with jitter
     * Uses config values for flexibility
     */
    private calculateBackoffDelay(attempt: number): number {
        const baseDelay = GACHA_CONFIG.INITIAL_BACKOFF_MS * Math.pow(GACHA_CONFIG.BACKOFF_MULTIPLIER, attempt - 1);
        // Add random jitter (±20%) to prevent thundering herd
        const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);
        const delay = Math.min(baseDelay + jitter, GACHA_CONFIG.MAX_BACKOFF_MS);
        return Math.round(delay);
    }

    /**
     * Check if an error is retryable (transient)
     */
    private isRetryableError(error: any): boolean {
        return (
            error.name === 'AbortError' ||
            error.message?.includes('network') ||
            error.message?.includes('ETIMEDOUT') ||
            error.message?.includes('ECONNRESET') ||
            error.message?.includes('fetch failed')
        );
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
    private lastRequestTime: Map<GachaGameId, number> = new Map();
    private handlers: Map<GachaGameId, GameRedemptionHandler> = new Map();
    private subscriberLimit = pLimit(GACHA_CONFIG.CONCURRENT_SUBSCRIBER_LIMIT);

    private constructor() {
        // Register game-specific handlers
        this.handlers.set('bd2', new BD2RedemptionHandler());
        // Add more handlers here as games are supported
        // this.handlers.set('nikke', new NikkeRedemptionHandler());
    }

    /**
     * Send a DM with rate limiting to avoid Discord rate limits
     * Tracks DM failures to skip users who have DMs disabled
     * @returns The sent Message if successful, null if failed
     */
    private async sendDMWithDelay(
        user: User,
        content: { embeds: EmbedBuilder[] },
        gameId?: GachaGameId
    ): Promise<Message | null> {
        try {
            const message = await user.send(content);
            await new Promise(resolve => setTimeout(resolve, GACHA_CONFIG.DM_RATE_LIMIT_DELAY));

            // Clear DM disabled status if previously marked
            if (gameId) {
                const dataService = getGachaDataService();
                await dataService.clearDMDisabled(user.id, gameId);
            }
            return message;
        } catch (error: any) {
            // Check if this is a "Cannot send messages to this user" error
            if (error.code === 50007) {
                gachaLogger.warning`Cannot send DM to ${user.id} - user has DMs disabled`;
                if (gameId) {
                    const dataService = getGachaDataService();
                    await dataService.markDMDisabled(user.id, gameId);
                }
            } else {
                gachaLogger.error`Failed to send DM to ${user.id}: ${error.message}`;
            }
            return null;
        }
    }

    /**
     * Create redemption history entries from results
     */
    private createHistoryEntries(
        discordId: string,
        gameId: GachaGameId,
        results: RedemptionResult[],
        method: 'auto' | 'manual'
    ): RedemptionHistoryEntry[] {
        return results.map(r => ({
            discordId,
            gameId,
            code: r.code,
            timestamp: r.timestamp,
            success: r.success,
            errorCode: r.errorCode,
            method,
        }));
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

        if (timeSince < GACHA_CONFIG.RATE_LIMIT_DELAY) {
            await new Promise(resolve => setTimeout(resolve, GACHA_CONFIG.RATE_LIMIT_DELAY - timeSince));
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
                gachaLogger.debug`Stopping batch redemption for ${gameId} due to: ${result.message}`;
                break;
            }
        }

        return results;
    }

    /**
     * Process auto-redemptions for all subscribers of a game
     * Uses Promise.allSettled for graceful partial failure handling
     *
     * @param bot - Discord client
     * @param gameId - Game to process
     * @param options.notifyAllRedeemed - Whether to send DMs when user has all codes redeemed (default: false to prevent spam)
     * @param options.hasNewCodes - Set to true when new codes were just scraped (enables all-redeemed notifications)
     */
    public async processGameAutoRedemptions(
        bot: Client,
        gameId: GachaGameId,
        options: { notifyAllRedeemed?: boolean; hasNewCodes?: boolean } = {}
    ): Promise<BatchRedemptionResult> {
        const dataService = getGachaDataService();
        // Use optimized batch method that includes preferences and DM status
        const subscribers = await dataService.getSubscribersForNotification(gameId, 'auto-redeem');
        const activeCoupons = await dataService.getActiveCoupons(gameId);

        // Only send "all codes redeemed" DMs when there are new codes to inform about
        const shouldNotifyAllRedeemed = options.notifyAllRedeemed ?? options.hasNewCodes ?? false;

        const result: BatchRedemptionResult = {
            gameId,
            usersProcessed: subscribers.length,
            totalRedemptions: 0,
            successful: 0,
            failed: 0,
            skipped: 0,
        };

        // Collect batch updates for single S3 write
        const batchUpdates: Array<{ discordId: string; gameId: GachaGameId; codes: string[] }> = [];
        // Collect history entries for batch write
        const historyEntries: RedemptionHistoryEntry[] = [];

        // Process subscribers in parallel with Promise.allSettled for graceful failure handling
        const processingResults = await Promise.allSettled(
            subscribers.map(({ discordId, subscription, dmDisabled }) =>
                this.subscriberLimit(async () => {
                    const codesToRedeem = activeCoupons
                        .filter(c => !subscription.redeemedCodes.includes(c.code.toUpperCase()))
                        .map(c => c.code);

                    if (codesToRedeem.length === 0) {
                        // Only send "all codes redeemed" DM when explicitly enabled and DMs are not disabled
                        if (shouldNotifyAllRedeemed && !dmDisabled) {
                            await this.sendAllCodesRedeemedDM(bot, discordId, gameId, activeCoupons.length, subscription.gameUserId);
                        }
                        return { skipped: true, redemptions: 0, successful: 0, failed: 0, successfulCodes: [], historyEntries: [] };
                    }

                    const redemptionResults = await this.redeemMultipleCodes(
                        gameId,
                        subscription.gameUserId,
                        codesToRedeem
                    );

                    const successfulCodes = redemptionResults.filter(r => r.success).map(r => r.code);
                    const alreadyRedeemed = redemptionResults.filter(r => !r.success && r.errorCode === 'AlreadyUsed');
                    const expired = redemptionResults.filter(r => !r.success && r.errorCode === 'ExpiredCode');
                    const actualFailures = redemptionResults.filter(r =>
                        !r.success && r.errorCode !== 'AlreadyUsed' && r.errorCode !== 'ExpiredCode'
                    );

                    // Log actual failures only (not already redeemed or expired)
                    for (const failed of actualFailures) {
                        gachaLogger.error`Redemption failed for ${subscription.gameUserId} - Code: ${failed.code}, Error: ${failed.errorCode || 'Unknown'}, Message: ${failed.message}`;
                    }

                    // Send DM only if not disabled AND we have meaningful results
                    // (skip if only expired codes or failures with nothing redeemed)
                    const hasRedeemed = successfulCodes.length > 0 || alreadyRedeemed.length > 0;
                    if (!dmDisabled && hasRedeemed) {
                        await this.sendRedemptionResultsDM(bot, discordId, gameId, redemptionResults, subscription.gameUserId);
                    }

                    // Include already redeemed codes in successful codes for marking
                    // (they're already redeemed, so mark them to avoid retrying)
                    const codesToMark = [
                        ...successfulCodes,
                        ...alreadyRedeemed.map(r => r.code)
                    ];

                    // Create history entries for this user
                    const userHistoryEntries = this.createHistoryEntries(discordId, gameId, redemptionResults, 'auto');

                    return {
                        discordId,
                        skipped: false,
                        redemptions: redemptionResults.length,
                        successful: successfulCodes.length,
                        alreadyRedeemed: alreadyRedeemed.length,
                        expired: expired.length,
                        failed: actualFailures.length,
                        successfulCodes: codesToMark,
                        historyEntries: userHistoryEntries,
                    };
                })
            )
        );

        // Aggregate results and collect batch updates
        for (const settledResult of processingResults) {
            if (settledResult.status === 'fulfilled') {
                const r = settledResult.value;
                if (r.skipped) {
                    result.skipped++;
                } else {
                    result.totalRedemptions += r.redemptions;
                    result.successful += r.successful;
                    result.failed += r.failed;

                    // Collect for batch update
                    if (r.successfulCodes.length > 0 && r.discordId) {
                        batchUpdates.push({
                            discordId: r.discordId,
                            gameId,
                            codes: r.successfulCodes,
                        });
                    }

                    // Collect history entries
                    if (r.historyEntries && r.historyEntries.length > 0) {
                        historyEntries.push(...r.historyEntries);
                    }
                }
            } else {
                // Promise was rejected - count as failed
                gachaLogger.error`Subscriber processing failed: ${settledResult.reason}`;
                result.failed++;
            }
        }

        // Single batch S3 write for all successful redemptions
        if (batchUpdates.length > 0) {
            const batchResult = await dataService.batchMarkCodesRedeemed(batchUpdates);
            gachaLogger.debug`Batch S3 write: ${batchResult.success} users updated, ${batchResult.failed} failed`;
        }

        // Batch write redemption history
        if (historyEntries.length > 0) {
            await dataService.addBatchRedemptionHistory(historyEntries);
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
     * Redeem all active codes for a specific user immediately
     * Called after user subscribes with auto-redeem mode
     * Returns summary of redemption results
     */
    public async redeemAllForUser(
        bot: Client,
        discordId: string,
        gameId: GachaGameId,
        gameUserId: string
    ): Promise<{ successful: number; alreadyRedeemed: number; failed: number; total: number }> {
        if (!this.supportsAutoRedeem(gameId)) {
            return { successful: 0, alreadyRedeemed: 0, failed: 0, total: 0 };
        }

        const dataService = getGachaDataService();
        const activeCoupons = await dataService.getActiveCoupons(gameId);

        if (activeCoupons.length === 0) {
            return { successful: 0, alreadyRedeemed: 0, failed: 0, total: 0 };
        }

        const codes = activeCoupons.map(c => c.code);
        gachaLogger.debug`[Subscribe] Redeeming ${codes.length} codes for new subscriber ${gameUserId} in ${gameId}`;

        // Redeem all codes
        const results = await this.redeemMultipleCodes(gameId, gameUserId, codes);

        // Categorize results
        const successful = results.filter(r => r.success);
        const alreadyRedeemed = results.filter(r => !r.success && r.errorCode === 'AlreadyUsed');
        const failed = results.filter(r => !r.success && r.errorCode !== 'AlreadyUsed');

        // Mark successful and already-redeemed codes
        const codesToMark = [
            ...successful.map(r => r.code),
            ...alreadyRedeemed.map(r => r.code)
        ];

        if (codesToMark.length > 0) {
            await dataService.markCodesRedeemed(discordId, gameId, codesToMark);
        }

        // Log history entries
        const historyEntries = this.createHistoryEntries(discordId, gameId, results, 'auto');
        if (historyEntries.length > 0) {
            await dataService.addBatchRedemptionHistory(historyEntries);
        }

        // Send DM with results if there are meaningful results
        const hasRedeemed = successful.length > 0 || alreadyRedeemed.length > 0;
        if (hasRedeemed) {
            try {
                await this.sendRedemptionResultsDM(bot, discordId, gameId, results, gameUserId);
            } catch (error) {
                gachaLogger.error`[Subscribe] Failed to send redemption DM to ${discordId}: ${error}`;
            }
        }

        return {
            successful: successful.length,
            alreadyRedeemed: alreadyRedeemed.length,
            failed: failed.length,
            total: results.length
        };
    }

    /**
     * Send DM to user about redemption results
     * Categorizes results into: successful, already redeemed, expired, and actual failures
     */
    private async sendRedemptionResultsDM(
        bot: Client,
        discordId: string,
        gameId: GachaGameId,
        results: RedemptionResult[],
        gameUserId?: string
    ): Promise<void> {
        if (results.length === 0) return;

        try {
            const user = await bot.users.fetch(discordId);
            const gameConfig = getGameConfig(gameId);

            // Categorize results
            const successful = results.filter(r => r.success);
            const alreadyRedeemed = results.filter(r => !r.success && r.errorCode === 'AlreadyUsed');
            const expired = results.filter(r => !r.success && r.errorCode === 'ExpiredCode');
            const actualFailures = results.filter(r =>
                !r.success && r.errorCode !== 'AlreadyUsed' && r.errorCode !== 'ExpiredCode'
            );

            // Determine embed color based on actual failures
            let embedColor = 0x00FF00; // Green for all success
            if (actualFailures.length > 0) {
                embedColor = successful.length > 0 ? 0xFFA500 : 0xFF0000; // Orange if mixed, Red if all failed
            }

            const embed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle(`🎟️ ${gameConfig.shortName} Coupon Redemption Report`)
                .setThumbnail(gameConfig.logoPath)
                .setDescription(`Auto-redemption completed for your account.`)
                .setTimestamp()
                .setFooter({ text: 'Gacha Coupon System', iconURL: RAPI_BOT_THUMBNAIL_URL });

            // Summary fields
            const summaryFields = [
                { name: '✅ Successful', value: `${successful.length}`, inline: true }
            ];
            if (alreadyRedeemed.length > 0) {
                summaryFields.push({ name: '🔄 Already Redeemed', value: `${alreadyRedeemed.length}`, inline: true });
            }
            if (expired.length > 0) {
                summaryFields.push({ name: '⏰ Expired', value: `${expired.length}`, inline: true });
            }
            if (actualFailures.length > 0) {
                summaryFields.push({ name: '❌ Failed', value: `${actualFailures.length}`, inline: true });
            }
            embed.addFields(...summaryFields);

            // Detailed lists
            if (successful.length > 0) {
                const successList = successful.map(r => `• \`${r.code}\``).join('\n');
                embed.addFields({ name: '✅ Redeemed Codes', value: successList.substring(0, 1024) });
            }

            if (alreadyRedeemed.length > 0) {
                const redeemedList = alreadyRedeemed.map(r => `• \`${r.code}\``).join('\n');
                embed.addFields({ name: '🔄 Already Redeemed', value: redeemedList.substring(0, 1024) });
            }

            if (expired.length > 0) {
                const expiredList = expired.map(r => `• \`${r.code}\``).join('\n');
                embed.addFields({ name: '⏰ Expired Codes', value: expiredList.substring(0, 1024) });
            }

            if (actualFailures.length > 0) {
                const failList = actualFailures.map(r => `• \`${r.code}\`: ${r.message}`).join('\n');
                embed.addFields({ name: '❌ Failed Codes', value: failList.substring(0, 1024) });

                // Add personalized manual redemption link only for actual failures
                if (gameConfig.manualRedeemUrl && gameUserId) {
                    const personalizedUrl = `${gameConfig.manualRedeemUrl}&userId=${encodeURIComponent(gameUserId)}`;
                    embed.addFields({
                        name: '📌 Manual Redemption',
                        value: `[Click here to redeem manually](${personalizedUrl})`,
                    });
                }
            }

            await this.sendDMWithDelay(user, { embeds: [embed] });
        } catch (error) {
            gachaLogger.error`Failed to send redemption DM to ${discordId}: ${error}`;
        }
    }

    /**
     * Send DM when user has already redeemed all available codes
     * Includes a 🔁 reaction for requesting a force re-run (once per week)
     */
    private async sendAllCodesRedeemedDM(
        bot: Client,
        discordId: string,
        gameId: GachaGameId,
        totalActiveCodes: number,
        gameUserId?: string
    ): Promise<void> {
        try {
            const user = await bot.users.fetch(discordId);
            const gameConfig = getGameConfig(gameId);
            const dataService = getGachaDataService();

            // Check if user can request a re-run
            const rerunStatus = await dataService.canForceRerun(discordId, gameId);

            const embed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle(`✅ ${gameConfig.shortName} - All Codes Redeemed`)
                .setThumbnail(gameConfig.logoPath)
                .setDescription(`You've already redeemed all **${totalActiveCodes}** available coupon codes!`)
                .addFields(
                    { name: '📊 Status', value: 'No new codes to redeem', inline: true },
                    { name: '🎮 Account', value: gameUserId || 'Unknown', inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'Gacha Coupon System', iconURL: RAPI_BOT_THUMBNAIL_URL });

            // Add re-run information
            if (rerunStatus.allowed) {
                embed.addFields({
                    name: `${RERUN_EMOJI} Request Re-run`,
                    value: 'React with 🔁 to reset your redeemed codes and try again.\n*This can only be done once per week.*',
                });
            } else if (rerunStatus.cooldownRemaining) {
                const nextAvailable = await dataService.getNextForceRerunTime(discordId, gameId);
                const timeStr = nextAvailable
                    ? `<t:${Math.floor(nextAvailable.getTime() / 1000)}:R>`
                    : 'in about a week';
                embed.addFields({
                    name: `${RERUN_EMOJI} Re-run Cooldown`,
                    value: `You can request another re-run ${timeStr}.`,
                });
            }

            // Add manual redemption link
            if (gameConfig.manualRedeemUrl && gameUserId) {
                const personalizedUrl = `${gameConfig.manualRedeemUrl}&userId=${encodeURIComponent(gameUserId)}`;
                embed.addFields({
                    name: '📌 Manual Redemption',
                    value: `[Redeem codes manually](${personalizedUrl})`,
                });
            }

            const message = await user.send({ embeds: [embed] });

            // Add reaction for re-run if allowed
            if (rerunStatus.allowed) {
                await message.react(RERUN_EMOJI);
                this.setupRerunReactionCollector(bot, message, discordId, gameId, gameUserId);
            }

            await new Promise(resolve => setTimeout(resolve, GACHA_CONFIG.DM_RATE_LIMIT_DELAY));
        } catch (error) {
            gachaLogger.error`Failed to send all-codes-redeemed DM to ${discordId}: ${error}`;
        }
    }

    /**
     * Set up a reaction collector to handle force re-run requests
     */
    private setupRerunReactionCollector(
        bot: Client,
        message: Message,
        discordId: string,
        gameId: GachaGameId,
        gameUserId?: string
    ): void {
        const filter = (reaction: any, user: User) => {
            return reaction.emoji.name === RERUN_EMOJI && user.id === discordId;
        };

        const collector = message.createReactionCollector({
            filter,
            max: 1,
            time: GACHA_CONFIG.FORCE_RERUN_REACTION_TIMEOUT,
        });

        collector.on('collect', async () => {
            gachaLogger.debug`[Force Rerun] User ${discordId} requested re-run for ${gameId}`;
            await this.processForceRerun(bot, discordId, gameId, gameUserId);
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                // Remove the reaction after timeout if no one clicked
                message.reactions.removeAll().catch(() => {});
            }
        });
    }

    /**
     * Process a force re-run request from a user
     */
    private async processForceRerun(
        bot: Client,
        discordId: string,
        gameId: GachaGameId,
        gameUserId?: string
    ): Promise<void> {
        const dataService = getGachaDataService();
        const gameConfig = getGameConfig(gameId);

        try {
            // Double-check cooldown (in case of race conditions)
            const canRerun = await dataService.canForceRerun(discordId, gameId);
            if (!canRerun.allowed) {
                const user = await bot.users.fetch(discordId);
                await user.send({
                    embeds: [new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle(`❌ ${gameConfig.shortName} Re-run Denied`)
                        .setDescription('You have already used your weekly re-run. Please wait before trying again.')
                        .setTimestamp()
                    ]
                });
                return;
            }

            // Record the force re-run (resets redeemed codes)
            await dataService.recordForceRerun(discordId, gameId);

            // Send confirmation DM
            const user = await bot.users.fetch(discordId);
            await user.send({
                embeds: [new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle(`${RERUN_EMOJI} ${gameConfig.shortName} Re-run Started`)
                    .setThumbnail(gameConfig.logoPath)
                    .setDescription('Your redeemed codes have been reset. Starting fresh redemption...')
                    .setTimestamp()
                    .setFooter({ text: 'Gacha Coupon System', iconURL: RAPI_BOT_THUMBNAIL_URL })
                ]
            });

            // Get fresh data and process redemptions
            const activeCoupons = await dataService.getActiveCoupons(gameId);
            const subscription = await dataService.getGameSubscription(discordId, gameId);

            if (!subscription || !gameUserId) {
                gachaLogger.warning`[Force Rerun] No subscription found for ${discordId} in ${gameId}`;
                return;
            }

            const codes = activeCoupons.map(c => c.code);
            if (codes.length === 0) {
                await user.send({
                    embeds: [new EmbedBuilder()
                        .setColor(0xFFA500)
                        .setTitle(`📭 ${gameConfig.shortName} - No Codes Available`)
                        .setDescription('There are currently no active coupon codes to redeem.')
                        .setTimestamp()
                    ]
                });
                return;
            }

            // Redeem all codes
            const results = await this.redeemMultipleCodes(gameId, gameUserId, codes);

            // Mark successful codes as redeemed
            const successfulCodes = results.filter(r => r.success).map(r => r.code);
            if (successfulCodes.length > 0) {
                await dataService.markCodesRedeemed(discordId, gameId, successfulCodes);
            }

            // Send results DM
            await this.sendRedemptionResultsDM(bot, discordId, gameId, results, gameUserId);

        } catch (error) {
            gachaLogger.error`[Force Rerun] Error processing re-run for ${discordId}: ${error}`;
            try {
                const user = await bot.users.fetch(discordId);
                await user.send({
                    embeds: [new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle(`❌ ${gameConfig.shortName} Re-run Failed`)
                        .setDescription('An error occurred while processing your re-run request. Please try again later.')
                        .setTimestamp()
                    ]
                });
            } catch {
                // Ignore DM failures
            }
        }
    }

    /**
     * Notify subscribers about a new coupon code
     * Uses Promise.allSettled for graceful partial failure handling
     * Respects user notification preferences and DM status
     */
    public async notifyNewCode(bot: Client, coupon: GachaCoupon): Promise<void> {
        const dataService = getGachaDataService();
        const gameConfig = getGameConfig(coupon.gameId);
        const reactionService = getReactionConfirmationService();
        const channelMonitorService = getChannelMonitorService();

        // Skip notification if code is already expired (handles edge case of codes added with past dates)
        if (coupon.expirationDate && new Date(coupon.expirationDate) <= new Date()) {
            return;
        }

        // Use optimized batch method that includes preferences and DM status
        const subscribers = await dataService.getSubscribersForNotification(coupon.gameId);

        // Check if this game uses reaction-based confirmation (no auto-redeem)
        const usesReactionConfirmation = reactionService.supportsReactionConfirmation(coupon.gameId);

        // Build the embed
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`🆕 New ${gameConfig.shortName} Coupon Code!`)
            .setThumbnail(gameConfig.logoPath)
            .setDescription('A new coupon code has been added.')
            .addFields(
                { name: 'Code', value: `\`${coupon.code}\``, inline: true },
                { name: 'Rewards', value: coupon.rewards, inline: true }
            )
            .setTimestamp();

        // For reaction-based games, use Discord timestamp format and add metadata to footer
        if (usesReactionConfirmation) {
            if (coupon.expirationDate) {
                const discordTimestamp = channelMonitorService.toDiscordTimestamp(coupon.expirationDate, 'R');
                embed.addFields({ name: '⏰ Expires', value: discordTimestamp, inline: true });
            }

            // Add redemption instructions for manual games
            embed.addFields({
                name: '📌 How to Redeem',
                value: 'Redeem in-game: Settings > Account > Redeem Coupon',
            });

            // Add reaction instructions
            embed.addFields({
                name: '📝 Track This Code',
                value: reactionService.getReactionInstructions(),
            });

            // Clean footer with game name (code is parsed from embed content)
            const footerText = reactionService.buildFooterText('Gacha Coupon System', coupon.gameId);
            embed.setFooter({ text: footerText, iconURL: RAPI_BOT_THUMBNAIL_URL });
        } else {
            // Standard footer for auto-redeem games
            embed.setFooter({ text: 'Gacha Coupon System', iconURL: RAPI_BOT_THUMBNAIL_URL });

            if (coupon.expirationDate) {
                const expiry = new Date(coupon.expirationDate).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric'
                });
                embed.addFields({ name: '⏰ Expires', value: expiry, inline: true });
            }
        }

        if (coupon.source) {
            embed.addFields({ name: '📍 Source', value: coupon.source, inline: true });
        }

        // Collect history entries for batch write
        const historyEntries: RedemptionHistoryEntry[] = [];

        // Process notification-only subscribers with Promise.allSettled
        // Respects user notification preferences and DM status
        const notifyOnlySubs = subscribers.filter(s => s.subscription.mode === 'notification-only');
        const notifyResults = await Promise.allSettled(
            notifyOnlySubs.map(({ discordId, preferences, dmDisabled }) =>
                this.subscriberLimit(async () => {
                    // Skip if DMs are disabled or user opted out
                    if (dmDisabled || preferences?.newCodeAlerts === false) {
                        return;
                    }

                    const user = await bot.users.fetch(discordId);
                    const message = await this.sendDMWithDelay(user, { embeds: [embed] }, coupon.gameId);

                    // Add reaction buttons for manual confirmation games
                    if (usesReactionConfirmation && message) {
                        await reactionService.addReactionButtons(message);
                    }
                })
            )
        );

        // Log any notification failures
        notifyResults.forEach((result, index) => {
            if (result.status === 'rejected') {
                gachaLogger.error`Failed to notify ${notifyOnlySubs[index].discordId} about new code: ${result.reason}`;
            }
        });

        // Process auto-redeem subscribers with Promise.allSettled
        if (this.supportsAutoRedeem(coupon.gameId)) {
            const autoRedeemSubs = subscribers.filter(s => s.subscription.mode === 'auto-redeem');
            const redeemResults = await Promise.allSettled(
                autoRedeemSubs.map(({ discordId, subscription, dmDisabled }) =>
                    this.subscriberLimit(async () => {
                        const result = await this.redeemCode(coupon.gameId, subscription.gameUserId, coupon.code);

                        if (result.success) {
                            await dataService.markCodesRedeemed(discordId, coupon.gameId, [coupon.code]);
                        }

                        // Log history entry
                        historyEntries.push({
                            discordId,
                            gameId: coupon.gameId,
                            code: coupon.code,
                            timestamp: result.timestamp,
                            success: result.success,
                            errorCode: result.errorCode,
                            method: 'auto',
                        });

                        // Send DM only if not disabled
                        if (!dmDisabled) {
                            await this.sendRedemptionResultsDM(bot, discordId, coupon.gameId, [result], subscription.gameUserId);
                        }
                    })
                )
            );

            // Log any redemption failures
            redeemResults.forEach((result, index) => {
                if (result.status === 'rejected') {
                    gachaLogger.error`Failed to auto-redeem for ${autoRedeemSubs[index].discordId}: ${result.reason}`;
                }
            });
        }

        // Batch write redemption history
        if (historyEntries.length > 0) {
            await dataService.addBatchRedemptionHistory(historyEntries);
        }
    }

    /**
     * Send expiration warning DMs for a game
     * Uses Promise.allSettled for graceful partial failure handling
     * Respects user notification preferences and DM status
     * For reaction-based games, sends individual DMs per code with reaction buttons
     */
    public async sendExpirationWarnings(bot: Client, gameId: GachaGameId): Promise<void> {
        const dataService = getGachaDataService();
        const gameConfig = getGameConfig(gameId);
        const reactionService = getReactionConfirmationService();
        const channelMonitorService = getChannelMonitorService();
        const expiringCoupons = await dataService.getExpiringCoupons(gameId, 3);

        if (expiringCoupons.length === 0) return;

        // Check if this game uses reaction-based confirmation
        const usesReactionConfirmation = reactionService.supportsReactionConfirmation(gameId);

        // Use optimized batch method that includes preferences and DM status
        const subscribers = await dataService.getSubscribersForNotification(gameId);

        const results = await Promise.allSettled(
            subscribers.map(({ discordId, subscription, preferences, dmDisabled }) =>
                this.subscriberLimit(async () => {
                    // Skip if DMs disabled or user opted out
                    if (dmDisabled || preferences?.expirationWarnings === false) {
                        return { discordId, sent: false, reason: 'disabled' };
                    }

                    // Filter out redeemed codes
                    let unredeemed = expiringCoupons.filter(
                        c => !subscription.redeemedCodes.includes(c.code.toUpperCase())
                    );

                    // For reaction-based games, also filter out ignored codes
                    if (usesReactionConfirmation && subscription.ignoredCodes) {
                        unredeemed = unredeemed.filter(
                            c => !subscription.ignoredCodes!.includes(c.code.toUpperCase())
                        );
                    }

                    if (unredeemed.length === 0) return { discordId, sent: false };

                    const user = await bot.users.fetch(discordId);

                    // For reaction-based games, send individual DMs per code
                    if (usesReactionConfirmation) {
                        for (const coupon of unredeemed.slice(0, 5)) { // Limit to 5 to avoid spam
                            const discordTimestamp = channelMonitorService.toDiscordTimestamp(coupon.expirationDate, 'R');

                            const embed = new EmbedBuilder()
                                .setColor(0xFFA500)
                                .setTitle(`⚠️ ${gameConfig.shortName} Code Expiring Soon!`)
                                .setThumbnail(gameConfig.logoPath)
                                .setDescription(`**Code:** \`${coupon.code}\`\n**Rewards:** ${coupon.rewards}`)
                                .addFields({ name: '⏰ Expires', value: discordTimestamp, inline: true })
                                .addFields({
                                    name: '📌 How to Redeem',
                                    value: 'Redeem in-game: Settings > Account > Redeem Coupon',
                                })
                                .addFields({
                                    name: '📝 Track This Code',
                                    value: reactionService.getReactionInstructions(),
                                })
                                .setTimestamp();

                            // Clean footer with game name (code is parsed from embed content)
                            const footerText = reactionService.buildFooterText('Gacha Coupon System', gameId);
                            embed.setFooter({ text: footerText, iconURL: RAPI_BOT_THUMBNAIL_URL });

                            const message = await this.sendDMWithDelay(user, { embeds: [embed] }, gameId);
                            if (message) {
                                await reactionService.addReactionButtons(message);
                            }
                        }
                        return { discordId, sent: true };
                    }

                    // Standard batch expiration warning for auto-redeem games
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

                    await this.sendDMWithDelay(user, { embeds: [embed] }, gameId);
                    return { discordId, sent: true };
                })
            )
        );

        // Log any failures
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                gachaLogger.error`Failed to send expiration warning to ${subscribers[index].discordId}: ${result.reason}`;
            }
        });
    }

    /**
     * Send weekly digest DMs for a game
     * Uses Promise.allSettled for graceful partial failure handling
     * Respects user notification preferences and DM status
     */
    public async sendWeeklyDigest(bot: Client, gameId: GachaGameId): Promise<void> {
        const dataService = getGachaDataService();
        const gameConfig = getGameConfig(gameId);
        // Use optimized batch method that includes preferences and DM status
        const subscribers = await dataService.getSubscribersForNotification(gameId);
        const activeCoupons = await dataService.getActiveCoupons(gameId);
        const expiringCoupons = await dataService.getExpiringCoupons(gameId, 7);

        const results = await Promise.allSettled(
            subscribers.map(({ discordId, subscription, preferences, dmDisabled }) =>
                this.subscriberLimit(async () => {
                    // Skip if DMs disabled or user opted out
                    if (dmDisabled || preferences?.weeklyDigest === false) {
                        return { discordId, sent: false, reason: 'disabled' };
                    }

                    // Get unredeemed codes first - skip DM if user has none pending
                    const unredeemed = await dataService.getUnredeemedCodes(discordId, gameId);
                    if (unredeemed.length === 0) {
                        return { discordId, sent: false, reason: 'no-unredeemed-codes' };
                    }

                    const user = await bot.users.fetch(discordId);

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
                    await this.sendDMWithDelay(user, { embeds: [embed] }, gameId);
                    return { discordId, sent: true };
                })
            )
        );

        // Log any failures
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                gachaLogger.error`Failed to send weekly digest to ${subscribers[index].discordId}: ${result.reason}`;
            }
        });
    }
}

/**
 * Get the singleton instance
 */
export const getGachaRedemptionService = (): GachaRedemptionService => GachaRedemptionService.getInstance();
