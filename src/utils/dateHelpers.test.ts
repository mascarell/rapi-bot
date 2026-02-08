import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  formatDate,
  formatDateTime,
  parseExpirationDate,
  isExpiringSoon,
  isExpired,
  getTimeRemaining,
  getExpirationStatus,
  isValidDate,
  addDays,
  addHours,
  DateHelper
} from './dateHelpers.js';

describe('dateHelpers.ts', () => {
  describe('formatDate', () => {
    it('should format valid date string', () => {
      const result = formatDate('2024-12-31T12:00:00.000Z');
      // Check it contains expected parts (timezone-independent)
      expect(result).toContain('2024');
      expect(result).toContain('Dec');
      expect(result).toMatch(/3[01]/); // Either 30 or 31 depending on timezone
    });

    it('should return "No expiration" for null', () => {
      const result = formatDate(null);
      expect(result).toBe('No expiration');
    });

    it('should handle invalid date gracefully', () => {
      const result = formatDate('invalid-date');
      expect(result).toBe('Invalid Date');
    });

    it('should format dates from different timezones consistently', () => {
      const result = formatDate('2024-06-15T12:30:00.000Z');
      expect(result).toContain('2024');
      expect(result).toContain('Jun');
      expect(result).toContain('15');
    });
  });

  describe('formatDateTime', () => {
    it('should format date with time', () => {
      const result = formatDateTime('2024-12-31T15:30:00.000Z');
      expect(result).toContain('2024');
      expect(result).toContain('Dec');
      expect(result).toContain('31');
    });

    it('should return "No expiration" for null', () => {
      const result = formatDateTime(null);
      expect(result).toBe('No expiration');
    });

    it('should handle invalid date', () => {
      const result = formatDateTime('invalid');
      expect(result).toBe('Invalid Date');
    });
  });

  describe('parseExpirationDate', () => {
    it('should parse valid date string to ISO', () => {
      const result = parseExpirationDate('2024-12-31T12:00:00Z');
      expect(result).toBeTruthy();
      const parsedDate = new Date(result!);
      expect(parsedDate.getUTCFullYear()).toBe(2024);
      expect(parsedDate.getUTCMonth()).toBe(11); // December (0-indexed)
      expect(parsedDate.getUTCDate()).toBe(31);
    });

    it('should return null for "never"', () => {
      expect(parseExpirationDate('never')).toBeNull();
      expect(parseExpirationDate('Never')).toBeNull();
      expect(parseExpirationDate('NEVER')).toBeNull();
    });

    it('should return null for "none"', () => {
      expect(parseExpirationDate('none')).toBeNull();
      expect(parseExpirationDate('None')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parseExpirationDate('')).toBeNull();
    });

    it('should return null for null input', () => {
      expect(parseExpirationDate(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(parseExpirationDate(undefined)).toBeNull();
    });

    it('should throw error for invalid date format', () => {
      expect(() => parseExpirationDate('invalid-date')).toThrow('Invalid date format');
    });

    it('should throw error for gibberish', () => {
      expect(() => parseExpirationDate('asdfghjkl')).toThrow();
    });

    it('should parse various date formats', () => {
      expect(parseExpirationDate('2024-01-15')).toBeTruthy();
      expect(parseExpirationDate('January 15, 2024')).toBeTruthy();
      expect(parseExpirationDate('01/15/2024')).toBeTruthy();
    });
  });

  describe('isExpiringSoon', () => {
    it('should return true for date expiring within default 24 hours', () => {
      const tomorrow = new Date();
      tomorrow.setHours(tomorrow.getHours() + 12);

      const result = isExpiringSoon(tomorrow.toISOString());
      expect(result).toBe(true);
    });

    it('should return false for date expiring beyond threshold', () => {
      const future = new Date();
      future.setDate(future.getDate() + 3);

      const result = isExpiringSoon(future.toISOString(), 24);
      expect(result).toBe(false);
    });

    it('should return false for already expired date', () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);

      const result = isExpiringSoon(past.toISOString());
      expect(result).toBe(false);
    });

    it('should return false for null', () => {
      const result = isExpiringSoon(null);
      expect(result).toBe(false);
    });

    it('should handle custom threshold', () => {
      const inTwoDays = new Date();
      inTwoDays.setDate(inTwoDays.getDate() + 2);

      expect(isExpiringSoon(inTwoDays.toISOString(), 24)).toBe(false);
      expect(isExpiringSoon(inTwoDays.toISOString(), 72)).toBe(true);
    });

    it('should return false for invalid date', () => {
      const result = isExpiringSoon('invalid-date');
      expect(result).toBe(false);
    });
  });

  describe('isExpired', () => {
    it('should return true for past date', () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);

      const result = isExpired(past.toISOString());
      expect(result).toBe(true);
    });

    it('should return false for future date', () => {
      const future = new Date();
      future.setDate(future.getDate() + 1);

      const result = isExpired(future.toISOString());
      expect(result).toBe(false);
    });

    it('should return false for null', () => {
      const result = isExpired(null);
      expect(result).toBe(false);
    });

    it('should return false for invalid date', () => {
      const result = isExpired('invalid-date');
      expect(result).toBe(false);
    });

    it('should handle edge case of exactly now', () => {
      const now = new Date();
      // Slightly in the past to ensure it's expired
      now.setSeconds(now.getSeconds() - 1);

      const result = isExpired(now.toISOString());
      expect(result).toBe(true);
    });
  });

  describe('getTimeRemaining', () => {
    it('should return null for null input', () => {
      const result = getTimeRemaining(null);
      expect(result).toBeNull();
    });

    it('should return "Expired" for past date', () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);

      const result = getTimeRemaining(past.toISOString());
      expect(result).toBe('Expired');
    });

    it('should return days and hours for future date', () => {
      const future = new Date();
      future.setDate(future.getDate() + 5);
      future.setHours(future.getHours() + 3);

      const result = getTimeRemaining(future.toISOString());
      expect(result).toContain('day');
      expect(result).toContain('hour');
    });

    it('should return only hours for less than a day', () => {
      const future = new Date();
      future.setHours(future.getHours() + 5);

      const result = getTimeRemaining(future.toISOString());
      expect(result).toContain('hour');
      expect(result).not.toContain('day');
    });

    it('should return only minutes for less than an hour', () => {
      const future = new Date();
      future.setMinutes(future.getMinutes() + 30);

      const result = getTimeRemaining(future.toISOString());
      expect(result).toContain('minute');
      expect(result).not.toContain('hour');
      expect(result).not.toContain('day');
    });

    it('should handle singular vs plural correctly', () => {
      const oneDayFuture = new Date();
      oneDayFuture.setDate(oneDayFuture.getDate() + 1);

      const result = getTimeRemaining(oneDayFuture.toISOString());
      expect(result).toContain('1 day');
    });

    it('should return "Invalid date" for invalid input', () => {
      const result = getTimeRemaining('invalid-date');
      expect(result).toBe('Invalid date');
    });
  });

  describe('getExpirationStatus', () => {
    it('should return "✅ No expiration" for null', () => {
      const result = getExpirationStatus(null);
      expect(result).toBe('✅ No expiration');
    });

    it('should return "❌ Expired" for expired date', () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);

      const result = getExpirationStatus(past.toISOString());
      expect(result).toBe('❌ Expired');
    });

    it('should return "⏰ Expiring soon" for date expiring within 24h', () => {
      const soon = new Date();
      soon.setHours(soon.getHours() + 12);

      const result = getExpirationStatus(soon.toISOString());
      expect(result).toBe('⏰ Expiring soon');
    });

    it('should return "✅ Active" for date beyond 24h', () => {
      const future = new Date();
      future.setDate(future.getDate() + 3);

      const result = getExpirationStatus(future.toISOString());
      expect(result).toBe('✅ Active');
    });
  });

  describe('isValidDate', () => {
    it('should return true for valid date string', () => {
      expect(isValidDate('2024-12-31')).toBe(true);
      expect(isValidDate('2024-01-01T00:00:00.000Z')).toBe(true);
      expect(isValidDate('December 31, 2024')).toBe(true);
    });

    it('should return false for invalid date string', () => {
      expect(isValidDate('invalid')).toBe(false);
      expect(isValidDate('2024-13-40')).toBe(false);
      expect(isValidDate('asdfghjkl')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidDate('')).toBe(false);
    });
  });

  describe('addDays', () => {
    it('should add positive days', () => {
      const date = '2024-01-01T12:00:00.000Z';
      const result = addDays(date, 5);

      const resultDate = new Date(result);
      expect(resultDate.getUTCDate()).toBe(6);
    });

    it('should add negative days (subtract)', () => {
      const date = '2024-01-10T12:00:00.000Z';
      const result = addDays(date, -5);

      const resultDate = new Date(result);
      expect(resultDate.getUTCDate()).toBe(5);
    });

    it('should handle month boundary', () => {
      const date = '2024-01-30T12:00:00.000Z';
      const result = addDays(date, 5);

      const resultDate = new Date(result);
      expect(resultDate.getUTCMonth()).toBe(1); // February
      expect(resultDate.getUTCDate()).toBe(4);
    });

    it('should add zero days', () => {
      const date = '2024-01-15T12:30:00.000Z';
      const result = addDays(date, 0);

      expect(new Date(result).getUTCDate()).toBe(15);
    });
  });

  describe('addHours', () => {
    it('should add positive hours', () => {
      const date = '2024-01-01T10:00:00.000Z';
      const result = addHours(date, 5);

      const resultDate = new Date(result);
      expect(resultDate.getUTCHours()).toBe(15);
    });

    it('should add negative hours (subtract)', () => {
      const date = '2024-01-01T10:00:00.000Z';
      const result = addHours(date, -3);

      const resultDate = new Date(result);
      expect(resultDate.getUTCHours()).toBe(7);
    });

    it('should handle day boundary', () => {
      const date = '2024-01-01T22:00:00.000Z';
      const result = addHours(date, 5);

      const resultDate = new Date(result);
      expect(resultDate.getUTCDate()).toBe(2);
      expect(resultDate.getUTCHours()).toBe(3);
    });

    it('should add zero hours', () => {
      const date = '2024-01-01T10:30:00.000Z';
      const result = addHours(date, 0);

      expect(new Date(result).getUTCHours()).toBe(10);
    });
  });

  describe('DateHelper class', () => {
    it('should provide static method for format', () => {
      const result = DateHelper.format('2024-12-31T12:00:00.000Z');
      expect(result).toContain('2024');
      expect(result).toContain('Dec');
    });

    it('should provide static method for formatWithTime', () => {
      const result = DateHelper.formatWithTime('2024-12-31T15:30:00.000Z');
      expect(result).toContain('2024');
    });

    it('should provide static method for parseExpiration', () => {
      const result = DateHelper.parseExpiration('2024-12-31');
      expect(result).toBeTruthy();
    });

    it('should provide static method for isExpiringSoon', () => {
      const future = new Date();
      future.setHours(future.getHours() + 12);
      const result = DateHelper.isExpiringSoon(future.toISOString());
      expect(result).toBe(true);
    });

    it('should provide static method for isExpired', () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);
      const result = DateHelper.isExpired(past.toISOString());
      expect(result).toBe(true);
    });

    it('should provide static method for getTimeRemaining', () => {
      const result = DateHelper.getTimeRemaining(null);
      expect(result).toBeNull();
    });

    it('should provide static method for getStatus', () => {
      const result = DateHelper.getStatus(null);
      expect(result).toBe('✅ No expiration');
    });

    it('should provide static method for isValid', () => {
      const result = DateHelper.isValid('2024-12-31');
      expect(result).toBe(true);
    });

    it('should provide static method for addDays', () => {
      const date = '2024-01-01T12:00:00.000Z';
      const result = DateHelper.addDays(date, 5);
      expect(new Date(result).getUTCDate()).toBe(6);
    });

    it('should provide static method for addHours', () => {
      const date = '2024-01-01T10:00:00.000Z';
      const result = DateHelper.addHours(date, 5);
      expect(new Date(result).getUTCHours()).toBe(15);
    });
  });
});
