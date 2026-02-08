import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { CustomClient } from '../utils/interfaces/CustomClient.interface.js';
import { logger } from '../utils/logger.js';
import { logError, isSlashCommand } from '../utils/util.js';
import { getUptimeService } from '../services/uptimeService.js';

/**
 * Handle slash command interactions
 */
export async function handleSlashCommand(
    interaction: ChatInputCommandInteraction,
    bot: CustomClient
): Promise<void> {
    const command = bot.commands.get(interaction.commandName);

    if (!command) {
        logger.error`No command matching ${interaction.commandName} was found`;
        return;
    }

    try {
        if (isSlashCommand(command)) {
            // Increment command counter
            getUptimeService().incrementCommands();
            await command.execute(interaction);
        }
    } catch (error) {
        if (error instanceof Error) {
            logError(
                interaction.guildId || 'UNKNOWN',
                interaction.guild?.name || 'UNKNOWN',
                error,
                `Executing slash command: ${interaction.commandName}`
            );
        } else {
            logError(
                interaction.guildId || 'UNKNOWN',
                interaction.guild?.name || 'UNKNOWN',
                new Error(String(error)),
                `Executing slash command: ${interaction.commandName}`
            );
        }

        const errorMessage = 'Sorry Commander, there was an error while executing this command!';

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral })
                .catch(replyError => {
                    if (replyError instanceof Error) {
                        logError(
                            interaction.guildId || 'UNKNOWN',
                            interaction.guild?.name || 'UNKNOWN',
                            replyError,
                            'Sending error followUp'
                        );
                    } else {
                        logError(
                            interaction.guildId || 'UNKNOWN',
                            interaction.guild?.name || 'UNKNOWN',
                            new Error(String(replyError)),
                            'Sending error followUp'
                        );
                    }
                });
        } else {
            await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral })
                .catch(replyError => {
                    if (replyError instanceof Error) {
                        logError(
                            interaction.guildId || 'UNKNOWN',
                            interaction.guild?.name || 'UNKNOWN',
                            replyError,
                            'Sending error reply'
                        );
                    } else {
                        logError(
                            interaction.guildId || 'UNKNOWN',
                            interaction.guild?.name || 'UNKNOWN',
                            new Error(String(replyError)),
                            'Sending error reply'
                        );
                    }
                });
        }
    }
}

/**
 * Handle autocomplete interactions
 */
export async function handleAutocomplete(
    interaction: any,
    bot: CustomClient
): Promise<void> {
    const command = bot.commands.get(interaction.commandName);

    if (command && isSlashCommand(command) && typeof command.autocomplete === 'function') {
        try {
            await command.autocomplete(interaction);
        } catch (error) {
            if (error instanceof Error) {
                logError(
                    interaction.guildId || 'UNKNOWN',
                    interaction.guild?.name || 'UNKNOWN',
                    error,
                    `Autocomplete for command: ${interaction.commandName}`
                );
            } else {
                logError(
                    interaction.guildId || 'UNKNOWN',
                    interaction.guild?.name || 'UNKNOWN',
                    new Error(String(error)),
                    `Autocomplete for command: ${interaction.commandName}`
                );
            }
        }
    }
}
