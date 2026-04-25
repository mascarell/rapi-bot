/**
 * Shared message preprocessor for moderation checks.
 *
 * Used by both `sensitiveTermsChecker` (CCP/TW) and `slurModerationService`.
 * Extracted so homoglyph and cleanup patterns don't drift between callers.
 */

export interface PreprocessOptions {
    /**
     * If true, code-block contents are kept (with backticks stripped).
     * Default false matches the existing CCP behavior (code blocks deleted entirely).
     * Slur moderation enables this — code blocks are an evasion vector.
     */
    unwrapCodeBlocks?: boolean;

    /**
     * If true, spoiler-tag wrapping (||content||) is unwrapped to its inner content.
     * Default false matches existing CCP behavior (spoilers untouched).
     * Slur moderation enables this — spoiler tags are an evasion vector.
     */
    unwrapSpoilers?: boolean;
}

/**
 * Maps visually-similar Unicode characters to their ASCII Latin equivalents.
 * Covers Cyrillic, Greek, and IPA lookalikes. Fullwidth Latin and mathematical
 * alphanumeric blocks are handled via NFKC normalization (applied first).
 */
export const HOMOGLYPH_MAP: Record<string, string> = {
    // Cyrillic uppercase
    'А': 'a', 'В': 'b', 'С': 'c', 'Е': 'e',
    'Н': 'h', 'І': 'i', 'К': 'k', 'М': 'm',
    'О': 'o', 'Р': 'p', 'Т': 't', 'Х': 'x',
    'У': 'y',
    // Cyrillic lowercase
    'а': 'a', 'в': 'b', 'с': 'c', 'е': 'e',
    'н': 'h', 'і': 'i', 'к': 'k', 'м': 'm',
    'о': 'o', 'р': 'p', 'т': 't', 'х': 'x',
    'у': 'y',
    // Greek lookalikes
    'Α': 'a', 'Β': 'b', 'Ε': 'e', 'Η': 'h',
    'Ι': 'i', 'Κ': 'k', 'Μ': 'm', 'Ν': 'n',
    'Ο': 'o', 'Ρ': 'p', 'Τ': 't', 'Χ': 'x',
    'Υ': 'y', 'Ζ': 'z',
    'α': 'a', 'ε': 'e', 'ι': 'i', 'κ': 'k',
    'μ': 'm', 'ν': 'n', 'ο': 'o', 'ρ': 'p',
    'τ': 't', 'υ': 'y', 'χ': 'x',
};

const HOMOGLYPH_REGEX = new RegExp(
    `[${Object.keys(HOMOGLYPH_MAP).join('')}]`,
    'g'
);

/**
 * Zero-width and invisible formatting characters used to break up matches.
 * U+200B-200D (zero-width space/non-joiner/joiner), U+2060 (word joiner),
 * U+FEFF (BOM/zero-width no-break space).
 */
const ZERO_WIDTH_REGEX = /[​-‍⁠﻿]/g;

/**
 * Default cleanup pipeline — exact preservation of the original
 * `sensitiveTermsChecker` regexes so CCP/TW behavior is unchanged.
 * Code blocks deleted entirely; spoilers untouched.
 */
const DEFAULT_CLEANUP_PATTERNS = [
    { pattern: /https?:\/\/[^\s]+/g, replacement: '' },           // URLs
    { pattern: /<@!?\d+>/g, replacement: '' },                    // User mentions
    { pattern: /<a?:\w+:\d+>/g, replacement: '' },                // Custom emoji IDs
    { pattern: /<:\w+:\d+>/g, replacement: '' },                  // Animated emoji IDs
    { pattern: /`{1,3}[^`]*`/g, replacement: '' },                // Code blocks (delete)
    { pattern: /\*{1,2}([^*]+)\*{1,2}/g, replacement: '$1' },     // Bold/italic
    { pattern: /~~([^~]+)~~/g, replacement: '$1' },               // Strikethrough
    { pattern: /__([^_]+)__/g, replacement: '$1' },               // Underline
] as const;

/**
 * Slur-moderation cleanup pipeline (defeats more evasion).
 * Code blocks unwrapped; spoilers unwrapped.
 */
const UNWRAP_CLEANUP_PATTERNS = [
    { pattern: /https?:\/\/[^\s]+/g, replacement: '' },           // URLs
    { pattern: /<@!?\d+>/g, replacement: '' },                    // User mentions
    { pattern: /<a?:\w+:\d+>/g, replacement: '' },                // Custom emoji IDs
    { pattern: /<:\w+:\d+>/g, replacement: '' },                  // Animated emoji IDs
    { pattern: /```([^`]*)```/g, replacement: '$1' },             // Triple-backtick code (unwrap)
    { pattern: /``([^`]*)``/g, replacement: '$1' },               // Double-backtick code (unwrap)
    { pattern: /`([^`]+)`/g, replacement: '$1' },                 // Inline code (unwrap)
    { pattern: /\|\|([^|]+)\|\|/g, replacement: '$1' },           // Spoilers (unwrap)
    { pattern: /\*{1,2}([^*]+)\*{1,2}/g, replacement: '$1' },     // Bold/italic
    { pattern: /~~([^~]+)~~/g, replacement: '$1' },               // Strikethrough
    { pattern: /__([^_]+)__/g, replacement: '$1' },               // Underline
] as const;

/**
 * Re-export for external readers that want to inspect the patterns.
 */
export const MESSAGE_CLEANUP_PATTERNS = DEFAULT_CLEANUP_PATTERNS;

/**
 * Normalizes message content for moderation matching:
 *   NFKC → lowercase → homoglyph fold → zero-width strip → cleanup patterns.
 *
 * @param content - Raw message content
 * @param opts - Toggle stronger evasion handling for slur moderation
 * @returns Cleaned, normalized content
 */
export function preprocessMessage(content: string, opts: PreprocessOptions = {}): string {
    let processed = content.normalize('NFKC').toLowerCase();
    processed = processed.replace(HOMOGLYPH_REGEX, char => HOMOGLYPH_MAP[char] || char);
    processed = processed.replace(ZERO_WIDTH_REGEX, '');

    const patterns = (opts.unwrapCodeBlocks || opts.unwrapSpoilers)
        ? UNWRAP_CLEANUP_PATTERNS
        : DEFAULT_CLEANUP_PATTERNS;

    for (const { pattern, replacement } of patterns) {
        processed = processed.replace(pattern, replacement);
    }

    return processed.trim();
}
