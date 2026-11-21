import { SlashCommandBuilder, ChatInputCommandInteraction, InteractionContextType } from 'discord.js';
import { replyEphemeral } from '../utils/interactionHelpers.js';

export default {
    data: new SlashCommandBuilder()
        .setContexts(InteractionContextType.Guild)
        .setName('relics')
        .setDescription('Get lost relics guide in NIKKE to locate all lost relics'),
    async execute(interaction: ChatInputCommandInteraction) {
        await replyEphemeral(
            interaction,
            'Commander, if you need help finding Lost Relics this can help you ➜ https://nikke-map.onrender.com/'
        );
    }
}