/**
 * Date utility functions
 *
 * Provides reusable date formatting, parsing, and validation utilities.
 * Consolidates date handling from redeem.ts (duplicated 8+ times).
 */

/**
 * Format date for display in en-US format
 *
 * @param dateStr - ISO date string or null
 * @returns Formatted date string or "No expiration" if null
 *
 * @example
 * formatDate('2024-12-31T00:00:00.000Z') // "Dec 31, 2024"
 * formatDate(null) // "No expiration"
 */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No expiration';

  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return 'Invalid date';
  }
}

/**
 * Format date with time
 *
 * @param dateStr - ISO date string or null
 * @returns Formatted date and time string
 */
export function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return 'No expiration';

  try {
    return new Date(dateStr).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return 'Invalid date';
  }
}

/**
 * Parse expiration date from user input
 *
 * @param input - User input (date string, "never", "none", or null)
 * @returns ISO date string or null
 * @throws Error if date format is invalid
 *
 * @example
 * parseExpirationDate('2024-12-31') // "2024-12-31T00:00:00.000Z"
 * parseExpirationDate('never') // null
 * parseExpirationDate('invalid') // throws Error
 */
export function parseExpirationDate(input: string | null | undefined): string | null {
  if (!input || input.toLowerCase() === 'never' || input.toLowerCase() === 'none') {
    return null;
  }

  const date = new Date(input);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date format. Use YYYY-MM-DD or "never".');
  }

  return date.toISOString();
}

/**
 * Check if a date is expiring soon (within threshold hours)
 *
 * @param expirationDate - ISO date string or null
 * @param hoursThreshold - Number of hours to consider "soon" (default: 24)
 * @returns true if expiring within threshold, false otherwise
 */
export function isExpiringSoon(
  expirationDate: string | null,
  hoursThreshold: number = 24
): boolean {
  if (!expirationDate) return false;

  try {
    const date = new Date(expirationDate);
    if (isNaN(date.getTime())) return false;

    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    return diffHours > 0 && diffHours <= hoursThreshold;
  } catch {
    return false;
  }
}

/**
 * Check if a date has expired
 *
 * @param expirationDate - ISO date string or null
 * @returns true if expired, false otherwise
 */
export function isExpired(expirationDate: string | null): boolean {
  if (!expirationDate) return false;

  try {
    const date = new Date(expirationDate);
    if (isNaN(date.getTime())) return false;

    return date.getTime() < Date.now();
  } catch {
    return false;
  }
}

/**
 * Get time remaining until expiration
 *
 * @param expirationDate - ISO date string or null
 * @returns Human-readable time remaining or null if no expiration
 *
 * @example
 * getTimeRemaining('2024-12-31T00:00:00.000Z') // "5 days, 3 hours"
 */
export function getTimeRemaining(expirationDate: string | null): string | null {
  if (!expirationDate) return null;

  try {
    const date = new Date(expirationDate);
    if (isNaN(date.getTime())) return 'Invalid date';

    const now = new Date();
    const diffMs = date.getTime() - now.getTime();

    if (diffMs < 0) return 'Expired';

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
      return `${days} day${days !== 1 ? 's' : ''}${hours > 0 ? `, ${hours} hour${hours !== 1 ? 's' : ''}` : ''}`;
    } else if (hours > 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''}${minutes > 0 ? `, ${minutes} min` : ''}`;
    } else {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
  } catch {
    return 'Invalid date';
  }
}

/**
 * Get expiration status with emoji indicator
 *
 * @param expirationDate - ISO date string or null
 * @returns Status string with emoji (✅ Active, ⏰ Expiring soon, ❌ Expired)
 */
export function getExpirationStatus(expirationDate: string | null): string {
  if (!expirationDate) return '✅ No expiration';

  if (isExpired(expirationDate)) {
    return '❌ Expired';
  } else if (isExpiringSoon(expirationDate, 24)) {
    return '⏰ Expiring soon';
  } else {
    return '✅ Active';
  }
}

/**
 * Validate date string format
 *
 * @param dateStr - Date string to validate
 * @returns true if valid date, false otherwise
 */
export function isValidDate(dateStr: string): boolean {
  if (!dateStr) return false;

  try {
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
  } catch {
    return false;
  }
}

/**
 * Add days to a date
 *
 * @param dateStr - ISO date string
 * @param days - Number of days to add
 * @returns New ISO date string
 */
export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

/**
 * Add hours to a date
 *
 * @param dateStr - ISO date string
 * @param hours - Number of hours to add
 * @returns New ISO date string
 */
export function addHours(dateStr: string, hours: number): string {
  const date = new Date(dateStr);
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

/**
 * DateHelper class (alternative API style)
 */
export class DateHelper {
  static format(dateStr: string | null): string {
    return formatDate(dateStr);
  }

  static formatWithTime(dateStr: string | null): string {
    return formatDateTime(dateStr);
  }

  static parseExpiration(input: string | null | undefined): string | null {
    return parseExpirationDate(input);
  }

  static isExpiringSoon(dateStr: string | null, hoursThreshold = 24): boolean {
    return isExpiringSoon(dateStr, hoursThreshold);
  }

  static isExpired(dateStr: string | null): boolean {
    return isExpired(dateStr);
  }

  static getTimeRemaining(dateStr: string | null): string | null {
    return getTimeRemaining(dateStr);
  }

  static getStatus(dateStr: string | null): string {
    return getExpirationStatus(dateStr);
  }

  static isValid(dateStr: string): boolean {
    return isValidDate(dateStr);
  }

  static addDays(dateStr: string, days: number): string {
    return addDays(dateStr, days);
  }

  static addHours(dateStr: string, hours: number): string {
    return addHours(dateStr, hours);
  }
}
