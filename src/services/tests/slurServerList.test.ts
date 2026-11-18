import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

vi.mock('../../utils/cdn/config', () => ({
    s3Client: { send: vi.fn() },
    S3_BUCKET: 'test-bucket',
}));

vi.mock('../../config/assets', () => ({
    getAssetUrls: () => ({
        rapiBot: { thumbnail: 'https://example.com/thumb.png' },
        nikke: { logo: 'https://example.com/nikke.png' },
    }),
}));

import { s3Client } from '../../utils/cdn/config';
import { SLUR_MOD_CONFIG } from '../../utils/data/slurModerationConfig';
import {
    getSlurModerationService,
    normalizeFilterTerm,
} from '../slurModerationService';

/* Placeholder terms only — real slurs are never written into test files. */
const BUILT_IN = 'fooslurbar';
const SERVER_TERM = 'zorptest';
const OTHER_TERM = 'quuxtest';

const GUILD_A = '111111111111111111';
const GUILD_B = '222222222222222222';
const keyFor = (guildId: string) => `${SLUR_MOD_CONFIG.GUILD_LIST_S3_PREFIX}${guildId}.json`;

/** In-memory S3: key -> JSON body. */
let store: Map<string, string>;
let puts: { key: string; body: any }[];
let failReadsFor: Set<string>;
/** A read of this key returns what S3 held when it started, but only once the promise resolves. */
let heldReads: Map<string, Promise<void>>;

function noSuchKey() {
    const err: any = new Error('The specified key does not exist.');
    err.name = 'NoSuchKey';
    return err;
}

function installS3() {
    vi.mocked(s3Client.send).mockImplementation(async (command: any) => {
        const kind = command?.constructor?.name;
        const key: string = command.input.Key;
        if (kind === 'GetObjectCommand') {
            if (failReadsFor.has(key)) throw new Error('S3 is having a bad day');
            const body = store.get(key);
            const hold = heldReads.get(key);
            if (hold) {
                heldReads.delete(key);
                await hold;
            }
            if (body === undefined) throw noSuchKey();
            return { Body: { transformToString: async () => body } };
        }
        if (kind === 'PutObjectCommand') {
            store.set(key, command.input.Body);
            puts.push({ key, body: JSON.parse(command.input.Body) });
            return {};
        }
        return {};
    });
}

function setBuiltIn(slurs: unknown[]) {
    store.set(
        SLUR_MOD_CONFIG.SLUR_LIST_S3_KEY,
        JSON.stringify({ schemaVersion: 1, lastUpdated: new Date().toISOString(), slurs })
    );
}

function setServerList(guildId: string, terms: string[], overrides: Record<string, unknown> = {}) {
    store.set(
        keyFor(guildId),
        JSON.stringify({ schemaVersion: 1, guildId, lastUpdated: new Date().toISOString(), terms, ...overrides })
    );
}

function makeGuild(id = GUILD_A) {
    const modLog = {
        id: 'modlog',
        type: ChannelType.GuildText,
        name: 'moderator-only',
        send: vi.fn().mockResolvedValue({ id: 'x' }),
    };
    return {
        id,
        name: `Guild ${id.slice(0, 3)}`,
        ownerId: 'owner-id',
        channels: { cache: { find: (p: (c: any) => boolean) => (p(modLog) ? modLog : undefined) } },
    } as any;
}

interface MemberOpts { canModerate?: boolean; isMod?: boolean }

function makeMessage(content: string, guild = makeGuild(), opts: MemberOpts = {}) {
    const timeout = vi.fn().mockResolvedValue(undefined);
    const roles = [{ id: guild.id, name: '@everyone', position: 0 }];
    if (opts.isMod) roles.push({ id: 'mods', name: 'mods', position: 5 });
    const member: any = {
        id: 'user-1',
        user: { id: 'user-1', tag: 'User#0001', displayAvatarURL: () => 'https://example.com/a.png' },
        roles: {
            cache: {
                some: (p: (r: any) => boolean) => roles.some(p),
                filter: (p: (r: any) => boolean) => {
                    const f = roles.filter(p);
                    return { sort: () => f, size: f.length };
                },
                size: roles.length,
            },
        },
        permissions: {
            has: (perm: bigint) => opts.canModerate === true && perm === PermissionFlagsBits.ModerateMembers,
        },
        timeout,
        communicationDisabledUntilTimestamp: null,
        joinedTimestamp: 1700000000000,
    };
    const message: any = {
        id: 'msg-1',
        content,
        guild,
        member,
        author: { ...member.user, bot: false, createdTimestamp: 1500000000000, send: vi.fn().mockResolvedValue({}) },
        channel: { id: 'chan-1', type: ChannelType.GuildText, name: 'general', send: vi.fn() },
        url: 'https://discord.com/channels/x/y/z',
        delete: vi.fn().mockResolvedValue(undefined),
    };
    return { message, timeout };
}

const service = getSlurModerationService();

beforeEach(() => {
    vi.clearAllMocks();
    service.clearCache();
    store = new Map();
    puts = [];
    failReadsFor = new Set();
    heldReads = new Map();
    installS3();
    setBuiltIn([BUILT_IN]);
});

describe('normalizeFilterTerm', () => {
    it('lowercases, trims and collapses spaces', () => {
        expect(normalizeFilterTerm('  Zorp   Test ')).toEqual({ ok: true, term: 'zorp test' });
    });

    it.each([
        ['ab', 'shorter than'],
        ['x'.repeat(SLUR_MOD_CONFIG.MAX_TERM_LENGTH + 1), 'longer than'],
        ['wh?tever', 'pattern syntax'],
        ['zo[r]p', 'pattern syntax'],
        ['zo\\rp', 'pattern syntax'],
        ['zo|rp', 'pattern syntax'],
        ['!!!', 'no letters or digits'],
        // Accented and non-Latin letters: obscenity folds or drops them, so
        // the term could never match itself.
        ['zörbtest', "can't be matched"],
        ['ばななてすと', "can't be matched"],
        ['사과나무테스트', "can't be matched"],
        // Digits are read as letters (0 as o, 1 as i...), so a term with digits
        // never matches itself. Known limit: numeric codes can't be listed.
        ['zorbtest99', "can't be matched"],
    ])('rejects %j', (input, reason) => {
        const result = normalizeFilterTerm(input);
        expect(result.ok).toBe(false);
        expect((result as { reason: string }).reason).toContain(reason);
    });

    it('drops punctuation at the ends, which could never be part of a match', () => {
        expect(normalizeFilterTerm('(ZorpTest)!')).toEqual({ ok: true, term: 'zorptest' });
    });

    it('accepts a term with doubled letters (which obscenity collapses in messages)', () => {
        expect(normalizeFilterTerm('zappatest')).toEqual({ ok: true, term: 'zappatest' });
    });
});

describe('every accepted term matches itself', () => {
    // The point of the self-match check: no term is reported "live" that can
    // never catch anything.
    it.each(['zorptest', 'zappatest', 'summittest', 'two wordtest'])(
        '%j, once added, catches a message containing it',
        async term => {
            const guild = makeGuild(GUILD_A);
            const result = normalizeFilterTerm(term);
            expect(result.ok).toBe(true);
            await service.addServerTerms(guild, [term], 'Mod');

            for (const text of [term, `hey ${term}!`, `(${term})`]) {
                const { message, timeout } = makeMessage(text, guild);
                await service.checkMessage(message);
                expect(timeout, text).toHaveBeenCalled();
            }
        }
    );

    it('a doubled-letter built-in term now matches (it silently never did)', async () => {
        setBuiltIn(['zappatest']);
        const { message, timeout } = makeMessage('you zappatest');
        await service.checkMessage(message);
        expect(timeout).toHaveBeenCalled();
    });
});

describe('matching hardening', () => {
    it.each([`${BUILT_IN}!`, `(${BUILT_IN})`, `${BUILT_IN}!!!`, `you ${BUILT_IN}!`, `"${BUILT_IN}"`])(
        'catches %j: punctuation at the edge of a word no longer hides it',
        async text => {
            const { message, timeout } = makeMessage(text);
            await service.checkMessage(message);
            expect(timeout).toHaveBeenCalled();
        }
    );

    it.each([`x${BUILT_IN}x`, `${BUILT_IN}s`, `pre${BUILT_IN}`])(
        'still does not match %j inside a longer word (word boundaries kept)',
        async text => {
            const { message, timeout } = makeMessage(text);
            await service.checkMessage(message);
            expect(timeout).not.toHaveBeenCalled();
        }
    );

    it('does not stitch a two-word term together across a sentence break', async () => {
        setBuiltIn(['zorp test']);
        for (const text of ['zorp, test', 'zorp. test', 'zorp! test', 'zorp (test)', 'zorp - test']) {
            const { message, timeout } = makeMessage(text);
            await service.checkMessage(message);
            expect(timeout, text).not.toHaveBeenCalled();
        }
        for (const text of ['zorp test', 'zorp test!', '(zorp test)']) {
            const { message, timeout } = makeMessage(text);
            await service.checkMessage(message);
            expect(timeout, text).toHaveBeenCalled();
        }
    });

    it.each([
        ['an all-optional pattern, which makes obscenity throw', '[x]'],
        ['a stray escape', 'zo\\'],
        ['a non-string', 42],
    ])('skips a built-in entry that is %s, instead of disabling every other term', async (_label, bad) => {
        setBuiltIn([bad, BUILT_IN]);
        const { message, timeout } = makeMessage(`hello ${BUILT_IN}`);
        await service.checkMessage(message);
        expect(timeout).toHaveBeenCalled();
    });

    it('exempts members with Timeout Members, as it does admins and the mods role', async () => {
        const { message, timeout } = makeMessage(BUILT_IN, makeGuild(), { canModerate: true });
        await service.checkMessage(message);
        expect(timeout).not.toHaveBeenCalled();
    });
});

describe('per-server lists', () => {
    it("acts on a server's own term in that server only", async () => {
        setServerList(GUILD_A, [SERVER_TERM]);

        const inA = makeMessage(`a ${SERVER_TERM}`, makeGuild(GUILD_A));
        await service.checkMessage(inA.message);
        expect(inA.timeout).toHaveBeenCalled();

        const inB = makeMessage(`a ${SERVER_TERM}`, makeGuild(GUILD_B));
        await service.checkMessage(inB.message);
        expect(inB.timeout).not.toHaveBeenCalled();
    });

    it('applies the built-in list in a server with no list of its own', async () => {
        const { message, timeout } = makeMessage(BUILT_IN, makeGuild(GUILD_B));
        await service.checkMessage(message);
        expect(timeout).toHaveBeenCalled();
    });

    it('never builds an S3 key from a guild id that is not a snowflake', async () => {
        const { message } = makeMessage('hello', makeGuild('../../slur-list'));
        await service.checkMessage(message);
        const keys = vi.mocked(s3Client.send).mock.calls.map(([c]: any) => c.input.Key);
        expect(keys.some((k: string) => k.includes('..'))).toBe(false);
    });

    it("keeps a server's last good list in force when a refresh fails", async () => {
        setServerList(GUILD_A, [SERVER_TERM]);
        const first = makeMessage(SERVER_TERM, makeGuild(GUILD_A));
        await service.checkMessage(first.message);
        expect(first.timeout).toHaveBeenCalled();

        failReadsFor.add(keyFor(GUILD_A));
        (service as any).guildFilters.get(GUILD_A).expiry = 0;
        const second = makeMessage(SERVER_TERM, makeGuild(GUILD_A));
        await service.checkMessage(second.message);
        expect(second.timeout).toHaveBeenCalled();
    });

    it('a slow refresh that read the old list cannot undo a removal saved meanwhile', async () => {
        const guild = makeGuild(GUILD_A);
        setServerList(GUILD_A, [SERVER_TERM]);
        await service.getServerTerms(GUILD_A);
        (service as any).guildFilters.get(GUILD_A).expiry = 0;

        // A message triggers a refresh whose S3 read returns the OLD list, slowly.
        let release!: () => void;
        heldReads.set(keyFor(GUILD_A), new Promise<void>(r => (release = r)));
        const slowRefresh = service.getServerTerms(GUILD_A);

        // Meanwhile a moderator removes the term.
        await service.removeServerTerms(guild, [SERVER_TERM], 'Mod');
        release();
        await slowRefresh;

        const { message, timeout } = makeMessage(SERVER_TERM, guild);
        await service.checkMessage(message);
        expect(timeout).not.toHaveBeenCalled();
    });

    it('concurrent cache misses for one server share a single S3 read', async () => {
        await Promise.all([service.getServerTerms(GUILD_A), service.getServerTerms(GUILD_A), service.getServerTerms(GUILD_A)]);
        const reads = vi
            .mocked(s3Client.send)
            .mock.calls.filter(([c]: any) => c.constructor.name === 'GetObjectCommand' && c.input.Key === keyFor(GUILD_A));
        expect(reads).toHaveLength(1);
    });
});

describe('addServerTerms', () => {
    it("writes the server's own document, and the term is live without waiting for the cache", async () => {
        const guild = makeGuild(GUILD_A);
        const before = makeMessage(SERVER_TERM, guild);
        await service.checkMessage(before.message);
        expect(before.timeout).not.toHaveBeenCalled();

        const result = await service.addServerTerms(guild, [' ZorpTest '], 'Mod#0001 (9)');

        expect(result).toEqual({ changed: [SERVER_TERM], unchanged: [], builtIn: [], total: 1 });
        expect(puts).toHaveLength(1);
        expect(puts[0].key).toBe(keyFor(GUILD_A));
        expect(puts[0].body).toMatchObject({
            schemaVersion: 1,
            guildId: GUILD_A,
            terms: [SERVER_TERM],
            updatedBy: 'Mod#0001 (9)',
        });

        const after = makeMessage(SERVER_TERM, guild);
        await service.checkMessage(after.message);
        expect(after.timeout).toHaveBeenCalled();
    });

    it('never writes to the built-in list', async () => {
        await service.addServerTerms(makeGuild(GUILD_A), [SERVER_TERM], 'Mod');
        expect(puts.every(p => p.key !== SLUR_MOD_CONFIG.SLUR_LIST_S3_KEY)).toBe(true);
    });

    it('reports built-in and duplicate terms instead of writing them', async () => {
        setServerList(GUILD_A, [SERVER_TERM]);
        const result = await service.addServerTerms(makeGuild(GUILD_A), [BUILT_IN, SERVER_TERM], 'Mod');
        expect(result).toEqual({ changed: [], unchanged: [SERVER_TERM], builtIn: [BUILT_IN], total: 1 });
        expect(puts).toHaveLength(0);
    });

    it('keeps terms added in the S3 console since the cache was filled', async () => {
        const guild = makeGuild(GUILD_A);
        await service.getServerTerms(GUILD_A); // caches an empty list
        setServerList(GUILD_A, [OTHER_TERM]); // edited by hand meanwhile
        await service.addServerTerms(guild, [SERVER_TERM], 'Mod');
        expect(puts[0].body.terms).toEqual([OTHER_TERM, SERVER_TERM]);
    });

    it('refuses to write when the list cannot be read, rather than overwrite it from cache', async () => {
        setServerList(GUILD_A, [OTHER_TERM]);
        failReadsFor.add(keyFor(GUILD_A));
        await expect(service.addServerTerms(makeGuild(GUILD_A), [SERVER_TERM], 'Mod')).rejects.toThrow(
            "Couldn't read this server's slur list"
        );
        expect(puts).toHaveLength(0);
    });

    it("refuses a document that belongs to another server", async () => {
        setServerList(GUILD_A, [OTHER_TERM], { guildId: GUILD_B });
        await expect(service.addServerTerms(makeGuild(GUILD_A), [SERVER_TERM], 'Mod')).rejects.toThrow();
        expect(puts).toHaveLength(0);
    });

    it('lands both of two concurrent edits', async () => {
        const guild = makeGuild(GUILD_A);
        await Promise.all([
            service.addServerTerms(guild, [SERVER_TERM], 'Mod A'),
            service.addServerTerms(guild, [OTHER_TERM], 'Mod B'),
        ]);
        expect(JSON.parse(store.get(keyFor(GUILD_A))!).terms.sort()).toEqual([OTHER_TERM, SERVER_TERM].sort());
    });

    it('rejects an invalid term even if a caller skipped validation', async () => {
        await expect(service.addServerTerms(makeGuild(GUILD_A), ['wh?t'], 'Mod')).rejects.toThrow("can't be added");
        expect(puts).toHaveLength(0);
    });

    it('enforces the per-server size cap', async () => {
        setServerList(GUILD_A, Array.from({ length: SLUR_MOD_CONFIG.MAX_LIST_SIZE }, (_, i) => `placeholder${i}`));
        await expect(service.addServerTerms(makeGuild(GUILD_A), [SERVER_TERM], 'Mod')).rejects.toThrow('capped');
        expect(puts).toHaveLength(0);
    });
});

describe('removeServerTerms', () => {
    it('removes a server term and leaves the rest', async () => {
        const guild = makeGuild(GUILD_A);
        setServerList(GUILD_A, [SERVER_TERM, OTHER_TERM]);
        const result = await service.removeServerTerms(guild, ['ZORPTEST'], 'Mod');
        expect(result).toEqual({ changed: [SERVER_TERM], unchanged: [], builtIn: [], total: 1 });
        expect(puts[0].body.terms).toEqual([OTHER_TERM]);

        const { message, timeout } = makeMessage(SERVER_TERM, guild);
        await service.checkMessage(message);
        expect(timeout).not.toHaveBeenCalled();
    });

    it('cannot remove a built-in term', async () => {
        const result = await service.removeServerTerms(makeGuild(GUILD_A), [BUILT_IN], 'Mod');
        expect(result.builtIn).toEqual([BUILT_IN]);
        expect(puts).toHaveLength(0);
    });
});

describe('previewMatches', () => {
    it('counts a candidate term for the check without saving it', async () => {
        const result = await service.previewMatches(makeGuild(GUILD_A), `hey ${SERVER_TERM}!`, [SERVER_TERM]);
        expect(result).toEqual({
            builtInMatches: 0,
            serverMatches: [],
            candidateMatches: [SERVER_TERM],
            builtInLoaded: true,
        });
        expect(puts).toHaveLength(0);

        const { message, timeout } = makeMessage(SERVER_TERM, makeGuild(GUILD_A));
        await service.checkMessage(message);
        expect(timeout).not.toHaveBeenCalled();
    });

    it('names server matches but only counts built-in matches', async () => {
        setServerList(GUILD_A, [SERVER_TERM]);
        const result = await service.previewMatches(makeGuild(GUILD_A), `${BUILT_IN} and ${SERVER_TERM}`);
        expect(result.serverMatches).toEqual([SERVER_TERM]);
        expect(result.builtInMatches).toBe(1);
        expect(JSON.stringify(result)).not.toContain(BUILT_IN);
    });
});

describe('getFilterOverview', () => {
    it("returns this server's terms and a count of built-in terms, never the built-in terms", async () => {
        setBuiltIn([BUILT_IN, 'secondbuiltin']);
        setServerList(GUILD_A, [SERVER_TERM]);
        const overview = await service.getFilterOverview(makeGuild(GUILD_A));

        expect(overview.server.terms).toEqual([SERVER_TERM]);
        expect(overview.builtInCount).toBe(2);
        expect(JSON.stringify(overview)).not.toContain(BUILT_IN);
    });
});
