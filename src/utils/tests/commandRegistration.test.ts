import { describe, it, expect, vi } from 'vitest';

vi.stubEnv('CDN_DOMAIN_URL', 'https://cdn.example.com');
vi.mock('./../cdn/config', () => ({ s3Client: { send: vi.fn() }, S3_BUCKET: 'test-bucket' }));

import modCommand from '../../commands/mod';
import { modCommandFor, registerAllCommands } from '../commandRegistration';
import { HOME_GUILD_ID } from '../data/homeGuild';

const OTHER = '300000000000000009';
const full = () => modCommand.data.toJSON() as any;
const groups = (json: any) => Object.fromEntries(json.options.map((g: any) => [g.name, (g.options ?? []).map((s: any) => s.name)]));

describe('per-server /mod', () => {
    it('gives the home server the whole command', () => {
        expect(modCommandFor(HOME_GUILD_ID, full())).toEqual(full());
    });

    it('drops media and every redeem tool but list elsewhere', () => {
        const g = groups(modCommandFor(OTHER, full()));
        expect(g.media).toBeUndefined();
        expect(g.jobs).toBeUndefined();
        expect(groups(full()).jobs).toEqual([]);
        expect(g.redeem).toEqual(['list']);
        expect(g.slur).toEqual(groups(full()).slur);
        expect(g.spam).toEqual(groups(full()).spam);
    });

    it('registers /mod per guild and everything else globally', async () => {
        const put = vi.fn().mockResolvedValue(undefined);
        const bot: any = { guilds: { cache: new Map([[HOME_GUILD_ID, {}], [OTHER, {}]]) } };
        await registerAllCommands(bot, { put } as any, 'client', [{ name: 'help' }, full()]);

        expect(put).toHaveBeenCalledTimes(3);
        expect(put.mock.calls[0][0]).toBe('/applications/client/commands');
        expect(put.mock.calls[0][1].body.map((c: any) => c.name)).toEqual(['help']);
        const byRoute = Object.fromEntries(put.mock.calls.slice(1).map(c => [c[0], c[1].body[0]]));
        expect(groups(byRoute[`/applications/client/guilds/${HOME_GUILD_ID}/commands`]).media).toBeDefined();
        expect(groups(byRoute[`/applications/client/guilds/${OTHER}/commands`]).media).toBeUndefined();
    });

    it('keeps going when one guild fails', async () => {
        const put = vi.fn()
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('Missing Access'))
            .mockResolvedValueOnce(undefined);
        const bot: any = { guilds: { cache: new Map([[OTHER, {}], [HOME_GUILD_ID, {}]]) } };
        await registerAllCommands(bot, { put } as any, 'client', [full()]);
        expect(put).toHaveBeenCalledTimes(3);
    });
});
