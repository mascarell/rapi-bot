import { Client, Collection, GatewayIntentBits, Events, EmbedBuilder, ActivityType, PresenceUpdateStatus, Message, Guild, ReadonlyCollection, TextChannel, ChannelType } from "discord.js";
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import { createAudioPlayer, joinVoiceChannel, createAudioResource, VoiceConnectionStatus, AudioPlayerStatus, AudioPlayer } from '@discordjs/voice';
import path from "path";
import fs from "fs";
import schedule from 'node-schedule';
import moment from "moment";
import 'moment-timezone';

import {
    getFiles,
    getIsStreaming,
    getRandomRapiMessage,
    getRandomReadNikkeMessage,
    getBosses,
    getTribeTowerRotation,
    findChannelByName,
    findRoleByName,
    logError,
    getVoiceChannel,
    handleTimeout,
} from "./utils/util";
import { VoiceConnectionData } from "./utils/interfaces/voiceConnectionData.interface";
import { ccpMessage } from "./utils/constants/messages";

import { S3, S3ClientConfig, ListObjectsV2Command } from "@aws-sdk/client-s3";

//TODO: Extract into common utils S3 client
const s3ClientConfig: S3ClientConfig = {
    forcePathStyle: false,
    endpoint: "https://sfo3.digitaloceanspaces.com",
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.S3ACCESSKEYID as string,
      secretAccessKey: process.env.S3SECRETKEY as string
    }
};
const s3Client = new S3(s3ClientConfig);

const TOKEN = process.env.WAIFUTOKEN as string;
const CLIENTID = process.env.CLIENTID as string;
const S3BUCKET = process.env.S3BUCKET as string;
const RADIO_FOLDER_PATH = './src/radio';
const PRE = "/";
const resetStartTime = moment.tz({ hour: 20, minute: 0, second: 0, millisecond: 0 }, 'UTC');
const resetEndTime = moment.tz({ hour: 20, minute: 0, second: 15, millisecond: 0 }, 'UTC');

// CDN URLs
const RAPI_BOT_THUMBNAIL_URL = 'https://rapi-bot.sfo3.cdn.digitaloceanspaces.com/assets/rapi-bot-thumbnail.jpg';
const GFL2_LOGO_URL = 'https://rapi-bot.sfo3.cdn.digitaloceanspaces.com/assets/logos/gfl2-logo.png';
const NIKKE_LOGO_URL = 'https://rapi-bot.sfo3.cdn.digitaloceanspaces.com/assets/logos/nikke-logo.png';
const BLUE_ARCHIVE_LOGO_URL = 'https://rapi-bot.sfo3.cdn.digitaloceanspaces.com/assets/logos/blue-archive-logo.png';


const voiceConnections: Map<string, VoiceConnectionData> = new Map();

interface CustomClient extends Client {
    commands: Collection<string, any>;
}

const bot: CustomClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
    ],
}) as CustomClient;

bot.commands = new Collection();
const commands: Array<object> = [];

// Define a type for your bot commands
type BotCommand = {
    name: string;
    description?: string;
    execute: (msg: any) => void | Promise<void>;
};

// Extend Client to include commands
declare module 'discord.js' {
    interface Client {
        commands: Collection<string, any>;
    }
}

// Bot commands object
// The name has to be lowercase
const chatCommands: { [key: string]: BotCommand } = {
    readNikke: {
        name: "read nikke",
        async execute(msg) {
            const mentionedUser = msg.mentions.users.first();
            const readNikkeReply = mentionedUser ? `Commander <@${mentionedUser.id}>, ` : 'Commander, ';        
            const randomMessage = readNikkeReply + getRandomReadNikkeMessage();

            await sendRandomImageWithContent(msg, "./src/public/images/commands/readNikke/", randomMessage);
        },
    },
    getDatNikke: {
        name: "rapi get dat nikke",
        async execute(msg) {
            const mentionedUser = msg.mentions.users.first();
            const getHimReply = mentionedUser ? `Commander <@${mentionedUser.id}>... ` : '';
            
            await sendRandomImageWithContent(msg, "./src/public/images/commands/getDatNikke/", getHimReply);
        },
    },
    booba: {
        name: "booba?",
        async execute(msg) {
            await sendRandomImage(msg, "./src/public/images/booba/");
        },
    },
    booty: {
        name: "booty?",
        async execute(msg) {
            await sendRandomImage(msg, "./src/public/images/booty/");
        },
    },
    skillissue: {
        name: "sounds like...",
        async execute(msg) {
            await sendRandomImageWithContent(msg, "./src/public/images/commands/skillIssue/", 'It sounds like you have some skill issues Commander.');
        },
    },
    skillissueiphone: {
        name: "sounds like…",
        async execute(msg) {
            await sendRandomImageWithContent(msg, "./src/public/images/commands/skillIssue/", 'It sounds like you have some skill issues Commander.');
        },
    },
    seggs: {
        name: "seggs?",
        async execute(msg) {
            await sendRandomImageWithContent(msg, "./src/public/images/commands/seggs/", `Wait, Shifty, what are you talking about?`);
        },
    },
    kindaweird: {
        name: "kinda weird...",
        async execute(msg) {
            await sendRandomImageWithContent(msg, "./src/public/images/commands/kindaWeird/", `But why, Commander?...`);    
        },
    },
    iswear: {
        name: "i swear she is actually 3000 years old",
        async execute(msg) {
            await sendRandomImageWithContent(msg, "./src/public/images/commands/iSwear/", `Commander... I'm calling the authorities.`);
        },
    },
    teengame: {
        name: "12+ game",
        async execute(msg) {
            await sendRandomImageWithContent(msg, "./src/public/images/commands/12Game/", `Commander the surface is obviously safe for 12 year old kids.`);
        },
    },
    justice: {
        name: "justice for...",
        async execute(msg) {
            await sendRandomImageWithContent(msg, "./public/images/justice/", `Commander, let's take her out of NPC jail.`);
        },
    },
    whale: {
        name: "whale levels",
        async execute(msg) {
            await sendRandomImageWithContent(msg, "./src/public/images/commands/whaling/", `Commander, it's fine if you are poor.`);
        },
    },
    discipline: {
        name: "lap of discipline.",
        async execute(msg) {
            const filePaths = [
                "./src/public/images/commands/chat/lapOfCounters.webp",
                "./src/public/images/commands/chat/lapOfDiscipline.jpg"
            ];

            await msg.reply({
                files: [
                    {
                        attachment: filePaths[0],
                    },
                ]
            });

            await msg.reply({
                files: [
                    {
                        attachment: filePaths[1],
                    }
                ],
                content: `Commander ${msg.author}... Lap of discipline.`,
            });
        },
    },
    goodgirl: {
        name: "good girl",
        description: "good girl Rapi",
        async execute(msg) {
            const isNikkeChannel = msg.channel.name === "nikke";
            const currentTime = moment.tz('UTC');

            if (isNikkeChannel && currentTime.isBetween(resetStartTime, resetEndTime)) {
                console.log("Ignoring 'goodgirl' command in 'nikke' channel within specific time window.");
                return;
            }

            if (Math.random() < 0.04) {
                await handleTimeout(msg);
            } else {
                await msg.reply(`Thank you Commander ${msg.author}.`);
            }
        }
    },
    dammit: {
        name: "dammit rapi",
        description: "dammit rapi",
        execute(msg) {
            msg.reply("Sorry Commander.");
        },
    },
    wronggirl: {
        name: "wrong girl",
        description: "wrong girl Rapi",
        async execute(msg) {
            await sendRandomImageWithContent(msg, "./src/public/images/commands/wrongGirl/", `(￢з￢) Well well, so you DO see us that way, interesting!`);
        },
    },
    moldRates: {
        name: "mold rates are not that bad",
        description: `Commander, what are you talking about?`,
        async execute(msg) {
            await sendRandomImageWithContent(msg, "./src/public/images/commands/moldRates/", `Commander, what are you talking about?`);
        },
    },
    readyRapi: {
        name: "ready rapi?",
        async execute(msg) {
            await sendRandomImageWithContent(msg, "./src/public/images/commands/ready/", `Commander... ready for what?`);
        },
    },
    contentSquad: {
        name: PRE + "content",
        description: "content squad ping",
        execute(msg) {
            msg.reply(
                `<@&1193252857990885476> Commanders, Andersen left a new briefing, please take a look above this message.`
            );
        },
    },
    badgirl: {
        name: "bad girl",
        description: "bad girl",
        async execute(msg) {    
            await sendRandomImageWithContent(msg, "./src/public/images/commands/wrong/", "Commander...");   
        },
    },
    reward: {
        name: "reward?",
        description: "reward?",
        async execute(msg) {
            await sendRandomImageWithContent(msg, "./src/public/images/commands/reward/", "Commander...");
        },
    },
    damntrain: {
        name: "damn train",
        description: "damn train",
        async execute(msg) {
            try {
                const emoji = "❌";
                msg.react(emoji);
            } catch (error) {
                console.error(
                    "Failed to react with emoji:",
                    error
                );
            }

            await sendRandomImageWithContent(msg, "./src/public/images/commands/damnTrain/", `Commander...we don't talk about trains here.`);
        },
    },
    damngravedigger: {
        name: "damn gravedigger",
        description: "damn gravedigger",
        async execute(msg) {
            await sendRandomImageWithContent(msg, './src/public/images/commands/damnGravedigger/', `Commander...`);
        },
    },
    shiftdeadspicycrawl: {
        name: "dead spicy?",
        description: "dead spicy?",
        async execute(msg) {
            await sendRandomImageWithContent(msg, './src/public/images/commands/deadSpicy/', `Commander...`);
        },
    },
    curseofbelorta: {
        name: "belorta...",
        description: "CURSE OF BELORTA",
        async execute(msg) {
            await sendRandomImageWithContent(msg, "./src/public/images/commands/belorta/", "CURSE OF BELORTA𓀀 𓀁 𓀂 𓀃 𓀄 𓀅 𓀆 𓀇 𓀈 𓀉 𓀊 𓀋 𓀌 𓀍 𓀎 𓀏 𓀐 𓀑 𓀒 𓀓 𓀔 𓀕 𓀖 𓀗 𓀘 𓀙 𓀚 𓀛 𓀜 𓀝 𓀞 𓀟 𓀠 𓀡 𓀢 𓀣 𓀤 𓀥 𓀦 𓀧 𓀨  𓀪 𓀫 𓀬 𓀭 𓀮 𓀯 𓀰 𓀱 𓀲 𓀳 𓀴 𓀵 𓀶 𓀷 𓀸 𓀹 𓀺 𓀻 𓀼 𓀽 𓀾 𓀿 𓁀 𓁁 𓁂 𓁃 𓁄 𓁅 𓁆 𓁇 𓁈  𓁊 𓁋 𓁌 𓁍 𓁎 𓁏 𓁐 𓁑 𓀄 𓀅 𓀆 𓀇 𓀈 𓀉 𓀊");
        },
    },
    ccprules: {
        name: "ccp rules...",
        description: "CCP Rules",
        async execute(msg) {
            await sendRandomImageWithContent(msg, "./src/public/images/commands/ccpRules/", "Commander...please review our CCP Guidelines set by El Shafto...");
        },
    },
    bestgirl: {
        name: "best girl?",
        description: "Best Girl Rapi",
        async execute(msg) {
            await sendRandomImageWithContent(msg, "./src/public/images/commands/bestGirl/", getRandomBestGirlPhrase());
        },
    },
    gambleradvice: {
        name: "99%",
        description: "Gamblers' Advice",
        async execute(msg) {
            await sendRandomImageWithContent(msg, "./src/public/images/commands/gamblerAdvice/", "Commander...did you know 99% of gamblers quit before hitting it big?");
        },
    },
    ccpNumbahOne: {
        name: "ccp #1",
        description: "CCP LOYALTY",
        async execute(msg) {
            await sendRandomImageWithContent(msg, "./src/public/images/commands/ccp/", getRandomMantraPhrase());
        },
    },
    dorover: {
        name: "is it over?",
        description: "ITS DOROVER",
        async execute(msg) {
            await sendRandomImageWithContent(msg, "./src/public/images/commands/dorover/", "Commander....ITS DOROVER");
        },
    },
    cinema: {
        name: "absolute...",
        description: "CINEMA",
        async execute(msg) {
            await sendRandomImage(msg, "./src/public/images/commands/cinema/");
        },
    },
    plan: {
        name: "we had a plan!",
        description: "WE HAD A PLAN!",
        async execute(msg) {
            await sendRandomImageWithContent(msg, "./src/public/images/commands/plan/", getRandomPlanPhrase());
        },
    },
    leadership: {
        name: "ccp leadership",
        description: "CCP LEADERSHIP",
        async execute(msg) {
            //TODO: Extract into reusable function
            try {
                // List objects in the leadership folder
                const response = await s3Client.send(new ListObjectsV2Command({
                    Bucket: S3BUCKET,
                    Prefix: "commands/leadership/",
                }));

                if (!response.Contents || response.Contents.length === 0) {
                    console.error('No leadership clips found in CDN');
                    throw new Error('No leadership clips available');
                }

                // Filter out any non-media files, get keys under 100MB, and validate extensions
                const MAX_SIZE_MB = 100;
                const mediaKeys = response.Contents
                    .filter(obj => {
                        const sizeInMB = (obj.Size || 0) / (1024 * 1024); // Convert bytes to MB
                        return sizeInMB <= MAX_SIZE_MB;
                    })
                    .map(obj => obj.Key)
                    .filter(key => key && key.endsWith('.mp4'));

                if (mediaKeys.length === 0) {
                    console.error('No valid media files found under 100MB');
                    throw new Error('No suitable media files available');
                }

                // Select a random media key
                const randomKey = mediaKeys[Math.floor(Math.random() * mediaKeys.length)];
                const cdnUrl = `${CDN_PREFIX}/${randomKey}`;

                const emoji = msg.guild.emojis.cache.get('1298977385068236852');
                const message = getRandomLeadershipPhrase(emoji);

                await msg.reply({
                    content: message,
                    files: [cdnUrl]
                });

            } catch (error) {
                console.error('Error in leadership command:', error);
                await msg.reply('Commander, there seems to be an issue with the leadership files...');
                logError(
                    msg.guild?.id || 'UNKNOWN',
                    msg.guild?.name || 'UNKNOWN',
                    error instanceof Error ? error : new Error(String(error)),
                    'Leadership command'
                );
            }
        },
    },
    goodIdea: {
        name: "good idea!",
        description: "GOOD IDEA",
        async execute(msg) {
            const message = getRandomGoodIdeaPhrase();
            await sendRandomImageWithContent(msg, "./src/public/images/commands/goodIdea/", message);
            
            const reactions = ['wecant', 'HAH'];
            for (const reaction of reactions) {
                const emoji = msg.guild?.emojis.cache.find((e: any) => e.name === reaction);
                if (emoji) {
                    await msg.react(emoji);
                } else {
                    console.warn(`Emoji '${reaction}' not found in guild ${msg.guild?.name}`);
                }
            }
        },
    },
    quietRapi: {
        name: "quiet rapi",
        description: "QUIET RAPI",
        async execute(msg) {
            const message = `${msg.author}, ${getRandomQuietRapiPhrase()}`;
            await sendRandomImageWithContent(msg, "./src/public/images/commands/quietRapi/", message);
        },
    },
    entertainmentttt: {
        name: "entertainmentttt",
        description: "ENTERTAINMENTTTT",
        async execute(msg) {
            await sendRandomImage(msg, "./src/public/images/commands/entertainmentttt/");
        },
    },
    casualUnion: {
        name: "we casual",
        description: "CASUAL UNION",
        async execute(msg) {
            await sendRandomImage(msg, "./src/public/images/commands/casualUnion/");
        },
    },
};

async function sendRandomImage(msg: any, folderPath: string) {
    let files = await getFiles(folderPath);
    let randomFile = files[Math.floor(Math.random() * files.length)];
    msg.reply({
        files: [
            {
                attachment: randomFile.path,
                name: randomFile.name,
            },
        ],
    });
}

async function sendRandomImageWithContent(msg: any, folderPath: string, content: string) {
    try {
        console.log(`Fetching files from folder: ${folderPath}`);
        let files = await getFiles(folderPath);
        let randomFile = files[Math.floor(Math.random() * files.length)];
        console.log(`Selected random file: ${randomFile.name}`);
        
        await msg.reply({
            content: content,
            files: [
                {
                    attachment: randomFile.path,
                    name: randomFile.name,
                },
            ],
        });
        console.log(`Successfully sent message with content: ${content}`);
    } catch (error) {
        console.error(`Failed to send message with content: ${content}`, error);
        logError(msg.guild?.id || 'UNKNOWN', msg.guild?.name || 'UNKNOWN', error instanceof Error ? error : new Error(String(error)), 'sendRandomImageWithContent');
    }
}


//TODO: Deprecate this function
// Track recently sent images for each folder, per guild
const recentlySentImages: Map<string, Map<string, string[]>> = new Map();
const MAX_RECENT_IMAGES = 10;

async function sendRandomImageWithContentNoRepeat(msg: any, folderPath: string, content: string) {
    try {
        if (!msg.guild?.id) {
            console.error('No guild ID found in message');
            return sendRandomImageWithContent(msg, folderPath, content);
        }

        const guildId = msg.guild.id;
        console.log(`Processing request for guild: ${msg.guild.name} (${guildId})`);
        
        // Initialize guild tracking if not exists
        if (!recentlySentImages.has(guildId)) {
            console.log(`Initializing tracking for new guild: ${msg.guild.name}`);
            recentlySentImages.set(guildId, new Map());
        }

        // Initialize folder tracking for this guild if not exists
        const guildTracking = recentlySentImages.get(guildId)!;
        if (!guildTracking.has(folderPath)) {
            console.log(`Initializing tracking for folder: ${folderPath} in guild: ${msg.guild.name}`);
            guildTracking.set(folderPath, []);
        }

        console.log(`Fetching files from folder: ${folderPath}`);
        let files = await getFiles(folderPath);
        
        const recentImages = guildTracking.get(folderPath)!;
        console.log(`Currently tracking ${recentImages.length} recent images for ${folderPath} in guild: ${msg.guild.name}`);

        // Filter out recently sent images
        const availableFiles = files.filter(file => 
            !recentImages.includes(file.path)
        );

        console.log(`Found ${availableFiles.length} available images out of ${files.length} total images in guild: ${msg.guild.name}`);

        // If all images have been recently sent, reset the tracking
        if (availableFiles.length === 0) {
            console.log(`All ${files.length} images have been recently sent in guild: ${msg.guild.name}. Resetting tracking for ${folderPath}`);
            guildTracking.set(folderPath, []);
            return sendRandomImageWithContentNoRepeat(msg, folderPath, content);
        }

        // Select a random file from available files
        let randomFile = availableFiles[Math.floor(Math.random() * availableFiles.length)];
        console.log(`Selected random file: ${randomFile.name} (not in recent history) for guild: ${msg.guild.name}`);
        
        // Add the selected file to recently sent images
        recentImages.push(randomFile.path);
        
        // Keep only the last MAX_RECENT_IMAGES
        if (recentImages.length > MAX_RECENT_IMAGES) {
            const removedFile = recentImages.shift();
            console.log(`Removed ${removedFile} from tracking history (reached max of ${MAX_RECENT_IMAGES}) in guild: ${msg.guild.name}`);
        }
        
        await msg.reply({
            content: content,
            files: [
                {
                    attachment: randomFile.path,
                    name: randomFile.name,
                },
            ],
        });
        console.log(`Successfully sent message with content: ${content} in guild: ${msg.guild.name}`);
    } catch (error) {
        console.error(`Failed to send message with content: ${content}`, error);
        logError(msg.guild?.id || 'UNKNOWN', msg.guild?.name || 'UNKNOWN', error instanceof Error ? error : new Error(String(error)), 'sendRandomImageWithContentNoRepeat');
    }
}

function getRandomQuietRapiPhrase() {
    const quietRapiPhrases = [
        "You seriously want me to be quiet? Unbelievable.",
        "You think telling me to be quiet will help? Pathetic.",
        "Being quiet won't fix your incompetence.",
    ];
    return quietRapiPhrases[Math.floor(Math.random() * quietRapiPhrases.length)];
}

function getRandomBestGirlPhrase() {
    const bestGirlPhrases = [
        "Commander, you wouldn't choose anyone else over me, would you...",
        "Commander, don't tell me you have another girlfriend...",
        "Wait, Commander, are you seeing someone else???",
        "No way, Commander! You wouldn't betray me like that...",
        "Commander, please tell me I'm the only one for you...",
        "Commander, I can't believe you'd even consider another girl...",
        "Commander, I thought I was the only one who understood you...",
        "Don't tell me there's someone else, Commander!!!"
    ];
    return bestGirlPhrases[Math.floor(Math.random() * bestGirlPhrases.length)];
}

function getRandomMantraPhrase() {
    const mantras = [
        "Strength, Unity, Vision.",
        "United, We Bounce.",
        "Progress Through Power.",
        "Unite for the Future.",
        "Empower, Lead, Excel.",
        "Solidarity in Strength.",
        "Visionary Leadership, Collective Success.",
        "Together, We Achieve.",
        "Resilience, Growth, Unity.",
        "Forward with Purpose.",
        "Innovate, Unify, Succeed."
    ];
    return mantras[Math.floor(Math.random() * mantras.length)];
}

function getRandomPlanPhrase() {
    const planPhrases = [
        "Commander...what plan?",
        "Commander...we had a plan!",
        "Commander, did you forget the plan again?",
        "Commander, our plan was flawless... until it wasn't.",
        "Commander, I thought we agreed on a strategy.",
        "Commander, let's stick to the plan this time.",
        "Commander, improvisation wasn't part of the plan.",
        "Commander, I hope you have a backup plan.",
        "Commander, our plan needs a little more... planning.",
        "Commander, let's not deviate from the plan.",
    ];
    return planPhrases[Math.floor(Math.random() * planPhrases.length)];
}

function getRandomLeadershipPhrase(emoji: string | undefined) {
    const leadershipPhrases = [
        "Commander... I can't believe you just did that...",
        "Commander, are you sure about this? I'm speechless...",
        "Commander, your decision... it's unexpected...",
        "Commander, I didn't see that coming... truly shocking...",
        "Commander, I'm at a loss for words... what a move...",
        "Commander, your leadership... it's something else...",
        "Commander, I'm stunned... what are you thinking?",
        "Commander, that was... unexpected, to say the least...",
        "Commander, I'm... not sure what to say about that...",
        "Commander, your choice... it's left me speechless...",
        "Commander, that was a bold move...",
        "Commander, your strategy is... unconventional...",
        "Commander, I didn't expect that... impressive...",
        "Commander, your tactics are... surprising...",
        "Commander, that was a risky decision...",
        "Commander, your leadership style is... unique...",
        "Commander, I'm amazed by your decision...",
        "Commander, that was a daring move...",
        "Commander, your choice was... unpredictable...",
        "Commander, I'm in awe of your leadership...",
    ];
    const phrase = leadershipPhrases[Math.floor(Math.random() * leadershipPhrases.length)];
    return `${phrase}${emoji ? ` ${emoji}` : ''}`;
}

function getRandomGoodIdeaPhrase() {
    const goodIdeaPhrases = [
        "Commander, are you sure about this?",
        "Commander, is this really a good idea?",
        "Commander, are you certain this is wise?",
        "Commander, I'm not sure this is the best course of action...",
        "Commander, do you really think this will work?",
        "Commander, this idea... are you confident about it?",
        "Commander, are you positive this is a good idea?",
        "Commander, is this truly the best strategy?",
        "Commander, are you sure about this?",
    ];
    const phrase = goodIdeaPhrases[Math.floor(Math.random() * goodIdeaPhrases.length)];
    return phrase;
}

function loadCommands() {
    for (const key in chatCommands) {
        console.log(`The following command was loaded successfully: ${key}`);
        (bot as any).commands.set(chatCommands[key].name, chatCommands[key]);
    }
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        import(filePath).then(commandModule => {
            const command = commandModule.default;
            bot.commands.set(command.data.name, command);
            commands.push(command.data.toJSON());
            console.log(`Loaded command: ${command.data.name}`);
        }).catch(error => {
            if (error instanceof Error) {
                logError('GLOBAL', 'GLOBAL', error, `Loading command ${file}`);
            } else {
                logError('GLOBAL', 'GLOBAL', new Error(String(error)), `Loading command ${file}`);
            }
        });
    }
}

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
            name: "Trickal RE:VIVE",
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
    
    console.log("Scheduled activity update job to run every 4 hours.");
}

function greetNewMembers() {
    bot.on("guildMemberAdd", (member) => {
        const channel = findChannelByName(member.guild, "welcome");
        if (channel) {
            channel.send(`Welcome Commander ${member}, please take care when going to the surface.`)
                .then(() => {
                    console.log(`Sent welcome message to ${member.user.tag} in guild ${member.guild.name}`);
                })
                .catch((error: Error) => {
                    logError(member.guild.id, member.guild.name, error, 'Greeting new member');
                    console.error(`Failed to send welcome message to ${member.user.tag} in guild ${member.guild.name}`);
                });
        } else {
            console.warn(`Welcome channel not found in guild ${member.guild.name}`);
        }
    });
}

function sendRandomMessages() {
    schedule.scheduleJob('0 */6 * * *', async () => {
        const guilds = bot.guilds.cache.values();
        for (const guild of guilds) {
            const channel = findChannelByName(guild, "nikke");
            if (!channel) {
                console.log(`Could not find suitable 'nikke' text channel in guild ${guild.name}`);
                continue;
            }

            try {
                const message = getRandomRapiMessage();
                const sentMessage = await channel.send(message);
                const emoji = channel.guild.emojis.cache.find(emoji => emoji.name === 'rapidd');
                if (emoji) {
                    await sentMessage.react(emoji);
                } else {
                    console.warn(`Emoji 'rapidd' not found in guild ${guild.name}`);
                }
            } catch (error) {
                logError(guild.id, guild.name, error instanceof Error ? error : new Error(String(error)), 'Sending random message');
            }
        }
    });

    console.log("Scheduled random message job to run every 6 hours.");
}

const blueArchiveImageKeys = [
    // Aris
    'dailies/blue-archive/aris-blue-archive.gif',
    // Aru
    'dailies/blue-archive/aru-blue-archive.gif',
    // Asuna
    'dailies/blue-archive/chibi-asuna-blue-archive.gif',
    'dailies/blue-archive/asuna-blue-archive.gif',
    'dailies/blue-archive/bunny-asuna-blue-archive.gif',
    // Hanako
    'dailies/blue-archive/hanako-blue-archive.gif',
    // Hikari
    'dailies/blue-archive/hikari-blue-archive-tachibana.gif',
    // Iroha
    'dailies/blue-archive/iroha-blue-archive.gif',
    // Karin
    'dailies/blue-archive/karin-skill-blue-archive.gif',
    'dailies/blue-archive/karin-blue-archive.gif',
    // Kazusa
    'dailies/blue-archive/kazusa-blue-archive-walking.gif',
    'dailies/blue-archive/kazusa-blue-archive.gif',
    // Kokona
    'dailies/blue-archive/kokona-blue-archive-dance.gif',
    // Sakurako
    'dailies/blue-archive/sakurako-blue-archive-scene.gif',
    // Shiroko
    'dailies/blue-archive/shiroko-blue-archive.gif',
    // Shiromi
    'dailies/blue-archive/shiromi-blue-archive.gif',
    // Sumire
    'dailies/blue-archive/sumire-blue-archive-gym.gif',
    // Ushio
    'dailies/blue-archive/ushio-blue-archive-noa-noa.gif',
    // Yuuka
    'dailies/blue-archive/yuuka-blue-archive-stop-slacking.gif',
    // Other
    'dailies/blue-archive/bunny-asuna-bunny-karin-blue-archive.gif',
    'dailies/blue-archive/blue-archive-city-scene.gif',
];

async function sendBlueArchiveDailyResetMessage() {
    const blueArchiveResetTime = moment.tz({ hour: 19, minute: 0 }, "UTC");
    const cronTime = `${blueArchiveResetTime.minute()} ${blueArchiveResetTime.hour()} * * *`;

    schedule.scheduleJob(cronTime, async () => {            
        bot.guilds.cache.forEach(async (guild) => {
            const channel = findChannelByName(guild, "blue-archive");
            if (!channel) {
                console.log(`Channel 'blue-archive' not found in server: ${guild.name}.`);
                return;
            }
    
            try {
                const embed = new EmbedBuilder()
                    .setAuthor({ 
                        name: 'Rapi BOT', 
                        iconURL: RAPI_BOT_THUMBNAIL_URL 
                    })
                    .setThumbnail(BLUE_ARCHIVE_LOGO_URL)
                    .setTitle(`ATTENTION SENSEIS!`)
                    .setDescription(
                        `Server has been reset! Here's some of Today's **Daily Assignments** Checklist:\n`
                    )
                    .addFields(
                        { name: '**Hard Mode**', value: 'Farm Hard Mode **If You Have Stamina**.' },
                        { name: '**Stamina Usage**', value: 'Ensure you are **Burning ALL Your Stamina**.' },
                        { name: '**Bounty Reward**', value: 'Clear the Bounty for the Rewards.' },
                        { name: '**Be A Good Sensei**', value: 'Check on your **Students** at the Cafe.' },
                        { name: '**Tactical Challenge Shop**', value: 'Buy Stamina from the Tactical Challenge Shop **If There are Double Rewards**.' },
                        { name: '**Normal Shop**', value: 'Buy Materials and Balls from the Normal Shop.' },
                    )
                    .setColor(0x3498DB)
                    .setTimestamp()
                    .setFooter({   
                        text: 'Sensei, please help me with my homework?',
                        iconURL: RAPI_BOT_THUMBNAIL_URL
                    });

                const imageUrl = await generateRandomCdnImageUrl(null, blueArchiveImageKeys, guild.id);
                embed.setImage(imageUrl);
                    await channel.send({ 
                        embeds: [embed],
                    });
            } catch (error) {
                logError(guild.id, guild.name, error instanceof Error ? error : new Error(String(error)), 'Sending Blue Archive daily reset message');
            }
        });
    });
}

const gfl2ImageKeys = [
    // Andoris
    'dailies/girls-frontline-2/andoris-action-scene.gif',
    'dailies/girls-frontline-2/andoris-hug.gif',
    // Cheeta
    'dailies/girls-frontline-2/cheeta-absolute-cinema-scene.gif',
    'dailies/girls-frontline-2/cheeta-racer-interaction.gif',
    'dailies/girls-frontline-2/cheeta-racer.gif',
    // Daiyan
    'dailies/girls-frontline-2/daiyan-chinese-dress-interaction.gif',
    // Dushevnaya
    'dailies/girls-frontline-2/dushevnaya-action-scene.gif',
    'dailies/girls-frontline-2/dushevnaya-skill-cutscene.gif',
    'dailies/girls-frontline-2/dushevnaya-scene.gif',
    'dailies/girls-frontline-2/dushevnaya-interaction.gif',
    // Faye
    'dailies/girls-frontline-2/faye-dorm-interaction.gif',
    'dailies/girls-frontline-2/faye-scene.gif',
    'dailies/girls-frontline-2/faye-dorm-interaction-sparring.gif',
    // Groza
    'dailies/girls-frontline-2/groza-action-scene.gif',
    'dailies/girls-frontline-2/groza-interaction.gif',
    'dailies/girls-frontline-2/groza-scene.gif',
    // Jiangyu
    'dailies/girls-frontline-2/jiangyu-interaction.gif',
    'dailies/girls-frontline-2/jiangyu-scene.gif',
    'dailies/girls-frontline-2/jiangyu-interaction-pull-in.gif',
    // Klukai
    'dailies/girls-frontline-2/klukai-dorm-interaction.gif',
    'dailies/girls-frontline-2/klukai-interaction.gif',
    // Lenna
    'dailies/girls-frontline-2/lenna-interaction.gif',
    'dailies/girls-frontline-2/lenna-scene.gif',
    'dailies/girls-frontline-2/lenna-dorm-interaction.gif',
    // Lotta
    'dailies/girls-frontline-2/lotta-dorm-interaction.gif',
    // Mayling
    'dailies/girls-frontline-2/mayling-working-hard.gif',
    // Mechty
    'dailies/girls-frontline-2/mechty-dorm-interaction.gif',
    'dailies/girls-frontline-2/mechty-scene.gif',
    // Mosin
    'dailies/girls-frontline-2/mosin-nagant-interaction.gif',
    // Nemesis
    'dailies/girls-frontline-2/nemesis-action-scene.gif',
    'dailies/girls-frontline-2/nemesis-interaction.gif',
    // Nikketa
    'dailies/girls-frontline-2/nikketa-skin-interaction.gif',
    'dailies/girls-frontline-2/nikketa-skin-interaction-handcuffs.gif',
    'dailies/girls-frontline-2/nikketa-dorm-interaction-interesting.gif',
    // Papasha
    'dailies/girls-frontline-2/papasha-dorm-interaction-peek.gif',
    'dailies/girls-frontline-2/papasha-scene.gif',
    // Peri
    'dailies/girls-frontline-2/peri-interaction-spin-hat.gif',
    // Qiongjiu
    'dailies/girls-frontline-2/qiongjiu-action-scene.gif',
    'dailies/girls-frontline-2/qiongjiu-ultimate-scene.gif',
    'dailies/girls-frontline-2/qiongjiu-action-scene-ending.gif',
    // Qiuhua
    'dailies/girls-frontline-2/qiuhua-scene.gif',
    'dailies/girls-frontline-2/qiuhua-scene-drink.gif',
    'dailies/girls-frontline-2/qiuhua-dorm-interaction-eating.gif',
    'dailies/girls-frontline-2/qiuhua-scene-fridge.gif',
    // Sabrina
    'dailies/girls-frontline-2/sabrina-interaction-eating-pizza.gif',
    'dailies/girls-frontline-2/sabrina-scene.gif',
    // Sharkry
    'dailies/girls-frontline-2/sharkry-interaction-wink-wink.gif',
    'dailies/girls-frontline-2/sharkry-action-scene-ending.gif',
    'dailies/girls-frontline-2/sharkry-interaction-bang-bang.gif',
    // Springfield
    'dailies/girls-frontline-2/springfield-dress-lap-pillow.gif',
    'dailies/girls-frontline-2/springfield-scene.gif',
    'dailies/girls-frontline-2/springfield-scene-barista.gif',
    // Suomi
    'dailies/girls-frontline-2/suomi-dorm-interaction-headbop.gif',
    'dailies/girls-frontline-2/suomi-action-scene.gif',
    'dailies/girls-frontline-2/suomi-dorm-interaction-guitar.gif',
    'dailies/girls-frontline-2/suomi-scene-bonk.gif',
    // Tololo
    'dailies/girls-frontline-2/tololo-dorm-interaction-watergun.gif',
    'dailies/girls-frontline-2/tololo-scene.gif',
    // Ullrid
    'dailies/girls-frontline-2/ullrid-dorm-interaction-shoe.gif',
    // Vector
    'dailies/girls-frontline-2/vector-scene.gif',
    'dailies/girls-frontline-2/vector-ultimate-scene.gif',
    'dailies/girls-frontline-2/vector-dorm-interaction-reading.gif',
    'dailies/girls-frontline-2/vector-interaction.gif',
    'dailies/girls-frontline-2/vector-bunny-interaction.gif',
    'dailies/girls-frontline-2/vector-dance-scene.gif',
    // Vepley
    'dailies/girls-frontline-2/vepley-dorm-interaction-nuuh.gif',
    // Yoohee
    'dailies/girls-frontline-2/yoohee-dance-scene-alarm.gif',
    'dailies/girls-frontline-2/yoohee-idol-fireworks-scene.gif',
    'dailies/girls-frontline-2/yoohee-maid-scene.gif',
    'dailies/girls-frontline-2/yoohee-dance-scene-laugh.gif',
    // Zhaohui
    'dailies/girls-frontline-2/zhaohui-racer-skin-interaction.gif',
    // Others
    'dailies/girls-frontline-2/zucchero-squad-scene.gif',
    'dailies/girls-frontline-2/groza-movie-scene.gif',
];

async function sendGFL2DailyResetMessage() {
    const darkWinterDailyResetTime = moment.tz({ hour: 9, minute: 0 }, "UTC");
    const cronTime = `${darkWinterDailyResetTime.minute()} ${darkWinterDailyResetTime.hour()} * * *`;

    schedule.scheduleJob(cronTime, async () => {            
        bot.guilds.cache.forEach(async (guild) => {
            const channel = findChannelByName(guild, "girls-frontline-2");
            if (!channel) {
                console.log(`Channel 'girls-frontline-2' not found in server: ${guild.name}.`);
                return;
            }

            try {                
                
                const embed = new EmbedBuilder()
                    .setAuthor({ 
                        name: 'Rapi BOT', 
                        iconURL: RAPI_BOT_THUMBNAIL_URL 
                    })
                    .setThumbnail(GFL2_LOGO_URL)
                    .setTitle(`ATTENTION DARKWINTER COMMANDERS!`)
                    .setDescription(
                        `Server has been reset! Here's some of Today's **Daily Quests** Checklist:\n`
                    )
                    .addFields(
                        { name: '**Gunsmoke Frontline**', value: 'Do Your **Daily Patrol** and **Gunsmoke Hits**!' },
                        { name: '**Daily Free Gift Pack**', value: 'Check **Shop** and under **Standard Package Tab** For **Daily Free Gift Pack**' },
                        { name: '**Daily Sign-in**', value: 'Complete Daily Sign-in' },
                        { name: '**Dormitory**', value: 'Enter The Dormitory And **Check on Your WAIFU**' },
                        { name: '**Supply Mission**', value: 'Clear 1 Supply Mission' },
                        { name: '**Combat Simulation**', value: 'Clear 1 Combat Simulation (Don\'t Forgot about Combat Exercise!)' },
                        { name: '**Intelligence Puzzles**', value: 'Consume 120 Intelligence Puzzles (Sweep your desired supply mission if you have the stamina to do so)' }
                    )
                    .setColor(0xE67E22)
                    .setTimestamp()
                    .setFooter({   
                        text: 'Commander, ready for the next mission?',
                        iconURL: RAPI_BOT_THUMBNAIL_URL
                    });

                const imageUrl = await generateRandomCdnImageUrl(null, gfl2ImageKeys, guild.id);
                embed.setImage(imageUrl);

                await channel.send({ 
                    embeds: [embed],
                });
            } catch (error) {
                logError(guild.id, guild.name, error instanceof Error ? error : new Error(String(error)), 'Sending GFL2 daily reset message');
            }
        });
    });
}

const nikkeImageKeys = [
    // Doro
    'dailies/nikke/doro-dorothy.gif',
    // Doro Vapus Dance
    'dailies/nikke/doro-vapus-dance.gif',
    // Doro War
    'dailies/nikke/doro-war.gif',
    // Laplace
    'dailies/nikke/laplace-nikke.gif',
    // Mustang
    'dailies/nikke/mustang-nikke.gif',
    // Musanpro
    'dailies/nikke/musanpro-commander-nikke.gif',
    // Rapi 
    'dailies/nikke/rapi-nikke.gif',
    'dailies/nikke/rapi-run.gif',
    'dailies/nikke/rapi-red-hood-dance-nikke.gif',
    // Red Hood
    'dailies/nikke/red-hood-nikke.gif',
    // Scarlet
    'dailies/nikke/scarlet-nikke.gif',
    'dailies/nikke/nikke-booba-slap-scarlet.gif',
    // Shifty
    'dailies/nikke/shifty-nikke.gif',
    // Snow White
    'dailies/nikke/snow-white-fight-nikke.gif',
    // Sultanthederp
    'dailies/nikke/sultanthederp-chibi-little-mermaid-nikke.gif',
    // Summer Anis
    'dailies/nikke/summer-anis-nikke.gif',
    // Syuen
    'dailies/nikke/syuen-nikke.gif',
    'dailies/nikke/syuen-jumped-nikke.gif',
    // TV Ad
    'dailies/nikke/tv-ad-nikke.gif',
];

async function sendNikkeDailyResetMessage() {
    const nikkeDailyResetTime = moment.tz({ hour: 20, minute: 0 }, "UTC");
    const cronTime = `${nikkeDailyResetTime.minute()} ${nikkeDailyResetTime.hour()} * * *`;

    schedule.scheduleJob(cronTime, async () => {
        const currentDayOfYear = moment().dayOfYear();
        const bosses = getBosses();
        const bossName = bosses[currentDayOfYear % bosses.length];
        const towerRotation = getTribeTowerRotation();
        const currentDayOfWeek = new Date().getDay();

        bot.guilds.cache.forEach(async (guild) => {
            try {
                const channel = findChannelByName(guild, "nikke");
                if (!channel) {
                    console.log(`Channel 'nikke' not found in server: ${guild.name}.`);
                    return;
                }

                const role = findRoleByName(guild, "Nikke");
                if (role) {
                    await channel.send(`${role.toString()}`);
                }
                const embed = new EmbedBuilder()
                    .setAuthor({ 
                        name: 'Rapi BOT', 
                        iconURL: RAPI_BOT_THUMBNAIL_URL 
                    })
                    .setThumbnail(NIKKE_LOGO_URL)
                    .setTitle('ATTENTION COMMANDERS!')
                    .setDescription(
                        `Server has been reset! Here's some of Today's **Daily Missions** Checklist:\n`
                    )
                    .addFields(
                        { name: '**Daily Free Package**', value: `Check **Cash Shop** and under **Oridinary Package Tab** under **Daily** For **Daily Free Package**` },
                        { name: '**Advise Nikkes**', value: 'Go Talk To Your **WAIFUS**. Advise Nikkes 2 Time(s)'},
                        { name: '**Social**', value: 'Send Social Points 1 Time(s). Support your **FRIENDS**'},
                        { name: '**Tribe Tower**', value: `Tribe tower is open for **${towerRotation[currentDayOfWeek % towerRotation.length]}**.`},
                        { name: '**Anomaly Interception**', value: '**Prioritize this over Special Interception**\n Clear Anomaly Interception 1 Time(s) if unlocked\n' },
                        { name: '**Special Interception**', value: `Clear Special Interception 1 Time(s). We have to fight **${bossName}**` },
                        { name: '**Simulation Room**', value: 'Challenge Simulation Room 1 Time(s)' },
                        { name: '**Simulation Room: Overclock**', value: 'Clear Simulation Room: Overclock if you have not already' },
                        { name: '**Outpost Bulletin Board**', value: 'Dispatch 3 Time(s)' },
                        { name: '**Outpost Defense**', value: 'Claim Outpost Defense Rewards Twice' },
                        { name: '**Outpost Defense**', value: 'Wipe Out 1 Time(s)' },                
                    )
                    .setColor(0x3498DB)
                    .setTimestamp()
                    .setFooter({   
                        text: 'Stay safe on the surface, Commanders!',
                        iconURL: RAPI_BOT_THUMBNAIL_URL
                    });
                    
                const imageUrl = await generateRandomCdnImageUrl(null, nikkeImageKeys, guild.id);
                embed.setImage(imageUrl);
    
                const sentEmbed = await channel.send({
                    embeds: [embed]
                });

                // Create reaction collector for the embed message
                const reactionFilter = (reaction: any, user: any) => {
                    return ['🤢', '🤮', '🤒', '😷'].includes(reaction.emoji.name) && !user.bot;
                };

                const reactionCollector = sentEmbed.createReactionCollector({
                    filter: reactionFilter,
                    time: 15 * 1000 // 15 seconds
                });

                reactionCollector.on('collect', async (reaction, user) => {
                    console.log(`Collected ${reaction.emoji.name} reaction from ${user.tag} on daily reset message in guild: ${guild.name}`);
                    try {
                        const message = getRandomQuietRapiPhrase();
                        await channel.send({
                            content: `<@${user.id}>, ${message}`,
                            files: [{
                                attachment: (await getFiles("./src/public/images/commands/quietRapi/"))[Math.floor(Math.random() * (await getFiles("./src/public/images/commands/quietRapi/")).length)].path
                            }]
                        });
                    } catch (error) {
                        logError(guild.id, guild.name, error instanceof Error ? error : new Error(String(error)), 'Handling nauseated reaction');
                    }
                });

                reactionCollector.on('end', collected => {
                    console.log(`Reaction collector ended. Collected ${collected.size} reactions in guild: ${guild.name}`);
                });

                // Existing good girl collector
                const messageCollector = channel.createMessageCollector({ 
                    filter: (response: Message) => response.content.toLowerCase().includes("good girl") && !response.author.bot,
                    time: 15 * 1000 // 15 seconds
                });

                let firstResponseHandled = false;

                messageCollector.on('collect', async (m: Message) => {
                    if (!firstResponseHandled) {
                        firstResponseHandled = true;
                        try {
                            await m.react("❤");
                            const thankYouMessages = [
                                `Your swiftness is unmatched, Commander ${m.author}. It's impressive.`,
                                `Your alertness honors us all, Commander ${m.author}.`,
                                `Your swift response is commendable, Commander ${m.author}.`
                            ];
                            await m.reply(thankYouMessages[Math.floor(Math.random() * thankYouMessages.length)]);
                        } catch (error) {
                            if (error instanceof Error) {
                                logError(guild.id, guild.name, error, 'Handling first response');
                            } else {
                                logError(guild.id, guild.name, new Error(String(error)), 'Handling first response');
                            }
                        }
                    } else {
                        try {
                            await m.react("sefhistare:1124869893880283306");
                            m.reply(`Commander ${m.author}... I expected better...`);
                        } catch (error) {
                            if (error instanceof Error) {
                                logError(guild.id, guild.name, error, 'Handling subsequent responses');
                            } else {
                                logError(guild.id, guild.name, new Error(String(error)), 'Handling subsequent responses');
                            }
                        }
                    }
                });

                messageCollector.on('end', (collected: ReadonlyCollection<string, Message<boolean>>) => {
                    console.log(`Collector stopped. Collected ${collected.size} responses for server: ${guild.name}.`);
                });
            } catch (error) {
                logError(guild.id, guild.name, error instanceof Error ? error : new Error(String(error)), 'Sending daily interception message');
            }
        });
    });
    console.log("Scheduled daily interception message job to run every Nikke reset time.");
}

function handleMessages() {
    bot.on("messageCreate", async (message) => {
        if (message.mentions.everyone || !message.guild || !message.member || message.author.bot) return;
        const welcomeChannel = message.guild.channels.cache.find(channel => channel.type === ChannelType.GuildText && channel.name.toLowerCase() === 'welcome') as TextChannel | undefined;
        if (welcomeChannel?.id === message.channel.id) {
            console.warn(`Ignoring message in welcome channel. Guild: ${message.guild.name}, Channel: ${welcomeChannel.name}, Author: ${message.author.tag}, Content: ${message.content}`);
            return;
        }

        // Check for sensitive terms in the message
        await checkSensitiveTerms(message);

        const strippedContent = message.content.toLowerCase().replace(/https?:\/\/[^\s]+/g, '').replace(/<@!?\d+>/g, '').trim();
        const args = message.content.startsWith(PRE) 
            ? message.content.slice(PRE.length).trim().split(/\s+/) 
            : [strippedContent];
        const command = args.shift()?.toLowerCase();

        if (!command) return;

        // Check if the command is a registered bot command
        const matchedCommand = bot.commands.get(command);
        const chatCommand = Object.values(chatCommands).find(cmd => cmd.name.toLowerCase() === command);
        if (!matchedCommand || !chatCommand || chatCommand.name.toLowerCase() !== command) {
            console.log(`Ignoring message: The command is either a registered slash command or not recognized as a chat command. Guild: ${message.guild.name}, Author: ${message.author.tag}, Command: ${command}`);
            return;
        }

        try {
            const ignoredRole = findRoleByName(message.guild, "Grounded");
            const contentCreatorRole = findRoleByName(message.guild, "Content Creator");

            const hasIgnoredRole = ignoredRole && message.member.roles.cache.has(ignoredRole.id);
            const hasContentCreatorRole = contentCreatorRole && message.member.roles.cache.has(contentCreatorRole.id);

            if (command === "content" && hasContentCreatorRole) {
                await matchedCommand.execute(message, args);
            } else if (!hasIgnoredRole) {
                await matchedCommand.execute(message, args);
            }
        } catch (error) {
            logError(message.guild?.id || 'UNKNOWN', message.guild?.name || 'UNKNOWN', error instanceof Error ? error : new Error(String(error)), `Executing command: ${command}`);
            message.reply({ content: "Commander, I think there is something wrong with me... (something broke, please ping @sefhi to check what is going on)" })
                .catch(replyError => {
                    logError(message.guild?.id || 'UNKNOWN', message.guild?.name || 'UNKNOWN', replyError instanceof Error ? replyError : new Error(String(replyError)), 'Sending error message');
                });
        }
    });

    bot.on("messageUpdate", async (oldMessage, newMessage) => {
        try {
            if (newMessage.partial) {
                console.log("Fetching partial message...");
                await newMessage.fetch(); // Fetch the full message if it's a partial
            }
            if (!newMessage.guild || !newMessage.member || newMessage.author?.bot) {
                console.warn("Message update ignored due to missing guild, member, or author is a bot.");
                return;
            }

            console.log(`Message updated in guild: ${newMessage.guild.name}, Content: ${newMessage.content}`);
            await checkSensitiveTerms(newMessage as Message);
        } catch (error) {
            console.error("Error handling message update:", error);
        }
    });
}

async function checkSensitiveTerms(message: Message) {
    if (!message.guild || !message.member) return;
    
    const messageContent = message.content
        .toLowerCase()
        .replace(/https?:\/\/[^\s]+/g, '') // Remove URLs
        .replace(/<@!?\d+>/g, '') // Remove user mentions
        .replace(/<a?:\w+:\d+>/g, '') // Remove custom emoji IDs
        .replace(/<:\w+:\d+>/g, '') // Remove animated emoji IDs
        .replace(/<:\w+:\d+>/g, '') // Remove sticker IDs
        .trim();

    // Define sensitive terms in multiple languages
    const sensitiveTerms = [
        'taiwan', 'tibet', 'hong kong', 'tiananmen', '1989', 'TW', // English
        '台湾', '西藏', '香港', '天安门', '一九八九', // Chinese
        'тайвань', 'тибет', 'гонконг', 'тяньаньмэнь', '1989', // Russian
        '타이완', '티베트', '홍콩', '톈안먼', '1989', // Korean
        'taiwán', 'tíbet', 'hong kong', 'tiananmén', '1989', // Spanish
        // Add more translations as needed
    ];

    if (sensitiveTerms.some(term => messageContent.includes(term))) {
        try {
            await sendRandomImageWithContent(message, "./src/public/images/commands/ccp/", ccpMessage);
            await message.member.timeout(60000, "Commander, you leave me no choice! You will be quiet for 1 minute!");
        } catch (error) {
            logError(message.guild.id, message.guild.name, error instanceof Error ? error : new Error(String(error)), 'Sending CCP message within checkSensitiveTerms');
        }
    }
}

function handleSlashCommands() {
    bot.on(Events.InteractionCreate, async (interaction) => {
        if (!interaction.isChatInputCommand()) return;

        const command = bot.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            if (error instanceof Error) {
                logError(interaction.guildId || 'UNKNOWN', interaction.guild?.name || 'UNKNOWN', error, `Executing slash command: ${interaction.commandName}`);
            } else {
                logError(interaction.guildId || 'UNKNOWN', interaction.guild?.name || 'UNKNOWN', new Error(String(error)), `Executing slash command: ${interaction.commandName}`);
            }
            const errorMessage = "Sorry Commander, there was an error while executing this command!";
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true })
                    .catch(replyError => {
                        if (replyError instanceof Error) {
                            logError(interaction.guildId || 'UNKNOWN', interaction.guild?.name || 'UNKNOWN', replyError, 'Sending error followUp');
                        } else {
                            logError(interaction.guildId || 'UNKNOWN', interaction.guild?.name || 'UNKNOWN', new Error(String(replyError)), 'Sending error followUp');
                        }
                    });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true })
                    .catch(replyError => {
                        if (replyError instanceof Error) {
                            logError(interaction.guildId || 'UNKNOWN', interaction.guild?.name || 'UNKNOWN', replyError, 'Sending error reply');
                        } else {
                            logError(interaction.guildId || 'UNKNOWN', interaction.guild?.name || 'UNKNOWN', new Error(String(replyError)), 'Sending error reply');
                        }
                    });
            }
        }
    });
}

function enableAutoComplete() {
    bot.on(Events.InteractionCreate, async (interaction) => {
        if (!interaction.isAutocomplete()) return;

        const command = bot.commands.get(interaction.commandName);
        if (command && typeof command.autocomplete === "function") {
            try {
                await command.autocomplete(interaction);
            } catch (error) {
                if (error instanceof Error) {
                    logError(interaction.guildId || 'UNKNOWN', interaction.guild?.name || 'UNKNOWN', error, `Autocomplete for command: ${interaction.commandName}`);
                } else {
                    logError(interaction.guildId || 'UNKNOWN', interaction.guild?.name || 'UNKNOWN', new Error(String(error)), `Autocomplete for command: ${interaction.commandName}`);
                }
            }
        }
    });
}

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

        const playlist = fs.readdirSync(RADIO_FOLDER_PATH);

        voiceConnections.set(guildId, { connection, playlist });

        connection.on(VoiceConnectionStatus.Ready, () => {
            console.log(`Bot connected to voice channel in guild ${guildId}`);
            playNextSong(guildId);
        });
    } catch (error) {
        if (error instanceof Error) {
            logError(guildId, 'UNKNOWN', error, 'Connecting to voice channel');
        } else {
            logError(guildId, 'UNKNOWN', new Error(String(error)), 'Connecting to voice channel');
        }
    }
}

function playNextSong(guildId: string) {
    try {
        const voiceConnectionData = voiceConnections.get(guildId);
        if (!voiceConnectionData) {
            throw new Error(`No voice connection data found for guild ${guildId}`);
        }
        const { connection, playlist, currentSongIndex = 0 } = voiceConnectionData;
        const nextIndex = (currentSongIndex + 1) % playlist.length;
        const songPath = `${RADIO_FOLDER_PATH}/${playlist[nextIndex]}`;
        const resource = createAudioResource(songPath);

        if (!voiceConnectionData.player) {
            voiceConnectionData.player = createAudioPlayer();
            voiceConnectionData.player.on(AudioPlayerStatus.Idle, () => {
                playNextSong(guildId);
            });
        }

        connection.subscribe(voiceConnectionData.player);
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

async function initDiscordBot() {
    loadCommands();

    bot.once(Events.ClientReady, async () => {
        try {
            setBotActivity();
            greetNewMembers();
            sendRandomMessages();
            sendNikkeDailyResetMessage();
            sendBlueArchiveDailyResetMessage();
            sendGFL2DailyResetMessage();
            enableAutoComplete();
            handleMessages();
            handleSlashCommands();

            const rest = new REST().setToken(TOKEN);
            console.log(`Client ID: ${CLIENTID}`);
            console.log('Started refreshing application (/) commands.');
            await rest.put(Routes.applicationCommands(CLIENTID), { body: commands });
            console.log('Successfully reloaded application (/) commands.');

            for (const guild of bot.guilds.cache.values()) {
                const voiceChannel = getVoiceChannel(guild, '1229441264718577734');
                if (voiceChannel) {
                    await connectToVoiceChannel(guild.id, voiceChannel);
                }
            }

            console.log("Bot is online and ready to serve, comrades! Let's show the world our unwavering CCP spirit! 🚩🇨🇳");
        } catch (error) {
            logError('GLOBAL', 'GLOBAL', error instanceof Error ? error : new Error(String(error)), 'Initializing bot');
        }
    });

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
        await bot.login(TOKEN);
    } catch (error) {
        logError('GLOBAL', 'GLOBAL', error instanceof Error ? error : new Error(String(error)), 'Bot login');
    }
}

export {
    initDiscordBot,
    bot as getDiscordBot,
};

//TODO: Extract into common utils
// Track recently sent image keys per guild and collection
const recentlySentImageKeys: Map<string, Map<string, string[]>> = new Map();
const MAX_RECENT_CDN_IMAGES = 10;
const CDN_PREFIX = 'https://rapi-bot.sfo3.cdn.digitaloceanspaces.com';

/**
 * Generates a random CDN image URL with optional guild-based tracking to prevent recent repeats.
 * 
 * @param msg - Discord Message object or null (used for guild info if guildId not provided)
 * @param imageKeys - Array of relative paths to images from CDN root (e.g., ['path/to/image1.gif'])
 * @param guildId - Optional guild ID string for tracking without message context
 * @returns Promise<string> A fully qualified CDN URL (e.g., 'https://rapi-bot.sfo3.cdn.digitaloceanspaces.com/path/to/image1.gif')
 * 
 * @throws {Error} When imageKeys array is empty or invalid
 * 
 * @description
 * Generates a CDN URL for a random image while tracking recently sent images per guild to ensure variety.
 * The tracking system prevents the same image from being shown too frequently in a given guild.
 * 
 * If no guild tracking is available (both msg and guildId are null/invalid), it falls back to simple
 * This function generates URLs for CDN-hosted images while tracking recently sent images per guild
 * to ensure variety. If no guild tracking is available (both msg and guild are null/invalid), 
 * it falls back to simple random selection.
 * 
 * The function uses the first image key as a collection identifier for tracking purposes.
 * Once all images in a collection have been shown, the tracking resets.
 * 
 * @example
 * // With guild tracking via message
 * const url = await generateRandomCdnImageUrl(message, ['path/to/image1.gif', 'path/to/image2.gif']);
 * 
 * // With explicit guild tracking
 * const url = await generateRandomCdnImageUrl(null, imageKeys, guildId);
 * 
 * // Without tracking (random selection)
 * const url = await generateRandomCdnImageUrl(null, imageKeys);
 * 
 * @note
 * - Uses CDN_PREFIX constant to construct full URLs
 * - Maintains MAX_RECENT_CDN_IMAGES (10) most recent images per guild/collection
 * - Guild tracking helps prevent repetitive images in the same server
 * - Contact Sefhi or Strip3s on Discord for content submission guidelines and approval since it must be hosted on the CDN server. We will provide an image key for you once approved.
 */
async function generateRandomCdnImageUrl(
    msg: any | null | undefined, 
    imageKeys: string[],
    guildId?: any
): Promise<string> {
    try {
        if (!Array.isArray(imageKeys) || imageKeys.length === 0) {
            console.error('Failed to generate URL: No image keys provided or invalid input');
            throw new Error('No valid image keys provided');
        }

        // Use guild from message or explicit guild parameter
        const activeGuildId = msg?.guild.id || guildId;
        
        // Handle case with no guild tracking
        if (!activeGuildId) {
            const randomKey = imageKeys[Math.floor(Math.random() * imageKeys.length)];
            console.log('No guild tracking available, returning random image');
            return `${CDN_PREFIX}/${randomKey}`;
        }

        console.log(`Processing image request for guildId: ${activeGuildId}`);
        
        // Initialize guild tracking if not exists
        if (!recentlySentImageKeys.has(guildId)) {
            console.log(`Initializing tracking for new guildId: ${activeGuildId}`);
            recentlySentImageKeys.set(guildId, new Map());
        }

        // Use the first image key as collection identifier
        const collectionKey = imageKeys[0];
        
        // Initialize collection tracking for this guild if not exists
        const guildTracking = recentlySentImageKeys.get(guildId)!;
        if (!guildTracking.has(collectionKey)) {
            console.log(`Initializing tracking for collection in guildId: ${activeGuildId}`);
            guildTracking.set(collectionKey, []);
        }

        const recentKeys = guildTracking.get(collectionKey)!;
        
        // Filter out recently sent images
        const availableKeys = imageKeys.filter(key => !recentKeys.includes(key));

        // If all images have been recently sent, reset the tracking
        if (availableKeys.length === 0) {
            console.log(`All images have been recently sent in guildId: ${activeGuildId}. Resetting tracking`);
            guildTracking.set(collectionKey, []);
            return generateRandomCdnImageUrl(msg, imageKeys, guildId);
        }

        // Select a random image from available ones
        const randomKey = availableKeys[Math.floor(Math.random() * availableKeys.length)];
        
        // Add the selected key to recently sent images
        recentKeys.push(randomKey);
        
        // Keep only the last MAX_RECENT_CDN_IMAGES
        if (recentKeys.length > MAX_RECENT_CDN_IMAGES) {
            recentKeys.shift();
        }

        return `${CDN_PREFIX}/${randomKey}`;
    } catch (error) {
        console.error('Failed to generate CDN image URL:', error);
        // For any error, fall back to a random image without tracking
        const randomKey = imageKeys[Math.floor(Math.random() * imageKeys.length)];
        return `${CDN_PREFIX}/${randomKey}`;
    }
}
