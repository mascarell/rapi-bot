import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags, InteractionContextType } from 'discord.js';
import { chatCommands } from '../chatCommands/index.js';
import { isModerator } from '../utils/permissionHelpers.js';

const SLASH_COMMANDS: ReadonlyArray<[string, string]> = [
    ['/gacha', 'Pull singles or multis'],
    ['/lucky', 'How lucky are you today?'],
    ['/rapiball', "Ask Rapi a question"],
    ['/daily', 'Time until the daily reset for a game'],
    ['/redeem', 'Coupon codes: subscribe, status, codes, auto-redeem'],
    ['/compositions', 'NIKKE team compositions'],
    ['/relics', 'NIKKE lost relics guide'],
    ['/embed', 'Fix the embed for a social media link'],
    ['/rules', 'The server rules'],
    ['/stream', 'The stream link'],
    ['/spam check', 'Your chat command limit'],
    ['/age', 'How long Rapi has been running'],
];

const FIELD_LIMIT = 1024;

/** Chat command names as members type them, minus duplicate spellings. */
export function chatCommandNames(): string[] {
    const names = new Set<string>();
    for (const cmd of Object.values(chatCommands)) {
        // "sounds like…" exists only so the ellipsis character also works.
        if (cmd.name.includes('…')) continue;
        names.add(cmd.name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
}

/** Split `items` into field values that each fit Discord's 1024-character limit. */
export function packField(items: string[], separator = ' · '): string[] {
    const values: string[] = [];
    let current = '';
    for (const item of items) {
        const next = current ? `${current}${separator}${item}` : item;
        if (next.length > FIELD_LIMIT) {
            values.push(current);
            current = item;
        } else {
            current = next;
        }
    }
    if (current) values.push(current);
    return values;
}

export function buildHelpEmbed(showModTools: boolean): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('Rapi commands')
        .addFields({
            name: 'Slash commands',
            value: SLASH_COMMANDS.map(([name, what]) => `\`${name}\` ${what}`).join('\n'),
        });

    const chatValues = packField(chatCommandNames().map(n => `\`${n}\``));
    chatValues.forEach((value, i) => {
        embed.addFields({ name: i === 0 ? 'Chat commands' : 'Chat commands (cont.)', value });
    });
    embed.addFields({
        name: 'Where chat commands work',
        value: 'Type them as a message in #rapi-bot. The `ccp` ones work anywhere, 3 an hour outside #rapi-bot.',
    });

    if (showModTools) {
        embed.addFields({
            name: 'Moderators',
            value: '`/mod` has the slur list, spam stats, coupon tools and the media pool.',
        });
    }
    return embed;
}

export default {
    data: new SlashCommandBuilder()
        .setContexts(InteractionContextType.Guild)
        .setName('help')
        .setDescription('List of custom commands available for all Commanders'),
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.reply({
            embeds: [buildHelpEmbed(isModerator(interaction))],
            flags: MessageFlags.Ephemeral,
        });
    }
};
