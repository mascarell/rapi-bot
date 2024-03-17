// dependencies
const Discord = require('discord.js')
const { getFiles } = require('./utils')
// TODO: Update version for Axios to avoid security vulnerabilities.
const axios = require('axios')
const CronJobb = require('cron').CronJob
const fetch = require("node-fetch")
const path = require('path');
const fs = require('fs');

const TOKEN = process.env.WAIFUTOKEN
const pre = '/' // what we use for the bot commands (nor for all of them tho)

let bot = new Discord.Client() // the bot itself

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
	nikke: {
		name: pre + 'nikke',
		async execute(msg, args) {
			// Pick image from folder
			let files = await getFiles('./public/images/nikke/')
			// Get Random
			let randomMeme = files[Math.floor(Math.random() * files.length)]
		
			msg.reply({
				files: [{
					attachment: randomMeme.path,
				}],
				content: `- ${randomMeme.name}`,
			})
		}
	},
	meme: {
		name: pre + 'meme',
		async execute(msg, args) {
			// Pick image from folder
			let files = await getFiles('./public/images/memes/')
			// Get Random
			let randomMeme = files[Math.floor(Math.random() * files.length)]
		
			msg.reply({
				files: [{
					attachment: randomMeme.path,
				}],
				content: `- ${randomMeme.name}`,
			})
		}
	},
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
				}],
				content: `- ${randomMeme.name}`,
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
				}],
				content: `- ${randomMeme.name}`,
			})
		}
	},
	skillissue: {
		name: 'sounds like...',
		async execute(msg, args) {
			msg.reply({
				files: [{
					attachment: './public/images/nikke/skill.gif',
				}],
				content: `It sounds like you have some skill issues Commander.`,
			})
		}
	},
	skillissueiphone: {
    name: 'sounds like…',
		async execute(msg, args) {
			msg.reply({
				files: [{
					attachment: './public/images/nikke/skill.gif',
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
				}],
				content: `Commander, it's fine if you are poor.`,
			})
		}
	},
	compositions: {
		name: pre + 'compositions',
		execute(msg, args) {
			msg.channel.send('Commander, if you need help planning for battle, use this ➜ https://lootandwaifus.com/nikke-team-builder/')
		}
	},
	relics: {
		name: pre + 'relics',
		execute(msg, args) {
			msg.channel.send('Commander, if you need help finding Lost Relics this can help you ➜ https://nikke-map.onrender.com/')
		}
	},
	discipline: {
		name: 'lap of discipline.',
		execute(msg, args) {
			msg.channel.send('Lap of discipline')
		}
	},
	help: {
		name: pre + 'help',
		execute(msg, args) {
			msg.channel.send(`CUSTOM COMMANDS \n 
➜ **/help** : list of commands for all Commanders 
➜ **/meme** : random general memes from the community 
➜ **/nikke** : random Nikke memes from the community 
➜ **/relics** : get help with all lost relics in NIKKE
➜ **/<name of Nikke> list** : get full list of correct advice answers of a Nikke in NIKKE
➜ **/<name of Nikke> <term>** : get correct advice answers when typing the nikke name and search term for advice in NIKKE 
➜ **good girl** : say thanks to the best girl & bot in this server 
➜ **wrong girl** : hey, take care who you talk to  
➜ **bad girl** : we all wanted to slap her  
➜ **reward?** : 10 gems!?  
➜ **sounds like...** : you are just bad, commander  
➜ **whale levels** : how much do you spend?  
➜ **i swear she is actually 3000 years old** : what?  
➜ **ready rapi?** : 100% ready  
➜ **12+ game** : kid safe game  
➜ **booba?** : robot girl personalities  
➜ **booty?** : robot girl cakes  
➜ **kinda weird...** : tf commander...  
➜ **JUSTICE FOR...** : she doesn't belong in jail  
➜ **/compositions** : get help with your team compositions  
➜ **dammit Rapi** : 😭  
➜ **mold rates are not that bad** : 61% is enough  
➜ **seggs?** : shifty?  
➜ **Lap of discipline.** : Lap of discipline. 
`)
		}
	},
	goodgirl: {
		name: 'good girl',
		description: 'good girl Rapi',
		execute(msg, args) {
			msg.channel.send('Thank you Commander.')
		}
	},
	dammit: {
		name: 'dammit rapi',
		description: 'dammit rapi',
		execute(msg, args) {
			msg.channel.send('Sorry Commander.')
		}
	},
	wronggirl: {
		name: 'wrong girl',
		description: 'wrong girl Rapi',
		execute(msg, args) {
			msg.reply({
				files: [{
					attachment: './public/images/nikke/anis.png',
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
				}],
				content: `Commander... ready for what?`,
			})
		}
	},
  contentSquad: {
    name: pre + 'content',
    description: 'content squad ping',
    execute(msg, args) {
      msg.channel.send(`<@&1193252857990885476> Commanders, Andersen left a new briefing, please take a look above this message.`)
		}
	},
	badgirl: {
		name: 'bad girl',
		description: 'bad girl',
		execute(msg, args) {
			msg.reply({
				files: [{
					attachment: './public/images/nikke/wrong.gif',
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
				}],
			})
		}
	},
}

// Advice Configuration
// Dynamically loads all available files under ./advice folder. Just add a new <nikke>.js and it will be automatically added.
// TODO: Figure out how to handle Alters like Privaty Maid and D Killer Wife later
// TODO: Need to add remaining Nikkes (mainly some newer ones and alters)
// TODO: Add Thumbnails for each character
let characters = {};
const charactersDir = './advice';
// List of current Lolis in NIKKE
const lollipops = [ 'liter', 'signal', 'yuni', 'miranda', 'soline', 'guillotine', 'admi', 'rei']
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
bot.on('message', msg => {
    try {
        if (!msg.content.toLowerCase().startsWith(pre)) return;

        const args = msg.content.slice(pre.length).trim().split(/\s+/);
        const character = args.shift().toLowerCase();
        const searchQuery = args.join(' ').toLowerCase();

        if (!characters[character]) {
            return msg.channel.send(`Commander...Are you cheating on me? Who is ${character}? Please explain yourself.`);
        }

        if (searchQuery === 'list') {
            // TODO: Create each section to be a prepend Q: & A: for readability.
            const fullList = characters[character].join('\n\n');
            const embed = new Discord.MessageEmbed()
                .setColor('#a8bffb')
                .setTitle(`Advice List for Nikke ${character.charAt(0).toUpperCase()}${character.slice(1)}`)
                .setDescription(fullList);
            return msg.channel.send(embed);
        }

        // Find matching advice assuming `characters[character]` is an array of strings
        const matchingAdvice = characters[character].find((adviceString) => {
            // Split the string into question and answer parts
            const matchingAdviceParts = adviceString.split("\n");
            // Check if either part includes the searchQuery
            return matchingAdviceParts.some((part) => part.toLowerCase().includes(searchQuery));
        });
        
        if (matchingAdvice) {
            const adviceParts = matchingAdvice.split('\n');
            const question = adviceParts[0] || 'Question not found';
            const answer = adviceParts[1] || 'Answer not found';
            const description = lollipops.includes(character) ? 'Shame on you Commander for advising lolis...' : "Here's the answer you're looking for Commander:";
            const embed = new Discord.MessageEmbed()
                .setColor('#63ff61')
                .setTitle(`${character.charAt(0).toUpperCase()}${character.slice(1)}`)
                .setDescription(description)
                .addFields(
                    { name: 'Question:', value: question},
                    { name: 'Answer:', value: answer}
                );
            msg.channel.send(`${msg.author}`, embed);
        } else {
            msg.channel.send(`Commander, I was unable to locate the following text: "${searchQuery}". Please try again.`);
        }

    } catch (error) {
        console.error('Error processing message:', error);
        msg.channel.send('Sorry Commander, I was unable to answer your question at this time...am I still a good girl?');
    }
});


function initDiscordBot() {	
	if (bot) new Error('Bot is already initialized, use getBot()')
		
	// Set commands
	bot.commands = new Discord.Collection()
	Object.keys(botCommands).map(key => {
		bot.commands.set(botCommands[key].name, botCommands[key])
	})

	// Set the rich presence activity of the bot
	bot.on('ready', () => {
		bot.user.setActivity('SIMULATION ROOM', { type: 'PLAYING' })
	})

	// Login the bot
	bot.login(TOKEN)

	// Greet new users when they join the server
  bot.on('guildMemberAdd', member => {
    const guild = member.guild; // Get the guild from the member object
    const channel = guild.channels.cache.find(ch => ch.name === 'welcome');
    channel.send(`Welcome Commander ${member}, please take care when going to the surface.`);
  });

	// Send random messages in #nikke channel to increase engagement every 6 hours
	let nikkeMessage = new CronJobb(
		'0 */6 * * *',
		function () {
      try {
        bot.guilds.cache.forEach(guild => {
          // Find the general chat (text channel named "nikke")
          const channel = guild.channels.cache.find(ch => ch.name === 'nikke');

          // If a general chat is found, send a message
          if (!channel) return

          channel.send(randomRapiMessages[Math.floor(Math.random() * randomRapiMessages.length)]);
        })
      } catch (error) {
        console.log(error)
      }
		}, {
		timezone: 'Europe/Madrid'
	})
	nikkeMessage.start()

	// Daily message on reset time telling people what the current special interception is
	let interceptionMessage = new CronJobb(
		'0 21 * * *', () => {
      try {
        bot.guilds.cache.forEach(guild => {
          const channel = guild.channels.cache.find(ch => ch.name === 'nikke');
          const role = guild.roles.cache.find(role => role.name === 'Nikke');

          if (!channel) return;

          // Special interception bosses
          let bosses = ['Chatterbox', 'Modernia', 'Alteisen MK.VI', 'Grave Digger', 'Blacksmith']
          let bossesLinks = ['https://lootandwaifus.com/guides/special-individual-interception-chatterbox/', 'https://lootandwaifus.com/guides/special-individual-interception-modernia/', 'https://lootandwaifus.com/guides/special-individual-interception-alteisen-mk-vi/', 'https://lootandwaifus.com/guides/special-individual-interception-grave-digger/', 'https://lootandwaifus.com/guides/special-individual-interception-blacksmith/']
          let tower = ['Tetra', 'Elysion', 'Missilis & Pilgrim', 'Tetra', 'Elysion', 'Missilis', 'all manufacturers']

          const dayOfYear = date => Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
          let currentDay = dayOfYear(new Date())
          let fileName = '';

          switch ((currentDay) % 5) {
            case 0:
              fileName = 'chatterbox.webp'
              break;
            case 1:
              fileName = 'modernia.webp'
              break;
            case 2:
              fileName = 'train.webp'
              break;
            case 3:
              fileName = 'gravedigger.webp'
              break;
            case 4:
              fileName = 'blacksmith.webp'
              break;
            default:
              fileName = 'chatterbox.webp'
              break;
          }

          const currentDate = new Date();
          const currentDayOfTheWeek = currentDate.getDay();

          let message = ({
            files: [{ attachment: `./public/images/bosses/${fileName}`, }],
            content: `
  ${role} Commanders, here's today schedule:  

  - We have to fight **${bosses[(currentDay) % 5]}** in Special Interception  
  - Tribe tower is open for **${tower[(currentDayOfTheWeek)]}**
  - I also attach a file with tips on how to fight this Rapture if you are having issues

  ${bossesLinks[(currentDay) % 5]}
`,
          })
          // Send the message to a channel
          channel.send(message)
        })
      } catch (error) {
        console.log(error)
      }
		}, {
		timezone: 'Europe/Madrid'
	})
	interceptionMessage.start()

	// On message, find command and execute
	bot.on('message', async message => {
		// Get message from param and turn lowercase
    if (!message.guild || !message.member) {
      // If guild or member is not defined, ignore the message
      return;
    }

    const guild = message.guild;
    const user = guild.member(message.author.id);

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
	})
}

function getDiscordBot() {
	if (bot) {
		return bot
	} else {
		new Error('Bot is not initialized')
	}
}

module.exports = {
	initDiscordBot,
	getDiscordBot,
}