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
// CDN Constants
const CDN_PREFIX = 'https://rapi-bot.sfo3.cdn.digitaloceanspaces.com';
const DEFAULT_IMAGE_EXTENSIONS = ['.gif', '.png', '.jpg', '.webp'] as const;
const DEFAULT_VIDEO_EXTENSIONS = ['.mp4'] as const;



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
            const randomKey = await getRandomCdnMediaKey(
                "commands/readNikke/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: `${randomMessage}`,
                files: [cdnMediaUrl]
            });
        },
    },
    getDatNikke: {
        name: "rapi get dat nikke",
        async execute(msg) {
            const mentionedUser = msg.mentions.users.first();
            const messageReply = mentionedUser ? `Commander <@${mentionedUser.id}>... ` : '';
            const randomKey = await getRandomCdnMediaKey(
                "commands/getDatNikke/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: `${messageReply}`,
                files: [cdnMediaUrl]
            });
        },
    },
    booba: {
        name: "booba?",
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/booba/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 20
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                files: [cdnMediaUrl]
            });
        },
    },
    booty: {
        name: "booty?",
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/booty/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 20
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                files: [cdnMediaUrl]
            });
        },
    },
    skillissue: {
        name: "sounds like...",
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/skillIssue/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: `It sounds like you have some skill issues Commander.`,
                files: [cdnMediaUrl]
            });
        },
    },
    skillissueiphone: {
        name: "sounds like…",
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/skillIssue/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: `It sounds like you have some skill issues Commander.`,
                files: [cdnMediaUrl]
            });
        },
    },
    seggs: {
        name: "seggs?",
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/seggs/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_VIDEO_EXTENSIONS],
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: `Wait, Shifty, what are you talking about?`,
                files: [cdnMediaUrl]
            });
        },
    },
    kindaweird: {
        name: "kinda weird...",
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/kindaWeird/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: `But why, Commander?...`,
                files: [cdnMediaUrl]
            });
        },
    },
    iswear: {
        name: "i swear she is actually 3000 years old",
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/iSwear/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: `Commander... I'm calling the authorities.`,
                files: [cdnMediaUrl]
            });
        },
    },
    teengame: {
        name: "12+ game",
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/12Game/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: `Commander the surface is obviously safe for 12 year old kids.`,
                files: [cdnMediaUrl]
            });
        },
    },
    justice: {
        name: "justice for...",
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/justice/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 4
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: `Commander, let's take her out of NPC jail.`,
                files: [cdnMediaUrl]
            });
        },
    },
    whale: {
        name: "whale levels",
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/whaling/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: `Commander, it's fine if you are poor.`,
                files: [cdnMediaUrl]
            });
        },
    },
    discipline: {
        name: "lap of discipline.",
        async execute(msg) {
            const lapOfCountersKey = 'commands/lapOfDiscipline/lapOfCounters.webp';
            const lapOfDisciplineKey = 'commands/lapOfDiscipline/lapOfDiscipline.jpg';
            
            const lapOfCountersUrl = `${CDN_PREFIX}/${lapOfCountersKey}`;
            await msg.reply({
                content: `Commander ${msg.author}...`,
                files: [lapOfCountersUrl]
            });
            const lapOfDisciplineUrl = `${CDN_PREFIX}/${lapOfDisciplineKey}`;
            await msg.reply({
                content: `Commander ${msg.author}... Lap of discipline.`,
                files: [lapOfDisciplineUrl]
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
            const randomKey = await getRandomCdnMediaKey(
                "commands/wrongGirl/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 1
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: `(￢з￢) Well well, so you DO see us that way, interesting!`,
                files: [cdnMediaUrl]
            });
        },
    },
    moldRates: {
        name: "mold rates are not that bad",
        description: `Commander, what are you talking about?`,
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/moldRates/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 1
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: `Commander, what are you talking about?`,
                files: [cdnMediaUrl]
            });
        },
    },
    readyRapi: {
        name: "ready rapi?",
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/ready/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 1
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: `Commander... ready for what?`,
                files: [cdnMediaUrl]
            });
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
            const randomKey = await getRandomCdnMediaKey(
                "commands/wrong/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 1
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: `Commander...`,
                files: [cdnMediaUrl]
            });
        },
    },
    reward: {
        name: "reward?",
        description: "reward?",
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/reward/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 1
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: `Commander...`,
                files: [cdnMediaUrl]
            });
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

            const randomKey = await getRandomCdnMediaKey(
                "commands/damnTrain/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 1
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: `Commander...we don't talk about trains here.`,
                files: [cdnMediaUrl]
            });
        },
    },
    damngravedigger: {
        name: "damn gravedigger",
        description: "damn gravedigger",
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/damnGravedigger/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 2
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: "Commander...damn gravedigger?",
                files: [cdnMediaUrl]
            });
        },
    },
    deadSpicy: {
        name: "dead spicy?",
        description: "dead spicy?",
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/deadSpicy/",
                msg.guild.id,
                {
                    extensions: ['.gif'],
                    trackLast: 1
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: "Commander...dead spicy?",
                files: [cdnMediaUrl]
            });
        },
    },
    curseofbelorta: {
        name: "belorta...",
        description: "CURSE OF BELORTA",
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/belorta/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS, ...DEFAULT_VIDEO_EXTENSIONS],
                    trackLast: 5
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: "CURSE OF BELORTA𓀀 𓀁 𓀂 𓀃 𓀄 𓀅 𓀆 𓀇 𓀈 𓀉 𓀊 𓀋 𓀌 𓀍 𓀎 𓀏 𓀐 𓀑 𓀒 𓀓 𓀔 𓀕 𓀖 𓀗 𓀘 𓀙 𓀚 𓀛 𓀜 𓀝 𓀞 𓀟 𓀠 𓀡 𓀢 𓀣 𓀤 𓀥 𓀦 𓀧 𓀨  𓀪 𓀫 𓀬 𓀭 𓀮 𓀯 𓀰 𓀱 𓀲 𓀳 𓀴 𓀵 𓀶 𓀷 𓀸 𓀹 𓀺 𓀻 𓀼 𓀽 𓀾 𓀿 𓁀 𓁁 𓁂 𓁃 𓁄 𓁅 𓁆 𓁇 𓁈  𓁊 𓁋 𓁌 𓁍 𓁎 𓁏 𓁐 𓁑 𓀄 𓀅 𓀆 𓀇 𓀈 𓀉 𓀊",
                files: [cdnMediaUrl]
            });
        },
    },
    ccprules: {
        name: "ccp rules...",
        description: "CCP Rules",
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/ccpRules/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 1
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: "Commander...please review our CCP Guidelines set by El Shafto...",
                files: [cdnMediaUrl]
            });
        },
    },
    bestgirl: {
        name: "best girl?",
        description: "Best Girl Rapi",
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/bestGirl/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 3
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: getRandomBestGirlPhrase(),
                files: [cdnMediaUrl]
            });
        },
    },
    gambleradvice: {
        name: "99%",
        description: "Gamblers' Advice",
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/gamblerAdvice/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 3
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: "Commander...did you know 99% of gamblers quit before hitting it big?",
                files: [cdnMediaUrl]
            });
        },
    },
    ccpNumbahOne: {
        name: "ccp #1",
        description: "CCP LOYALTY",
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/ccp/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_VIDEO_EXTENSIONS],
                    trackLast: 1
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: getRandomMantraPhrase(),
                files: [cdnMediaUrl]
            });
        },
    },
    dorover: {
        name: "is it over?",
        description: "ITS DOROVER",
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/dorover/",
                msg.guild.id,
                {
                    extensions: ['.jpg'],
                    trackLast: 1
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: "Commander....ITS DOROVER",
                files: [cdnMediaUrl]
            });
        },
    },
    cinema: {
        name: "absolute...",
        description: "CINEMA",
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/cinema/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 1
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                files: [cdnMediaUrl]
            });
        },
    },
    plan: {
        name: "we had a plan!",
        description: "WE HAD A PLAN!",
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/plan/",
                msg.guild.id,
                {
                    extensions: ['.jpg', '.png'],
                    trackLast: 5
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
            await msg.reply({
                content: getRandomPlanPhrase(),
                files: [cdnMediaUrl]
            });
        },
    },
    leadership: {
        name: "ccp leadership",
        description: "CCP LEADERSHIP",
        async execute(msg) {
            try {
                const randomKey = await getRandomCdnMediaKey(
                    "commands/leadership/",
                    msg.guild.id,
                    {
                        extensions: [...DEFAULT_VIDEO_EXTENSIONS],
                        trackLast: 5
                    }
                );
                
                const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;
                const emoji = msg.guild.emojis.cache.get('1298977385068236852');
                const message = getRandomLeadershipPhrase(emoji);

                await msg.reply({
                    content: message,
                    files: [cdnMediaUrl]
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
            const randomKey = await getRandomCdnMediaKey(
                "commands/goodIdea/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;

            await msg.reply({
                content: getRandomGoodIdeaPhrase(),
                files: [cdnMediaUrl]
            });
            
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
            const randomKey = await getRandomCdnMediaKey(
                "commands/quietRapi/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;

            await msg.reply({
                content: `${msg.author}, ${getRandomQuietRapiPhrase()}`,
                files: [cdnMediaUrl]
            });
        },
    },
    entertainmentttt: {
        name: "entertainmentttt",
        description: "ENTERTAINMENTTTT",
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/entertainmentttt/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_VIDEO_EXTENSIONS],
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;

            await msg.reply({
                files: [cdnMediaUrl]
            });
        },
    },
    casualUnion: {
        name: "we casual",
        description: "CASUAL UNION?",
        async execute(msg) {
            const randomKey = await getRandomCdnMediaKey(
                "commands/casualUnion/",
                msg.guild.id,
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                }
            );
            
            const cdnMediaUrl = `${CDN_PREFIX}/${randomKey}`;

            await msg.reply({
                files: [cdnMediaUrl]
            });
        },
    },
};


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


/**
 * Schedules and sends a daily reset message for the Blue Archive game.
 * The message includes a checklist of daily assignments for players.
 * 
 * The reset message is sent to a channel named "blue-archive" in each guild.
 * 
 * If the channel is not found, a log message is printed.
 * 
 * The message is sent as an embedded message with a title, description, fields, and an image.
 * The image is randomly selected from a set of CDN media keys.
 * 
 * If an error occurs while sending the message, it is logged using the logError function.
 * 
 * The reset time is set to 7:00 PM UTC.
 */
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

                const imageUrl = await getRandomCdnMediaKey(
                    "dailies/blue-archive/",
                    guild.id,
                    {
                        maxSizeMB: 100,
                        extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                        trackLast: 10
                    }
                );
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

/**
 * Schedules and sends a daily reset message for the Girls' Frontline 2 game.
 * The message includes a checklist of daily quests for players to complete.
 * 
 * The reset message is sent to a channel named "girls-frontline-2" in each guild.
 * If the channel is not found, a log message is printed.
 * 
 * The message is sent as an embedded message with a title, description, fields, and an image.
 * The image is randomly selected from a set of CDN media keys.
 * 
 * If an error occurs while sending the message, it is logged using the logError function.
 * 
 * The reset time is set to 9:00 AM UTC.
 */
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

                const imageUrl = await getRandomCdnMediaKey(
                    "dailies/girls-frontline-2/",
                    guild.id,
                    {
                        maxSizeMB: 100,
                        extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                        trackLast: 10
                    }
                );
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

/**
 * Schedules and sends a daily reset message for the Nikke game.
 * The message includes a checklist of daily missions for players to complete.
 * 
 * The reset message is sent to a channel named "nikke" in each guild.
 * If the channel is not found, a log message is printed.
 * 
 * The message is sent as an embedded message with a title, description, fields, and an image.
 * The image is randomly selected from a set of CDN media keys.
 * 
 * If an error occurs while sending the message, it is logged using the logError function.
 * 
 * The reset time is set to 8:00 PM UTC.
 * 
 * The message also includes a reaction collector for the "🤢", "🤮", "🤒", and "😷" emojis.
 * If a reaction is collected, a random quiet Rapi phrase is sent to the channel.
 * 
 * The message also includes a message collector for the "good girl" keyword.
 * If the keyword is detected, the user is thanked and a "sefhistare:1124869893880283306" emoji is reacted to the message.
 */
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
                    
                const imageUrl = await getRandomCdnMediaKey(
                    "dailies/nikke/",
                    guild.id,
                    {
                        maxSizeMB: 100,
                        extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                        trackLast: 10
                    }
                );
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

// Track recently sent media keys per guild and prefix
const recentlySentMediaKeys: Map<string, Map<string, string[]>> = new Map();

/**
 * Retrieves and filters media keys from the CDN based on specified criteria, with guild-based tracking 
 * to prevent recent repeats within each server.
 * 
 * @param prefix - The bucket prefix path (e.g., "commands/leadership/")
 * @param guildId - Discord guild ID for tracking media keys per server
 * @param options - Optional configuration object
 * @param options.maxSizeMB - Maximum file size in MB (default: 100)
 * @param options.extensions - Array of allowed file extensions (default: ['.mp4'])
 * @param options.trackLast - Number of keys to track for preventing repeats (default: 5)
 * @returns Promise<string> A random media key from the filtered results
 * 
 * @throws {Error} When prefix or guildId is missing/invalid
 * @throws {Error} When no valid media files are found
 * @throws {Error} When S3 operations fail
 * 
 * @example
 * // Basic usage with default options
 * const key = await getRandomCdnMediaKey("commands/leadership/", "123456789");
 * 
 * // With custom options
 * const key = await getRandomCdnMediaKey("commands/videos/", "123456789", {
 *   maxSizeMB: 50,
 *   extensions: ['.mp4', '.gif'],
 *   trackLast: 3
 * });
 */
async function getRandomCdnMediaKey(
    prefix: string,
    guildId: string,
    options: {
        maxSizeMB?: number;
        extensions?: string[];
        trackLast?: number;
    } = {}
): Promise<string> {
    // Validate required parameters
    if (!prefix || typeof prefix !== 'string') {
        console.error('Invalid prefix provided:', prefix);
        throw new Error('Valid prefix path is required');
    }

    if (!guildId || typeof guildId !== 'string') {
        console.error('Invalid guildId provided:', guildId);
        throw new Error('Valid guild ID is required');
    }

    const maxSizeMB = options.maxSizeMB ?? 100;
    const extensions = options.extensions ?? [...DEFAULT_IMAGE_EXTENSIONS, ...DEFAULT_VIDEO_EXTENSIONS];
    const trackLast = options.trackLast ?? 5;

    try {
        console.log(`Fetching media keys for prefix: ${prefix} in guild: ${guildId}`);

        // List objects in the specified folder
        const response = await s3Client.send(new ListObjectsV2Command({
            Bucket: S3BUCKET,
            Prefix: prefix,
        }));

        if (!response.Contents || response.Contents.length === 0) {
            console.error(`No media files found in CDN under prefix: ${prefix}`);
            throw new Error('No media files available');
        }

        // Filter media files based on size and extension
        const mediaKeys = response.Contents
            .filter(obj => {
                const sizeInMB = (obj.Size || 0) / (1024 * 1024);
                return sizeInMB <= maxSizeMB;
            })
            .map(obj => obj.Key)
            .filter(key => key && extensions.some(ext => key.toLowerCase().endsWith(ext)));

        if (mediaKeys.length === 0) {
            console.error(`No valid media files found under ${maxSizeMB}MB with extensions: ${extensions.join(', ')}`);
            throw new Error('No suitable media files available');
        }

        // Initialize guild tracking if not exists
        if (!recentlySentMediaKeys.has(guildId)) {
            console.log(`Initializing tracking for new guild: ${guildId}`);
            recentlySentMediaKeys.set(guildId, new Map());
        }

        // Initialize prefix tracking for this guild if not exists
        const guildTracking = recentlySentMediaKeys.get(guildId)!;
        if (!guildTracking.has(prefix)) {
            console.log(`Initializing tracking for prefix: ${prefix} in guild: ${guildId}`);
            guildTracking.set(prefix, []);
        }

        const recentKeys = guildTracking.get(prefix)!;
        console.log(`Currently tracking ${recentKeys.length} keys for ${prefix} in guild: ${guildId}`);

        // Filter out recently sent keys
        const availableKeys = mediaKeys.filter(key => key && !recentKeys.includes(key));

        // If all keys have been recently used, reset tracking and use all keys
        if (availableKeys.length === 0) {
            console.log(`All media keys for ${prefix} have been recently used in guild: ${guildId}. Resetting tracking.`);
            guildTracking.set(prefix, []);
            const randomKey = mediaKeys[Math.floor(Math.random() * mediaKeys.length)]!;
            guildTracking.get(prefix)!.push(randomKey);
            return randomKey;
        }

        // Select a random key from available ones
        const randomKey = availableKeys[Math.floor(Math.random() * availableKeys.length)]!;
        
        // Add to tracking
        recentKeys.push(randomKey);
        
        // Keep only the last trackLast number of keys
        if (recentKeys.length > trackLast) {
            recentKeys.shift();
        }

        console.log(`Selected random key: ${randomKey} for guild: ${guildId}`);
        return randomKey;

    } catch (error) {
        console.error(`Error retrieving CDN media keys for guild ${guildId}:`, error);
        throw error instanceof Error ? error : new Error('Error retrieving CDN media keys');
    }
}
