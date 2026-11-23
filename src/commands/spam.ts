import {
    SlashCommandBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
    InteractionContextType,
    ChannelType,
    Guild,
} from 'discord.js';
import { SlashCommand } from '../utils/interfaces/Command.interface.js';
import { ChatCommandRateLimiter, CHAT_COMMAND_RATE_LIMIT } from '../utils/chatCommandRateLimiter.js';
import { getAssetUrls } from '../config/assets.js';
import { replyEphemeral, replyWithEmbed } from '../utils/interactionHelpers.js';
import { handleCommandError } from '../utils/commandErrorHandler.js';

const ASSET_URLS = getAssetUrls();

/**
 * Command export for Discord.js
 * Members check their own rate limit; moderator tools live only under /mod spam
 */
export default {
    data: new SlashCommandBuilder()
        .setContexts(InteractionContextType.Guild)
        .setName('spam')
        .setDescription('Check your chat command limit')
        .addSubcommand(subcommand =>
            subcommand
                .setName('check')
                .setDescription('Check your current rate limit status')
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();
        const guild = interaction.guild;
        
        if (!guild) {
            await replyEphemeral(interaction, 'This command can only be used in a server.');
            return;
        }

        try {
            switch (subcommand) {
                case 'check':
                    await this.handleCheck(interaction, guild);
                    break;
                default:
                    await replyEphemeral(interaction, 'Unknown subcommand.');
            }
        } catch (error) {
            await handleCommandError(interaction, error, 'spam');
        }
    },

    /**
     * Handles the 'check' subcommand - displays user's current rate limit status
     * 
     * @param interaction - The slash command interaction
     * @param guild - The Discord guild
     */
    async handleCheck(interaction: ChatInputCommandInteraction, guild: Guild) {
        const userId = interaction.user.id;
        const footer = {
            text: 'Stay safe on the surface, Commander!',
            iconURL: interaction.client.user?.displayAvatarURL()
        };

        // Without a #rapi-bot channel there is nowhere to send people, so the
        // message handler applies no limit at all (see messageHandler.ts).
        const hasRapiBotChannel = guild.channels.cache.some(
            channel => channel.type === ChannelType.GuildText && channel.name === 'rapi-bot'
        );
        if (!hasRapiBotChannel) {
            const noLimitEmbed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('🛡️ Spam Status')
                .setDescription(`**Commander ${interaction.user}**, there is no chat command limit in this server.`)
                .setTimestamp()
                .setFooter(footer);
            await replyWithEmbed(interaction, noLimitEmbed, true);
            return;
        }

        const remainingCommands = ChatCommandRateLimiter.getRemainingCommands(guild.id, userId);
        const summary = ChatCommandRateLimiter.getWindowSummary(guild.id, userId);
        const stats = ChatCommandRateLimiter.getUsageStats(guild.id);
        const mostUsedCommand = stats.mostSpammedCommands.length > 0 ? stats.mostSpammedCommands[0] : null;

        const fields = [
            {
                name: '📊 Commands Remaining',
                value: `${remainingCommands}/${CHAT_COMMAND_RATE_LIMIT.maxCommands}`,
                inline: true
            }
        ];
        // The window resets on the hour, so only say when once the member is blocked.
        if (remainingCommands === 0) {
            const resetAt = Math.ceil((Date.now() + ChatCommandRateLimiter.getRemainingTime(guild.id, userId)) / 1000);
            fields.push({ name: '⏰ Time Until Reset', value: `<t:${resetAt}:R>`, inline: true });
        }
        fields.push(
            {
                name: '🔥 Most Used Chat Command',
                value: mostUsedCommand ? `"${mostUsedCommand.command}" (${mostUsedCommand.count} times)` : 'None yet',
                inline: true
            },
            {
                name: '🏆 Your Usage Rank',
                value: summary.rank === null
                    ? 'No commands used this hour'
                    : `#${summary.rank} of ${summary.activeUsers} users this hour`,
                inline: true
            },
            {
                name: '📈 Server Average',
                value: `${summary.average.toFixed(1)} commands/user this hour`,
                inline: true
            }
        );

        const embed = new EmbedBuilder()
            .setColor(remainingCommands > 0 ? 0x00ff00 : 0xff0000)
            .setTitle('🛡️ Spam Status')
            .setDescription(`**Commander ${interaction.user}**, here's your current status:`)
            .addFields(fields)
            .setTimestamp()
            .setFooter(footer);
        await replyWithEmbed(interaction, embed, true);
    }
};
