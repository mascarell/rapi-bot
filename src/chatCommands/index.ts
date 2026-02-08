import { CommandRegistry, MessageCommand } from './types.js';
import { mediaCommands } from './mediaCommands.js';

/**
 * All chat commands (message-based, not slash commands)
 */
export const chatCommands: CommandRegistry = {
    ...mediaCommands,
};

/**
 * Get a chat command by name (case-insensitive)
 */
export function getChatCommand(name: string): MessageCommand | undefined {
    return chatCommands[name.toLowerCase()];
}

/**
 * Get all chat command names (lowercase)
 */
export function getChatCommandNames(): string[] {
    return Object.keys(chatCommands);
}

/**
 * Check if a command name exists in the registry
 */
export function isChatCommand(name: string): boolean {
    return name.toLowerCase() in chatCommands;
}
