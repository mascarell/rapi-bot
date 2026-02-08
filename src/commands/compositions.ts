import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { replyEphemeral } from '../utils/interactionHelpers.js';

export default {
    data: new SlashCommandBuilder()
        .setName('compositions')
        .setDescription('Get help for NIKKE team compositions'),
    async execute(interaction: ChatInputCommandInteraction) {
        await replyEphemeral(
            interaction,
            'Commander, if you need help planning for battle, use this ➜ https://lootandwaifus.com/nikke-team-builder/'
        );
    }
};
