import { Client, Routes } from 'discord.js';
import { REST } from '@discordjs/rest';
import { HOME_GUILD_ID } from './data/homeGuild.js';
import { OPEN_EVERYWHERE } from '../commands/redeem.js';
import { logger } from './logger.js';

/**
 * Most slash commands are registered globally. /mod is registered per server
 * instead, so the tools that only work in the home server (media, and every
 * coupon tool but `list`) don't even show up anywhere else. The commands still
 * refuse outside the home server on their own; this only hides them.
 */
export const PER_GUILD_COMMAND = 'mod';

type CommandJson = { name: string; options?: any[]; [key: string]: unknown };

/** The /mod definition for one server. Pure, so it can be tested on its own. */
export function modCommandFor(guildId: string, full: CommandJson): CommandJson {
    if (guildId === HOME_GUILD_ID) return full;
    const options = (full.options ?? [])
        .filter(group => group.name !== 'media')
        .map(group => group.name === 'redeem'
            ? { ...group, options: (group.options ?? []).filter((sub: any) => OPEN_EVERYWHERE.has(sub.name)) }
            : group)
        .filter(group => group.type !== 2 || (group.options ?? []).length > 0);
    return { ...full, options };
}

/** Register /mod in one server. Never throws. */
export async function registerGuildCommands(rest: REST, clientId: string, guildId: string, modJson: CommandJson): Promise<void> {
    try {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [modCommandFor(guildId, modJson)] });
    } catch (error) {
        logger.error`Registering /mod in guild ${guildId} failed: ${error}`;
    }
}

/**
 * Register every command: all but /mod globally, then /mod in each server the
 * bot is in. Setting the global list without /mod also removes the old global
 * /mod, so nobody sees it twice.
 */
export async function registerAllCommands(bot: Client, rest: REST, clientId: string, commands: CommandJson[]): Promise<void> {
    const global = commands.filter(c => c.name !== PER_GUILD_COMMAND);
    const modJson = commands.find(c => c.name === PER_GUILD_COMMAND);

    await rest.put(Routes.applicationCommands(clientId), { body: global });
    if (!modJson) return;
    for (const guildId of bot.guilds.cache.keys()) {
        await registerGuildCommands(rest, clientId, guildId, modJson);
    }
}
