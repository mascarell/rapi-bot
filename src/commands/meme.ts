import { SlashCommandBuilder, CommandInteraction } from 'discord.js';
import { getFiles } from '../utils/getFiles';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('meme')
        .setDescription('Random general memes from the community'),
    async execute(interaction: CommandInteraction) {
        const files = await getFiles('./src/public/images/memes/');
        const randomMeme = files[Math.floor(Math.random() * files.length)];

        interaction.reply({
            files: [{
                attachment: randomMeme.path,
                name: randomMeme.name,
            }],
        });
    },
};
