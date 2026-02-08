import {
    Client,
    Collection,
    GatewayIntentBits,
    Events,
    ActivityType,
    PresenceUpdateStatus,
    Partials,
    TextChannel,
} from "discord.js";
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import {
    createAudioPlayer,
    joinVoiceChannel,
    createAudioResource,
    VoiceConnectionStatus,
    AudioPlayerStatus,
    entersState,
    StreamType,
} from '@discordjs/voice';
import path from "path";
import fs from "fs";
import schedule from 'node-schedule';
import moment from "moment";
import 'moment-timezone';

import * as util from "./utils/util.js";
import { VoiceConnectionData } from "./utils/interfaces/voiceConnectionData.interface.js";
import { CustomClient } from "./utils/interfaces/CustomClient.interface.js";
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
    getVoiceChannel,
    isSlashCommand,
    isMessageCommand
} = util;

const DISCORD_TOKEN = process.env.WAIFUTOKEN as string;
const CLIENT_ID = process.env.CLIENTID as string;
const RADIO_FOLDER_PATH = './src/radio';

// Default extensions
const DEFAULT_IMAGE_EXTENSIONS = ['.gif', '.png', '.jpg', '.webp'] as const;

const voiceConnections: Map<string, VoiceConnectionData> = new Map();

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
 * Connect to voice channel for radio playback
 */
async function connectToVoiceChannel(guildId: string, voiceChannel: any) {
    try {
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator
        });

        connection.on('error', error => {
            logError(guildId, 'UNKNOWN', error, 'Voice connection');
        });

        const SUPPORTED_AUDIO_EXTENSIONS = ['.mp3', '.opus', '.ogg', '.wav', '.flac', '.m4a'];
        const playlist = fs.readdirSync(RADIO_FOLDER_PATH).filter(file => {
            const ext = path.extname(file).toLowerCase();
            return SUPPORTED_AUDIO_EXTENSIONS.includes(ext);
        });

        if (playlist.length === 0) {
            logger.error`No audio files found in ${RADIO_FOLDER_PATH}`;
            return;
        }

        voiceConnections.set(guildId, { connection, playlist });

        connection.on(VoiceConnectionStatus.Ready, () => {
            playNextSong(guildId);
        });

        // Handle disconnection with reconnection attempt
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                // Try to reconnect within 5 seconds
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch (error) {
                // Failed to reconnect - destroy and cleanup
                connection.destroy();
                voiceConnections.delete(guildId);
            }
        });
    } catch (error) {
        if (error instanceof Error) {
            logError(guildId, 'UNKNOWN', error, 'Connecting to voice channel');
        } else {
            logError(guildId, 'UNKNOWN', new Error(String(error)), 'Connecting to voice channel');
        }
    }
}

/**
 * Play next song in radio playlist
 */
function playNextSong(guildId: string) {
    try {
        const voiceConnectionData = voiceConnections.get(guildId);
        if (!voiceConnectionData) {
            throw new Error(`No voice connection data found for guild ${guildId}`);
        }
        const { connection, playlist, currentSongIndex = 0 } = voiceConnectionData;
        const nextIndex = (currentSongIndex + 1) % playlist.length;
        const songPath = `${RADIO_FOLDER_PATH}/${playlist[nextIndex]}`;

        // Skip missing files
        if (!fs.existsSync(songPath)) {
            logger.warning`Radio file not found, skipping: ${songPath}`;
            voiceConnectionData.currentSongIndex = nextIndex;
            playNextSong(guildId);
            return;
        }

        // Detect input type based on file extension
        const fileExtension = path.extname(songPath).toLowerCase();
        const inputType = fileExtension === '.opus' || fileExtension === '.ogg'
            ? StreamType.OggOpus
            : StreamType.Arbitrary;

        const resource = createAudioResource(songPath, {
            inputType: inputType,
        });

        if (!voiceConnectionData.player) {
            voiceConnectionData.player = createAudioPlayer();
            connection.subscribe(voiceConnectionData.player);

            // Handle player errors - skip to next song
            voiceConnectionData.player.on('error', (error: Error) => {
                logger.error`Audio player error: ${error.message}`;
                logError(guildId, 'RADIO', error, 'Audio player error');
                playNextSong(guildId);
            });

            voiceConnectionData.player.on(AudioPlayerStatus.Idle, () => {
                playNextSong(guildId);
            });
        }

        voiceConnectionData.player.play(resource);

        voiceConnectionData.currentSongIndex = nextIndex;
    } catch (error) {
        if (error instanceof Error) {
            logError(guildId, 'RADIO', error, 'Playing next song');
        } else {
            logError(guildId, 'RADIO', new Error(String(error)), 'Playing next song');
        }
    }
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

            // Connect to voice channels for radio
            for (const guild of bot.guilds.cache.values()) {
                const voiceChannel = getVoiceChannel(guild, '1229441264718577734');
                if (voiceChannel) {
                    await connectToVoiceChannel(guild.id, voiceChannel);
                }
            }

        } catch (error) {
            logError('GLOBAL', 'GLOBAL', error instanceof Error ? error : new Error(String(error)), 'Initializing bot');
        }
    });

    // Handle voice state updates (bot disconnection)
    bot.on('voiceStateUpdate', (oldState, newState) => {
        const guildId = newState.guild.id;
        const botId = bot.user?.id;

        if (newState.member?.id === botId && !newState.channelId) {
            const connection = voiceConnections.get(guildId)?.connection;
            if (connection) {
                connection.destroy();
                voiceConnections.delete(guildId);
            }
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
