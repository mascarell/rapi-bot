import { Client, TextChannel, Message } from 'discord.js';
import { getGachaGuildConfigService } from './gachaGuildConfigService';

// Constants
const PRIMARY_GUILD_ID = '1054761356416528475';
const RULES_CHANNEL_ID = '1054761672167931995';
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
     * Get the primary guild ID where rules are managed
     */
    public getPrimaryGuildId(): string {
        return PRIMARY_GUILD_ID;
    }

    /**
     * Initialize or update the rules message in the #rules channel
     * Called on bot startup or via admin command
     */
    public async initializeRulesMessage(bot: Client): Promise<{ success: boolean; error?: string }> {
        try {
            // Fetch the primary guild
            const guild = await bot.guilds.fetch(PRIMARY_GUILD_ID);
            if (!guild) {
                return { success: false, error: 'Primary guild not found' };
            }

            // Fetch the rules channel
            const channel = await guild.channels.fetch(RULES_CHANNEL_ID);
            if (!channel || !channel.isTextBased()) {
                return { success: false, error: 'Rules channel not found or not text-based' };
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
            console.log(`[RulesManagement] 📝 MESSAGE ID FOR CONFIG: ${message.id}`);
            console.log(`[RulesManagement] Please update guild-config.json and dev-guild-config.json with this message ID`);

            return { success: true };
        } catch (error) {
            console.error('[RulesManagement] Error initializing rules message:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Manually update the rules message (admin command)
     */
    public async updateRulesMessage(bot: Client): Promise<{ success: boolean; error?: string }> {
        return this.initializeRulesMessage(bot);
    }
}

/**
 * Get the singleton instance of RulesManagementService
 */
export const getRulesManagementService = (): RulesManagementService =>
    RulesManagementService.getInstance();
