import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionFlagsBits, InteractionContextType } from 'discord.js';

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

vi.mock('../utils/paginationBuilder', () => ({ createPaginatedMessage: vi.fn() }));

vi.mock('../utils/spamModeration', () => ({
    handleSpamStats: vi.fn().mockResolvedValue(undefined),
    handleSpamReset: vi.fn().mockResolvedValue(undefined),
}));

// Keep the real validation; stub only the service instance.
vi.mock('../../services/slurModerationService', async importOriginal => ({
    ...(await importOriginal<typeof import('../../services/slurModerationService')>()),
    getSlurModerationService: vi.fn(),
}));

import { getSlurModerationService } from '../../services/slurModerationService';
import { createPaginatedMessage } from '../utils/paginationBuilder';
import { handleSpamStats, handleSpamReset } from '../utils/spamModeration';

const modCommand = (await import('../mod')).default;

/* Placeholder terms only. */
const TERM = 'zorptest';
const OTHER = 'quuxtest';

let service: any;

function makeGuild() {
    return {
        id: '111111111111111111',
        name: 'Test Guild',
        ownerId: 'owner-id',
        roles: { cache: new Map([['role-mods', { name: 'Mods' }], ['role-fan', { name: 'fan' }]]) },
        channels: { cache: { find: () => undefined } },
    } as any;
}

/** What Discord sends with an interaction: resolved permissions and the member's role ids. */
function callerFields(opts: { canModerate?: boolean; roleIds?: string[] }) {
    return {
        memberPermissions: {
            has: (p: bigint) => opts.canModerate === true && p === PermissionFlagsBits.ModerateMembers,
        },
        member: { roles: opts.roleIds ?? [] },
    };
}

function makeInteraction(opts: {
    sub: string;
    group?: string;
    strings?: Record<string, string>;
    isMod?: boolean;
    roleIds?: string[];
    button?: any;
}) {
    const prompt = {
        awaitMessageComponent:
            opts.button instanceof Error
                ? vi.fn().mockRejectedValue(opts.button)
                : vi.fn().mockResolvedValue(opts.button),
    };
    return {
        id: 'interaction-1',
        guild: makeGuild(),
        ...callerFields({ canModerate: opts.isMod ?? true, roleIds: opts.roleIds }),
        user: { id: 'u1', tag: 'Mod#0001', toString: () => '<@u1>' },
        options: {
            getSubcommandGroup: () => opts.group ?? 'slur',
            getSubcommand: () => opts.sub,
            getString: (name: string) => opts.strings?.[name] ?? null,
            getUser: () => ({ id: 'u2', tag: 'Member#0002', toString: () => '<@u2>' }),
        },
        reply: vi.fn().mockResolvedValue({}),
        deferReply: vi.fn().mockResolvedValue({}),
        editReply: vi.fn().mockResolvedValue(prompt),
        prompt,
    } as any;
}

function makeButton(customIdSuffix: 'confirm' | 'cancel') {
    return {
        customId: `modslur_add_${customIdSuffix}_interaction-1`,
        update: vi.fn().mockResolvedValue({}),
        deferUpdate: vi.fn().mockResolvedValue({}),
    };
}

const editResult = (changed: string[]) => ({ changed, unchanged: [], builtIn: [], total: changed.length });
const lastEmbed = (interaction: any) => interaction.editReply.mock.calls.at(-1)[0].embeds[0].toJSON();

beforeEach(() => {
    vi.clearAllMocks();
    service = {
        addServerTerms: vi.fn().mockResolvedValue(editResult([TERM, OTHER])),
        removeServerTerms: vi.fn().mockResolvedValue(editResult([TERM])),
        previewMatches: vi.fn().mockResolvedValue({
            builtInMatches: 0,
            serverMatches: [],
            candidateMatches: [TERM],
            builtInLoaded: true,
        }),
        getFilterOverview: vi.fn().mockResolvedValue({
            builtInCount: 42,
            builtInLoaded: true,
            builtInDegraded: false,
            server: { terms: [TERM] },
        }),
        getServerTerms: vi.fn().mockResolvedValue([TERM, OTHER, 'zebratest']),
        getOffenses: vi.fn().mockResolvedValue(null),
    };
    vi.mocked(getSlurModerationService).mockReturnValue(service);
});

describe('/mod registration', () => {
    const json = modCommand.data.toJSON() as any;

    it('is hidden from members without Timeout Members', () => {
        expect(json.default_member_permissions).toBe(String(PermissionFlagsBits.ModerateMembers));
    });

    it('is server-only', () => {
        expect(json.contexts).toEqual([InteractionContextType.Guild]);
    });

    it('carries the slur group with its five subcommands', () => {
        const group = json.options.find((o: any) => o.name === 'slur');
        expect(group.options.map((o: any) => o.name)).toEqual(['list', 'add', 'remove', 'test', 'history']);
    });

    it('carries the spam group with stats and reset', () => {
        expect(json.options.map((o: any) => o.name)).toEqual(['slur', 'spam', 'media', 'redeem', 'jobs']);
        const group = json.options.find((o: any) => o.name === 'spam');
        expect(group.options.map((o: any) => o.name)).toEqual(['stats', 'reset']);
        const reset = group.options.find((o: any) => o.name === 'reset');
        expect(reset.options).toEqual([expect.objectContaining({ name: 'user', required: true })]);
    });

    it('caps the length of every free-text term option', () => {
        const group = json.options.find((o: any) => o.name === 'slur');
        for (const sub of group.options) {
            for (const opt of sub.options ?? []) {
                if (opt.type === 3) expect(opt.max_length, `${sub.name}.${opt.name}`).toBeGreaterThan(0);
            }
        }
    });
});

describe('/mod access', () => {
    it('refuses a non-moderator at run time even if the picker let them through', async () => {
        const interaction = makeInteraction({ sub: 'add', strings: { terms: TERM }, isMod: false });
        await modCommand.execute(interaction);

        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ content: expect.stringContaining('Timeout Members') })
        );
        expect(service.addServerTerms).not.toHaveBeenCalled();
    });

    it('accepts a member whose role is named mods, without Timeout Members', async () => {
        const interaction = makeInteraction({ sub: 'list', isMod: false, roleIds: ['role-mods'] });
        await modCommand.execute(interaction);
        expect(service.getFilterOverview).toHaveBeenCalled();
    });

    it('accepts the server owner', async () => {
        const interaction = makeInteraction({ sub: 'list', isMod: false });
        interaction.user.id = 'owner-id';
        await modCommand.execute(interaction);
        expect(service.getFilterOverview).toHaveBeenCalled();
    });

    it('refuses outside a server', async () => {
        const interaction = makeInteraction({ sub: 'list' });
        interaction.guild = null;
        await modCommand.execute(interaction);
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('server') }));
        expect(service.getFilterOverview).not.toHaveBeenCalled();
    });
});

describe('/mod spam', () => {
    it.each([
        ['stats', handleSpamStats, handleSpamReset],
        ['reset', handleSpamReset, handleSpamStats],
    ])('dispatches %s to the spam module', async (sub, expected, other) => {
        const interaction = makeInteraction({ sub, group: 'spam' });
        await modCommand.execute(interaction);
        expect(expected).toHaveBeenCalledWith(interaction, interaction.guild);
        expect(other).not.toHaveBeenCalled();
        expect(service.getFilterOverview).not.toHaveBeenCalled();
    });

    it.each(['stats', 'reset'])('refuses a non-moderator for %s', async sub => {
        const interaction = makeInteraction({ sub, group: 'spam', isMod: false });
        await modCommand.execute(interaction);
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ content: expect.stringContaining('Timeout Members') })
        );
        expect(handleSpamStats).not.toHaveBeenCalled();
        expect(handleSpamReset).not.toHaveBeenCalled();
    });

    it('does not run slur handlers for a same-named subcommand in another group', async () => {
        const interaction = makeInteraction({ sub: 'list', group: 'spam' });
        await modCommand.execute(interaction);
        expect(service.getFilterOverview).not.toHaveBeenCalled();
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ content: expect.stringContaining('Unknown') })
        );
    });
});

describe('/mod slur add', () => {
    it('adds only after the moderator confirms', async () => {
        const interaction = makeInteraction({
            sub: 'add',
            strings: { terms: ` ZorpTest , ${OTHER}, zorptest ` },
            button: makeButton('confirm'),
        });
        await modCommand.execute(interaction);

        expect(interaction.prompt.awaitMessageComponent).toHaveBeenCalled();
        expect(service.addServerTerms).toHaveBeenCalledWith(interaction.guild, [TERM, OTHER], 'Mod#0001 (u1)');
    });

    it('changes nothing when cancelled', async () => {
        const button = makeButton('cancel');
        const interaction = makeInteraction({ sub: 'add', strings: { terms: TERM }, button });
        await modCommand.execute(interaction);

        expect(button.update).toHaveBeenCalled();
        expect(service.addServerTerms).not.toHaveBeenCalled();
    });

    it('changes nothing when the confirmation times out', async () => {
        const interaction = makeInteraction({ sub: 'add', strings: { terms: TERM }, button: new Error('time') });
        await modCommand.execute(interaction);

        expect(service.addServerTerms).not.toHaveBeenCalled();
        expect(interaction.editReply).toHaveBeenLastCalledWith(expect.objectContaining({ components: [] }));
    });

    it('clears the buttons and adds nothing if something fails after the prompt is shown', async () => {
        const interaction = makeInteraction({
            sub: 'add',
            strings: { terms: TERM },
            button: {
                customId: 'modslur_add_confirm_interaction-1',
                deferUpdate: vi.fn().mockRejectedValue(new Error('Unknown interaction')),
            },
        });
        await modCommand.execute(interaction);

        expect(service.addServerTerms).not.toHaveBeenCalled();
        expect(interaction.editReply).toHaveBeenLastCalledWith(expect.objectContaining({ components: [] }));
    });

    it('rejects an invalid term before asking, and adds none of the batch', async () => {
        const interaction = makeInteraction({ sub: 'add', strings: { terms: `${TERM}, ab` } });
        await modCommand.execute(interaction);

        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ content: expect.stringMatching(/Nothing was added[\s\S]*\|\|ab\|\| is shorter/) })
        );
        expect(interaction.deferReply).not.toHaveBeenCalled();
        expect(service.addServerTerms).not.toHaveBeenCalled();
    });

    it('caps how many terms one command can add', async () => {
        const many = Array.from({ length: 11 }, (_, i) => `placeholder${i}`).join(',');
        const interaction = makeInteraction({ sub: 'add', strings: { terms: many } });
        await modCommand.execute(interaction);

        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('up to 10') }));
        expect(service.addServerTerms).not.toHaveBeenCalled();
    });

    it('spoilers terms in the confirmation so the slur is not shown in clear', async () => {
        const interaction = makeInteraction({ sub: 'add', strings: { terms: TERM }, button: makeButton('cancel') });
        await modCommand.execute(interaction);

        const prompt = interaction.editReply.mock.calls[0][0];
        const fields = prompt.embeds[0].toJSON().fields;
        expect(fields.find((f: any) => f.name === 'Terms').value).toBe(`||${TERM}||`);
    });
});

describe('/mod slur remove, test, list', () => {
    it('removes from this server', async () => {
        const interaction = makeInteraction({ sub: 'remove', strings: { term: TERM } });
        await modCommand.execute(interaction);
        expect(service.removeServerTerms).toHaveBeenCalledWith(interaction.guild, [TERM], 'Mod#0001 (u1)');
    });

    it('test is a dry run that includes the candidate term and saves nothing', async () => {
        const interaction = makeInteraction({ sub: 'test', strings: { text: 'hello there', term: 'ZorpTest' } });
        await modCommand.execute(interaction);

        expect(service.previewMatches).toHaveBeenCalledWith(interaction.guild, 'hello there', [TERM]);
        expect(service.addServerTerms).not.toHaveBeenCalled();
    });

    it('test names server matches but only counts built-in matches', async () => {
        service.previewMatches.mockResolvedValue({
            builtInMatches: 2,
            serverMatches: [TERM],
            candidateMatches: [],
            builtInLoaded: true,
        });
        const interaction = makeInteraction({ sub: 'test', strings: { text: 'sample' } });
        await modCommand.execute(interaction);

        const embed = lastEmbed(interaction);
        expect(embed.title).toBe('This message would be caught');
        const matched = embed.fields.find((f: any) => f.name === 'Matched').value;
        expect(matched).toContain(`||${TERM}||`);
        expect(matched).toContain('2 built-in terms');
    });

    it('test says a candidate-only match is not caught today', async () => {
        const interaction = makeInteraction({ sub: 'test', strings: { text: 'sample', term: TERM } });
        await modCommand.execute(interaction);
        expect(lastEmbed(interaction).title).toContain('Not caught today');
    });

    it('list shows this server\'s terms and only a count of built-in ones', async () => {
        const interaction = makeInteraction({ sub: 'list' });
        await modCommand.execute(interaction);

        expect(service.getFilterOverview).toHaveBeenCalledWith(interaction.guild);
        const pages = vi.mocked(createPaginatedMessage).mock.calls[0][1];
        const text = pages.map((p: any) => p.toJSON().description).join('\n');
        expect(text).toContain(`||${TERM}||`);
        expect(text).toContain('42 terms');
    });

    it('keeps every embed field within Discord limits, without cutting a spoiler in half', async () => {
        const many = Array.from({ length: 60 }, (_, i) => `placeholderterm${i}`.padEnd(40, 'x'));
        service.removeServerTerms.mockResolvedValue({ changed: [], unchanged: many, builtIn: [], total: 0 });
        const interaction = makeInteraction({ sub: 'remove', strings: { term: TERM } });
        await modCommand.execute(interaction);

        const fields = lastEmbed(interaction).fields;
        for (const field of fields) {
            expect(field.value.length).toBeLessThanOrEqual(1024);
            expect((field.value.match(/\|\|/g) ?? []).length % 2).toBe(0);
        }
        expect(fields[0].value).toMatch(/\+\d+ more$/);
    });
});

describe('/mod autocomplete', () => {
    const makeAutocomplete = (isMod: boolean, sub = 'remove', focused = 'test', group = 'slur') => ({
        guild: makeGuild(),
        ...callerFields({ canModerate: isMod }),
        user: { id: 'u1' },
        options: { getSubcommandGroup: () => group, getSubcommand: () => sub, getFocused: () => focused },
        respond: vi.fn().mockResolvedValue(undefined),
    });

    it('suggests nothing to a non-moderator and never reads the list', async () => {
        const interaction = makeAutocomplete(false);
        await modCommand.autocomplete(interaction as any);
        expect(interaction.respond).toHaveBeenCalledWith([]);
        expect(service.getServerTerms).not.toHaveBeenCalled();
    });

    it('suggests nothing outside slur remove', async () => {
        const interaction = makeAutocomplete(true, 'remove', 'test', 'spam');
        await modCommand.autocomplete(interaction as any);
        expect(interaction.respond).toHaveBeenCalledWith([]);
        expect(service.getServerTerms).not.toHaveBeenCalled();
    });

    it('suggests matching server terms to a moderator', async () => {
        const interaction = makeAutocomplete(true, 'remove', 'ZORP');
        await modCommand.autocomplete(interaction as any);
        expect(interaction.respond).toHaveBeenCalledWith([{ name: TERM, value: TERM }]);
    });
});
