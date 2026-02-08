import { Message } from 'discord.js';

/**
 * Chat command (message-based, not slash command)
 */
export interface MessageCommand {
    name: string;
    description?: string;
    execute: (msg: Message, args?: string[]) => Promise<void>;
}

/**
 * Command registry type
 */
export type CommandRegistry = Record<string, MessageCommand>;
