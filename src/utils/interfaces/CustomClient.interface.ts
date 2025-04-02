import { Client, Collection } from "discord.js";
import { Command } from "./Command.interface";
/**
 * Interface for extended Discord Client with command collection
 */
export interface CustomClient extends Client {
    commands: Collection<string, Command>;
} 