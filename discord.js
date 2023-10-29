// dependencies
const Discord = require('discord.js')
const { getFiles } = require('./utils')
const axios = require('axios')
const CronJobb = require('cron').CronJob
const fetch = require("node-fetch")

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
	`Lap of discipline.`,
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
	youtube: {
		name: pre + 'youtube',
		execute(msg, args) {
			msg.channel.send('https://www.youtube.com/@lootandwaifus')
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
	rules: {
		name: pre + 'rules',
		execute(msg, args) {
			msg.channel.send(`<:sure:1056601190726651985> SERVER RULES <:sure:1056601190726651985>

➜ Try to follow the rules or you'll get banned by Rapi
➜ This is a place to chill and enjoy a community of people who share a love for the games we cover, if you can't keep conversations civil, you'll get banned
➜ Don't be a dick in general, just be chill and nice to other people
➜ Don't be racist, this includes memes with racial slurs
➜ If you want to argue with someone, go to DMs, this server / our streams are not the place
➜ Any degenerate content go to NSFW channel, that includes down bad conversations, keep the game channels related to game discussions
➜ Feel free to share your content on <#1054761687779123270>
`)
		}
	},
	help: {
		name: pre + 'help',
		execute(msg, args) {
			msg.channel.send(`<:vegesmug:1056608088037265539> CUSTOM COMMANDS <:vegesmug:1056608088037265539> \n
➜ **/rules** : follow them or you'll get banned by Rapi  
➜ **/help** : list of commands for all Commanders 
➜ **/meme** : random general memes from the community 
➜ **/nikke** : random Nikke memes from the community 
➜ **/youtube** : subscribe to the best YouTube channel 
➜ **/relics** : get help with all lost relics in NIKKE 
➜ **good girl** : say thanks to the best girl & bot in this server 
➜ **wrong girl** : hey, take care who you talk to  
➜ **bad girl** : we all wanted to slap her  
➜ **reward?** : 10 gems!?  
➜ **sounds like...** : you are just bad, commander  
➜ **fuck tencent** : no one likes this bear  
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
	fuckTencent: {
		name: 'fuck tencent',
		description: `Commander, I don't like bears`,
		execute(msg, args) {
			msg.reply({
				files: [{
					attachment: './public/images/nikke/bear.webp',
				}],
				content: `Commander, I don't like bears.`,
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
		let guild = bot.guilds.cache.get('1054761356416528475')
		const channel = guild.channels.cache.find(ch => ch.name === 'welcome')
		channel.send(`Welcome Commander ${member}, please take care when going to the surface.`)
	})

	// Send random messages in #nikke channel to increase engagement every 6 hours
	let nikkeMessage = new CronJobb(
		'0 */8 * * *',
		function () {
			let guild = bot.guilds.cache.get('1054761356416528475')
			const channel = guild.channels.cache.find(ch => ch.name === 'nikke')
			if (!channel) return
			channel.send(randomRapiMessages[Math.floor(Math.random() * randomRapiMessages.length)])
		}, {
		timezone: 'Europe/Madrid'
	})
	nikkeMessage.start()

	// Daily message on reset time telling people what the current special interception is
	let interceptionMessage = new CronJobb(
		'0 21 * * *', () => {
			let guild = bot.guilds.cache.get('1054761356416528475')
			const channel = guild.channels.cache.find(ch => ch.name === 'nikke')
			if (!channel) return

			// Special interception bosses
			let bosses = [ 'Chatterbox', 'Modernia', 'Alteisen MK.VI', 'Grave Digger', 'Blacksmith' ]
			let bossesLinks = ['https://lootandwaifus.com/guides/special-individual-interception-chatterbox/', 'https://lootandwaifus.com/guides/special-individual-interception-modernia/', 'https://lootandwaifus.com/guides/special-individual-interception-alteisen-mk-vi/', 'https://lootandwaifus.com/guides/special-individual-interception-grave-digger/', 'https://lootandwaifus.com/guides/special-individual-interception-blacksmith/' ]
			let tower = [ 'Tetra', 'Elysion', 'Missilis & Pilgrim', 'Tetra', 'Elysion', 'Missilis', 'all manufacturers' ]

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
<@&1054788720647225444> Commanders, here's today schedule:  

- We have to fight **${bosses[(currentDay) % 5]}** in Special Interception  
- Tribe tower is open for **${tower[(currentDayOfTheWeek)]}**
- I also attach a file with tips on how to fight this Rapture if you are having issues

${bossesLinks[(currentDay) % 5]}
`,
			})
			// Send the message to a channel
			channel.send(message)
		}, {
		timezone: 'Europe/Madrid'
	})
	interceptionMessage.start()

	// On message, find command and execute
	bot.on('message', async message => {
		// Get message from param and turn lowercase
		let msg = message
		let guild = bot.guilds.cache.get('1054761356416528475')
		let user = guild.member(msg.author.id)

		msg.content = message.content.toLowerCase()

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
		let args = []
		if (msg[0] === pre) {
			// if command contains prefix, get arguments
			args = msg.content.split(/ +/)
		} else {
			// else, the first argument, is the entire message
			args = [msg.content]
		}

		const command = args.shift().toLowerCase()

		if (!bot.commands.has(command)) return

		try {
			const ignoredRole = message.guild.roles.cache.find(role => role.name === 'Grounded');

			if (message.member.roles.cache.has(ignoredRole.id)) { // Ignore the message
				return; 
			} else { // do command
				bot.commands.get(command).execute(msg, args)
			}
		} catch (error) {
			console.error(error)
			msg.reply('RIP BOT BRO 💩')
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