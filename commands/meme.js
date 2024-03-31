// Dependencies
const { SlashCommandBuilder } = require('discord.js');
const { getFiles } = require('../utils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('meme')
        .setDescription('Random general memes from the community'),
    async execute(msg) {
        // Pick image from folder
        let files = await getFiles('./public/images/memes/')
        // Get Random
        let randomMeme = files[Math.floor(Math.random() * files.length)]
    
        msg.reply({
            files: [{
                attachment: randomMeme.path,
                name: randomMeme.name
            }]
        })
    }
}