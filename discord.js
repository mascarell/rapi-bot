// dependencies
const Discord = require('discord.js')
const { getFiles } = require('./utils')
const axios = require('axios')
const CronJobb = require('cron').CronJob
const fetch = require("node-fetch")

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
	`Is it time to break Syuen ribs again, Commander?`,
	`I found a wet sock with a weird smell under your bed Commander, care to explain?`,
	`Marian please stop wearing your underwear inside out...`,
	`Commander, why do you bark every time you see Makima?`,
	`Scarlet or Modernia? What kind of question is that Commander? The answer is obvious...`,
	`I can't go out with you today Commander, there's a lot of paperwork to do.`,
	`Commander... did you really marry Sakura?`,
	`Those cookies were the snacks of Biscuit. Did you really ate them Commander?`,
	`Commander, why do you have a picture of Andersen on your wallet?`,
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
				previousMemes.splice(0, 200)
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
				previousMemes.splice(0, 200)
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
	booty: {
		name: 'booty?',
		async execute(msg, args) {
			// Pick image from folder
			let files = await getFiles('./public/images/booty/')
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
	justicenero: {
		name: 'justice for nero',
		async execute(msg, args) {
			msg.reply({
				files: [{
					attachment: './public/images/nikke/nero.png',
				}],
				content: `Commander, let's take her out of NPC jail.`,
			})
		}
	},
	justiceshifty: {
		name: 'justice for shifty',
		async execute(msg, args) {
			msg.reply({
				files: [{
					attachment: './public/images/nikke/shifty.png',
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
	// cat: {
	// 	name: pre + 'cat',
	// 	execute(msg, args) {
	// 		msg.channel.send(`https://cataas.com/cat?width=600&seed=${Math.floor(Math.random() * 1000) }`)
	// 	}
	// },
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
➜ **booba?** : robot girl personalities  
➜ **booty?** : robot girl cakes  
➜ **kinda weird...** : tf commander...  
➜ **JUSTICE FOR ADE** : she doesn't belong in jail  
➜ **JUSTICE FOR NERO** : she doesn't belong in jail  
➜ **JUSTICE FOR SHIFTY** : -9547 hit rate  
➜ **/compositions** : get help with your team compositions  
➜ **dammit Rapi** : 😭  
➜ **mold rates are not that bad** : 61% is enough  
➜ **seggs?** : shifty?  
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

// advice units
const characters = {
	admi: require('./advice/admi.js'),
	alice: require('./advice/alice.js'),
	anis: require('./advice/anis.js'),
	anne: require('./advice/anne.js'),
	aria: require('./advice/aria.js'),
	biscuit: require('./advice/biscuit.js'),
	brid: require('./advice/brid.js'),
	centi: require('./advice/centi.js'),
	cocoa: require('./advice/cocoa.js'),
	crow: require('./advice/crow.js'),
	d: require('./advice/d.js'),
	diesel: require('./advice/diesel.js'),
	dolla: require('./advice/dolla.js'),
	drake: require('./advice/drake.js'),
	emma: require('./advice/emma.js'),
	epinel: require('./advice/epinel.js'),
	eunhwa: require('./advice/eunhwa.js'),
	exia: require('./advice/exia.js'),
	folkwang: require('./advice/folkwang.js'),
	frima: require('./advice/frima.js'),
	guillotine: require('./advice/guillotine.js'),
	guilty: require('./advice/guilty.js'),
	harran: require('./advice/harran.js'),
	helm: require('./advice/helm.js'),
	isabel: require('./advice/isabel.js'),
	jackal: require('./advice/jackal.js'),
	julia: require('./advice/julia.js'),
	laplace: require('./advice/laplace.js'),
	liter: require('./advice/liter.js'),
	ludmilla: require('./advice/ludmilla.js'),
	maiden: require('./advice/maiden.js'),
	mary: require('./advice/mary.js'),
	maxwell: require('./advice/maxwell.js'),
	milk: require('./advice/milk.js'),
	miranda: require('./advice/miranda.js'),
	modernia: require('./advice/modernia.js'),
	nihilister: require('./advice/nihilister.js'),
	noah: require('./advice/noah.js'),
	noise: require('./advice/noise.js'),
	novel: require('./advice/novel.js'),
	pepper: require('./advice/pepper.js'),
	poli: require('./advice/poli.js'),
	privaty: require('./advice/privaty.js'),
	quency: require('./advice/quency.js'),
	rapunzel: require('./advice/rapunzel.js'),
	rupee: require('./advice/rupee.js'),
	rupeewinter: require('./advice/rupeewinter.js'),
	sakura: require('./advice/sakura.js'),
	scarlet: require('./advice/scarlet.js'),
	signal: require('./advice/signal.js'),
	sin: require('./advice/sin.js'),
	snowwhite: require('./advice/snowwhite.js'),
	soda: require('./advice/soda.js'),
	soline: require('./advice/soline.js'),
	sugar: require('./advice/sugar.js'),
	vesti: require('./advice/vesti.js'),
	viper: require('./advice/viper.js'),
	volume: require('./advice/volume.js'),
	yan: require('./advice/yan.js'),
	yulha: require('./advice/yulha.js'),
	yuni: require('./advice/yuni.js')
};

// advice command
bot.on('message', msg => {
	const prefix = '!';
	if (!msg.content.toLowerCase().startsWith(prefix)) return;

	const args = msg.content.slice(prefix.length).split(' ');
	const character = args[0].toLowerCase();
	const searchQuery = args.slice(1).join(' ').toLowerCase();

	if (!characters[character]) return;

	if (searchQuery === 'list') {
		const fullList = characters[character].join('\n\n');
		// const color = Math.floor(Math.random() * 16777215).toString(16);
		const embed = new Discord.MessageEmbed()
			.setColor('#fd5355')
			.setTitle(`List of advice for Nikke ${character.charAt(0).toUpperCase()}${character.slice(1)}`)
			.setDescription(fullList);
		msg.channel.send(embed);
	} else {
		const matchingText = characters[character].find(text => text.toLowerCase().includes(searchQuery.toLowerCase()));

		if (matchingText) {
			// const color = Math.floor(Math.random() * 16777215).toString(16);
			const embed = new Discord.MessageEmbed()
				.setColor('#fd5355')
				.setTitle(`${character.charAt(0).toUpperCase()}${character.slice(1)}`)
				.setDescription(matchingText);
			msg.channel.send(`${msg.author}`, embed);
		} else {
			msg.channel.send(`The text "${searchQuery}" was not found Commander.`);
		}
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
		let guild = bot.guilds.cache.get('1054761356416528475')
		const channel = guild.channels.cache.find(ch => ch.name === 'welcome')
		channel.send(`Welcome commande ${member}, please take care when going to the surface.`)
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
		'0 22 * * *', () => {
			let guild = bot.guilds.cache.get('1054761356416528475')
			const channel = guild.channels.cache.find(ch => ch.name === 'nikke')
			if (!channel) return

			// Special interception bosses
			let bosses = [ 'Chatterbox', 'Modernia', 'Alteisen MK.VI', 'Grave Digger', 'Blacksmith' ]
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