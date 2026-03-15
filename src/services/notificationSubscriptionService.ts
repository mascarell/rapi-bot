import {
    Client,
    EmbedBuilder,
    Message,
    MessageReaction,
    PartialMessageReaction,
    PartialUser,
    User,
} from 'discord.js';
import {
    NotificationType,
    NotificationTypeConfig,
} from '../utils/interfaces/NotificationSubscription.interface.js';
import { getNotificationSubscriptionDataService } from './notificationSubscriptionDataService.js';
import { sendDMSafe } from '../utils/dmSender.js';
import { NOTIFICATION_CONFIG, NOTIFICATION_TYPE_FOOTER_REGEX } from '../utils/data/notificationConfig.js';
import { logger } from '../utils/logger.js';

/**
 * Result of sending notifications to subscribers
 */
export interface NotificationSendResult {
    sent: number;
    failed: number;
    dmDisabled: number;
}

/**
 * Central notification subscription service.
 *
 * Manages notification type registry, subscribe/unsubscribe via reactions,
 * and DM delivery to subscribers. Completely independent from the gacha
 * coupon subscription system.
 */
export class NotificationSubscriptionService {
    private static instance: NotificationSubscriptionService;

    /** Registry of notification types */
    private typeRegistry: Map<NotificationType, NotificationTypeConfig> = new Map();

    /** In-memory map: messageId → notificationType (for fast reaction lookup) */
    private messageTypeMap: Map<string, NotificationType> = new Map();

    /** Dedup set to prevent double-subscribe race conditions */
    private processingSet: Set<string> = new Set();

    private constructor() {}

    public static getInstance(): NotificationSubscriptionService {
        if (!NotificationSubscriptionService.instance) {
            NotificationSubscriptionService.instance = new NotificationSubscriptionService();
        }
        return NotificationSubscriptionService.instance;
    }

    // ──── Type Registry ────

    /**
     * Register a notification type. Call during service initialization.
     */
    public registerNotificationType(config: NotificationTypeConfig): void {
        this.typeRegistry.set(config.type, config);
        logger.debug`[Notifications] Registered type: ${config.type} (${config.displayName})`;
    }

    /**
     * Get a registered notification type config
     */
    public getNotificationType(type: NotificationType): NotificationTypeConfig | undefined {
        return this.typeRegistry.get(type);
    }

    /**
     * Get all registered notification types
     */
    public getAllNotificationTypes(): NotificationTypeConfig[] {
        return [...this.typeRegistry.values()];
    }

    // ──── Subscription ────

    /**
     * Subscribe a user to a notification type
     */
    public async subscribe(
        discordId: string,
        guildId: string,
        notificationType: NotificationType
    ): Promise<{ success: boolean; message: string }> {
        const typeConfig = this.typeRegistry.get(notificationType);
        if (!typeConfig) {
            return { success: false, message: 'Unknown notification type.' };
        }

        const dataService = getNotificationSubscriptionDataService();
        const added = await dataService.addSubscription(discordId, guildId, notificationType);

        if (!added) {
            return { success: false, message: `You are already subscribed to **${typeConfig.displayName}** notifications.` };
        }

        return { success: true, message: `Subscribed to **${typeConfig.displayName}** DM notifications!` };
    }

    /**
     * Unsubscribe a user from a notification type
     */
    public async unsubscribe(
        discordId: string,
        notificationType: NotificationType
    ): Promise<{ success: boolean; message: string }> {
        const typeConfig = this.typeRegistry.get(notificationType);
        const displayName = typeConfig?.displayName || notificationType;

        const dataService = getNotificationSubscriptionDataService();
        const removed = await dataService.removeSubscription(discordId, notificationType);

        if (!removed) {
            return { success: false, message: `You are not subscribed to **${displayName}** notifications.` };
        }

        return { success: true, message: `Unsubscribed from **${displayName}** DM notifications.` };
    }

    // ──── Notification Sending ────

    /**
     * Send a notification DM to all subscribers of a given type.
     * Adds unsubscribe reaction and footer tag to each DM.
     */
    public async sendNotification(
        bot: Client,
        notificationType: NotificationType,
        embed: EmbedBuilder
    ): Promise<NotificationSendResult> {
        const dataService = getNotificationSubscriptionDataService();
        const subscribers = await dataService.getSubscribers(notificationType);
        const typeConfig = this.typeRegistry.get(notificationType);

        const result: NotificationSendResult = { sent: 0, failed: 0, dmDisabled: 0 };

        if (subscribers.length === 0) return result;

        // Append footer tag for unsubscribe parsing
        const footerText = embed.data.footer?.text || '';
        const taggedFooter = footerText
            ? `${footerText} | [type:${notificationType}]`
            : `[type:${notificationType}]`;
        embed.setFooter({
            text: taggedFooter,
            iconURL: embed.data.footer?.icon_url,
        });

        // Add unsubscribe instruction as last field
        embed.addFields({
            name: '\u200B', // zero-width space separator
            value: `_React ${NOTIFICATION_CONFIG.UNSUBSCRIBE_EMOJI} to unsubscribe from ${typeConfig?.displayName || notificationType} DM notifications._`,
            inline: false,
        });

        for (const sub of subscribers) {
            if (sub.dmDisabled) {
                result.dmDisabled++;
                continue;
            }

            try {
                const user = await bot.users.fetch(sub.discordId);
                const sentMessage = await sendDMSafe(user, { embeds: [EmbedBuilder.from(embed.data)] }, {
                    onDMDisabled: async (userId) => {
                        await dataService.markDMDisabled(userId, notificationType);
                    },
                    onDMSuccess: async (userId) => {
                        await dataService.clearDMDisabled(userId, notificationType);
                    },
                });

                if (sentMessage) {
                    // Seed unsubscribe reaction
                    try {
                        await sentMessage.react(NOTIFICATION_CONFIG.UNSUBSCRIBE_EMOJI);
                    } catch {
                        // Non-critical — DM was still sent
                    }
                    result.sent++;
                } else {
                    result.failed++;
                }
            } catch (error) {
                logger.error`[Notifications] Failed to send DM to ${sub.discordId}: ${error}`;
                result.failed++;
            }
        }

        return result;
    }

    // ──── Reaction Seeding ────

    /**
     * Add subscribe reaction to a channel message and track the mapping.
     */
    public async seedSubscribeReaction(
        message: Message,
        notificationType: NotificationType
    ): Promise<void> {
        try {
            await message.react(NOTIFICATION_CONFIG.SUBSCRIBE_EMOJI);

            // Track messageId → type for fast lookup on reaction
            this.messageTypeMap.set(message.id, notificationType);

            // Cleanup if map grows too large
            if (this.messageTypeMap.size > NOTIFICATION_CONFIG.MESSAGE_TYPE_MAP_MAX_SIZE) {
                const entries = [...this.messageTypeMap.entries()];
                const toDelete = entries.slice(0, Math.floor(entries.length / 2));
                for (const [key] of toDelete) {
                    this.messageTypeMap.delete(key);
                }
            }
        } catch (error) {
            logger.warn`[Notifications] Failed to seed subscribe reaction: ${error}`;
        }
    }

    // ──── Reaction Event Handling ────

    /**
     * Start listening for reaction events. Call once during initialization.
     */
    public startListening(bot: Client): void {
        bot.on('messageReactionAdd', async (reaction, user) => {
            try {
                await this.handleReaction(reaction, user, bot);
            } catch (error) {
                logger.error`[Notifications] Error in reaction handler: ${error}`;
            }
        });
    }

    /**
     * Route a reaction to the appropriate handler
     */
    private async handleReaction(
        reaction: MessageReaction | PartialMessageReaction,
        user: User | PartialUser,
        bot: Client
    ): Promise<void> {
        if (user.bot) return;

        // Fetch partials
        if (reaction.partial) {
            try { await reaction.fetch(); } catch { return; }
        }
        let message = reaction.message;
        if (message.partial) {
            try { message = await message.fetch(); } catch { return; }
        }

        // Only handle bot's messages
        if (message.author?.id !== bot.user?.id) return;

        const emoji = reaction.emoji.name;
        if (!emoji) return;

        if (!message.channel.isDMBased() && emoji === NOTIFICATION_CONFIG.SUBSCRIBE_EMOJI) {
            await this.handleSubscribeReaction(message as Message, user, bot);
        } else if (message.channel.isDMBased() && emoji === NOTIFICATION_CONFIG.UNSUBSCRIBE_EMOJI) {
            await this.handleUnsubscribeReaction(message as Message, user);
        }
    }

    /**
     * Handle ✉️ reaction on a channel message → subscribe user
     */
    private async handleSubscribeReaction(
        message: Message,
        user: User | PartialUser,
        bot: Client
    ): Promise<void> {
        // Determine notification type from memory map or footer
        let notificationType = this.messageTypeMap.get(message.id);

        if (!notificationType) {
            notificationType = this.parseNotificationTypeFromEmbed(message);
            if (!notificationType) return;
        }

        const guildId = message.guildId;
        if (!guildId) return;

        // Dedup concurrent reactions
        const dedupKey = `${user.id}:${notificationType}`;
        if (this.processingSet.has(dedupKey)) return;
        this.processingSet.add(dedupKey);

        try {
            const result = await this.subscribe(user.id, guildId, notificationType);
            const typeConfig = this.typeRegistry.get(notificationType);

            // Send confirmation DM
            const fullUser = user.partial ? await bot.users.fetch(user.id) : user;
            const confirmEmbed = new EmbedBuilder()
                .setTitle(result.success ? 'Subscribed!' : 'Already Subscribed')
                .setDescription(result.message)
                .setColor(result.success ? 0x00FF00 : 0xFFA500)
                .setTimestamp();

            if (typeConfig?.thumbnailUrl) {
                confirmEmbed.setThumbnail(typeConfig.thumbnailUrl);
            }

            await sendDMSafe(fullUser, { embeds: [confirmEmbed] });
        } catch (error) {
            logger.error`[Notifications] Subscribe reaction error for ${user.id}: ${error}`;
        } finally {
            this.processingSet.delete(dedupKey);
        }
    }

    /**
     * Handle ❌ reaction on a DM message → unsubscribe user
     */
    private async handleUnsubscribeReaction(
        message: Message,
        user: User | PartialUser
    ): Promise<void> {
        const notificationType = this.parseNotificationTypeFromEmbed(message);
        if (!notificationType) return; // Not a notification DM — let gacha service handle it

        const dedupKey = `${user.id}:${notificationType}`;
        if (this.processingSet.has(dedupKey)) return;
        this.processingSet.add(dedupKey);

        try {
            const result = await this.unsubscribe(user.id, notificationType);
            const typeConfig = this.typeRegistry.get(notificationType);

            // Edit the original DM to show unsubscribed status
            try {
                const updatedEmbed = EmbedBuilder.from(message.embeds[0])
                    .setColor(0x808080) // Gray
                    .setFooter({ text: `Unsubscribed from ${typeConfig?.displayName || notificationType}` });
                await message.edit({ embeds: [updatedEmbed] });
            } catch {
                // Message may be too old to edit — non-critical
            }

            logger.debug`[Notifications] ${user.id} unsubscribed from ${notificationType}: ${result.message}`;
        } catch (error) {
            logger.error`[Notifications] Unsubscribe reaction error for ${user.id}: ${error}`;
        } finally {
            this.processingSet.delete(dedupKey);
        }
    }

    /**
     * Parse notification type from message embed footer tag [type:...]
     */
    private parseNotificationTypeFromEmbed(message: Message): NotificationType | undefined {
        const embed = message.embeds[0];
        if (!embed?.footer?.text) return undefined;

        const match = embed.footer.text.match(NOTIFICATION_TYPE_FOOTER_REGEX);
        if (!match) return undefined;

        const type = match[1];
        // Only handle types we know about
        return this.typeRegistry.has(type) ? type : undefined;
    }
}

export const getNotificationSubscriptionService = (): NotificationSubscriptionService =>
    NotificationSubscriptionService.getInstance();
