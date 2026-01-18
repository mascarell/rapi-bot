import { SlashCommandBuilder, CommandInteraction ,
    MessageFlags
} from 'discord.js';
import { getRulesManagementService } from '../services/rulesManagementService';

export default {
    data: new SlashCommandBuilder()
        .setName('rules')
        .setDescription(`Rapi Rules (she'll ban you if you don't behave)`),
    async execute(interaction: CommandInteraction) {
        const rulesService = getRulesManagementService();

        // Check if guild is allowed (from S3 config)
        const isAllowed = await rulesService.isGuildAllowed(interaction.guildId);
        if (!isAllowed) {
            await interaction.reply({
                content: 'This command is not available on this server.',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // Display rules ephemerally (only visible to command user)
        await interaction.reply({
            content: rulesService.getRulesContent(),
            flags: MessageFlags.Ephemeral,
        });
    },
};
