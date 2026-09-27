import {
    Client,
    Collection,
    GatewayIntentBits,
    Events,
    ActivityType,
    PresenceUpdateStatus,
    Partials,
} from "discord.js";
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import path from "path";
import fs from "fs";
import schedule from 'node-schedule';
import 'moment-timezone';

import * as util from "./utils/util.js";
import { CustomClient } from "./utils/interfaces/CustomClient.interface.js";
import { getRadioService } from "./services/radioService.js";
import { getRandomCdnMediaUrl } from "./utils/cdn/mediaManager.js";
import { startStreamStatusCheck } from './utils/twitch.js';
import { ChatCommandRateLimiter } from './utils/chatCommandRateLimiter.js';
import { logger } from './utils/logger.js';

// Import new modular handlers and services
import { handleMessage, handleMessageUpdate } from './handlers/messageHandler.js';
import { handleSlashCommand, handleAutocomplete } from './handlers/slashCommandHandler.js';
import { initializeServices } from './bootstrap/serviceInitializer.js';
import { chatCommands } from './chatCommands/index.js';

// Destructure utility functions
const {
    getIsStreaming,
    getRandomRapiMessage,
    findChannelByName,
    logError,
    isSlashCommand,
    isMessageCommand
} = util;

const DISCORD_TOKEN = process.env.WAIFUTOKEN as string;
const CLIENT_ID = process.env.CLIENTID as string;

// Default extensions
const DEFAULT_IMAGE_EXTENSIONS = ['.gif', '.png', '.jpg', '.webp'] as const;

const bot: CustomClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
    ],
}) as CustomClient;

bot.commands = new Collection();
const commands: Array<object> = [];

/**
 * Load chat and slash commands
 */
async function loadCommands() {
    // Load chat commands from registry
    for (const key in chatCommands) {
        if (Object.prototype.hasOwnProperty.call(chatCommands, key)) {
            const command = chatCommands[key];
            if (isMessageCommand(command)) {
                bot.commands.set(command.name, command);
            } else {
                logger.warning`Skipping invalid chat command: ${key} - Does not match MessageCommand interface`;
            }
        }
    }

    // Load slash commands from files
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));

    const importPromises = commandFiles.map(async (file) => {
        const filePath = path.join(commandsPath, file);
        try {
            const commandModule = await import(filePath);
            const command = commandModule.default;
            if (isSlashCommand(command)) {
                bot.commands.set(command.data.name, command);
                commands.push(command.data.toJSON());
            } else {
                logger.warning`Skipping invalid command in file ${file}: Command does not match SlashCommand interface`;
            }
        } catch (error) {
            const errorMessage = `Failed to load command from file ${file}`;
            if (error instanceof Error) {
                logError('GLOBAL', 'GLOBAL', error, errorMessage);
            } else {
                logError('GLOBAL', 'GLOBAL', new Error(String(error)), errorMessage);
            }
        }
    });

    await Promise.all(importPromises);
}

/**
 * Update bot activity (presence)
 */
function updateBotActivity(activities: any[]) {
    const activity = activities[Math.floor(Math.random() * activities.length)];
    bot.user?.setPresence({
        status: activity.status,
        activities: [
            {
                name: activity.name,
                type: activity.type,
            },
        ],
    });
}

/**
 * Set bot activity rotation
 */
function setBotActivity() {
    const activities = [
        {
            name: "SIMULATION ROOM",
            type: ActivityType.Playing,
            status: PresenceUpdateStatus.Online,
        },
        {
            name: "SIMULATION ROOM: OVERCLOCK",
            type: ActivityType.Competing,
            status: PresenceUpdateStatus.DoNotDisturb,
        },
        {
            name: "With Commanders' hearts",
            type: ActivityType.Playing,
            status: PresenceUpdateStatus.Online,
        },
        {
            name: "Commanders' jukebox",
            type: ActivityType.Listening,
            status: PresenceUpdateStatus.Online,
        },
        {
            name: "CAMPAIGN",
            type: ActivityType.Playing,
            status: PresenceUpdateStatus.Online,
        },
        {
            name: "Over The Outpost",
            type: ActivityType.Watching,
            status: PresenceUpdateStatus.Idle,
        },
        {
            name: "SPECIAL ARENA",
            type: ActivityType.Competing,
            status: PresenceUpdateStatus.DoNotDisturb,
        },
        {
            name: "ROOKIE ARENA",
            type: ActivityType.Playing,
            status: PresenceUpdateStatus.Online,
        },
        {
            name: "COSMOGRAPH",
            type: ActivityType.Listening,
            status: PresenceUpdateStatus.Online,
        },
        {
            name: "HARD CAMPAIGN",
            type: ActivityType.Competing,
            status: PresenceUpdateStatus.DoNotDisturb,
        },
        {
            name: "TRIBE TOWER",
            type: ActivityType.Competing,
            status: PresenceUpdateStatus.DoNotDisturb,
        },
        {
            name: "ELYSION TOWER",
            type: ActivityType.Competing,
            status: PresenceUpdateStatus.DoNotDisturb,
        },
        {
            name: "Honkai: Star Rail",
            type: ActivityType.Playing,
            status: PresenceUpdateStatus.Online,
        },
        {
            name: "Brown Dust 2",
            type: ActivityType.Playing,
            status: PresenceUpdateStatus.Online,
        },
        {
            name: "Terraria",
            type: ActivityType.Playing,
            status: PresenceUpdateStatus.Online,
        },
        {
            name: "Trickcal RE:VIVE",
            type: ActivityType.Playing,
            status: PresenceUpdateStatus.Online,
        },
        {
            name: "Girls' Frontline 2: Exilium",
            type: ActivityType.Playing,
            status: PresenceUpdateStatus.Online,
        },
        {
            name: "Path of Exile 2",
            type: ActivityType.Playing,
            status: PresenceUpdateStatus.Online,
        },
        {
            name: "Monster Hunter Wilds",
            type: ActivityType.Playing,
            status: PresenceUpdateStatus.Online,
        },
        {
            name: "Marvel Rivals",
            type: ActivityType.Competing,
            status: PresenceUpdateStatus.DoNotDisturb,
        },
        {
            name: "Minecraft",
            type: ActivityType.Playing,
            status: PresenceUpdateStatus.Online,
        },
        {
            name: "Umamusume: Pretty Derby",
            type: ActivityType.Playing,
            status: PresenceUpdateStatus.Online,
        },
    ];

    updateBotActivity(activities);

    schedule.scheduleJob('0 */4 * * *', function () {
        if (!getIsStreaming()) {
            updateBotActivity(activities);
        }
    });
}

/**
 * Greet new members joining the guild
 */
function greetNewMembers() {
    bot.on("guildMemberAdd", (member) => {
        const channel = findChannelByName(member.guild, "welcome");
        if (channel) {
            channel.send(`Welcome Commander ${member}, please take care when going to the surface.`)
                .catch((error: Error) => {
                    logError(member.guild.id, member.guild.name, error, 'Greeting new member');
                    logger.error`Failed to send welcome message to ${member.user.tag} in guild ${member.guild.name}: ${error}`;
                });
        } else {
            logger.warning`Welcome channel not found in guild ${member.guild.name}`;
        }
    });
}

/**
 * Send random messages to #nikke channel
 */
function sendRandomMessages() {
    schedule.scheduleJob('0 */6 * * *', async () => {
        const guilds = bot.guilds.cache.values();
        for (const guild of guilds) {
            const channel = findChannelByName(guild, "nikke");
            if (!channel) {
                logger.warning`Could not find suitable nikke text channel in guild ${guild.name}`;
                continue;
            }

            try {
                const rapiMessage = getRandomRapiMessage();
                const messageOptions: any = { content: rapiMessage.text };

                // Add image if configured for this message
                if (rapiMessage.imageConfig) {
                    const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                        rapiMessage.imageConfig.cdnPath,
                        guild.id,
                        {
                            extensions: rapiMessage.imageConfig.extensions || [...DEFAULT_IMAGE_EXTENSIONS],
                            trackLast: rapiMessage.imageConfig.trackLast || 5
                        }
                    );
                    messageOptions.files = [randomCdnMediaUrl];
                }

                const sentMessage = await channel.send(messageOptions);
                const emoji = channel.guild.emojis.cache.find(emoji => emoji.name === 'rapidd');
                if (emoji) {
                    await sentMessage.react(emoji);
                } else {
                    logger.warning`Emoji rapidd not found in guild ${guild.name}`;
                }
            } catch (error) {
                logError(guild.id, guild.name, error instanceof Error ? error : new Error(String(error)), 'Sending random message');
            }
        }
    });
}

/**
 * Initialize Discord bot
 */
async function initDiscordBot() {
    await loadCommands();

    // Initialize chat command rate limiter
    ChatCommandRateLimiter.init();

    bot.once(Events.ClientReady, async () => {
        try {
            setBotActivity();
            greetNewMembers();
            sendRandomMessages();

            // Initialize all services (gacha, daily reset, channel monitor, etc.)
            await initializeServices(bot);

            // Setup event handlers
            bot.on('messageCreate', (msg) => handleMessage(msg, bot));
            bot.on('messageUpdate', handleMessageUpdate);
            bot.on(Events.InteractionCreate, async (interaction) => {
                if (interaction.isChatInputCommand()) {
                    await handleSlashCommand(interaction, bot);
                } else if (interaction.isAutocomplete()) {
                    await handleAutocomplete(interaction, bot);
                }
            });

            // Start Twitch stream status check
            startStreamStatusCheck(bot);

            // Register slash commands globally
            const rest = new REST().setToken(DISCORD_TOKEN);
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });

            // Start the radio. Scoped to RADIO_CONFIG.GUILD_ID rather than
            // looping every guild for a channel only one of them has.
            await getRadioService().start(bot);

        } catch (error) {
            logError('GLOBAL', 'GLOBAL', error instanceof Error ? error : new Error(String(error)), 'Initializing bot');
        }
    });

    // Handle voice state updates (bot removed from the channel).
    // This used to destroy the connection permanently; the radio service now
    // reconnects instead, which is the whole point of the fix.
    bot.on('voiceStateUpdate', (_oldState, newState) => {
        const botId = bot.user?.id;
        if (newState.member?.id === botId && !newState.channelId) {
            getRadioService().handleForcedDisconnect(newState.guild.id);
        }
    });

    try {
        await bot.login(DISCORD_TOKEN);
    } catch (error) {
        logError('GLOBAL', 'GLOBAL', error instanceof Error ? error : new Error(String(error)), 'Bot login');
    }
}

export {
    initDiscordBot,
    bot as getDiscordBot,
};
