// dependencies
const Discord = require('discord.js')
const { getFiles } = require('./utils')
const axios = require('axios')
const CronJobb = require('cron').CronJob

const TOKEN = process.env.WAIFUTOKEN
const pre = '/' // what we use for the bot commands (nor for all of them tho)

let bot = new Discord.Client() // the bot itself
let previousMemes = [] // tmp variable so we don't repeat memes two times in a row

const randomRapiMessages = [
	`You’re too quiet, Commander, is everything alright?`,
	`Commander, Anis was just joking with the Christmas present…`,
	`Commander! When it's the next mission?`,
	`Please take care next time you go to the surface Commander.`,
	`Don't push yourself too hard Commander!`,
	`No matter what you think of us, we'll always be by your side.`,
	`Commander, I'll protect you.`,
	`Lap of discipline.`,
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

			while (previousMemes.includes(randomMeme.path) === true){
				randomMeme = files[Math.floor(Math.random() * files.length)]
			}

			previousMemes.push(randomMeme.path)
			if (previousMemes.length > files.length / 2) {
				previousMemes.splice(0, 20)
			}
		
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

			while (previousMemes.includes(randomMeme.path) === true){
				randomMeme = files[Math.floor(Math.random() * files.length)]
			}

			previousMemes.push(randomMeme.path)
			if (previousMemes.length > files.length / 2) {
				previousMemes.splice(0, 20)
			}
		
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

			while (previousMemes.includes(randomMeme.path) === true){
				randomMeme = files[Math.floor(Math.random() * files.length)]
			}

			previousMemes.push(randomMeme.path)
			if (previousMemes.length > files.length / 2) {
				previousMemes.splice(0, 5)
			}
		
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
		name: 'justice for ade',
		async execute(msg, args) {
			msg.reply({
				files: [{
					attachment: './public/images/nikke/ade.png',
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
	rules: {
		name: pre + 'rules',
		execute(msg, args) {
			msg.channel.send(`<:sure:1056601190726651985> SERVER RULES <:sure:1056601190726651985>

➜ Try to follow the rules or you'll get banned by Rapi
➜ Don't be racist
➜ Don't be a dick in general 
➜ Feel free to share your content on <#1054761687779123270>
➜ Suggest new memes, videos or anything in <#1055127265656193044>
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
➜ **booba?** : not dragon moomy but still good  
➜ **kinda weird...** : tf commander...  
➜ **JUSTICE FOR ADE** : she doesn't belong in jail  
➜ /compositions : get help with your team compositions  
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
	wronggirl: {
		name: 'wrong girl',
		description: 'wrong girl Rapi',
		execute(msg, args) {
			msg.reply({
				files: [{
					attachment: 'https://i.imgur.com/rQPg8Ja.png',
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
					attachment: 'https://i.imgur.com/lF7i8gC.jpg',
				}],
				content: `Commander, I don't like bears.`,
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
					attachment: 'https://i.imgur.com/6htltYd.gif',
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
					attachment: 'https://i.imgur.com/sWUuYyb.jpg',
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
		// '* * * * *',
		'0 */7 * * *',
		function () {
			let guild = bot.guilds.cache.get('1054761356416528475')
			const channel = guild.channels.cache.find(ch => ch.name === 'nikke')
			if (!channel) return
			channel.send(randomRapiMessages[Math.floor(Math.random() * randomRapiMessages.length)])
		}
	)
	nikkeMessage.start()

	// On message, find command and execute
	bot.on('message', message => {
		// Get message from param and turn lowercase
		let msg = message
		let guild = bot.guilds.cache.get('1054761356416528475')
		let user = guild.member(msg.author.id)

		msg.content = message.content.toLowerCase()

		// check if we're mentioning the bot
		if (message.mentions.has(bot.user)) {
			// The bot was mentioned in the message
			message.channel.send(`Did you mention me, Commander ${message.author}?`);
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
			// Execute commands only in bot category or moderator channel
			// if (message.channel.parentID === '1054761748890132480' || message.channel.name === "moderator-only" || message.channel.name === "roles") 
				bot.commands.get(command).execute(msg, args)
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