import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PermissionFlagsBits, ChannelType } from 'discord.js';

vi.stubEnv('CDN_DOMAIN_URL', 'https://cdn.example.com');

const send = vi.fn();
vi.mock('../../utils/cdn/config', () => ({
    s3Client: { send: (...args: unknown[]) => send(...args) },
    S3_BUCKET: 'test-bucket',
    CDN_DOMAIN_URL: 'https://cdn.example.com',
}));

vi.mock('../../config/assets', () => ({
    cacheBust: (url: string) => url,
    getAssetUrls: () => ({
        rapiBot: { thumbnail: 'https://example.com/thumb.png' },
        nikke: { logo: 'https://example.com/nikke.png' },
    }),
}));

vi.mock('../../utils/cdn/mediaManager', () => ({
    invalidateMediaListCache: vi.fn(),
    getRandomCdnMediaUrl: vi.fn(),
}));

import { invalidateMediaListCache } from '../../utils/cdn/mediaManager';
import { resetMediaPoolCaches } from '../../services/mediaPoolService';
import { MEDIA_HOME_GUILD_ID } from '../../utils/data/mediaPoolConfig';
import { SLUR_MOD_CONFIG } from '../../utils/data/slurModerationConfig';
import { MEDIA_HOME_ONLY_MESSAGE } from '../utils/modMedia';
import { MOD_REQUIRED_MESSAGE } from '../../utils/permissionHelpers';

const modCommand = (await import('../mod')).default;

const OTHER_GUILD = '222222222222222222';
const GIF = Buffer.from('GIF89a-rest-of-file');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const manifest = {
    characters: [
        { code: 'c1', name: 'Anis', slug: 'anis' },
        { code: 'c2', name: 'Anis: Sparkling Summer', slug: 'anis-sparkling-summer' },
        { code: 'c3', name: 'Blanc', slug: 'blanc' },
    ],
};

let puts: any[];
let existing: string[];
let deletes: any[];

function setupS3() {
    puts = [];
    deletes = [];
    existing = [];
    send.mockImplementation(async (command: any) => {
        const name = command.constructor.name;
        if (name === 'GetObjectCommand') return { Body: { transformToString: async () => JSON.stringify(manifest) } };
        if (name === 'HeadObjectCommand') {
            if (existing.includes(command.input.Key)) return {};
            throw Object.assign(new Error('nf'), { name: 'NotFound' });
        }
        if (name === 'PutObjectCommand') {
            puts.push(command.input);
            return {};
        }
        if (name === 'ListObjectsV2Command') {
            const prefix = command.input.Prefix as string;
            return { Contents: existing.filter(k => k.startsWith(prefix)).map(Key => ({ Key })) };
        }
        if (name === 'DeleteObjectCommand') {
            deletes.push(command.input);
            return {};
        }
        throw new Error(`unexpected ${name}`);
    });
}

function mockFetch(body: Buffer) {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
        })
    );
}

const logSend = vi.fn();

function makeGuild(id: string) {
    const channel = { type: ChannelType.GuildText, name: SLUR_MOD_CONFIG.MOD_LOG_CHANNEL_NAME, send: logSend };
    return {
        id,
        name: 'Test Guild',
        ownerId: 'owner-id',
        roles: { cache: new Map() },
        channels: { cache: { find: (pred: any) => (pred(channel) ? channel : undefined) } },
    } as any;
}

function makeInteraction(opts: {
    guildId?: string;
    isMod?: boolean;
    command?: string;
    sub?: string;
    pool?: string;
    file?: string;
    character?: string;
    variant?: string | null;
    attachment?: any;
    button?: any;
}) {
    const guildId = opts.guildId ?? MEDIA_HOME_GUILD_ID;
    const prompt = {
        awaitMessageComponent:
            opts.button instanceof Error
                ? vi.fn().mockRejectedValue(opts.button)
                : vi.fn().mockResolvedValue(opts.button),
    };
    const attachment = opts.attachment ?? {
        url: 'https://cdn.discordapp.example/a.gif',
        name: 'a.gif',
        contentType: 'image/gif',
        size: 1000,
    };
    return {
        id: 'interaction-1',
        guildId,
        guild: makeGuild(guildId),
        memberPermissions: {
            has: (p: bigint) => (opts.isMod ?? true) && p === PermissionFlagsBits.ModerateMembers,
        },
        member: { roles: [] },
        user: { id: '111111111111111111', tag: 'Mod#0001', toString: () => '<@111111111111111111>' },
        options: {
            getSubcommandGroup: () => 'media',
            getSubcommand: () => opts.sub ?? 'add',
            getString: (name: string) =>
                (
                    {
                        command: opts.command ?? 'booty',
                        pool: opts.pool ?? 'booty',
                        file: opts.file ?? null,
                        // list treats the character as optional; add always passes one
                        character: opts.character === undefined && opts.sub === 'list' ? null : (opts.character ?? 'c1'),
                        variant: opts.variant ?? null,
                    } as any
                )[name] ?? null,
            getAttachment: () => attachment,
        },
        reply: vi.fn().mockResolvedValue({}),
        deferReply: vi.fn().mockResolvedValue({}),
        editReply: vi.fn().mockResolvedValue(prompt),
        prompt,
    } as any;
}

const button = (kind: 'add' | 'cancel') => ({
    customId: `modmedia_${kind}_interaction-1`,
    update: vi.fn().mockResolvedValue({}),
    deferUpdate: vi.fn().mockResolvedValue({}),
});

beforeEach(() => {
    vi.clearAllMocks();
    send.mockReset();
    resetMediaPoolCaches();
    setupS3();
    mockFetch(GIF);
});
afterEach(() => vi.unstubAllGlobals());

describe('/mod media registration', () => {
    it('registers group media with subcommand add', () => {
        const json = modCommand.data.toJSON() as any;
        const group = json.options.find((o: any) => o.name === 'media');
        expect(group.description).toBe('booba? and booty? image pools');
        expect(group.options.map((o: any) => o.name)).toEqual(['add', 'list', 'remove']);
        const opts = group.options[0].options;
        expect(opts.map((o: any) => [o.name, o.required ?? false])).toEqual([
            ['command', true],
            ['character', true],
            ['image', true],
            ['variant', false],
        ]);
        expect(opts[0].choices.map((c: any) => c.value)).toEqual(['booba', 'booty']);
        expect(opts[1].autocomplete).toBe(true);
    });

    it('registers list and remove with a pool choice and autocompleted character/file', () => {
        const json = modCommand.data.toJSON() as any;
        const group = json.options.find((o: any) => o.name === 'media');
        const shape = (name: string) =>
            group.options.find((o: any) => o.name === name).options.map((o: any) => [o.name, o.required ?? false, o.autocomplete ?? false]);
        expect(shape('list')).toEqual([['pool', true, false], ['character', false, true]]);
        expect(shape('remove')).toEqual([['pool', true, false], ['file', true, true]]);
        const list = group.options.find((o: any) => o.name === 'list');
        expect(list.options[0].choices.map((c: any) => c.value)).toEqual(['booba', 'booty']);
    });

    it('keeps the whole /mod definition under Discord\'s 8000 character limit', () => {
        expect(JSON.stringify(modCommand.data.toJSON()).length).toBeLessThan(8000);
    });
});

describe('/mod media list', () => {
    const pageInteraction = (opts: Parameters<typeof makeInteraction>[0]) => {
        const i = makeInteraction({ sub: 'list', ...opts });
        // createPaginatedMessage collects buttons off the reply message
        const collector = { on: vi.fn() };
        const message = { createMessageComponentCollector: vi.fn().mockReturnValue(collector), edit: vi.fn() };
        i.editReply.mockResolvedValue(message);
        return i;
    };
    const keys = (n: number, prefix = 'commands/booty/') =>
        Array.from({ length: n }, (_, k) => `${prefix}unit${String(k).padStart(2, '0')}_booty.gif`);

    it('defers ephemerally and paginates 20 names per page with the total', async () => {
        existing = keys(45);
        const i = pageInteraction({});
        await modCommand.execute(i);
        expect(i.deferReply).toHaveBeenCalledWith({ flags: 64 });
        const reply = i.editReply.mock.calls[0][0];
        const first = reply.embeds[0].toJSON();
        expect(first.title).toBe('booty? files');
        expect(first.description.split('\n')).toHaveLength(20);
        expect(first.footer.text).toBe('45 files in total');
        const labels = reply.components[0].toJSON().components.map((c: any) => c.label);
        expect(labels).toEqual(['Previous', 'Page 1 of 3', 'Next']);
    });

    it('only lists the chosen pool', async () => {
        existing = [...keys(2, 'commands/booba/'), 'commands/booty/rapi_booty.gif'];
        const i = pageInteraction({});
        await modCommand.execute(i);
        const embed = i.editReply.mock.calls[0][0].embeds[0].toJSON();
        expect(embed.description).toBe('`rapi_booty.gif`');
        expect(embed.footer.text).toBe('1 file in total');
    });

    it('filters to one character', async () => {
        existing = ['commands/booty/anis_booty.gif', 'commands/booty/anis_2_booty.gif', 'commands/booty/blanc_booty.gif'];
        const i = pageInteraction({ character: 'c1' });
        await modCommand.execute(i);
        const embed = i.editReply.mock.calls[0][0].embeds[0].toJSON();
        expect(embed.title).toBe('booty? files: Anis');
        expect(embed.description).toBe('`anis_2_booty.gif`\n`anis_booty.gif`');
    });

    it('says so when the pool is empty', async () => {
        const i = pageInteraction({});
        await modCommand.execute(i);
        expect(i.editReply.mock.calls[0][0].content).toBe('`booty?` has no files.');
    });

    it('says so when the character has no files', async () => {
        existing = ['commands/booty/blanc_booty.gif'];
        const i = pageInteraction({ character: 'c1' });
        await modCommand.execute(i);
        expect(i.editReply.mock.calls[0][0].content).toBe('No files for Anis in `booty?`.');
    });

    it('refuses non-moderators and other guilds without listing', async () => {
        const nonMod = pageInteraction({ isMod: false });
        await modCommand.execute(nonMod);
        expect(nonMod.reply.mock.calls[0][0].content).toBe(MOD_REQUIRED_MESSAGE);
        const away = pageInteraction({ guildId: OTHER_GUILD });
        await modCommand.execute(away);
        expect(away.reply.mock.calls[0][0].content).toBe(MEDIA_HOME_ONLY_MESSAGE);
        expect(send).not.toHaveBeenCalled();
    });
});

describe('/mod media remove', () => {
    const removeButton = (kind: 'remove' | 'cancel') => ({
        customId: `modmedia_${kind}_interaction-1`,
        update: vi.fn().mockResolvedValue({}),
        deferUpdate: vi.fn().mockResolvedValue({}),
    });

    it('previews the gif, deletes on Remove, invalidates the cache and logs', async () => {
        existing = ['commands/booba/rapi_oppai.gif'];
        const i = makeInteraction({ sub: 'remove', pool: 'booba', file: 'rapi_oppai.gif', button: removeButton('remove') });
        await modCommand.execute(i);

        const preview = i.editReply.mock.calls[0][0];
        const embed = preview.embeds[0].toJSON();
        expect(embed.title).toBe('Remove from booba?');
        expect(embed.image.url).toBe('https://cdn.example.com/commands/booba/rapi_oppai.gif');
        const buttons = preview.components[0].toJSON().components.map((c: any) => [c.label, c.style]);
        expect(buttons).toEqual([['Remove', 4], ['Cancel', 2]]);
        expect(i.prompt.awaitMessageComponent.mock.calls[0][0].time).toBe(SLUR_MOD_CONFIG.CONFIRM_TIMEOUT_MS);

        expect(deletes).toEqual([{ Bucket: 'test-bucket', Key: 'commands/booba/rapi_oppai.gif' }]);
        expect(invalidateMediaListCache).toHaveBeenCalledWith('commands/booba/');
        expect(i.editReply.mock.calls.at(-1)[0].content).toBe('Removed `rapi_oppai.gif` from `booba?`.');

        const log = logSend.mock.calls[0][0].embeds[0].toJSON();
        expect(log.title).toBe('booba? image removed');
        expect(JSON.stringify(log.fields)).toContain('<@111111111111111111>');
        expect(JSON.stringify(log.fields)).toContain('rapi_oppai.gif');
    });

    it('only accepts button presses from the invoking moderator', async () => {
        existing = ['commands/booty/rapi_booty.gif'];
        const i = makeInteraction({ sub: 'remove', file: 'rapi_booty.gif', button: removeButton('remove') });
        await modCommand.execute(i);
        const { filter } = i.prompt.awaitMessageComponent.mock.calls[0][0];
        expect(filter({ user: { id: '111111111111111111' }, customId: 'modmedia_remove_interaction-1' })).toBe(true);
        expect(filter({ user: { id: '999999999999999999' }, customId: 'modmedia_remove_interaction-1' })).toBe(false);
    });

    it('Cancel deletes nothing', async () => {
        existing = ['commands/booty/rapi_booty.gif'];
        const btn = removeButton('cancel');
        const i = makeInteraction({ sub: 'remove', file: 'rapi_booty.gif', button: btn });
        await modCommand.execute(i);
        expect(deletes).toHaveLength(0);
        expect(invalidateMediaListCache).not.toHaveBeenCalled();
        expect(btn.update.mock.calls[0][0].content).toBe('Cancelled — nothing was removed.');
        expect(logSend).not.toHaveBeenCalled();
    });

    it('timeout deletes nothing', async () => {
        existing = ['commands/booty/rapi_booty.gif'];
        const i = makeInteraction({ sub: 'remove', file: 'rapi_booty.gif', button: new Error('time') });
        await modCommand.execute(i);
        expect(i.editReply.mock.calls.at(-1)[0].content).toBe('Timed out — nothing was removed.');
        expect(deletes).toHaveLength(0);
    });

    it.each(['../booba/rapi_oppai.gif', 'booty/rapi_booty.gif', '..'])('rejects the traversal name %j', async name => {
        existing = ['commands/booba/rapi_oppai.gif'];
        const i = makeInteraction({ sub: 'remove', file: name, button: removeButton('remove') });
        await modCommand.execute(i);
        const embed = i.editReply.mock.calls.at(-1)[0].embeds[0].toJSON();
        expect(embed.title).toBe('Nothing was removed');
        expect(embed.description).toBe('That is not a valid file name.');
        expect(send).not.toHaveBeenCalled();
        expect(deletes).toHaveLength(0);
    });

    it('rejects a file that is not in the pool', async () => {
        existing = ['commands/booba/rapi_oppai.gif'];
        const i = makeInteraction({ sub: 'remove', pool: 'booty', file: 'rapi_oppai.gif', button: removeButton('remove') });
        await modCommand.execute(i);
        expect(i.editReply.mock.calls.at(-1)[0].embeds[0].toJSON().description).toBe('That file is not in this pool.');
        expect(deletes).toHaveLength(0);
    });

    it('refuses non-moderators and other guilds', async () => {
        const nonMod = makeInteraction({ sub: 'remove', file: 'rapi_booty.gif', isMod: false });
        await modCommand.execute(nonMod);
        expect(nonMod.reply.mock.calls[0][0].content).toBe(MOD_REQUIRED_MESSAGE);
        const away = makeInteraction({ sub: 'remove', file: 'rapi_booty.gif', guildId: OTHER_GUILD });
        await modCommand.execute(away);
        expect(away.reply.mock.calls[0][0].content).toBe(MEDIA_HOME_ONLY_MESSAGE);
        expect(send).not.toHaveBeenCalled();
    });
});

describe('/mod media add: guards', () => {
    it('refuses non-moderators', async () => {
        const i = makeInteraction({ isMod: false });
        await modCommand.execute(i);
        expect(i.reply.mock.calls[0][0].content).toBe(MOD_REQUIRED_MESSAGE);
        expect(i.deferReply).not.toHaveBeenCalled();
        expect(send).not.toHaveBeenCalled();
    });

    it('refuses outside the home guild', async () => {
        const i = makeInteraction({ guildId: OTHER_GUILD, button: button('add') });
        await modCommand.execute(i);
        expect(i.reply.mock.calls[0][0].content).toBe(MEDIA_HOME_ONLY_MESSAGE);
        expect(send).not.toHaveBeenCalled();
        expect(puts).toHaveLength(0);
    });

    it('refuses a non-gif content type', async () => {
        const i = makeInteraction({ attachment: { url: 'u', name: 'a.gif', contentType: 'image/png', size: 10 } });
        await modCommand.execute(i);
        expect(i.reply.mock.calls[0][0].content).toContain('Only .gif images can be added.');
    });

    it('refuses a non-gif extension', async () => {
        const i = makeInteraction({ attachment: { url: 'u', name: 'a.png', contentType: 'image/gif', size: 10 } });
        await modCommand.execute(i);
        expect(i.reply.mock.calls[0][0].content).toContain('Only .gif images can be added.');
    });

    it('refuses oversized files with the limit', async () => {
        const i = makeInteraction({ attachment: { url: 'u', name: 'a.gif', contentType: 'image/gif', size: 26 * 1024 * 1024 } });
        await modCommand.execute(i);
        expect(i.reply.mock.calls[0][0].content).toContain('25 MB');
    });

    it('refuses an unknown character', async () => {
        const i = makeInteraction({ character: 'nope', button: button('add') });
        await modCommand.execute(i);
        const embed = i.editReply.mock.calls.at(-1)[0].embeds[0].toJSON();
        expect(embed.title).toBe('Unknown character');
        expect(puts).toHaveLength(0);
    });
});

describe('/mod media add: flow', () => {
    it('shows a preview, then uploads on Add, invalidates cache and logs', async () => {
        const btn = button('add');
        const i = makeInteraction({ character: 'c2', variant: 'Beach Day', command: 'booba', button: btn });
        await modCommand.execute(i);

        const preview = i.editReply.mock.calls[0][0];
        const embed = preview.embeds[0].toJSON();
        expect(embed.title).toBe('Add to booba?');
        expect(embed.image.url).toBe('https://cdn.discordapp.example/a.gif');
        expect(embed.fields.map((f: any) => f.name)).toEqual(['Character', 'Command', 'File name']);
        expect(embed.fields[2].value).toContain('anis_sparkling_summer_beach_day_oppai.gif');
        const styles = preview.components[0].toJSON().components.map((c: any) => [c.label, c.style]);
        expect(styles).toEqual([['Add', 3], ['Cancel', 2]]);

        expect(puts).toHaveLength(1);
        expect(puts[0]).toMatchObject({
            Key: 'commands/booba/anis_sparkling_summer_beach_day_oppai.gif',
            ContentType: 'image/gif',
            ACL: 'public-read',
        });
        expect(invalidateMediaListCache).toHaveBeenCalledWith('commands/booba/');

        const final = i.editReply.mock.calls.at(-1)[0];
        expect(final.content).toContain('Added `anis_sparkling_summer_beach_day_oppai.gif` to `booba?`');
        expect(final.content).toContain('https://cdn.example.com/commands/booba/');
        expect(final.components).toEqual([]);

        expect(logSend).toHaveBeenCalledTimes(1);
        const log = logSend.mock.calls[0][0].embeds[0].toJSON();
        expect(log.title).toBe('booba? image added');
        expect(log.image.url).toContain('anis_sparkling_summer_beach_day_oppai.gif');
        expect(JSON.stringify(log.fields)).toContain('<@111111111111111111>');
    });

    it('picks the next free name when the first is taken', async () => {
        existing = ['commands/booty/anis_booty.gif'];
        const i = makeInteraction({ button: button('add') });
        await modCommand.execute(i);
        expect(puts[0].Key).toBe('commands/booty/anis_2_booty.gif');
    });

    it('rejects a PNG renamed .gif and uploads nothing', async () => {
        mockFetch(PNG);
        const i = makeInteraction({ button: button('add') });
        await modCommand.execute(i);
        expect(puts).toHaveLength(0);
        expect(invalidateMediaListCache).not.toHaveBeenCalled();
        expect(i.editReply.mock.calls.at(-1)[0].content).toContain('not a real GIF');
        expect(logSend).not.toHaveBeenCalled();
    });

    it('Cancel uploads nothing', async () => {
        const btn = button('cancel');
        const i = makeInteraction({ button: btn });
        await modCommand.execute(i);
        expect(puts).toHaveLength(0);
        expect(btn.update.mock.calls[0][0].components).toEqual([]);
        expect(logSend).not.toHaveBeenCalled();
    });

    it('timeout removes the buttons and uploads nothing', async () => {
        const i = makeInteraction({ button: new Error('time') });
        await modCommand.execute(i);
        const last = i.editReply.mock.calls.at(-1)[0];
        expect(last.content).toBe('Timed out — nothing was added.');
        expect(last.components).toEqual([]);
        expect(puts).toHaveLength(0);
    });

    it('an S3 failure gives a short error', async () => {
        send.mockImplementation(async (command: any) => {
            const name = command.constructor.name;
            if (name === 'GetObjectCommand') return { Body: { transformToString: async () => JSON.stringify(manifest) } };
            if (name === 'HeadObjectCommand') throw Object.assign(new Error('nf'), { name: 'NotFound' });
            throw new Error('boom');
        });
        const i = makeInteraction({ button: button('add') });
        await modCommand.execute(i);
        expect(i.editReply.mock.calls.at(-1)[0].content).toContain('Nothing was added');
        expect(invalidateMediaListCache).not.toHaveBeenCalled();
    });

    it('a failing mod-log post does not fail the add', async () => {
        logSend.mockRejectedValueOnce(new Error('no perms'));
        const i = makeInteraction({ button: button('add') });
        await modCommand.execute(i);
        expect(puts).toHaveLength(1);
        expect(i.editReply.mock.calls.at(-1)[0].content).toContain('Added `anis_booty.gif`');
    });
});

describe('/mod media autocomplete', () => {
    function acInteraction(opts: { guildId?: string; isMod?: boolean; focused: string; sub?: string; pool?: string }) {
        const guildId = opts.guildId ?? MEDIA_HOME_GUILD_ID;
        return {
            guildId,
            guild: makeGuild(guildId),
            memberPermissions: { has: (p: bigint) => (opts.isMod ?? true) && p === PermissionFlagsBits.ModerateMembers },
            member: { roles: [] },
            user: { id: 'u1' },
            options: {
                getSubcommandGroup: () => 'media',
                getSubcommand: () => opts.sub ?? 'add',
                getString: (name: string) => (name === 'pool' ? (opts.pool ?? 'booba') : null),
                getFocused: () => opts.focused,
            },
            respond: vi.fn().mockResolvedValue(undefined),
        } as any;
    }

    it('filters by name and returns codes as values', async () => {
        const i = acInteraction({ focused: 'ANIS' });
        await modCommand.autocomplete(i);
        expect(i.respond).toHaveBeenCalledWith([
            { name: 'Anis', value: 'c1' },
            { name: 'Anis: Sparkling Summer', value: 'c2' },
        ]);
    });

    it('caps at 25', async () => {
        const many = { characters: Array.from({ length: 60 }, (_, n) => ({ code: `c${n}`, name: `Unit ${n}`, slug: `u${n}` })) };
        send.mockImplementation(async () => ({ Body: { transformToString: async () => JSON.stringify(many) } }));
        const i = acInteraction({ focused: 'unit' });
        await modCommand.autocomplete(i);
        expect(i.respond.mock.calls[0][0]).toHaveLength(25);
    });

    it('responds [] outside the home guild', async () => {
        const i = acInteraction({ guildId: OTHER_GUILD, focused: 'a' });
        await modCommand.autocomplete(i);
        expect(i.respond).toHaveBeenCalledWith([]);
        expect(send).not.toHaveBeenCalled();
    });

    it('responds [] for non-moderators', async () => {
        const i = acInteraction({ isMod: false, focused: 'a' });
        await modCommand.autocomplete(i);
        expect(i.respond).toHaveBeenCalledWith([]);
        expect(send).not.toHaveBeenCalled();
    });
});

describe('/mod media autocomplete: file and list character', () => {
    function fileAc(opts: { guildId?: string; isMod?: boolean; focused: string; sub?: string; pool?: string }) {
        const guildId = opts.guildId ?? MEDIA_HOME_GUILD_ID;
        return {
            guildId,
            guild: makeGuild(guildId),
            memberPermissions: { has: (p: bigint) => (opts.isMod ?? true) && p === PermissionFlagsBits.ModerateMembers },
            member: { roles: [] },
            user: { id: 'u1' },
            options: {
                getSubcommandGroup: () => 'media',
                getSubcommand: () => opts.sub ?? 'remove',
                getString: (name: string) => (name === 'pool' ? (opts.pool ?? 'booba') : null),
                getFocused: () => opts.focused,
            },
            respond: vi.fn().mockResolvedValue(undefined),
        } as any;
    }

    it('suggests matching file names from the chosen pool only', async () => {
        existing = ['commands/booba/rapi_oppai.gif', 'commands/booba/anis_oppai.gif', 'commands/booty/rapi_booty.gif'];
        const i = fileAc({ focused: 'RAPI' });
        await modCommand.autocomplete(i);
        expect(i.respond).toHaveBeenCalledWith([{ name: 'rapi_oppai.gif', value: 'rapi_oppai.gif' }]);
    });

    it('caps file suggestions at 25', async () => {
        existing = Array.from({ length: 60 }, (_, n) => `commands/booba/unit${n}_oppai.gif`);
        const i = fileAc({ focused: 'unit' });
        await modCommand.autocomplete(i);
        expect(i.respond.mock.calls[0][0]).toHaveLength(25);
    });

    it('responds [] for non-moderators and other guilds without listing', async () => {
        const nonMod = fileAc({ isMod: false, focused: 'a' });
        await modCommand.autocomplete(nonMod);
        expect(nonMod.respond).toHaveBeenCalledWith([]);
        const away = fileAc({ guildId: OTHER_GUILD, focused: 'a' });
        await modCommand.autocomplete(away);
        expect(away.respond).toHaveBeenCalledWith([]);
        expect(send).not.toHaveBeenCalled();
    });

    it('list suggests characters like add does', async () => {
        const i = fileAc({ sub: 'list', focused: 'blanc' });
        await modCommand.autocomplete(i);
        expect(i.respond).toHaveBeenCalledWith([{ name: 'Blanc', value: 'c3' }]);
    });
});
