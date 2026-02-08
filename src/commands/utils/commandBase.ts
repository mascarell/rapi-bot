/**
 * Base class for Discord slash commands
 *
 * Provides common utilities and patterns used across command implementations.
 * Commands can extend this class to inherit standardized interaction handling,
 * error management, and response patterns.
 */

import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import {
  replyEphemeral,
  editReplyEphemeral,
  respondWithEmbed,
  deferEphemeral
} from '../../utils/interactionHelpers.js';
import { handleCommandError, withErrorHandling } from '../../utils/commandErrorHandler.js';
import { checkModPermission, requireModPermission } from '../../utils/permissionHelpers.js';

/**
 * Base class for command implementations
 *
 * Provides common utilities for handling Discord interactions consistently
 * across all commands. Can be used as a base class or as standalone utilities.
 *
 * @example
 * ```ts
 * class MyCommand extends CommandBase {
 *   async execute(interaction: ChatInputCommandInteraction) {
 *     if (!(await this.requireMod(interaction))) return;
 *
 *     try {
 *       // Command logic
 *       await this.replySuccess(interaction, 'Success!');
 *     } catch (error) {
 *       await this.handleError(interaction, error, 'myCommand');
 *     }
 *   }
 * }
 * ```
 */
export abstract class CommandBase {
  /**
   * Send an ephemeral reply to the user
   *
   * @param interaction - The command interaction
   * @param content - The message content
   */
  protected async replyEphemeral(
    interaction: ChatInputCommandInteraction,
    content: string
  ): Promise<void> {
    return replyEphemeral(interaction, content);
  }

  /**
   * Edit an ephemeral reply
   *
   * @param interaction - The command interaction
   * @param content - The new message content
   */
  protected async editReplyEphemeral(
    interaction: ChatInputCommandInteraction,
    content: string
  ): Promise<void> {
    return editReplyEphemeral(interaction, content);
  }

  /**
   * Respond with an embed (reply or edit based on interaction state)
   *
   * @param interaction - The command interaction
   * @param embed - The embed to send
   * @param ephemeral - Whether the response should be ephemeral (default: true)
   */
  protected async respondWithEmbed(
    interaction: ChatInputCommandInteraction,
    embed: EmbedBuilder,
    ephemeral = true
  ): Promise<void> {
    return respondWithEmbed(interaction, embed, ephemeral);
  }

  /**
   * Defer reply as ephemeral
   *
   * @param interaction - The command interaction
   */
  protected async deferEphemeral(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    return deferEphemeral(interaction);
  }

  /**
   * Send a success message (ephemeral)
   *
   * @param interaction - The command interaction
   * @param message - Success message
   */
  protected async replySuccess(
    interaction: ChatInputCommandInteraction,
    message: string
  ): Promise<void> {
    return replyEphemeral(interaction, `✅ ${message}`);
  }

  /**
   * Send an error message (ephemeral)
   *
   * @param interaction - The command interaction
   * @param message - Error message
   */
  protected async replyError(
    interaction: ChatInputCommandInteraction,
    message: string
  ): Promise<void> {
    return replyEphemeral(interaction, `❌ ${message}`);
  }

  /**
   * Handle command execution error
   *
   * @param interaction - The command interaction
   * @param error - The error that occurred
   * @param context - Additional context (e.g., command name, subcommand)
   */
  protected async handleError(
    interaction: ChatInputCommandInteraction,
    error: unknown,
    context: string
  ): Promise<void> {
    return handleCommandError(interaction, error, context);
  }

  /**
   * Check if user has mod permission
   *
   * @param interaction - The command interaction
   * @returns True if user has mod permission
   */
  protected async checkMod(
    interaction: ChatInputCommandInteraction
  ): Promise<boolean> {
    return checkModPermission(interaction);
  }

  /**
   * Require mod permission (sends error message if user lacks permission)
   *
   * @param interaction - The command interaction
   * @param customMessage - Optional custom error message
   * @returns True if user has mod permission
   */
  protected async requireMod(
    interaction: ChatInputCommandInteraction,
    customMessage?: string
  ): Promise<boolean> {
    return requireModPermission(interaction, customMessage);
  }

  /**
   * Wrap a handler function with error handling
   *
   * @param handler - The handler function to wrap
   * @param context - Context for error logging
   * @returns Wrapped handler with automatic error handling
   */
  protected wrapHandler<T extends any[]>(
    handler: (...args: T) => Promise<void>,
    context: string
  ): (...args: T) => Promise<void> {
    return withErrorHandling(handler, context);
  }
}

// ==================== Standalone Helper Functions ====================

/**
 * Create a success reply helper for a specific interaction
 *
 * @param interaction - The command interaction
 * @returns Function to send success messages
 *
 * @example
 * ```ts
 * const success = createSuccessReply(interaction);
 * await success('Operation completed!');
 * ```
 */
export function createSuccessReply(
  interaction: ChatInputCommandInteraction
): (message: string) => Promise<void> {
  return async (message: string) => {
    await replyEphemeral(interaction, `✅ ${message}`);
  };
}

/**
 * Create an error reply helper for a specific interaction
 *
 * @param interaction - The command interaction
 * @returns Function to send error messages
 *
 * @example
 * ```ts
 * const error = createErrorReply(interaction);
 * await error('Something went wrong!');
 * ```
 */
export function createErrorReply(
  interaction: ChatInputCommandInteraction
): (message: string) => Promise<void> {
  return async (message: string) => {
    await replyEphemeral(interaction, `❌ ${message}`);
  };
}

/**
 * Create command execution context with common utilities
 *
 * Provides a convenient way to access common command utilities without
 * extending the CommandBase class.
 *
 * @param interaction - The command interaction
 * @param context - Command context (name, subcommand, etc.)
 * @returns Object with utility methods
 *
 * @example
 * ```ts
 * async function execute(interaction: ChatInputCommandInteraction) {
 *   const cmd = createCommandContext(interaction, 'myCommand');
 *
 *   if (!(await cmd.requireMod())) return;
 *
 *   try {
 *     // Command logic
 *     await cmd.success('Done!');
 *   } catch (error) {
 *     await cmd.error(error);
 *   }
 * }
 * ```
 */
export function createCommandContext(
  interaction: ChatInputCommandInteraction,
  context: string
) {
  return {
    /**
     * Send ephemeral reply
     */
    reply: async (content: string) => replyEphemeral(interaction, content),

    /**
     * Edit ephemeral reply
     */
    edit: async (content: string) => editReplyEphemeral(interaction, content),

    /**
     * Respond with embed
     */
    embed: async (embed: EmbedBuilder, ephemeral = true) =>
      respondWithEmbed(interaction, embed, ephemeral),

    /**
     * Defer ephemeral reply
     */
    defer: async () => deferEphemeral(interaction),

    /**
     * Send success message
     */
    success: async (message: string) => replyEphemeral(interaction, `✅ ${message}`),

    /**
     * Send error message
     */
    error: async (errorOrMessage: unknown) => {
      if (typeof errorOrMessage === 'string') {
        await replyEphemeral(interaction, `❌ ${errorOrMessage}`);
      } else {
        await handleCommandError(interaction, errorOrMessage, context);
      }
    },

    /**
     * Check mod permission
     */
    checkMod: async () => checkModPermission(interaction),

    /**
     * Require mod permission
     */
    requireMod: async (customMessage?: string) =>
      requireModPermission(interaction, customMessage),

    /**
     * Wrap handler with error handling
     */
    wrap: <T extends any[]>(handler: (...args: T) => Promise<void>) =>
      withErrorHandling(handler, context)
  };
}

/**
 * Type for command context returned by createCommandContext
 */
export type CommandContext = ReturnType<typeof createCommandContext>;
