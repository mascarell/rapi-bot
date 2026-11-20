/**
 * Permission helpers for Discord.js
 *
 * Provides reusable permission checking utilities. The moderator rule lives
 * here once (`isModerator`) and is shared by /mod, /redeem and commandBase.
 */

import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  GuildMember
} from 'discord.js';
import { replyEphemeral } from './interactionHelpers.js';

/** Shown to a caller who fails the moderator check. */
export const MOD_REQUIRED_MESSAGE =
  '❌ This needs the Timeout Members or Administrator permission, or a role named `mods`.';

/**
 * Whether the caller is a moderator: the server owner, Administrator, Timeout
 * Members, or a role named `mods` (case-insensitive). It's read from what
 * Discord sent with the interaction, with no API call, so autocomplete stays
 * inside its 3-second window.
 */
export function isModerator(
  interaction: ChatInputCommandInteraction | AutocompleteInteraction
): boolean {
  const guild = interaction.guild;
  if (!guild) return false;
  if (interaction.user.id === guild.ownerId) return true;

  const permissions = interaction.memberPermissions;
  if (
    permissions?.has(PermissionFlagsBits.Administrator) ||
    permissions?.has(PermissionFlagsBits.ModerateMembers)
  ) {
    return true;
  }

  const member = interaction.member;
  if (!member) return false;
  const roleIds: string[] = Array.isArray(member.roles)
    ? member.roles
    : [...member.roles.cache.keys()];
  return roleIds.some((id) => guild.roles.cache.get(id)?.name.toLowerCase() === 'mods');
}

/**
 * Check if a user is a moderator (see `isModerator`: owner, Administrator,
 * Timeout Members, or a `mods` role). Async for backwards compatibility; no
 * member fetch is needed.
 */
export async function checkModPermission(
  interaction: ChatInputCommandInteraction
): Promise<boolean> {
  return isModerator(interaction);
}

/**
 * Require mod permission - checks and replies with error if user lacks permission
 * Returns true if user has permission, false otherwise
 */
export async function requireModPermission(
  interaction: ChatInputCommandInteraction,
  customMessage?: string
): Promise<boolean> {
  const hasMod = await checkModPermission(interaction);
  if (!hasMod) {
    await replyEphemeral(interaction, customMessage || MOD_REQUIRED_MESSAGE);
  }
  return hasMod;
}

/**
 * Check if a user has a specific role by name (case-insensitive)
 */
export async function hasRole(
  interaction: ChatInputCommandInteraction,
  roleName: string
): Promise<boolean> {
  const guild = interaction.guild;
  if (!guild) return false;

  try {
    const member = await guild.members.fetch(interaction.user.id);
    return member.roles.cache.some(
      (role) => role.name.toLowerCase() === roleName.toLowerCase()
    );
  } catch (error) {
    return false;
  }
}

/**
 * Check if a user has specific Discord permissions
 */
export async function hasPermission(
  interaction: ChatInputCommandInteraction,
  permission: bigint
): Promise<boolean> {
  const guild = interaction.guild;
  if (!guild) return false;

  try {
    const member = await guild.members.fetch(interaction.user.id);
    return member.permissions.has(permission);
  } catch (error) {
    return false;
  }
}

/**
 * Check if a user has any of the specified permissions
 */
export async function hasAnyPermission(
  interaction: ChatInputCommandInteraction,
  permissions: bigint[]
): Promise<boolean> {
  const guild = interaction.guild;
  if (!guild) return false;

  try {
    const member = await guild.members.fetch(interaction.user.id);
    return permissions.some((permission) => member.permissions.has(permission));
  } catch (error) {
    return false;
  }
}

/**
 * Check if a user has all of the specified permissions
 */
export async function hasAllPermissions(
  interaction: ChatInputCommandInteraction,
  permissions: bigint[]
): Promise<boolean> {
  const guild = interaction.guild;
  if (!guild) return false;

  try {
    const member = await guild.members.fetch(interaction.user.id);
    return permissions.every((permission) => member.permissions.has(permission));
  } catch (error) {
    return false;
  }
}

/**
 * Check if user is guild owner
 */
export async function isGuildOwner(
  interaction: ChatInputCommandInteraction
): Promise<boolean> {
  const guild = interaction.guild;
  if (!guild) return false;

  return guild.ownerId === interaction.user.id;
}

/**
 * Check if user is Administrator or guild owner
 */
export async function isAdmin(
  interaction: ChatInputCommandInteraction
): Promise<boolean> {
  if (await isGuildOwner(interaction)) return true;
  return hasPermission(interaction, PermissionFlagsBits.Administrator);
}

/**
 * Get member from interaction (with error handling)
 */
export async function getMember(
  interaction: ChatInputCommandInteraction
): Promise<GuildMember | null> {
  const guild = interaction.guild;
  if (!guild) return null;

  try {
    return await guild.members.fetch(interaction.user.id);
  } catch (error) {
    return null;
  }
}

/**
 * PermissionHelper class (alternative API style)
 */
export class PermissionHelper {
  static async checkMod(interaction: ChatInputCommandInteraction): Promise<boolean> {
    return checkModPermission(interaction);
  }

  static async requireMod(
    interaction: ChatInputCommandInteraction,
    customMessage?: string
  ): Promise<boolean> {
    return requireModPermission(interaction, customMessage);
  }

  static async hasRole(
    interaction: ChatInputCommandInteraction,
    roleName: string
  ): Promise<boolean> {
    return hasRole(interaction, roleName);
  }

  static async hasPermission(
    interaction: ChatInputCommandInteraction,
    permission: bigint
  ): Promise<boolean> {
    return hasPermission(interaction, permission);
  }

  static async hasAnyPermission(
    interaction: ChatInputCommandInteraction,
    permissions: bigint[]
  ): Promise<boolean> {
    return hasAnyPermission(interaction, permissions);
  }

  static async hasAllPermissions(
    interaction: ChatInputCommandInteraction,
    permissions: bigint[]
  ): Promise<boolean> {
    return hasAllPermissions(interaction, permissions);
  }

  static async isGuildOwner(interaction: ChatInputCommandInteraction): Promise<boolean> {
    return isGuildOwner(interaction);
  }

  static async isAdmin(interaction: ChatInputCommandInteraction): Promise<boolean> {
    return isAdmin(interaction);
  }

  static async getMember(
    interaction: ChatInputCommandInteraction
  ): Promise<GuildMember | null> {
    return getMember(interaction);
  }
}
