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

/** One server's own list, edited through `/mod slur`. */
interface GuildFilterDocument {
    schemaVersion: number;
    guildId: string;
    lastUpdated: string;
    /** Who made the last change, as `tag (id)`. */
    updatedBy?: string;
    terms: string[];
}

interface GuildFilterEntry {
    built: BuiltMatcher | null;
    terms: string[];
    expiry: number;
}

export interface FilterOverview {
    /** Count only; the built-in terms are not shown to server moderators. */
    builtInCount: number;
    builtInLoaded: boolean;
    builtInDegraded: boolean;
    server: { terms: string[]; lastUpdated?: string; updatedBy?: string };
}

export interface FilterPreview {
    /** How many built-in terms matched (not which). */
    builtInMatches: number;
    /** This server's terms that matched. */
    serverMatches: string[];
    /** Candidate terms that matched (and aren't already on the server list). */
    candidateMatches: string[];
    builtInLoaded: boolean;
}

export interface FilterEditResult {
    /** Terms actually added or removed. */
    changed: string[];
    /** Terms already on this server's list (add) or not on it (remove). */
    unchanged: string[];
    /** Terms on the built-in list, which a server can neither add nor remove. */
    builtIn: string[];
    /** Server list size after the edit. */
    total: number;
}

export type TermValidation = { ok: true; term: string } | { ok: false; reason: string };

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

type ActionResult = { success: true } | { success: false; reason: string };

/* ==========================================================================
 *  Helpers
 * ========================================================================== */

/** Discord embed field values are capped at 1024 chars. Truncate with ellipsis. */
function capFieldValue(value: string, max = 1024): string {
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}…`;
}

/** Comparison form of a list entry: trimmed, lowercased, single-spaced. */
function canonicalTerm(raw: string): string {
    return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Characters that are pattern syntax in obscenity, not literals: `?` is a
 * wildcard, `[...]` is optional, `\` escapes and `|` is a word boundary. A
 * moderator typing `wh?t` would get a wildcard, and a stray `\` or an
 * all-optional `[x]` makes the matcher throw.
 */
const PATTERN_SYNTAX = /[\\[\]?|]/;

/**
 * Punctuation hugging the edge of a word is replaced with a neutral `.`
 * rather than deleted. obscenity's leetspeak transformer reads `!` as `i` and
 * `(` as `c`, so `term!` became `termi` and `(term)` became `cterm`, and both
 * slipped past the word boundary. Replacing (not deleting) keeps sentence
 * breaks intact, so a two-word term can't be stitched together across
 * `foo, bar` or `foo (bar)`. Mid-word leetspeak (`t3rm`, `te$t`) is untouched
 * here and still caught by the transformers on the unmodified text.
 */
function neutraliseEdgePunctuation(text: string): string {
    return text
        .replace(/(^|\s)[^\p{L}\p{N}\s]+/gu, '$1.')
        .replace(/[^\p{L}\p{N}\s]+(?=\s|$)/gu, '.');
}

/** The same preprocessing the live message path applies. */
function preprocessForMatch(text: string): string {
    return preprocessMessage(text, { unwrapCodeBlocks: true, unwrapSpoilers: true });
}

function compileOne(pattern: string): RegExpMatcher {
    // Word-boundary assertions (`|...|`) prevent the Scunthorpe problem:
    // `spic` no longer matches inside `spicy`, `coon` doesn't match `tycoon`,
    // `paki` doesn't match `Pakistan`, `fag` doesn't match `flag`, etc.
    return new RegExpMatcher({
        blacklistedTerms: assignIncrementingIds([parseRawPattern(`|${pattern}|`)]),
        ...englishRecommendedTransformers,
    });
}

const MAX_DOUBLED_RUNS = 6;

/**
 * The spelling to compile so that `term` matches messages containing `term`,
 * or null if no spelling does.
 *
 * obscenity transforms the message but not the term: it collapses most
 * doubled letters, reads digits and some symbols as letters, and drops
 * accents. So a term like `kitty` compiles fine and then never matches, not
 * even the word `kitty`. The fix is to compile the spelling the matcher will
 * actually see. Rather than hard-code obscenity's rules, this tries the term
 * and then collapsed variants of its doubled letters, fewest collapses first,
 * and keeps the first one that matches the term's own spelling. A term
 * nothing matches (accented letters, non-Latin scripts) returns null.
 */
export function matcherReading(term: string): string | null {
    const text = preprocessForMatch(term);
    const matchesSelf = (spelling: string) => {
        try {
            const matcher = compileOne(spelling);
            return matcher.hasMatch(text) || matcher.hasMatch(neutraliseEdgePunctuation(text));
        } catch {
            return false;
        }
    };

    if (matchesSelf(term)) return term;

    const runs = [...term.matchAll(/(\p{L})\1+/gu)].map(m => ({ at: m.index!, length: m[0].length }));
    if (runs.length === 0 || runs.length > MAX_DOUBLED_RUNS) return null;

    const subsets = Array.from({ length: (1 << runs.length) - 1 }, (_, i) => i + 1).sort(
        (a, b) => popcount(a) - popcount(b) || a - b
    );
    for (const subset of subsets) {
        let spelling = '';
        let cursor = 0;
        runs.forEach((run, i) => {
            spelling += term.slice(cursor, run.at);
            spelling += subset & (1 << i) ? term[run.at] : term.slice(run.at, run.at + run.length);
            cursor = run.at + run.length;
        });
        spelling += term.slice(cursor);
        if (matchesSelf(spelling)) return spelling;
    }
    return null;
}

function popcount(n: number): number {
    let count = 0;
    for (; n; n &= n - 1) count++;
    return count;
}

/**
 * Validate and normalise a term a moderator wants to add. Shared by the
 * command (to explain a rejection before confirming) and the service (which
 * never writes an unvalidated term). Reasons read after "it".
 */
export function normalizeFilterTerm(raw: string): TermValidation {
    if (!/[\p{L}\p{N}]/u.test(raw)) {
        return { ok: false, reason: 'has no letters or digits' };
    }
    if (PATTERN_SYNTAX.test(raw.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))) {
        return { ok: false, reason: 'contains one of \\ [ ] ? | which the matcher treats as pattern syntax' };
    }
    // Punctuation at either end can never be part of a match ("zorb!" is read
    // as "zorbi"), so the moderator almost certainly meant the word itself.
    const term = canonicalTerm(raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''));
    if (term.length < SLUR_MOD_CONFIG.MIN_TERM_LENGTH) {
        return {
            ok: false,
            reason: `is shorter than ${SLUR_MOD_CONFIG.MIN_TERM_LENGTH} characters, which would catch far too many messages`,
        };
    }
    if (term.length > SLUR_MOD_CONFIG.MAX_TERM_LENGTH) {
        return { ok: false, reason: `is longer than ${SLUR_MOD_CONFIG.MAX_TERM_LENGTH} characters` };
    }
    if (matcherReading(term) === null) {
        return {
            ok: false,
            reason:
                "can't be matched as typed. The matcher reads accented and non-Latin letters, and digits or " +
                'symbols used as letters, differently, so this would never catch anything. Use plain letters: ' +
                'swaps like 0 for o are already caught',
        };
    }
    return { ok: true, term };
}

/**
 * Who counts as a moderator: exempt from auto-moderation, and allowed to use
 * `/mod`. Discord permissions come first so this works in any server the bot
 * is in; the `mods` role is the home servers' convention and still counts.
 */
export function isFilterModerator(member: Pick<GuildMember, 'permissions' | 'roles'>): boolean {
    return (
        member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
        member.roles.cache.some(r => r.name.toLowerCase() === 'mods')
    );
}

interface BuiltMatcher {
    matcher: RegExpMatcher;
    termIdToWord: Map<number, string>;
    /** Entries left out: not strings, unparseable, or never able to match. */
    skipped: string[];
}

/**
 * Compile a list into a word-boundary matcher. Each entry is compiled and
 * checked on its own (see matcherReading), so one malformed or unmatchable
 * entry, possible in a hand-edited S3 document, is skipped and reported
 * instead of taking every other term down with it.
 */
function buildMatcher(entries: unknown[]): BuiltMatcher {
    const terms: string[] = [];
    const patterns: ReturnType<typeof parseRawPattern>[] = [];
    const skipped: string[] = [];
    const seen = new Set<string>();

    for (const entry of entries) {
        if (typeof entry !== 'string') {
            skipped.push(String(entry));
            continue;
        }
        const term = canonicalTerm(entry);
        if (term.length === 0 || seen.has(term)) continue;
        seen.add(term);

        const reading = matcherReading(term);
        if (reading === null) {
            skipped.push(entry);
            continue;
        }
        patterns.push(parseRawPattern(`|${reading}|`));
        terms.push(term);
    }

    const blacklistedTerms = assignIncrementingIds(patterns);
    return {
        matcher: new RegExpMatcher({ blacklistedTerms, ...englishRecommendedTransformers }),
        // Report the term as listed, not the spelling compiled for it.
        termIdToWord: new Map(blacklistedTerms.map((bt, idx) => [bt.id, terms[idx]])),
        skipped,
    };
}

/** Every distinct list term found in `text`, checking both readings of it. */
function findMatchedTerms(built: Pick<BuiltMatcher, 'matcher' | 'termIdToWord'>, text: string): string[] {
    const seen = new Set<string>();
    const variants = new Set([text, neutraliseEdgePunctuation(text)]);
    for (const variant of variants) {
        for (const match of built.matcher.getAllMatches(variant)) {
            const word = built.termIdToWord.get(match.termId);
            if (word) seen.add(word);
        }
    }
    return [...seen];
}

/* ==========================================================================
 *  Service
 * ========================================================================== */

export class SlurModerationService {
    private static instance: SlurModerationService;

    // ----- slur list / matcher state -----
    private matcher: RegExpMatcher | null = null;
    private termIdToWord: Map<number, string> = new Map();
    /** The compiled terms, kept so a dry run can add a candidate to them. */
    private currentTerms: string[] = [];
    private cachedListHash: string | null = null;
    /** Serialises list edits: two moderators must not each overwrite the other's change. */
    private listWriteChain: Promise<unknown> = Promise.resolve();
    /** Per-server lists, keyed by guild id. One small entry per server that sees messages. */
    private guildFilters = new Map<string, GuildFilterEntry>();
    /** In-flight fetches per server, so concurrent cache misses share one S3 read. */
    private guildFetches = new Map<string, Promise<GuildFilterEntry>>();
    /** Bumped on every saved edit; a fetch begun before the bump is discarded. */
    private guildGeneration = new Map<string, number>();
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

            // Step 6: load the built-in list and this server's own list. On S3
            // failure with nothing cached for either, no-op.
            await this.ensureMatcher(message.guild);
            const guildFilter = await this.ensureGuildFilter(message.guild.id);
            if (!this.matcher && !guildFilter.built) return;

            // Step 7: preprocess + match against both
            const preprocessed = preprocessForMatch(snapshot);
            const matchedTerms = this.matchAll(preprocessed, guildFilter);
            if (matchedTerms.length === 0) return;

            // Step 8: independent action steps — each wrapped so a failure in one
            // doesn't unwind the others. Order: timeout → DM the offender →
            // delete the offending message → record offense → post mod-log.
            // DM is sent BEFORE the message is deleted so the user can see what
            // they posted that triggered the action (Discord doesn't preserve
            // message content after deletion in DMs).
            const timeoutResult = await this.applyTimeout(message.member);
            const dmResult = await this.dmOffender(message, snapshot, matchedTerms);
            const deleteResult = await this.deleteOffendingMessage(message);
            const offenses = await this.recordOffense(
                message.guild.id,
                message.author.id,
                matchedTerms,
                snapshot,
                message.channel.id,
                message.id
            );
            await this.postModLog(
                message,
                snapshot,
                matchedTerms,
                offenses,
                timeoutResult,
                dmResult,
                deleteResult
            );
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
        this.currentTerms = [];
        this.cachedListHash = null;
        this.listWriteChain = Promise.resolve();
        this.guildFilters.clear();
        this.guildFetches.clear();
        this.guildGeneration.clear();
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
     * Privilege check
     * -------------------------------------------------------------------- */

    private isPrivilegedMember(member: GuildMember, guild: Guild): boolean {
        if (member.id === guild.ownerId) return true;
        return isFilterModerator(member);
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
        // Set before compiling, so a list that fails to compile is retried on
        // the TTL rather than refetched on every message.
        this.listCacheExpiry = Date.now() + SLUR_MOD_CONFIG.CACHE_TTL_MS;

        const newHash = this.hashList(document.slurs);
        if (newHash !== this.cachedListHash) {
            try {
                this.rebuildMatcher(document.slurs);
                this.cachedListHash = newHash;
                logger.info`[slur-mod] slur list loaded — ${document.slurs.length} entries`;
            } catch (error) {
                // Entries are checked one by one in buildMatcher, so this is a
                // last line of defence. Keep the previous matcher and tell the mods.
                const reason = `List could not be compiled: ${this.errorReason(error)}`;
                logger.error`[slur-mod] ${reason}`;
                await this.notifyDegraded(guild, reason);
            }
        }
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

    private rebuildMatcher(slurs: unknown[]): void {
        const built = buildMatcher(slurs);
        if (built.skipped.length > 0) {
            // Count only: the list is not printed into logs.
            logger.warn`[slur-mod] skipped ${built.skipped.length} built-in list entr${built.skipped.length === 1 ? 'y' : 'ies'} that can never match (malformed, or accented / non-Latin text)`;
        }
        this.matcher = built.matcher;
        this.termIdToWord = built.termIdToWord;
        this.currentTerms = [...built.termIdToWord.values()];
    }

    private hashList(list: unknown[]): string {
        const sorted = list
            .map(s => (typeof s === 'string' ? canonicalTerm(s) : String(s)))
            .sort()
            .join('\n');
        return createHash('sha256').update(sorted).digest('hex');
    }

    /* --------------------------------------------------------------------
     * Per-server lists (`/mod slur`)
     *
     * The built-in list above is Rapi's own, applies in every server, and is
     * edited only in S3 by the maintainer. Each server's moderators keep a
     * second list of their own, which applies only in that server. That split
     * is what makes the commands safe to offer to every server the bot is in:
     * nothing a moderator does reaches anyone else's community.
     *
     * Every edit re-reads the server's document from S3 rather than trusting
     * the cache, and edits go through one in-process lock so two moderators
     * editing at once both land. If the read fails for any reason except
     * "this server has no list yet", the edit is refused: writing a list
     * rebuilt from cache would silently drop whatever the cache had missed.
     * -------------------------------------------------------------------- */

    private guildListKey(guildId: string): string {
        // Guild IDs come from Discord, but this is an S3 key: refuse anything
        // that isn't a snowflake rather than trust it.
        if (!/^\d{1,25}$/.test(guildId)) throw new Error(`Invalid guild id: ${guildId}`);
        return `${SLUR_MOD_CONFIG.GUILD_LIST_S3_PREFIX}${guildId}.json`;
    }

    /** The server's document, or null when it has never had a list. */
    private async fetchGuildList(guildId: string): Promise<GuildFilterDocument | null> {
        let body: string | undefined;
        try {
            const response = await s3Client.send(
                new GetObjectCommand({ Bucket: S3_BUCKET, Key: this.guildListKey(guildId) })
            );
            body = await response.Body?.transformToString();
        } catch (error: any) {
            if (error?.name === 'NoSuchKey' || error?.Code === 'NoSuchKey') return null;
            throw error;
        }
        if (!body) throw new Error('S3 returned an empty body for the server list');

        let parsed: Partial<GuildFilterDocument>;
        try {
            parsed = JSON.parse(body);
        } catch (error) {
            throw new Error(`JSON parse error: ${(error as Error).message}`);
        }
        if (
            typeof parsed !== 'object' ||
            parsed === null ||
            parsed.schemaVersion !== SLUR_MOD_CONFIG.GUILD_LIST_SCHEMA_VERSION ||
            parsed.guildId !== guildId ||
            !Array.isArray(parsed.terms)
        ) {
            throw new Error(
                `Malformed server list — expected schemaVersion ${SLUR_MOD_CONFIG.GUILD_LIST_SCHEMA_VERSION}, this guild's id and string[] terms`
            );
        }
        return parsed as GuildFilterDocument;
    }

    private setGuildFilter(guildId: string, terms: unknown[]): GuildFilterEntry {
        const built = terms.length > 0 ? buildMatcher(terms) : null;
        if (built && built.skipped.length > 0) {
            logger.warn`[slur-mod] guild ${guildId}: skipped ${built.skipped.length} list entries that can never match`;
        }
        const entry: GuildFilterEntry = {
            built,
            terms: built ? [...built.termIdToWord.values()] : [],
            expiry: Date.now() + SLUR_MOD_CONFIG.CACHE_TTL_MS,
        };
        this.guildFilters.set(guildId, entry);
        return entry;
    }

    /**
     * The server's compiled list, refreshed on the same TTL as the built-in
     * one. A server with no list is cached as empty, so the hundreds of
     * servers that never use the feature cost one S3 miss per TTL, not one per
     * message. On a failed fetch the previous list stays in force.
     *
     * Concurrent misses for one server share a single fetch. A fetch that
     * started before an edit was saved is discarded when it lands: otherwise
     * a slow read could put back a term a moderator had just removed, and it
     * would keep timing people out until the next refresh.
     */
    private ensureGuildFilter(guildId: string): Promise<GuildFilterEntry> {
        const cached = this.guildFilters.get(guildId);
        if (cached && Date.now() < cached.expiry) return Promise.resolve(cached);

        const inFlight = this.guildFetches.get(guildId);
        if (inFlight) return inFlight;

        const generation = this.guildGeneration.get(guildId) ?? 0;
        const fetch = (async () => {
            try {
                const doc = await this.fetchGuildList(guildId);
                if ((this.guildGeneration.get(guildId) ?? 0) !== generation) {
                    return this.guildFilters.get(guildId)!;
                }
                return this.setGuildFilter(guildId, doc?.terms ?? []);
            } catch (error) {
                logger.warn`[slur-mod] guild ${guildId} list fetch failed: ${this.errorReason(error)}`;
                const kept: GuildFilterEntry = this.guildFilters.get(guildId) ?? { built: null, terms: [], expiry: 0 };
                kept.expiry = Date.now() + SLUR_MOD_CONFIG.CACHE_TTL_MS;
                this.guildFilters.set(guildId, kept);
                return kept;
            } finally {
                this.guildFetches.delete(guildId);
            }
        })();
        this.guildFetches.set(guildId, fetch);
        return fetch;
    }

    /** Built-in matches plus this server's matches, de-duplicated. */
    private matchAll(text: string, guildFilter: GuildFilterEntry): string[] {
        const found = new Set<string>();
        if (this.matcher) {
            for (const t of findMatchedTerms({ matcher: this.matcher, termIdToWord: this.termIdToWord }, text)) found.add(t);
        }
        if (guildFilter.built) {
            for (const t of findMatchedTerms(guildFilter.built, text)) found.add(t);
        }
        return [...found];
    }

    private withListLock<T>(work: () => Promise<T>): Promise<T> {
        const run = this.listWriteChain.then(work, work);
        this.listWriteChain = run.catch(() => {});
        return run;
    }

    private async readGuildListForEdit(guildId: string): Promise<GuildFilterDocument> {
        try {
            return (
                (await this.fetchGuildList(guildId)) ?? {
                    schemaVersion: SLUR_MOD_CONFIG.GUILD_LIST_SCHEMA_VERSION,
                    guildId,
                    lastUpdated: new Date().toISOString(),
                    terms: [],
                }
            );
        } catch (error) {
            throw new Error(
                `Couldn't read this server's slur list, so nothing was changed. ${this.errorReason(error)}`
            );
        }
    }

    private async writeGuildList(doc: GuildFilterDocument): Promise<void> {
        await s3Client.send(
            new PutObjectCommand({
                Bucket: S3_BUCKET,
                Key: this.guildListKey(doc.guildId),
                Body: JSON.stringify(doc, null, 2),
                ContentType: 'application/json',
            })
        );
        // Any fetch already in flight read the old list; make it stand down.
        this.guildGeneration.set(doc.guildId, (this.guildGeneration.get(doc.guildId) ?? 0) + 1);
        // Live straight away rather than after the cache TTL.
        this.setGuildFilter(doc.guildId, doc.terms);
    }

    /**
     * This server's list as S3 has it now, and how many built-in terms are in
     * force. The built-in terms themselves are not returned: the bot is public,
     * anyone can make a server and become its moderator, and the list should
     * not be readable by everyone who does.
     */
    public async getFilterOverview(guild: Guild): Promise<FilterOverview> {
        await this.ensureMatcher(guild);
        const doc = await this.readGuildListForEdit(guild.id);
        return {
            builtInCount: this.currentTerms.length,
            builtInLoaded: this.matcher !== null,
            builtInDegraded: this.lastFetchFailed,
            server: {
                terms: doc.terms.filter((s): s is string => typeof s === 'string').map(canonicalTerm),
                lastUpdated: doc.terms.length > 0 ? doc.lastUpdated : undefined,
                updatedBy: doc.updatedBy,
            },
        };
    }

    /** This server's terms from cache, for autocomplete (which must answer in 3 s). */
    public async getServerTerms(guildId: string): Promise<string[]> {
        return [...(await this.ensureGuildFilter(guildId)).terms];
    }

    public async addServerTerms(guild: Guild, rawTerms: string[], actor: string): Promise<FilterEditResult> {
        const terms = rawTerms.map(raw => {
            const result = normalizeFilterTerm(raw);
            if (!result.ok) throw new Error(`"${raw}" can't be added: it ${result.reason}.`);
            return result.term;
        });
        await this.ensureMatcher(guild);
        const builtInSet = new Set(this.currentTerms);

        return this.withListLock(async () => {
            const doc = await this.readGuildListForEdit(guild.id);
            const existing = new Set(
                doc.terms.filter((s): s is string => typeof s === 'string').map(canonicalTerm)
            );
            const result: FilterEditResult = { changed: [], unchanged: [], builtIn: [], total: doc.terms.length };
            for (const term of terms) {
                if (builtInSet.has(term)) {
                    if (!result.builtIn.includes(term)) result.builtIn.push(term);
                } else if (existing.has(term)) {
                    if (!result.unchanged.includes(term)) result.unchanged.push(term);
                } else {
                    existing.add(term);
                    result.changed.push(term);
                }
            }
            if (result.changed.length === 0) return result;

            if (doc.terms.length + result.changed.length > SLUR_MOD_CONFIG.MAX_LIST_SIZE) {
                throw new Error(
                    `This server's list is capped at ${SLUR_MOD_CONFIG.MAX_LIST_SIZE} terms and has ${doc.terms.length}.`
                );
            }
            const updated: GuildFilterDocument = {
                ...doc,
                terms: [...doc.terms, ...result.changed],
                lastUpdated: new Date().toISOString(),
                updatedBy: actor,
            };
            await this.writeGuildList(updated);
            logger.info`[slur-mod] guild ${guild.id}: ${actor} added ${result.changed.length} term(s); list now ${updated.terms.length}`;
            return { ...result, total: updated.terms.length };
        });
    }

    public async removeServerTerms(guild: Guild, rawTerms: string[], actor: string): Promise<FilterEditResult> {
        const targets = [...new Set(rawTerms.map(canonicalTerm).filter(t => t.length > 0))];
        await this.ensureMatcher(guild);
        const builtInSet = new Set(this.currentTerms);

        return this.withListLock(async () => {
            const doc = await this.readGuildListForEdit(guild.id);
            const present = new Set(
                doc.terms.filter((s): s is string => typeof s === 'string').map(canonicalTerm)
            );
            const result: FilterEditResult = { changed: [], unchanged: [], builtIn: [], total: doc.terms.length };
            for (const term of targets) {
                if (present.has(term)) result.changed.push(term);
                else if (builtInSet.has(term)) result.builtIn.push(term);
                else result.unchanged.push(term);
            }
            if (result.changed.length === 0) return result;

            const removing = new Set(result.changed);
            const updated: GuildFilterDocument = {
                ...doc,
                terms: doc.terms.filter(s => typeof s !== 'string' || !removing.has(canonicalTerm(s))),
                lastUpdated: new Date().toISOString(),
                updatedBy: actor,
            };
            await this.writeGuildList(updated);
            logger.info`[slur-mod] guild ${guild.id}: ${actor} removed ${result.changed.length} term(s); list now ${updated.terms.length}`;
            return { ...result, total: updated.terms.length };
        });
    }

    /**
     * Dry run: which terms would `text` trip in this server, through exactly
     * the live matching path (preprocessing, word boundaries, leetspeak, edge
     * punctuation). `candidates` count for this check only, so a moderator can
     * see what a term would catch before saving it. Takes no action.
     *
     * Built-in matches are counted, not named, for the reason given on
     * getFilterOverview.
     */
    public async previewMatches(guild: Guild, text: string, candidates: string[] = []): Promise<FilterPreview> {
        await this.ensureMatcher(guild);
        const guildFilter = await this.ensureGuildFilter(guild.id);
        const preprocessed = preprocessForMatch(text);

        const builtIn = this.matcher
            ? findMatchedTerms({ matcher: this.matcher, termIdToWord: this.termIdToWord }, preprocessed)
            : [];
        const server = guildFilter.built ? findMatchedTerms(guildFilter.built, preprocessed) : [];
        const candidate =
            candidates.length > 0 ? findMatchedTerms(buildMatcher(candidates), preprocessed) : [];

        return {
            builtInMatches: builtIn.length,
            serverMatches: server,
            candidateMatches: candidate.filter(t => !server.includes(t)),
            builtInLoaded: this.matcher !== null,
        };
    }

    /* --------------------------------------------------------------------
     * Discord timeout
     * -------------------------------------------------------------------- */

    private async applyTimeout(
        member: GuildMember
    ): Promise<ActionResult> {
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
     * DM the offender + delete the offending message
     * -------------------------------------------------------------------- */

    private async dmOffender(
        message: Message,
        snapshot: string,
        matchedTerms: string[]
    ): Promise<ActionResult> {
        try {
            const guildName = message.guild?.name ?? 'the server';
            const channelMention = `<#${message.channel.id}>`;
            const previewLength = SLUR_MOD_CONFIG.MESSAGE_PREVIEW_LENGTH;
            const truncated =
                snapshot.length > previewLength
                    ? `${snapshot.slice(0, previewLength)}…`
                    : snapshot;
            // Defang inner spoiler markers so the outer ||...|| wrap renders correctly
            const safeContent = truncated.replace(/\|\|/g, '|​|');

            const embed = EmbedTemplates.warning('⚠️ Auto-Moderation Notice')
                .setColor(EmbedColors.WARNING)
                .setDescription(
                    `Your message in **${guildName}** has been removed for violating community rules ` +
                        `and you have been timed out for **30 minutes**.`
                )
                .addFields(
                    {
                        name: 'Channel',
                        value: channelMention,
                        inline: true,
                    },
                    {
                        name: 'Matched Term(s)',
                        value: matchedTerms.map(t => `||${t}||`).join(', ') || 'unknown',
                        inline: true,
                    },
                    {
                        name: 'Your Message',
                        value: `||${safeContent}||`,
                        inline: false,
                    },
                    {
                        name: 'If you think this is a mistake',
                        value:
                            'Please reach out to any moderator for further assistance. ' +
                            'This violation has been reported to the moderation team.',
                        inline: false,
                    }
                )
                .setFooter({ text: 'Auto-moderation' });

            await message.author.send({ embeds: [embed] });
            return { success: true };
        } catch (error: any) {
            const code = error?.code;
            let reason: string;
            if (code === 50007) {
                reason = 'Cannot send DMs to this user (DMs disabled or blocked)';
            } else {
                reason = error?.message || String(error);
            }
            logger.warn`[slur-mod] DM offender failed for ${message.author.tag}: ${reason}`;
            return { success: false, reason };
        }
    }

    private async deleteOffendingMessage(
        message: Message
    ): Promise<ActionResult> {
        try {
            await message.delete();
            return { success: true };
        } catch (error: any) {
            const code = error?.code;
            let reason: string;
            if (code === 10008) {
                reason = 'Message already deleted';
            } else if (code === 50013) {
                reason = 'Bot lacks Manage Messages permission';
            } else {
                reason = error?.message || String(error);
            }
            logger.warn`[slur-mod] delete message failed (${message.id}): ${reason}`;
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
        timeoutResult: ActionResult,
        dmResult: ActionResult,
        deleteResult: ActionResult
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
                dmResult,
                deleteResult,
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
        timeoutResult: ActionResult,
        dmResult: ActionResult,
        deleteResult: ActionResult,
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
                    name: 'Actions',
                    value: capFieldValue(
                        [
                            timeoutResult.success
                                ? '✅ Timed out for 30 min'
                                : `❌ Timeout failed: ${timeoutResult.reason}`,
                            deleteResult.success
                                ? '✅ Message deleted'
                                : `❌ Delete failed: ${deleteResult.reason}`,
                            dmResult.success
                                ? '✅ DM sent to user'
                                : `⚠️ DM not delivered: ${dmResult.reason}`,
                        ].join('\n')
                    ),
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
