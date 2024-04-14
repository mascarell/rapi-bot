// Dependencies
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('compositions')
        .setDescription('Get help for NIKKE team compositions'),
    async execute(interaction) {
        interaction.reply({ content: 'Commander, if you need help planning for battle, use this ➜ https://lootandwaifus.com/nikke-team-builder/', ephemeral: true })
    }
}