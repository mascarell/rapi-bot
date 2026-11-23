import {
    ActionRowBuilder,
    Attachment,
    AutocompleteInteraction,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    ComponentType,
    EmbedBuilder,
    Guild,
    MessageFlags,
    TextChannel,
} from 'discord.js';
import { EmbedTemplates } from '../../utils/embedTemplates.js';
import { createPaginatedMessage } from './paginationBuilder.js';
import { logger } from '../../utils/logger.js';
import { SLUR_MOD_CONFIG } from '../../utils/data/slurModerationConfig.js';
import { MEDIA_HOME_GUILD_ID, MEDIA_POOLS, MediaPoolName } from '../../utils/data/mediaPoolConfig.js';
import {
    MediaUserError,
    addMediaToPool,
    cdnUrlForKey,
    findFreeFileName,
    findPoolFile,
    getNikkeCharacters,
    listPoolFiles,
    removeMediaFromPool,
    searchCharacters,
    searchFileNames,
    validateAttachment,
} from '../../services/mediaPoolService.js';

/**
 * `/mod media add`: add a gif to the `booba?` or `booty?` pool. The /mod gate
 * has already checked the caller is a moderator; this adds the home-server
 * restriction, because the pools are shared by every server the bot is in.
 */

export const MEDIA_HOME_ONLY_MESSAGE =
    'Images for `booba?` and `booty?` are managed in the Rapi home server. Ask a moderator there to add one.';

export const isMediaHomeGuild = (guildId: string | null | undefined): boolean => guildId === MEDIA_HOME_GUILD_ID;

/** Character suggestions (display name, value = character code), home server only. */
export async function autocompleteMediaCharacter(interaction: AutocompleteInteraction): Promise<void> {
    if (!isMediaHomeGuild(interaction.guildId)) {
        await interaction.respond([]);
        return;
    }
    const focused = interaction.options.getFocused();
    const characters = await getNikkeCharacters();
    await interaction.respond(
        searchCharacters(characters, focused, 25).map(c => ({ name: c.name.slice(0, 100), value: c.code }))
    );
}

export async function handleMediaAdd(
    interaction: ChatInputCommandInteraction,
    guild: Guild,
    findModLogChannel: (guild: Guild) => TextChannel | null
): Promise<void> {
    if (!isMediaHomeGuild(interaction.guildId)) {
        await interaction.reply({ content: MEDIA_HOME_ONLY_MESSAGE, flags: MessageFlags.Ephemeral });
        return;
    }

    const poolName = interaction.options.getString('pool', true) as MediaPoolName;
    const code = interaction.options.getString('character', true);
    const attachment = interaction.options.getAttachment('image', true);
    const variant = interaction.options.getString('variant', false)?.trim() || null;
    const pool = MEDIA_POOLS[poolName];
    if (!pool) {
        await interaction.reply({ content: '❌ Unknown pool.', flags: MessageFlags.Ephemeral });
        return;
    }

    const invalid = validateAttachment(attachment);
    if (invalid) {
        await interaction.reply({ content: `❌ ${invalid}`, flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
        const characters = await getNikkeCharacters();
        const character = characters.find(c => c.code === code);
        if (!character) {
            await interaction.editReply({
                embeds: [EmbedTemplates.error('Unknown character', 'Pick a character from the suggestions.')],
            });
            return;
        }
        await confirmAndAdd(interaction, guild, {
            poolName,
            characterName: character.name,
            characterSlug: character.slug,
            variant,
            attachment,
            findModLogChannel,
        });
    } catch (error) {
        logger.error`[mod] media add failed in ${guild.id}: ${error}`;
        await interaction
            .editReply({
                content: null,
                embeds: [EmbedTemplates.error('Nothing was added', 'Something went wrong. Please try again.')],
                components: [],
            })
            .catch(() => {});
    }
}

interface AddRequest {
    poolName: MediaPoolName;
    characterName: string;
    characterSlug: string;
    variant: string | null;
    attachment: Attachment;
    findModLogChannel: (guild: Guild) => TextChannel | null;
}

async function confirmAndAdd(interaction: ChatInputCommandInteraction, guild: Guild, req: AddRequest): Promise<void> {
    const pool = MEDIA_POOLS[req.poolName];
    const plannedName = await findFreeFileName(req.poolName, req.characterSlug, req.variant);

    const addId = `modmedia_add_${interaction.id}`;
    const cancelId = `modmedia_cancel_${interaction.id}`;
    const prompt = await interaction.editReply({
        embeds: [
            EmbedTemplates.info(`Add to ${pool.label}`)
                .setImage(req.attachment.url)
                .addFields(
                    { name: 'Character', value: req.characterName, inline: true },
                    { name: 'Command', value: pool.label, inline: true },
                    { name: 'File name', value: `\`${plannedName}\``, inline: true }
                ),
        ],
        components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(addId).setLabel('Add').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(cancelId).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
            ),
        ],
    });

    let button;
    try {
        button = await prompt.awaitMessageComponent({
            componentType: ComponentType.Button,
            time: SLUR_MOD_CONFIG.CONFIRM_TIMEOUT_MS,
            filter: i => i.user.id === interaction.user.id && (i.customId === addId || i.customId === cancelId),
        });
    } catch {
        await interaction.editReply({ content: 'Timed out — nothing was added.', embeds: [], components: [] });
        return;
    }

    if (button.customId === cancelId) {
        await button.update({ content: 'Cancelled — nothing was added.', embeds: [], components: [] });
        return;
    }

    await button.deferUpdate();
    let result;
    try {
        // Picks the next free name again, in case someone else added one meanwhile.
        result = await addMediaToPool(req.poolName, req.characterSlug, req.variant, req.attachment);
    } catch (error) {
        logger.error`[mod] media upload failed in ${guild.id}: ${error}`;
        const message =
            error instanceof MediaUserError
                ? error.message
                : 'The image could not be downloaded or uploaded. Nothing was added.';
        await interaction.editReply({ content: `❌ ${message}`, embeds: [], components: [] });
        return;
    }

    await interaction.editReply({
        content: `Added \`${result.fileName}\` to \`${pool.label}\`.\n${result.url}`,
        embeds: [],
        components: [],
    });

    const channel = req.findModLogChannel(guild);
    if (!channel) return;
    try {
        await channel.send({
            embeds: [
                EmbedTemplates.info(`${pool.label} image added`)
                    .setImage(result.url)
                    .addFields(
                        { name: 'Added by', value: `${interaction.user}`, inline: true },
                        { name: 'Character', value: req.characterName, inline: true },
                        { name: 'File name', value: `\`${result.fileName}\``, inline: true }
                    ),
            ],
        });
    } catch (error) {
        logger.warn`[mod] media log post failed in ${guild.id}: ${error}`;
    }
}

const poolFrom = (interaction: ChatInputCommandInteraction | AutocompleteInteraction) => {
    const name = interaction.options.getString('pool') as MediaPoolName | null;
    return name && MEDIA_POOLS[name] ? name : null;
};

/** File name suggestions for `/mod media remove`, home server only. */
export async function autocompleteMediaFile(interaction: AutocompleteInteraction): Promise<void> {
    const poolName = poolFrom(interaction);
    if (!isMediaHomeGuild(interaction.guildId) || !poolName) {
        await interaction.respond([]);
        return;
    }
    const names = await listPoolFiles(poolName);
    await interaction.respond(
        searchFileNames(names, interaction.options.getFocused(), 25).map(n => ({ name: n.slice(0, 100), value: n }))
    );
}

/**
 * One page per file, showing the gif itself. The template's Rapi thumbnail is
 * dropped: next to a file name it read as a preview of that file.
 */
export function buildListPages(title: string, prefix: string, names: string[]): EmbedBuilder[] {
    const total = `${names.length} file${names.length === 1 ? '' : 's'} in total`;
    return names.map(name => {
        const url = cdnUrlForKey(`${prefix}${name}`);
        // The link opens the original file, so a mod can view it full size
        // or save it; clicking the image in Discord does the same.
        return EmbedTemplates.info(title)
            .setThumbnail(null)
            .setURL(url)
            .setDescription(`\`${name}\`\n[Open / download](${url})`)
            .setImage(url)
            .setFooter({ text: total });
    });
}

export async function handleMediaList(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    if (!isMediaHomeGuild(interaction.guildId)) {
        await interaction.reply({ content: MEDIA_HOME_ONLY_MESSAGE, flags: MessageFlags.Ephemeral });
        return;
    }
    const poolName = poolFrom(interaction);
    if (!poolName) {
        await interaction.reply({ content: '❌ Unknown pool.', flags: MessageFlags.Ephemeral });
        return;
    }
    const code = interaction.options.getString('character', false);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
        const pool = MEDIA_POOLS[poolName];
        let character = null;
        if (code) {
            character = (await getNikkeCharacters()).find(c => c.code === code) ?? null;
            if (!character) {
                await interaction.editReply({
                    embeds: [EmbedTemplates.error('Unknown character', 'Pick a character from the suggestions.')],
                });
                return;
            }
        }
        const names = await listPoolFiles(poolName, character?.slug);
        if (names.length === 0) {
            await interaction.editReply({
                content: character
                    ? `No files for ${character.name} in \`${pool.label}\`.`
                    : `\`${pool.label}\` has no files.`,
            });
            return;
        }
        const title = character ? `${pool.label} files: ${character.name}` : `${pool.label} files`;
        await createPaginatedMessage(interaction, buildListPages(title, pool.prefix, names), {
            customIdPrefix: `modmedia_list_${interaction.id}`,
        });
    } catch (error) {
        logger.error`[mod] media list failed in ${guild.id}: ${error}`;
        await interaction
            .editReply({ embeds: [EmbedTemplates.error('Could not list files', 'Something went wrong. Please try again.')] })
            .catch(() => {});
    }
}

export async function handleMediaRemove(
    interaction: ChatInputCommandInteraction,
    guild: Guild,
    findModLogChannel: (guild: Guild) => TextChannel | null
): Promise<void> {
    if (!isMediaHomeGuild(interaction.guildId)) {
        await interaction.reply({ content: MEDIA_HOME_ONLY_MESSAGE, flags: MessageFlags.Ephemeral });
        return;
    }
    const poolName = poolFrom(interaction);
    if (!poolName) {
        await interaction.reply({ content: '❌ Unknown pool.', flags: MessageFlags.Ephemeral });
        return;
    }
    const fileName = interaction.options.getString('file', true).trim();

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
        const file = await findPoolFile(poolName, fileName);
        await confirmAndRemove(interaction, guild, poolName, file, findModLogChannel);
    } catch (error) {
        const message = error instanceof MediaUserError ? error.message : 'Something went wrong. Please try again.';
        if (!(error instanceof MediaUserError)) logger.error`[mod] media remove failed in ${guild.id}: ${error}`;
        await interaction
            .editReply({ content: null, embeds: [EmbedTemplates.error('Nothing was removed', message)], components: [] })
            .catch(() => {});
    }
}

async function confirmAndRemove(
    interaction: ChatInputCommandInteraction,
    guild: Guild,
    poolName: MediaPoolName,
    file: { fileName: string; url: string },
    findModLogChannel: (guild: Guild) => TextChannel | null
): Promise<void> {
    const pool = MEDIA_POOLS[poolName];
    const removeId = `modmedia_remove_${interaction.id}`;
    const cancelId = `modmedia_cancel_${interaction.id}`;
    const prompt = await interaction.editReply({
        embeds: [
            EmbedTemplates.info(`Remove from ${pool.label}`)
                .setImage(file.url)
                .addFields(
                    { name: 'Command', value: pool.label, inline: true },
                    { name: 'File name', value: `\`${file.fileName}\``, inline: true }
                ),
        ],
        components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(removeId).setLabel('Remove').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(cancelId).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
            ),
        ],
    });

    let button;
    try {
        button = await prompt.awaitMessageComponent({
            componentType: ComponentType.Button,
            time: SLUR_MOD_CONFIG.CONFIRM_TIMEOUT_MS,
            filter: i => i.user.id === interaction.user.id && (i.customId === removeId || i.customId === cancelId),
        });
    } catch {
        await interaction.editReply({ content: 'Timed out — nothing was removed.', embeds: [], components: [] });
        return;
    }

    if (button.customId === cancelId) {
        await button.update({ content: 'Cancelled — nothing was removed.', embeds: [], components: [] });
        return;
    }

    await button.deferUpdate();
    try {
        await removeMediaFromPool(poolName, file.fileName);
    } catch (error) {
        logger.error`[mod] media delete failed in ${guild.id}: ${error}`;
        const message = error instanceof MediaUserError ? error.message : 'The file could not be deleted.';
        await interaction.editReply({ content: `❌ ${message} Nothing was removed.`, embeds: [], components: [] });
        return;
    }

    await interaction.editReply({
        content: `Removed \`${file.fileName}\` from \`${pool.label}\`.`,
        embeds: [],
        components: [],
    });

    const channel = findModLogChannel(guild);
    if (!channel) return;
    try {
        await channel.send({
            embeds: [
                EmbedTemplates.info(`${pool.label} image removed`).addFields(
                    { name: 'Removed by', value: `${interaction.user}`, inline: true },
                    { name: 'File name', value: `\`${file.fileName}\``, inline: true }
                ),
            ],
        });
    } catch (error) {
        logger.warn`[mod] media log post failed in ${guild.id}: ${error}`;
    }
}
