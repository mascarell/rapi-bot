import { describe, it, expect, vi } from 'vitest';

vi.stubEnv('CDN_DOMAIN_URL', 'https://cdn.example.com');

vi.mock('../../utils/cdn/config', () => ({
    s3Client: { send: vi.fn() },
    S3_BUCKET: 'test-bucket',
}));

vi.mock('../../config/assets', () => ({
    cacheBust: (url: string) => url,
    getAssetUrls: () => ({
        rapiBot: { thumbnail: 'https://example.com/thumb.png' },
        nikke: { logo: 'https://example.com/nikke.png' },
    }),
}));

/**
 * Discord rejects a slash command whose definition is too large. The limit
 * counts the characters of every name, description and choice (name and
 * value) in the command, its groups, subcommands and options. /mod keeps
 * growing as moderator tools move under it, so this catches it before
 * deployment does.
 */
const COMMAND_SIZE_LIMIT = 8000;

function sizeOf(node: any): number {
    let total = 0;
    total += String(node.name ?? '').length;
    total += String(node.description ?? '').length;
    for (const choice of node.choices ?? []) {
        total += String(choice.name).length + String(choice.value).length;
    }
    for (const child of node.options ?? []) total += sizeOf(child);
    return total;
}

describe('/mod definition size', () => {
    it('stays within Discord\'s command limits', async () => {
        const modCommand = (await import('../mod')).default;
        const json = modCommand.data.toJSON() as any;

        const size = sizeOf(json);
        console.info(`/mod definition size: ${size} of ${COMMAND_SIZE_LIMIT} characters`);
        expect(size).toBeLessThanOrEqual(COMMAND_SIZE_LIMIT);

        expect(json.options.length).toBeLessThanOrEqual(25);
        for (const group of json.options) {
            expect((group.options ?? []).length).toBeLessThanOrEqual(25);
            for (const sub of group.options ?? []) {
                expect((sub.options ?? []).length).toBeLessThanOrEqual(25);
            }
        }
    });
});
