import { Client } from 'discord.js';
import { DailyResetService } from '../services/dailyResetService.js';
import { dailyResetServiceConfig } from '../utils/data/gamesResetConfig.js';
import { GachaCouponScheduler } from '../services/gachaCouponScheduler.js';
import { getChannelMonitorService } from '../services/channelMonitorService.js';
import { getReactionConfirmationService } from '../services/reactionConfirmationService.js';
import { getRulesManagementService } from '../services/rulesManagementService.js';
import { YouTubeNotificationScheduler } from '../services/youtubeNotificationScheduler.js';
import { PvpReminderService } from '../services/pvpReminderService.js';
import { pvpReminderServiceConfig } from '../utils/data/pvpEventsConfig.js';
import { getNotificationSubscriptionService } from '../services/notificationSubscriptionService.js';
import { GACHA_GAMES } from '../utils/data/gachaGamesConfig.js';
import { AssetSyncScheduler } from '../services/assetSync/index.js';
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

        // Initialize reaction confirmation service for manual redemption tracking
        const reactionConfirmationService = getReactionConfirmationService();
        reactionConfirmationService.startListening(bot);
        logger.info`Reaction confirmation service initialized`;

        // Parallelize S3-dependent service initialization
        const channelMonitorService = getChannelMonitorService();
        const rulesManagementService = getRulesManagementService();
        const youtubeScheduler = new YouTubeNotificationScheduler(bot);

        const [, rulesResult] = await Promise.all([
            channelMonitorService.initialize(),
            rulesManagementService.initializeRulesMessage(bot),
            youtubeScheduler.initializeSchedules(),
        ]);

        channelMonitorService.startMonitoring(bot);
        logger.info`Channel monitor service initialized`;

        if (!rulesResult.success) {
            logger.warning`Rules management skipped (not in primary server or missing permissions): ${rulesResult.error}`;
        } else {
            logger.info`Rules management service initialized`;
        }

        logger.info`YouTube notification scheduler initialized`;

        // Initialize notification subscription service (DM opt-in via reactions)
        const notificationService = getNotificationSubscriptionService();
        notificationService.registerNotificationType({
            type: 'pvp-warning:bd2-mirror-wars',
            displayName: 'BD2 Mirror Wars PVP',
            description: 'Weekly PVP season end reminders for Brown Dust 2',
            embedColor: 0x8B4513,
        });

        notificationService.registerNotificationType({
            type: 'pvp-warning:lost-sword-avalon',
            displayName: 'Lost Sword Avalon',
            description: 'Biweekly Avalon castle raid reset reminders for Lost Sword',
            embedColor: 0xFFD700,
        });

        notificationService.registerNotificationType({
            type: 'pvp-warning:lost-sword-star-reincarnation',
            displayName: 'Lost Sword Star Reincarnation',
            description: 'Biweekly Star Reincarnation endgame raid reset reminders for Lost Sword',
            embedColor: 0x9B59B6,
        });

        // Register daily reset notification types for each game
        for (const gameConfig of dailyResetServiceConfig.games) {
            if (gameConfig.notificationType) {
                notificationService.registerNotificationType({
                    type: gameConfig.notificationType,
                    displayName: `${gameConfig.game} Daily Reset`,
                    description: `Daily reset reminders for ${gameConfig.game}`,
                    embedColor: gameConfig.embedConfig.color,
                    thumbnailUrl: gameConfig.embedConfig.thumbnail,
                });
            }
        }

        // Register coupon alert notification types for each gacha game
        for (const game of Object.values(GACHA_GAMES)) {
            notificationService.registerNotificationType({
                type: `coupon-alert:${game.id}`,
                displayName: `${game.shortName} Coupon Alerts`,
                description: `New coupon code alerts for ${game.name}`,
                embedColor: game.embedColor,
                thumbnailUrl: game.logoPath,
            });
        }

        notificationService.startListening(bot);
        logger.info`Notification subscription service initialized`;

        // Initialize PVP reminder service (weekly event warnings)
        const pvpReminderService = new PvpReminderService(bot, pvpReminderServiceConfig);
        pvpReminderService.initializeSchedules();
        logger.info`PVP reminder service initialized`;

        // Initialize asset sync scheduler (periodic character art sync from external APIs)
        const assetSyncScheduler = new AssetSyncScheduler({
            devSyncIntervalMinutes: 10,
        });
        assetSyncScheduler.initializeSchedules();
        logger.info`Asset sync scheduler initialized`;

        logger.info`All services initialized successfully`;
    } catch (error) {
        logger.error`Failed to initialize services: ${error}`;
        throw error;
    }
}
