/**
 * Command error handling utilities
 *
 * Provides centralized error handling for Discord slash commands.
 * Eliminates 24 duplicate try-catch error handling patterns across the codebase.
 */

import {
  ChatInputCommandInteraction,
  MessageFlags,
  InteractionReplyOptions,
  InteractionEditReplyOptions
} from 'discord.js';
import { logger } from './logger.js';

/**
 * Standard error response format
 */
export interface ErrorResponse {
  message: string;
  shouldLog: boolean;
  shouldNotifyUser: boolean;
}

/**
 * Parse error into a standard format
 */
function parseError(error: unknown): ErrorResponse {
  if (error instanceof Error) {
    return {
      message: error.message,
      shouldLog: true,
      shouldNotifyUser: true
    };
  }

  if (typeof error === 'string') {
    return {
      message: error,
      shouldLog: true,
      shouldNotifyUser: true
    };
  }

  return {
    message: 'An unknown error occurred',
    shouldLog: true,
    shouldNotifyUser: true
  };
}

/**
 * Handle command execution errors with automatic logging and user notification
 *
 * @param interaction - The command interaction
 * @param error - The error that occurred
 * @param context - Additional context about where the error occurred (e.g., command name, subcommand)
 */
export async function handleCommandError(
  interaction: ChatInputCommandInteraction,
  error: unknown,
  context?: string
): Promise<void> {
  const errorResponse = parseError(error);

  // Log the error with context
  if (errorResponse.shouldLog) {
    const contextStr = context ? ` in ${context}` : '';
    logger.error`Command error${contextStr}: ${errorResponse.message}`;

    // Log stack trace if available
    if (error instanceof Error && error.stack) {
      logger.debug`Stack trace: ${error.stack}`;
    }
  }

  // Notify the user
  if (errorResponse.shouldNotifyUser) {
    await notifyUser(interaction, errorResponse.message);
  }
}

/**
 * Notify user of error (handles both replied and non-replied interactions)
 */
async function notifyUser(
  interaction: ChatInputCommandInteraction,
  message: string
): Promise<void> {
  const content = message.startsWith('❌') ? message : `❌ ${message}`;

  try {
    if (interaction.replied || interaction.deferred) {
      // Use editReply if already replied or deferred
      await interaction.editReply({ content });
    } else {
      // Use reply if not yet replied
      await interaction.reply({
        content,
        flags: MessageFlags.Ephemeral
      });
    }
  } catch (replyError) {
    // If we can't reply to the user, at least log it
    logger.error`Failed to notify user of error: ${replyError}`;
  }
}

/**
 * Wrap a command handler with error handling
 *
 * @param handler - The command handler function to wrap
 * @param context - Context for error logging
 * @returns Wrapped handler with automatic error handling
 *
 * @example
 * ```ts
 * const safeExecute = withErrorHandling(
 *   async (interaction) => {
 *     // Your command logic here
 *   },
 *   'commandName'
 * );
 * ```
 */
export function withErrorHandling<T extends any[]>(
  handler: (...args: T) => Promise<void>,
  context?: string
): (...args: T) => Promise<void> {
  return async (...args: T): Promise<void> => {
    try {
      await handler(...args);
    } catch (error) {
      // Try to find interaction in args
      const interaction = args.find(
        (arg) =>
          arg &&
          typeof arg === 'object' &&
          'reply' in arg &&
          'editReply' in arg
      ) as ChatInputCommandInteraction | undefined;

      if (interaction) {
        await handleCommandError(interaction, error, context);
      } else {
        // No interaction found, just log the error
        logger.error`Unhandled error in ${context || 'unknown context'}: ${error}`;
      }
    }
  };
}

/**
 * Create a custom error class for validation errors
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Create a custom error class for permission errors
 */
export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}

/**
 * Create a custom error class for not found errors
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * Handle specific error types with custom messages
 */
export async function handleTypedError(
  interaction: ChatInputCommandInteraction,
  error: unknown,
  context?: string
): Promise<void> {
  if (error instanceof ValidationError) {
    await notifyUser(interaction, error.message);
    logger.warn`Validation error in ${context || 'unknown'}: ${error.message}`;
  } else if (error instanceof PermissionError) {
    await notifyUser(interaction, error.message);
    logger.warn`Permission error in ${context || 'unknown'}: ${error.message}`;
  } else if (error instanceof NotFoundError) {
    await notifyUser(interaction, error.message);
    logger.info`Not found error in ${context || 'unknown'}: ${error.message}`;
  } else {
    // Fall back to standard error handling
    await handleCommandError(interaction, error, context);
  }
}

/**
 * CommandErrorHandler class (alternative API style)
 */
export class CommandErrorHandler {
  static async handle(
    interaction: ChatInputCommandInteraction,
    error: unknown,
    context?: string
  ): Promise<void> {
    return handleCommandError(interaction, error, context);
  }

  static async handleTyped(
    interaction: ChatInputCommandInteraction,
    error: unknown,
    context?: string
  ): Promise<void> {
    return handleTypedError(interaction, error, context);
  }

  static wrap<T extends any[]>(
    handler: (...args: T) => Promise<void>,
    context?: string
  ): (...args: T) => Promise<void> {
    return withErrorHandling(handler, context);
  }
}
