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
    getBossFileName,
    handleTimeout,
    getRandomImageUrl,
} from "./utils/util";
import { VoiceConnectionData } from "./utils/interfaces/voiceConnectionData.interface";
import { ccpMessage } from "./utils/constants/messages";

const TOKEN = process.env.WAIFUTOKEN as string;
const CLIENTID = process.env.CLIENTID as string;
const RADIO_FOLDER_PATH = './src/radio';
const PRE = "/";
const resetStartTime = moment.tz({ hour: 20, minute: 0, second: 0, millisecond: 0 }, 'UTC');
const resetEndTime = moment.tz({ hour: 20, minute: 0, second: 15, millisecond: 0 }, 'UTC');

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
            const emoji = msg.guild.emojis.cache.get('1298977385068236852');
            const message = getRandomLeadershipPhrase(emoji);
            await sendRandomImageWithContent(msg, "./src/public/images/commands/leadership/", message);
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
    ];
    const phrase = leadershipPhrases[Math.floor(Math.random() * leadershipPhrases.length)];
    return `${phrase}${emoji ? ` ${emoji}` : ''}`;
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
        // {
        //     name: "UNION RAID",
        //     type: ActivityType.Competing,
        //     status: PresenceUpdateStatus.DoNotDisturb,
        // },
        {
            name: "SOLO RAID",
            type: ActivityType.Competing,
            status: PresenceUpdateStatus.DoNotDisturb,
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
            name: "Dragon Ball: Sparking! Zero",
            type: ActivityType.Competing,
            status: PresenceUpdateStatus.DoNotDisturb,
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
    schedule.scheduleJob('0 */4 * * *', async () => {
        const guilds = bot.guilds.cache.values();
        for (const guild of guilds) {
            const channel = findChannelByName(guild, "nikke");
            if (!channel) {
                console.log(`Could not find suitable 'nikke' text channel in guild ${guild.name}`);
                continue;
            }

            try {
                const message = getRandomRapiMessage();
                await channel.send(message);
            } catch (error) {
                logError(guild.id, guild.name, error instanceof Error ? error : new Error(String(error)), 'Sending random message');
            }
        }
    });

    console.log("Scheduled random message job to run every 4 hours.");
}

const blueArchiveImageUrls = [
    // Aris
    "https://media1.tenor.com/m/J9AcLGClOlIAAAAC/blue-archive-aris.gif",
    // Aru
    "https://media1.tenor.com/m/LgTRLvOmp9oAAAAd/blue-archive-aru.gif",
    // Hanako
    "https://media1.tenor.com/m/XxPrNv1TYAwAAAAC/blue-archive-hanako.gif",
    // Hikari
    "https://media1.tenor.com/m/8PGtPfLaDTkAAAAC/blue-archive-tachibana-hikari.gif",
    // Iroha
    "https://media1.tenor.com/m/iOCE3qQr8W8AAAAC/blue-archive-168.gif",
    // Kazusa
    "https://media1.tenor.com/m/LWeuVHW7dlkAAAAd/kazusa-blue-archive.gif",
    "https://media1.tenor.com/m/AKLkyYWAB5cAAAAC/kazusa-blue-archive.gif",
    // Kokona
    "https://media1.tenor.com/m/6NZBdsNCbEwAAAAd/kokona-blue-archive.gif",
    // Sakurako
    "https://media1.tenor.com/m/XQJVw8Gt8OgAAAAC/blue-archive-utazumi-sakurako.gif",
    // Shiroko
    "https://media1.tenor.com/m/jgEyvtk8GBIAAAAd/blue-archive.gif",
    // Shiromi
    "https://media1.tenor.com/m/mvsnju_xuQwAAAAC/black-anime-girl.gif",
    // Sumire
    "https://media1.tenor.com/m/KCNHiwTd1k4AAAAC/sumire-sumire-poggers.gif",
    // Ushio
    "https://media1.tenor.com/m/qOK0Ua-Z7TkAAAAd/ushio-noa-noa.gif",
    // Yuuka
    "https://media1.tenor.com/m/ATKGYKvM0h4AAAAd/yuuka-blue.gif"

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
                        iconURL: 'https://static.zerochan.net/Rapi.full.3851790.jpg' 
                    })
                    .setThumbnail(`https://static.wikia.nocookie.net/blue-archive/images/b/b8/BA_Logo_1.png`)
                    .setImage(getRandomImageUrl(blueArchiveImageUrls, guild.id))
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
                        iconURL: 'https://static.zerochan.net/Rapi.full.3851790.jpg'
                    });
                await channel.send({ 
                    embeds: [embed],
                });
            } catch (error) {
                logError(guild.id, guild.name, error instanceof Error ? error : new Error(String(error)), 'Sending Blue Archive daily reset message');
            }
        });
    });
}

const gfl2ImageUrls = [
    // Daiyan
    'https://media1.tenor.com/m/qVmTo9bcvdQAAAAC/gfl-2-girls-frontline-2.gif',
    // Dushevnaya
    'https://media1.tenor.com/m/FLZ5MZwbnr8AAAAC/dushevnaya-ksvk.gif',
    // Groza
    'https://media1.tenor.com/m/El8zTuEn1lUAAAAC/girls-frontline-2-groza.gif',
    'https://media1.tenor.com/m/YQBHl_3eCPsAAAAC/gfl-gfl2.gif',
    'https://media1.tenor.com/m/JEgY7dLxRJMAAAAC/girls-frontline-2-groza.gif',
    // Jiangyu
    'https://media1.tenor.com/m/wZvi0KK2XhoAAAAC/girls-frontline-2-gfl.gif',
    // Klukay
    'https://media1.tenor.com/m/w0IRslEmgzcAAAAC/clukay-girls-frontline-2.gif',
    'https://media1.tenor.com/m/J-vSIeoKfHcAAAAC/girls-frontline-2-gfl2.gif',
    // Lenna
    'https://media1.tenor.com/m/4eczmEXJp3EAAAAC/girls-frontline-2-girls-frontline.gif',
    'https://media1.tenor.com/m/aUyh4aUoVVgAAAAd/girls-frontline-2-gfl.gif',
    // Lotta
    'https://media1.tenor.com/m/ckx0NFyCF9MAAAAC/gfl2-girl%27s-frontline-2.gif',
    // Mayling
    'https://media1.tenor.com/m/zLImTf1sMosAAAAd/mayling-gfl.gif',
    // Mechy
    'https://media1.tenor.com/m/1Ms6L41Iy-sAAAAC/girls-frontline-2-gfl2.gif',
    // Mosin Nagant
    'https://media1.tenor.com/m/j9zJ-CfzxtQAAAAC/gfl2-gf2.gif',
    // Nemesis
    'https://media1.tenor.com/m/g4N56L6hXEsAAAAC/girls-frontline-2-gfl2.gif',
    'https://media1.tenor.com/m/Xs7i2hKop6UAAAAC/gfl2-nemesis.gif',
    // Qiongjiu
    'https://media1.tenor.com/m/IXusDCqBEFAAAAAC/girls-frontline-2-gfl2.gif',
    'https://media1.tenor.com/m/AW0niLgozNIAAAAd/qiongjiu-girls-frontline-2.gif',
    'https://media1.tenor.com/m/2THLR25in5kAAAAC/girls-frontline-2-gfl2.gif',
    // Sabrina
    'https://media1.tenor.com/m/MDH5PSWUCMUAAAAC/girls-frontline-girls-frontline-2.gif',
    // Sharkry
    'https://media1.tenor.com/m/YJ7PQddEchYAAAAC/sharkry-wink-wink.gif',
    'https://media1.tenor.com/m/xOPspfvUuMcAAAAC/girls-frontline-2-gfl2.gif',
    'https://media1.tenor.com/m/AMMmDnzEpA8AAAAC/sharkry-bang-bang.gif',
    // Springfield
    'https://media1.tenor.com/m/Au_EtYXaURAAAAAC/springfield-lap-pillow.gif',
    'https://media1.tenor.com/m/XmQRoySfZeoAAAAC/girls-frontline-2-hug.gif',
    // Suomi
    'https://media1.tenor.com/m/HuYCNz9vWw8AAAAC/suomi-girls-frontline-2.gif',
    'https://media1.tenor.com/m/n8zuaYmXIcIAAAAC/gfl2-suomi.gif',
    'https://media1.tenor.com/m/RrkTdmZcWxUAAAAC/gfl2-suomi.gif',
    'https://media1.tenor.com/m/yZgeunzs6VQAAAAC/suomi-girls-frontline-2.gif',
    // Tololo
    'https://media1.tenor.com/m/SvINK5PJKeoAAAAC/ak-alfa-totolo.gif',
    // Ullrid
    'https://media1.tenor.com/m/ValoHGcVpLcAAAAC/girls-frontline-2-gfl2.gif',
    // Vector
    'https://media1.tenor.com/m/f-B8bTSc6mwAAAAC/girls-frontline-2-gfl.gif',
    'https://media1.tenor.com/m/7gvJxpat_5MAAAAC/vector-incendiary-grenade.gif',
    'https://media1.tenor.com/m/QG8VdIyYR6IAAAAC/girls-frontline-2-gfl.gif',
    // Vepley
    'https://media1.tenor.com/m/xPn8r5HfH44AAAAC/vepley-girls-frontline.gif',
];

async function sendGFL2DailyResetMessage() {
    const darkWinterDailyResetTime = moment.tz({ hour: 9, minute: 0 }, "UTC");
    const cronTime = `${darkWinterDailyResetTime.minute()} ${darkWinterDailyResetTime.hour()} * * *`;
    const darkWinterDailyShopReminderTime = moment.tz({ hour: 20, minute: 0 }, "UTC");
    const darkWinterDailyShopReminderCronTime = `${darkWinterDailyShopReminderTime.minute()} ${darkWinterDailyShopReminderTime.hour()} * * *`;

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
                        iconURL: 'https://static.zerochan.net/Rapi.full.3851790.jpg' 
                    })
                    .setThumbnail(`https://iopwiki.com/images/thumb/e/ea/GFL2_Logo_Main.png/300px-GFL2_Logo_Main.png`)
                    .setImage(getRandomImageUrl(gfl2ImageUrls, guild.id))
                    .setTitle(`ATTENTION DARKWINTER COMMANDERS!`)
                    .setDescription(
                        `Server has been reset! Here's some of Today's **Daily Quests** Checklist:\n`
                    )
                    .addFields(
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
                        iconURL: 'https://static.zerochan.net/Rapi.full.3851790.jpg'
                    });
                await channel.send({ 
                    embeds: [embed],
                });
            } catch (error) {
                logError(guild.id, guild.name, error instanceof Error ? error : new Error(String(error)), 'Sending GFL2 daily reset message');
            }
        });
    });

    schedule.scheduleJob(darkWinterDailyShopReminderCronTime, async () => {            
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
                        iconURL: 'https://static.zerochan.net/Rapi.full.3851790.jpg' 
                    })
                    .setThumbnail(`https://iopwiki.com/images/thumb/e/ea/GFL2_Logo_Main.png/300px-GFL2_Logo_Main.png`)
                    .setImage('https://i.imgur.com/4hAq4Jv.png')
                    .setTitle(`ATTENTION DARKWINTER COMMANDERS!`)
                    .setDescription(
                        `Check **Shop** and under **Standard Package Tab** For **Daily Free Gift Pack**`
                    )
                    .setColor(0xE67E22)
                    .setTimestamp()
                    .setFooter({   
                        text: 'Commander, ready for the next mission?',
                        iconURL: 'https://static.zerochan.net/Rapi.full.3851790.jpg'
                    });
                await channel.send({ 
                    embeds: [embed],
                });
            } catch (error) {
                logError(guild.id, guild.name, error instanceof Error ? error : new Error(String(error)), 'Sending GFL2 daily reset message');
            }
        });
    });
}

// Please avoid using Story/Lore Spoiler Images.
const nikkeImageUrls = [
    // Doro CCP March
    'https://media1.tenor.com/m/lES4JPVHMhsAAAAd/doro-dorothy.gif',
    // Doro Dance
    'https://media1.tenor.com/m/u1xuL961rcsAAAAd/doro-vapus-dance.gif',
    // Doro Parachute
    'https://media1.tenor.com/m/SR0cZxcIzE4AAAAd/doro-war.gif',
    // Mustang
    'https://media1.tenor.com/m/5o2yGsRLeGYAAAAd/mustang-nikke.gif',
    // Rapi
    'https://media1.tenor.com/m/2R2wPQlxadIAAAAC/rapi-nikke.gif',
    // Shifty
    'https://media1.tenor.com/m/k2iamu0-uaUAAAAC/shifty-nikke.gif',
    // Summer Anis
    'https://media1.tenor.com/m/Fs64xWyCYOcAAAAd/nikke-anis.gif',
    // Syuen Screaming
    'https://media1.tenor.com/m/0HBUr7WQXa0AAAAd/syuen-nikke.gif',
    // Syuen Jumped
    'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExdDQ2bnAzZG82d3NwM2w2dTN3dnpleWhhbmo4ZzVsdnRzeXp6NmEwMiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/7Al7PAPhXhT6spse6j/giphy.gif',
    // TV Ad
    'https://i.makeagif.com/media/1-12-2023/BRYJ4m.gif',
    
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
                        iconURL: 'https://static.zerochan.net/Rapi.full.3851790.jpg' 
                    })
                    .setThumbnail(`https://cdn2.steamgriddb.com/logo/ec0654ecb4284e98366b7596a15c5e1b.png`)
                    .setImage(getRandomImageUrl(nikkeImageUrls, guild.id))
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
                        iconURL: 'https://static.zerochan.net/Rapi.full.3851790.jpg'
                    });
                    
                await channel.send({
                    embeds: [embed]
                });

                const collector = channel.createMessageCollector({ 
                    filter: (response: Message) => response.content.toLowerCase().includes("good girl") && !response.author.bot,
                    time: 15000 
                });

                let firstResponseHandled = false;

                collector.on('collect', async (m: Message) => {
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

                collector.on('end', (collected: ReadonlyCollection<string, Message<boolean>>) => {
                    console.log(`Collector stopped. Collected ${collected.size} responses for server: ${guild.name}.`);
                });
            } catch (error) {
                if (error instanceof Error) {
                    logError(guild.id, guild.name, error, 'Sending daily interception message');
                } else {
                    logError(guild.id, guild.name, new Error(String(error)), 'Sending daily interception message');
                }
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
        'taiwan', 'tibet', 'hong kong', 'tiananmen', '1989', // English
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
