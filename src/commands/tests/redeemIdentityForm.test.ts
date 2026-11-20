import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatInputCommandInteraction, Client, MessageFlags } from 'discord.js';

vi.stubEnv('CDN_DOMAIN_URL', 'https://cdn.example.com');

vi.mock('discord.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('discord.js')>();
    return {
        ...actual,
        EmbedBuilder: vi.fn().mockImplementation(() => ({
            setColor: vi.fn().mockReturnThis(),
            setTitle: vi.fn().mockReturnThis(),
            setThumbnail: vi.fn().mockReturnThis(),
            setDescription: vi.fn().mockReturnThis(),
            addFields: vi.fn().mockReturnThis(),
            setTimestamp: vi.fn().mockReturnThis(),
            setFooter: vi.fn().mockReturnThis(),
            toJSON: vi.fn().mockReturnValue({}),
        })),
    };
});

vi.mock('../../services/gachaDataService', () => ({ getGachaDataService: vi.fn() }));
vi.mock('../../services/gachaRedemptionService', () => ({ getGachaRedemptionService: vi.fn() }));
vi.mock('../../services/gachaGuildConfigService', () => ({ getGachaGuildConfigService: vi.fn() }));

import { EmbedBuilder } from 'discord.js';
import { getGachaDataService } from '../../services/gachaDataService';
import { getGachaRedemptionService } from '../../services/gachaRedemptionService';
import { getGachaGuildConfigService } from '../../services/gachaGuildConfigService';
// The real config: the hints, limits and choices under test are the shipped ones.
import { GACHA_GAMES } from '../../utils/data/gachaGamesConfig';

const redeemCommand = (await import('../redeem')).default;

// Placeholder account details only.
const GOOD = { userid: '12345678901', nickname: 'Tester', world: 'world_live_global' };

/** Every embed title and description the command built, in order. */
const embedText = (): string =>
    vi.mocked(EmbedBuilder).mock.results
        .map(r => r.value as any)
        .flatMap(e => [...e.setTitle.mock.calls, ...e.setDescription.mock.calls].map((c: any[]) => c[0]))
        .join('\n');

/** Every embed field the command added, flattened. */
const embedFields = (): Array<{ name: string; value: string }> =>
    vi.mocked(EmbedBuilder).mock.results
        .map(r => r.value as any)
        .flatMap(e => e.addFields.mock.calls.flat());

/**
 * A scripted Discord user. `forms` are what they type into each form, in
 * order (null = they close it); `clicks` is how many times they will press
 * "Fix details". Everything the bot shows is recorded.
 */
function scriptedUser(opts: {
    subcommand: string;
    options: Record<string, string | null>;
    forms?: Array<Record<string, string> | null>;
    clicks?: number;
}) {
    const forms = [...(opts.forms ?? [])];
    let clicksLeft = opts.clicks ?? 0;
    let seq = 0;
    const shownModals: any[] = [];
    const responders: any[] = [];

    /** The message an editReply produced; clicking its button continues the flow. */
    const messageFor = (responder: any) => ({
        awaitMessageComponent: vi.fn(async ({ filter }: any) => {
            const payload = responder.editReply.mock.calls.at(-1)[0];
            const buttonId = payload.components?.[0]?.toJSON().components[0].custom_id;
            if (!buttonId || clicksLeft <= 0) throw new Error('time');
            clicksLeft--;
            const click = formSource(`click-${++seq}`, buttonId);
            expect(filter(click)).toBe(true);
            return click;
        }),
    });

    function makeResponder(base: any) {
        Object.assign(base, {
            deferred: false,
            replied: false,
            reply: vi.fn(async function (this: any) { this.replied = true; }),
            deferReply: vi.fn(async function (this: any) { this.deferred = true; }),
            deferUpdate: vi.fn(async function (this: any) { this.deferred = true; }),
        });
        base.editReply = vi.fn(async () => messageFor(base));
        responders.push(base);
        return base;
    }

    /** Anything that can open a form: the slash command or a button click. */
    function formSource(id: string, customId?: string): any {
        const source: any = makeResponder({
            id,
            customId,
            user: { id: 'user123' },
            isModalSubmit: () => false,
        });
        source.showModal = vi.fn(async (modal: any) => {
            shownModals.push(modal.toJSON());
        });
        source.awaitModalSubmit = vi.fn(async ({ filter }: any) => {
            const typed = forms.shift();
            if (!typed) throw new Error('time');
            const modalId = shownModals.at(-1).custom_id;
            const submit = makeResponder({
                id: `submit-${++seq}`,
                customId: modalId,
                user: { id: 'user123' },
                isModalSubmit: () => true,
                // A form opened from our button belongs to that message.
                isFromMessage: () => id.startsWith('click-'),
                // ...which, for "Fix details", is our ephemeral reply.
                message: { flags: { has: (flag: number) => flag === MessageFlags.Ephemeral } },
                fields: {
                    getTextInputValue: (key: string) => typed[key] ?? '',
                    getStringSelectValues: (key: string) => (typed[key] ? [typed[key]] : []),
                },
            });
            expect(filter(submit)).toBe(true);
            return submit;
        });
        return source;
    }

    const interaction = formSource('slash-1');
    Object.assign(interaction, {
        guildId: '1065055945123708928',
        client: {} as Client,
        options: {
            getSubcommand: vi.fn().mockReturnValue(opts.subcommand),
            getString: vi.fn().mockImplementation((name: string) => opts.options[name] ?? null),
        },
    });

    return {
        interaction: interaction as ChatInputCommandInteraction,
        shownModals,
        responders,
        /** The last thing shown to the user. */
        last: () => {
            const withEdits = responders.filter(r => r.editReply.mock.calls.length > 0);
            return withEdits.at(-1)?.editReply.mock.calls.at(-1)[0];
        },
    };
}

/** Field values a form was prefilled with, keyed by input id. */
function prefilled(modal: any): Record<string, string | undefined> {
    const out: Record<string, string | undefined> = {};
    for (const label of modal.components) {
        const c = label.component;
        out[c.custom_id] = c.options ? c.options.find((o: any) => o.default)?.value : c.value;
    }
    return out;
}

let dataService: any;
let redemptionService: any;

beforeEach(() => {
    vi.clearAllMocks();
    dataService = {
        subscribe: vi.fn().mockResolvedValue(undefined),
        unsubscribe: vi.fn().mockResolvedValue(true),
        getGameSubscription: vi.fn().mockResolvedValue(null),
        updateGameIdentity: vi.fn(),
        revertGameIdentity: vi.fn().mockResolvedValue(true),
        getUserSubscriptions: vi.fn(),
        getSubscriberContext: vi.fn(),
    };
    redemptionService = {
        redeemAllForUser: vi.fn().mockResolvedValue({
            total: 2, successful: 2, alreadyRedeemed: 0, failed: 0, identityRejected: false,
        }),
    };
    vi.mocked(getGachaDataService).mockReturnValue(dataService);
    vi.mocked(getGachaRedemptionService).mockReturnValue(redemptionService);
    vi.mocked(getGachaGuildConfigService).mockReturnValue({ isGuildAllowed: vi.fn().mockResolvedValue(true) } as any);
});

const rejected = { total: 2, successful: 0, alreadyRedeemed: 0, failed: 2, identityRejected: true };

describe('/redeem subscribe: the account details form', () => {
    it('asks for every CZN detail on one form, with where to find it', async () => {
        const user = scriptedUser({ subcommand: 'subscribe', options: { game: 'czn' }, forms: [null] });

        await redeemCommand.execute(user.interaction);

        expect(user.shownModals).toHaveLength(1);
        const modal = user.shownModals[0];
        expect(modal.title).toBe('CZN account details');
        const labels = modal.components;
        expect(labels.map((l: any) => l.label)).toEqual(['STOVE membership number', 'Character nickname', 'Server']);
        expect(labels[0].description).toContain('Lobby > Account > Account Settings');
        expect(labels[1].description).toContain('top left of the Lobby');
        // Server is a dropdown of exactly the configured servers, and required.
        const server = labels[2].component;
        expect(server.options.map((o: any) => o.label)).toEqual(['Global', 'Asia']);
        expect(server.required).toBe(true);
        expect(labels[0].component.required).toBe(true);
        expect(labels[1].component.required).toBe(true);
    });

    it('subscribes with what was entered on the form, defaulting to auto-redeem', async () => {
        const user = scriptedUser({ subcommand: 'subscribe', options: { game: 'czn' }, forms: [GOOD] });

        await redeemCommand.execute(user.interaction);

        expect(dataService.subscribe).toHaveBeenCalledWith(
            'user123', 'czn', '12345678901', 'auto-redeem',
            { nickname: 'Tester', world: 'world_live_global' }
        );
        expect(redemptionService.redeemAllForUser).toHaveBeenCalledWith(
            expect.anything(), 'user123', 'czn',
            { userId: '12345678901', fields: { nickname: 'Tester', world: 'world_live_global' } }
        );
        // The form's own interaction carries the answer, acknowledged first.
        const submit = user.responders[1];
        expect(submit.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
        expect(embedText()).toContain('Subscription Activated');
        // The confirmation shows the server by name, not STOVE's id.
        expect(embedFields()).toContainEqual(expect.objectContaining({ name: 'Server', value: '`Global`' }));
    });

    it('skips the form when every detail was typed', async () => {
        const user = scriptedUser({
            subcommand: 'subscribe',
            options: { game: 'czn', userid: GOOD.userid, nickname: GOOD.nickname, server: GOOD.world },
        });

        await redeemCommand.execute(user.interaction);

        expect(user.shownModals).toHaveLength(0);
        expect(dataService.subscribe).toHaveBeenCalled();
    });

    it('saves nothing when the form is closed', async () => {
        const user = scriptedUser({ subcommand: 'subscribe', options: { game: 'czn' }, forms: [null] });

        await redeemCommand.execute(user.interaction);

        expect(dataService.subscribe).not.toHaveBeenCalled();
        expect(user.last()).toBeUndefined();
    });

    it('lists every problem at once, with a button to fix them', async () => {
        const user = scriptedUser({
            subcommand: 'subscribe',
            options: { game: 'czn' },
            forms: [{ userid: 'abc123', nickname: 'N'.repeat(25), world: GOOD.world }],
        });

        await redeemCommand.execute(user.interaction);

        expect(dataService.subscribe).not.toHaveBeenCalled();
        const text = embedText();
        expect(text).toContain('digits only');
        expect(text).toContain('20 characters or fewer');
        const offered = user.responders
            .flatMap(r => r.editReply.mock.calls.map((c: any[]) => c[0]))
            .find((payload: any) => payload.components?.length);
        expect(offered.components[0].toJSON().components[0].label).toBe('Fix details');
        // Not pressed in time: the button is taken away rather than left dead.
        expect(user.last()).toEqual({ components: [] });
    });

    it('tells the user at once when the game rejects the details, and lets them fix them', async () => {
        redemptionService.redeemAllForUser
            .mockResolvedValueOnce(rejected)
            .mockResolvedValueOnce({ total: 2, successful: 2, alreadyRedeemed: 0, failed: 0, identityRejected: false });
        const typo = { ...GOOD, nickname: 'Testr' };
        const user = scriptedUser({
            subcommand: 'subscribe',
            options: { game: 'czn' },
            forms: [typo, GOOD],
            clicks: 1,
        });

        await redeemCommand.execute(user.interaction);

        // The rejected subscription isn't left behind for the six-hourly run to find.
        expect(dataService.unsubscribe).toHaveBeenCalledWith('user123', 'czn');
        expect(embedText()).toContain("didn't recognise");
        expect(embedText()).toContain('nothing was saved');
        // The second form is prefilled with what they typed, typo and all.
        expect(prefilled(user.shownModals[1])).toEqual({
            userid: '12345678901', nickname: 'Testr', world: 'world_live_global',
        });
        expect(dataService.subscribe).toHaveBeenCalledTimes(2);
        expect(dataService.subscribe).toHaveBeenLastCalledWith(
            'user123', 'czn', '12345678901', 'auto-redeem', { nickname: 'Tester', world: 'world_live_global' }
        );
        // The fixed form updates the same message rather than stacking another.
        const secondSubmit = user.responders.find(r => r.id === 'submit-3' || r.id === 'submit-4');
        expect(secondSubmit?.deferUpdate).toHaveBeenCalled();
        expect(embedText()).toContain('Subscription Activated');
    });

    it('stops offering the button after three tries', async () => {
        redemptionService.redeemAllForUser.mockResolvedValue(rejected);
        const user = scriptedUser({
            subcommand: 'subscribe',
            options: { game: 'czn' },
            forms: [GOOD, GOOD, GOOD, GOOD],
            clicks: 5,
        });

        await redeemCommand.execute(user.interaction);

        expect(user.shownModals).toHaveLength(3);
        expect(user.last().components).toEqual([]);
        // No button, so no "press the button": say what to do instead.
        const lastMessage = embedText().split('\n').slice(-2).join('\n');
        expect(lastMessage).not.toContain('Fix details');
        expect(lastMessage).toContain('/redeem subscribe game:czn');
    });

    it('listens on the channel when Discord returns raw message data', async () => {
        // editReply gives raw API data, not a Message, for an uncached channel.
        const user = scriptedUser({
            subcommand: 'subscribe',
            options: { game: 'czn', userid: 'not-digits', nickname: GOOD.nickname, server: GOOD.world },
        });
        const channel = { awaitMessageComponent: vi.fn().mockRejectedValue(new Error('time')) };
        (user.interaction as any).editReply = vi.fn().mockResolvedValue({ id: 'raw' });
        (user.interaction as any).channel = channel;

        await redeemCommand.execute(user.interaction);

        expect(channel.awaitMessageComponent).toHaveBeenCalledWith(expect.objectContaining({ time: expect.any(Number) }));
    });

    it('takes the button away when a reopened form is closed', async () => {
        redemptionService.redeemAllForUser.mockResolvedValue(rejected);
        const user = scriptedUser({
            subcommand: 'subscribe',
            options: { game: 'czn' },
            forms: [GOOD, null], // fills the first form, closes the second
            clicks: 1,
        });

        await redeemCommand.execute(user.interaction);

        expect(user.shownModals).toHaveLength(2);
        expect(user.last()).toEqual({ components: [] });
    });

    it('opens the same kind of form for a blank BD2 nickname', async () => {
        const user = scriptedUser({ subcommand: 'subscribe', options: { game: 'bd2' }, forms: [{ userid: 'Tester_1' }] });

        await redeemCommand.execute(user.interaction);

        expect(user.shownModals[0].components[0].description).toContain('not your UID');
        expect(dataService.subscribe).toHaveBeenCalledWith('user123', 'bd2', 'Tester_1', 'auto-redeem');
    });

    it('needs no form for a game without account details, and defaults to notifications', async () => {
        const user = scriptedUser({ subcommand: 'subscribe', options: { game: 'lost-sword' } });

        await redeemCommand.execute(user.interaction);

        expect(user.shownModals).toHaveLength(0);
        expect(dataService.subscribe).toHaveBeenCalledWith('user123', 'lost-sword', '', 'notification-only');
        expect(redemptionService.redeemAllForUser).not.toHaveBeenCalled();
    });

    it('says "already subscribed" before showing any form, and points at /redeem edit', async () => {
        dataService.getGameSubscription.mockResolvedValue({ gameId: 'czn' });
        const user = scriptedUser({ subcommand: 'subscribe', options: { game: 'czn' }, forms: [GOOD] });

        await redeemCommand.execute(user.interaction);

        expect(user.shownModals).toHaveLength(0);
        expect(user.interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('/redeem edit game:czn'),
        }));
    });
});

describe('/redeem edit', () => {
    const stored = {
        gameId: 'czn',
        gameUserId: '12345678901',
        gameUserFields: { nickname: 'Tester', world: 'world_live_global' },
        mode: 'auto-redeem',
        subscribedAt: '2026-11-01T00:00:00.000Z',
        redeemedCodes: ['OLDCODE'],
    };

    it('opens the form prefilled with the stored details', async () => {
        dataService.getGameSubscription.mockResolvedValue(stored);
        const user = scriptedUser({ subcommand: 'edit', options: { game: 'czn' }, forms: [null] });

        await redeemCommand.execute(user.interaction);

        expect(prefilled(user.shownModals[0])).toEqual({
            userid: '12345678901', nickname: 'Tester', world: 'world_live_global',
        });
    });

    it('saves new details and redeems with them', async () => {
        dataService.getGameSubscription.mockResolvedValue(stored);
        dataService.updateGameIdentity.mockResolvedValue({ changed: true });
        const user = scriptedUser({
            subcommand: 'edit',
            options: { game: 'czn' },
            forms: [{ ...GOOD, world: 'world_live_asia' }],
        });

        await redeemCommand.execute(user.interaction);

        expect(dataService.updateGameIdentity).toHaveBeenCalledWith(
            'user123', 'czn', '12345678901', { nickname: 'Tester', world: 'world_live_asia' }
        );
        expect(redemptionService.redeemAllForUser).toHaveBeenCalled();
        expect(dataService.revertGameIdentity).not.toHaveBeenCalled();
        expect(embedText()).toContain('details updated');
    });

    it('puts the old details back when the game rejects the new ones', async () => {
        dataService.getGameSubscription.mockResolvedValue(stored);
        dataService.updateGameIdentity.mockResolvedValue({ changed: true });
        redemptionService.redeemAllForUser.mockResolvedValue(rejected);
        const user = scriptedUser({ subcommand: 'edit', options: { game: 'czn' }, forms: [{ ...GOOD, nickname: 'Wrong' }] });

        await redeemCommand.execute(user.interaction);

        // Reverts by naming the rejected details, so a newer edit is never undone.
        expect(dataService.revertGameIdentity).toHaveBeenCalledWith('user123', 'czn', {
            userId: '12345678901', fields: { nickname: 'Wrong', world: 'world_live_global' },
        });
        expect(embedText()).toContain('previous details are kept');
    });

    it('does nothing when the details are unchanged', async () => {
        dataService.getGameSubscription.mockResolvedValue(stored);
        dataService.updateGameIdentity.mockResolvedValue({ changed: false });
        const user = scriptedUser({ subcommand: 'edit', options: { game: 'czn' }, forms: [GOOD] });

        await redeemCommand.execute(user.interaction);

        expect(redemptionService.redeemAllForUser).not.toHaveBeenCalled();
        expect(user.last().content).toContain('Nothing changed');
    });

    it("doesn't redeem for a notification-only subscriber", async () => {
        const notify = { ...stored, mode: 'notification-only' };
        dataService.getGameSubscription.mockResolvedValue(notify);
        dataService.updateGameIdentity.mockResolvedValue({ changed: true });
        const user = scriptedUser({ subcommand: 'edit', options: { game: 'czn' }, forms: [{ ...GOOD, nickname: 'Other' }] });

        await redeemCommand.execute(user.interaction);

        expect(redemptionService.redeemAllForUser).not.toHaveBeenCalled();
        expect(embedFields()).toContainEqual(expect.objectContaining({ name: 'What happens now?', value: 'Saved.' }));
    });

    it('refuses when not subscribed, without a form', async () => {
        const user = scriptedUser({ subcommand: 'edit', options: { game: 'czn' } });

        await redeemCommand.execute(user.interaction);

        expect(user.shownModals).toHaveLength(0);
        expect(user.interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('/redeem subscribe game:czn'),
        }));
    });

    it('says there is nothing to edit for a game without account details', async () => {
        const user = scriptedUser({ subcommand: 'edit', options: { game: 'lost-sword' } });

        await redeemCommand.execute(user.interaction);

        expect(user.interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('nothing to edit'),
        }));
    });
});

describe('/redeem status', () => {
    it('shows every CZN detail and whether the game has accepted them', async () => {
        const sub = {
            gameId: 'czn',
            gameUserId: '12345678901',
            gameUserFields: { nickname: 'Tester', world: 'world_live_asia' },
            mode: 'auto-redeem',
            subscribedAt: '2026-11-01T00:00:00.000Z',
            redeemedCodes: [],
            identityVerifiedAt: '2026-11-19T00:00:00.000Z',
        };
        dataService.getUserSubscriptions.mockResolvedValue({ discordId: 'user123', games: { czn: sub } });
        dataService.getSubscriberContext.mockResolvedValue({ subscription: sub, activeCoupons: [], unredeemed: [] });
        const user = scriptedUser({ subcommand: 'status', options: { game: 'czn' } });

        await redeemCommand.execute(user.interaction);

        const fields = embedFields();
        expect(fields).toContainEqual(expect.objectContaining({ name: 'Character nickname', value: '`Tester`' }));
        expect(fields).toContainEqual(expect.objectContaining({ name: 'Server', value: '`Asia`' }));
        expect(fields).toContainEqual(expect.objectContaining({
            name: 'Account', value: expect.stringContaining('Accepted by the game'),
        }));
    });

    it('flags details the game stopped recognising, with the fix', async () => {
        const sub = {
            gameId: 'czn',
            gameUserId: '12345678901',
            gameUserFields: { nickname: 'Tester', world: 'world_live_global' },
            mode: 'auto-redeem',
            subscribedAt: '2026-11-01T00:00:00.000Z',
            redeemedCodes: [],
            identityVerifiedAt: '2026-11-10T00:00:00.000Z',
            identityRejectedAt: '2026-11-19T00:00:00.000Z',
        };
        dataService.getUserSubscriptions.mockResolvedValue({ discordId: 'user123', games: { czn: sub } });
        dataService.getSubscriberContext.mockResolvedValue({ subscription: sub, activeCoupons: [], unredeemed: [] });
        const user = scriptedUser({ subcommand: 'status', options: { game: 'czn' } });

        await redeemCommand.execute(user.interaction);

        expect(embedFields()).toContainEqual(expect.objectContaining({
            name: 'Account', value: expect.stringContaining('/redeem edit game:czn'),
        }));
    });

    it("doesn't label an older subscription the game hasn't checked yet", async () => {
        const sub = {
            gameId: 'czn', gameUserId: '12345678901',
            gameUserFields: { nickname: 'Tester', world: 'world_live_global' },
            mode: 'auto-redeem', subscribedAt: '2026-10-20T00:00:00.000Z', redeemedCodes: [],
        };
        dataService.getUserSubscriptions.mockResolvedValue({ discordId: 'user123', games: { czn: sub } });
        dataService.getSubscriberContext.mockResolvedValue({ subscription: sub, activeCoupons: [], unredeemed: [] });
        const user = scriptedUser({ subcommand: 'status', options: { game: 'czn' } });

        await redeemCommand.execute(user.interaction);

        expect(embedFields().some(f => f.name === 'Account')).toBe(false);
    });
});

describe('Discord limits on the shipped config', () => {
    it('keeps every form label to 45 characters and every hint to 100', () => {
        for (const game of Object.values(GACHA_GAMES)) {
            expect(game.userIdFieldName.length, game.id).toBeLessThanOrEqual(45);
            expect((game.userIdHint ?? '').length, game.id).toBeLessThanOrEqual(100);
            expect(`${game.shortName} account details`.length, game.id).toBeLessThanOrEqual(45);
            for (const field of game.extraUserFields ?? []) {
                expect(field.label.length, `${game.id}.${field.key}`).toBeLessThanOrEqual(45);
                expect((field.hint ?? '').length, `${game.id}.${field.key}`).toBeLessThanOrEqual(100);
            }
        }
    });

    it('makes every subscribe option after game optional, and adds /redeem edit', () => {
        const json = redeemCommand.data.toJSON() as any;
        const subscribe = json.options.find((o: any) => o.name === 'subscribe');
        expect(subscribe.options.filter((o: any) => o.required).map((o: any) => o.name)).toEqual(['game']);
        expect(json.options.map((o: any) => o.name)).toContain('edit');
    });
});
