import { CommandInteraction, ChannelType, MessageFlags } from 'discord.js';

/** The server's text channel with this name, if it has one. */
function findTextChannel(interaction: CommandInteraction, channelName: string) {
    return interaction.guild?.channels.cache.find(
        c => c.type === ChannelType.GuildText && c.name === channelName
    );
}

/**
 * Whether the interaction is in the named text channel, or in a thread inside it.
 */
export function isInChannel(interaction: CommandInteraction, channelName: string): boolean {
    const channel = interaction.channel;
    if (!channel) return false;
    const base = channel.isThread() ? channel.parent : channel;
    return !!base && base.type === ChannelType.GuildText && base.name === channelName;
}

/**
 * Refuses the command, with an ephemeral pointer, when it's used outside the
 * named channel. A server without that channel has no restriction, the same
 * rule chat commands follow for #rapi-bot.
 * @returns true if the command was refused
 */
export async function enforceChannelRestriction(
    interaction: CommandInteraction,
    requiredChannel: string
): Promise<boolean> {
    if (isInChannel(interaction, requiredChannel)) return false;
    const target = findTextChannel(interaction, requiredChannel);
    if (!target) return false;

    await interaction.reply({
        content: `Commander, this command is restricted to <#${target.id}>. Navigate there if you wish to proceed.`,
        flags: MessageFlags.Ephemeral,
    });
    return true;
}
