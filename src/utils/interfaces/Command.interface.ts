import { Message, ChatInputCommandInteraction, AutocompleteInteraction } from "discord.js";
import { SlashCommandBuilder } from "@discordjs/builders";

/**
 * Interface for Legacy Message Commands
 */
export interface MessageCommand {
    name: string;
    description?: string;
    execute: (message: Message, args?: string[]) => Promise<void>;
}

/**
 * Interface for Slash Commands
 */
export interface SlashCommand {
    data: SlashCommandBuilder;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
    autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

/**
 * Union type for all command types
 */
export type Command = SlashCommand | MessageCommand;