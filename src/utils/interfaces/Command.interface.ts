import { Message } from "discord.js";
import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";

/**
 * Interface for Legacy Message Commands
 */
export interface MessageCommand {
    name: string;
    description?: string;
    execute: (message: Message) => Promise<void>;
}

/**
 * Interface for Slash Commands
 */
export interface SlashCommand {
    data: SlashCommandBuilder;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
    autocomplete?: (interaction: any) => Promise<void>;
}

/**
 * Union type for all command types
 */
export type Command = SlashCommand | MessageCommand;
