import { CommandInteraction, TextChannel, ChannelType } from 'discord.js';

/**
 * Checks if the interaction is in the specified channel
 * @param interaction - The command interaction
 * @param channelName - The name of the required channel
 * @returns boolean indicating if the command is in the correct channel
 */
export function isInChannel(interaction: CommandInteraction, channelName: string): boolean {
    if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
        return false;
    }
    
    return (interaction.channel as TextChannel).name === channelName;
}

/**
 * Sends an ephemeral message if the command is not in the required channel
 * @param interaction - The command interaction
 * @param requiredChannel - The name of the required channel
 * @returns boolean indicating if the restriction was applied (true if not in channel)
 */
export async function enforceChannelRestriction(
    interaction: CommandInteraction, 
    requiredChannel: string
): Promise<boolean> {
    if (!isInChannel(interaction, requiredChannel)) {
        await interaction.reply({
            content: `Commander, this command is restricted to the **#${requiredChannel}** channel. Navigate there if you wish to proceed.`,
            ephemeral: true
        });
        return true; // Restriction was applied
    }
    return false; // No restriction needed
}