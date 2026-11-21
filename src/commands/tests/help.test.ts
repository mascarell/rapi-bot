import { describe, it, expect } from 'vitest';
import { buildHelpEmbed, chatCommandNames, packField } from '../help';

describe('/help embed', () => {
    it('lists chat commands from the registry without the ellipsis duplicate', () => {
        const names = chatCommandNames();
        expect(names).toContain('booba?');
        expect(names).toContain('ccp leadership');
        expect(names.some(n => n.includes('…'))).toBe(false);
    });

    it('keeps every field within Discord limits', () => {
        const json = buildHelpEmbed(true).toJSON();
        for (const field of json.fields ?? []) {
            expect(field.value.length).toBeLessThanOrEqual(1024);
        }
        const total = (json.title ?? '').length +
            (json.fields ?? []).reduce((n, f) => n + f.name.length + f.value.length, 0);
        expect(total).toBeLessThanOrEqual(6000);
    });

    it('shows the moderator line only to moderators', () => {
        const names = (mod: boolean) => (buildHelpEmbed(mod).toJSON().fields ?? []).map(f => f.name);
        expect(names(true)).toContain('Moderators');
        expect(names(false)).not.toContain('Moderators');
    });

    it('splits long lists across fields', () => {
        const items = Array.from({ length: 200 }, (_, i) => `\`command-${i}\``);
        const values = packField(items);
        expect(values.length).toBeGreaterThan(1);
        expect(values.every(v => v.length <= 1024)).toBe(true);
        expect(values.join(' · ').split(' · ')).toHaveLength(200);
    });
});
