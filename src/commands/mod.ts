import {
    SlashCommandBuilder,
    SlashCommandStringOption,
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    PermissionFlagsBits,
    InteractionContextType,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ChannelType,
    EmbedBuilder,
    Guild,
    TextChannel,
} from 'discord.js';
import {
    getSlurModerationService,
    normalizeFilterTerm,
    FilterEditResult,
    FilterOverview,
} from '../services/slurModerationService.js';
import { SLUR_MOD_CONFIG } from '../utils/data/slurModerationConfig.js';
import { EmbedTemplates } from '../utils/embedTemplates.js';
import { handleCommandError } from '../utils/commandErrorHandler.js';
import { createPaginatedMessage } from './utils/paginationBuilder.js';
import { logger } from '../utils/logger.js';
import { isModerator, MOD_REQUIRED_MESSAGE } from '../utils/permissionHelpers.js';
import { handleSpamStats, handleSpamReset } from './utils/spamModeration.js';
import { handleMediaAdd, handleMediaList, handleMediaRemove, autocompleteMediaCharacter, autocompleteMediaFile, isMediaHomeGuild, MEDIA_HOME_ONLY_MESSAGE } from './utils/modMedia.js';
import { MEDIA_POOLS, MAX_VARIANT_LENGTH } from '../utils/data/mediaPoolConfig.js';
import { addModRedeemSubcommands, executeModRedeem, autocompleteRedeemCode } from './redeem.js';
import { handleJobs } from './utils/modJobs.js';

const addMediaPoolChoices = (opt: SlashCommandStringOption) =>
    opt.addChoices(
        { name: MEDIA_POOLS.booba.label, value: 'booba' },
        { name: MEDIA_POOLS.booty.label, value: 'booty' });

/**
 * /mod — moderator tools, hidden from everyone else.
 *
 * `setDefaultMemberPermissions` keeps the whole command out of the picker for
 * members without Timeout Members, and a server's admins can narrow that
 * further (by role, channel or member) under Server Settings > Integrations,
 * with no code change. Discord only supports that per top-level command,
 * never per subcommand, which is why moderator tools live here rather than
 * as subcommands of the member-facing /redeem and /spam.
 *
 * The picker setting is a convenience, not the check: admins can override it,
 * so every subcommand also verifies the caller at run time.
 *
 * Everything here acts on the calling server only. The bot is open source and
 * runs in other communities' servers, so no moderator can change what happens
 * anywhere but their own server.
 */

const TIMEOUT_MINUTES = Math.round(SLUR_MOD_CONFIG.TIMEOUT_DURATION_MS / 60_000);

const FIELD_LIMIT = 1024;

const spoiler = (term: string) => `||${term.replace(/\|/g, '')}||`;

/**
 * Join items into one embed field value without cutting one in half: a half
 * spoiler or half timestamp renders as garbage. Items that don't fit are
 * summarised as "+N more".
 */
function fitField(items: string[], separator: string): string {
    let value = '';
    for (let i = 0; i < items.length; i++) {
        const next = value ? `${value}${separator}${items[i]}` : items[i];
        const more = `${separator}+${items.length - i - 1} more`;
        if (next.length > FIELD_LIMIT || (i < items.length - 1 && next.length + more.length > FIELD_LIMIT)) {
            return value ? `${value}${separator}+${items.length - i} more` : `+${items.length} more`;
        }
        value = next;
    }
    return value || '​';
}

const spoilerList = (terms: string[]) => fitField(terms.map(spoiler), ', ');

function findModLogChannel(guild: Guild): TextChannel | null {
    const channel = guild.channels.cache.find(
        c => c.type === ChannelType.GuildText && c.name.toLowerCase() === SLUR_MOD_CONFIG.MOD_LOG_CHANNEL_NAME
    ) as TextChannel | undefined;
    return channel ?? null;
}

/** A note in this server's mod channel, if it has one, so list changes are visible to the whole team. */
async function postAudit(
    interaction: ChatInputCommandInteraction,
    guild: Guild,
    verb: 'added' | 'removed',
    terms: string[],
    total: number
): Promise<void> {
    const channel = findModLogChannel(guild);
    if (!channel) return;
    const embed = EmbedTemplates.info(
        'Slur list updated',
        `${interaction.user} ${verb} ${terms.length} term${terms.length === 1 ? '' : 's'}. ` +
            `This server's list now has ${total}.`
    ).addFields({ name: 'Terms', value: spoilerList(terms) });
    try {
        await channel.send({ embeds: [embed] });
    } catch (error) {
        logger.warn`[mod] slur audit post failed in ${guild.id}: ${error}`;
    }
}

function resultEmbed(action: 'add' | 'remove', guild: Guild, result: FilterEditResult): EmbedBuilder {
    const verb = action === 'add' ? 'Added' : 'Removed';
    const n = result.changed.length;
    const embed =
        n > 0
            ? EmbedTemplates.success(
                  `${verb} ${n} term${n === 1 ? '' : 's'}`,
                  `Live now in **${guild.name}**. This server's list has ${result.total} term${result.total === 1 ? '' : 's'}.`
              )
            : EmbedTemplates.info('Nothing changed', `This server's list still has ${result.total} term${result.total === 1 ? '' : 's'}.`);

    if (n > 0) embed.addFields({ name: verb, value: spoilerList(result.changed) });
    if (result.unchanged.length > 0) {
        embed.addFields({
            name: action === 'add' ? 'Already on this server\'s list' : 'Not on this server\'s list',
            value: spoilerList(result.unchanged),
        });
    }
    if (result.builtIn.length > 0) {
        embed.addFields({
            name: 'On the built-in list',
            value:
                `${spoilerList(result.builtIn)}\n` +
                (action === 'add'
                    ? 'Already caught in every server, so there is nothing to add.'
                    : 'The built-in list applies in every server and can\'t be changed per server.'),
        });
    }
    return embed;
}

/**
 * This server's terms, paginated. The built-in list is shown as a count only:
 * the bot is public, anyone can create a server and moderate it, and the
 * built-in list shouldn't be readable by all of them.
 */
function listPages(guild: Guild, overview: FilterOverview): EmbedBuilder[] {
    const { server, builtInCount } = overview;
    const size = SLUR_MOD_CONFIG.LIST_PAGE_SIZE;

    const header = [
        `**This server:** ${server.terms.length} term${server.terms.length === 1 ? '' : 's'}` +
            (server.lastUpdated
                ? ` · last changed <t:${Math.floor(new Date(server.lastUpdated).getTime() / 1000)}:R>` +
                  (server.updatedBy ? ` by ${server.updatedBy}` : '')
                : ''),
        overview.builtInLoaded
            ? `**Built-in:** ${builtInCount} term${builtInCount === 1 ? '' : 's'}, kept by the bot's maintainer, apply in every server (not listed here)`
            : '**Built-in:** unavailable right now, so only this server\'s terms are being caught',
    ];
    if (overview.builtInDegraded && overview.builtInLoaded) {
        header.push('_The built-in list could not be refreshed; the last copy loaded is in use._');
    }

    const sections: { title: string; terms: string[] }[] = [];
    for (let i = 0; i < server.terms.length; i += size) {
        sections.push({ title: 'This server\'s terms', terms: server.terms.slice(i, i + size) });
    }
    if (server.terms.length === 0) sections.push({ title: 'This server\'s terms', terms: [] });

    return sections.map(section =>
        EmbedTemplates.info(`Slur list: ${guild.name}`)
            .setDescription(
                `${header.join('\n')}\n\n**${section.title}**\n` +
                    (section.terms.length > 0
                        ? section.terms.map(t => `• ${spoiler(t)}`).join('\n')
                        : '_None yet. Add some with `/mod slur add`._')
            )
            .setFooter({
                text: 'Whole words only, any capitalisation, common letter swaps caught. Moderators are never actioned.',
            })
    );
}

async function handleList(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const overview = await getSlurModerationService().getFilterOverview(guild);
    await createPaginatedMessage(interaction, listPages(guild, overview), {
        customIdPrefix: `modslur_list_${interaction.id}`,
    });
}

async function handleAdd(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const raw = interaction.options.getString('terms', true);
    const parts = [...new Set(raw.split(/[,\n]/).map(s => s.trim()).filter(Boolean))];

    if (parts.length === 0) {
        await interaction.reply({ content: '❌ Give at least one term, separated by commas.', flags: MessageFlags.Ephemeral });
        return;
    }
    if (parts.length > SLUR_MOD_CONFIG.MAX_TERMS_PER_EDIT) {
        await interaction.reply({
            content: `❌ That's ${parts.length} terms; add up to ${SLUR_MOD_CONFIG.MAX_TERMS_PER_EDIT} at a time.`,
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const checked = parts.map(p => ({ input: p, result: normalizeFilterTerm(p) }));
    const rejected = checked.filter(c => !c.result.ok);
    if (rejected.length > 0) {
        const lines = rejected.map(c => `• ${spoiler(c.input)} ${(c.result as { reason: string }).reason}`);
        await interaction.reply({
            content: `❌ Nothing was added. Fix these and try again:\n${lines.join('\n')}`,
            flags: MessageFlags.Ephemeral,
        });
        return;
    }
    const terms = [...new Set(checked.map(c => (c.result as { term: string }).term))];

    // A wrong term times out innocent members, so adding always asks first.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
        await confirmAndAdd(interaction, guild, terms);
    } catch (error) {
        // Never leave a live-looking confirmation with dead buttons behind.
        logger.error`[mod] slur add failed in ${guild.id}: ${error}`;
        await interaction
            .editReply({
                content: null,
                embeds: [EmbedTemplates.error('Nothing was added', 'Something went wrong. Please try again.')],
                components: [],
            })
            .catch(() => {});
    }
}

async function confirmAndAdd(interaction: ChatInputCommandInteraction, guild: Guild, terms: string[]): Promise<void> {
    const confirmId = `modslur_add_confirm_${interaction.id}`;
    const cancelId = `modslur_add_cancel_${interaction.id}`;
    const prompt = await interaction.editReply({
        embeds: [
            EmbedTemplates.warning(
                `Add ${terms.length} term${terms.length === 1 ? '' : 's'} to this server's slur list?`,
                `A message containing any of these is **deleted**, its author is **timed out for ${TIMEOUT_MINUTES} minutes** ` +
                    `and sent a DM, and it's logged in #${SLUR_MOD_CONFIG.MOD_LOG_CHANNEL_NAME} if this server has one. ` +
                    `This applies in **${guild.name}** only.`
            ).addFields(
                { name: 'Terms', value: spoilerList(terms) },
                {
                    name: 'How matching works',
                    value:
                        'Whole words only, any capitalisation, and common letter swaps such as `0` for `o`. ' +
                        'Not sure what a term would catch? Cancel and try `/mod slur test` first.',
                }
            ),
        ],
        components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(confirmId).setLabel('Add to list').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(cancelId).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
            ),
        ],
    });

    let button;
    try {
        button = await prompt.awaitMessageComponent({
            componentType: ComponentType.Button,
            time: SLUR_MOD_CONFIG.CONFIRM_TIMEOUT_MS,
            filter: i => i.user.id === interaction.user.id && (i.customId === confirmId || i.customId === cancelId),
        });
    } catch {
        await interaction.editReply({
            embeds: [EmbedTemplates.info('Nothing changed', 'The confirmation timed out.')],
            components: [],
        });
        return;
    }

    if (button.customId === cancelId) {
        await button.update({ embeds: [EmbedTemplates.info('Cancelled', 'Nothing was added.')], components: [] });
        return;
    }

    await button.deferUpdate();
    let result: FilterEditResult;
    try {
        result = await getSlurModerationService().addServerTerms(guild, terms, `${interaction.user.tag} (${interaction.user.id})`);
    } catch (error) {
        // The service's own messages are written for moderators (the list
        // is full, or it couldn't be read so nothing changed).
        await interaction.editReply({
            embeds: [EmbedTemplates.error('Nothing was added', (error as Error).message.slice(0, 1000))],
            components: [],
        });
        return;
    }
    await interaction.editReply({ embeds: [resultEmbed('add', guild, result)], components: [] });
    if (result.changed.length > 0) await postAudit(interaction, guild, 'added', result.changed, result.total);
}

async function handleRemove(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const term = interaction.options.getString('term', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await getSlurModerationService().removeServerTerms(
        guild,
        [term],
        `${interaction.user.tag} (${interaction.user.id})`
    );
    await interaction.editReply({ embeds: [resultEmbed('remove', guild, result)] });
    if (result.changed.length > 0) await postAudit(interaction, guild, 'removed', result.changed, result.total);
}

async function handleTest(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const text = interaction.options.getString('text', true);
    const candidateRaw = interaction.options.getString('term', false);

    const candidates: string[] = [];
    if (candidateRaw) {
        const checked = normalizeFilterTerm(candidateRaw);
        if (!checked.ok) {
            await interaction.reply({
                content: `❌ That term couldn't be added anyway: it ${checked.reason}.`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        candidates.push(checked.term);
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const preview = await getSlurModerationService().previewMatches(guild, text, candidates);

    // What's live (built-in + this server) decides whether it would be caught
    // today; the test term only shows what it would add.
    const caughtNow = preview.builtInMatches > 0 || preview.serverMatches.length > 0;
    const lines = [
        ...preview.serverMatches.map(t => `${spoiler(t)} (this server's list)`),
        ...(preview.builtInMatches > 0
            ? [`${preview.builtInMatches} built-in term${preview.builtInMatches === 1 ? '' : 's'}`]
            : []),
        ...preview.candidateMatches.map(t => `${spoiler(t)} (your test term, not saved)`),
    ];

    const embed = caughtNow
        ? EmbedTemplates.warning(
              'This message would be caught',
              `It would be deleted, its author timed out for ${TIMEOUT_MINUTES} minutes, and it would be logged.`
          )
        : preview.candidateMatches.length > 0
          ? EmbedTemplates.warning(
                'Not caught today, but it would be if you add the term',
                'Nothing on the list matches it now. Your test term does.'
            )
          : EmbedTemplates.success('This message would not be caught');
    if (lines.length > 0) embed.addFields({ name: 'Matched', value: fitField(lines, '\n') });

    if (!preview.builtInLoaded) {
        embed.addFields({
            name: 'Built-in list unavailable',
            value: 'Only this server\'s terms were checked, because the built-in list could not be loaded.',
        });
    }
    embed.setFooter({ text: 'Dry run: nothing was deleted and nobody was timed out. Moderators are never actioned.' });
    await interaction.editReply({ embeds: [embed] });
}

async function handleHistory(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const user = interaction.options.getUser('user', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const record = await getSlurModerationService().getOffenses(guild.id, user.id);

    if (!record) {
        await interaction.editReply({
            embeds: [EmbedTemplates.info('No record', `${user} has no auto-moderation offences in this server.`)],
        });
        return;
    }

    const ts = (iso: string) => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:R>`;
    const recent = record.history
        .slice(-SLUR_MOD_CONFIG.HISTORY_DISPLAY_LIMIT)
        .reverse()
        .map(h => `${ts(h.at)} in <#${h.channelId}>: ${h.matchedTerms.length > 0 ? h.matchedTerms.map(spoiler).join(', ') : 'unknown'}`);

    await interaction.editReply({
        embeds: [
            EmbedTemplates.info(`Auto-moderation record: ${user.tag}`)
                .setDescription(`${user}`)
                .addFields(
                    { name: 'Offences', value: `${record.count}`, inline: true },
                    { name: 'First', value: ts(record.firstOffenseAt), inline: true },
                    { name: 'Latest', value: ts(record.lastOffenseAt), inline: true },
                    { name: 'Most recent', value: recent.length > 0 ? fitField(recent, '\n') : 'None kept' }
                ),
        ],
    });
}

export default {
    data: new SlashCommandBuilder()
        .setName('mod')
        .setDescription('Moderator tools')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setContexts(InteractionContextType.Guild)
        .addSubcommandGroup(group => group
            .setName('slur')
            .setDescription('This server\'s auto-moderation slur list')
            .addSubcommand(sub => sub
                .setName('list')
                .setDescription('Show this server\'s terms and the built-in ones'))
            .addSubcommand(sub => sub
                .setName('add')
                .setDescription('Add terms to this server\'s slur list (asks you to confirm)')
                .addStringOption(opt => opt
                    .setName('terms')
                    .setDescription('One or more terms, separated by commas')
                    .setRequired(true)
                    .setMaxLength(600)))
            .addSubcommand(sub => sub
                .setName('remove')
                .setDescription('Remove a term from this server\'s slur list')
                .addStringOption(opt => opt
                    .setName('term')
                    .setDescription('The term to remove')
                    .setRequired(true)
                    .setMaxLength(SLUR_MOD_CONFIG.MAX_TERM_LENGTH + 10)
                    .setAutocomplete(true)))
            .addSubcommand(sub => sub
                .setName('test')
                .setDescription('Check whether a message would be caught, without acting on it')
                .addStringOption(opt => opt
                    .setName('text')
                    .setDescription('A sample message')
                    .setRequired(true)
                    .setMaxLength(1000))
                .addStringOption(opt => opt
                    .setName('term')
                    .setDescription('Also try a term you are thinking of adding (not saved)')
                    .setRequired(false)
                    .setMaxLength(SLUR_MOD_CONFIG.MAX_TERM_LENGTH + 10)))
            .addSubcommand(sub => sub
                .setName('history')
                .setDescription('A member\'s auto-moderation record in this server')
                .addUserOption(opt => opt
                    .setName('user')
                    .setDescription('The member to look up')
                    .setRequired(true))))
        .addSubcommandGroup(group => group
            .setName('spam')
            .setDescription('Chat command spam protection')
            .addSubcommand(sub => sub
                .setName('stats')
                .setDescription('Spam protection statistics for this server'))
            .addSubcommand(sub => sub
                .setName('reset')
                .setDescription('Reset a member\'s chat command limit')
                .addUserOption(opt => opt
                    .setName('user')
                    .setDescription('Member whose chat command limit to reset')
                    .setRequired(true))))
        .addSubcommandGroup(group => group
            .setName('media')
            .setDescription('booba? and booty? image pools')
            .addSubcommand(sub => sub
                .setName('add')
                .setDescription('Add a gif to the booba? or booty? pool (asks you to confirm)')
                .addStringOption(opt => addMediaPoolChoices(opt
                    .setName('pool')
                    .setDescription('Which pool')
                    .setRequired(true)))
                .addStringOption(opt => opt
                    .setName('character')
                    .setDescription('The character, searchable by name')
                    .setRequired(true)
                    .setAutocomplete(true))
                .addAttachmentOption(opt => opt
                    .setName('image')
                    .setDescription('The .gif to add')
                    .setRequired(true))
                .addStringOption(opt => opt
                    .setName('variant')
                    .setDescription('Optional, such as a skin name')
                    .setRequired(false)
                    .setMaxLength(MAX_VARIANT_LENGTH)))
            .addSubcommand(sub => sub
                .setName('list')
                .setDescription('List the files in the booba? or booty? pool')
                .addStringOption(opt => addMediaPoolChoices(opt
                    .setName('pool')
                    .setDescription('Which pool')
                    .setRequired(true)))
                .addStringOption(opt => opt
                    .setName('character')
                    .setDescription('Only this character\'s files')
                    .setRequired(false)
                    .setAutocomplete(true)))
            .addSubcommand(sub => sub
                .setName('remove')
                .setDescription('Remove a gif from the booba? or booty? pool (asks you to confirm)')
                .addStringOption(opt => addMediaPoolChoices(opt
                    .setName('pool')
                    .setDescription('Which pool')
                    .setRequired(true)))
                .addStringOption(opt => opt
                    .setName('file')
                    .setDescription('The file to remove, searchable by name')
                    .setRequired(true)
                    .setAutocomplete(true))))
        .addSubcommandGroup(group => addModRedeemSubcommands(
            group.setName('redeem').setDescription('Coupon codes and subscribers')))
        .addSubcommand(sub => sub
            .setName('jobs')
            .setDescription('Status of the bot\'s scheduled jobs (home server only)')),

    async execute(interaction: ChatInputCommandInteraction) {
        const guild = interaction.guild;
        if (!guild) {
            await interaction.reply({ content: '❌ This only works in a server.', flags: MessageFlags.Ephemeral });
            return;
        }
        if (!isModerator(interaction)) {
            await interaction.reply({ content: MOD_REQUIRED_MESSAGE, flags: MessageFlags.Ephemeral });
            return;
        }

        try {
            const group = interaction.options.getSubcommandGroup(false);
            const sub = interaction.options.getSubcommand();
            if (group === 'slur') {
                switch (sub) {
                    case 'list': return await handleList(interaction, guild);
                    case 'add': return await handleAdd(interaction, guild);
                    case 'remove': return await handleRemove(interaction, guild);
                    case 'test': return await handleTest(interaction, guild);
                    case 'history': return await handleHistory(interaction, guild);
                }
            } else if (group === 'spam') {
                switch (sub) {
                    case 'stats': return await handleSpamStats(interaction, guild);
                    case 'reset': return await handleSpamReset(interaction, guild);
                }
            } else if (group === 'media') {
                if (!isMediaHomeGuild(interaction.guildId)) {
                    await interaction.reply({ content: MEDIA_HOME_ONLY_MESSAGE, flags: MessageFlags.Ephemeral });
                    return;
                }
                if (sub === 'add') return await handleMediaAdd(interaction, guild, findModLogChannel);
                if (sub === 'list') return await handleMediaList(interaction, guild);
                if (sub === 'remove') return await handleMediaRemove(interaction, guild, findModLogChannel);
            } else if (group === 'redeem') {
                return await executeModRedeem(interaction);
            } else if (group === null && sub === 'jobs') {
                return await handleJobs(interaction);
            }
            await interaction.reply({ content: '❌ Unknown subcommand.', flags: MessageFlags.Ephemeral });
        } catch (error) {
            await handleCommandError(interaction, error, 'mod');
        }
    },

    async autocomplete(interaction: AutocompleteInteraction) {
        try {
            const guild = interaction.guild;
            const group = interaction.options.getSubcommandGroup(false);
            const sub = interaction.options.getSubcommand(false);
            // Only moderators get suggestions: autocomplete is reachable by
            // anyone who can type the command, and suggestions are list terms
            // or coupon codes.
            if (!guild || !isModerator(interaction)) {
                await interaction.respond([]);
                return;
            }
            if (group === 'media' && (sub === 'add' || sub === 'list')) {
                await autocompleteMediaCharacter(interaction);
                return;
            }
            if (group === 'media' && sub === 'remove') {
                await autocompleteMediaFile(interaction);
                return;
            }
            if (group === 'redeem' && sub === 'remove') {
                await autocompleteRedeemCode(interaction);
                return;
            }
            if (group !== 'slur' || sub !== 'remove') {
                await interaction.respond([]);
                return;
            }
            const focused = interaction.options.getFocused().toLowerCase().trim();
            const terms = await getSlurModerationService().getServerTerms(guild.id);
            await interaction.respond(
                terms
                    .filter(t => t.includes(focused))
                    .sort()
                    .slice(0, 25)
                    .map(t => ({ name: t, value: t }))
            );
        } catch (error) {
            logger.warn`[mod] slur autocomplete failed: ${error}`;
            await interaction.respond([]).catch(() => {});
        }
    },
};
