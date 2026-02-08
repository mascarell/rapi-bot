import { Message } from 'discord.js';
import { logger } from './logger.js';
import { logError } from './util.js';
import { getRandomCdnMediaUrl } from './cdn/mediaManager.js';
import { getCCPMessage } from './constants/messages.js';
import { SensitiveTerm } from './interfaces/SensitiveTerm.interface.js';

// Default extensions
const DEFAULT_IMAGE_EXTENSIONS = ['.gif', '.png', '.jpg', '.webp'] as const;
const DEFAULT_VIDEO_EXTENSIONS = ['.mp4'] as const;

/**
 * Sensitive terms configuration with categorization and variations
 */
const SENSITIVE_TERMS: SensitiveTerm[] = [
    // Locations
    {
        term: 'taiwan',
        variations: ['台湾', 'тайвань', '타이완', 'taiwán', 'tw'],
        category: 'location'
    },
    {
        term: 'tibet',
        variations: ['西藏', 'тибет', '티베트', 'tíbet'],
        category: 'location'
    },
    {
        term: 'hong kong',
        variations: ['hongkong', '香港', 'гонконг', '홍콩'],
        category: 'location'
    },
    // Events
    {
        term: 'tiananmen',
        variations: ['天安门', 'тяньаньмэнь', '톈안먼', 'tiananmén'],
        category: 'event'
    },
    // Dates
    {
        term: '1989',
        variations: ['一九八九'],
        category: 'date'
    }
];

/**
 * Message preprocessing options
 */
const MESSAGE_CLEANUP_PATTERNS = [
    { pattern: /https?:\/\/[^\s]+/g, replacement: '' },           // URLs
    { pattern: /<@!?\d+>/g, replacement: '' },                    // User mentions
    { pattern: /<a?:\w+:\d+>/g, replacement: '' },                // Custom emoji IDs
    { pattern: /<:\w+:\d+>/g, replacement: '' },                  // Animated emoji IDs
    { pattern: /`{1,3}[^`]*`/g, replacement: '' },                // Code blocks
    { pattern: /\*{1,2}([^*]+)\*{1,2}/g, replacement: '$1' },     // Bold/italic
    { pattern: /~~([^~]+)~~/g, replacement: '$1' },               // Strikethrough
    { pattern: /__([^_]+)__/g, replacement: '$1' }                // Underline
] as const;

/**
 * Cache for compiled regular expressions
 */
const SENSITIVE_PATTERNS = (() => {
    const patterns: RegExp[] = [];

    SENSITIVE_TERMS.forEach(termConfig => {
        const allTerms = [termConfig.term, ...(termConfig.variations || [])];
        const pattern = allTerms
            .map(term => `\\b${term.replace(/\s+/g, '\\s*')}\\b`)
            .join('|');
        patterns.push(new RegExp(pattern, 'i'));
    });

    return patterns;
})();

/**
 * Checks if a message contains sensitive terms and takes appropriate action
 * @param message - Discord message to check
 * @returns Promise<void>
 */
export async function checkSensitiveTerms(message: Message): Promise<void> {
    try {
        // Early exit conditions
        if (!message.guild?.id || !message.member) {
            return;
        }

        // Preprocess message content
        const messageContent = preprocessMessage(message.content);

        // Check for sensitive content
        if (containsSensitiveTerms(messageContent)) {
            await handleSensitiveContent(message);
        }
    } catch (error) {
        await handleError(message, error);
    }
}

/**
 * Preprocesses message content by removing formatting and unwanted patterns
 * @param content - Raw message content
 * @returns Cleaned message content
 */
function preprocessMessage(content: string): string {
    let processed = content.toLowerCase();

    MESSAGE_CLEANUP_PATTERNS.forEach(({ pattern, replacement }) => {
        processed = processed.replace(pattern, replacement);
    });

    return processed.trim();
}

/**
 * Checks if the message contains any sensitive terms
 * @param content - Preprocessed message content
 * @returns boolean indicating if sensitive terms were found
 */
function containsSensitiveTerms(content: string): boolean {
    return SENSITIVE_PATTERNS.some(pattern => pattern.test(content));
}

/**
 * Handles messages containing sensitive content
 * @param message - Discord message to handle
 */
async function handleSensitiveContent(message: Message): Promise<void> {
    const guildId = message.guild?.id;
    if (!guildId || !message.member) return;

    try {
        const randomCdnMediaUrl = await getRandomCdnMediaUrl('commands/ccp/', guildId, {
            extensions: [...DEFAULT_IMAGE_EXTENSIONS, ...DEFAULT_VIDEO_EXTENSIONS],
        });

        await Promise.all([
            message.reply({
                content: getCCPMessage(),
                files: [randomCdnMediaUrl]
            }),
            message.member.timeout(60000, 'Commander, you leave me no choice! You will be quiet for 1 minute!')
        ]);
    } catch (error) {
        throw new Error(`Failed to handle sensitive content: ${error}`);
    }
}

/**
 * Handles errors that occur during message processing
 * @param message - Discord message that caused the error
 * @param error - Error that occurred
 */
async function handleError(message: Message, error: unknown): Promise<void> {
    const guildId = message.guild?.id;
    const guildName = message.guild?.name;

    if (guildId && guildName) {
        logError(
            guildId,
            guildName,
            error instanceof Error ? error : new Error(String(error)),
            'checkSensitiveTerms'
        );
    }
}
