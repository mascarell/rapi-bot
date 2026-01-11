import { Client, TextChannel, Message } from 'discord.js';
import { getGachaGuildConfigService } from './gachaGuildConfigService';

// Constants
const RULES_CHANNEL_NAME = 'rules'; // Channel name to search for
const SURE_EMOJI = '<:sure:1056601190726651985>';
const VIDEOS_CHANNEL_ID = '1054761687779123270';

const RULES_CONTENT = `${SURE_EMOJI} SERVER RULES ${SURE_EMOJI}

➜ Follow the rules or you'll get banned by Rapi, no appeals on this server
➜ This is a place to chill and enjoy a community of people who share a love for the games we cover on the website (and other gachas), if you can't keep conversations civil, you're out
➜ Don't be a dick in general, be nice to other people
➜ Don't be racist, this includes memes with racial slurs
➜ Spicy art is fine, NSFW to it's proper channel
➜ If you want to argue with someone, go to DMs, this server / our streams are not the place
➜ If you are a content creator DM any of the mods so you can share your content on the <#${VIDEOS_CHANNEL_ID}> channel
➜ No account selling / trading
➜ The eternal debate of lolis: It's ok on art channel, not on NSFW. I don't care what you like and this is not up for debate, the server simply follows <@118451485221715977> rules and taste, this will never be a democracy 🫡`;

/**
 * Service for managing the rules message in the #rules channel
 * Singleton pattern for consistent message management
 */
class RulesManagementService {
    private static instance: RulesManagementService;

    private constructor() {}

    public static getInstance(): RulesManagementService {
        if (!RulesManagementService.instance) {
            RulesManagementService.instance = new RulesManagementService();
        }
        return RulesManagementService.instance;
    }

    /**
     * Get the rules content text (for /rules command replies)
     */
    public getRulesContent(): string {
        return RULES_CONTENT;
    }

    /**
     * Get the list of guild IDs where rules command is allowed (from S3 config)
     */
    public async getAllowedGuildIds(): Promise<string[]> {
        const configService = getGachaGuildConfigService();
        return await configService.getAllowedGuildIds();
    }

    /**
     * Check if a guild ID is allowed to use the rules system (from S3 config)
     */
    public async isGuildAllowed(guildId: string | null): Promise<boolean> {
        if (!guildId) return false;
        const allowedIds = await this.getAllowedGuildIds();
        return allowedIds.includes(guildId);
    }

    /**
     * Initialize or update the rules message in the #rules channel for a specific guild
     */
    private async initializeRulesMessageForGuild(bot: Client, guildId: string): Promise<{ success: boolean; error?: string }> {
        try {
            // Fetch the guild
            const guild = await bot.guilds.fetch(guildId).catch(() => null);
            if (!guild) {
                return { success: false, error: `Bot not in guild ${guildId}` };
            }

            // Find the rules channel by name
            const channel = guild.channels.cache.find(
                ch => ch.name === RULES_CHANNEL_NAME && ch.isTextBased()
            ) as TextChannel | undefined;

            if (!channel) {
                return { success: false, error: `Rules channel not found in guild ${guild.name}` };
            }

            const textChannel = channel as TextChannel;
            const configService = getGachaGuildConfigService();
            const config = await configService.getConfig();

            let message: Message | null = null;

            // Try to find existing message by stored ID
            if (config.rulesConfig?.messageId) {
                try {
                    message = await textChannel.messages.fetch(config.rulesConfig.messageId);
                    console.log(`[RulesManagement] Found rules message by stored ID: ${config.rulesConfig.messageId}`);
                } catch (error) {
                    console.log(`[RulesManagement] Stored message ID ${config.rulesConfig.messageId} not found, will search for bot message`);
                }
            }

            // If no message found by ID, search for bot's message in channel
            if (!message) {
                console.log('[RulesManagement] Searching for bot message in rules channel...');
                const messages = await textChannel.messages.fetch({ limit: 50 });
                message = messages.find(msg => msg.author.id === bot.user?.id) || null;

                if (message) {
                    console.log(`[RulesManagement] Found existing bot message: ${message.id}`);
                } else {
                    console.log('[RulesManagement] No existing bot message found');
                }
            }

            // Update or create message
            if (message) {
                // Update existing message
                await message.edit({ content: RULES_CONTENT });
                console.log(`[RulesManagement] ✅ Updated existing rules message (ID: ${message.id})`);
            } else {
                // Create new message
                message = await textChannel.send({ content: RULES_CONTENT });
                console.log(`[RulesManagement] ✅ Created new rules message (ID: ${message.id})`);
            }

            // Log message ID for manual config update
            console.log(`[RulesManagement] 📝 MESSAGE ID FOR CONFIG (${guild.name}): ${message.id}`);
            console.log(`[RulesManagement] Please update guild-config.json and dev-guild-config.json with this message ID`);

            return { success: true };
        } catch (error) {
            // Log error but don't throw - this allows bot to continue starting up
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.log(`[RulesManagement] Could not initialize rules message for guild ${guildId}: ${errorMessage}`);
            return {
                success: false,
                error: errorMessage
            };
        }
    }

    /**
     * Initialize or update rules messages in all allowed guilds (called on bot startup)
     */
    public async initializeRulesMessage(bot: Client): Promise<{ success: boolean; error?: string }> {
        const allowedGuildIds = await this.getAllowedGuildIds();
        const results = await Promise.all(
            allowedGuildIds.map(guildId => this.initializeRulesMessageForGuild(bot, guildId))
        );

        const successCount = results.filter(r => r.success).length;
        const failureCount = results.filter(r => !r.success).length;

        if (successCount > 0) {
            console.log(`[RulesManagement] Initialized rules in ${successCount} guild(s)`);
        }
        if (failureCount > 0) {
            console.log(`[RulesManagement] Failed to initialize rules in ${failureCount} guild(s) (expected if bot not in all guilds)`);
        }

        return {
            success: successCount > 0,
            error: failureCount === allowedGuildIds.length ? 'Failed to initialize in any guild' : undefined
        };
    }
}

/**
 * Get the singleton instance of RulesManagementService
 */
export const getRulesManagementService = (): RulesManagementService =>
    RulesManagementService.getInstance();
