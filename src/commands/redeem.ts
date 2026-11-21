import {
    SlashCommandBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    ButtonInteraction,
    ModalSubmitInteraction,
    PermissionFlagsBits,
    Role,
    MessageFlags,
    ModalBuilder,
    LabelBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    SlashCommandSubcommandGroupBuilder
} from 'discord.js';
import { getGachaDataService } from '../services/gachaDataService';
import { getGachaRedemptionService, UserRedemptionSummary, type SingleRedemptionOutcome } from '../services/gachaRedemptionService';
import { couponButtonId, parseCouponButtonId } from '../services/couponAnnouncementService';
import { syncCouponSources } from '../services/couponSourceService';
import {
    GachaCoupon,
    GachaGameId,
    GameSubscription,
    SubscriptionMode
} from '../utils/interfaces/GachaCoupon.interface';
import {
    GACHA_GAMES,
    getGameConfig,
    getSupportedGameIds,
    isValidGameId
} from '../utils/data/gachaGamesConfig';
import { getGachaGuildConfigService } from '../services/gachaGuildConfigService';
// Phase 1 & 2 utilities
import { getAssetUrls } from '../config/assets.js';
import { checkModPermission } from '../utils/permissionHelpers.js';
import { gachaEmbed } from '../utils/embedTemplates.js';
import { handleCommandError } from '../utils/commandErrorHandler.js';
import { formatDate, parseExpirationDate, isExpiringSoon, isExpired } from '../utils/dateHelpers.js';
import { validateGameId, validateSubscriptionMode, validateGameUserId } from '../utils/validators.js';
import { createPaginatedMessage } from './utils/paginationBuilder.js';
import { HOME_GUILD_ID } from '../utils/data/homeGuild.js';

const ASSET_URLS = getAssetUrls();

// Build game choices for slash command options
const GAME_CHOICES = getSupportedGameIds().map(id => ({
    name: GACHA_GAMES[id].name,
    value: id,
}));

// ==================== Account Details Form ====================
//
// Games that need account details (BD2's nickname; CZN's membership number,
// character nickname and server) collect them through a Discord form when
// any are missing from the slash command. Each field carries a hint saying
// where to find it, and the server is a dropdown. The slash options still
// work for anyone who types them, so nothing existing changes.

const FORM_TIMEOUT_MS = 5 * 60 * 1000;
const RETRY_TIMEOUT_MS = 5 * 60 * 1000;
/** Rounds of "fix details" before we stop offering the button. */
const MAX_FORM_ATTEMPTS = 3;
const USER_ID_INPUT = 'userid';
/** How long the "already subscribed" check may take before the form must open. */
const PRECHECK_BUDGET_MS = 1500;

/** The promise's value, or undefined if it takes longer than `ms`. */
async function withinMs<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), ms); });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(timer);
    }
}

type GameConfig = ReturnType<typeof getGameConfig>;

/** The account details for one game, as typed or as stored. */
interface IdentityInput {
    userId: string;
    fields: Record<string, string>;
}

/** Something that can answer the user: the slash command, a form, or a button. */
type Responder = ChatInputCommandInteraction | ModalSubmitInteraction | ButtonInteraction;

/** Whether this game asks for any account details at all. */
function hasIdentity(config: GameConfig): boolean {
    return config.requiresUserId || (config.extraUserFields?.length ?? 0) > 0;
}

/** "STOVE membership number, character nickname and server" */
function identityLabel(config: GameConfig): string {
    const parts = [config.userIdFieldName, ...(config.extraUserFields ?? []).map(f => f.label.toLowerCase())];
    return parts.length <= 1
        ? parts.join('')
        : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function capitalise(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Read whatever details were typed into the slash command. */
function identityFromOptions(interaction: ChatInputCommandInteraction, config: GameConfig): IdentityInput {
    const fields: Record<string, string> = {};
    for (const field of config.extraUserFields ?? []) {
        const raw = interaction.options.getString(field.optionName ?? field.key, false)?.trim();
        if (raw) fields[field.key] = raw;
    }
    return {
        userId: interaction.options.getString('userid', false)?.trim() ?? '',
        fields,
    };
}

/** Whether every detail the game needs is present (not whether it's valid). */
function identityComplete(config: GameConfig, input: IdentityInput): boolean {
    if (config.requiresUserId && !input.userId) return false;
    return (config.extraUserFields ?? []).every(f => !!input.fields[f.key]);
}

/** Every problem with the details at once, so nobody fixes them one per attempt. */
function identityErrors(gameId: GachaGameId, config: GameConfig, input: IdentityInput): string[] {
    const errors: string[] = [];

    if (config.requiresUserId && !input.userId) {
        errors.push(`${capitalise(config.userIdFieldName)} is required.`);
    } else if (input.userId) {
        const validation = validateGameUserId(gameId, input.userId);
        if (!validation.valid) errors.push(validation.error!);
    }

    for (const field of config.extraUserFields ?? []) {
        const value = input.fields[field.key];
        if (!value) {
            errors.push(`${field.label} is required.`);
        } else if (field.maxLength && value.length > field.maxLength) {
            errors.push(`${field.label} must be ${field.maxLength} characters or fewer.`);
        } else if (field.choices && !field.choices.some(c => c.value === value)) {
            errors.push(`${field.label} must be one of: ${field.choices.map(c => c.label).join(', ')}.`);
        }
    }

    return errors;
}

/** The form, prefilled with whatever we already know. */
function buildIdentityModal(config: GameConfig, customId: string, prefill: IdentityInput): ModalBuilder {
    const modal = new ModalBuilder()
        .setCustomId(customId)
        .setTitle(`${config.shortName} account details`);

    if (config.requiresUserId) {
        const input = new TextInputBuilder()
            .setCustomId(USER_ID_INPUT)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(config.maxNicknameLength);
        if (prefill.userId && prefill.userId.length <= config.maxNicknameLength) {
            input.setValue(prefill.userId);
        }
        const label = new LabelBuilder()
            .setLabel(capitalise(config.userIdFieldName))
            .setTextInputComponent(input);
        if (config.userIdHint) label.setDescription(config.userIdHint);
        modal.addLabelComponents(label);
    }

    for (const field of config.extraUserFields ?? []) {
        const current = prefill.fields[field.key];
        const label = new LabelBuilder().setLabel(field.label);
        if (field.hint) label.setDescription(field.hint);

        if (field.choices) {
            label.setStringSelectMenuComponent(
                new StringSelectMenuBuilder()
                    .setCustomId(field.key)
                    .setPlaceholder(`Choose your ${field.label.toLowerCase()}`)
                    .setRequired(true)
                    .addOptions(field.choices.map(choice =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel(choice.label)
                            .setValue(choice.value)
                            .setDefault(choice.value === current)
                    ))
            );
        } else {
            const input = new TextInputBuilder()
                .setCustomId(field.key)
                .setStyle(TextInputStyle.Short)
                .setRequired(true);
            if (field.maxLength) input.setMaxLength(field.maxLength);
            if (current && (!field.maxLength || current.length <= field.maxLength)) {
                input.setValue(current);
            }
            label.setTextInputComponent(input);
        }

        modal.addLabelComponents(label);
    }

    return modal;
}

/**
 * Show the form and wait for it. Returns null if the user closes it or lets
 * it time out; Discord gives us no event for that, and nothing needs undoing.
 */
async function askForIdentity(
    source: ChatInputCommandInteraction | ButtonInteraction,
    config: GameConfig,
    prefill: IdentityInput
): Promise<{ submit: ModalSubmitInteraction; input: IdentityInput } | null> {
    const customId = `redeem_identity_${source.id}`;
    await source.showModal(buildIdentityModal(config, customId, prefill));

    let submit: ModalSubmitInteraction;
    try {
        submit = await source.awaitModalSubmit({
            filter: i => i.customId === customId && i.user.id === source.user.id,
            time: FORM_TIMEOUT_MS,
        });
    } catch {
        return null;
    }

    const fields: Record<string, string> = {};
    for (const field of config.extraUserFields ?? []) {
        const value = field.choices
            ? submit.fields.getStringSelectValues(field.key)[0]
            : submit.fields.getTextInputValue(field.key);
        if (value?.trim()) fields[field.key] = value.trim();
    }

    return {
        submit,
        input: {
            userId: config.requiresUserId ? submit.fields.getTextInputValue(USER_ID_INPUT).trim() : '',
            fields,
        },
    };
}

/**
 * Acknowledge, so slow work (redeeming several codes) can't outlast Discord's
 * three seconds. A form opened from our own "Fix details" button updates that
 * message in place rather than stacking a new one under it.
 *
 * Only when that message is ephemeral, i.e. one of ours shown to this user
 * alone. A form opened from a channel post's "Redeem for me" also comes "from
 * a message", and updating that would overwrite the public post, for
 * everyone, with this user's account details.
 */
async function acknowledge(responder: Responder): Promise<void> {
    if (responder.deferred || responder.replied) return;
    if (
        responder.isModalSubmit() &&
        responder.isFromMessage() &&
        responder.message.flags.has(MessageFlags.Ephemeral)
    ) {
        await responder.deferUpdate();
    } else {
        await responder.deferReply({ flags: MessageFlags.Ephemeral });
    }
}

/**
 * Say what went wrong, with a button that reopens the form. Returns the click,
 * or null when the user doesn't press it in time (the button is then removed).
 */
async function offerRetry(
    responder: Responder,
    embed: EmbedBuilder,
    canRetry: boolean
): Promise<ButtonInteraction | null> {
    await acknowledge(responder);

    if (!canRetry) {
        await responder.editReply({ embeds: [embed], components: [] });
        return null;
    }

    const buttonId = `redeem_fix_${responder.id}`;
    const message = await responder.editReply({
        embeds: [embed],
        components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(buttonId).setLabel('Fix details').setStyle(ButtonStyle.Primary)
            ),
        ],
    });

    // editReply resolves to raw API data instead of a Message when the
    // channel isn't cached (a private thread the bot hasn't joined, say).
    // The channel can still collect the click; the button id is unique.
    const host = typeof (message as any)?.awaitMessageComponent === 'function'
        ? message
        : responder.channel;

    try {
        if (!host) throw new Error('nowhere to listen for the button');
        return await host.awaitMessageComponent({
            componentType: ComponentType.Button,
            filter: i => i.customId === buttonId && i.user.id === responder.user.id,
            time: RETRY_TIMEOUT_MS,
        });
    } catch {
        await responder.editReply({ components: [] }).catch(() => undefined);
        return null;
    }
}

function problemEmbed(config: GameConfig, title: string, description: string): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(0xFF6600)
        .setTitle(title)
        .setThumbnail(config.logoPath)
        .setDescription(description)
        .setTimestamp()
        .setFooter({ text: 'Gacha Coupon System', iconURL: ASSET_URLS.rapiBot.thumbnail });
}

/**
 * Report an error. When this continues an earlier message, its embed and
 * "Fix details" button would otherwise sit above the error, still clickable.
 */
async function failWith(responder: Responder, error: unknown, context: string): Promise<void> {
    if (responder.deferred || responder.replied) {
        await responder.editReply({ embeds: [], components: [] }).catch(() => undefined);
    }
    await handleCommandError(responder, error, context);
}

/** What `apply` decided: finished, or the details need another try. */
type ApplyOutcome = { done: true } | { retry: EmbedBuilder };

/**
 * The shared loop behind subscribe and edit: get the details (from the slash
 * options or the form), check them, apply them, and on a fixable problem
 * offer the form again, prefilled with what the user typed last.
 */
async function runIdentityFlow(opts: {
    /** The slash command, or a channel post's "Redeem for me" button. */
    interaction: ChatInputCommandInteraction | ButtonInteraction;
    gameId: GachaGameId;
    config: GameConfig;
    initial: IdentityInput;
    /** Open the form even if the slash options were complete (edit does). */
    askFirst: boolean;
    /** `canRetry`: whether a "Fix details" button will follow a retry outcome. */
    apply: (responder: Responder, input: IdentityInput, canRetry: boolean) => Promise<ApplyOutcome>;
}): Promise<void> {
    const { interaction, gameId, config } = opts;
    let input = opts.initial;
    let responder: Responder = interaction;
    let source: ChatInputCommandInteraction | ButtonInteraction = interaction;
    let ask = opts.askFirst || (hasIdentity(config) && !identityComplete(config, input));

    for (let attempt = 1; attempt <= MAX_FORM_ATTEMPTS; attempt++) {
        if (ask) {
            const answered = await askForIdentity(source, config, input);
            if (!answered) {
                // Closed a form reopened from "Fix details": that button
                // has nothing listening any more, so take it away.
                if (responder !== interaction) {
                    await responder.editReply({ components: [] }).catch(() => undefined);
                }
                return;
            }
            responder = answered.submit;
            input = answered.input;
        }

        const canRetry = attempt < MAX_FORM_ATTEMPTS;
        const errors = identityErrors(gameId, config, input);
        let problem: EmbedBuilder | null = null;

        if (errors.length > 0) {
            problem = problemEmbed(
                config,
                `❌ Check your ${config.shortName} details`,
                errors.map(e => `• ${e}`).join('\n') +
                (canRetry ? '\n\nPress **Fix details** to correct them.' : '')
            );
        } else {
            const outcome = await opts.apply(responder, input, canRetry);
            if ('done' in outcome) return;
            problem = outcome.retry;
        }

        const click = await offerRetry(responder, problem, canRetry);
        if (!click) return;
        source = click;
        ask = true;
    }
}

/** The "game didn't recognise these details" message. */
function identityRejectedEmbed(config: GameConfig, keptOld: boolean, canRetry: boolean): EmbedBuilder {
    const together = (config.extraUserFields?.length ?? 0) > 0 ? ' together' : '';
    const command = keptOld ? `/redeem edit game:${config.id}` : `/redeem subscribe game:${config.id}`;
    return problemEmbed(
        config,
        `❌ ${config.shortName} didn't recognise those details`,
        `${config.name} didn't recognise that ${identityLabel(config)}${together}, ` +
        (keptOld ? 'so your previous details are kept.' : 'so nothing was saved.') +
        (together ? ' It doesn\'t say which one is wrong, so check each of them.' : '') +
        (canRetry
            ? `\n\nPress **Fix details** to try again.`
            : `\n\nCheck them in game, then run \`${command}\` again.`)
    );
}

/** Summary line for an immediate redemption run. */
function redemptionSummary(result: UserRedemptionSummary): string {
    if (result.total === 0) {
        return 'No active codes right now. New codes will be redeemed automatically, and your details are checked with the first one.';
    }
    const parts = [];
    if (result.successful > 0) parts.push(`✅ ${result.successful} redeemed`);
    if (result.alreadyRedeemed > 0) parts.push(`🔄 ${result.alreadyRedeemed} already claimed`);
    if (result.failed > 0) parts.push(`❌ ${result.failed} not redeemed`);
    return `Tried ${result.total} active code${result.total === 1 ? '' : 's'}.\n${parts.join(' • ')}\n\nYou'll get a DM with the details.`;
}

/** The account-details fields for an embed, labelled by the game's own names. */
function identityFields(config: GameConfig, userId: string, fields?: Record<string, string>) {
    const out: Array<{ name: string; value: string; inline: boolean }> = [];
    if (config.requiresUserId && userId) {
        out.push({ name: capitalise(config.userIdFieldName), value: `\`${userId}\``, inline: true });
    }
    for (const field of config.extraUserFields ?? []) {
        const stored = fields?.[field.key];
        if (!stored) continue;
        const shown = field.choices?.find(c => c.value === stored)?.label ?? stored;
        out.push({ name: field.label, value: `\`${shown}\``, inline: true });
    }
    return out;
}

/**
 * Whether the game has accepted these details, for auto-redeem games. Empty
 * when we simply don't know yet (no code tried since subscribing), so older
 * subscriptions aren't labelled as a problem.
 */
function accountStatusLine(config: GameConfig, gameId: GachaGameId, sub: GameSubscription): string {
    if (!config.supportsAutoRedeem || !hasIdentity(config)) return '';
    if (sub.identityRejectedAt) {
        const since = Math.floor(new Date(sub.identityRejectedAt).getTime() / 1000);
        return `⚠️ Not recognised by the game since <t:${since}:R>. Fix with \`/redeem edit game:${gameId}\`.`;
    }
    if (sub.identityVerifiedAt) {
        const at = Math.floor(new Date(sub.identityVerifiedAt).getTime() / 1000);
        return `✅ Accepted by the game <t:${at}:R>`;
    }
    return '';
}

// ==================== Command Handlers ====================

async function handleSubscribe(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = validateGameId(interaction.options.getString('game', true));
    const gameConfig = getGameConfig(gameId);

    // Mode is optional: auto-redeem where the game supports it, since that's
    // what nearly everyone picks.
    const modeInput = interaction.options.getString('mode', false);
    let mode: SubscriptionMode = modeInput
        ? validateSubscriptionMode(modeInput)
        : (gameConfig.supportsAutoRedeem ? 'auto-redeem' : 'notification-only');
    if (mode === 'auto-redeem' && !gameConfig.supportsAutoRedeem) {
        mode = 'notification-only';
    }

    // Already subscribed: say so now, before asking them to fill in a form.
    // A form must open within Discord's three seconds, so a slow (uncached)
    // read is abandoned; subscribe() refuses a duplicate anyway.
    try {
        const existing = await withinMs(
            getGachaDataService().getGameSubscription(interaction.user.id, gameId),
            PRECHECK_BUDGET_MS
        );
        if (existing) {
            await interaction.reply({
                content:
                    `❌ You are already subscribed to ${gameConfig.name}. ` +
                    `Use \`/redeem edit game:${gameId}\` to change your details, or \`/redeem switch\` to change mode.`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
    } catch (error) {
        await handleCommandError(interaction, error, 'redeem:subscribe');
        return;
    }

    await subscribeFlow(interaction, gameId, mode, identityFromOptions(interaction, gameConfig));
}

/**
 * Open the subscribe form from a channel post's "Redeem for me" button, for
 * someone who isn't subscribed yet. Subscribing redeems every active code,
 * this one included. The caller has already checked they aren't subscribed,
 * and this must be its first reply: a form can't follow any other.
 */
export async function subscribeFromButton(interaction: ButtonInteraction, gameId: GachaGameId): Promise<void> {
    const config = getGameConfig(gameId);
    const mode: SubscriptionMode = config.supportsAutoRedeem ? 'auto-redeem' : 'notification-only';
    await subscribeFlow(interaction, gameId, mode, { userId: '', fields: {} });
}

async function subscribeFlow(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    gameId: GachaGameId,
    mode: SubscriptionMode,
    initial: IdentityInput
): Promise<void> {
    const gameConfig = getGameConfig(gameId);

    await runIdentityFlow({
        interaction,
        gameId,
        config: gameConfig,
        initial,
        askFirst: false,
        apply: async (responder, input, canRetry) => {
            const hasExtraFields = Object.keys(input.fields).length > 0;
            const dataService = getGachaDataService();

            try {
                await acknowledge(responder);
                // Single-identifier games are called exactly as before — no
                // trailing argument — so BD2 and Lost Sword records keep their shape.
                if (hasExtraFields) {
                    await dataService.subscribe(interaction.user.id, gameId, input.userId, mode, input.fields);
                } else {
                    await dataService.subscribe(interaction.user.id, gameId, input.userId, mode);
                }

                let whatNext = mode === 'auto-redeem'
                    ? 'The bot will automatically redeem new codes for you.'
                    : 'You will receive DM notifications about new and expiring codes.';

                // Auto-redeem: redeem what's active now. This is also the
                // first real check of the details, so a rejection is
                // reported here instead of hours later by DM.
                if (mode === 'auto-redeem') {
                    const result = await getGachaRedemptionService().redeemAllForUser(
                        interaction.client,
                        interaction.user.id,
                        gameId,
                        hasExtraFields ? { userId: input.userId, fields: input.fields } : input.userId
                    );
                    if (result.identityRejected) {
                        await dataService.unsubscribe(interaction.user.id, gameId);
                        return { retry: identityRejectedEmbed(gameConfig, false, canRetry) };
                    }
                    whatNext = redemptionSummary(result);
                }

                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('✅ Subscription Activated')
                    .setThumbnail(gameConfig.logoPath)
                    .setDescription(`You are now subscribed to ${gameConfig.name} coupon updates!`)
                    .setTimestamp()
                    .setFooter({ text: 'Gacha Coupon System', iconURL: ASSET_URLS.rapiBot.thumbnail })
                    .addFields(
                        ...identityFields(gameConfig, input.userId, input.fields),
                        { name: 'Mode', value: mode === 'auto-redeem' ? '🤖 Auto-Redeem' : '📬 Notification Only', inline: true },
                        { name: 'What happens now?', value: whatNext }
                    );

                await responder.editReply({ embeds: [embed], components: [] });
                return { done: true };
            } catch (error) {
                await failWith(responder, error, 'redeem:subscribe');
                return { done: true };
            }
        },
    });
}

async function handleEdit(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = validateGameId(interaction.options.getString('game', true));
    const gameConfig = getGameConfig(gameId);

    if (!hasIdentity(gameConfig)) {
        await interaction.reply({
            content: `${gameConfig.name} doesn't need any account details, so there's nothing to edit.`,
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    let current: GameSubscription | null;
    try {
        current = await getGachaDataService().getGameSubscription(interaction.user.id, gameId);
    } catch (error) {
        await handleCommandError(interaction, error, 'redeem:edit');
        return;
    }
    if (!current) {
        await interaction.reply({
            content: `❌ You are not subscribed to ${gameConfig.name}. Use \`/redeem subscribe game:${gameId}\` first.`,
            flags: MessageFlags.Ephemeral,
        });
        return;
    }
    const subscription = current;

    await runIdentityFlow({
        interaction,
        gameId,
        config: gameConfig,
        initial: { userId: subscription.gameUserId, fields: { ...(subscription.gameUserFields ?? {}) } },
        askFirst: true,
        apply: async (responder, input, canRetry) => {
            const hasExtraFields = Object.keys(input.fields).length > 0;
            const dataService = getGachaDataService();

            try {
                await acknowledge(responder);
                const { changed } = await dataService.updateGameIdentity(
                    interaction.user.id, gameId, input.userId, hasExtraFields ? input.fields : undefined
                );

                if (!changed) {
                    await responder.editReply({
                        content: `Nothing changed: those are already your ${gameConfig.name} details.`,
                        embeds: [],
                        components: [],
                    });
                    return { done: true };
                }

                let whatNext = 'Saved.';
                if (subscription.mode === 'auto-redeem' && gameConfig.supportsAutoRedeem) {
                    const result = await getGachaRedemptionService().redeemAllForUser(
                        interaction.client,
                        interaction.user.id,
                        gameId,
                        hasExtraFields ? { userId: input.userId, fields: input.fields } : input.userId
                    );
                    if (result.identityRejected) {
                        // Put the previous details back rather than leave a
                        // subscription the game can't use. Only the details:
                        // a mode or preference change made meanwhile stays.
                        await dataService.revertGameIdentity(interaction.user.id, gameId, {
                            userId: input.userId,
                            fields: hasExtraFields ? input.fields : undefined,
                        });
                        return { retry: identityRejectedEmbed(gameConfig, true, canRetry) };
                    }
                    whatNext = redemptionSummary(result);
                }

                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle(`✅ ${gameConfig.shortName} details updated`)
                    .setThumbnail(gameConfig.logoPath)
                    .addFields(
                        ...identityFields(gameConfig, input.userId, input.fields),
                        { name: 'What happens now?', value: whatNext }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Gacha Coupon System', iconURL: ASSET_URLS.rapiBot.thumbnail });

                await responder.editReply({ content: '', embeds: [embed], components: [] });
                return { done: true };
            } catch (error) {
                await failWith(responder, error, 'redeem:edit');
                return { done: true };
            }
        },
    });
}

async function handleUnsubscribe(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = validateGameId(interaction.options.getString('game', true));
    const gameConfig = getGameConfig(gameId);

    try {
        const dataService = getGachaDataService();
        const removed = await dataService.unsubscribe(interaction.user.id, gameId);

        if (removed) {
            const embed = new EmbedBuilder()
                .setColor(0xFF6600)
                .setTitle('👋 Unsubscribed')
                .setDescription(`You have been unsubscribed from ${gameConfig.name} coupon updates.`)
                .setTimestamp()
                .setFooter({ text: 'Gacha Coupon System', iconURL: ASSET_URLS.rapiBot.thumbnail });

            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.editReply({
                content: `❌ You are not subscribed to ${gameConfig.name}.`
            });
        }
    } catch (error) {
        await handleCommandError(interaction, error, 'redeem:subscribe');
    }
}

async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameIdInput = interaction.options.getString('game');
    const gameId = gameIdInput ? validateGameId(gameIdInput) : null;

    try {
        const dataService = getGachaDataService();
        const userSubs = await dataService.getUserSubscriptions(interaction.user.id);

        if (!userSubs || Object.keys(userSubs.games).length === 0) {
            await interaction.editReply({
                content: '❌ You have no active subscriptions. Use `/redeem subscribe` to get started!'
            });
            return;
        }

        // If specific game requested
        if (gameId) {
            // Use batch data loading to reduce S3 operations
            const { subscription: gameSub, activeCoupons, unredeemed } = await dataService.getSubscriberContext(interaction.user.id, gameId);

            if (!gameSub) {
                await interaction.editReply({
                    content: `❌ You are not subscribed to ${getGameConfig(gameId).name}.`
                });
                return;
            }

            const gameConfig = getGameConfig(gameId);

            const embed = new EmbedBuilder()
                .setColor(gameConfig.embedColor)
                .setTitle(`📊 ${gameConfig.shortName} Subscription Status`)
                .setThumbnail(gameConfig.logoPath)
                .addFields(
                    ...identityFields(gameConfig, gameSub.gameUserId, gameSub.gameUserFields),
                    { name: 'Mode', value: gameSub.mode === 'auto-redeem' ? '🤖 Auto-Redeem' : '📬 Notify', inline: true },
                    { name: 'Since', value: formatDate(gameSub.subscribedAt), inline: true },
                    { name: 'Redeemed', value: `${gameSub.redeemedCodes.length}`, inline: true },
                    { name: 'Active', value: `${activeCoupons.length}`, inline: true },
                    { name: 'Pending', value: `${unredeemed.length}`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'Gacha Coupon System', iconURL: ASSET_URLS.rapiBot.thumbnail });

            const accountState = accountStatusLine(gameConfig, gameId, gameSub);
            if (accountState) {
                embed.addFields({ name: 'Account', value: accountState });
            }

            if (unredeemed.length > 0) {
                const codeList = unredeemed.slice(0, 5).map(c => `• \`${c.code}\` - ${c.rewards}`).join('\n');
                embed.addFields({ name: '📌 Unredeemed Codes', value: codeList });
            }

            await interaction.editReply({ embeds: [embed] });
        } else {
            // Show all subscriptions
            const embed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle('📊 Your Coupon Subscriptions')
                .setTimestamp()
                .setFooter({ text: 'Gacha Coupon System', iconURL: ASSET_URLS.rapiBot.thumbnail });

            for (const [gId, gameSub] of Object.entries(userSubs.games)) {
                if (!gameSub) continue;
                const gameConfig = getGameConfig(validateGameId(gId));
                const unredeemed = await dataService.getUnredeemedCodes(interaction.user.id, validateGameId(gId));

                const details = identityFields(gameConfig, gameSub.gameUserId, gameSub.gameUserFields)
                    .map(f => `${f.name}: ${f.value}`)
                    .join('\n');
                const accountState = accountStatusLine(gameConfig, validateGameId(gId), gameSub);
                embed.addFields({
                    name: `${gameConfig.name}`,
                    value:
                        (details ? `${details}\n` : '') +
                        `Mode: ${gameSub.mode === 'auto-redeem' ? '🤖' : '📬'} | Redeemed: ${gameSub.redeemedCodes.length} | Pending: ${unredeemed.length}` +
                        (accountState ? `\n${accountState}` : '')
                });
            }

            await interaction.editReply({ embeds: [embed] });
        }
    } catch (error) {
        await handleCommandError(interaction, error, 'redeem:subscribe');
    }
}

async function handleCodes(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = validateGameId(interaction.options.getString('game', true));
    const gameConfig = getGameConfig(gameId);

    try {
        const dataService = getGachaDataService();
        const activeCoupons = await dataService.getActiveCoupons(gameId);

        if (activeCoupons.length === 0) {
            await interaction.editReply({
                content: `📭 No active coupon codes for ${gameConfig.name} right now.`
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(gameConfig.embedColor)
            .setTitle(`🎟️ ${gameConfig.shortName} Coupon Codes`)
            .setThumbnail(gameConfig.logoPath)
            .setTimestamp()
            .setFooter({ text: 'Gacha Coupon System', iconURL: ASSET_URLS.rapiBot.thumbnail });

        if (gameConfig.manualRedeemUrl) {
            embed.setDescription(`Use the [official redemption page](${gameConfig.manualRedeemUrl}) or redeem in-game.`);
        }

        for (const coupon of activeCoupons.slice(0, 10)) {
            const expiry = coupon.expirationDate
                ? `⏰ Expires: ${formatDate(coupon.expirationDate)}`
                : '♾️ No expiration';

            embed.addFields({
                name: `\`${coupon.code}\``,
                value: `${coupon.rewards}\n${expiry}${coupon.source ? `\n📍 ${coupon.source}` : ''}`
            });
        }

        if (activeCoupons.length > 10) {
            embed.addFields({ name: '...', value: `And ${activeCoupons.length - 10} more codes` });
        }

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        await handleCommandError(interaction, error, 'redeem:subscribe');
    }
}

async function handleModAdd(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = validateGameId(interaction.options.getString('game', true));
    const code = interaction.options.getString('code', true);
    const rewards = interaction.options.getString('rewards', true);
    const expirationInput = interaction.options.getString('expiration') || 'never';
    const source = interaction.options.getString('source') || undefined;

    const gameConfig = getGameConfig(gameId);

    try {
        const expirationDate = parseExpirationDate(expirationInput);
        const dataService = getGachaDataService();

        const coupon: GachaCoupon = {
            code: code.toUpperCase().trim(),
            gameId,
            rewards,
            expirationDate,
            addedBy: interaction.user.id,
            addedAt: new Date().toISOString(),
            isActive: true,
            source
        };

        await dataService.addCoupon(coupon);

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ Coupon Added')
            .setThumbnail(gameConfig.logoPath)
            .addFields(
                { name: 'Game', value: gameConfig.shortName, inline: true },
                { name: 'Code', value: `\`${coupon.code}\``, inline: true },
                { name: 'Rewards', value: rewards, inline: true },
                { name: 'Expires', value: formatDate(expirationDate), inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'Gacha Coupon System', iconURL: ASSET_URLS.rapiBot.thumbnail });

        if (source) {
            embed.addFields({ name: 'Source', value: source, inline: true });
        }

        await interaction.editReply({ embeds: [embed] });

        // Notify subscribers
        const redemptionService = getGachaRedemptionService();
        await redemptionService.notifyNewCode(interaction.client, coupon);

    } catch (error) {
        await handleCommandError(interaction, error, 'redeem:subscribe');
    }
}

async function handleModRemove(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = validateGameId(interaction.options.getString('game', true));
    const code = interaction.options.getString('code', true);
    const gameConfig = getGameConfig(gameId);

    try {
        const dataService = getGachaDataService();
        const removed = await dataService.removeCoupon(gameId, code);

        if (removed) {
            const embed = new EmbedBuilder()
                .setColor(0xFF6600)
                .setTitle('🗑️ Coupon Deactivated')
                .setDescription(`\`${code.toUpperCase()}\` has been deactivated for ${gameConfig.name}.`)
                .setTimestamp()
                .setFooter({ text: 'Gacha Coupon System', iconURL: ASSET_URLS.rapiBot.thumbnail });

            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.editReply({ content: `❌ Code \`${code}\` not found for ${gameConfig.name}.` });
        }
    } catch (error) {
        await handleCommandError(interaction, error, 'redeem:subscribe');
    }
}

async function handleModList(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = validateGameId(interaction.options.getString('game', true));
    const filter = interaction.options.getString('filter') || 'all';
    const gameConfig = getGameConfig(gameId);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const dataService = getGachaDataService();
        const allCoupons = await dataService.getAllCoupons(gameId);
        const stats = await dataService.getGameStats(gameId);
        const now = new Date();

        const activeCoupons = allCoupons.filter(c => c.isActive);
        const inactiveCoupons = allCoupons.filter(c => !c.isActive);

        // Determine which coupons to display based on filter
        let couponsToDisplay: typeof allCoupons;
        let filterLabel: string;

        switch (filter) {
            case 'active':
                couponsToDisplay = activeCoupons;
                filterLabel = 'Active Codes';
                break;
            case 'expired':
                couponsToDisplay = inactiveCoupons;
                filterLabel = 'Expired/Inactive Codes';
                break;
            default:
                couponsToDisplay = allCoupons;
                filterLabel = 'All Codes';
        }

        if (couponsToDisplay.length === 0) {
            await interaction.editReply({
                content: `📭 No ${filterLabel.toLowerCase()} found for ${gameConfig.name}.`
            });
            return;
        }

        // Build paginated embeds (10 codes per page)
        const CODES_PER_PAGE = 10;
        const pages: EmbedBuilder[] = [];
        const totalPages = Math.ceil(couponsToDisplay.length / CODES_PER_PAGE);

        for (let i = 0; i < totalPages; i++) {
            const pageCoupons = couponsToDisplay.slice(i * CODES_PER_PAGE, (i + 1) * CODES_PER_PAGE);

            const codeList = pageCoupons.map(c => {
                const expiry = c.expirationDate ? formatDate(c.expirationDate) : 'No expiry';
                let status: string;
                if (!c.isActive) {
                    status = '❌';
                } else if (c.expirationDate && new Date(c.expirationDate) <= now) {
                    status = '⏰'; // Expired but in grace period
                } else {
                    status = '✅';
                }
                return `${status} \`${c.code}\`\n   └ ${c.rewards} (${expiry})`;
            }).join('\n');

            const embed = new EmbedBuilder()
                .setColor(gameConfig.embedColor)
                .setTitle(`📋 ${gameConfig.shortName} ${filterLabel}`)
                .setThumbnail(gameConfig.logoPath)
                .setDescription(
                    `**Subscribers:** ${stats.total} (🤖 ${stats.autoRedeem} | 📬 ${stats.notifyOnly})\n` +
                    `**Total:** ${couponsToDisplay.length} codes | ✅ Active | ⏰ Grace Period | ❌ Inactive\n\n` +
                    codeList
                )
                .setFooter({ text: `Page ${i + 1} of ${totalPages}`, iconURL: ASSET_URLS.rapiBot.thumbnail })
                .setTimestamp();

            pages.push(embed);
        }

        // Use pagination helper from Phase 2.1
        await createPaginatedMessage(interaction, pages, {
            customIdPrefix: 'list',
            timeoutMs: 5 * 60 * 1000,
            unauthorizedMessage: 'You cannot use these buttons.'
        });
    } catch (error) {
        await handleCommandError(interaction, error, 'redeem');
    }
}

async function handleModTrigger(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = validateGameId(interaction.options.getString('game', true));
    const gameConfig = getGameConfig(gameId);

    if (!gameConfig.supportsAutoRedeem) {
        await interaction.reply({
            content: `❌ Auto-redemption is not supported for ${gameConfig.name}.`,
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const redemptionService = getGachaRedemptionService();
        const result = await redemptionService.processGameAutoRedemptions(interaction.client, gameId);

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`🔄 ${gameConfig.shortName} Redemption Triggered`)
            .setDescription(`Processed ${result.usersProcessed} users with ${result.totalRedemptions} attempts.`)
            .addFields(
                { name: '✅ Successful', value: `${result.successful}`, inline: true },
                { name: '❌ Failed', value: `${result.failed}`, inline: true },
                { name: '⏭️ Skipped', value: `${result.skipped}`, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'Gacha Coupon System', iconURL: ASSET_URLS.rapiBot.thumbnail });

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        await handleCommandError(interaction, error, 'redeem');
    }
}

// ==================== Admin Command Handlers ====================

async function handleModUnsub(interaction: ChatInputCommandInteraction): Promise<void> {
    const targetUser = interaction.options.getUser('user', true);
    const gameId = validateGameId(interaction.options.getString('game', true));
    const gameConfig = getGameConfig(gameId);

    try {
        const dataService = getGachaDataService();
        const removed = await dataService.adminUnsubscribe(targetUser.id, gameId);

        if (removed) {
            const embed = new EmbedBuilder()
                .setColor(0xFF6600)
                .setTitle('🔧 User Unsubscribed')
                .setDescription(`<@${targetUser.id}> has been unsubscribed from ${gameConfig.name}.`)
                .setTimestamp()
                .setFooter({ text: 'Admin Action', iconURL: ASSET_URLS.rapiBot.thumbnail });

            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.editReply({
                content: `❌ <@${targetUser.id}> is not subscribed to ${gameConfig.name}.`
            });
        }
    } catch (error) {
        await handleCommandError(interaction, error, 'redeem:subscribe');
    }
}

async function handleModUpdate(interaction: ChatInputCommandInteraction): Promise<void> {
    const targetUser = interaction.options.getUser('user', true);
    const gameId = validateGameId(interaction.options.getString('game', true));
    const newUserId = interaction.options.getString('userid', true);
    const gameConfig = getGameConfig(gameId);

    // Validate new game user ID format
    const validation = validateGameUserId(gameId, newUserId);
    if (!validation.valid) {
        await interaction.editReply({
            content: `❌ ${validation.error}`
        });
        return;
    }

    try {
        const dataService = getGachaDataService();
        await dataService.adminUpdateGameUserId(targetUser.id, gameId, newUserId);

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🔧 User ID Updated')
            .setDescription(`Updated ${gameConfig.userIdFieldName} for <@${targetUser.id}> in ${gameConfig.name}.`)
            .addFields({ name: `New ${gameConfig.userIdFieldName}`, value: `\`${newUserId}\`` })
            .setTimestamp()
            .setFooter({ text: 'Admin Action', iconURL: ASSET_URLS.rapiBot.thumbnail });

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        await handleCommandError(interaction, error, 'redeem:subscribe');
    }
}

async function handleModLookup(interaction: ChatInputCommandInteraction): Promise<void> {
    const targetUser = interaction.options.getUser('user', true);

    try {
        const dataService = getGachaDataService();
        const userSubs = await dataService.getUserSubscriptions(targetUser.id);

        if (!userSubs || Object.keys(userSubs.games).length === 0) {
            await interaction.editReply({
                content: `❌ <@${targetUser.id}> has no active subscriptions.`
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle(`🔍 Subscriptions for ${targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL())
            .setTimestamp()
            .setFooter({ text: 'Admin Lookup', iconURL: ASSET_URLS.rapiBot.thumbnail });

        for (const [gId, gameSub] of Object.entries(userSubs.games)) {
            if (!gameSub) continue;
            const gameConfig = getGameConfig(validateGameId(gId));

            embed.addFields({
                name: gameConfig.name,
                value: `**${gameConfig.userIdFieldName}:** \`${gameSub.gameUserId}\`\n**Mode:** ${gameSub.mode === 'auto-redeem' ? '🤖 Auto-Redeem' : '📬 Notification Only'}\n**Since:** ${formatDate(gameSub.subscribedAt)}\n**Redeemed:** ${gameSub.redeemedCodes.length} codes`,
            });
        }

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        await handleCommandError(interaction, error, 'redeem:subscribe');
    }
}

async function handleModReset(interaction: ChatInputCommandInteraction): Promise<void> {
    const targetUser = interaction.options.getUser('user', true);
    const gameId = validateGameId(interaction.options.getString('game', true));
    const gameConfig = getGameConfig(gameId);

    try {
        const dataService = getGachaDataService();
        await dataService.adminResetRedeemedCodes(targetUser.id, gameId);

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🔧 Redeemed Codes Reset')
            .setDescription(`Reset redeemed codes list for <@${targetUser.id}> in ${gameConfig.name}.`)
            .addFields({ name: 'Effect', value: 'All codes are now marked as unredeemed for this user. Auto-redemption will attempt all active codes again.' })
            .setTimestamp()
            .setFooter({ text: 'Admin Action', iconURL: ASSET_URLS.rapiBot.thumbnail });

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        await handleCommandError(interaction, error, 'redeem:subscribe');
    }
}

async function handleSwitch(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = validateGameId(interaction.options.getString('game', true));
    const newMode = validateSubscriptionMode(interaction.options.getString('mode', true));
    const gameConfig = getGameConfig(gameId);

    try {
        const dataService = getGachaDataService();
        const subscription = await dataService.getGameSubscription(interaction.user.id, gameId);

        if (!subscription) {
            await interaction.editReply({
                content: `❌ You are not subscribed to ${gameConfig.name}. Use \`/redeem subscribe\` first.`
            });
            return;
        }

        // Check if already in the requested mode
        if (subscription.mode === newMode) {
            await interaction.editReply({
                content: `❌ You are already in ${newMode === 'auto-redeem' ? '🤖 Auto-Redeem' : '📬 Notification Only'} mode for ${gameConfig.name}.`
            });
            return;
        }

        await dataService.switchSubscriptionMode(interaction.user.id, gameId, newMode);

        const modeDescription = newMode === 'auto-redeem' && gameConfig.supportsAutoRedeem
            ? 'The bot will now automatically redeem new codes for you.'
            : 'You will now receive DM notifications about new and expiring codes.';

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🔄 Mode Switched')
            .setThumbnail(gameConfig.logoPath)
            .setDescription(`Your ${gameConfig.name} subscription mode has been updated!`)
            .addFields(
                { name: 'Previous Mode', value: subscription.mode === 'auto-redeem' ? '🤖 Auto-Redeem' : '📬 Notification Only', inline: true },
                { name: 'New Mode', value: newMode === 'auto-redeem' ? '🤖 Auto-Redeem' : '📬 Notification Only', inline: true }
            )
            .addFields({ name: 'What changes?', value: modeDescription })
            .setTimestamp()
            .setFooter({ text: 'Gacha Coupon System', iconURL: ASSET_URLS.rapiBot.thumbnail });

        if (!gameConfig.supportsAutoRedeem && newMode === 'auto-redeem') {
            embed.addFields({
                name: '⚠️ Note',
                value: `Auto-redeem is not yet supported for ${gameConfig.shortName}. You will receive notifications instead.`
            });
        }

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        await handleCommandError(interaction, error, 'redeem:subscribe');
    }
}

async function handlePreferences(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = validateGameId(interaction.options.getString('game', true));
    const gameConfig = getGameConfig(gameId);

    // Get toggle values (null means not provided, so we should show current status)
    const expirationWarnings = interaction.options.getBoolean('expiration_warnings');
    const weeklyDigest = interaction.options.getBoolean('weekly_digest');
    const newCodeAlerts = interaction.options.getBoolean('new_code_alerts');

    try {
        const dataService = getGachaDataService();
        const subscription = await dataService.getGameSubscription(interaction.user.id, gameId);

        if (!subscription) {
            await interaction.editReply({
                content: `❌ You are not subscribed to ${gameConfig.name}. Use \`/redeem subscribe\` first.`
            });
            return;
        }

        // If no options provided, just show current preferences
        const noOptionsProvided = expirationWarnings === null && weeklyDigest === null && newCodeAlerts === null;

        if (noOptionsProvided) {
            const prefs = await dataService.getNotificationPreferences(interaction.user.id, gameId);

            const embed = new EmbedBuilder()
                .setColor(gameConfig.embedColor)
                .setTitle(`🔔 ${gameConfig.shortName} Notification Preferences`)
                .setThumbnail(gameConfig.logoPath)
                .setDescription('Your current notification settings:')
                .addFields(
                    { name: '⚠️ Expiration Warnings', value: prefs?.expirationWarnings !== false ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: '📬 Weekly Digest', value: prefs?.weeklyDigest !== false ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: '🆕 New Code Alerts', value: prefs?.newCodeAlerts !== false ? '✅ Enabled' : '❌ Disabled', inline: true }
                )
                .addFields({
                    name: '💡 How to Change',
                    value: 'Use `/redeem preferences` with options to toggle settings.\nExample: `/redeem preferences game:Brown Dust 2 weekly_digest:False`'
                })
                .setTimestamp()
                .setFooter({ text: 'Gacha Coupon System', iconURL: ASSET_URLS.rapiBot.thumbnail });

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Update preferences with provided values
        const updates: Partial<{
            expirationWarnings: boolean;
            weeklyDigest: boolean;
            newCodeAlerts: boolean;
        }> = {};

        if (expirationWarnings !== null) updates.expirationWarnings = expirationWarnings;
        if (weeklyDigest !== null) updates.weeklyDigest = weeklyDigest;
        if (newCodeAlerts !== null) updates.newCodeAlerts = newCodeAlerts;

        await dataService.updateNotificationPreferences(interaction.user.id, gameId, updates);

        // Get updated preferences
        const updatedPrefs = await dataService.getNotificationPreferences(interaction.user.id, gameId);

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`✅ ${gameConfig.shortName} Preferences Updated`)
            .setThumbnail(gameConfig.logoPath)
            .setDescription('Your notification preferences have been saved.')
            .addFields(
                { name: '⚠️ Expiration Warnings', value: updatedPrefs?.expirationWarnings !== false ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: '📬 Weekly Digest', value: updatedPrefs?.weeklyDigest !== false ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: '🆕 New Code Alerts', value: updatedPrefs?.newCodeAlerts !== false ? '✅ Enabled' : '❌ Disabled', inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'Gacha Coupon System', iconURL: ASSET_URLS.rapiBot.thumbnail });

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        await handleCommandError(interaction, error, 'redeem:subscribe');
    }
}

async function handleModStats(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameIdInput = interaction.options.getString('game');
    const gameId = gameIdInput ? validateGameId(gameIdInput) : null;

    try {
        const dataService = getGachaDataService();

        if (gameId) {
            // Show stats for specific game
            const gameConfig = getGameConfig(gameId);
            const analytics = await dataService.getGameAnalytics(gameId);

            const embed = new EmbedBuilder()
                .setColor(gameConfig.embedColor)
                .setTitle(`📊 ${gameConfig.shortName} Analytics`)
                .setThumbnail(gameConfig.logoPath)
                .addFields(
                    { name: '👥 Subscribers', value: `Total: **${analytics.subscribers.total}**\n🤖 Auto: ${analytics.subscribers.autoRedeem}\n📬 Notify: ${analytics.subscribers.notifyOnly}`, inline: true },
                    { name: '🎟️ Coupons', value: `Total: **${analytics.coupons.total}**\n✅ Active: ${analytics.coupons.active}\n❌ Expired: ${analytics.coupons.expired}\n♾️ No Expiry: ${analytics.coupons.noExpiry}`, inline: true },
                    { name: '✨ Redemptions', value: `Total: **${analytics.redemptions.total}**\n👤 Users: ${analytics.redemptions.uniqueUsers}\n📈 Avg/User: ${analytics.redemptions.avgPerUser}`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'Gacha Coupon System', iconURL: ASSET_URLS.rapiBot.thumbnail });

            if (analytics.topCodes.length > 0) {
                const topCodesList = analytics.topCodes
                    .map((c, i) => `${i + 1}. \`${c.code}\` - ${c.redemptions} redemptions`)
                    .join('\n');
                embed.addFields({ name: '🏆 Top Codes', value: topCodesList });
            }

            await interaction.editReply({ embeds: [embed] });
        } else {
            // Show system-wide stats
            const analytics = await dataService.getSystemAnalytics();

            const embed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle('📊 System-Wide Analytics')
                .addFields(
                    { name: '👥 Total Subscribers', value: `${analytics.totalSubscribers}`, inline: true },
                    { name: '🎟️ Total Coupons', value: `${analytics.totalCoupons}`, inline: true },
                    { name: '✨ Total Redemptions', value: `${analytics.totalRedemptions}`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'Gacha Coupon System', iconURL: ASSET_URLS.rapiBot.thumbnail });

            // Add per-game breakdown
            if (Object.keys(analytics.byGame).length > 0) {
                let gameBreakdown = '';
                for (const [gId, stats] of Object.entries(analytics.byGame)) {
                    const config = getGameConfig(validateGameId(gId));
                    gameBreakdown += `**${config.shortName}**: ${stats.subscribers} subs, ${stats.coupons} codes, ${stats.redemptions} redeemed\n`;
                }
                embed.addFields({ name: '🎮 By Game', value: gameBreakdown });
            }

            await interaction.editReply({ embeds: [embed] });
        }
    } catch (error) {
        await handleCommandError(interaction, error, 'redeem:subscribe');
    }
}

async function handleModScrape(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const result = await syncCouponSources();
        const shortName = (gameId: GachaGameId) => getGameConfig(gameId).shortName;

        if (!result.success) {
            const reasons = result.outcomes
                .map(o => `${o.source} (${shortName(o.gameId)}): ${o.error}`)
                .join('\n');
            await interaction.editReply({ content: `❌ Every code source failed:\n${reasons}` });
            return;
        }

        // Build status message
        let statusMessage = '';
        if (result.added.length > 0) {
            statusMessage = `✅ Added **${result.added.length}** new code(s)!`;
        } else if (result.codes.length > 0) {
            statusMessage = `All ${result.codes.length} active codes already tracked.`;
        } else {
            statusMessage = 'No new redemption codes available.';
        }

        const embed = new EmbedBuilder()
            .setColor(result.added.length > 0 ? 0x00FF00 : 0x3498DB)
            .setTitle('🔍 Coupon Sync')
            .setDescription(statusMessage)
            .setTimestamp()
            .setFooter({ text: 'Gachafeed • gachafeed.moe · BD2 Pulse • thebd2pulse.com', iconURL: ASSET_URLS.rapiBot.thumbnail });

        // One line per source, so a source that failed is visible even when
        // another one covered for it.
        const sourceLines = result.outcomes.map(o => o.success
            ? `✅ ${o.source} · ${shortName(o.gameId)} — ${o.found} listed`
            : `⚠️ ${o.source} · ${shortName(o.gameId)} — ${o.error}`
        ).join('\n');
        embed.addFields({ name: '📡 Sources', value: sourceLines.substring(0, 1024) });

        // Stats row
        embed.addFields(
            { name: '📊 Active', value: `${result.codes.length}`, inline: true },
            { name: '⏰ Expired, skipped', value: `${result.skippedExpired.length}`, inline: true },
            { name: '➕ New', value: `${result.added.length}`, inline: true }
        );

        // Show newly added codes
        if (result.added.length > 0) {
            const newCodeDetails = result.added.map(({ gameId, code, source }) => {
                const codeData = result.codes.find(c => c.gameId === gameId && c.code === code);
                const expiry = codeData?.expirationDate ? formatDate(codeData.expirationDate) : '∞';
                const rewards = codeData ? ` → ${codeData.rewards}` : '';
                return `**${shortName(gameId)}** \`${code}\`${rewards} (${expiry}) · ${source}`;
            }).join('\n');
            embed.addFields({ name: '🆕 New Codes Added', value: newCodeDetails.substring(0, 1024) });
        }

        // Live according to a source but not trusted enough to auto-redeem —
        // a moderator who has checked one can still add it with /mod redeem add.
        if (result.heldBack.length > 0) {
            const heldList = result.heldBack
                .map(h => `**${shortName(h.gameId)}** \`${h.code}\` — ${h.reason}`)
                .join('\n');
            embed.addFields({ name: '✋ Held Back (not auto-redeemed)', value: heldList.substring(0, 1024) });
        }

        // Show active codes in a cleaner table format
        if (result.codes.length > 0) {
            const codeList = [...result.codes]
                .sort((a, b) => {
                    // Sort by expiration date (soonest first), then no-expiry last
                    if (!a.expirationDate && !b.expirationDate) return 0;
                    if (!a.expirationDate) return 1;
                    if (!b.expirationDate) return -1;
                    return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
                })
                .slice(0, 10)
                .map(c => {
                    const expiry = c.expirationDate
                        ? new Date(c.expirationDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : '∞';
                    const statusIcon = c.status === 'permanent' ? '🔒' : c.status === 'limited' ? '⏳' : '✨';
                    return `${statusIcon} **${shortName(c.gameId)}** \`${c.code}\`\n   ↳ ${c.rewards} • ${expiry}`;
                }).join('\n');

            const moreText = result.codes.length > 10 ? `\n\n*...and ${result.codes.length - 10} more*` : '';
            embed.addFields({ name: '✅ Active Codes', value: (codeList + moreText).substring(0, 1024) });
        }

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        await handleCommandError(interaction, error, 'redeem');
    }
}

async function handleModSubscribers(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = validateGameId(interaction.options.getString('game', true));
    const modeFilter = interaction.options.getString('mode') || 'all';
    const gameConfig = getGameConfig(gameId);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const dataService = getGachaDataService();
        const mode = modeFilter === 'all' ? undefined : validateSubscriptionMode(modeFilter);
        const subscribers = await dataService.getGameSubscribers(gameId, mode);

        if (subscribers.length === 0) {
            await interaction.editReply({
                content: `No subscribers found for ${gameConfig.name}${mode ? ` (${mode})` : ''}.`
            });
            return;
        }

        // Build paginated embeds (10 subscribers per page)
        const SUBS_PER_PAGE = 10;
        const pages: EmbedBuilder[] = [];
        const totalPages = Math.ceil(subscribers.length / SUBS_PER_PAGE);

        for (let i = 0; i < totalPages; i++) {
            const pageSubscribers = subscribers.slice(i * SUBS_PER_PAGE, (i + 1) * SUBS_PER_PAGE);

            const subscriberList = pageSubscribers.map((s, idx) => {
                const sub = s.subscription;
                const modeIcon = sub.mode === 'auto-redeem' ? '🤖' : '📬';
                const redeemed = sub.redeemedCodes.length;
                return `${i * SUBS_PER_PAGE + idx + 1}. <@${s.discordId}> ${modeIcon}\n` +
                       `   └ ${gameConfig.userIdFieldName}: \`${sub.gameUserId}\` | Redeemed: ${redeemed}`;
            }).join('\n');

            const embed = new EmbedBuilder()
                .setColor(gameConfig.embedColor)
                .setTitle(`👥 ${gameConfig.shortName} Subscribers`)
                .setThumbnail(gameConfig.logoPath)
                .setDescription(
                    `**Total:** ${subscribers.length} subscribers` +
                    `${mode ? ` (${mode})` : ''}\n\n` +
                    subscriberList
                )
                .setFooter({ text: `Page ${i + 1} of ${totalPages}`, iconURL: ASSET_URLS.rapiBot.thumbnail })
                .setTimestamp();

            pages.push(embed);
        }

        // Use pagination helper from Phase 2.1
        await createPaginatedMessage(interaction, pages, {
            customIdPrefix: 'subscribers',
            timeoutMs: 5 * 60 * 1000,
            unauthorizedMessage: 'You cannot use these buttons.'
        });
    } catch (error) {
        await handleCommandError(interaction, error, 'redeem');
    }
}

// ==================== Channel post buttons ====================

/** What a "Redeem for me" press came to, in words. */
function singleRedemptionText(gameId: GachaGameId, code: string, outcome: SingleRedemptionOutcome): string {
    const config = getGameConfig(gameId);
    switch (outcome.status) {
        case 'unsupported':
            return `${config.name} codes can't be redeemed automatically. Use **Copy code** and redeem it in game.`;
        case 'not-subscribed':
            return `You haven't set up ${config.name} yet.`;
        case 'inactive':
            return `⌛ \`${code}\` has expired or been withdrawn.`;
        case 'in-progress':
            return `⏳ Rapi is already redeeming \`${code}\` for you. You'll get a DM with the result.`;
        case 'already-redeemed':
            return `✅ \`${code}\` is already redeemed on your account.`;
        case 'details-rejected':
            return (
                `⚠️ ${config.name} stopped recognising your saved details, so Rapi didn't send \`${code}\`. ` +
                `Check them with \`/redeem edit game:${gameId}\`.`
            );
        case 'cooling-down':
            return (
                `⏸️ Rapi tried \`${code}\` for you and ${config.name} said: ${outcome.result.message}. ` +
                `To protect your account it won't try again until <t:${Math.ceil(outcome.until / 1000)}:R>.`
            );
        case 'done': {
            const { result } = outcome;
            if (result.success) {
                return `✅ Redeemed \`${code}\`. The rewards are in your in-game mailbox.`;
            }
            if (result.errorCode === 'AlreadyUsed') {
                return `✅ \`${code}\` was already redeemed on your account.`;
            }
            if (result.errorCode === 'IncorrectUser') {
                return (
                    `⚠️ ${config.name} didn't recognise your saved details, so \`${code}\` wasn't redeemed. ` +
                    `Check them with \`/redeem edit game:${gameId}\`.`
                );
            }
            return `❌ \`${code}\` wasn't redeemed: ${result.message}`;
        }
    }
}

/** "Set up" button, for when we couldn't tell in time whether they're subscribed. */
function setUpRow(gameId: GachaGameId) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(couponButtonId('subscribe', gameId))
            .setLabel(`Set up ${getGameConfig(gameId).shortName}`)
            .setEmoji('📝')
            .setStyle(ButtonStyle.Primary)
    );
}

/**
 * The buttons under a channel post (see couponAnnouncementService). Every
 * answer is visible to the presser only.
 */
export async function handleCouponButton(interaction: ButtonInteraction): Promise<void> {
    const parsed = parseCouponButtonId(interaction.customId);
    if (!parsed) return;
    const { action, gameId, code } = parsed;

    try {
        if (action === 'copy') {
            // Just the code, so a long-press on mobile copies exactly it.
            await interaction.reply({ content: code, flags: MessageFlags.Ephemeral });
            return;
        }

        // Posts only go to allowlisted servers, but one can be removed from
        // the list after its posts went up. Copy stays harmless anywhere.
        // Both reads share one budget, in parallel: a form must still open
        // within Discord's three seconds.
        const [allowed, existing] = await Promise.all([
            withinMs(getGachaGuildConfigService().isGuildAllowed(interaction.guildId), PRECHECK_BUDGET_MS),
            withinMs(getGachaDataService().getGameSubscription(interaction.user.id, gameId), PRECHECK_BUDGET_MS),
        ]);
        if (allowed === false) {
            await interaction.reply({ content: '❌ Coupon redemption isn\'t available in this server.', flags: MessageFlags.Ephemeral });
            return;
        }

        // Redeem for me, or Set up. Not set up yet: open the form straight
        // away, since a form has to be the first reply. If the read is too
        // slow to know in time, carry on and offer a "Set up" button instead.
        if (existing === null && getGameConfig(gameId).supportsAutoRedeem) {
            await subscribeFromButton(interaction, gameId);
            return;
        }
        if (action === 'subscribe') {
            await interaction.reply({
                content: existing
                    ? `✅ You're already set up for ${getGameConfig(gameId).name}. Press **Redeem for me** on the code again.`
                    : '⏳ Discord is slow right now. Press **Set up** again in a moment.',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const outcome = await getGachaRedemptionService().redeemOneForUser(interaction.user.id, gameId, code);

        const reply = outcome.status === 'not-subscribed'
            ? {
                content:
                    `${singleRedemptionText(gameId, code, outcome)} ` +
                    'Press **Set up** to add your account. Rapi will redeem this code and every other active one.',
                components: [setUpRow(gameId)],
            }
            : { content: singleRedemptionText(gameId, code, outcome) };

        try {
            await interaction.editReply(reply);
        } catch (error) {
            // The press may have queued behind a big run for longer than
            // Discord keeps the reply open (15 minutes). The work is done,
            // so tell them by DM instead.
            if (outcome.status !== 'done') throw error;
            await interaction.user.send({ content: reply.content }).catch(() => undefined);
        }
    } catch (error) {
        await handleCommandError(interaction, error, `coupon:${action}`);
    }
}

async function handleHelp(interaction: ChatInputCommandInteraction): Promise<void> {
    const isMod = await checkModPermission(interaction);

    const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('Coupon Redemption System Help')
        .setDescription('Automatically redeem coupon codes for supported gacha games.')
        .setTimestamp()
        .setFooter({ text: 'Gacha Coupon System', iconURL: ASSET_URLS.rapiBot.thumbnail });

    // User Commands Section
    embed.addFields({
        name: 'User Commands',
        value: [
            '`/redeem subscribe` - Subscribe to a game. Just pick the game: a form asks for anything else',
            '`/redeem edit` - Change your account details without losing your subscription',
            '`/redeem unsubscribe` - Unsubscribe from a game',
            '`/redeem status` - View your subscription status',
            '`/redeem codes` - View active coupon codes',
            '`/redeem preferences` - Configure notification settings',
            '`/redeem switch` - Switch between auto-redeem and notification modes',
        ].join('\n'),
    });

    // Modes FAQ
    embed.addFields({
        name: 'Subscription Modes',
        value: [
            '**Auto-Redeem** (default): Bot redeems codes for you (Brown Dust 2, Chaos Zero Nightmare)',
            '**Notification-Only**: Get DM alerts about new codes (all games)',
        ].join('\n'),
    });

    // Game-Specific Info - Brown Dust 2
    embed.addFields({
        name: 'Brown Dust 2',
        value: [
            '**Important**: Use your **in-game nickname**, NOT your UID!',
            'Find it in-game: Profile > Your display name',
            'Auto-redemption runs every 6 hours + immediately when new codes are added',
        ].join('\n'),
    });

    // Game-Specific Info - Chaos Zero Nightmare
    embed.addFields({
        name: 'Chaos Zero Nightmare',
        value: [
            'Needs three details, checked together by STOVE:',
            '• **STOVE membership number**: Lobby > Account > Account Settings (use the copy button)',
            '• **Character nickname**: top left of the Lobby, typed exactly',
            '• **Server**: Global or Asia',
            'When codes are active, the bot checks your details as you subscribe and lets you fix them.',
            'iOS players can\'t redeem codes in game, so auto-redeem is the easy route.',
        ].join('\n'),
    });

    // Game-Specific Info - Lost Sword
    embed.addFields({
        name: 'Lost Sword',
        value: [
            '**No account ID required** - Just subscribe to get notifications',
            '**Notification-only mode** - Codes must be redeemed in-game',
            'Redeem in-game: Settings > Account > Redeem Coupon',
            'React with ✅ on DM notifications to mark codes as redeemed',
        ].join('\n'),
    });

    // Preferences FAQ
    embed.addFields({
        name: 'Notification Preferences',
        value: [
            '**Expiration Warnings**: Daily alerts for codes expiring within 3 days',
            '**Weekly Digest**: Sunday summary of unredeemed codes',
            '**New Code Alerts**: Instant DM when new codes are added',
        ].join('\n'),
    });

    // Mod Commands Section (only if user is mod)
    if (isMod) {
        embed.addFields({
            name: 'Mod Commands',
            value: [
                '`/mod redeem add` - Add a new coupon code (home server only)',
                '`/mod redeem remove` - Deactivate a coupon code (home server only)',
                '`/mod redeem list` - View all codes with stats',
                '`/mod redeem trigger` - Manually trigger auto-redemption (home server only)',
                '`/mod redeem scrape` - Fetch new codes from Gachafeed and BD2 Pulse (home server only)',
                '`/mod redeem stats` - View analytics (home server only)',
                '`/mod redeem subscribers` - View paginated list of subscribers (home server only)',
                '`/mod redeem lookup` - View user subscription details (home server only)',
                '`/mod redeem unsub` - Force unsubscribe a user (home server only)',
                '`/mod redeem update` - Update user\'s game ID (home server only)',
                '`/mod redeem reset` - Reset user\'s redeemed codes (home server only)',
            ].join('\n'),
        });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// ==================== /mod redeem ====================

/** The moderator-only subcommands, in one place so /mod and the /redeem pointers stay in step. */
export const MOD_REDEEM_SUBCOMMANDS = [
    'add', 'remove', 'list', 'trigger', 'unsub', 'update', 'lookup', 'reset', 'scrape', 'stats', 'subscribers',
] as const;

/**
 * Add the moderator subcommands to a builder group. Used by /mod, which is
 * hidden from members, so these are never offered on the member-facing /redeem.
 */
export function addModRedeemSubcommands(group: SlashCommandSubcommandGroupBuilder): SlashCommandSubcommandGroupBuilder {
    return group
        // Mod: Add
        .addSubcommand(sub => sub
            .setName('add')
            .setDescription('Add a new coupon code')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game')
                .setRequired(true)
                .addChoices(...GAME_CHOICES))
            .addStringOption(opt => opt
                .setName('code')
                .setDescription('The coupon code')
                .setRequired(true)
                .setMaxLength(30))
            .addStringOption(opt => opt
                .setName('rewards')
                .setDescription('Reward description')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('expiration')
                .setDescription('Expiration date (YYYY-MM-DD or "never")')
                .setRequired(false))
            .addStringOption(opt => opt
                .setName('source')
                .setDescription('Where this code came from')
                .setRequired(false)))

        // Mod: Remove
        .addSubcommand(sub => sub
            .setName('remove')
            .setDescription('Remove a coupon code')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game')
                .setRequired(true)
                .addChoices(...GAME_CHOICES))
            .addStringOption(opt => opt
                .setName('code')
                .setDescription('Code to remove')
                .setRequired(true)
                .setAutocomplete(true)))

        // Mod: List
        .addSubcommand(sub => sub
            .setName('list')
            .setDescription('View all codes and stats')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game')
                .setRequired(true)
                .addChoices(...GAME_CHOICES))
            .addStringOption(opt => opt
                .setName('filter')
                .setDescription('Filter codes to display')
                .setRequired(false)
                .addChoices(
                    { name: 'All (default)', value: 'all' },
                    { name: 'Active Only', value: 'active' },
                    { name: 'Expired/Inactive Only', value: 'expired' }
                )))

        // Mod: Trigger
        .addSubcommand(sub => sub
            .setName('trigger')
            .setDescription('Manually trigger auto-redemption')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game')
                .setRequired(true)
                .addChoices(...GAME_CHOICES)))

        // Mod: Unsub (force unsubscribe a user)
        .addSubcommand(sub => sub
            .setName('unsub')
            .setDescription('Force unsubscribe a user')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to unsubscribe')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game')
                .setRequired(true)
                .addChoices(...GAME_CHOICES)))

        // Mod: Update (change user's game ID)
        .addSubcommand(sub => sub
            .setName('update')
            .setDescription('Update a user\'s game ID')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to update')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game')
                .setRequired(true)
                .addChoices(...GAME_CHOICES))
            .addStringOption(opt => opt
                .setName('userid')
                .setDescription('New game user ID')
                .setRequired(true)))

        // Mod: Lookup (view user's subscriptions)
        .addSubcommand(sub => sub
            .setName('lookup')
            .setDescription('View a user\'s subscriptions')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to lookup')
                .setRequired(true)))

        // Mod: Reset (reset redeemed codes)
        .addSubcommand(sub => sub
            .setName('reset')
            .setDescription('Reset a user\'s redeemed codes list')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to reset')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game')
                .setRequired(true)
                .addChoices(...GAME_CHOICES)))

        // Mod: Scrape (fetch codes from Gachafeed, then BD2 Pulse)
        .addSubcommand(sub => sub
            .setName('scrape')
            .setDescription('Fetch new codes from Gachafeed and BD2 Pulse'))

        // Mod: Stats (analytics)
        .addSubcommand(sub => sub
            .setName('stats')
            .setDescription('View redemption analytics and statistics')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Specific game (leave empty for system-wide)')
                .setRequired(false)
                .addChoices(...GAME_CHOICES)))

        // Mod: Subscribers (paginated list)
        .addSubcommand(sub => sub
            .setName('subscribers')
            .setDescription('View paginated list of subscribers for a game')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game')
                .setRequired(true)
                .addChoices(...GAME_CHOICES))
            .addStringOption(opt => opt
                .setName('mode')
                .setDescription('Filter by subscription mode')
                .setRequired(false)
                .addChoices(
                    { name: 'All', value: 'all' },
                    { name: '🤖 Auto-Redeem', value: 'auto-redeem' },
                    { name: '📬 Notification Only', value: 'notification-only' }
                )));
}

/**
 * Subcommands any allowlisted server may use. Coupons and subscriptions are
 * shared by every server, so everything else (including future subcommands)
 * is home-server only by default.
 */
const OPEN_EVERYWHERE: ReadonlySet<string> = new Set(['list']);

// Subcommands whose handlers answer with editReply, so the dispatcher defers
// first. list, trigger, scrape and subscribers defer inside their handlers.
const MOD_DEFERRED: ReadonlySet<string> = new Set(['add', 'remove', 'unsub', 'update', 'lookup', 'reset', 'stats']);
const MEMBER_DEFERRED: ReadonlySet<string> = new Set(['unsubscribe', 'status', 'codes', 'preferences', 'switch']);

const HOME_ONLY_WRITE_MESSAGE =
    'Coupon codes and subscriptions are shared by every server, so only moderators in the Rapi home server can change them. Ask a moderator there.';
const HOME_ONLY_DETAILS_MESSAGE =
    'Subscriber details cover every server, so only moderators in the Rapi home server can see them. Ask a moderator there.';
const HOME_ONLY_GENERIC_MESSAGE =
    'This covers every server, so only moderators in the Rapi home server can use it. Ask a moderator there.';

/**
 * /mod redeem <sub>. /mod has already checked the caller is a moderator, so
 * only the server allowlist is checked here.
 */
export async function executeModRedeem(interaction: ChatInputCommandInteraction): Promise<void> {
    const isAllowed = await getGachaGuildConfigService().isGuildAllowed(interaction.guildId);
    if (!isAllowed) {
        await interaction.reply({
            content: '❌ The gacha coupon system is not available on this server.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const subcommand = interaction.options.getSubcommand();
    if (!OPEN_EVERYWHERE.has(subcommand) && interaction.guildId !== HOME_GUILD_ID) {
        let content = HOME_ONLY_GENERIC_MESSAGE;
        if (['add', 'remove', 'trigger', 'unsub', 'update', 'reset', 'scrape'].includes(subcommand)) {
            content = HOME_ONLY_WRITE_MESSAGE;
        } else if (subcommand === 'subscribers' || subcommand === 'lookup') {
            content = HOME_ONLY_DETAILS_MESSAGE;
        }
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        return;
    }

    // These read storage before answering, which can outrun Discord's 3 seconds.
    if (MOD_DEFERRED.has(subcommand)) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    switch (subcommand) {
        case 'add': return handleModAdd(interaction);
        case 'remove': return handleModRemove(interaction);
        case 'list': return handleModList(interaction);
        case 'trigger': return handleModTrigger(interaction);
        case 'unsub': return handleModUnsub(interaction);
        case 'update': return handleModUpdate(interaction);
        case 'lookup': return handleModLookup(interaction);
        case 'reset': return handleModReset(interaction);
        case 'scrape': return handleModScrape(interaction);
        case 'stats': return handleModStats(interaction);
        case 'subscribers': return handleModSubscribers(interaction);
        default:
            await interaction.reply({ content: '❌ Unknown subcommand.', flags: MessageFlags.Ephemeral });
    }
}

/** Suggest active coupon codes for the game already chosen in the same command. */
export async function autocompleteRedeemCode(interaction: AutocompleteInteraction): Promise<void> {
    if (interaction.guildId !== HOME_GUILD_ID) {
        await interaction.respond([]);
        return;
    }

    const focusedOption = interaction.options.getFocused(true);
    if (focusedOption.name !== 'code') {
        await interaction.respond([]);
        return;
    }

    const gameIdInput = interaction.options.getString('game');
    const gameId = gameIdInput && isValidGameId(gameIdInput) ? validateGameId(gameIdInput) : null;
    if (!gameId) {
        await interaction.respond([]);
        return;
    }

    try {
        const coupons = await getGachaDataService().getActiveCoupons(gameId);
        const filtered = coupons
            .filter(c => c.code.toLowerCase().includes(focusedOption.value.toLowerCase()))
            .slice(0, 25)
            .map(c => ({ name: `${c.code} - ${c.rewards}`, value: c.code }));
        await interaction.respond(filtered);
    } catch {
        await interaction.respond([]);
    }
}

// ==================== Command Export ====================

const redeemData = new SlashCommandBuilder()
        .setName('redeem')
        .setDescription('Gacha game coupon redemption system')

        // User: Subscribe
        .addSubcommand(sub => sub
            .setName('subscribe')
            .setDescription('Subscribe to coupon notifications for a game')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game to subscribe to')
                .setRequired(true)
                .addChoices(...GAME_CHOICES))
            // Everything below is optional: leave it out and a form asks for
            // whatever the game needs, with hints. The options stay so
            // existing habits and copy-pasted commands keep working.
            .addStringOption(opt => opt
                .setName('mode')
                .setDescription('Optional. Auto-Redeem if the game supports it')
                .setRequired(false)
                .addChoices(
                    { name: '🤖 Auto-Redeem', value: 'auto-redeem' },
                    { name: '📬 Notification Only', value: 'notification-only' }
                ))
            .addStringOption(opt => opt
                .setName('userid')
                .setDescription('Optional, a form asks. BD2 nickname, or CZN STOVE membership number')
                .setRequired(false))
            // CZN validates membership number + nickname + world together.
            .addStringOption(opt => opt
                .setName('nickname')
                .setDescription('Optional, a form asks. CZN character nickname')
                .setRequired(false))
            .addStringOption(opt => opt
                .setName('server')
                .setDescription('Optional, a form asks. CZN server')
                .setRequired(false)
                .addChoices(
                    { name: 'Global', value: 'world_live_global' },
                    { name: 'Asia', value: 'world_live_asia' }
                )))

        // User: Unsubscribe
        .addSubcommand(sub => sub
            .setName('edit')
            .setDescription('Change your account details for a game, keeping your subscription')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game')
                .setRequired(true)
                .addChoices(...GAME_CHOICES)))

        .addSubcommand(sub => sub
            .setName('unsubscribe')
            .setDescription('Unsubscribe from a game')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game to unsubscribe from')
                .setRequired(true)
                .addChoices(...GAME_CHOICES)))

        // User: Status
        .addSubcommand(sub => sub
            .setName('status')
            .setDescription('View your subscription status')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Specific game (leave empty for all)')
                .setRequired(false)
                .addChoices(...GAME_CHOICES)))

        // User: Codes
        .addSubcommand(sub => sub
            .setName('codes')
            .setDescription('View available coupon codes')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game')
                .setRequired(true)
                .addChoices(...GAME_CHOICES)))

        // User: Preferences
        .addSubcommand(sub => sub
            .setName('preferences')
            .setDescription('Configure notification preferences for a game')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game')
                .setRequired(true)
                .addChoices(...GAME_CHOICES))
            .addBooleanOption(opt => opt
                .setName('expiration_warnings')
                .setDescription('Receive warnings when codes are about to expire')
                .setRequired(false))
            .addBooleanOption(opt => opt
                .setName('weekly_digest')
                .setDescription('Receive weekly summary of your codes')
                .setRequired(false))
            .addBooleanOption(opt => opt
                .setName('new_code_alerts')
                .setDescription('Get notified when new codes are added')
                .setRequired(false)))

        // User: Switch (change subscription mode)
        .addSubcommand(sub => sub
            .setName('switch')
            .setDescription('Switch subscription mode without re-subscribing')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game')
                .setRequired(true)
                .addChoices(...GAME_CHOICES))
            .addStringOption(opt => opt
                .setName('mode')
                .setDescription('New subscription mode')
                .setRequired(true)
                .addChoices(
                    { name: '🤖 Auto-Redeem', value: 'auto-redeem' },
                    { name: '📬 Notification Only', value: 'notification-only' }
                )))

        // User: Help
        .addSubcommand(sub => sub
            .setName('help')
            .setDescription('View help and FAQs about the coupon redemption system'));

// Moved to /mod redeem. Kept registered for one release so anyone who types the
// old command gets a pointer instead of "unknown command".
for (const name of MOD_REDEEM_SUBCOMMANDS) {
    redeemData.addSubcommand(sub => sub
        .setName(name)
        .setDescription(`Moved to /mod redeem ${name}`));
}

export default {
    data: redeemData,

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();

        // A pointer only: no permission or allowlist check needed.
        if ((MOD_REDEEM_SUBCOMMANDS as readonly string[]).includes(subcommand)) {
            await interaction.reply({
                content: `This moved to \`/mod redeem ${subcommand}\`.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Check if this server is allowed to use the gacha coupon system
        const guildConfigService = getGachaGuildConfigService();
        const isAllowed = await guildConfigService.isGuildAllowed(interaction.guildId);

        if (!isAllowed) {
            await interaction.reply({
                content: '❌ The gacha coupon system is not available on this server.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // subscribe and edit may open a form, which can't follow a defer.
        if (MEMBER_DEFERRED.has(subcommand)) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }

        switch (subcommand) {
            case 'subscribe': return handleSubscribe(interaction);
            case 'edit': return handleEdit(interaction);
            case 'unsubscribe': return handleUnsubscribe(interaction);
            case 'status': return handleStatus(interaction);
            case 'codes': return handleCodes(interaction);
            case 'preferences': return handlePreferences(interaction);
            case 'switch': return handleSwitch(interaction);
            case 'help': return handleHelp(interaction);
        }
    },

    // Nothing on /redeem autocompletes any more (the `code` option moved to
    // /mod redeem remove); kept so the router's autocomplete path still works.
    async autocomplete(interaction: AutocompleteInteraction) {
        await interaction.respond([]);
    }
};
