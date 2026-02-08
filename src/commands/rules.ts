import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { getRulesManagementService } from '../services/rulesManagementService.js';
import { replyEphemeral } from '../utils/interactionHelpers.js';

export default {
    data: new SlashCommandBuilder()
        .setName('rules')
        .setDescription(`Rapi Rules (she'll ban you if you don't behave)`),
    async execute(interaction: ChatInputCommandInteraction) {
        const rulesService = getRulesManagementService();

        // Check if guild is allowed (from S3 config)
        const isAllowed = await rulesService.isGuildAllowed(interaction.guildId);
        if (!isAllowed) {
            await replyEphemeral(interaction, 'This command is not available on this server.');
            return;
        }

        // Display rules ephemerally (only visible to command user)
        await replyEphemeral(interaction, rulesService.getRulesContent());
    },
};
