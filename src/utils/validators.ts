/**
 * Input validation utilities
 *
 * Provides type-safe validation functions that eliminate unsafe type casts
 * across the codebase. All validators throw ValidationError on invalid input.
 */

import { GachaGameId, SubscriptionMode } from './interfaces/GachaCoupon.interface.js';
import { getGameConfig, isValidGameId as checkValidGameId } from './data/gachaGamesConfig.js';

/**
 * Custom error class for validation failures
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }
}

/**
 * Validate and return a GachaGameId
 *
 * @param value - The value to validate
 * @returns Validated game ID
 * @throws {ValidationError} If the game ID is invalid
 *
 * @example
 * ```ts
 * // Before (unsafe):
 * const gameId = interaction.options.getString('game', true) as GachaGameId;
 *
 * // After (safe):
 * const gameId = validateGameId(interaction.options.getString('game', true));
 * ```
 */
export function validateGameId(value: string): GachaGameId {
  if (!value || typeof value !== 'string') {
    throw new ValidationError('Game ID is required');
  }

  const trimmedValue = value.trim().toLowerCase();

  if (!checkValidGameId(trimmedValue)) {
    const validIds: GachaGameId[] = ['bd2', 'lost-sword'];
    throw new ValidationError(
      `Invalid game ID: "${value}". Valid options: ${validIds.join(', ')}`
    );
  }

  return trimmedValue as GachaGameId;
}

/**
 * Validate and return a SubscriptionMode
 *
 * @param value - The value to validate
 * @returns Validated subscription mode
 * @throws {ValidationError} If the subscription mode is invalid
 *
 * @example
 * ```ts
 * // Before (unsafe):
 * const mode = interaction.options.getString('mode', true) as SubscriptionMode;
 *
 * // After (safe):
 * const mode = validateSubscriptionMode(interaction.options.getString('mode', true));
 * ```
 */
export function validateSubscriptionMode(value: string): SubscriptionMode {
  if (!value || typeof value !== 'string') {
    throw new ValidationError('Subscription mode is required');
  }

  const trimmedValue = value.trim().toLowerCase();
  const validModes: SubscriptionMode[] = ['auto-redeem', 'notification-only'];

  if (!validModes.includes(trimmedValue as SubscriptionMode)) {
    throw new ValidationError(
      `Invalid subscription mode: "${value}". Valid options: ${validModes.join(', ')}`
    );
  }

  return trimmedValue as SubscriptionMode;
}

/**
 * Result of game user ID validation
 */
export interface GameUserIdValidation {
  valid: boolean;
  error?: string;
  trimmedValue?: string;
}

/**
 * Validate game user ID format
 *
 * Validates user IDs according to game-specific rules:
 * - Must not be empty
 * - Must not exceed game's max length
 * - Must contain only alphanumeric characters, underscores, and hyphens
 *
 * @param gameId - The game to validate against
 * @param userId - The user ID to validate
 * @returns Validation result with error message if invalid
 *
 * @example
 * ```ts
 * const result = validateGameUserId('bd2', userInput);
 * if (!result.valid) {
 *   await interaction.reply({ content: `❌ ${result.error}` });
 *   return;
 * }
 * // Use result.trimmedValue
 * ```
 */
export function validateGameUserId(
  gameId: GachaGameId,
  userId: string
): GameUserIdValidation {
  const config = getGameConfig(gameId);
  const trimmedId = userId.trim();

  // Check for empty input
  if (!trimmedId) {
    return {
      valid: false,
      error: `${config.userIdFieldName} cannot be empty`
    };
  }

  // Check length
  if (trimmedId.length > config.maxNicknameLength) {
    return {
      valid: false,
      error: `${config.userIdFieldName} must be ${config.maxNicknameLength} characters or less`
    };
  }

  // Check for valid characters (alphanumeric, underscores, hyphens)
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmedId)) {
    return {
      valid: false,
      error: `${config.userIdFieldName} can only contain letters, numbers, underscores, and hyphens`
    };
  }

  return {
    valid: true,
    trimmedValue: trimmedId
  };
}

/**
 * Validate coupon code format
 *
 * Validates coupon codes according to game-specific rules:
 * - Must not be empty
 * - Must not exceed game's max code length
 * - Must contain only alphanumeric characters and hyphens
 *
 * @param gameId - The game to validate against
 * @param code - The coupon code to validate
 * @returns Validation result with error message if invalid
 */
export function validateCouponCode(
  gameId: GachaGameId,
  code: string
): GameUserIdValidation {
  const config = getGameConfig(gameId);
  const trimmedCode = code.trim();

  // Check for empty input
  if (!trimmedCode) {
    return {
      valid: false,
      error: 'Coupon code cannot be empty'
    };
  }

  // Check length
  if (trimmedCode.length > config.maxCodeLength) {
    return {
      valid: false,
      error: `Coupon code must be ${config.maxCodeLength} characters or less`
    };
  }

  // Check for valid characters (alphanumeric and hyphens only for codes)
  if (!/^[a-zA-Z0-9-]+$/.test(trimmedCode)) {
    return {
      valid: false,
      error: 'Coupon code can only contain letters, numbers, and hyphens'
    };
  }

  return {
    valid: true,
    trimmedValue: trimmedCode
  };
}

/**
 * Check if a string is a valid game ID without throwing
 *
 * @param value - The value to check
 * @returns True if the value is a valid game ID
 */
export function isValidGameId(value: string): value is GachaGameId {
  if (!value || typeof value !== 'string') {
    return false;
  }
  return checkValidGameId(value.trim().toLowerCase());
}

/**
 * Check if a string is a valid subscription mode without throwing
 *
 * @param value - The value to check
 * @returns True if the value is a valid subscription mode
 */
export function isValidSubscriptionMode(value: string): value is SubscriptionMode {
  if (!value || typeof value !== 'string') {
    return false;
  }
  const trimmedValue = value.trim().toLowerCase();
  const validModes: SubscriptionMode[] = ['auto-redeem', 'notification-only'];
  return validModes.includes(trimmedValue as SubscriptionMode);
}

// ==================== Class-based API ====================

/**
 * Class-based API for validators (alternative to functional API)
 *
 * Provides the same validation functionality with a class-based interface
 * for developers who prefer object-oriented patterns.
 *
 * @example
 * ```ts
 * try {
 *   const gameId = Validator.gameId(userInput);
 *   const mode = Validator.subscriptionMode(modeInput);
 * } catch (error) {
 *   if (error instanceof ValidationError) {
 *     // Handle validation error
 *   }
 * }
 * ```
 */
export class Validator {
  /**
   * Validate game ID
   * @see validateGameId
   */
  static gameId(value: string): GachaGameId {
    return validateGameId(value);
  }

  /**
   * Validate subscription mode
   * @see validateSubscriptionMode
   */
  static subscriptionMode(value: string): SubscriptionMode {
    return validateSubscriptionMode(value);
  }

  /**
   * Validate game user ID
   * @see validateGameUserId
   */
  static gameUserId(gameId: GachaGameId, userId: string): GameUserIdValidation {
    return validateGameUserId(gameId, userId);
  }

  /**
   * Validate coupon code
   * @see validateCouponCode
   */
  static couponCode(gameId: GachaGameId, code: string): GameUserIdValidation {
    return validateCouponCode(gameId, code);
  }

  /**
   * Check if game ID is valid
   * @see isValidGameId
   */
  static isGameId(value: string): value is GachaGameId {
    return isValidGameId(value);
  }

  /**
   * Check if subscription mode is valid
   * @see isValidSubscriptionMode
   */
  static isSubscriptionMode(value: string): value is SubscriptionMode {
    return isValidSubscriptionMode(value);
  }
}
