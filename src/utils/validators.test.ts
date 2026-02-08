import { describe, it, expect } from 'vitest';
import {
  validateGameId,
  validateSubscriptionMode,
  validateGameUserId,
  validateCouponCode,
  isValidGameId,
  isValidSubscriptionMode,
  ValidationError,
  Validator
} from './validators.js';

describe('validators.ts', () => {
  describe('ValidationError class', () => {
    it('should create validation error with message', () => {
      const error = new ValidationError('Test error');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('Test error');
    });

    it('should have stack trace', () => {
      const error = new ValidationError('Test');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ValidationError');
    });

    it('should be catchable', () => {
      try {
        throw new ValidationError('Test');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toBe('Test');
      }
    });
  });

  describe('validateGameId', () => {
    it('should validate bd2', () => {
      const result = validateGameId('bd2');
      expect(result).toBe('bd2');
    });

    it('should validate BD2 (case insensitive)', () => {
      const result = validateGameId('BD2');
      expect(result).toBe('bd2');
    });

    it('should validate lost-sword', () => {
      const result = validateGameId('lost-sword');
      expect(result).toBe('lost-sword');
    });

    it('should validate Lost-Sword (case insensitive)', () => {
      const result = validateGameId('Lost-Sword');
      expect(result).toBe('lost-sword');
    });

    it('should trim whitespace', () => {
      const result = validateGameId('  bd2  ');
      expect(result).toBe('bd2');
    });

    it('should throw for empty string', () => {
      expect(() => validateGameId('')).toThrow(ValidationError);
      expect(() => validateGameId('')).toThrow('Game ID is required');
    });

    it('should throw for invalid game ID', () => {
      expect(() => validateGameId('invalid')).toThrow(ValidationError);
      expect(() => validateGameId('invalid')).toThrow(/Invalid game ID/);
      expect(() => validateGameId('invalid')).toThrow(/Valid options/);
    });

    it('should throw for nikke (not yet supported)', () => {
      expect(() => validateGameId('nikke')).toThrow(ValidationError);
      expect(() => validateGameId('nikke')).toThrow(/Invalid game ID/);
    });

    it('should throw for blue-archive (not yet supported)', () => {
      expect(() => validateGameId('blue-archive')).toThrow(ValidationError);
    });

    it('should include valid options in error message', () => {
      try {
        validateGameId('foo');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as Error).message).toContain('bd2');
        expect((error as Error).message).toContain('lost-sword');
      }
    });
  });

  describe('validateSubscriptionMode', () => {
    it('should validate auto-redeem', () => {
      const result = validateSubscriptionMode('auto-redeem');
      expect(result).toBe('auto-redeem');
    });

    it('should validate Auto-Redeem (case insensitive)', () => {
      const result = validateSubscriptionMode('Auto-Redeem');
      expect(result).toBe('auto-redeem');
    });

    it('should validate notification-only', () => {
      const result = validateSubscriptionMode('notification-only');
      expect(result).toBe('notification-only');
    });

    it('should validate Notification-Only (case insensitive)', () => {
      const result = validateSubscriptionMode('Notification-Only');
      expect(result).toBe('notification-only');
    });

    it('should trim whitespace', () => {
      const result = validateSubscriptionMode('  auto-redeem  ');
      expect(result).toBe('auto-redeem');
    });

    it('should throw for empty string', () => {
      expect(() => validateSubscriptionMode('')).toThrow(ValidationError);
      expect(() => validateSubscriptionMode('')).toThrow('Subscription mode is required');
    });

    it('should throw for invalid mode', () => {
      expect(() => validateSubscriptionMode('invalid')).toThrow(ValidationError);
      expect(() => validateSubscriptionMode('invalid')).toThrow(/Invalid subscription mode/);
      expect(() => validateSubscriptionMode('invalid')).toThrow(/Valid options/);
    });

    it('should include valid options in error message', () => {
      try {
        validateSubscriptionMode('foo');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as Error).message).toContain('auto-redeem');
        expect((error as Error).message).toContain('notification-only');
      }
    });
  });

  describe('validateGameUserId', () => {
    describe('BD2 validation', () => {
      it('should validate valid BD2 nickname', () => {
        const result = validateGameUserId('bd2', 'PlayerName123');

        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.trimmedValue).toBe('PlayerName123');
      });

      it('should validate nickname with underscores', () => {
        const result = validateGameUserId('bd2', 'Player_Name_123');

        expect(result.valid).toBe(true);
        expect(result.trimmedValue).toBe('Player_Name_123');
      });

      it('should validate nickname with hyphens', () => {
        const result = validateGameUserId('bd2', 'Player-Name-123');

        expect(result.valid).toBe(true);
        expect(result.trimmedValue).toBe('Player-Name-123');
      });

      it('should trim whitespace', () => {
        const result = validateGameUserId('bd2', '  PlayerName  ');

        expect(result.valid).toBe(true);
        expect(result.trimmedValue).toBe('PlayerName');
      });

      it('should reject empty input', () => {
        const result = validateGameUserId('bd2', '');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('nickname');
        expect(result.error).toContain('cannot be empty');
      });

      it('should reject whitespace-only input', () => {
        const result = validateGameUserId('bd2', '   ');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('cannot be empty');
      });

      it('should reject nickname exceeding max length (24 chars)', () => {
        const tooLong = 'a'.repeat(25);
        const result = validateGameUserId('bd2', tooLong);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('24 characters');
      });

      it('should accept nickname at max length (24 chars)', () => {
        const maxLength = 'a'.repeat(24);
        const result = validateGameUserId('bd2', maxLength);

        expect(result.valid).toBe(true);
      });

      it('should reject nickname with spaces', () => {
        const result = validateGameUserId('bd2', 'Player Name');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('letters, numbers, underscores, and hyphens');
      });

      it('should reject nickname with special characters', () => {
        const result = validateGameUserId('bd2', 'Player@Name!');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('letters, numbers, underscores, and hyphens');
      });

      it('should reject nickname with emojis', () => {
        const result = validateGameUserId('bd2', 'Player😀Name');

        expect(result.valid).toBe(false);
      });
    });

    describe('Lost Sword validation', () => {
      it('should validate valid Lost Sword account ID', () => {
        const result = validateGameUserId('lost-sword', 'Account123');

        expect(result.valid).toBe(true);
        expect(result.trimmedValue).toBe('Account123');
      });

      it('should reject account ID exceeding max length (20 chars)', () => {
        const tooLong = 'a'.repeat(21);
        const result = validateGameUserId('lost-sword', tooLong);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('20 characters');
      });

      it('should accept account ID at max length (20 chars)', () => {
        const maxLength = 'a'.repeat(20);
        const result = validateGameUserId('lost-sword', maxLength);

        expect(result.valid).toBe(true);
      });

      it('should use correct field name in error (Account ID)', () => {
        const result = validateGameUserId('lost-sword', '');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Account ID');
      });
    });
  });

  describe('validateCouponCode', () => {
    describe('BD2 codes', () => {
      it('should validate valid coupon code', () => {
        const result = validateCouponCode('bd2', 'ABCD1234');

        expect(result.valid).toBe(true);
        expect(result.trimmedValue).toBe('ABCD1234');
      });

      it('should validate code with hyphens', () => {
        const result = validateCouponCode('bd2', 'ABCD-1234-EFGH');

        expect(result.valid).toBe(true);
        expect(result.trimmedValue).toBe('ABCD-1234-EFGH');
      });

      it('should trim whitespace', () => {
        const result = validateCouponCode('bd2', '  CODE123  ');

        expect(result.valid).toBe(true);
        expect(result.trimmedValue).toBe('CODE123');
      });

      it('should reject empty code', () => {
        const result = validateCouponCode('bd2', '');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Coupon code cannot be empty');
      });

      it('should reject code exceeding max length (30 chars)', () => {
        const tooLong = 'A'.repeat(31);
        const result = validateCouponCode('bd2', tooLong);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('30 characters');
      });

      it('should accept code at max length (30 chars)', () => {
        const maxLength = 'A'.repeat(30);
        const result = validateCouponCode('bd2', maxLength);

        expect(result.valid).toBe(true);
      });

      it('should reject code with underscores (codes only allow hyphens)', () => {
        const result = validateCouponCode('bd2', 'CODE_123');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('letters, numbers, and hyphens');
      });

      it('should reject code with spaces', () => {
        const result = validateCouponCode('bd2', 'CODE 123');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('letters, numbers, and hyphens');
      });

      it('should reject code with special characters', () => {
        const result = validateCouponCode('bd2', 'CODE@123!');

        expect(result.valid).toBe(false);
      });
    });

    describe('Lost Sword codes', () => {
      it('should validate valid Lost Sword code', () => {
        const result = validateCouponCode('lost-sword', 'LS2024');

        expect(result.valid).toBe(true);
      });

      it('should reject code exceeding max length (20 chars)', () => {
        const tooLong = 'A'.repeat(21);
        const result = validateCouponCode('lost-sword', tooLong);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('20 characters');
      });

      it('should accept code at max length (20 chars)', () => {
        const maxLength = 'A'.repeat(20);
        const result = validateCouponCode('lost-sword', maxLength);

        expect(result.valid).toBe(true);
      });
    });
  });

  describe('isValidGameId', () => {
    it('should return true for bd2', () => {
      expect(isValidGameId('bd2')).toBe(true);
    });

    it('should return true for BD2 (case insensitive)', () => {
      expect(isValidGameId('BD2')).toBe(true);
    });

    it('should return true for lost-sword', () => {
      expect(isValidGameId('lost-sword')).toBe(true);
    });

    it('should return true for Lost-Sword (case insensitive)', () => {
      expect(isValidGameId('Lost-Sword')).toBe(true);
    });

    it('should trim whitespace', () => {
      expect(isValidGameId('  bd2  ')).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isValidGameId('')).toBe(false);
    });

    it('should return false for invalid game ID', () => {
      expect(isValidGameId('invalid')).toBe(false);
    });

    it('should return false for nikke (not yet supported)', () => {
      expect(isValidGameId('nikke')).toBe(false);
    });

    it('should return false for blue-archive (not yet supported)', () => {
      expect(isValidGameId('blue-archive')).toBe(false);
    });

    it('should not throw errors', () => {
      expect(() => isValidGameId('anything')).not.toThrow();
    });
  });

  describe('isValidSubscriptionMode', () => {
    it('should return true for auto-redeem', () => {
      expect(isValidSubscriptionMode('auto-redeem')).toBe(true);
    });

    it('should return true for Auto-Redeem (case insensitive)', () => {
      expect(isValidSubscriptionMode('Auto-Redeem')).toBe(true);
    });

    it('should return true for notification-only', () => {
      expect(isValidSubscriptionMode('notification-only')).toBe(true);
    });

    it('should return true for Notification-Only (case insensitive)', () => {
      expect(isValidSubscriptionMode('Notification-Only')).toBe(true);
    });

    it('should trim whitespace', () => {
      expect(isValidSubscriptionMode('  auto-redeem  ')).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isValidSubscriptionMode('')).toBe(false);
    });

    it('should return false for invalid mode', () => {
      expect(isValidSubscriptionMode('invalid')).toBe(false);
    });

    it('should not throw errors', () => {
      expect(() => isValidSubscriptionMode('anything')).not.toThrow();
    });
  });

  describe('Validator class (class-based API)', () => {
    it('should validate game ID via class method', () => {
      const result = Validator.gameId('bd2');
      expect(result).toBe('bd2');
    });

    it('should validate subscription mode via class method', () => {
      const result = Validator.subscriptionMode('auto-redeem');
      expect(result).toBe('auto-redeem');
    });

    it('should validate game user ID via class method', () => {
      const result = Validator.gameUserId('bd2', 'PlayerName');
      expect(result.valid).toBe(true);
    });

    it('should validate coupon code via class method', () => {
      const result = Validator.couponCode('bd2', 'CODE123');
      expect(result.valid).toBe(true);
    });

    it('should check game ID validity via class method', () => {
      expect(Validator.isGameId('bd2')).toBe(true);
      expect(Validator.isGameId('invalid')).toBe(false);
    });

    it('should check subscription mode validity via class method', () => {
      expect(Validator.isSubscriptionMode('auto-redeem')).toBe(true);
      expect(Validator.isSubscriptionMode('invalid')).toBe(false);
    });

    it('should throw ValidationError for invalid input', () => {
      expect(() => Validator.gameId('invalid')).toThrow(ValidationError);
      expect(() => Validator.subscriptionMode('invalid')).toThrow(ValidationError);
    });

    it('should support method chaining pattern', () => {
      // Validators don't return this (not chainable), but they can be composed
      try {
        const gameId = Validator.gameId('bd2');
        const mode = Validator.subscriptionMode('auto-redeem');
        expect(gameId).toBe('bd2');
        expect(mode).toBe('auto-redeem');
      } catch (error) {
        // Should not throw
        throw error;
      }
    });
  });

  describe('Error handling patterns', () => {
    it('should be catchable with try-catch', () => {
      try {
        validateGameId('invalid');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
      }
    });

    it('should work with instanceof checks', () => {
      try {
        validateSubscriptionMode('invalid');
      } catch (error) {
        if (error instanceof ValidationError) {
          expect(error.message).toContain('Invalid subscription mode');
        } else {
          expect.fail('Should be ValidationError');
        }
      }
    });

    it('should preserve stack trace for debugging', () => {
      try {
        validateGameId('invalid');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as Error).stack).toBeDefined();
        expect((error as Error).stack).toContain('validators');
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle null-like values in game ID', () => {
      expect(() => validateGameId(null as any)).toThrow('Game ID is required');
      expect(() => validateGameId(undefined as any)).toThrow('Game ID is required');
    });

    it('should handle null-like values in subscription mode', () => {
      expect(() => validateSubscriptionMode(null as any)).toThrow('Subscription mode is required');
      expect(() => validateSubscriptionMode(undefined as any)).toThrow('Subscription mode is required');
    });

    it('should handle non-string values gracefully', () => {
      expect(isValidGameId(123 as any)).toBe(false);
      expect(isValidGameId({} as any)).toBe(false);
      expect(isValidGameId([] as any)).toBe(false);
    });

    it('should handle very long strings in user ID validation', () => {
      const veryLong = 'a'.repeat(1000);
      const result = validateGameUserId('bd2', veryLong);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('24 characters');
    });

    it('should handle unicode characters in user ID', () => {
      const result = validateGameUserId('bd2', 'Player名前');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('letters, numbers, underscores, and hyphens');
    });

    it('should handle only hyphens in user ID', () => {
      const result = validateGameUserId('bd2', '---');

      expect(result.valid).toBe(true); // Hyphens are allowed
      expect(result.trimmedValue).toBe('---');
    });

    it('should handle only underscores in user ID', () => {
      const result = validateGameUserId('bd2', '___');

      expect(result.valid).toBe(true); // Underscores are allowed
      expect(result.trimmedValue).toBe('___');
    });

    it('should handle numeric-only user ID', () => {
      const result = validateGameUserId('bd2', '123456');

      expect(result.valid).toBe(true);
      expect(result.trimmedValue).toBe('123456');
    });

    it('should handle numeric-only coupon code', () => {
      const result = validateCouponCode('bd2', '123456');

      expect(result.valid).toBe(true);
      expect(result.trimmedValue).toBe('123456');
    });
  });
});
