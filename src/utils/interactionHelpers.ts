/**
 * Interaction helpers for Discord.js
 *
 * Provides consistent patterns for common interaction response operations.
 * Eliminates duplicate code across 91+ interaction.reply patterns.
 */

import {
  ChatInputCommandInteraction,
  MessageFlags,
  EmbedBuilder,
  InteractionReplyOptions,
  InteractionEditReplyOptions
} from 'discord.js';

/**
 * Reply to an interaction with ephemeral message (visible only to user)
 */
export async function replyEphemeral(
  interaction: ChatInputCommandInteraction,
  content: string
): Promise<void> {
  await interaction.reply({
    content,
    flags: MessageFlags.Ephemeral
  });
}

/**
 * Reply to an interaction with a public message
 */
export async function replyPublic(
  interaction: ChatInputCommandInteraction,
  content: string
): Promise<void> {
  await interaction.reply({ content });
}

/**
 * Edit a deferred or already replied interaction (ephemeral)
 */
export async function editReplyEphemeral(
  interaction: ChatInputCommandInteraction,
  content: string
): Promise<void> {
  await interaction.editReply({ content });
}

/**
 * Reply to an interaction with an embed (ephemeral by default)
 */
export async function replyWithEmbed(
  interaction: ChatInputCommandInteraction,
  embed: EmbedBuilder,
  ephemeral = true
): Promise<void> {
  const options: InteractionReplyOptions = {
    embeds: [embed]
  };
  if (ephemeral) {
    options.flags = MessageFlags.Ephemeral;
  }
  await interaction.reply(options);
}

/**
 * Reply to an interaction with multiple embeds
 */
export async function replyWithEmbeds(
  interaction: ChatInputCommandInteraction,
  embeds: EmbedBuilder[],
  ephemeral = true
): Promise<void> {
  const options: InteractionReplyOptions = {
    embeds
  };
  if (ephemeral) {
    options.flags = MessageFlags.Ephemeral;
  }
  await interaction.reply(options);
}

/**
 * Defer reply with ephemeral flag (for long-running operations)
 */
export async function deferEphemeral(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
}

/**
 * Defer reply publicly
 */
export async function deferPublic(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply();
}

/**
 * Check if interaction has been replied to or deferred
 */
export function isRepliedOrDeferred(
  interaction: ChatInputCommandInteraction
): boolean {
  return interaction.replied || interaction.deferred;
}

/**
 * Reply or edit reply based on interaction state
 * Useful when you're unsure if interaction was already deferred
 */
export async function respondEphemeral(
  interaction: ChatInputCommandInteraction,
  content: string
): Promise<void> {
  if (isRepliedOrDeferred(interaction)) {
    await interaction.editReply({ content });
  } else {
    await interaction.reply({
      content,
      flags: MessageFlags.Ephemeral
    });
  }
}

/**
 * Respond with embed (handles both reply and edit)
 */
export async function respondWithEmbed(
  interaction: ChatInputCommandInteraction,
  embed: EmbedBuilder,
  ephemeral = true
): Promise<void> {
  if (isRepliedOrDeferred(interaction)) {
    const editOptions: InteractionEditReplyOptions = {
      embeds: [embed]
    };
    await interaction.editReply(editOptions);
  } else {
    const replyOptions: InteractionReplyOptions = {
      embeds: [embed]
    };
    if (ephemeral) {
      replyOptions.flags = MessageFlags.Ephemeral;
    }
    await interaction.reply(replyOptions);
  }
}

/**
 * InteractionHelper class (alternative API style)
 */
export class InteractionHelper {
  static async replyEphemeral(
    interaction: ChatInputCommandInteraction,
    content: string
  ): Promise<void> {
    return replyEphemeral(interaction, content);
  }

  static async replyPublic(
    interaction: ChatInputCommandInteraction,
    content: string
  ): Promise<void> {
    return replyPublic(interaction, content);
  }

  static async editReplyEphemeral(
    interaction: ChatInputCommandInteraction,
    content: string
  ): Promise<void> {
    return editReplyEphemeral(interaction, content);
  }

  static async replyWithEmbed(
    interaction: ChatInputCommandInteraction,
    embed: EmbedBuilder,
    ephemeral = true
  ): Promise<void> {
    return replyWithEmbed(interaction, embed, ephemeral);
  }

  static async replyWithEmbeds(
    interaction: ChatInputCommandInteraction,
    embeds: EmbedBuilder[],
    ephemeral = true
  ): Promise<void> {
    return replyWithEmbeds(interaction, embeds, ephemeral);
  }

  static async deferEphemeral(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    return deferEphemeral(interaction);
  }

  static async deferPublic(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    return deferPublic(interaction);
  }

  static isRepliedOrDeferred(
    interaction: ChatInputCommandInteraction
  ): boolean {
    return isRepliedOrDeferred(interaction);
  }

  static async respondEphemeral(
    interaction: ChatInputCommandInteraction,
    content: string
  ): Promise<void> {
    return respondEphemeral(interaction, content);
  }

  static async respondWithEmbed(
    interaction: ChatInputCommandInteraction,
    embed: EmbedBuilder,
    ephemeral = true
  ): Promise<void> {
    return respondWithEmbed(interaction, embed, ephemeral);
  }
}
