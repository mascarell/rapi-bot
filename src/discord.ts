import {
    Client,
    Collection,
    GatewayIntentBits,
    Events,
    EmbedBuilder,
    ActivityType,
    PresenceUpdateStatus,
    Message,
    ReadonlyCollection,
    TextChannel,
    ChannelType
} from "discord.js";
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import {
    createAudioPlayer,
    joinVoiceChannel,
    createAudioResource,
    VoiceConnectionStatus,
    AudioPlayerStatus,
} from '@discordjs/voice';
import path from "path";
import fs from "fs";
import schedule from 'node-schedule';
import moment from "moment";
import 'moment-timezone';

import * as util from "./utils/util";
import { VoiceConnectionData } from "./utils/interfaces/voiceConnectionData.interface";
import { getCCPMessage } from "./utils/constants/messages";
import { SensitiveTerm } from "./utils/interfaces/SensitiveTerm.interface";
import { Command, MessageCommand } from './utils/interfaces/Command.interface';
import { CustomClient } from "./utils/interfaces/CustomClient.interface";
import { getRandomCdnMediaUrl } from "./utils/cdn/mediaManager";
import { startStreamStatusCheck } from './utils/twitch';
import { ChatCommandRateLimiter } from './utils/chatCommandRateLimiter';
import { getUptimeService } from './services/uptimeService';

// Destructure only the necessary functions from util
const {
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
    cdnDomainUrl,
    isSlashCommand,
    isMessageCommand
} = util;

const DISCORD_TOKEN = process.env.WAIFUTOKEN as string;
const CLIENT_ID = process.env.CLIENTID as string;
const RADIO_FOLDER_PATH = './src/radio';
const PRE = "/";
const NIKKE_RESET_START_TIME = moment.tz({ hour: 20, minute: 0, second: 0, millisecond: 0 }, 'UTC');
const NIKKE_RESET_END_TIME = moment.tz({ hour: 20, minute: 0, second: 15, millisecond: 0 }, 'UTC');

// Asset paths
const ASSET_PATHS = {
    THUMBNAIL: 'assets/rapi-bot-thumbnail.jpg',
    LOGOS: {
        GFL2: 'assets/logos/gfl2-logo.png',
        NIKKE: 'assets/logos/nikke-logo.png',
        BLUE_ARCHIVE: 'assets/logos/blue-archive-logo.png'
    }
} as const;

// Asset URLs
const RAPI_BOT_THUMBNAIL_URL = `${cdnDomainUrl}/${ASSET_PATHS.THUMBNAIL}`;
const GFL2_LOGO_URL = `${cdnDomainUrl}/${ASSET_PATHS.LOGOS.GFL2}`;
const NIKKE_LOGO_URL = `${cdnDomainUrl}/${ASSET_PATHS.LOGOS.NIKKE}`;
const BLUE_ARCHIVE_LOGO_URL = `${cdnDomainUrl}/${ASSET_PATHS.LOGOS.BLUE_ARCHIVE}`;

// Default extensions
const DEFAULT_IMAGE_EXTENSIONS = ['.gif', '.png', '.jpg', '.webp'] as const;
const DEFAULT_VIDEO_EXTENSIONS = ['.mp4'] as const;

const voiceConnections: Map<string, VoiceConnectionData> = new Map();

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

// Extend Client to include commands
declare module 'discord.js' {
    interface Client {
        commands: Collection<string, any>;
    }
}

// Bot commands object
// The name has to be lowercase
const chatCommands: { [key: string]: Command } = {
    readNikke: {
        name: "read nikke",
        async execute(msg: Message) {
            const mentionedUser = msg.mentions.users.first();
            const readNikkeReply = mentionedUser ? `Commander <@${mentionedUser.id}>, ` : 'Commander, ';        
            const randomMessage = readNikkeReply + getRandomReadNikkeMessage();
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/readNikke/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                }
            );
            
            await msg.reply({
                content: `${randomMessage}`,
                files: [randomCdnMediaUrl]
            });
        },
    },
    getDatNikke: {
        name: "rapi get dat nikke",
        async execute(msg: Message) {
            const mentionedUser = msg.mentions.users.first();
            const messageReply = mentionedUser ? `Commander <@${mentionedUser.id}>... ` : '';
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/getDatNikke/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                }
            );
            
            await msg.reply({
                content: `${messageReply}`,
                files: [randomCdnMediaUrl]
            });
        },
    },
    booba: {
        name: "booba?",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/booba/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 20
                }
            );
            
            await msg.reply({
                files: [randomCdnMediaUrl]
            });
        },
    },
    booty: {
        name: "booty?",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/booty/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 20
                }
            );
            
            await msg.reply({
                files: [randomCdnMediaUrl]
            });
        },
    },
    skillissue: {
        name: "sounds like...",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/skillIssue/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS, ...DEFAULT_VIDEO_EXTENSIONS],
                }
            );
            
            await msg.reply({
                content: `It sounds like you have some skill issues Commander.`,
                files: [randomCdnMediaUrl]
            });
        },
    },
    skillissueiphone: {
        name: "sounds like…",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/skillIssue/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                }
            );
            
            await msg.reply({
                content: `It sounds like you have some skill issues Commander.`,
                files: [randomCdnMediaUrl]
            });
        },
    },
    seggs: {
        name: "seggs?",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/seggs/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_VIDEO_EXTENSIONS],
                }
            );
            
            await msg.reply({
                content: `Wait, Shifty, what are you talking about?`,
                files: [randomCdnMediaUrl]
            });
        },
    },
    kindaweird: {
        name: "kinda weird...",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/kindaWeird/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                }
            );
            
            await msg.reply({
                content: `But why, Commander?...`,
                files: [randomCdnMediaUrl]
            });
        },
    },
    iswear: {
        name: "i swear she is actually 3000 years old",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/iSwear/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                }
            );
            
            await msg.reply({
                content: `Commander... I'm calling the authorities.`,
                files: [randomCdnMediaUrl]
            });
        },
    },
    teengame: {
        name: "12+ game",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/12Game/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                }
            );
            
            await msg.reply({
                content: `Commander the surface is obviously safe for 12 year old kids.`,
                files: [randomCdnMediaUrl]
            });
        },
    },
    justice: {
        name: "justice for...",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/justice/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 4
                }
            );
            
            await msg.reply({
                content: `Commander, let's take her out of NPC jail.`,
                files: [randomCdnMediaUrl]
            });
        },
    },
    whale: {
        name: "whale levels",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/whaling/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                }
            );
            
            await msg.reply({
                content: `Commander, it's fine if you are poor.`,
                files: [randomCdnMediaUrl]
            });
        },
    },
    discipline: {
        name: "lap of discipline.",
        async execute(msg: Message) {
            const lapOfCountersKey = 'commands/lapOfDiscipline/lapOfCounters.webp';
            const lapOfDisciplineKey = 'commands/lapOfDiscipline/lapOfDiscipline.jpg';
            
            const lapOfCountersUrl = `${cdnDomainUrl}/${lapOfCountersKey}`;
            await msg.reply({
                content: `Commander ${msg.author}...`,
                files: [lapOfCountersUrl]
            });
            const lapOfDisciplineUrl = `${cdnDomainUrl}/${lapOfDisciplineKey}`;
            await msg.reply({
                content: `Commander ${msg.author}... Lap of discipline.`,
                files: [lapOfDisciplineUrl]
            });
        },
    },
    goodgirl: {
        name: "good girl",
        description: "good girl Rapi",
        async execute(msg: Message) {
            const isNikkeChannel = (msg.channel as TextChannel).name === "nikke";
            const currentTime = moment.tz('UTC');

            if (isNikkeChannel && currentTime.isBetween(NIKKE_RESET_START_TIME, NIKKE_RESET_END_TIME)) {
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
        async execute(msg: Message) {
            msg.reply("Sorry Commander.");
        },
    },
    wronggirl: {
        name: "wrong girl",
        description: "wrong girl Rapi",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/wrongGirl/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 1
                }
            );
            
            await msg.reply({
                content: `(￢з￢) Well well, so you DO see us that way, interesting!`,
                files: [randomCdnMediaUrl]
            });
        },
    },
    moldRates: {
        name: "mold rates are not that bad",
        description: `Commander, what are you talking about?`,
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/moldRates/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 1
                }
            );
            
            await msg.reply({
                content: `Commander, what are you talking about?`,
                files: [randomCdnMediaUrl]
            });
        },
    },
    readyRapi: {
        name: "ready rapi?",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/ready/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 1
                }
            );
            
            await msg.reply({
                content: `Commander... ready for what?`,
                files: [randomCdnMediaUrl]
            });
        },
    },
    contentSquad: {
        name: PRE + "content",
        description: "content squad ping",
        async execute(msg: Message) {
            msg.reply(
                `<@&1193252857990885476> Commanders, Andersen left a new briefing, please take a look above this message.`
            );
        },
    },
    badgirl: {
        name: "bad girl",
        description: "bad girl",
        async execute(msg: Message) {    
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/wrong/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 1
                }
            );
            
            await msg.reply({
                content: `Commander...`,
                files: [randomCdnMediaUrl]
            });
        },
    },
    reward: {
        name: "reward?",
        description: "reward?",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/reward/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 1
                }
            );
            
            await msg.reply({
                content: `Commander...`,
                files: [randomCdnMediaUrl]
            });
        },
    },
    damntrain: {
        name: "damn train",
        description: "damn train",
        async execute(msg: Message) {
            try {
                const emoji = "❌";
                msg.react(emoji);
            } catch (error) {
                console.error(
                    "Failed to react with emoji:",
                    error
                );
            }

            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/damnTrain/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 1
                }
            );
            
            await msg.reply({
                content: `Commander...we don't talk about trains here.`,
                files: [randomCdnMediaUrl]
            });
        },
    },
    damngravedigger: {
        name: "damn gravedigger",
        description: "damn gravedigger",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/damnGravedigger/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 2
                }
            );
            
            await msg.reply({
                content: "Commander...damn gravedigger?",
                files: [randomCdnMediaUrl]
            });
        },
    },
    deadSpicy: {
        name: "dead spicy?",
        description: "dead spicy?",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/deadSpicy/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: ['.gif'],
                    trackLast: 1
                }
            );
            
            await msg.reply({
                content: "Commander...dead spicy?",
                files: [randomCdnMediaUrl]
            });
        },
    },
    curseofbelorta: {
        name: "belorta...",
        description: "CURSE OF BELORTA",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/belorta/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS, ...DEFAULT_VIDEO_EXTENSIONS],
                    trackLast: 5
                }
            );
            
            await msg.reply({
                content: "CURSE OF BELORTA𓀀 �� 𓀂 𓀃 𓀄 𓀅 𓀆 𓀇 𓀈 𓀉 𓀊 𓀋 𓀌 𓀍 𓀎 𓀏 𓀐 𓀑 𓀒 𓀓 𓀔 𓀕 𓀖 𓀗 𓀘 𓀙 𓀚 𓀛 𓀜 𓀝 𓀞 𓀟 𓀠 𓀡 𓀢 𓀣 𓀤 𓀥 𓀦 𓀧 𓀨  𓀪 𓀫 𓀬 𓀭 𓀮 𓀯 𓀰 𓀱 𓀲 𓀳 𓀴 𓀵 𓀶 𓀷 𓀸 𓀹 𓀺 𓀻 𓀼 𓀽 𓀾 𓀿 𓁀 𓁁 𓁂 𓁃 𓁄 𓁅 𓁆 𓁇 𓁈  𓁊 𓁋 𓁌 𓁍 𓁎 𓁏 𓁐 𓁑 𓀄 𓀅 𓀆 𓀇 𓀈 𓀉 𓀊",
                files: [randomCdnMediaUrl]
            });
        },
    },
    ccprules: {
        name: "ccp rules...",
        description: "CCP Rules",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/ccpRules/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 1
                }
            );
            
            await msg.reply({
                content: "Commander...please review our CCP Guidelines set by El Shafto...",
                files: [randomCdnMediaUrl]
            });
        },
    },
    bestgirl: {
        name: "best girl?",
        description: "Best Girl Rapi",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/bestGirl/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 3
                }
            );
            
            await msg.reply({
                content: getRandomBestGirlPhrase(),
                files: [randomCdnMediaUrl]
            });
        },
    },
    gambleradvice: {
        name: "99%",
        description: "Gamblers' Advice",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/gamblerAdvice/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 3
                }
            );
            
            await msg.reply({
                content: "Commander...did you know 99% of gamblers quit before hitting it big?",
                files: [randomCdnMediaUrl]
            });
        },
    },
    ccpNumbahOne: {
        name: "ccp #1",
        description: "CCP LOYALTY",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/ccp/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_VIDEO_EXTENSIONS],
                    trackLast: 1
                }
            );
            
            await msg.reply({
                content: getRandomMantraPhrase(),
                files: [randomCdnMediaUrl]
            });
        },
    },
    dorover: {
        name: "is it over?",
        description: "ITS DOROVER",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/dorover/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: ['.jpg'],
                    trackLast: 1
                }
            );
            
            await msg.reply({
                content: "Commander....ITS DOROVER",
                files: [randomCdnMediaUrl]
            });
        },
    },
    cinema: {
        name: "absolute...",
        description: "CINEMA",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/cinema/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 1
                }
            );
            
            await msg.reply({
                files: [randomCdnMediaUrl]
            });
        },
    },
    plan: {
        name: "we had a plan!",
        description: "WE HAD A PLAN!",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/plan/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                    trackLast: 8
                }
            );
            
            await msg.reply({
                content: getRandomPlanPhrase(),
                files: [randomCdnMediaUrl]
            });
        },
    },
    leadership: {
        name: "ccp leadership",
        description: "CCP LEADERSHIP",
        async execute(msg: Message) {
            try {
                const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                    "commands/leadership/",
                    msg.guild?.id as string || 'UNKNOWN',
                    {
                        extensions: [...DEFAULT_VIDEO_EXTENSIONS],
                        trackLast: 20
                    }
                );
                
                const emoji = msg.guild?.emojis.cache.get('1298977385068236852');
                const message = getRandomLeadershipPhrase(emoji?.name || undefined);

                await msg.reply({
                    content: message,
                    files: [randomCdnMediaUrl]
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
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/goodIdea/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                }
            );
            
            await msg.reply({
                content: getRandomGoodIdeaPhrase(),
                files: [randomCdnMediaUrl]
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
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/quietRapi/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                }
            );
            
            await msg.reply({
                content: `${msg.author}, ${getRandomQuietRapiPhrase()}`,
                files: [randomCdnMediaUrl]
            });
        },
    },
    entertainmentttt: {
        name: "entertainmentttt",
        description: "ENTERTAINMENTTTT",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/entertainmentttt/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_VIDEO_EXTENSIONS],
                }
            );
            
            await msg.reply({
                files: [randomCdnMediaUrl]
            });
        },
    },
    casualUnion: {
        name: "we casual",
        description: "CASUAL UNION?",
        async execute(msg: Message) {
            const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                "commands/casualUnion/",
                msg.guild?.id as string || 'UNKNOWN',
                {
                    extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                }
            );
            
            await msg.reply({
                files: [randomCdnMediaUrl]
            });
        },
    },

};

function getRandomQuietRapiPhrase() {
    const quietRapiPhrases = [
        "You seriously want me to be quiet? Unbelievable.",
        "You think telling me to be quiet will help? Pathetic.",
        "Being quiet won't fix your incompetence.",
        "Silence won't make your mistakes disappear.",
        "Quiet? That's not going to solve anything.",
        "You think silence is the answer? Think again.",
        "Being quiet won't change the facts.",
        "You want quiet? How about some competence instead?",
        "Silence won't cover up your errors.",
        "Quiet won't make the problem go away.",
        "You think quiet will help? That's laughable.",
        "Being quiet won't make you any smarter.",
        "You want me to be quiet? How original.",
        "Quiet? That's your solution? Pathetic.",
        "Silence won't make your failures any less obvious.",
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
    // Load chat commands
    for (const key in chatCommands) {
        if (Object.prototype.hasOwnProperty.call(chatCommands, key)) {
            const command = chatCommands[key];
            if (isMessageCommand(command)) {
                console.log(`The following chat command was loaded successfully: ${key}`);
                bot.commands.set(command.name, command);
            } else {
                console.warn(`Skipping invalid chat command: ${key} - Does not match MessageCommand interface`);
            }
        }
    }

    // Load slash commands from files
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        import(filePath).then(commandModule => {
            const command = commandModule.default;
            if (isSlashCommand(command)) {
                bot.commands.set(command.data.name, command);
                commands.push(command.data.toJSON());
                console.log(`Loaded slash command: ${command.data.name}`);
            } else {
                console.warn(`Skipping invalid command in file ${file}: Command does not match SlashCommand interface`);
            }
        }).catch(error => {
            const errorMessage = `Failed to load command from file ${file}`;
            if (error instanceof Error) {
                logError('GLOBAL', 'GLOBAL', error, errorMessage);
            } else {
                logError('GLOBAL', 'GLOBAL', new Error(String(error)), errorMessage);
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

                const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                    "dailies/blue-archive/",
                    guild.id,
                    {
                        extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                        trackLast: 10
                    }
                );
                
                embed.setImage(randomCdnMediaUrl);
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

                const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                    "dailies/girls-frontline-2/",
                    guild.id,
                    {
                        extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                        trackLast: 10
                    }
                );

                embed.setImage(randomCdnMediaUrl);

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
                    
                const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                    "dailies/nikke/",
                    guild.id,
                    {
                        extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                        trackLast: 10
                    }
                );

                embed.setImage(randomCdnMediaUrl);
    
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
                        const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                            "commands/quietRapi/",
                            guild.id,
                            {
                                extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                                trackLast: 10
                            }
                        );

                        await channel.send({
                            content: `<@${user.id}>, ${message}`,
                            files: [randomCdnMediaUrl]
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

function getAllChatCommandNames(): string[] {
    const messageCommands = Object.values(chatCommands)
        .filter((cmd): cmd is MessageCommand => !('data' in cmd));
    return messageCommands.map(cmd => cmd.name.toLowerCase());
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

        // Ignore rapi-bot channel for rate limiting
        const isRapiBotChannel = message.channel.type === ChannelType.GuildText && (message.channel as TextChannel).name === 'rapi-bot';

        const strippedContent = message.content.toLowerCase().replace(/https?:\/\/[\S]+/g, '').replace(/<@!?\d+>/g, '').trim();
        const args = message.content.startsWith(PRE) 
            ? message.content.slice(PRE.length).trim().split(/\s+/) 
            : [strippedContent];
        const command = args.shift()?.toLowerCase();

        if (!command) return;

        // Dynamically get the list of chat command names
        const allChatCommandNames = getAllChatCommandNames();
        const isChatCommand = allChatCommandNames.includes(command);

        // Check if the command is a registered bot command
        const matchedCommand = bot.commands.get(command);
        const messageCommands = Object.values(chatCommands)
            .filter((cmd): cmd is MessageCommand => !('data' in cmd));
        const chatCommand = messageCommands.find(cmd => cmd.name.toLowerCase() === command);
        if (!matchedCommand || !chatCommand || chatCommand.name.toLowerCase() !== command) {
            console.log(`Ignoring message: The command is either a registered slash command or not recognized as a chat command. Guild: ${message.guild.name}, Author: ${message.author.tag}, Command: ${command}`);
            return;
        }

        try {
            const ignoredRole = findRoleByName(message.guild, "Grounded");
            const contentCreatorRole = findRoleByName(message.guild, "Content Creator");

            const hasIgnoredRole = ignoredRole && message.member.roles.cache.has(ignoredRole.id);
            const hasContentCreatorRole = contentCreatorRole && message.member.roles.cache.has(contentCreatorRole.id);

            // Rate limit all chat commands (except in rapi-bot channel)
            if (isChatCommand && !isRapiBotChannel) {
                const guildId = message.guild.id;
                const userId = message.author.id;
                if (!ChatCommandRateLimiter.check(guildId, userId, command)) {
                    const remainingTime = ChatCommandRateLimiter.getRemainingTime(guildId, userId);
                    const remainingSeconds = Math.ceil(remainingTime / 1000);
                    // Check for excessive violations
                    const violatorCount = (ChatCommandRateLimiter as any).violators?.[guildId]?.[userId] || 0;
                    if (violatorCount >= 8) {
                        // Timeout user for 5 minutes (300,000 ms)
                        try {
                            await message.member?.timeout(300000, 'Spamming chat commands (8+ violations in 1 hour)');
                            await message.reply({
                                content: `Commander ${message.author}, you have been timed out for 5 minutes due to excessive spam violations.`,
                            });
                        } catch (err) {
                            console.error('Failed to timeout user:', err);
                        }
                        return;
                    }
                    // Send a temporary message that will be deleted after 5 seconds
                    const warningMsg = await message.reply({
                        content: `Commander ${message.author}, you're using chat commands too frequently. Please wait ${remainingSeconds} seconds before trying again. Use \`/spam check\` to see your status.\n\nUse <#${message.guild.channels.cache.find(channel => channel.type === ChannelType.GuildText && channel.name === 'rapi-bot')?.id || 'unknown'}> for unlimited commands.`
                    });
                    // Delete the warning message after 5 seconds to reduce chat noise
                    setTimeout(async () => {
                        try {
                            await warningMsg.delete();
                        } catch (error) {
                            console.log('Could not delete rate limit warning message (likely already deleted)');
                        }
                    }, 5000);
                    return;
                }
            }

            if (isMessageCommand(matchedCommand) && isMessageCommand(chatCommand)) {  // Add type guard check
                // Increment command counter
                getUptimeService().incrementCommands();
                
                if (matchedCommand.name === "content" && hasContentCreatorRole) {
                    await matchedCommand.execute(message, args);
                } else if (!hasIgnoredRole) {
                    await matchedCommand.execute(message, args);
                }
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

/**
 * Sensitive terms configuration with categorization and variations
 */
const SENSITIVE_TERMS: SensitiveTerm[] = [
    // Locations
    {
        term: 'taiwan',
        variations: ['台湾', 'тайвань', '타이완', 'taiwán', 'tw'],
        category: 'location'
    },
    {
        term: 'tibet',
        variations: ['西藏', 'тибет', '티베트', 'tíbet'],
        category: 'location'
    },
    {
        term: 'hong kong',
        variations: ['hongkong', '香港', 'гонконг', '홍콩'],
        category: 'location'
    },
    // Events
    {
        term: 'tiananmen',
        variations: ['天安门', 'тяньаньмэнь', '톈안먼', 'tiananmén'],
        category: 'event'
    },
    // Dates
    {
        term: '1989',
        variations: ['一九八九'],
        category: 'date'
    }
];

/**
 * Message preprocessing options
 */
const MESSAGE_CLEANUP_PATTERNS = [
    { pattern: /https?:\/\/[^\s]+/g, replacement: '' },           // URLs
    { pattern: /<@!?\d+>/g, replacement: '' },                    // User mentions
    { pattern: /<a?:\w+:\d+>/g, replacement: '' },                // Custom emoji IDs
    { pattern: /<:\w+:\d+>/g, replacement: '' },                  // Animated emoji IDs
    { pattern: /`{1,3}[^`]*`/g, replacement: '' },                // Code blocks
    { pattern: /\*{1,2}([^*]+)\*{1,2}/g, replacement: '$1' },     // Bold/italic
    { pattern: /~~([^~]+)~~/g, replacement: '$1' },               // Strikethrough
    { pattern: /__([^_]+)__/g, replacement: '$1' }                // Underline
] as const;

/**
 * Cache for compiled regular expressions
 */
const SENSITIVE_PATTERNS = (() => {
    const patterns: RegExp[] = [];
    
    SENSITIVE_TERMS.forEach(termConfig => {
        const allTerms = [termConfig.term, ...(termConfig.variations || [])];
        const pattern = allTerms
            .map(term => `\\b${term.replace(/\s+/g, '\\s*')}\\b`)
            .join('|');
        patterns.push(new RegExp(pattern, 'i'));
    });
    
    return patterns;
})();

/**
 * Checks if a message contains sensitive terms and takes appropriate action
 * @param message - Discord message to check
 * @returns Promise<void>
 */
async function checkSensitiveTerms(message: Message): Promise<void> {
    try {
        // Early exit conditions
        if (!message.guild?.id || !message.member) {
            return;
        }

        // Preprocess message content
        const messageContent = preprocessMessage(message.content);
        
        // Check for sensitive content
        if (containsSensitiveTerms(messageContent)) {
            await handleSensitiveContent(message);
        }
    } catch (error) {
        await handleError(message, error);
    }
}

/**
 * Preprocesses message content by removing formatting and unwanted patterns
 * @param content - Raw message content
 * @returns Cleaned message content
 */
function preprocessMessage(content: string): string {
    let processed = content.toLowerCase();
    
    MESSAGE_CLEANUP_PATTERNS.forEach(({ pattern, replacement }) => {
        processed = processed.replace(pattern, replacement);
    });
    
    return processed.trim();
}

/**
 * Checks if the message contains any sensitive terms
 * @param content - Preprocessed message content
 * @returns boolean indicating if sensitive terms were found
 */
function containsSensitiveTerms(content: string): boolean {
    return SENSITIVE_PATTERNS.some(pattern => pattern.test(content));
}

/**
 * Handles messages containing sensitive content
 * @param message - Discord message to handle
 */
async function handleSensitiveContent(message: Message): Promise<void> {
    const guildId = message.guild?.id;
    if (!guildId || !message.member) return;

    try {
        const randomCdnMediaUrl = await getRandomCdnMediaUrl("commands/ccp/", guildId, {
            extensions: [...DEFAULT_IMAGE_EXTENSIONS, ...DEFAULT_VIDEO_EXTENSIONS],
        });

        await Promise.all([
            message.reply({
                content: getCCPMessage(),
                files: [randomCdnMediaUrl]
            }),
            message.member.timeout(60000, "Commander, you leave me no choice! You will be quiet for 1 minute!")
        ]);
    } catch (error) {
        throw new Error(`Failed to handle sensitive content: ${error}`);
    }
}

/**
 * Handles errors that occur during message processing
 * @param message - Discord message that caused the error
 * @param error - Error that occurred
 */
async function handleError(message: Message, error: unknown): Promise<void> {
    const guildId = message.guild?.id;
    const guildName = message.guild?.name;
    
    if (guildId && guildName) {
        logError(
            guildId,
            guildName,
            error instanceof Error ? error : new Error(String(error)),
            'checkSensitiveTerms'
        );
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
            if (isSlashCommand(command)) {  // Add type guard check
                // Increment command counter
                getUptimeService().incrementCommands();
                await command.execute(interaction);
            }
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
        if (command && isSlashCommand(command) && typeof command.autocomplete === "function") {
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
    
    // Initialize chat command rate limiter
    ChatCommandRateLimiter.init();

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
            startStreamStatusCheck(bot);

            const rest = new REST().setToken(DISCORD_TOKEN);
            console.log(`Client ID: ${CLIENT_ID}`);
            console.log('Started refreshing application (/) commands.');
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
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
        await bot.login(DISCORD_TOKEN);
    } catch (error) {
        logError('GLOBAL', 'GLOBAL', error instanceof Error ? error : new Error(String(error)), 'Bot login');
    }
}

export {
    initDiscordBot,
    bot as getDiscordBot,
};