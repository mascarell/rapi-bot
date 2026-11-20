import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    Client,
    EmbedBuilder,
    Guild,
    NewsChannel,
    PermissionFlagsBits,
    TextChannel,
} from 'discord.js';
import { getGachaDataService } from './gachaDataService.js';
import { getGachaGuildConfigService } from './gachaGuildConfigService.js';
import { getGameConfig, getSupportedGameIds } from '../utils/data/gachaGamesConfig';
import { GachaCoupon, GachaGameId } from '../utils/interfaces/GachaCoupon.interface';
import { getAssetUrls } from '../config/assets.js';
import { logger } from '../utils/logger.js';

/**
 * Posts new coupon codes, and codes about to expire, in each game's channel
 * (`announceChannelNames` in the game config) so anyone can see them. Each
 * post carries buttons:
 *
 * - **Redeem for me** (auto-redeem games): redeems the code on the member's
 *   saved account, or opens the subscribe form if they have none.
 * - **Copy code**: replies to the member alone with just the code, which is
 *   one long-press to copy on mobile.
 * - **Redeem on website** (when the game has `manualRedeemUrl`).
 *
 * Buttons rather than reactions: a button can answer each member privately
 * and can open a form, and a reaction can do neither.
 *
 * Posts go to allowlisted servers only (`allowedGuildIds`), like every other
 * gacha feature. Nothing here ever throws: a missing channel or permission is
 * logged and the caller carries on with the DMs and redemptions.
 */

/** Prefix of every button custom id this feature owns. */
export const COUPON_BUTTON_PREFIX = 'coupon';

export type CouponButtonAction = 'redeem' | 'copy' | 'subscribe';

/** A code is warned about once, by the daily 09:00 UTC run, inside this window. */
export const EXPIRY_WARNING_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Discord's limit for a component's custom id. */
const MAX_CUSTOM_ID_LENGTH = 100;

/** Codes are letters, digits, `_` and `-`; anything else in a custom id is refused. */
const CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function couponButtonId(action: CouponButtonAction, gameId: GachaGameId, code = ''): string {
    const parts = [COUPON_BUTTON_PREFIX, action, gameId];
    if (code) parts.push(code);
    return parts.join(':');
}

/** Parse one of our custom ids, or null if it isn't one or doesn't hold up. */
export function parseCouponButtonId(
    customId: string
): { action: CouponButtonAction; gameId: GachaGameId; code: string } | null {
    const parts = customId.split(':');
    if (parts.length < 3 || parts.length > 4) return null;
    const [prefix, action, gameId, code = ''] = parts;
    if (prefix !== COUPON_BUTTON_PREFIX) return null;
    if (action !== 'redeem' && action !== 'copy' && action !== 'subscribe') return null;
    if (!(getSupportedGameIds() as string[]).includes(gameId)) return null;
    if (action !== 'subscribe' && !CODE_PATTERN.test(code)) return null;
    return { action, gameId: gameId as GachaGameId, code };
}

type PostKind = 'new' | 'expiring';

function unixSeconds(iso: string): number {
    return Math.floor(new Date(iso).getTime() / 1000);
}

function expiresWithinWindow(coupon: GachaCoupon, now = Date.now()): boolean {
    if (!coupon.expirationDate) return false;
    const left = new Date(coupon.expirationDate).getTime() - now;
    return left > 0 && left <= EXPIRY_WARNING_WINDOW_MS;
}

function truncate(text: string, max: number): string {
    return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** The embed and buttons for one post. Exported for tests. */
export function buildCouponPost(coupon: GachaCoupon, kind: PostKind, now = Date.now()) {
    const config = getGameConfig(coupon.gameId);
    const soon = kind === 'expiring' || expiresWithinWindow(coupon, now);

    const title = kind === 'expiring'
        ? `⏰ ${config.name} code expires soon`
        : `🆕 New ${config.name} code`;

    const lines = [`\`\`\`\n${coupon.code}\n\`\`\``];
    if (soon && coupon.expirationDate) {
        lines.push(`⚠️ **Expires <t:${unixSeconds(coupon.expirationDate)}:R>.** Redeem it today.`);
    }

    const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(title)
        .setThumbnail(config.logoPath)
        .setDescription(lines.join('\n'))
        .setFooter({
            text: config.supportsAutoRedeem
                ? 'Auto-redeem subscribers get this automatically. Anyone else: Redeem for me.'
                : 'Redeem it in game, or use Copy code.',
            iconURL: getAssetUrls().rapiBot.thumbnail,
        });

    if (coupon.rewards?.trim()) {
        embed.addFields({ name: 'Rewards', value: truncate(coupon.rewards.trim(), 1024) });
    }
    if (coupon.expirationDate) {
        const at = unixSeconds(coupon.expirationDate);
        embed.addFields({ name: 'Expires', value: `<t:${at}:f> (<t:${at}:R>)`, inline: true });
    }
    if (coupon.source) {
        embed.addFields({ name: 'Source', value: truncate(coupon.source, 1024), inline: true });
    }

    const buttons: ButtonBuilder[] = [];
    const redeemId = couponButtonId('redeem', coupon.gameId, coupon.code);
    const copyId = couponButtonId('copy', coupon.gameId, coupon.code);
    // A code too long for a custom id still gets posted, just without the
    // buttons that would need it.
    const fits = redeemId.length <= MAX_CUSTOM_ID_LENGTH && CODE_PATTERN.test(coupon.code);

    if (fits && config.supportsAutoRedeem) {
        buttons.push(new ButtonBuilder().setCustomId(redeemId).setLabel('Redeem for me').setEmoji('🎁').setStyle(ButtonStyle.Primary));
    }
    if (fits) {
        buttons.push(new ButtonBuilder().setCustomId(copyId).setLabel('Copy code').setEmoji('📋').setStyle(ButtonStyle.Secondary));
    }
    if (config.manualRedeemUrl) {
        buttons.push(new ButtonBuilder().setURL(config.manualRedeemUrl).setLabel('Redeem on website').setStyle(ButtonStyle.Link));
    }

    const components = buttons.length > 0
        ? [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)]
        : [];

    return { embeds: [embed], components };
}

/** The first of `names` that is a channel the bot can post in, or undefined. */
export function findAnnounceChannel(guild: Guild, names: ReadonlyArray<string>): TextChannel | NewsChannel | undefined {
    const me = guild.members.me;
    for (const name of names) {
        const channel = guild.channels.cache.find(
            (ch): ch is TextChannel | NewsChannel =>
                (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement) &&
                ch.name === name
        );
        if (!channel) continue;
        const allowed = me
            ? channel.permissionsFor(me)?.has([
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
            ])
            : false;
        if (allowed) return channel;
        logger.warn`[Coupon post] #${name} in ${guild.name} exists but the bot can't post there`;
    }
    return undefined;
}

export class CouponAnnouncementService {
    private static instance: CouponAnnouncementService;

    static getInstance(): CouponAnnouncementService {
        if (!CouponAnnouncementService.instance) {
            CouponAnnouncementService.instance = new CouponAnnouncementService();
        }
        return CouponAnnouncementService.instance;
    }

    /** `gameId:CODE` already given an expiry warning by this process. */
    private warned = new Set<string>();
    /** `gameId:CODE` → when this process posted it as new. */
    private announcedAt = new Map<string, number>();

    /** Post a newly found code. Returns how many channels it went to. */
    async announce(bot: Client, coupon: GachaCoupon): Promise<number> {
        this.announcedAt.set(`${coupon.gameId}:${coupon.code.toUpperCase()}`, Date.now());
        return this.post(bot, coupon, 'new');
    }

    /**
     * Post a warning for each of this game's codes that expires within a day.
     * Called by the daily 09:00 UTC expiry run, so each code falls in the
     * window on exactly one run and is warned about once, with nothing stored.
     */
    async warnExpiring(bot: Client, gameId: GachaGameId): Promise<number> {
        if (!getGameConfig(gameId).announceChannelNames?.length) return 0;
        let posted = 0;
        try {
            const expiring = await getGachaDataService().getExpiringCoupons(gameId, EXPIRY_WARNING_WINDOW_MS / 86_400_000);
            const now = Date.now();
            for (const coupon of expiring) {
                const key = `${gameId}:${coupon.code.toUpperCase()}`;
                // Once per code per process: development runs this every few
                // minutes, and mods can trigger it by hand. A code first
                // posted in the last day already carried the warning.
                if (this.warned.has(key)) continue;
                const announced = this.announcedAt.get(key);
                if (announced && now - announced < EXPIRY_WARNING_WINDOW_MS) continue;
                // Counted as warned only once it went somewhere, so a failed
                // post is tried again by the next run while there's time.
                const sent = await this.post(bot, coupon, 'expiring');
                if (sent > 0) this.warned.add(key);
                posted += sent;
            }
        } catch (error) {
            logger.error`[Coupon post] Expiry warnings for ${gameId} failed: ${error}`;
        }
        return posted;
    }

    /** Never throws: the DMs and redemptions that follow must always run. */
    private async post(bot: Client, coupon: GachaCoupon, kind: PostKind): Promise<number> {
        try {
            return await this.postUnguarded(bot, coupon, kind);
        } catch (error) {
            logger.error`[Coupon post] ${kind} ${coupon.gameId} ${coupon.code} wasn't posted: ${error}`;
            return 0;
        }
    }

    private async postUnguarded(bot: Client, coupon: GachaCoupon, kind: PostKind): Promise<number> {
        const names = getGameConfig(coupon.gameId).announceChannelNames;
        if (!names?.length) return 0;

        const guildIds = await getGachaGuildConfigService().getAllowedGuildIds();
        if (!Array.isArray(guildIds)) throw new Error('the server allowlist is not a list');

        const message = buildCouponPost(coupon, kind);
        let posted = 0;
        for (const guildId of guildIds) {
            const guild = bot.guilds.cache.get(guildId);
            if (!guild) continue;
            try {
                const channel = findAnnounceChannel(guild, names);
                if (!channel) continue;
                await channel.send(message);
                posted++;
            } catch (error) {
                logger.error`[Coupon post] Posting ${coupon.gameId} ${coupon.code} in ${guild.name} failed: ${error}`;
            }
        }
        logger.info`[Coupon post] ${kind} ${coupon.gameId} ${coupon.code}: posted in ${posted} channel(s)`;
        return posted;
    }
}

export const getCouponAnnouncementService = (): CouponAnnouncementService => CouponAnnouncementService.getInstance();
