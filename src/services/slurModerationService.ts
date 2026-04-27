import {
    Message,
    EmbedBuilder,
    ChannelType,
    PermissionFlagsBits,
    TextChannel,
    Guild,
    GuildMember,
} from 'discord.js';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import {
    RegExpMatcher,
    englishRecommendedTransformers,
    parseRawPattern,
    assignIncrementingIds,
} from 'obscenity';
import { createHash } from 'crypto';

import { s3Client, S3_BUCKET } from '../utils/cdn/config.js';
import { SLUR_MOD_CONFIG } from '../utils/data/slurModerationConfig.js';
import { preprocessMessage } from '../utils/messagePreprocessor.js';
import { EmbedTemplates, EmbedColors } from '../utils/embedTemplates.js';
import { logger } from '../utils/logger.js';

/* ==========================================================================
 *  Types
 * ========================================================================== */

interface SlurListDocument {
    schemaVersion: number;
    lastUpdated: string;
    notes?: string;
    slurs: string[];
}

interface OffenseHistoryEntry {
    at: string;
    matchedTerms: string[];
    contentPreview: string;
    channelId: string;
    messageId: string;
}

interface UserOffenses {
    count: number;
    firstOffenseAt: string;
    lastOffenseAt: string;
    history: OffenseHistoryEntry[];
}

interface GuildOffenseRecord {
    users: Record<string, UserOffenses>;
}

interface SlurOffenseStore {
    schemaVersion: number;
    lastUpdated: string;
    guilds: Record<string, GuildOffenseRecord>;
}

/* ==========================================================================
 *  Helpers
 * ========================================================================== */

/** Discord embed field values are capped at 1024 chars. Truncate with ellipsis. */
function capFieldValue(value: string, max = 1024): string {
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}…`;
}

/* ==========================================================================
 *  Service
 * ========================================================================== */

export class SlurModerationService {
    private static instance: SlurModerationService;

    // ----- slur list / matcher state -----
    private matcher: RegExpMatcher | null = null;
    private termIdToWord: Map<number, string> = new Map();
    private cachedListHash: string | null = null;
    private listCacheExpiry = 0;
    private lastFetchFailed = false;
    private lastDegradedNotifyAt = 0;
    private lastSuccessfulFetchAt: number | null = null;

    // ----- offense store state -----
    private offenseCache: SlurOffenseStore | null = null;
    private offenseCacheExpiry = 0;
    private dirtyOffenses = false;
    private flushTimer: NodeJS.Timeout | null = null;
    private userMutex = new Map<string, Promise<void>>();

    // ----- mod-log rate limit state -----
    private modLogLastSent = new Map<string, number>(); // `${guildId}:${userId}` → ts
    private suppressedCount = new Map<string, number>(); // same key → count

    private constructor() {}

    public static getInstance(): SlurModerationService {
        if (!SlurModerationService.instance) {
            SlurModerationService.instance = new SlurModerationService();
        }
        return SlurModerationService.instance;
    }

    /* --------------------------------------------------------------------
     * Public entry point
     * -------------------------------------------------------------------- */

    public async checkMessage(message: Message): Promise<void> {
        try {
            // Step 1-2: filter out non-guild / bot / DM-thread messages
            if (!message.guild?.id || !message.member || message.author.bot) return;
            if (message.channel.type !== ChannelType.GuildText) return;

            // Step 3: skip moderators / admins / owner
            if (this.isPrivilegedMember(message.member, message.guild)) return;

            // Step 4: skip if user already in a longer timeout
            const ts = message.member.communicationDisabledUntilTimestamp;
            if (ts && ts > Date.now() + SLUR_MOD_CONFIG.TIMEOUT_DURATION_MS) {
                return;
            }

            // Step 5: snapshot content BEFORE any await so edit-and-undo can't bypass logging
            const snapshot = message.content;

            // Step 6: ensure matcher is loaded; on S3 failure with no cache, no-op
            await this.ensureMatcher(message.guild);
            if (!this.matcher) return;

            // Step 7: preprocess + match
            const preprocessed = preprocessMessage(snapshot, {
                unwrapCodeBlocks: true,
                unwrapSpoilers: true,
            });
            const matches = this.matcher.getAllMatches(preprocessed);
            if (matches.length === 0) return;

            const matchedTerms = this.extractMatchedTerms(matches);

            // Step 8: three independent operations
            const timeoutResult = await this.applyTimeout(message.member);
            const offenses = await this.recordOffense(
                message.guild.id,
                message.author.id,
                matchedTerms,
                snapshot,
                message.channel.id,
                message.id
            );
            await this.postModLog(message, snapshot, matchedTerms, offenses, timeoutResult);
        } catch (error) {
            logger.error`[slur-mod] checkMessage failed: ${error}`;
        }
    }

    /**
     * Test-only: clear caches so next call refetches.
     */
    public clearCache(): void {
        this.matcher = null;
        this.termIdToWord.clear();
        this.cachedListHash = null;
        this.listCacheExpiry = 0;
        this.offenseCache = null;
        this.offenseCacheExpiry = 0;
        this.lastFetchFailed = false;
        this.lastDegradedNotifyAt = 0;
        this.lastSuccessfulFetchAt = null;
        this.modLogLastSent.clear();
        this.suppressedCount.clear();
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        this.dirtyOffenses = false;
    }

    public async getOffenses(guildId: string, userId: string): Promise<UserOffenses | null> {
        const store = await this.getOffenseStore();
        return store.guilds[guildId]?.users[userId] ?? null;
    }

    /* --------------------------------------------------------------------
     * Privilege check (member-based, since checkModPermission is interaction-only)
     * -------------------------------------------------------------------- */

    private isPrivilegedMember(member: GuildMember, guild: Guild): boolean {
        if (member.id === guild.ownerId) return true;
        if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
        return member.roles.cache.some(r => r.name.toLowerCase() === 'mods');
    }

    /* --------------------------------------------------------------------
     * Slur list fetch + matcher build
     * -------------------------------------------------------------------- */

    private async ensureMatcher(guild: Guild): Promise<void> {
        if (this.matcher && Date.now() < this.listCacheExpiry) return;

        let document: SlurListDocument;
        try {
            document = await this.fetchSlurListFromS3();
        } catch (error) {
            const reason = this.errorReason(error);
            logger.warn`[slur-mod] slur-list fetch failed: ${reason}`;
            await this.notifyDegraded(guild, reason);
            // Keep prior matcher if any. Push expiry forward so we don't hammer S3.
            this.listCacheExpiry = Date.now() + SLUR_MOD_CONFIG.CACHE_TTL_MS;
            this.lastFetchFailed = true;
            return;
        }

        // Successful fetch → if we were degraded, send recovery embed
        if (this.lastFetchFailed) {
            await this.notifyRecovered(guild);
            this.lastFetchFailed = false;
        }
        this.lastSuccessfulFetchAt = Date.now();

        const newHash = this.hashList(document.slurs);
        if (newHash !== this.cachedListHash) {
            this.rebuildMatcher(document.slurs);
            this.cachedListHash = newHash;
            logger.info`[slur-mod] slur list loaded — ${document.slurs.length} entries`;
        }
        this.listCacheExpiry = Date.now() + SLUR_MOD_CONFIG.CACHE_TTL_MS;
    }

    private async fetchSlurListFromS3(): Promise<SlurListDocument> {
        const response = await s3Client.send(
            new GetObjectCommand({
                Bucket: S3_BUCKET,
                Key: SLUR_MOD_CONFIG.SLUR_LIST_S3_KEY,
            })
        );
        const body = await response.Body?.transformToString();
        if (!body) throw new Error('S3 returned empty body for slur list');

        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch (error) {
            throw new Error(`JSON parse error: ${(error as Error).message}`);
        }
        const doc = parsed as Partial<SlurListDocument>;
        if (
            typeof doc !== 'object' ||
            doc === null ||
            doc.schemaVersion !== SLUR_MOD_CONFIG.SLUR_LIST_SCHEMA_VERSION ||
            !Array.isArray(doc.slurs)
        ) {
            throw new Error(
                `Malformed slur list document — expected schemaVersion ${SLUR_MOD_CONFIG.SLUR_LIST_SCHEMA_VERSION} and string[] slurs`
            );
        }
        return doc as SlurListDocument;
    }

    private rebuildMatcher(slurs: string[]): void {
        const normalized = slurs
            .map(s => s.trim().toLowerCase())
            .filter(s => s.length > 0);

        // Word-boundary assertions (`|...|`) prevent the Scunthorpe problem:
        // `spic` no longer matches inside `spicy`, `coon` doesn't match `tycoon`,
        // `paki` doesn't match `Pakistan`, `fag` doesn't match `flag`, etc.
        // `|` is a literal in obscenity's pattern syntax used only at term
        // boundaries — strip any embedded pipes from the input as a safety guard
        // since slur terms shouldn't contain pipes anyway.
        const blacklistedTerms = assignIncrementingIds(
            normalized.map(s => parseRawPattern(`|${s.replace(/\|/g, '')}|`))
        );

        this.termIdToWord = new Map(
            blacklistedTerms.map((bt, idx) => [bt.id, normalized[idx]])
        );

        this.matcher = new RegExpMatcher({
            blacklistedTerms,
            ...englishRecommendedTransformers,
        });
    }

    private hashList(list: string[]): string {
        const sorted = [...list].map(s => s.trim().toLowerCase()).sort().join('\n');
        return createHash('sha256').update(sorted).digest('hex');
    }

    private extractMatchedTerms(
        matches: ReturnType<RegExpMatcher['getAllMatches']>
    ): string[] {
        const seen = new Set<string>();
        for (const m of matches) {
            const word = this.termIdToWord.get(m.termId);
            if (word) seen.add(word);
        }
        return [...seen];
    }

    /* --------------------------------------------------------------------
     * Discord timeout
     * -------------------------------------------------------------------- */

    private async applyTimeout(
        member: GuildMember
    ): Promise<{ success: true } | { success: false; reason: string }> {
        try {
            await member.timeout(
                SLUR_MOD_CONFIG.TIMEOUT_DURATION_MS,
                SLUR_MOD_CONFIG.TIMEOUT_REASON
            );
            return { success: true };
        } catch (error: any) {
            const code = error?.code;
            let reason: string;
            if (code === 50013) {
                reason = 'Bot lacks Moderate Members permission';
            } else if (code === 50001) {
                reason = 'Missing access (target may be owner or outrank bot)';
            } else if (code === 10007) {
                reason = 'User no longer in server';
            } else {
                reason = error?.message || String(error);
            }
            logger.warn`[slur-mod] timeout failed for ${member.user.tag}: ${reason}`;
            return { success: false, reason };
        }
    }

    /* --------------------------------------------------------------------
     * Offense persistence
     * -------------------------------------------------------------------- */

    private async recordOffense(
        guildId: string,
        userId: string,
        matchedTerms: string[],
        content: string,
        channelId: string,
        messageId: string
    ): Promise<UserOffenses> {
        const key = `${guildId}:${userId}`;
        // .catch swallows prior failures so one error doesn't break the lock chain
        // for subsequent callers (they should still be able to record their offense).
        const previous = (this.userMutex.get(key) ?? Promise.resolve()).catch(() => {});

        let resolveNext: () => void = () => {};
        const next = new Promise<void>(resolve => {
            resolveNext = resolve;
        });
        const chained = previous.then(() => next);
        this.userMutex.set(key, chained);

        try {
            await previous;
            return await this.recordOffenseLocked(
                guildId,
                userId,
                matchedTerms,
                content,
                channelId,
                messageId
            );
        } finally {
            resolveNext();
            // Reference-equal compare against the same chained promise (not a fresh .then call)
            if (this.userMutex.get(key) === chained) {
                this.userMutex.delete(key);
            }
        }
    }

    private async recordOffenseLocked(
        guildId: string,
        userId: string,
        matchedTerms: string[],
        content: string,
        channelId: string,
        messageId: string
    ): Promise<UserOffenses> {
        const store = await this.getOffenseStore();
        store.guilds[guildId] ??= { users: {} };
        const guildBucket = store.guilds[guildId];
        const now = new Date().toISOString();

        const existing = guildBucket.users[userId];
        const updated: UserOffenses = existing
            ? {
                  count: existing.count + 1,
                  firstOffenseAt: existing.firstOffenseAt,
                  lastOffenseAt: now,
                  history: [...existing.history],
              }
            : {
                  count: 1,
                  firstOffenseAt: now,
                  lastOffenseAt: now,
                  history: [],
              };

        updated.history.push({
            at: now,
            matchedTerms,
            contentPreview: content.slice(0, SLUR_MOD_CONFIG.MESSAGE_PREVIEW_LENGTH),
            channelId,
            messageId,
        });
        if (updated.history.length > SLUR_MOD_CONFIG.HISTORY_CAP) {
            updated.history = updated.history.slice(-SLUR_MOD_CONFIG.HISTORY_CAP);
        }

        guildBucket.users[userId] = updated;
        store.lastUpdated = now;
        this.dirtyOffenses = true;
        this.scheduleFlush();
        return updated;
    }

    private async getOffenseStore(): Promise<SlurOffenseStore> {
        if (this.offenseCache && Date.now() < this.offenseCacheExpiry) {
            return this.offenseCache;
        }
        try {
            const response = await s3Client.send(
                new GetObjectCommand({
                    Bucket: S3_BUCKET,
                    Key: SLUR_MOD_CONFIG.OFFENSES_S3_KEY,
                })
            );
            const body = await response.Body?.transformToString();
            this.offenseCache = body ? (JSON.parse(body) as SlurOffenseStore) : this.emptyStore();
        } catch (error: any) {
            if (error?.name === 'NoSuchKey' || error?.Code === 'NoSuchKey') {
                this.offenseCache = this.emptyStore();
            } else {
                logger.warn`[slur-mod] offense store fetch failed, using fresh: ${error}`;
                this.offenseCache = this.emptyStore();
            }
        }
        // Sanity: ensure top-level shape
        if (!this.offenseCache.guilds) this.offenseCache.guilds = {};
        this.offenseCacheExpiry = Date.now() + SLUR_MOD_CONFIG.CACHE_TTL_MS;
        return this.offenseCache;
    }

    private emptyStore(): SlurOffenseStore {
        return {
            schemaVersion: SLUR_MOD_CONFIG.OFFENSES_SCHEMA_VERSION,
            lastUpdated: new Date().toISOString(),
            guilds: {},
        };
    }

    private scheduleFlush(): void {
        if (this.flushTimer) return;
        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            void this.flushOffenses();
        }, SLUR_MOD_CONFIG.WRITE_DEBOUNCE_MS);
    }

    private async flushOffenses(): Promise<void> {
        if (!this.dirtyOffenses || !this.offenseCache) return;
        try {
            await s3Client.send(
                new PutObjectCommand({
                    Bucket: S3_BUCKET,
                    Key: SLUR_MOD_CONFIG.OFFENSES_S3_KEY,
                    Body: JSON.stringify(this.offenseCache, null, 2),
                    ContentType: 'application/json',
                })
            );
            this.dirtyOffenses = false;
        } catch (error) {
            logger.error`[slur-mod] offense store flush failed: ${error}`;
            // Re-arm the timer so a transient S3 outage doesn't strand pending
            // offenses in memory until the next user trips the moderation.
            this.scheduleFlush();
        }
    }

    /* --------------------------------------------------------------------
     * Mod-log embed
     * -------------------------------------------------------------------- */

    private async postModLog(
        message: Message,
        snapshot: string,
        matchedTerms: string[],
        offenses: UserOffenses,
        timeoutResult: { success: true } | { success: false; reason: string }
    ): Promise<void> {
        try {
            const channel = this.findModLogChannel(message.guild!);
            if (!channel) return; // already-warned channel-missing case is handled at fetch time

            const userKey = `${message.guild!.id}:${message.author.id}`;
            const lastSent = this.modLogLastSent.get(userKey) ?? 0;
            const now = Date.now();

            if (now - lastSent < SLUR_MOD_CONFIG.MOD_LOG_RATE_LIMIT_PER_USER_MS) {
                this.suppressedCount.set(userKey, (this.suppressedCount.get(userKey) ?? 0) + 1);
                return;
            }

            const suppressed = this.suppressedCount.get(userKey) ?? 0;
            this.suppressedCount.delete(userKey);
            this.modLogLastSent.set(userKey, now);

            const embed = this.buildModLogEmbed(
                message,
                snapshot,
                matchedTerms,
                offenses,
                timeoutResult,
                suppressed
            );
            await channel.send({ embeds: [embed] });
        } catch (error) {
            logger.error`[slur-mod] mod-log post failed: ${error}`;
        }
    }

    private buildModLogEmbed(
        message: Message,
        snapshot: string,
        matchedTerms: string[],
        offenses: UserOffenses,
        timeoutResult: { success: true } | { success: false; reason: string },
        suppressed: number
    ): EmbedBuilder {
        const member = message.member!;
        const author = message.author;

        const previewLength = SLUR_MOD_CONFIG.MESSAGE_PREVIEW_LENGTH;
        const truncated =
            snapshot.length > previewLength
                ? `${snapshot.slice(0, previewLength)}…`
                : snapshot;
        // Break inner spoiler pairs with a zero-width joiner so they don't close
        // the outer ||...|| wrap when rendered. Escaping with backslashes does
        // not work for spoiler markers in Discord embeds.
        const safeContent = truncated.replace(/\|\|/g, '|​|');

        const accountCreatedTs = Math.floor(author.createdTimestamp / 1000);
        const joinedTs = member.joinedTimestamp
            ? Math.floor(member.joinedTimestamp / 1000)
            : null;

        const roleNames = member.roles.cache
            .filter(r => r.id !== message.guild!.id) // exclude @everyone
            .sort((a, b) => b.position - a.position)
            .map(r => r.name);
        const roleSummary = capFieldValue(
            roleNames.length === 0
                ? 'None'
                : roleNames.length <= 5
                ? roleNames.map(n => `\`${n}\``).join(', ')
                : `${roleNames.slice(0, 5).map(n => `\`${n}\``).join(', ')} +${roleNames.length - 5} more`
        );

        const offenseEmoji = offenses.count >= 3 ? '⚠️ ' : '';

        const embed = EmbedTemplates.warning('🚨 Slur Detected — User Timed Out')
            .setColor(EmbedColors.ERROR)
            .setAuthor({
                name: `${author.tag} (${author.id})`,
                iconURL: author.displayAvatarURL(),
            })
            .setDescription(`||${safeContent}||`)
            .addFields(
                {
                    name: 'User',
                    value: `<@${author.id}> \`${author.tag}\` \`${author.id}\``,
                    inline: false,
                },
                {
                    name: 'Account Created',
                    value: `<t:${accountCreatedTs}:R>`,
                    inline: true,
                },
                {
                    name: 'Joined Server',
                    value: joinedTs ? `<t:${joinedTs}:R>` : 'Unknown',
                    inline: true,
                },
                {
                    name: `Roles (${roleNames.length})`,
                    value: roleSummary,
                    inline: false,
                },
                {
                    name: 'Total Offenses',
                    value: `${offenseEmoji}${offenses.count}`,
                    inline: true,
                },
                {
                    name: 'Channel',
                    value: `<#${message.channel.id}>`,
                    inline: true,
                },
                {
                    name: 'Matched Term(s)',
                    value: capFieldValue(
                        matchedTerms.map(t => `||${t}||`).join(', ') || 'unknown'
                    ),
                    inline: false,
                },
                {
                    name: 'Action',
                    value: timeoutResult.success
                        ? `Timed out for 30 min`
                        : `Timeout failed: ${timeoutResult.reason} — manual action needed`,
                    inline: false,
                }
            )
            .setFooter({
                text: 'Auto-moderation',
            });

        if (offenses.count >= 2) {
            const firstTs = Math.floor(new Date(offenses.firstOffenseAt).getTime() / 1000);
            embed.addFields({
                name: 'First Offense',
                value: `<t:${firstTs}:R>`,
                inline: true,
            });
        }

        if (suppressed > 0) {
            embed.addFields({
                name: 'Suppressed Since Last Alert',
                value: `${suppressed} additional offense${suppressed === 1 ? '' : 's'}`,
                inline: false,
            });
        }

        // Jump link in description footer-style (clickable, doesn't fit setFooter url)
        embed.addFields({
            name: 'Jump',
            value: `[Go to message](${message.url})`,
            inline: false,
        });

        return embed;
    }

    /* --------------------------------------------------------------------
     * Mod channel resolution & degraded notifications
     * -------------------------------------------------------------------- */

    private findModLogChannel(guild: Guild): TextChannel | null {
        const channel = guild.channels.cache.find(
            c =>
                c.type === ChannelType.GuildText &&
                c.name.toLowerCase() === SLUR_MOD_CONFIG.MOD_LOG_CHANNEL_NAME
        ) as TextChannel | undefined;
        return channel ?? null;
    }

    private async notifyDegraded(guild: Guild, reason: string): Promise<void> {
        const now = Date.now();
        if (now - this.lastDegradedNotifyAt < SLUR_MOD_CONFIG.DEGRADED_NOTIFY_COOLDOWN_MS) {
            return;
        }
        this.lastDegradedNotifyAt = now;
        const channel = this.findModLogChannel(guild);
        if (!channel) return;

        const cachedFor = this.lastSuccessfulFetchAt
            ? `<t:${Math.floor(this.lastSuccessfulFetchAt / 1000)}:R>`
            : '_no cache available — detection disabled_';

        const embed = EmbedTemplates.error(
            '⚠️ Slur Moderation Degraded',
            `Failed to refresh slur list from S3. Detection is currently using cached list from ${cachedFor}.`
        )
            .addFields(
                { name: 'Reason', value: reason.slice(0, 1024), inline: false },
                {
                    name: 'Action',
                    value: `Check S3 path \`${SLUR_MOD_CONFIG.SLUR_LIST_S3_KEY}\` or check bot logs.`,
                    inline: false,
                }
            );

        try {
            await channel.send({ embeds: [embed] });
        } catch (error) {
            logger.error`[slur-mod] degraded notify failed: ${error}`;
        }
    }

    private async notifyRecovered(guild: Guild): Promise<void> {
        const channel = this.findModLogChannel(guild);
        if (!channel) return;
        const embed = EmbedTemplates.success(
            '✅ Slur Moderation Restored',
            'List reloaded from S3.'
        );
        try {
            await channel.send({ embeds: [embed] });
        } catch (error) {
            logger.error`[slur-mod] recovery notify failed: ${error}`;
        }
    }

    /* --------------------------------------------------------------------
     * Helpers
     * -------------------------------------------------------------------- */

    private errorReason(error: unknown): string {
        if (error instanceof Error) {
            const code = (error as any).Code || (error as any).name;
            return code ? `${code}: ${error.message}` : error.message;
        }
        return String(error);
    }
}

export const getSlurModerationService = (): SlurModerationService =>
    SlurModerationService.getInstance();
