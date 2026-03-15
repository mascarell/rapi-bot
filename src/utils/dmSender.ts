import { EmbedBuilder, Message, User } from 'discord.js';
import { logger } from './logger.js';
import { NOTIFICATION_CONFIG } from './data/notificationConfig.js';

/**
 * Send a DM safely with rate limiting and error handling.
 *
 * Handles Discord error 50007 (user has DMs disabled) via callbacks,
 * allowing each caller to track DM failures in their own data store.
 *
 * @returns The sent Message if successful, null if failed
 */
export async function sendDMSafe(
    user: User,
    content: { embeds: EmbedBuilder[] },
    options?: {
        /** Called when DM sending fails with error 50007 */
        onDMDisabled?: (userId: string) => Promise<void>;
        /** Called on successful send (useful for clearing previous DM-disabled flags) */
        onDMSuccess?: (userId: string) => Promise<void>;
        /** Rate limit delay in ms (defaults to NOTIFICATION_CONFIG.DM_RATE_LIMIT_DELAY) */
        rateLimitDelay?: number;
    }
): Promise<Message | null> {
    try {
        const message = await user.send(content);
        const delay = options?.rateLimitDelay ?? NOTIFICATION_CONFIG.DM_RATE_LIMIT_DELAY;
        await new Promise(resolve => setTimeout(resolve, delay));

        if (options?.onDMSuccess) {
            await options.onDMSuccess(user.id);
        }

        return message;
    } catch (error: any) {
        if (error.code === 50007) {
            logger.warning`Cannot send DM to ${user.id} - user has DMs disabled`;
            if (options?.onDMDisabled) {
                await options.onDMDisabled(user.id);
            }
        } else {
            logger.error`Failed to send DM to ${user.id}: ${error.message}`;
        }
        return null;
    }
}
