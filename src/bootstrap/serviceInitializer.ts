import { Client } from 'discord.js';
import { DailyResetService } from '../services/dailyResetService.js';
import { dailyResetServiceConfig } from '../utils/data/gamesResetConfig.js';
import { GachaCouponScheduler } from '../services/gachaCouponScheduler.js';
import { getChannelMonitorService } from '../services/channelMonitorService.js';
import { getReactionConfirmationService } from '../services/reactionConfirmationService.js';
import { getRulesManagementService } from '../services/rulesManagementService.js';
import { logger } from '../utils/logger.js';

/**
 * Initialize all bot services on startup
 */
export async function initializeServices(bot: Client): Promise<void> {
    logger.info`Initializing bot services...`;

    try {
        // Initialize daily reset service
        const dailyResetService = new DailyResetService(bot, dailyResetServiceConfig);
        dailyResetService.initializeSchedules();
        logger.info`Daily reset service initialized`;

        // Initialize gacha coupon scheduler (supports multiple games)
        // Dev mode config: shorter intervals and optional startup trigger for testing
        const gachaCouponScheduler = new GachaCouponScheduler(bot, {
            weeklyDigestInterval: 10,       // Every 10 min in dev (prod: Sundays 12:00 UTC)
            expirationWarningInterval: 5,   // Every 5 min in dev (prod: daily 09:00 UTC)
            autoRedemptionInterval: 3,      // Every 3 min in dev (prod: every 6 hours)
            triggerOnStartup: false,        // Set to true to trigger all tasks on bot start
            startupDelay: 10,               // Seconds to wait before startup trigger
        });
        gachaCouponScheduler.initializeSchedules();
        logger.info`Gacha coupon scheduler initialized`;

        // Initialize channel monitor service for coupon announcements (e.g., Lost Sword)
        const channelMonitorService = getChannelMonitorService();
        await channelMonitorService.initialize();
        channelMonitorService.startMonitoring(bot);
        logger.info`Channel monitor service initialized`;

        // Initialize reaction confirmation service for manual redemption tracking
        const reactionConfirmationService = getReactionConfirmationService();
        reactionConfirmationService.startListening(bot);
        logger.info`Reaction confirmation service initialized`;

        // Initialize rules management service (primary server only)
        // This will fail gracefully in dev if bot is not in the primary server
        const rulesManagementService = getRulesManagementService();
        const rulesResult = await rulesManagementService.initializeRulesMessage(bot);
        if (!rulesResult.success) {
            logger.warning`Rules management skipped (not in primary server or missing permissions): ${rulesResult.error}`;
        } else {
            logger.info`Rules management service initialized`;
        }

        logger.info`All services initialized successfully`;
    } catch (error) {
        logger.error`Failed to initialize services: ${error}`;
        throw error;
    }
}
