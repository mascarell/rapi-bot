import { CommandRegistry, MessageCommand } from './types.js';
import { mediaCommands } from './mediaCommands.js';

/**
 * All chat commands (message-based, not slash commands)
 */
export const chatCommands: CommandRegistry = {
    ...mediaCommands,
};

/**
 * Type guard to check if a value is a MessageCommand
 */
function isMessageCommand(value: any): value is MessageCommand {
    return value && typeof value === 'object' && 'name' in value && 'execute' in value;
}

/**
 * Get a chat command by name (case-insensitive)
 * Falls back to searching by command.name property if direct key lookup fails
 * (handles commands with special characters like "booba?" where key is "booba")
 */
export function getChatCommand(name: string): MessageCommand | undefined {
    const lowerName = name.toLowerCase();

    // Try direct key lookup first (fast path)
    if (lowerName in chatCommands) {
        return chatCommands[lowerName];
    }

    // Fallback: search by command.name property (for names with special chars)
    for (const key in chatCommands) {
        const cmd = chatCommands[key];
        if (isMessageCommand(cmd) && cmd.name.toLowerCase() === lowerName) {
            return cmd;
        }
    }

    return undefined;
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
