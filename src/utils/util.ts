import gamesData from "./data/gamesData";
import { Guild, TextChannel, ChannelType, VoiceBasedChannel } from 'discord.js';
import { bosses, bossesLinks, towerRotation, rapiMessages, readNikkeMessages } from ".";
import { promises as fs } from "fs";
import path from "path";
import { Command, SlashCommand, MessageCommand } from './interfaces/Command.interface';

export { gamesData };

let isStreaming = false;
// CDN Constants
export const cdnDomainUrl = process.env.CDN_DOMAIN_URL;

export function findChannelByName(guild: Guild, channelName: string): TextChannel | undefined {
    return guild.channels.cache.find(
        (ch): ch is TextChannel => ch.type === ChannelType.GuildText && ch.name === channelName
    );
}

export function findRoleByName(guild: Guild, roleName: string) {
    return guild.roles.cache.find((role) => role.name === roleName);
}

export function logError(guildId: string, guildName: string, error: Error, context: string) {
    console.error(`[Guild ${guildId} - ${guildName}] Error in ${context}:`, error);
}

export function getVoiceChannel(guild: Guild, channelId: string): VoiceBasedChannel | undefined {
    return guild.channels.cache.get(channelId) as VoiceBasedChannel | undefined;
}

export function getBosses() {
    return bosses;
}

export function getBossesLinks() {
    return bossesLinks;
}

export function getTribeTowerRotation() {
    return towerRotation;
}

export function getRandomRapiMessage() {
    return rapiMessages[Math.floor(Math.random() * rapiMessages.length)];
}

export function getRandomReadNikkeMessage() {
    return readNikkeMessages[Math.floor(Math.random() * readNikkeMessages.length)];
}

export function getBossFileName(bossName: string) {
    return bossName === "Alteisen MK.VI" ? "train.webp" : `${bossName.toLowerCase().replace(/\s+/g, '')}.webp`;
}

export function getIsStreaming(): boolean {
    return isStreaming;
}

export function setIsStreaming(state: boolean): void {
    isStreaming = state;
}

export async function getFiles(dirPath: string): Promise<Array<{ path: string; name: string }>> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
        .filter(entry => entry.isFile())
        .map(file => ({
            path: path.join(dirPath, file.name),
            name: file.name
        }));
}

export function handleTimeoutError(msg: any, author: any) {
    msg.reply({
        content: `Something caught me off guard...Commander ${author}...`,
        files: [{
            attachment: "./src/public/images/commands/goodGirl/commander_rapi_hug.jpg",
            name: "commander_rapi_hug.jpg",
        }]
    });
}

export function handleTimeout(msg: any, duration: number = 300000) {
    const { member, author } = msg;

    // Calculating whether to timeout
    if (Math.random() < 0.5) {
        member.timeout(duration, "Commander, I need a moment of peace away from you!")
            .then(() => {
                const emojis = ["sefhistare:1124869893880283306", "❌"];
                emojis.forEach(emoji => msg.react(emoji).catch(console.error));
                
                const smugRapiMediaUrl = `${cdnDomainUrl}/commands/damnTrain/SmugRapi.jpg`;

                msg.reply({
                    content: `Honestly, Commander ${author}, can't I get a moment of peace?! Enjoy your ${duration / 60000} minutes of quiet time!`,
                    files: [smugRapiMediaUrl]
                });
            })
            .catch((error: any) => {
                console.error('Failed to timeout the user:', error);
                handleTimeoutError(msg, author);
            });
    } else {
        const rapiHugMediaUrl = `${cdnDomainUrl}/commands/goodGirl/commander_rapi_hug.jpg`;
        msg.reply({
            content: `Well, I tried to give myself a break from you, Commander ${author}...but maybe I was being too rash. Thank you, Commander...`,
            files: [rapiHugMediaUrl]
        });
    }
}

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