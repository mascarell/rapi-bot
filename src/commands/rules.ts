import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType } from 'discord.js';
import { getRulesManagementService } from '../services/rulesManagementService.js';
import { replyEphemeral } from '../utils/interactionHelpers.js';
import { HOME_GUILD_ID } from '../utils/data/homeGuild.js';

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

        // The rules text belongs to the home server: its emoji, channels and owner.
        if (interaction.guildId === HOME_GUILD_ID) {
            await replyEphemeral(interaction, rulesService.getRulesContent());
            return;
        }

        const rulesChannel = interaction.guild?.channels.cache.find(
            c => c.type === ChannelType.GuildText && c.name === 'rules'
        );
        await replyEphemeral(
            interaction,
            rulesChannel
                ? `Commander, this server's rules are in <#${rulesChannel.id}>.`
                : "Commander, this server hasn't set up a #rules channel. Ask a moderator."
        );
    },
};
