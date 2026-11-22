import { SlashCommandBuilder, ChatInputCommandInteraction, InteractionContextType } from 'discord.js';
import { replyEphemeral } from '../utils/interactionHelpers.js';

// Loot & Waifus retired its team builder; these are its team guides.
export default {
    data: new SlashCommandBuilder()
        .setContexts(InteractionContextType.Guild)
        .setName('compositions')
        .setDescription('Get help for NIKKE team compositions'),
    async execute(interaction: ChatInputCommandInteraction) {
        await replyEphemeral(
            interaction,
            'Commander, if you need help planning for battle:\n' +
            '• Your first team ➜ <https://lootandwaifus.com/guides/your-first-team-in-nikke/>\n' +
            '• Manufacturer tower teams ➜ <https://lootandwaifus.com/teams/nikke-manufacturer-tower-teams/>\n' +
            '• Tier list ➜ <https://lootandwaifus.com/nikke-goddess-of-victory-tier-list/>'
        );
    }
};
