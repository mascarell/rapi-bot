// dependencies
const { REST, Routes, Client, GatewayIntentBits, Collection, Events, EmbedBuilder } = require('discord.js');
const { getFiles, getIsStreaming } = require('./utils')
const CronJobb = require('cron').CronJob
const fetch = require("node-fetch")
const path = require('path');
const fs = require('fs');

const TOKEN = process.env.WAIFUTOKEN
const CLIENTID = process.env.CLIENTID

const pre = '/' // what we use for the bot commands (not for all of them tho)

// Bot Configuration
const bot = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Needed to receive message content
        GatewayIntentBits.GuildMembers, // If you use features like welcoming a new member
    ]
});
bot.commands = new Collection();

//TODO: Create util function for this
const randomRapiMessages = [
	`You’re too quiet, Commander, is everything alright?`,
	`Commander, Anis was just joking with the Christmas present…`,
	`Commander! When is the next mission?`,
	`Please take care next time you go to the surface Commander.`,
	`Don't push yourself too hard Commander!`,
	`No matter what you think of us, we'll always be by your side.`,
	`Commander, I'll protect you.`,
	`Lap of discipline`,
	`Is it time to break Syuen ribs again, Commander?`,
	`I found a wet sock with a weird smell under your bed Commander, care to explain?`,
	`Marian please stop wearing your underwear inside out...`,
	`Commander, why do you bark every time you see Makima?`,
	`Scarlet or Modernia? What kind of question is that Commander? The answer is obvious...`,
	`I can't go out with you today Commander, there's a lot of paperwork to do.`,
	`Commander... did you really marry Sakura?`,
	`Those cookies were the snacks of Biscuit. Did you really ate them Commander?`,
	`Commander, why do you have a picture of Andersen on your wallet?`,
	`Commander, did you spend the night at Coin Rush again?`,
	`Commander, people are saying you kissed Blanc and Noir... is that true?`,
	`Neon said she saw you leaving room 805 at the hotel, what was that about Commander, did you have a meeting?`,
	`I guess Rosanna was right about idiots living longer.`,
	`Commander! Anis said that this swimsuit is better than my normal outfit for fighting Raptures, what do you think?`,
	`Waterpower? I don't know what that is Commander, but it sounds kinda weak.`,
	`Commander! Is it Volt or Bolt?`,
	`Commander, Admi was asking about Ruru, do you know where she is?`,
	`The Golden Ship? Commander you are already old enough to believe in that stuff, please get back to work.`,
	`Mast? Who's that? Doesn't ring a bell.`,
	`Commander! Yan sold me this swimsuit, what do you think about it? Here's a picture https://media.discordapp.net/attachments/1054761762395799552/1142732669617184898/image.png?width=445&height=595`,
	`Commander, did you really tackle Crow? How did you do it?`,
	`Age is just a number? Commander, I'm calling ACPU`,
	`What do you mean my voice sounds similar to someone else? Who are you thinking about Commander? sigh...`,
	`https://media.discordapp.net/attachments/1075785251156144179/1142745671766638592/1691823770699829.png`,
	`Commander, what did you want to ask about Biscuit?`,
	`Commander, 61% is more than enough, stop complaining.`,
	`Commander, Ade said that I need to try a maid outfit, what do you think?`,
]

// Bot commands object
// The name has to be lowercase
const botCommands = {
	booba: {
		name: 'booba?',
		async execute(msg, args) {
			// Pick image from folder
			let files = await getFiles('./public/images/booba/')
			// Get Random
			let randomMeme = files[Math.floor(Math.random() * files.length)]
		
			msg.reply({
				files: [{
					attachment: randomMeme.path,
                    name: randomMeme.name
				}]
			})
		}
	},
	booty: {
		name: 'booty?',
		async execute(msg, args) {
			// Pick image from folder
			let files = await getFiles('./public/images/booty/')
			// Get Random
			let randomMeme = files[Math.floor(Math.random() * files.length)]
		
			msg.reply({
				files: [{
					attachment: randomMeme.path,
                    name: randomMeme.name
				}]
			})
		}
	},
	skillissue: {
		name: 'sounds like...',
		async execute(msg, args) {
			msg.reply({
				files: [{
					attachment: './public/images/nikke/skill.gif',
                    name: 'skill.gif'
				}],
				content: `It sounds like you have some skill issues Commander.`,
			})
		}
	},
    // TODO: Check if both commands still necessary???
	skillissueiphone: {
    name: 'sounds like…',
		async execute(msg, args) {
			msg.reply({
				files: [{
					attachment: './public/images/nikke/skill.gif',
                    name: 'skill.gif'
				}],
				content: `It sounds like you have some skill issues Commander.`,
			})
		}
	},
	seggs: {
		name: 'seggs?',
		async execute(msg, args) {
			msg.reply({
				files: [{
					attachment: './public/images/nikke/seggs.mp4',
                    name: 'seggs.mp4'
				}],
				content: `Wait, Shifty, what are you talking about?`,
			})
		}
	},
	kindaweird: {
		name: 'kinda weird...',
		async execute(msg, args) {
			msg.reply({
				files: [{
					attachment: './public/images/nikke/kindaweird.png',
				}],
				content: `But why, Commander?...`,
			})
		}
	},
	iswear: {
		name: 'i swear she is actually 3000 years old',
		async execute(msg, args) {
			msg.reply({
				files: [{
					attachment: './public/images/nikke/iswear.png',
                    name: 'iswear.png'
				}],
				content: `Commander... I'm calling the authorities.`,
			})
		}
	},
	teengame: {
		name: '12+ game',
		async execute(msg, args) {
			msg.reply({
				files: [{
					attachment: './public/images/nikke/12game.png',
                    name: '12game.png'
				}],
				content: `Commander the surface is obviously safe for 12 year old kids.`,
			})
		}
	},
	justice: {
		name: 'justice for...',
		async execute(msg, args) {
			// Pick image from folder
			let files = await getFiles('./public/images/justice/')
			// Get Random
			let randomMeme = files[Math.floor(Math.random() * files.length)]

			msg.reply({
				files: [{
					attachment: randomMeme.path,
                    name: randomMeme.name
				}],
				content: `Commander, let's take her out of NPC jail.`,
			})
		}
	},
	whale: {
		name: 'whale levels',
		async execute(msg, args) {
			msg.reply({
				files: [{
					attachment: './public/images/nikke/whaling.png',
                    name: 'whaling.jpg'
				}],
				content: `Commander, it's fine if you are poor.`,
			})
		}
	},
	discipline: {
		name: 'lap of discipline.',
		execute(msg, args) {
			msg.reply('Lap of discipline')
		}
	},
	goodgirl: {
		name: 'good girl',
		description: 'good girl Rapi',
		execute(msg, args) {
			msg.reply('Thank you Commander.')
		}
	},
	dammit: {
		name: 'dammit rapi',
		description: 'dammit rapi',
		execute(msg, args) {
			msg.reply('Sorry Commander.')
		}
	},
	wronggirl: {
		name: 'wrong girl',
		description: 'wrong girl Rapi',
		execute(msg, args) {
			msg.reply({
				files: [{
					attachment: './public/images/nikke/anis.png',
                    name: 'anis.jpg'
				}],
				content: `(￢з￢) Well well, so you DO see us that way, interesting!`,
			})
		}
	},
	moldRates: {
		name: 'mold rates are not that bad',
		description: `Commander, what are you talking about?`,
		execute(msg, args) {
			msg.reply({
				files: [{
					attachment: './public/images/memes/copium-cn.jpg',
                    name: 'copium-cn.jpg'
				}],
				content: `Commander, what are you talking about?`,
			})
		}
	},
	readyRapi: {
		name: 'ready rapi?',
		async execute(msg, args) {
			msg.reply({
				files: [{
					attachment: './public/images/nikke/ready.png',
                    name: 'ready.jpg'
				}],
				content: `Commander... ready for what?`,
			})
		}
	},
    contentSquad: {
        name: pre + 'content',
        description: 'content squad ping',
        execute(msg, args) {
            msg.reply(`<@&1193252857990885476> Commanders, Andersen left a new briefing, please take a look above this message.`)
		}
	},
	badgirl: {
		name: 'bad girl',
		description: 'bad girl',
		execute(msg, args) {
			msg.reply({
				files: [{
					attachment: './public/images/nikke/wrong.gif',
                    name: 'wrong.jpg'
				}],
			})
		}
	},
	reward: {
		name: 'reward?',
		description: 'reward?',
		execute(msg, args) {
			msg.reply({
				files: [{
					attachment: './public/images/nikke/reward.jpg',
                    name: 'reward.jpg'
				}],
			})
		}
	},
}

function loadCommands() {
    for (const key in botCommands) {
        console.log(`The following command was loaded successfully: ${key}`);
        bot.commands.set(botCommands[key].name, botCommands[key]);
    }
}


// Slash Commands Configuration
function loadSlashCommands() {
    const commandsPath = path.join(__dirname, "commands");
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        // Set a new item in the Collection with the key as the command name and the value as the exported module
        if ("data" in command && "execute" in command) {
            bot.commands.set(command.data.name, command);
            console.log(`The following slash command was loaded successfully: ${command.data.name}`);
        } else {
            console.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}

function registerSlashCommands() {
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
            const data = await rest.put(
                Routes.applicationCommands(CLIENTID),
                { body: commands }
            );

            console.log(
                `Successfully reloaded ${data.length} application (/) commands.`
            );
        } catch (error) {
            console.error(error);
        }
    })();
}

//TODO: Minor: Add dynamic assets for rich presence for each activity. 
function setActivity() {
    const activities = [
        { name: "SIMULATION ROOM", type: "PLAYING" },
        { name: "with Commanders' hearts", type: "PLAYING" },
        { name: "to the jukebox in Commanders' room", type: "LISTENING" },
        { name: "over the Outpost", type: "WATCHING" },
        { name: "SPECIAL ARENA", type: "PLAYING" },
    ];

    let currentActivity = 0;

    function updateActivity() {
        
        const activity = activities[currentActivity % activities.length];
        bot.user.setActivity(activity.name, { type: activity.type });
        currentActivity++;
    }

    updateActivity();

    // Create a new cron job to run every 4 hours
    const job = new CronJobb('0 0 */4 * * *', function() {
        if (getIsStreaming()) return; // Skip updating activities if streaming
        updateActivity();
    }, null, true, 'UTC');

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
    const job = new CronJobb(
        "0 */6 * * *",
        function () {
            bot.guilds.cache.forEach((guild) => {
                const channel = guild.channels.cache.find(
                    (ch) => ch.name === "nikke"
                );
                if (channel) {
                    const randomIndex = Math.floor(
                        Math.random() * randomRapiMessages.length
                    );
                    channel.send(randomRapiMessages[randomIndex]);
                }
            });
        },
        null,
        true,
        "Europe/Madrid"
    );
    job.start();
}

function sendDailyInterceptionMessage() {
    // Daily message on reset time telling people what the current special interception is
    let interceptionMessage = new CronJobb(
        "0 21 * * *",
        () => {
            try {
                bot.guilds.cache.forEach((guild) => {
                    const channel = guild.channels.cache.find(
                        (ch) => ch.name === "nikke"
                    );
                    const role = guild.roles.cache.find(
                        (role) => role.name === "Nikke"
                    );

                    if (!channel) return;

                    // Special interception bosses
                    let bosses = [
                        "Chatterbox",
                        "Modernia",
                        "Alteisen MK.VI",
                        "Grave Digger",
                        "Blacksmith",
                    ];
                    let bossesLinks = [
                        "https://lootandwaifus.com/guides/special-individual-interception-chatterbox/",
                        "https://lootandwaifus.com/guides/special-individual-interception-modernia/",
                        "https://lootandwaifus.com/guides/special-individual-interception-alteisen-mk-vi/",
                        "https://lootandwaifus.com/guides/special-individual-interception-grave-digger/",
                        "https://lootandwaifus.com/guides/special-individual-interception-blacksmith/",
                    ];
                    let tower = [
                        "Tetra",
                        "Elysion",
                        "Missilis & Pilgrim",
                        "Tetra",
                        "Elysion",
                        "Missilis",
                        "all manufacturers",
                    ];

                    const dayOfYear = (date) =>
                        Math.floor(
                            (date - new Date(date.getFullYear(), 0, 0)) /
                                1000 /
                                60 /
                                60 /
                                24
                        );
                    let currentDay = dayOfYear(new Date());
                    let fileName = "";

                    switch (currentDay % 5) {
                        case 0:
                            fileName = "chatterbox.webp";
                            break;
                        case 1:
                            fileName = "modernia.webp";
                            break;
                        case 2:
                            fileName = "train.webp";
                            break;
                        case 3:
                            fileName = "gravedigger.webp";
                            break;
                        case 4:
                            fileName = "blacksmith.webp";
                            break;
                        default:
                            fileName = "chatterbox.webp";
                            break;
                    }

                    const currentDate = new Date();
                    const currentDayOfTheWeek = currentDate.getDay();

                    let message = {
                        files: [
                            {
                                attachment: `./public/images/bosses/${fileName}`,
                                name: `${fileName}`
                            },
                        ],
                        content: `
  ${role} Commanders, here's today schedule:  

  - We have to fight **${bosses[currentDay % 5]}** in Special Interception  
  - Tribe tower is open for **${tower[currentDayOfTheWeek]}**
  - I also attach a file with tips on how to fight this Rapture if you are having issues

  ${bossesLinks[currentDay % 5]}
`,
                    };
                    // Send the message to a channel
                    channel.send(message);
                });
            } catch (error) {
                console.log(error);
            }
        },
        {
            timezone: "Europe/Madrid",
        }
    );
    interceptionMessage.start();
}

function handleMessages() {
    bot.on('messageCreate', async message => {
        // Get message from param and turn lowercase
        if (!message.guild || !message.member) {
            // If guild or member is not defined, ignore the message
            return;
        }
        const guild = message.guild;
        
        // check if we're mentioning the bot
		if (message.mentions.has(bot.user)) {
			try {
				const response = await fetch(`https://api.thecatapi.com/v1/images/search?api_key=${process.env.CATAPI}`);
				const data = await response.json();
				
				message.channel.send(`I'm busy Commander ${message.author}, but here's a cat.`);
				message.channel.send(data[0].url);
			} catch (error) {
				console.error(error);
				message.channel.send(`Did you mention me, Commander ${message.author}?`);
			}
		}
        // Establish arguments
        let args = [];
        if (message.content[0] === pre) {
            args = message.content.split(/ +/);
        } else {
            args = [message.content];
        }

        const command = args.shift().toLowerCase();

        if (!bot.commands.has(command)) return;

        try {
            const ignoredRole = guild.roles.cache.find(role => role.name === 'Grounded');
            const contentCreatorRole = guild.roles.cache.find(role => role.name === 'Content Creator');

            if (command == "/content") {
                if (contentCreatorRole && message.member.roles.cache.has(contentCreatorRole.id))
                bot.commands.get(command).execute(message, args);
                return;
            }

            if (ignoredRole && message.member.roles.cache.has(ignoredRole.id))
                return;

                bot.commands.get(command).execute(message, args);
        } catch (error) {
            console.error(error);
            message.reply('Commander, I think there is something wrong with me (something broke, please ping @sefhi to check what is going on)');
        }
    });
}

function handleAdvice() {
    // Advice Configuration
    // Dynamically loads all available files under ./advice folder. Just add a new <nikke>.js and it will be automatically added.
    // TODO: Need to add remaining Nikke Alters like Privaty Maid & Killer Wife
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
            if ( !msg.content.toLowerCase().startsWith(pre) || Object.keys(botCommands).some((cmd) => botCommands[cmd].name === userInput)) {
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
                    // Use send for sending embeds
                    return msg.channel.send({embeds: [embed]});
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
                    // Use send for sending embeds
                    msg.channel.send({embeds: [embed]});
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
// 
function handleSlashCommands(){
    bot.on(Events.InteractionCreate, async interaction => {
        if (!interaction.isChatInputCommand()) return;
    
        const command = interaction.client.commands.get(interaction.commandName);
    
        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }
    
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'Sorry Commander, there was an error while executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'Sorry Commander, there was an error while executing this command!', ephemeral: true });
            }
        }
    });
}



function initDiscordBot() {
    if (bot) new Error('Bot is already initialized, use getBot()');

    loadCommands();
    loadSlashCommands();
    registerSlashCommands();
    bot.once('ready', () => {
        setActivity();
        greetNewMembers();
        sendRandomMessages();
        sendDailyInterceptionMessage();
        handleMessages();
        handleAdvice();
        handleSlashCommands();
        console.log('Bot is ready!');
    });

    bot.login(TOKEN).catch(console.error);
}

function getDiscordBot() {
    if (bot) {
        return bot;
    } else {
        new Error('Bot is not initialized');
    }
}

module.exports = {
	initDiscordBot,
	getDiscordBot,
}