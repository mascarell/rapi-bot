import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.stubEnv('CDN_DOMAIN_URL', 'https://cdn.example.com');

const send = vi.fn();
vi.mock('../../utils/cdn/config', () => ({
    s3Client: { send: (...args: unknown[]) => send(...args) },
    S3_BUCKET: 'test-bucket',
    CDN_DOMAIN_URL: 'https://cdn.example.com',
}));

import {
    addMediaToPool,
    buildFileName,
    findFreeFileName,
    getNikkeCharacters,
    isGifBytes,
    resetMediaPoolCaches,
    searchCharacters,
    slugify,
    validateAttachment,
} from '../mediaPoolService';
import { getRandomCdnMediaUrl } from '../../utils/cdn/mediaManager';
import { MAX_UPLOAD_BYTES } from '../../utils/data/mediaPoolConfig';

const GIF = Buffer.from('GIF89a-rest-of-file');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Fake S3: `existing` keys answer HeadObject, Puts are recorded. */
function fakeS3(existing: string[] = [], manifest: unknown = { characters: [] }) {
    const puts: any[] = [];
    send.mockImplementation(async (command: any) => {
        const name = command.constructor.name;
        if (name === 'HeadObjectCommand') {
            if (existing.includes(command.input.Key)) return {};
            throw Object.assign(new Error('nf'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
        }
        if (name === 'PutObjectCommand') {
            puts.push(command.input);
            return {};
        }
        if (name === 'GetObjectCommand') {
            return { Body: { transformToString: async () => JSON.stringify(manifest) } };
        }
        if (name === 'ListObjectsV2Command') {
            return { Contents: [{ Key: 'commands/booty/a_booty.gif', Size: 10 }] };
        }
        throw new Error(`unexpected ${name}`);
    });
    return puts;
}

function mockFetch(body: Buffer, ok = true) {
    const fn = vi.fn().mockResolvedValue({
        ok,
        status: ok ? 200 : 500,
        arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    });
    vi.stubGlobal('fetch', fn);
    return fn;
}

const attachment = (over: Partial<Parameters<typeof validateAttachment>[0]> = {}) => ({
    url: 'https://cdn.discordapp.example/a.gif',
    name: 'a.gif',
    contentType: 'image/gif',
    size: 1000,
    ...over,
});

beforeEach(() => {
    send.mockReset();
    resetMediaPoolCaches();
});
afterEach(() => vi.unstubAllGlobals());

describe('file names', () => {
    it('slugifies to lowercase underscores', () => {
        expect(slugify('Scarlet: Black Shadow')).toBe('scarlet_black_shadow');
        expect(slugify('  --Summer  Vibes!! ')).toBe('summer_vibes');
        expect(slugify('a__b-c')).toBe('a_b_c');
    });

    it('builds name with the pool suffix', () => {
        expect(buildFileName('booty', 'anis', null)).toBe('anis_booty.gif');
        expect(buildFileName('booba', 'blanc', null)).toBe('blanc_oppai.gif');
        expect(buildFileName('booty', 'anis', 'Sparkling Summer')).toBe('anis_sparkling_summer_booty.gif');
        expect(buildFileName('booba', 'scarlet-black-shadow', 'Red Hood!')).toBe('scarlet_black_shadow_red_hood_oppai.gif');
    });

    it('puts the counter before the suffix', () => {
        expect(buildFileName('booty', 'anis', null, 2)).toBe('anis_2_booty.gif');
        expect(buildFileName('booba', 'anis', 'summer', 3)).toBe('anis_summer_3_oppai.gif');
    });

    it('never picks a name that already exists', async () => {
        fakeS3(['commands/booty/anis_booty.gif', 'commands/booty/anis_2_booty.gif']);
        expect(await findFreeFileName('booty', 'anis', null)).toBe('anis_3_booty.gif');
        fakeS3([]);
        expect(await findFreeFileName('booba', 'anis', null)).toBe('anis_oppai.gif');
    });
});

describe('validateAttachment', () => {
    it('accepts a small gif', () => expect(validateAttachment(attachment())).toBeNull());
    it('refuses a wrong content type', () =>
        expect(validateAttachment(attachment({ contentType: 'image/png' }))).toBe('Only .gif images can be added.'));
    it('refuses a missing content type', () =>
        expect(validateAttachment(attachment({ contentType: null }))).toBe('Only .gif images can be added.'));
    it('refuses a wrong extension', () =>
        expect(validateAttachment(attachment({ name: 'a.png' }))).toBe('Only .gif images can be added.'));
    it('accepts an upper-case extension', () => expect(validateAttachment(attachment({ name: 'A.GIF' }))).toBeNull());
    it('refuses oversized files and states the limit', () => {
        const msg = validateAttachment(attachment({ size: MAX_UPLOAD_BYTES + 1 }));
        expect(msg).toContain('25 MB');
    });
});

describe('isGifBytes', () => {
    it('accepts both GIF headers and rejects others', () => {
        expect(isGifBytes(Buffer.from('GIF87a..'))).toBe(true);
        expect(isGifBytes(Buffer.from('GIF89a..'))).toBe(true);
        expect(isGifBytes(PNG)).toBe(false);
        expect(isGifBytes(Buffer.from('GIF'))).toBe(false);
    });
});

describe('characters', () => {
    const manifest = {
        characters: [
            { code: 'c1', name: 'Scarlet', slug: 'scarlet' },
            { code: 'c2', name: 'Scarlet: Black Shadow', slug: 'scarlet-black-shadow' },
            { code: 'c3', name: 'Anis', slug: 'anis' },
        ],
    };

    it('loads once and caches', async () => {
        fakeS3([], manifest);
        expect(await getNikkeCharacters()).toHaveLength(3);
        await getNikkeCharacters();
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0]![0].input.Key).toBe('assets/gacha/nikke/manifest.json');
    });

    it('filters by case-insensitive substring and caps at 25', () => {
        const chars = manifest.characters as any[];
        expect(searchCharacters(chars, 'SCAR').map(c => c.code)).toEqual(['c1', 'c2']);
        const many = Array.from({ length: 60 }, (_, i) => ({ code: `c${i}`, name: `Name ${i}`, slug: `n${i}` })) as any[];
        expect(searchCharacters(many, 'name')).toHaveLength(25);
    });
});

describe('addMediaToPool', () => {
    it('uploads with the right key, type and ACL and returns the CDN url', async () => {
        const puts = fakeS3();
        mockFetch(GIF);
        const result = await addMediaToPool('booty', 'anis', 'Summer', attachment());
        expect(puts).toHaveLength(1);
        expect(puts[0]).toMatchObject({
            Bucket: 'test-bucket',
            Key: 'commands/booty/anis_summer_booty.gif',
            ContentType: 'image/gif',
            ACL: 'public-read',
        });
        expect(result.url).toBe('https://cdn.example.com/commands/booty/anis_summer_booty.gif');
    });

    it('rejects a PNG renamed .gif without uploading', async () => {
        const puts = fakeS3();
        mockFetch(PNG);
        await expect(addMediaToPool('booty', 'anis', null, attachment())).rejects.toThrow('not a real GIF');
        expect(puts).toHaveLength(0);
    });

    it('rejects a body larger than the limit', async () => {
        const puts = fakeS3();
        mockFetch(Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0x47));
        await expect(addMediaToPool('booty', 'anis', null, attachment())).rejects.toThrow('too large');
        expect(puts).toHaveLength(0);
    });

    it('does not upload when the download fails', async () => {
        const puts = fakeS3();
        mockFetch(GIF, false);
        await expect(addMediaToPool('booty', 'anis', null, attachment())).rejects.toThrow('Download failed');
        expect(puts).toHaveLength(0);
    });

    it('does not overwrite an existing file', async () => {
        const puts = fakeS3(['commands/booba/anis_oppai.gif']);
        mockFetch(GIF);
        await addMediaToPool('booba', 'anis', null, attachment());
        expect(puts[0].Key).toBe('commands/booba/anis_2_oppai.gif');
    });

    it('invalidates the pool listing cache so the file is live at once', async () => {
        fakeS3();
        mockFetch(GIF);
        await getRandomCdnMediaUrl('commands/booty/', 'g1');
        await getRandomCdnMediaUrl('commands/booty/', 'g1');
        const lists = () => send.mock.calls.filter(c => c[0].constructor.name === 'ListObjectsV2Command').length;
        expect(lists()).toBe(1); // cached
        await addMediaToPool('booty', 'anis', null, attachment());
        await getRandomCdnMediaUrl('commands/booty/', 'g1');
        expect(lists()).toBe(2); // re-listed
    });
});
