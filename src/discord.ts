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
            await sendRandomImageWithContent(msg, "./src/public/images/commands/belorta/", "CURSE OF BELORTA𓀀 𓀁 𓀂 𓀃 𓀄 𓀅 𓀆 𓀇 𓀈 𓀉 𓀊 𓀋 𓀌 𓀍 𓀎 𓀏 𓀐 𓀑 𓀒 𓀓 𓀔 𓀕 𓀖 𓀗 𓀘 𓀙 𓀚 𓀛 𓀜 𓀝 𓀞 𓀟 𓀠 𓀡 𓀢 𓀣 𓀤 𓀥 𓀦 𓀧 𓀨  𓀪 𓀫 𓀬 𓀭 𓀮 𓀯 𓀰 𓀱 𓀲 𓀳 𓀴 𓀵 𓀶 𓀷 𓀸 𓀹 𓀺 𓀻 𓀼 𓀽 𓀾 𓀿 𓁀 𓁁 𓁂 𓁃 𓁄 𓁅 𓁆 𓁇 𓁈 𓁉 𓁊 𓁋 𓁌 𓁍 𓁎 𓁏 𓁐 𓁑 𓀄 𓀅 𓀆 𓀇 𓀈 𓀉 𓀊");
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
    }
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
    ];
    return planPhrases[Math.floor(Math.random() * planPhrases.length)];
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
            name: "Dragon Ball: Sparking! Zero",
            type: ActivityType.Competing,
            status: PresenceUpdateStatus.DoNotDisturb,
        },
        // {
        //     name: "UNION RAID",
        //     type: ActivityType.Competing,
        //     status: PresenceUpdateStatus.DoNotDisturb,
        // },
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
            name: "WUTHERING WAVES",
            type: ActivityType.Playing,
            status: PresenceUpdateStatus.Online,
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

async function sendDailyInterceptionMessage() {
    const nikkeDailyResetTime = moment.tz({ hour: 20, minute: 0 }, "UTC");
    const cronTime = `${nikkeDailyResetTime.minute()} ${nikkeDailyResetTime.hour()} * * *`;

    schedule.scheduleJob(cronTime, async () => {
        const currentDayOfYear = moment().dayOfYear();
        const bosses = getBosses();
        const bossName = bosses[currentDayOfYear % bosses.length];
        const fileName = getBossFileName(bossName);
        const towerRotation = getTribeTowerRotation();
        const currentDayOfWeek = new Date().getDay();

        const embed = new EmbedBuilder()
            .setTitle(`Attention commanders, here's today's schedule:`)
            .setDescription(
                `- We have to fight **${bossName}** in Special Interception\n` +
                `- Tribe tower is open for **${towerRotation[currentDayOfWeek % towerRotation.length]}**`
            )
            .setColor(0x00AE86)
            .setTimestamp()
            .setFooter({ text: 'Stay safe on the surface, Commanders!' });

        bot.guilds.cache.forEach(async (guild) => {
            try {
                const channel = findChannelByName(guild, "nikke");
                if (!channel) {
                    console.log(`Channel 'nikke' not found in server: ${guild.name}.`);
                    return;
                }

                const role = findRoleByName(guild, "Nikke");
                if (role) {
                    await channel.send(`${role.toString()}, attention!`);
                }

                await channel.send({
                    files: [{ attachment: `./src/public/images/bosses/${fileName}`, name: fileName }],
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
                            await m.react("❤️");
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

        const messageContent = message.content.toLowerCase();
        const sensitiveTerms = ['taiwan', 'tibet', 'hong kong', 'tiananmen', '1989'];

        if (sensitiveTerms.some(term => messageContent.includes(term))) {
            try {
                await message.reply(ccpMessage);
                await message.member?.timeout(60000, "Commander, you leave me no choice! You will be quiet for 1 minute!");
            } catch (error) {
                logError(message.guild.id, message.guild.name, error instanceof Error ? error : new Error(String(error)), 'Sending CCP message within handleMessages');
            }
            return;
        }

        const strippedContent = messageContent.replace(/<@!?\d+>/g, '').trim();
        const args = message.content.startsWith(PRE) 
            ? message.content.slice(PRE.length).trim().split(/\s+/) 
            : [strippedContent];
        const command = args.shift()?.toLowerCase();

        if (!command) return;

        const matchedCommand = bot.commands.get(command);
        if (!matchedCommand) return;

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
            logError(message.guild.id, message.guild.name, error instanceof Error ? error : new Error(String(error)), `Executing command: ${command}`);
            message.reply({ content: "Commander, I think there is something wrong with me... (something broke, please ping @sefhi to check what is going on)" })
                .catch(replyError => {
                    logError(message.guild?.id || 'UNKNOWN', message.guild?.name || 'UNKNOWN', replyError instanceof Error ? replyError : new Error(String(replyError)), 'Sending error message');
                });
        }
    });
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
            sendDailyInterceptionMessage();
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
