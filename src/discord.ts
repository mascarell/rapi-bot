import path from "path";
import fs from "fs";
import schedule from 'node-schedule';
import 'moment-timezone';
import {
    REST,
    Routes,
    Client,
    Collection,
    GatewayIntentBits,
    Events,
    EmbedBuilder,
    ActivityType,
    PresenceUpdateStatus,
    TextChannel,
    VoiceState,
    ChannelType,
    Guild,
} from "discord.js";
import {
    createAudioPlayer,
    joinVoiceChannel,
    createAudioResource,
    VoiceConnectionStatus,
    AudioPlayerStatus,
    VoiceConnection,
    AudioPlayer,
} from '@discordjs/voice';

// utils
import {
    getFiles,
    getIsStreaming,
    getRapiMessages,
    getBosses,
    getTribeTowerRotation,
    getBossFileName,
} from "./utils";
import moment from "moment";
import axios from "axios";

const TOKEN = process.env.WAIFUTOKEN as string;
const CLIENTID = process.env.CLIENTID as string;
const RADIO_FOLDER_PATH = './radio';

// Map to store voice connections and playlists for each server
const voiceConnections: Map<string, { connection: VoiceConnection; playlist: string[], player?: AudioPlayer, currentSongIndex?: number }> = new Map();

const pre = "/"; // what we use for the bot commands (not for all of them tho)
const resetStartTime = moment.tz({ hour: 20, minute: 0, second: 0, millisecond: 0 }, 'UTC');
const resetEndTime = moment.tz({ hour: 20, minute: 0, second: 15, millisecond: 0 }, 'UTC');

// Bot Configuration
const bot: Client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

bot.commands = new Collection();
const commands: Array<object> = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    import(filePath).then(commandModule => {
        const command = commandModule.default;
        bot.commands.set(command.data.name, command);
        commands.push(command.data.toJSON());
    }).catch(console.error);
}

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
const botCommands: { [key: string]: BotCommand } = {
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
            msg.reply({
                files: [
                    {
                        attachment: "./src/public/images/nikke/seggs.mp4",
                        name: "seggs.mp4",
                    },
                ],
                content: `Wait, Shifty, what are you talking about?`,
            });
        },
    },
    kindaweird: {
        name: "kinda weird...",
        async execute(msg) {
            msg.reply({
                files: [
                    {
                        attachment: "./src/public/images/nikke/kindaweird.png",
                    },
                ],
                content: `But why, Commander?...`,
            });
        },
    },
    iswear: {
        name: "i swear she is actually 3000 years old",
        async execute(msg) {
            msg.reply({
                files: [
                    {
                        attachment: "./src/public/images/nikke/iswear.png",
                        name: "iswear.png",
                    },
                ],
                content: `Commander... I'm calling the authorities.`,
            });
        },
    },
    teengame: {
        name: "12+ game",
        async execute(msg) {
            msg.reply({
                files: [
                    {
                        attachment: "./src/public/images/nikke/12game.png",
                        name: "12game.png",
                    },
                ],
                content: `Commander the surface is obviously safe for 12 year old kids.`,
            });
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
            msg.reply({
                files: [
                    {
                        attachment: "./src/public/images/nikke/whaling.png",
                        name: "whaling.jpg",
                    },
                ],
                content: `Commander, it's fine if you are poor.`,
            });
        },
    },
    discipline: {
        name: "lap of discipline.",
        async execute(msg) {
            const filePaths = [
                "./src/public/images/nikke/lapOfCounters.webp",
                "./src/public/images/nikke/lapOfDiscipline.jpg"
            ];

            msg.reply({
                files: [
                    {
                        attachment: filePaths[0],
                    },
                ]
            });
            msg.reply({
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
        execute(msg) {
            // Check if the command is in the restricted channel and time window
            const isNikkeChannel = msg.channel.name === "nikke";
            const currentTime = moment.tz('UTC');
            const isWithinTimeWindow = currentTime.isBetween(resetStartTime, resetEndTime);

            if (isNikkeChannel && isWithinTimeWindow) {
                console.log("Ignoring 'goodgirl' command in 'nikke' channel within specific time window.");
                return;
            }

            // Random chance for a timeout action
            if (Math.random() < 0.04) {
                handleTimeout(msg);
            } else {
                msg.reply(`Thank you Commander ${msg.author}.`);
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
        execute(msg) {
            msg.reply({
                files: [
                    {
                        attachment: "./src/public/images/nikke/anis.png",
                        name: "anis.jpg",
                    },
                ],
                content: `(￢з￢) Well well, so you DO see us that way, interesting!`,
            });
        },
    },
    moldRates: {
        name: "mold rates are not that bad",
        description: `Commander, what are you talking about?`,
        execute(msg) {
            msg.reply({
                files: [
                    {
                        attachment: "./src/public/images/memes/copium-cn.jpg",
                        name: "copium-cn.jpg",
                    },
                ],
                content: `Commander, what are you talking about?`,
            });
        },
    },
    readyRapi: {
        name: "ready rapi?",
        async execute(msg) {
            msg.reply({
                files: [
                    {
                        attachment: "./src/public/images/nikke/ready.png",
                        name: "ready.jpg",
                    },
                ],
                content: `Commander... ready for what?`,
            });
        },
    },
    contentSquad: {
        name: pre + "content",
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
        execute(msg) {
            msg.reply({
                files: [
                    {
                        attachment: "./src/public/images/nikke/wrong.gif",
                        name: "wrong.gif",
                    },
                ],
            });
        },
    },
    reward: {
        name: "reward?",
        description: "reward?",
        execute(msg) {
            msg.reply({
                files: [
                    {
                        attachment: "./src/public/images/nikke/reward.jpg",
                        name: "reward.jpg",
                    },
                ],
            });
        },
    },
    damntrain: {
        name: "damn train",
        description: "damn train",
        execute(msg) {
            try {
                const emoji = "❌";
                msg.react(emoji);
            } catch (error) {
                console.error(
                    "Failed to react with emoji:",
                    error
                );
            }

            msg.reply({
                content: `Commander...we don't talk about trains here.`,
                files: [
                    {
                        attachment: "./src/public/images/nikke/SmugRapi.jpg",
                        name: "SmugRapi.jpg",
                    },
                ],
            });
        },
    },
    damngravedigger: {
        name: "damn gravedigger",
        description: "damn gravedigger",
        execute(msg) {
            const filePaths = [
                "./src/public/images/nikke/osugravedigger.png",
                "./src/public/images/nikke/damngravedigger.gif"
            ];

            let rnd = Math.floor(Math.random() * filePaths.length);
            let filePath = filePaths[rnd];

            msg.reply({
                content: `Commander...`,
                files: [
                    {
                        attachment: filePath,
                    },
                ],
            });
        },
    },
    shiftdeadspicycrawl: {
        name: "dead spicy?",
        description: "dead spicy?",
        execute(msg) {
            msg.reply({
                files: [
                    {
                        attachment: "./src/public/images/shifty/shifty_dead_spicy_crawl.gif",
                        name: "shifty_dead_spicy_crawl.gif"
                    },
                ],
            });
        },
    },
    curseofbelorta: {
        name: "belorta...",
        description: "CURSE OF BELORTA",
        async execute(msg) {
            await sendRandomImageWithContent(msg, "./src/public/images/commands/belorta/", "CURSE OF BELORTA𓀀 𓀁 𓀂 𓀃 𓀄 𓀅 𓀆 𓀇 𓀈 𓀉 𓀊 𓀋 𓀌 𓀍 𓀎 𓀏 𓀐 𓀑 𓀒 𓀓 𓀔 𓀕 𓀖 𓀗 𓀘 𓀙 𓀚 𓀛 𓀜 𓀝 𓀞 𓀟 𓀠 𓀡 𓀢 𓀣 𓀤 𓀥 𓀦 𓀧 𓀨 𓀩 𓀪 𓀫 𓀬 𓀭 𓀮 𓀯 𓀰 𓀱 𓀲 𓀳 𓀴 𓀵 𓀶 𓀷 𓀸 𓀹 𓀺 𓀻 𓀼 𓀽 𓀾 𓀿 𓁀 𓁁 𓁂 𓁃 𓁄 𓁅 𓁆 𓁇 𓁈 𓁉 𓁊 𓁋 𓁌 𓁍 𓁎 𓁏 𓁐 𓁑 𓀄 𓀅 𓀆 𓀇 𓀈 𓀉 𓀊");
        },
    },
    ccprules: {
        name: "ccp rules...",
        description: "CCP Rules",
        async execute(msg) {
            msg.reply({
                content: "Commander...please review our CCP Guidelines set by El Shafto...",
                files: [
                    {
                        attachment: "./src/public/images/commands/ccp_rules.png",
                    },
                ],
            });
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
            const filePaths = [
                "./src/public/images/commands/gamblerAdvice/GetShafted.mp4",
                "./src/public/images/commands/gamblerAdvice/GetShafted2.mp4",
                "./src/public/images/commands/gamblerAdvice/GetShafted.jpg",
            ];

            let rnd = Math.floor(Math.random() * filePaths.length);
            let filePath = filePaths[rnd];

            msg.reply({
                content: "Commander...did you know 99% of gamblers quit before hitting it big?",
                files: [
                    {
                        attachment: filePath
                    },
                ],
            });
        },
    },
    ccpNumbahOne: {
        name: "ccp #1",
        description: "CCP LOYALTY",
        async execute(msg) {
            await sendRandomImageWithContent(msg, "./src/public/images/commands/ccp/", getRandomMantra());
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
    let files = await getFiles(folderPath);
    let randomFile = files[Math.floor(Math.random() * files.length)];
    msg.reply({
        content: content,
        files: [
            {
                attachment: randomFile.path,
                name: randomFile.name,
            },
        ],
    });
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

function getRandomMantra() {
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

function loadCommands() {
    for (const key in botCommands) {
        console.log(`The following command was loaded successfully: ${key}`);
        (bot as any).commands.set(botCommands[key].name, botCommands[key]);
    }
}

function handleTimeout(msg: any) {
    const { member, author } = msg;

    // Calculating whether to timeout
    if (Math.random() < 0.5) {
        member.timeout(300000, "Commander, I need a moment of peace away from you!")
            .then(() => {
                const emojis = ["sefhistare:1124869893880283306", "❌"];
                emojis.forEach(emoji => msg.react(emoji).catch(console.error));

                msg.reply({
                    content: `Honestly, Commander ${author}, can't I get a moment of peace?! Enjoy your 5 minutes of quiet time!`,
                    files: [{
                        attachment: "./src/public/images/nikke/SmugRapi.jpg",
                        name: "SmugRapi.jpg",
                    }]
                });
            })
            .catch((error: any) => {
                console.error('Failed to timeout the user:', error);
                handleTimeoutError(msg, author);
            });
    } else {
        msg.reply({
            content: `Well, I tried to give myself a break from you, Commander ${author}...but maybe I was being too rash. Thank you, Commander...`,
            files: [{
                attachment: "./src/public/images/commands/goodGirl/commander_rapi_hug.jpg",
                name: "commander_rapi_hug.jpg",
            }]
        });
    }
}

function handleTimeoutError(msg: any, author: any) {
    msg.reply({
        content: `Something caught me off guard...Commander ${author}...`,
        files: [{
            attachment: "./src/public/images/commands/goodGirl/commander_rapi_hug.jpg",
            name: "commander_rapi_hug.jpg",
        }]
    });
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
            name: "UNION RAID",
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
            name: "Lost Ark",
            type: ActivityType.Playing,
            status: PresenceUpdateStatus.Online,
        },
        {
            name: "Trickal RE:VIVE",
            type: ActivityType.Playing,
            status: PresenceUpdateStatus.Online,
        },
        {
            name: "Sword of Convallaria",
            type: ActivityType.Playing,
            status: PresenceUpdateStatus.Online,
        },
    ];

    updateBotActivity(activities);

    schedule.scheduleJob('0 */4 * * *', function () {
        if (getIsStreaming()) return; // Skip updating activities if streaming
        updateBotActivity(activities);
    });
    
    console.log("Scheduled activity update job to run every 4 hours.");
}

function greetNewMembers() {
    bot.on("guildMemberAdd", (member) => {
        const channel = member.guild.channels.cache.find(
            (ch) => ch.type === ChannelType.GuildText && ch.name === "welcome"
        ) as TextChannel | undefined;
        if (channel) {
            channel.send(
                `Welcome Commander ${member}, please take care when going to the surface.`
            );
        }
    });
}

function sendRandomMessages() {
    schedule.scheduleJob('0 */6 * * *', () => {
        bot.guilds.cache.forEach((guild) => {
            const channel = guild.channels.cache.find(
                (ch) => ch.type === ChannelType.GuildText && ch.name === "nikke"
            ) as TextChannel | undefined;
            if (channel) {
                const messages = getRapiMessages();
                const randomIndex = Math.floor(Math.random() * messages.length);
                channel.send(messages[randomIndex]);
            }
        });
    });
    
    console.log("Scheduled random message job to run every 6 hours.");
}

// Send daily interception message to NIKKE channel
async function sendDailyInterceptionMessage() {
    const nikkeDailyResetTime = moment.tz({ hour: 20, minute: 0 }, "UTC");
    const cronTime = `${nikkeDailyResetTime.minute()} ${nikkeDailyResetTime.hour()} * * *`;

    
    schedule.scheduleJob(
        cronTime,
        async () => {
            try {
                const currentDayOfYear = moment().dayOfYear();
                const bosses = getBosses();
                const bossIndex = currentDayOfYear % bosses.length;
                const bossName = bosses[bossIndex];
                const fileName = getBossFileName(bossName);
                const towerRotation = getTribeTowerRotation();
                const currentDayOfWeek = new Date().getDay();
                const firstResponseHandledMap = new Map();

                bot.guilds.cache.forEach(async (guild) => {
                    // Initialize the state for the guild as false
                    firstResponseHandledMap.set(guild.id, false);
                    const channel = guild.channels.cache.find(
                        (ch: any) => ch.name === "nikke"
                    );
                    if (!channel) {
                        console.log(`Channel 'nikke' not found in server: ${guild.name}.`);
                        return; // Continue to next guild
                    }

                    const role = guild.roles.cache.find((role: any) => role.name === "Nikke");
                    // Send the role mention as a separate message before the embed if the role exists
                    if (role && channel.isTextBased()) {
                        await (channel as TextChannel).send(`${role.toString()}, attention!`);
                    }

                    const embed = new EmbedBuilder()
                        .setTitle(`Attention commanders, here's today's schedule:`)
                        .setDescription(
                            `- We have to fight **${bossName}** in Special Interception\n` +
                            `- Tribe tower is open for **${towerRotation[currentDayOfWeek % towerRotation.length]}**`
                        )
                        .setColor(0x00AE86)
                        .setTimestamp()
                        .setFooter({ text: 'Stay safe on the surface, Commanders!' });

                    // Send the embed message
                        const sentMessage = await (channel as TextChannel).send({
                        files: [{ attachment: `./src/public/images/bosses/${fileName}`, name: fileName }],
                        embeds: [embed]
                    });

                    // Setup collector for responses to this message
                    const filter = (response: any) => response.content.toLowerCase().includes("good girl") && !response.author.bot;
                    const collector = sentMessage.channel.createMessageCollector({ filter, time: 15000 });

                    collector.on('collect', async m => {
                        if (!firstResponseHandledMap.get(guild.id)) {
                            firstResponseHandledMap.set(guild.id, true);
                            try {
                                const emoji = "❤️";
                                await m.react(emoji);
                            } catch (error) {
                                console.error("Failed to react with custom emoji:", error);
                            }

                            const thankYouMessages = [
                                "Your swiftness is unmatched, Commander ${m.author}. It's impressive.",
                                "Your alertness honors us all, Commander ${m.author}.",
                                "Your swift response is commendable, Commander ${m.author}."
                            ];

                            // Randomly select a thank you message
                            const randomIndex = Math.floor(Math.random() * thankYouMessages.length);
                            const thankYouMessage = thankYouMessages[randomIndex];

                            m.reply(eval('`' + thankYouMessage + '`'));
                        } else {
                            try {
                                const emoji = "sefhistare:1124869893880283306"; // Use the correct format 'name:id' for custom emojis
                                await m.react(emoji);
                            } catch (error) {
                                console.error(
                                    "Failed to react with custom emoji:",
                                    error
                                );
                            }
                            m.reply(
                                `Commander ${m.author}... I expected better...`
                            );
                        }
                    });

                    collector.on('end', collected => {
                        // Reset the first response handler for the guild
                        firstResponseHandledMap.set(guild.id, false);
                        console.log(`Collector stopped. Collected ${collected.size} responses for server: ${guild.name}.`);
                    });
                });
            } catch (error) {
                console.error(`Error sending daily interception message: ${error}`);
            }
        },
    );
}

function handleMessages() {
    // Read command files from the commands directory
    const commandsDir = path.join(__dirname, "commands");
    const commandFiles = fs.readdirSync(commandsDir)
        .filter(file => file.endsWith('.ts'))
        .map(file => file.slice(0, -3));  // Remove the .ts extension

    const validSlashCommands = new Set(commandFiles);

    bot.on("messageCreate", async (message) => {
        // Ignore messages that mention @everyone
        if (message.mentions.everyone) {
            return;
        }

        // If guild or member is not defined, ignore the message
        if (!message.guild || !message.member) {
            return;
        }

        // Establish arguments
        let args: string[] = [];
        if (message.content[0] === pre) {
            args = message.content.split(/ +/);
        } else {
            args = [message.content];
        }

        const command = args.shift()?.toLowerCase() || "";
        
        // Ignore if the command is part of slash commands
        if (validSlashCommands.has(command)) {
            return;  
        }

        // Check if we're mentioning the bot and if the message contains a valid command
        if (message.mentions.has(bot.user?.id || "") && !(bot as any).commands.has(command)) {
            try {
                const response = await axios.get(`https://api.thecatapi.com/v1/images/search?api_key=${process.env.CATAPI}`);
                const data = response.data;
                message.channel.send(`I'm busy Commander ${message.author}, but here's a cat.`);
                message.channel.send(data[0].url);
            } catch (error) {
                console.error(error);
                message.channel.send(`Did you mention me, Commander ${message.author}?`);
            }
            return;
        }

        if (message.content.trim().toLowerCase().startsWith("rapi get dat nikke")){
            const mentionedUser = message.mentions.users.first();
            const getHimReply = mentionedUser ? `Commander <@${mentionedUser.id}>... ` : '';
            
            await sendRandomImageWithContent(message, "./src/public/images/commands/getDatNikke/", getHimReply);
            return;
        }

        if (message.content.trim().toLowerCase().startsWith("broke boi")){
            const mentionedUser = message.mentions.users.first();
            const brokeboiReply = mentionedUser ? `Commander <@${mentionedUser.id}>, ` : 'Commander, ';
            const filePaths = [
                "./src/public/images/memes/money-empty.gif",
                "./src/public/audio/brokeboi.mp3"
            ];
        
            const brokeboiMessages = [
                "it looks like your wallet is as empty as your promises.",
                "running low on funds again? Maybe you should try saving for once.",
                "looks like you need a lesson in budgeting. How much is left in the treasury, broke boy?",
                "I think it's time to reconsider your spending habits. You're practically broke.",
                "planning to lead us into battle with an empty wallet? Classic move.",
                "another day, another dollar... missing from your account.",
                "your financial situation is more dire than our latest mission.",
                "guess we'll have to tighten our belts again. Your funds are looking pretty thin.",
                "even the enemy seems to have more resources than you. What's your excuse this time?",
                "seems like you need a bailout. Broke boy, what's the plan now?"
            ];
        
            const randomMessage = brokeboiMessages[Math.floor(Math.random() * brokeboiMessages.length)];
        
            message.reply({
                content: brokeboiReply + randomMessage,
                files: filePaths.map(filePath => ({ attachment: filePath })),
            });

            return;
        }

        if (message.content.trim().toLowerCase().startsWith("read nikke")){
            const mentionedUser = message.mentions.users.first();
            const readNikkeReply = mentionedUser ? `Commander <@${mentionedUser.id}>, ` : 'Commander, ';
            const filePaths = [
                "./src/public/images/commands/boondocks_read.gif",
            ];
        
            const readNikkeMessages = [
                "skipping the story again? You miss all the good parts...",
                "maybe try reading the dialogue. It’s not just about the battles!",
                "you’d enjoy the game more if you actually read the story...",
                "always skipping content??? You’re missing all the plot twists!",
                "read the story! There’s more than just shooting!",
                "what’s the rush? Enjoy the dialogue for once...",
                "you skip more content than you should. Try reading!!!",
                "the story is half the fun. Stop skipping it like El Shafto!!!",
                "always rushing? The dialogue has great moments, you know...",
                "ever thought about reading? You’re missing out on the lore!"
            ];
        
            const randomMessage = readNikkeMessages[Math.floor(Math.random() * readNikkeMessages.length)];
        
            message.reply({
                content: readNikkeReply + randomMessage,
                files: filePaths.map(filePath => ({ attachment: filePath })),
            });

            return;
        }

        // If there's no command or it's not a valid bot command, exit early
        if (!command || !(bot as any).commands.has(command)) return;

        try {
            const guild = message.guild;
            const ignoredRole = guild.roles.cache.find((role) => role.name === "Grounded");
            const contentCreatorRole = guild.roles.cache.find((role) => role.name === "Content Creator");

            if (command == "content" && contentCreatorRole && message.member.roles.cache.has(contentCreatorRole.id)) {
                (bot as any).commands.get(command).execute(message, args);
            } else if (!ignoredRole || !message.member.roles.cache.has(ignoredRole.id)) {
                // Execute the command if it's not from a user with the ignored role
                (bot as any).commands.get(command).execute(message, args);
            }
        } catch (error) {
            console.error(error);
            message.reply({ content: "Commander, I think there is something wrong with me... (something broke, please ping @sefhi to check what is going on)" });
        }
    });
}

function handleAdvice() {
    // Advice Configuration
    // Dynamically loads all available files under ./advice folder. Just add a new <nikke>.js and it will be automatically added.
    let characters: { [key: string]: string[] } = {};
    const charactersDir = path.join(__dirname, "advice");
    // List of current Lolis in NIKKE
    // TODO: Need to add more lollipops in the future.
    const lollipops = [
        "liter",
        "signal",
        "yuni",
        "miranda",
        "soline",
        "guillotine",
        "admi",
        "rei",
        "kilo"
    ];
    fs.readdirSync(charactersDir)
        .filter((file) => file.endsWith(".js"))
        .forEach((file) => {
            try {
                const characterName = file.split(".")[0];
                const characterPath = path.join(charactersDir, file);
                characters[characterName] = require(characterPath);
            } catch (error) {
                console.error(
                    `Error loading advice file for character: ${file}`,
                    error
                );
            }
        });

    // TODO: Register this as a global command so we can utilize Interactions interface for sending ephemeral responses to avoid spam in a channel.
    // Workaround is to allow users to DM the bot directly since that works as well to avoid spam if desired.
    // Advice command functionality
    bot.on("messageCreate", (msg) => {
        try {
            // Check if the message doesn't start with the prefix or doesn't include a valid command
            const userInput = msg.content.trim().toLowerCase();
            if (
                !msg.content.toLowerCase().startsWith(pre) ||
                Object.keys(botCommands).some(
                    (cmd) => botCommands[cmd].name === userInput
                )
            ) {
                return;
            } else {
                const args = msg.content.slice(pre.length).trim().split(/\s+/);
                const character = args.shift()?.toLowerCase() || "";
                const searchQuery = args.join(" ").toLowerCase();

                if (!characters[character]) {
                    return msg.reply(
                        `Commander...Are you cheating on me? Who is ${character}? Please explain yourself.`
                    );
                }

                if (searchQuery === "list") {
                    // Split each advice into its question and answer parts, then prepend "Q:" and "A:"
                    const fullList = characters[character]
                        .map((advice) => {
                            const parts = advice.split("\n"); // Split the advice into question and answer
                            return `Q: ${parts[0]}\nA: ${parts[1]}`; // Prepend "Q:" and "A:" to the question and answer, respectively
                        })
                        .join("\n\n"); // Join all formatted advices with two newlines for separation

                    const embed = new EmbedBuilder()
                        .setColor("#a8bffb")
                        .setTitle(
                            `Advice List for Nikke ${character
                                .charAt(0)
                                .toUpperCase()}${character.slice(1)}`
                        )
                        .setDescription(fullList);
                    return msg.channel.send({ embeds: [embed] });
                }

                // Find matching advice assuming `characters[character]` is an array of strings
                const matchingAdvice = characters[character].find(
                    (adviceString) => {
                        // Split the string into question and answer parts
                        const matchingAdviceParts = adviceString.split("\n");
                        // Check if either part includes the searchQuery
                        return matchingAdviceParts.some((part) =>
                            part.toLowerCase().includes(searchQuery)
                        );
                    }
                );

                if (matchingAdvice) {
                    const adviceParts = matchingAdvice.split("\n");
                    const question = adviceParts[0] || "Question not found";
                    const answer = adviceParts[1] || "Answer not found";
                    const description = lollipops.includes(character)
                        ? "Shame on you Commander for advising lolis..."
                        : "Here's the answer you're looking for Commander:";
                    const embed = new EmbedBuilder()
                        .setColor("#63ff61")
                        .setTitle(
                            `${character
                                .charAt(0)
                                .toUpperCase()}${character.slice(1)}`
                        )
                        .setDescription(description)
                        .addFields(
                            { name: "Question:", value: question },
                            { name: "Answer:", value: answer }
                        );
                    msg.channel.send({ embeds: [embed] });
                } else {
                    msg.reply(
                        `Commander, I was unable to locate the following text: "${searchQuery}". Please try again.`
                    );
                }
            }
        } catch (error) {
            console.error("Error processing message:", error);
            msg.reply(
                "Sorry Commander, I was unable to answer your question at this time...am I still a good girl?"
            );
        }
    });
}

// Handles bot slash commands interactions for all available slash commands
function handleSlashCommands() {
    bot.on(Events.InteractionCreate, async (interaction) => {
        if (!interaction.isChatInputCommand()) return;

        const command = (interaction.client as any).commands.get(
            interaction.commandName
        );

        if (!command) {
            console.error(
                `No command matching ${interaction.commandName} was found.`
            );
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content:
                        "Sorry Commander, there was an error while executing this command!",
                    ephemeral: true,
                });
            } else {
                await interaction.reply({
                    content:
                        "Sorry Commander, there was an error while executing this command!",
                    ephemeral: true,
                });
            }
        }
    });
}

function enableAutoComplete() {
    bot.on(Events.InteractionCreate, async (interaction) => {
        if (!interaction.isAutocomplete()) return;

        const command = (bot as any).commands.get(interaction.commandName);
        if (command && typeof command.autocomplete === "function") {
            await command.autocomplete(interaction);
        }
    });
}

async function initDiscordBot() {
    //if (bot) throw new Error("Bot is already initialized, use getBot()");

    loadCommands();
    const bot = getDiscordBot();
    bot.once(Events.ClientReady, (async () => {
        setBotActivity();
        greetNewMembers();
        sendRandomMessages();
        sendDailyInterceptionMessage();
        enableAutoComplete();
        handleMessages();
        handleAdvice();
        handleSlashCommands();

        const rest = new REST().setToken(TOKEN);
        try {
            console.log(commands);
            console.log(`Client ID: ${CLIENTID}`);
            console.log('Started refreshing application (/) commands.');
            await rest.put(
                Routes.applicationCommands(CLIENTID),
                { body: commands }
            );
            console.log('Successfully reloaded application (/) commands.');
        } catch (error) {
            console.error(error);
        }

        // try to connect to VC for the Rapi Radio
        try {
            
            // Loop through each guild (server) the bot is in
            bot.guilds.cache.forEach(async (guild: Guild) => {
                // Get a voice channel to connect to (default rapi-radio channel)
                const voiceChannel = guild.channels.cache.get('1229441264718577734');

                if (voiceChannel) {
                    await connectToVoiceChannel(guild.id, voiceChannel);
                }
            });
        } catch (error) {
            console.error("Failed to connect to VC Chat bot:", error);
        }
    }) as (client: Client<true>) => Promise<void>);

    bot.on('voiceStateUpdate', (oldState: VoiceState, newState: VoiceState) => {
        const guildId = newState.guild.id;
        const botId = bot.user?.id;

        if (newState.member?.id === botId && !newState.channelId) {
            // Bot left a voice channel
            voiceConnections.get(guildId)?.connection.destroy();
            voiceConnections.delete(guildId);
        }
    });

    await bot.login(TOKEN).catch(console.error);

    console.log("Bot is ready!");
}

async function connectToVoiceChannel(guildId: string, voiceChannel: any) {
    try {
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator
        });

        connection.on('error', error => {
            console.error(`Voice connection error in guild ${guildId}:`, error);
        });

        const playlist = fs.readdirSync(RADIO_FOLDER_PATH);

        voiceConnections.set(guildId, { connection, playlist });

        connection.on(VoiceConnectionStatus.Ready, () => {
            console.log(`Bot connected to voice channel in guild ${guildId}`);
            playNextSong(guildId);
        });
    } catch (error) {
        console.error(`Failed to connect to voice channel in guild ${guildId}:`, error);
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

        // TODO
        // this is not available yet on discord.js, setting up the VC status to the current song name
        // only works for text channels for now, when it's updated i'll change it
        // const guild = bot.guilds.cache.get(guildId);
        // const voiceChannel = guild.channels.cache.get('1229441264718577734');
        // const fileName = path.parse(songPath).name;
        // voiceChannel.setTopic(`🎶 ${fileName} 🎶`);

        if (!voiceConnectionData.player) {
            voiceConnectionData.player = createAudioPlayer();
            voiceConnectionData.player.on(AudioPlayerStatus.Idle, () => {
                playNextSong(guildId);
            });
        }

        connection.subscribe(voiceConnectionData.player);
        voiceConnectionData.player.play(resource);

        // Update current song index for next iteration
        voiceConnectionData.currentSongIndex = nextIndex;
    } catch (error) {
        console.error(`Error while playing next song in guild ${guildId}:`, error);
    }
}

function getDiscordBot() {
    if (bot) {
        return bot;
    } else {
        throw new Error("Bot is not initialized");
    }
}

export {
    initDiscordBot,
    getDiscordBot,
};