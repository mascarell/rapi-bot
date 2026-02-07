import { Client, Message, MessageReaction, User, PartialMessageReaction, PartialUser, EmbedBuilder, Embed } from 'discord.js';
import { getGachaDataService } from './gachaDataService.js';
import { GachaGameId } from '../utils/interfaces/GachaCoupon.interface';
import { getGameConfig, GACHA_GAMES } from '../utils/data/gachaGamesConfig';
import { gachaLogger } from '../utils/logger.js';

/**
 * Reaction emojis for manual confirmation
 */
export const CONFIRMATION_EMOJIS = {
    REDEEMED: '✅',    // Mark as redeemed
    IGNORE: '❌',       // Ignore warnings for this code
    RESET: '🔄',        // Reset (undo previous reaction)
} as const;

/**
 * Service for handling reaction-based confirmations on DM messages
 * Used for games that don't support auto-redemption (like Lost Sword)
 */
class ReactionConfirmationService {
    private static instance: ReactionConfirmationService;

    private constructor() {}

    public static getInstance(): ReactionConfirmationService {
        if (!ReactionConfirmationService.instance) {
            ReactionConfirmationService.instance = new ReactionConfirmationService();
        }
        return ReactionConfirmationService.instance;
    }

    /**
     * Add reaction buttons to a message
     */
    public async addReactionButtons(message: Message): Promise<void> {
        await message.react(CONFIRMATION_EMOJIS.REDEEMED);
        await message.react(CONFIRMATION_EMOJIS.IGNORE);
        await message.react(CONFIRMATION_EMOJIS.RESET);
    }

    /**
     * Extract game ID and code from embed content
     * Parses the title for game shortName and the Code field for the coupon code
     */
    public parseEmbedContent(embed: Embed): { gameId: GachaGameId; code: string } | null {
        // Extract code from the "Code" field (format: `CODE123`)
        const codeField = embed.fields.find(f => f.name === 'Code');
        if (!codeField) return null;

        // Remove backticks from code value
        const code = codeField.value.replace(/`/g, '').trim();
        if (!code) return null;

        // Extract game from title by matching shortName
        // Title formats: "🆕 New LS Coupon Code!" or "⚠️ LS Code Expiring Soon!"
        const title = embed.title || '';

        // Find which game's shortName is in the title
        for (const [gameId, config] of Object.entries(GACHA_GAMES)) {
            if (title.includes(config.shortName)) {
                return { gameId: gameId as GachaGameId, code };
            }
        }

        return null;
    }

    /**
     * Build embed footer text with game name (clean, no metadata needed)
     */
    public buildFooterText(baseText: string, gameId: GachaGameId): string {
        const gameConfig = GACHA_GAMES[gameId];
        return `${baseText} • ${gameConfig.name}`;
    }

    /**
     * Check if a game supports reaction-based confirmation
     * (games without auto-redeem support)
     */
    public supportsReactionConfirmation(gameId: GachaGameId): boolean {
        const config = GACHA_GAMES[gameId];
        return !config.supportsAutoRedeem;
    }

    /**
     * Handle a reaction on a DM message
     */
    public async handleReaction(
        reaction: MessageReaction | PartialMessageReaction,
        user: User | PartialUser,
        bot: Client
    ): Promise<void> {
        // Ignore bot reactions
        if (user.bot) return;

        // Fetch partial reaction if needed
        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch (error) {
                gachaLogger.error`Failed to fetch reaction: ${error}`;
                return;
            }
        }

        // Fetch partial message if needed
        let message = reaction.message;
        if (message.partial) {
            try {
                message = await message.fetch();
            } catch (error) {
                gachaLogger.error`Failed to fetch message: ${error}`;
                return;
            }
        }

        // Only handle DM messages
        if (message.channel.isDMBased() === false) return;

        // Only handle messages from the bot
        if (message.author?.id !== bot.user?.id) return;

        // Get the emoji
        const emoji = reaction.emoji.name;
        if (!emoji || !Object.values(CONFIRMATION_EMOJIS).includes(emoji as any)) return;

        // Parse game and code from embed content
        const embed = message.embeds[0];
        if (!embed) return;

        const parsed = this.parseEmbedContent(embed);
        if (!parsed) return;

        const { gameId, code } = parsed;
        const discordId = user.id;

        gachaLogger.debug`User ${discordId} reacted with ${emoji} on ${gameId}:${code}`;

        const dataService = getGachaDataService();

        // Fetch user for sending confirmation DM
        const fullUser = user.partial ? await user.fetch() : user;

        try {
            let confirmationMessage = '';

            switch (emoji) {
                case CONFIRMATION_EMOJIS.REDEEMED:
                    // Mark code as redeemed
                    await dataService.markCodesRedeemed(discordId, gameId, [code]);
                    await this.updateMessageForRedeemed(message, code);
                    confirmationMessage = `✅ Code \`${code}\` marked as redeemed! You won't receive more reminders for this code.`;
                    break;

                case CONFIRMATION_EMOJIS.IGNORE:
                    // Add to ignored codes
                    await dataService.addIgnoredCode(discordId, gameId, code);
                    await this.updateMessageForIgnored(message, code);
                    confirmationMessage = `❌ Code \`${code}\` ignored. You won't receive more reminders for this code.`;
                    break;

                case CONFIRMATION_EMOJIS.RESET:
                    // Remove from both redeemed and ignored
                    await dataService.removeRedeemedCode(discordId, gameId, code);
                    await dataService.removeIgnoredCode(discordId, gameId, code);
                    await this.updateMessageForReset(message, code);
                    confirmationMessage = `🔄 Code \`${code}\` status reset. You'll receive reminders for this code again.`;
                    break;
            }

            // Send confirmation DM
            if (confirmationMessage) {
                await fullUser.send(confirmationMessage);
            }
            // Note: reaction.users.remove() doesn't work in DMs - users can unreact manually
        } catch (error) {
            gachaLogger.error`Error handling reaction: ${error}`;
        }
    }

    /**
     * Update message embed to show redeemed status
     */
    private async updateMessageForRedeemed(message: Message, code: string): Promise<void> {
        const embed = message.embeds[0];
        if (!embed) return;

        const updatedEmbed = EmbedBuilder.from(embed)
            .setColor(0x00FF00) // Green
            .setDescription(`✅ **Code \`${code}\` marked as redeemed!**\n\nYou won't receive more reminders for this code.`);

        await message.edit({ embeds: [updatedEmbed] });
    }

    /**
     * Update message embed to show ignored status
     */
    private async updateMessageForIgnored(message: Message, code: string): Promise<void> {
        const embed = message.embeds[0];
        if (!embed) return;

        const updatedEmbed = EmbedBuilder.from(embed)
            .setColor(0x808080) // Gray
            .setDescription(`❌ **Code \`${code}\` ignored.**\n\nYou won't receive more reminders for this code.\nReact with 🔄 to undo.`);

        await message.edit({ embeds: [updatedEmbed] });
    }

    /**
     * Update message embed to show reset status
     */
    private async updateMessageForReset(message: Message, code: string): Promise<void> {
        const embed = message.embeds[0];
        if (!embed) return;

        const updatedEmbed = EmbedBuilder.from(embed)
            .setColor(0xFFA500) // Orange (back to warning color)
            .setDescription(`🔄 **Code \`${code}\` status reset.**\n\nYou'll receive reminders for this code again.`);

        await message.edit({ embeds: [updatedEmbed] });
    }

    /**
     * Set up the messageReactionAdd event listener
     */
    public startListening(bot: Client): void {
        bot.on('messageReactionAdd', async (reaction, user) => {
            try {
                await this.handleReaction(reaction, user, bot);
            } catch (error) {
                gachaLogger.error`Error in reaction handler: ${error}`;
            }
        });

    }

    /**
     * Get instructions text for reaction-based games
     */
    public getReactionInstructions(): string {
        return `
━━━━━━━━━━━━━━━━━━━━━━
**React to mark this code:**
✅ - I've redeemed this code
❌ - Ignore warnings for this code
🔄 - Reset (undo previous reaction)

*Unreact and react again to change your selection*
`.trim();
    }
}

/**
 * Get the singleton instance
 */
export const getReactionConfirmationService = (): ReactionConfirmationService =>
    ReactionConfirmationService.getInstance();
