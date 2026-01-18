import { SlashCommandBuilder, CommandInteraction ,
    MessageFlags
} from 'discord.js';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('compositions')
        .setDescription('Get help for NIKKE team compositions'),
    async execute(interaction: CommandInteraction) {
        const replyContent = 'Commander, if you need help planning for battle, use this ➜ https://lootandwaifus.com/nikke-team-builder/';
        await interaction.reply({ 
            content: replyContent, 
            flags: MessageFlags.Ephemeral 
        });
    }
};
