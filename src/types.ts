import { 
    SlashCommandBuilder, 
    CommandInteraction, 
    Message, 
    ChatInputCommandInteraction 
} from 'discord.js';

/**
 * Interface for Slash Commands using Discord.js v14
 */
export interface SlashCommand {
    data: SlashCommandBuilder | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

/**
 * Interface for Legacy Message Commands
 */
export interface MessageCommand {
    name: string;
    description?: string;
    execute: (message: Message) => Promise<void>;
}

/**
 * Union type for all command types
 */
export type Command = SlashCommand | MessageCommand;

/**
 * Type guard to check if a command is a slash command
 */
export function isSlashCommand(command: Command): command is SlashCommand {
    return 'data' in command;
}

/**
 * Type guard to check if a command is a message command
 */
export function isMessageCommand(command: Command): command is MessageCommand {
    return 'name' in command && !('data' in command);
}

/**
 * Error class for command handling
 */
export class CommandError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CommandError';
    }
} 