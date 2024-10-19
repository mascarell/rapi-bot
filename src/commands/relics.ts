import { SlashCommandBuilder, CommandInteraction } from 'discord.js';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('relics')
        .setDescription('Get lost relics guide in NIKKE to locate all lost relics'),
    async execute(interaction: CommandInteraction) {
        interaction.reply({ content: 'Commander, if you need help finding Lost Relics this can help you ➜ https://nikke-map.onrender.com/', ephemeral: true})
    }
}