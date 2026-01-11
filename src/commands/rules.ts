import { SlashCommandBuilder, CommandInteraction, ChatInputCommandInteraction, PermissionFlagsBits, Role } from 'discord.js';
import { getRulesManagementService } from '../services/rulesManagementService';
import { getDiscordBot } from '../discord';

/**
 * Check if user has mod/admin permissions
 */
async function checkModPermission(interaction: ChatInputCommandInteraction): Promise<boolean> {
    const guild = interaction.guild;
    if (!guild) return false;

    const member = await guild.members.fetch(interaction.user.id);
    return member.roles.cache.some((role: Role) =>
        role.name.toLowerCase() === 'mods'
    ) || member.permissions.has(PermissionFlagsBits.Administrator);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rules')
        .setDescription(`Rapi Rules (she'll ban you if you don't behave)`)
        .addSubcommand(subcommand =>
            subcommand
                .setName('show')
                .setDescription('Display server rules')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('update')
                .setDescription('Update the rules message in #rules channel (Mod only)')
        ),
    async execute(interaction: CommandInteraction) {
        if (!interaction.isChatInputCommand()) return;

        const rulesService = getRulesManagementService();

        // Only allow on primary server
        if (interaction.guildId !== rulesService.getPrimaryGuildId()) {
            await interaction.reply({
                content: 'This command is only available on the primary server.',
                ephemeral: true,
            });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'update') {
            // Check permissions
            const hasPermission = await checkModPermission(interaction);
            if (!hasPermission) {
                await interaction.reply({
                    content: '❌ You need the `mods` role or Administrator permission to use this command.',
                    ephemeral: true
                });
                return;
            }

            await interaction.deferReply({ ephemeral: true });

            const result = await rulesService.updateRulesMessage(getDiscordBot);
            if (result.success) {
                await interaction.editReply({
                    content: '✅ Rules message updated successfully in #rules channel!',
                });
            } else {
                await interaction.editReply({
                    content: `❌ Failed to update rules message: ${result.error}`,
                });
            }
        } else {
            // Default: show rules
            await interaction.reply({
                content: rulesService.getRulesContent(),
                ephemeral: false,
            });
        }
    },
};
