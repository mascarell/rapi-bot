// dependencies
const CronJob = require("cron").CronJob;
const fetch = require("node-fetch");
const path = require("path");
const fs = require("fs");
const { createReadStream } = require('fs');
const moment = require("moment-timezone");
const {
    REST,
    Routes,
    Client,
    Collection,
    GatewayIntentBits,
    Events,
    EmbedBuilder,
    ActivityType,
    PresenceUpdateStatus,
} = require("discord.js");
const {
    createAudioPlayer,
    joinVoiceChannel,
    createAudioResource,
    VoiceConnectionStatus,
    AudioPlayerStatus,
} = require('@discordjs/voice');

// utils
const {
    getFiles,
    getIsStreaming,
    getRapiMessages,
    getBosses,
    getBossesLinks,
    getTribeTowerRotation,
    getBossFileName,
} = require("./utils");

const TOKEN = process.env.WAIFUTOKEN;
const CLIENTID = process.env.CLIENTID;
const RADIO_FOLDER_PATH = './radio';

// Map to store voice connections and playlists for each server
const voiceConnections = new Map();

const pre = "/"; // what we use for the bot commands (not for all of them tho)
const resetStartTime = moment.tz({ hour: 20, minute: 0, second: 0, millisecond: 0 }, 'UTC');
const resetEndTime = moment.tz({ hour: 20, minute: 0, second: 15, millisecond: 0 }, 'UTC');

// Bot Configuration
const bot = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Needed to receive message content
        GatewayIntentBits.GuildMembers, // If you use features like welcoming a new member
        GatewayIntentBits.GuildVoiceStates, // If you use features like voice channels
    ],
});
bot.commands = new Collection();

// Bot commands object
// The name has to be lowercase
const botCommands = {
    booba: {
        name: "booba?",
        async execute(msg, args) {
            // Pick image from folder
            let files = await getFiles("./public/images/booba/");
            // Get Random
            let randomMeme = files[Math.floor(Math.random() * files.length)];

            msg.reply({
                files: [
                    {
                        attachment: randomMeme.path,
                        name: randomMeme.name,
                    },
                ],
            });
        },
    },
    booty: {
        name: "booty?",
        async execute(msg, args) {
            // Pick image from folder
            let files = await getFiles("./public/images/booty/");
            // Get Random
            let randomMeme = files[Math.floor(Math.random() * files.length)];

            msg.reply({
                files: [
                    {
                        attachment: randomMeme.path,
                        name: randomMeme.name,
                    },
                ],
            });
        },
    },
    skillissue: {
        name: "sounds like...",
        async execute(msg, args) {
            msg.reply({
                files: [
                    {
                        attachment: "./public/images/nikke/skill.gif",
                        name: "skill.gif",
                    },
                ],
                content: `It sounds like you have some skill issues Commander.`,
            });
        },
    },
    // TODO: Check if both commands still necessary???
    skillissueiphone: {
        name: "sounds like…",
        async execute(msg, args) {
            msg.reply({
                files: [
                    {
                        attachment: "./public/images/nikke/skill.gif",
                        name: "skill.gif",
                    },
                ],
                content: `It sounds like you have some skill issues Commander.`,
            });
        },
    },
    seggs: {
        name: "seggs?",
        async execute(msg, args) {
            msg.reply({
                files: [
                    {
                        attachment: "./public/images/nikke/seggs.mp4",
                        name: "seggs.mp4",
                    },
                ],
                content: `Wait, Shifty, what are you talking about?`,
            });
        },
    },
    kindaweird: {
        name: "kinda weird...",
        async execute(msg, args) {
            msg.reply({
                files: [
                    {
                        attachment: "./public/images/nikke/kindaweird.png",
                    },
                ],
                content: `But why, Commander?...`,
            });
        },
    },
    iswear: {
        name: "i swear she is actually 3000 years old",
        async execute(msg, args) {
            msg.reply({
                files: [
                    {
                        attachment: "./public/images/nikke/iswear.png",
                        name: "iswear.png",
                    },
                ],
                content: `Commander... I'm calling the authorities.`,
            });
        },
    },
    teengame: {
        name: "12+ game",
        async execute(msg, args) {
            msg.reply({
                files: [
                    {
                        attachment: "./public/images/nikke/12game.png",
                        name: "12game.png",
                    },
                ],
                content: `Commander the surface is obviously safe for 12 year old kids.`,
            });
        },
    },
    justice: {
        name: "justice for...",
        async execute(msg, args) {
            // Pick image from folder
            let files = await getFiles("./public/images/justice/");
            // Get Random
            let randomMeme = files[Math.floor(Math.random() * files.length)];

            msg.reply({
                files: [
                    {
                        attachment: randomMeme.path,
                        name: randomMeme.name,
                    },
                ],
                content: `Commander, let's take her out of NPC jail.`,
            });
        },
    },
    whale: {
        name: "whale levels",
        async execute(msg, args) {
            msg.reply({
                files: [
                    {
                        attachment: "./public/images/nikke/whaling.png",
                        name: "whaling.jpg",
                    },
                ],
                content: `Commander, it's fine if you are poor.`,
            });
        },
    },
    discipline: {
        name: "lap of discipline.",
        async execute(msg, args) {
            const filePaths = [
                "./public/images/nikke/lapOfCounters.webp",
                "./public/images/nikke/lapOfDiscipline.jpg"
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
        execute(msg, args) {
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
        execute(msg, args) {
            msg.reply("Sorry Commander.");
        },
    },
    wronggirl: {
        name: "wrong girl",
        description: "wrong girl Rapi",
        execute(msg, args) {
            msg.reply({
                files: [
                    {
                        attachment: "./public/images/nikke/anis.png",
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
        execute(msg, args) {
            msg.reply({
                files: [
                    {
                        attachment: "./public/images/memes/copium-cn.jpg",
                        name: "copium-cn.jpg",
                    },
                ],
                content: `Commander, what are you talking about?`,
            });
        },
    },
    readyRapi: {
        name: "ready rapi?",
        async execute(msg, args) {
            msg.reply({
                files: [
                    {
                        attachment: "./public/images/nikke/ready.png",
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
        execute(msg, args) {
            msg.reply(
                `<@&1193252857990885476> Commanders, Andersen left a new briefing, please take a look above this message.`
            );
        },
    },
    badgirl: {
        name: "bad girl",
        description: "bad girl",
        execute(msg, args) {
            msg.reply({
                files: [
                    {
                        attachment: "./public/images/nikke/wrong.gif",
                        name: "wrong.gif",
                    },
                ],
            });
        },
    },
    reward: {
        name: "reward?",
        description: "reward?",
        execute(msg, args) {
            msg.reply({
                files: [
                    {
                        attachment: "./public/images/nikke/reward.jpg",
                        name: "reward.jpg",
                    },
                ],
            });
        },
    },
    damntrain: {
        name: "damn train",
        description: "damn train",
        execute(msg, args) {
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
                        attachment: "./public/images/nikke/SmugRapi.jpg",
                        name: "SmugRapi.jpg",
                    },
                ],
            });
        },
    },
    damngravedigger: {
        name: "damn gravedigger",
        description: "damn gravedigger",
        execute(msg, args) {
            const filePaths = [
                "./public/images/nikke/osugravedigger.png",
                "./public/images/nikke/damngravedigger.gif"
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
        execute(msg, args) {
            msg.reply({
                files: [
                    {
                        attachment: "./public/images/shifty/shifty_dead_spicy_crawl.gif",
                        name: "shifty_dead_spicy_crawl.gif"
                    },
                ],
            });
        },
    },
    curseofbelorta: {
        name: "belorta...",
        description: "CURSE OF BELORTA",
        async execute(msg, args) {
            const filePaths = [
                "./public/images/commands/belorta/belorta_close_up_eyes.png",
                "./public/images/commands/belorta/belorta_moran_yell.png",
                "./public/images/commands/belorta/belorta_multi_shafted.png",
                "./public/images/commands/belorta/belorta_peek.jpg",
                "./public/images/commands/belorta/belorta_pilgrim_mold.png",
                "./public/images/commands/belorta/belorta_pull_rage.png",
                "./public/images/commands/belorta/belorta_shocked.jpg",
                "./public/images/commands/belorta/belorta_slapped.png",
            ];

            let rnd = Math.floor(Math.random() * filePaths.length);
            let filePath = filePaths[rnd];

            msg.reply({
                content: "CURSE OF BELORTA𓀀 𓀁 𓀂 𓀃 𓀄 𓀅 𓀆 𓀇 𓀈 𓀉 𓀊 𓀋 𓀌 𓀍 𓀎 𓀏 𓀐 𓀑 𓀒 𓀓 𓀔 𓀕 𓀖 𓀗 𓀘 𓀙 𓀚 𓀛 𓀜 𓀝 𓀞 𓀟 𓀠 𓀡 𓀢 𓀣 𓀤 𓀥 𓀦 𓀧 𓀨 𓀩 𓀪 𓀫 𓀬 𓀭 𓀮 𓀯 𓀰 𓀱 𓀲 𓀳 𓀴 𓀵 𓀶 𓀷 𓀸 𓀹 𓀺 𓀻 𓀼 𓀽 𓀾 𓀿 𓁀 𓁁 𓁂 𓁃 𓁄 𓁅 𓁆 𓁇 𓁈 𓁉 𓁊 𓁋 𓁌 𓁍 𓁎 𓁏 𓁐 𓁑 𓀄 𓀅 𓀆 𓀇 𓀈 𓀉 𓀊",
                files: [
                    {
                        attachment: filePath
                    },
                ],
            });
        },
    },
    ccprules: {
        name: "ccp rules...",
        description: "CCP Rules",
        async execute(msg, args) {
            msg.reply({
                content: "Commander...please review our CCP Guidelines set by El Shafto...",
                files: [
                    {
                        attachment: "./public/images/commands/ccp_rules.png",
                    },
                ],
            });
        },
    },
    bestgirl: {
        name: "best girl?",
        description: "Best Girl Rapi",
        async execute(msg, args) {
            const msgContents = [
                "Commander, you wouldn't choose anyone else over me, would you...",
                "Commander, don't tell me you have another girlfriend...",
                "Wait, Commander, are you seeing someone else???",
                "No way, Commander! You wouldn't betray me like that...",
                "Commander, please tell me I'm the only one for you...",
                "Commander, I can't believe you'd even consider another girl...",
                "Commander, I thought I was the only one who understood you...",
                "Don't tell me there's someone else, Commander!!!"
            ];

            let rnd = Math.floor(Math.random() * msgContents.length);
            let msgContent = msgContents[rnd];

            msg.reply({
                content: msgContent,
                files: [
                    {
                        attachment: "./public/images/commands/rapi_secret_girlfriend.jpg",
                    },
                ],
            });
        },
    },
    gambleradvice: {
        name: "99%",
        description: "Gamblers' Advice",
        async execute(msg, args) {
            const filePaths = [
                "./public/images/commands/gamblerAdvice/GetShafted.mp4",
                "./public/images/commands/gamblerAdvice/GetShafted2.mp4",
                "./public/images/commands/gamblerAdvice/GetShafted.jpg",
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
    }
};

function loadCommands() {
    for (const key in botCommands) {
        console.log(`The following command was loaded successfully: ${key}`);
        bot.commands.set(botCommands[key].name, botCommands[key]);
    }
}

// Slash Commands Configuration
function loadGlobalSlashCommands() {
    const commandsPath = path.join(__dirname, "commands");
    const commandFiles = fs
        .readdirSync(commandsPath)
        .filter((file) => file.endsWith(".js"));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        // Set a new item in the Collection with the key as the command name and the value as the exported module
        if ("data" in command && "execute" in command) {
            bot.commands.set(command.data.name, command);
            console.log(
                `The following slash command was loaded successfully: ${command.data.name}`
            );
        } else {
            console.warn(
                `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
            );
        }
    }
}

function handleTimeout(msg) {
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
                        attachment: "./public/images/nikke/SmugRapi.jpg",
                        name: "SmugRapi.jpg",
                    }]
                });
            })
            .catch(error => {
                console.error('Failed to timeout the user:', error);
                handleTimeoutError(msg, author);
            });
    } else {
        msg.reply({
            content: `Well, I tried to give myself a break from you, Commander ${author}...but maybe I was being too rash. Thank you, Commander...`,
            files: [{
                attachment: "./public/images/commands/goodGirl/commander_rapi_hug.jpg",
                name: "commander_rapi_hug.jpg",
            }]
        });
    }
}

function handleTimeoutError(msg, author) {
    msg.reply({
        content: `Something caught me off guard...Commander ${author}...`,
        files: [{
            attachment: "./public/images/commands/goodGirl/commander_rapi_hug.jpg",
            name: "commander_rapi_hug.jpg",
        }]
    });
}


function registerGlobalSlashCommands() {
    const commands = [];
    const commandsPath = path.join(__dirname, "commands");
    const commandFiles = fs
        .readdirSync(commandsPath)
        .filter((file) => file.endsWith(".js"));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ("data" in command && "execute" in command) {
            commands.push(command.data.toJSON());
        } else {
            console.log(
                `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
            );
        }
    }

    // Construct and prepare an instance of the REST module
    const rest = new REST().setToken(TOKEN);

    // and deploy your commands!
    (async () => {
        try {
            console.log(
                `Started refreshing ${commands.length} application (/) commands.`
            );

            // Use PUT to fully refresh ALL commands
            const data = await rest.put(Routes.applicationCommands(CLIENTID), {
                body: commands,
            });

            console.log(
                `Successfully reloaded ${data.length} application (/) commands.`
            );
        } catch (error) {
            console.error(error);
        }
    })();
}

function updateBotActivity(activities) {
    const activity = activities[Math.floor(Math.random() * activities.length)];
    bot.user.setPresence({
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
        // {
        //     name: "SOLO RAID",
        //     type: ActivityType.Competing,
        //     status: PresenceUpdateStatus.DoNotDisturb,
        // },
        // {
        //     name: "UNION RAID",
        //     type: ActivityType.Competing,
        //     status: PresenceUpdateStatus.DoNotDisturb,
        // },
        // {
        //     name: "COOP RAID",
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

    // Create a new cron job to run every 4 hours
    const job = new CronJob(
        "0 */4 * * *",
        function () {
            if (getIsStreaming()) return; // Skip updating activities if streaming
            updateBotActivity(activities);
        },
        null,
        true,
        "UTC"
    );

    job.start();
}

function greetNewMembers() {
    bot.on("guildMemberAdd", (member) => {
        const channel = member.guild.channels.cache.find(
            (ch) => ch.name === "welcome"
        );
        if (channel) {
            channel.send(
                `Welcome Commander ${member}, please take care when going to the surface.`
            );
        }
    });
}

function sendRandomMessages() {
    // Create a new cron job to run every 6 hours
    const cronTime = "0 */6 * * *";
    const job = new CronJob(
        cronTime,
        function () {
            bot.guilds.cache.forEach((guild) => {
                const channel = guild.channels.cache.find(
                    (ch) => ch.name === "nikke"
                );
                if (channel) {
                    const messages = getRapiMessages();
                    const randomIndex = Math.floor(
                        Math.random() * messages.length
                    );
                    channel.send(messages[randomIndex]);
                }
            });
        },
        null,
        true,
        "UTC"
    );

    job.start();
}

// Send daily interception message to NIKKE channel
async function sendDailyInterceptionMessage() {
    const nikkeDailyResetTime = moment.tz({ hour: 20, minute: 0 }, "UTC");
    const cronTime = `${nikkeDailyResetTime.minute()} ${nikkeDailyResetTime.hour()} * * *`;

    const job = new CronJob(
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
                        (ch) => ch.name === "nikke"
                    );
                    if (!channel) {
                        console.log(`Channel 'nikke' not found in server: ${guild.name}.`);
                        return; // Continue to next guild
                    }

                    const role = guild.roles.cache.find(role => role.name === "Nikke");
                    // Send the role mention as a separate message before the embed if the role exists
                    if (role) {
                        await channel.send(`${role.toString()}, attention!`);
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
                    const sentMessage = await channel.send({
                        files: [{ attachment: `./public/images/bosses/${fileName}`, name: fileName }],
                        embeds: [embed]
                    });

                    // Setup collector for responses to this message
                    const filter = (response) => response.content.toLowerCase().includes("good girl") && !response.author.bot;
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
        null,
        true,
        "UTC"
    );

    job.start();
}


function handleMessages() {
    // Read command files from the commands directory
    const commandsDir = path.join(__dirname, "commands");
    const commandFiles = fs.readdirSync(commandsDir)
        .filter(file => file.endsWith('.js'))
        .map(file => file.slice(0, -3));  // Remove the .js extension

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
        let args = [];
        if (message.content[0] === pre) {
            args = message.content.split(/ +/);
        } else {
            args = [message.content];
        }

        const command = args.shift().toLowerCase();
        
        // Ignore if the command is part of slash commands
        if (validSlashCommands.has(command)) {
            return;  
        }

        // Check if we're mentioning the bot and if the message contains a valid command
        if (message.mentions.has(bot.user.id) && !bot.commands.has(command)) {
            try {
                const response = await fetch(`https://api.thecatapi.com/v1/images/search?api_key=${process.env.CATAPI}`);
                const data = await response.json();
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
            
            // Pick image from folder
            let files = await getFiles("./public/images/commands/getDatNikke/");
            
            // Get Random Image
            let randomImage = files[Math.floor(Math.random() * files.length)];
        
            message.reply({
                content: getHimReply,
                files: [
                    {
                        attachment: randomImage.path,
                        name: randomImage.name,
                    },
                ]
            });

            return;
        }

        if (message.content.trim().toLowerCase().startsWith("broke boi")){
            const mentionedUser = message.mentions.users.first();
            const brokeboiReply = mentionedUser ? `Commander <@${mentionedUser.id}>, ` : 'Commander, ';
            const filePaths = [
                "./public/images/memes/money-empty.gif",
                "./public/audio/brokeboi.mp3"
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
                "./public/images/commands/boondocks_read.gif",
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
        if (!command || !bot.commands.has(command)) return;

        try {
            const guild = message.guild;
            const ignoredRole = guild.roles.cache.find((role) => role.name === "Grounded");
            const contentCreatorRole = guild.roles.cache.find((role) => role.name === "Content Creator");

            if (command == "content" && contentCreatorRole && message.member.roles.cache.has(contentCreatorRole.id)) {
                bot.commands.get(command).execute(message, args);
            } else if (!ignoredRole || !message.member.roles.cache.has(ignoredRole.id)) {
                // Execute the command if it's not from a user with the ignored role
                bot.commands.get(command).execute(message, args);
            }
        } catch (error) {
            console.error(error);
            message.reply({ content: "Commander, I think there is something wrong with me... (something broke, please ping @sefhi to check what is going on)", ephemeral: true });
        }
    });
}

function handleAdvice() {
    // Advice Configuration
    // Dynamically loads all available files under ./advice folder. Just add a new <nikke>.js and it will be automatically added.
    let characters = {};
    const charactersDir = "./advice";
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
                const characterPath = path.join(__dirname, charactersDir, file); // Use __dirname to get the absolute path
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
                const character = args.shift().toLowerCase();
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

        const command = interaction.client.commands.get(
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

        const command = bot.commands.get(interaction.commandName);
        if (command && typeof command.autocomplete === "function") {
            await command.autocomplete(interaction);
        }
    });
}

async function initDiscordBot() {
    if (bot) new Error("Bot is already initialized, use getBot()");

    loadCommands();
    loadGlobalSlashCommands();
    registerGlobalSlashCommands();

    bot.once("ready", async () => {
        setBotActivity();
        greetNewMembers();
        sendRandomMessages();
        sendDailyInterceptionMessage();
        enableAutoComplete();
        handleMessages();
        handleAdvice();
        handleSlashCommands();

        console.log("Bot is ready!");

        // try to connec to VC for the Rapi Radio
        try {
            // Loop through each guild (server) the bot is in
            bot.guilds.cache.forEach(guild => {
                // Get a voice channel to connect to (default rapi-radio channel)
                const voiceChannel = guild.channels.cache.get('1229441264718577734');

                if (voiceChannel) {
                    connectToVoiceChannel(guild.id, voiceChannel);
                }
            });
        } catch (error) {
            console.error("Failed to connec to VC Chat bot:", error);
        }
    });

    bot.on('voiceStateUpdate', (oldState, newState) => {
        const guildId = newState.guild.id;
        const botId = bot.user.id;

        if (newState.member.id === botId && !newState.channelId) {
            // Bot left a voice channel
            voiceConnections.get(guildId)?.destroy();
            voiceConnections.delete(guildId);
        }
    });

    bot.login(TOKEN).catch(console.error);
}

async function connectToVoiceChannel(guildId, voiceChannel) {
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

function playNextSong(guildId) {
    try {
        const { connection, playlist } = voiceConnections.get(guildId);
        const currentIndex = connection.currentSongIndex || 0;
        const nextIndex = (currentIndex + 1) % playlist.length;
        const songPath = `${RADIO_FOLDER_PATH}/${playlist[nextIndex]}`;
        const resource = createAudioResource(songPath);

        // TODO
        // this is not available yet on discord.js, setting up the VC status to the current song name
        // only works for text channels for now, when it's updated i'll change it
        // const guild = bot.guilds.cache.get(guildId);
        // const voiceChannel = guild.channels.cache.get('1229441264718577734');
        // const fileName = path.parse(songPath).name;
        // voiceChannel.setTopic(`🎶 ${fileName} 🎶`);

        if (!connection.player) {
            connection.player = createAudioPlayer();
            connection.player.on(AudioPlayerStatus.Idle, () => {
                playNextSong(guildId);
            });
        }

        connection.subscribe(connection.player);
        connection.player.play(resource);

        // Update current song index for next iteration
        connection.currentSongIndex = nextIndex;
    } catch (error) {
        console.error(`Error while playing next song in guild ${guildId}:`, error);
    }
}

function getDiscordBot() {
    if (bot) {
        return bot;
    } else {
        new Error("Bot is not initialized");
    }
}

module.exports = {
    initDiscordBot,
    getDiscordBot,
};
