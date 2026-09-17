import {
    ChannelType,
    Client,
    Guild,
    GuildMember,
    Message,
    PermissionFlagsBits,
    TextChannel,
} from 'discord.js';
import { EmbedTemplates } from '../utils/embedTemplates.js';
import { HONEYPOT_CONFIG } from '../utils/data/honeypotConfig.js';
import { logger } from '../utils/logger.js';

interface ActionResult {
    success: boolean;
    reason?: string;
}

/**
 * userId -> timestamp of the last action, so a burst of spam from one account
 * produces one ban attempt and one mod-log embed rather than a dozen.
 */
const recentlyActioned = new Map<string, number>();

/**
 * Members who will never be actioned, even if they post in the trap.
 *
 * Mirrors SlurModerationService.isPrivilegedMember, which is private to that
 * service. Kept as its own copy rather than exported from there so this feature
 * does not require an edit to the slur moderation path.
 */
function isPrivilegedMember(member: GuildMember, guild: Guild): boolean {
    if (member.id === guild.ownerId) return true;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    return member.roles.cache.some(r => r.name.toLowerCase() === 'mods');
}

function isHoneypotChannel(msg: Message): boolean {
    return (
        msg.channel.type === ChannelType.GuildText &&
        (msg.channel as TextChannel).name.toLowerCase() === HONEYPOT_CONFIG.CHANNEL_NAME
    );
}

function prune(now: number): void {
    for (const [userId, at] of recentlyActioned) {
        if (now - at >= HONEYPOT_CONFIG.RECENT_ACTION_TTL_MS) {
            recentlyActioned.delete(userId);
        }
    }
}

function findModLogChannel(guild: Guild): TextChannel | null {
    const channel = guild.channels.cache.find(
        c =>
            c.type === ChannelType.GuildText &&
            c.name.toLowerCase() === HONEYPOT_CONFIG.MOD_LOG_CHANNEL_NAME
    ) as TextChannel | undefined;
    return channel ?? null;
}

function reasonOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Bans with message deletion, then immediately unbans.
 *
 * The unban is what makes this recoverable, so a failure there is the one
 * outcome mods must not miss: the account stays banned until someone lifts it
 * by hand. It is reported separately rather than folded into the ban result.
 */
async function softban(
    guild: Guild,
    userId: string
): Promise<{ ban: ActionResult; unban: ActionResult }> {
    let ban: ActionResult;
    try {
        await guild.bans.create(userId, {
            deleteMessageSeconds: HONEYPOT_CONFIG.DELETE_MESSAGE_SECONDS,
            reason: HONEYPOT_CONFIG.BAN_REASON,
        });
        ban = { success: true };
    } catch (error) {
        return {
            ban: { success: false, reason: reasonOf(error) },
            unban: { success: false, reason: 'skipped, ban did not land' },
        };
    }

    try {
        await guild.bans.remove(userId, HONEYPOT_CONFIG.UNBAN_REASON);
        return { ban, unban: { success: true } };
    } catch (error) {
        return { ban, unban: { success: false, reason: reasonOf(error) } };
    }
}

async function postModLog(
    msg: Message,
    member: GuildMember | null,
    snapshot: string,
    ban: ActionResult,
    unban: ActionResult
): Promise<void> {
    const channel = findModLogChannel(msg.guild!);
    if (!channel) {
        logger.warning`[honeypot] no #${HONEYPOT_CONFIG.MOD_LOG_CHANNEL_NAME} channel in guild ${msg.guild?.id}; action went unlogged`;
        return;
    }

    const preview = snapshot.trim().slice(0, HONEYPOT_CONFIG.MESSAGE_PREVIEW_LENGTH);
    const createdTs = Math.floor(msg.author.createdTimestamp / 1000);
    const joinedTs = member?.joinedTimestamp
        ? Math.floor(member.joinedTimestamp / 1000)
        : null;

    const actions = [
        ban.success
            ? '✅ Banned, last 24h of messages purged'
            : `❌ Ban failed: ${ban.reason}`,
        unban.success
            ? '✅ Unbanned — softban complete, they can rejoin'
            : `🚨 Unban FAILED: ${unban.reason} — **this user is still banned**`,
    ].join('\n');

    const embed = EmbedTemplates.warning(
        '🍯 Honeypot Triggered',
        `<@${msg.author.id}> posted in <#${msg.channel.id}> and was softbanned.`
    )
        .addFields(
            {
                name: 'User',
                value: `${msg.author.tag} (\`${msg.author.id}\`)`,
                inline: false,
            },
            {
                name: 'Account Created',
                value: `<t:${createdTs}:R>`,
                inline: true,
            },
            {
                name: 'Joined Server',
                value: joinedTs ? `<t:${joinedTs}:R>` : 'unknown',
                inline: true,
            },
            {
                name: 'Message',
                value: preview ? `\`\`\`\n${preview}\n\`\`\`` : '_no text content_',
                inline: false,
            },
            {
                name: 'Actions',
                value: actions.slice(0, 1024),
                inline: false,
            }
        )
        .setFooter({ text: 'Honeypot auto-moderation' });

    try {
        await channel.send({ embeds: [embed] });
    } catch (error) {
        logger.error`[honeypot] mod-log post failed: ${error}`;
    }
}

/**
 * Softbans any non-exempt account that posts in the honeypot channel.
 *
 * Registered as its own messageCreate listener rather than called from
 * handleMessage, because that handler returns early on `msg.author.bot` and on
 * `msg.mentions.everyone` — and scam spam is overwhelmingly an @everyone with a
 * link, so the trap would never see the messages it exists to catch.
 */
export async function checkHoneypot(msg: Message): Promise<void> {
    try {
        if (!msg.guild || !isHoneypotChannel(msg)) return;

        // Never act on ourselves.
        if (msg.author.id === msg.client.user?.id) return;

        if (HONEYPOT_CONFIG.EXEMPT_BOTS && (msg.author.bot || msg.webhookId)) {
            logger.info`[honeypot] exempt bot/webhook ${msg.author.tag} posted in the trap; ignoring`;
            return;
        }

        const now = Date.now();
        prune(now);
        const lastActioned = recentlyActioned.get(msg.author.id);
        if (lastActioned !== undefined && now - lastActioned < HONEYPOT_CONFIG.RECENT_ACTION_TTL_MS) {
            return;
        }

        const member =
            msg.member ?? (await msg.guild.members.fetch(msg.author.id).catch(() => null));

        if (member && isPrivilegedMember(member, msg.guild)) {
            logger.info`[honeypot] privileged member ${msg.author.tag} posted in the trap; ignoring`;
            return;
        }

        // Fail loudly rather than silently doing nothing: a trap that cannot
        // ban is worse than no trap, because it looks like it is working.
        const me = msg.guild.members.me;
        if (!me?.permissions.has(PermissionFlagsBits.BanMembers)) {
            logger.error`[honeypot] missing Ban Members in guild ${msg.guild.id}; cannot action ${msg.author.tag}`;
            recentlyActioned.set(msg.author.id, now);
            await postModLog(
                msg,
                member,
                msg.content,
                { success: false, reason: 'Rapi is missing the Ban Members permission' },
                { success: false, reason: 'skipped, ban did not land' }
            );
            return;
        }

        // An account banned for some other reason must not be released by our
        // unban. If they are already banned they are already gone.
        const existingBan = await msg.guild.bans.fetch(msg.author.id).catch(() => null);
        if (existingBan) {
            logger.info`[honeypot] ${msg.author.tag} is already banned; leaving the existing ban alone`;
            return;
        }

        recentlyActioned.set(msg.author.id, now);

        // Snapshot before acting: the ban purges the message, and an edit-then-
        // delete race would otherwise leave the mod-log with nothing to show.
        const snapshot = msg.content;

        const { ban, unban } = await softban(msg.guild, msg.author.id);

        // deleteMessageSeconds normally takes the triggering message with it.
        // This is the fallback for when the ban itself failed.
        if (!ban.success) {
            await msg.delete().catch(() => {});
        }

        await postModLog(msg, member, snapshot, ban, unban);
    } catch (error) {
        // Never break message processing over the trap.
        logger.error`[honeypot] checkHoneypot failed in guild ${msg.guild?.id}: ${error}`;
    }
}

/** Test-only: clear the per-user action cooldown. */
export function resetHoneypotState(): void {
    recentlyActioned.clear();
}

function findHoneypotChannel(guild: Guild): TextChannel | null {
    const channel = guild.channels.cache.find(
        c =>
            c.type === ChannelType.GuildText &&
            c.name.toLowerCase() === HONEYPOT_CONFIG.CHANNEL_NAME
    ) as TextChannel | undefined;
    return channel ?? null;
}

/**
 * Posts and pins the warning in every guild's trap channel, editing the
 * existing one rather than stacking a new copy on each restart.
 *
 * The warning is what makes the trap fair: a member who reads the channel has
 * been told plainly what happens, so a ban is a consequence rather than an
 * ambush. Mirrors RulesManagementService.initializeRulesMessage — it never
 * throws, because a missing notice must not stop the bot from starting.
 */
export async function ensureHoneypotNotice(
    bot: Client
): Promise<{ posted: number; skipped: number }> {
    let posted = 0;
    let skipped = 0;

    for (const guild of bot.guilds.cache.values()) {
        const channel = findHoneypotChannel(guild);
        if (!channel) {
            skipped++;
            continue;
        }

        try {
            const embed = EmbedTemplates.warning(
                HONEYPOT_CONFIG.NOTICE_TITLE,
                HONEYPOT_CONFIG.NOTICE_BODY
            );

            const recent = await channel.messages.fetch({
                limit: HONEYPOT_CONFIG.NOTICE_SEARCH_LIMIT,
            });
            const existing = recent.find(m => m.author.id === bot.user?.id) ?? null;

            if (existing) {
                await existing.edit({ embeds: [embed] });
                if (!existing.pinned) {
                    await existing.pin().catch(error => {
                        logger.warning`[honeypot] could not pin notice in ${guild.name}: ${reasonOf(error)}`;
                    });
                }
            } else {
                const sent = await channel.send({ embeds: [embed] });
                await sent.pin().catch(error => {
                    logger.warning`[honeypot] could not pin notice in ${guild.name}: ${reasonOf(error)}`;
                });
            }

            posted++;
        } catch (error) {
            skipped++;
            logger.error`[honeypot] notice failed in guild ${guild.id}: ${reasonOf(error)}`;
        }
    }

    return { posted, skipped };
}
