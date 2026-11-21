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

function setupS3() {
    puts = [];
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
            getSubcommand: () => 'add',
            getString: (name: string) =>
                ({ command: opts.command ?? 'booty', character: opts.character ?? 'c1', variant: opts.variant ?? null } as any)[name] ?? null,
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
        expect(group.options.map((o: any) => o.name)).toEqual(['add']);
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
    function acInteraction(opts: { guildId?: string; isMod?: boolean; focused: string }) {
        const guildId = opts.guildId ?? MEDIA_HOME_GUILD_ID;
        return {
            guildId,
            guild: makeGuild(guildId),
            memberPermissions: { has: (p: bigint) => (opts.isMod ?? true) && p === PermissionFlagsBits.ModerateMembers },
            member: { roles: [] },
            user: { id: 'u1' },
            options: {
                getSubcommandGroup: () => 'media',
                getSubcommand: () => 'add',
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
