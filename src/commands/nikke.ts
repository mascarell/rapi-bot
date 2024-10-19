import { SlashCommandBuilder, CommandInteraction } from 'discord.js';
import { getFiles } from '../utils';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nikke')
        .setDescription('Random Nikke memes from the community'),
    async execute(interaction: CommandInteraction) {
        const files = await getFiles('./src/public/images/nikke/');
        const randomMeme = files[Math.floor(Math.random() * files.length)];

        interaction.reply({
            files: [{
                attachment: randomMeme.path,
                name: randomMeme.name,
            }],
        });
    },
};
