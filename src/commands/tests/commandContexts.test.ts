import { describe, it, expect, vi } from 'vitest';
import { InteractionContextType } from 'discord.js';
import { readdirSync } from 'fs';
import { join } from 'path';

vi.stubEnv('CDN_DOMAIN_URL', 'https://cdn.example.com');
vi.mock('../../utils/cdn/config', () => ({ s3Client: { send: vi.fn() }, S3_BUCKET: 'test-bucket' }));
vi.mock('fs', async importOriginal => {
    const actual = await importOriginal<typeof import('fs')>();
    // lucky.ts reads user_data.json at import time.
    return { ...actual, default: { ...actual, readFileSync: (p: any, ...rest: any[]) =>
        String(p).endsWith('user_data.json') ? '{}' : (actual.readFileSync as any)(p, ...rest) } };
});

const dir = join(__dirname, '..');
const files = readdirSync(dir).filter(f => f.endsWith('.ts'));

describe('slash command contexts', () => {
    it.each(files)('%s can only be used in a server', async file => {
        const command = (await import(join(dir, file))).default;
        expect(command.data.toJSON().contexts).toEqual([InteractionContextType.Guild]);
    });
});
