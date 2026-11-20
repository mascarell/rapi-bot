/**
 * The buttons under a channel coupon post: Copy code, Redeem for me and
 * Set up. Services are mocked, the game config is the shipped one, and the
 * interaction is a scripted user in the style of redeemIdentityForm.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Client, MessageFlags } from 'discord.js';

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
import { parseCouponButtonId } from '../../services/couponAnnouncementService';

const { handleCouponButton } = await import('../redeem');

// Placeholder account details only.
const GOOD = { userid: '12345678901', nickname: 'Tester', world: 'world_live_global' };
const ephemeral = { flags: MessageFlags.Ephemeral };

/** Every embed title and description the command built, in order. */
const embedText = (): string =>
    vi.mocked(EmbedBuilder).mock.results
        .map(r => r.value as any)
        .flatMap(e => [...e.setTitle.mock.calls, ...e.setDescription.mock.calls].map((c: any[]) => c[0]))
        .join('\n');

/**
 * A member pressing a button on a public channel post. `forms` is what they
 * type into the form the press opens (null = they close it).
 */
function pressButton(
    customId: string,
    forms: Array<Record<string, string> | null> = [],
    opts: { ephemeralMessage?: boolean } = {}
) {
    const queue = [...forms];
    const shownModals: any[] = [];
    const submits: any[] = [];

    const respondable = (base: any) => Object.assign(base, {
        deferred: false,
        replied: false,
        reply: vi.fn(async function (this: any) { this.replied = true; }),
        deferReply: vi.fn(async function (this: any) { this.deferred = true; }),
        deferUpdate: vi.fn(async function (this: any) { this.deferred = true; }),
        editReply: vi.fn(async () => ({ awaitMessageComponent: vi.fn().mockRejectedValue(new Error('time')) })),
    });

    const button: any = respondable({
        id: 'press-1',
        guildId: '1065055945123708928',
        customId,
        user: { id: 'user123', send: vi.fn().mockResolvedValue({}) },
        client: {} as Client,
        isModalSubmit: () => false,
    });
    button.showModal = vi.fn(async (modal: any) => { shownModals.push(modal.toJSON()); });
    button.awaitModalSubmit = vi.fn(async ({ filter }: any) => {
        const typed = queue.shift();
        if (!typed) throw new Error('time');
        const submit = respondable({
            id: `submit-${submits.length + 1}`,
            customId: shownModals.at(-1).custom_id,
            user: { id: 'user123' },
            isModalSubmit: () => true,
            // A form opened from a channel post's button: the post is the message.
            isFromMessage: () => true,
            message: { flags: { has: () => opts.ephemeralMessage === true } },
            fields: {
                getTextInputValue: (key: string) => typed[key] ?? '',
                getStringSelectValues: (key: string) => (typed[key] ? [typed[key]] : []),
            },
        });
        expect(filter(submit)).toBe(true);
        submits.push(submit);
        return submit;
    });

    return { button, shownModals, submits };
}

let dataService: any;
let redemptionService: any;
let guildConfig: any;

const subscribed = { gameId: 'czn', gameUserId: '12345678901', mode: 'auto-redeem', redeemedCodes: [] };

beforeEach(() => {
    vi.clearAllMocks();
    dataService = {
        getGameSubscription: vi.fn().mockResolvedValue(subscribed),
        subscribe: vi.fn().mockResolvedValue(undefined),
        unsubscribe: vi.fn().mockResolvedValue(true),
    };
    redemptionService = {
        redeemOneForUser: vi.fn(),
        redeemAllForUser: vi.fn().mockResolvedValue({
            total: 2, successful: 2, alreadyRedeemed: 0, failed: 0, identityRejected: false,
        }),
    };
    vi.mocked(getGachaDataService).mockReturnValue(dataService);
    vi.mocked(getGachaRedemptionService).mockReturnValue(redemptionService);
    guildConfig = { isGuildAllowed: vi.fn().mockResolvedValue(true) };
    vi.mocked(getGachaGuildConfigService).mockReturnValue(guildConfig);
});

afterEach(() => {
    vi.useRealTimers();
});

const done = (success: boolean, errorCode?: string, message = 'nope') => ({
    status: 'done' as const,
    gameUserId: '12345678901',
    result: { success, errorCode, message, code: 'TESTCODE1', gameId: 'czn', timestamp: '2026-11-20T00:00:00.000Z' },
});

describe('Copy code', () => {
    it('replies to the member alone with exactly the code', async () => {
        const { button } = pressButton('coupon:copy:czn:TESTCODE1');

        await handleCouponButton(button);

        expect(button.reply).toHaveBeenCalledTimes(1);
        expect(button.reply).toHaveBeenCalledWith({ content: 'TESTCODE1', flags: MessageFlags.Ephemeral });
        expect(button.showModal).not.toHaveBeenCalled();
        expect(button.deferReply).not.toHaveBeenCalled();
        expect(dataService.getGameSubscription).not.toHaveBeenCalled();
        expect(redemptionService.redeemOneForUser).not.toHaveBeenCalled();
    });

    it('keeps the case and characters of the code as posted', async () => {
        const { button } = pressButton('coupon:copy:bd2:Test-Code_9');

        await handleCouponButton(button);

        expect(button.reply).toHaveBeenCalledWith({ content: 'Test-Code_9', flags: MessageFlags.Ephemeral });
    });
});

describe('Redeem for me, not subscribed yet', () => {
    it('opens the subscribe form as the first response, with no deferReply', async () => {
        dataService.getGameSubscription.mockResolvedValue(null);
        const { button, shownModals } = pressButton('coupon:redeem:czn:TESTCODE1', [null]);

        await handleCouponButton(button);

        expect(dataService.getGameSubscription).toHaveBeenCalledWith('user123', 'czn');
        expect(button.showModal).toHaveBeenCalledTimes(1);
        expect(shownModals[0].title).toBe('CZN account details');
        expect(shownModals[0].components.map((l: any) => l.label))
            .toEqual(['STOVE membership number', 'Character nickname', 'Server']);
        expect(button.deferReply).not.toHaveBeenCalled();
        expect(button.reply).not.toHaveBeenCalled();
        // Subscribing redeems everything active; the single-code path isn't used.
        expect(redemptionService.redeemOneForUser).not.toHaveBeenCalled();
    });

    it('opens the form for BD2 too', async () => {
        dataService.getGameSubscription.mockResolvedValue(null);
        const { button, shownModals } = pressButton('coupon:redeem:bd2:TESTCODE1', [null]);

        await handleCouponButton(button);

        expect(shownModals).toHaveLength(1);
        expect(button.deferReply).not.toHaveBeenCalled();
    });
});

describe('Redeem for me, subscribed', () => {
    it('defers ephemerally, then redeems that code for that member', async () => {
        redemptionService.redeemOneForUser.mockResolvedValue(done(true));
        const { button } = pressButton('coupon:redeem:czn:TESTCODE1');

        await handleCouponButton(button);

        expect(button.showModal).not.toHaveBeenCalled();
        expect(button.deferReply).toHaveBeenCalledWith(ephemeral);
        expect(redemptionService.redeemOneForUser).toHaveBeenCalledWith('user123', 'czn', 'TESTCODE1');
        expect(button.deferReply.mock.invocationCallOrder[0])
            .toBeLessThan(redemptionService.redeemOneForUser.mock.invocationCallOrder[0]);
        expect(button.editReply).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['success', done(true), ['✅ Redeemed `TESTCODE1`', 'in-game mailbox']],
        ['AlreadyUsed', done(false, 'AlreadyUsed'), ['was already redeemed on your account']],
        ['already-redeemed', { status: 'already-redeemed', gameUserId: '12345678901' }, ['is already redeemed on your account']],
        ['in-progress', { status: 'in-progress' }, ['already redeeming `TESTCODE1`', "You'll get a DM"]],
        ['inactive', { status: 'inactive' }, ['`TESTCODE1` has expired or been withdrawn']],
        ['IncorrectUser', done(false, 'IncorrectUser'), ["didn't recognise your saved details", '/redeem edit game:czn']],
        ['another failure', done(false, 'ExceededUses', 'This coupon has reached its maximum redemption limit'),
            ["❌ `TESTCODE1` wasn't redeemed", 'maximum redemption limit']],
    ])('tells the member the outcome: %s', async (_label, outcome, expected) => {
        redemptionService.redeemOneForUser.mockResolvedValue(outcome);
        const { button } = pressButton('coupon:redeem:czn:TESTCODE1');

        await handleCouponButton(button);

        const payload = button.editReply.mock.calls[0][0];
        for (const text of expected) expect(payload.content).toContain(text);
        // Nothing to press after a normal answer.
        expect(payload.components).toBeUndefined();
    });

    it('names the right game in the IncorrectUser hint', async () => {
        redemptionService.redeemOneForUser.mockResolvedValue(done(false, 'IncorrectUser'));
        const { button } = pressButton('coupon:redeem:bd2:TESTCODE1');

        await handleCouponButton(button);

        expect(button.editReply.mock.calls[0][0].content).toContain('/redeem edit game:bd2');
    });

    it('defers and reports unsupported for a game that cannot auto-redeem', async () => {
        dataService.getGameSubscription.mockResolvedValue(null);
        redemptionService.redeemOneForUser.mockResolvedValue({ status: 'unsupported' });
        const { button } = pressButton('coupon:redeem:lost-sword:TESTCODE1');

        await handleCouponButton(button);

        // No form for a game that has nothing to subscribe to automatically.
        expect(button.showModal).not.toHaveBeenCalled();
        expect(button.deferReply).toHaveBeenCalledWith(ephemeral);
        expect(button.editReply.mock.calls[0][0].content).toContain('Copy code');
    });

    it('reports a failure instead of throwing when redeeming blows up', async () => {
        redemptionService.redeemOneForUser.mockRejectedValue(new Error('boom'));
        const { button } = pressButton('coupon:redeem:czn:TESTCODE1');

        await expect(handleCouponButton(button)).resolves.toBeUndefined();

        expect(button.deferReply).toHaveBeenCalled();
        expect(button.editReply).toHaveBeenCalled();
    });
});

describe('Redeem for me, when the subscription read is slow', () => {
    /** A read that finishes after `ms` of fake time with `value`. */
    const slowRead = (ms: number, value: unknown) =>
        new Promise(resolve => setTimeout(() => resolve(value), ms));

    it('waits up to 1.5 seconds for the answer, then defers', async () => {
        vi.useFakeTimers();
        dataService.getGameSubscription.mockReturnValue(slowRead(10_000, null));
        redemptionService.redeemOneForUser.mockResolvedValue({ status: 'in-progress' });
        const { button } = pressButton('coupon:redeem:czn:TESTCODE1');

        const handled = handleCouponButton(button);
        await vi.advanceTimersByTimeAsync(1400);
        expect(button.deferReply).not.toHaveBeenCalled();
        expect(button.showModal).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(200);
        await handled;

        expect(button.deferReply).toHaveBeenCalledWith(ephemeral);
        expect(button.showModal).not.toHaveBeenCalled();
    });

    it('offers a Set up button for coupon:subscribe:<game> when it turns out they are not subscribed', async () => {
        vi.useFakeTimers();
        dataService.getGameSubscription.mockReturnValue(slowRead(10_000, null));
        redemptionService.redeemOneForUser.mockResolvedValue({ status: 'not-subscribed' });
        const { button } = pressButton('coupon:redeem:czn:TESTCODE1');

        const handled = handleCouponButton(button);
        await vi.advanceTimersByTimeAsync(1500);
        await handled;

        expect(button.showModal).not.toHaveBeenCalled();
        const payload = button.editReply.mock.calls[0][0];
        expect(payload.content).toContain("You haven't set up Chaos Zero Nightmare yet");
        expect(payload.content).toContain('Set up');
        expect(payload.components).toHaveLength(1);
        const [setUp] = payload.components[0].toJSON().components;
        expect(setUp.custom_id).toBe('coupon:subscribe:czn');
        expect(parseCouponButtonId(setUp.custom_id)).toEqual({ action: 'subscribe', gameId: 'czn', code: '' });
        expect(setUp.label).toContain('Set up');
    });

    it('just redeems when the slow read would have said they are subscribed', async () => {
        vi.useFakeTimers();
        dataService.getGameSubscription.mockReturnValue(slowRead(10_000, subscribed));
        redemptionService.redeemOneForUser.mockResolvedValue(done(true));
        const { button } = pressButton('coupon:redeem:czn:TESTCODE1');

        const handled = handleCouponButton(button);
        await vi.advanceTimersByTimeAsync(1500);
        await handled;

        const payload = button.editReply.mock.calls[0][0];
        expect(payload.content).toContain('✅ Redeemed `TESTCODE1`');
        expect(payload.components).toBeUndefined();
    });

    it('does not wait the full 1.5 seconds when the read is fast', async () => {
        vi.useFakeTimers();
        dataService.getGameSubscription.mockResolvedValue(null);
        const { button } = pressButton('coupon:redeem:czn:TESTCODE1', [null]);

        await handleCouponButton(button);

        expect(button.showModal).toHaveBeenCalledTimes(1);
    });

    it('offers Set up when the subscription read itself finds nothing after deferring', async () => {
        // Subscribed at press time, gone by the time the redemption looks.
        redemptionService.redeemOneForUser.mockResolvedValue({ status: 'not-subscribed' });
        const { button } = pressButton('coupon:redeem:czn:TESTCODE1');

        await handleCouponButton(button);

        expect(button.editReply.mock.calls[0][0].components[0].toJSON().components[0].custom_id)
            .toBe('coupon:subscribe:czn');
    });
});

describe('Set up (subscribe action)', () => {
    it('opens the form with no other response first', async () => {
        dataService.getGameSubscription.mockResolvedValue(null);
        const { button, shownModals } = pressButton('coupon:subscribe:czn', [null]);

        await handleCouponButton(button);

        expect(button.showModal).toHaveBeenCalledTimes(1);
        expect(shownModals[0].title).toBe('CZN account details');
        expect(button.deferReply).not.toHaveBeenCalled();
        expect(button.reply).not.toHaveBeenCalled();
        expect(dataService.getGameSubscription).toHaveBeenCalledWith('user123', 'czn');
        expect(redemptionService.redeemOneForUser).not.toHaveBeenCalled();
    });

    it('saves nothing when the form is closed', async () => {
        dataService.getGameSubscription.mockResolvedValue(null);
        const { button } = pressButton('coupon:subscribe:czn', [null]);

        await handleCouponButton(button);

        expect(dataService.subscribe).not.toHaveBeenCalled();
        expect(redemptionService.redeemAllForUser).not.toHaveBeenCalled();
    });
});

describe('a malformed custom id', () => {
    it.each([
        ['wrong prefix', 'redeem_fix_123'],
        ['unknown game', 'coupon:redeem:nope:TESTCODE1'],
        ['unknown action', 'coupon:delete:czn:TESTCODE1'],
        ['copy without a code', 'coupon:copy:czn:'],
        ['redeem with a bad code', 'coupon:redeem:czn:BAD CODE'],
        ['empty', ''],
    ])('does nothing: %s', async (_label, customId) => {
        const { button } = pressButton(customId);

        await expect(handleCouponButton(button)).resolves.toBeUndefined();

        expect(button.reply).not.toHaveBeenCalled();
        expect(button.deferReply).not.toHaveBeenCalled();
        expect(button.deferUpdate).not.toHaveBeenCalled();
        expect(button.editReply).not.toHaveBeenCalled();
        expect(button.showModal).not.toHaveBeenCalled();
        expect(dataService.getGameSubscription).not.toHaveBeenCalled();
        expect(redemptionService.redeemOneForUser).not.toHaveBeenCalled();
    });
});

describe('completing the form opened from a button', () => {
    const czn = { nickname: 'Tester', world: 'world_live_global' };

    it('subscribes the member, defaulting to auto-redeem, and redeems what is active', async () => {
        dataService.getGameSubscription.mockResolvedValue(null);
        const { button, submits } = pressButton('coupon:redeem:czn:TESTCODE1', [GOOD]);

        await handleCouponButton(button);

        expect(dataService.subscribe).toHaveBeenCalledWith('user123', 'czn', '12345678901', 'auto-redeem', czn);
        expect(redemptionService.redeemAllForUser).toHaveBeenCalledWith(
            expect.anything(), 'user123', 'czn', { userId: '12345678901', fields: czn }
        );
        expect(embedText()).toContain('Subscription Activated');
        // The reply goes out on the form's own interaction.
        expect(submits[0].editReply).toHaveBeenCalledWith(expect.objectContaining({ components: [] }));
    });

    it('subscribes from the Set up button the same way', async () => {
        dataService.getGameSubscription.mockResolvedValue(null);
        const { button } = pressButton('coupon:subscribe:czn', [GOOD]);

        await handleCouponButton(button);

        expect(dataService.subscribe).toHaveBeenCalledWith('user123', 'czn', '12345678901', 'auto-redeem', czn);
        expect(redemptionService.redeemAllForUser).toHaveBeenCalled();
    });

    it('subscribes a BD2 member with the one detail BD2 needs', async () => {
        dataService.getGameSubscription.mockResolvedValue(null);
        const { button } = pressButton('coupon:redeem:bd2:TESTCODE1', [{ userid: 'Tester_1' }]);

        await handleCouponButton(button);

        expect(dataService.subscribe).toHaveBeenCalledWith('user123', 'bd2', 'Tester_1', 'auto-redeem');
    });

    it('lists the problems and subscribes nothing when the form has bad details', async () => {
        dataService.getGameSubscription.mockResolvedValue(null);
        const { button } = pressButton('coupon:redeem:czn:TESTCODE1', [{ ...GOOD, userid: 'abc123' }]);

        await handleCouponButton(button);

        expect(dataService.subscribe).not.toHaveBeenCalled();
        expect(embedText()).toContain('digits only');
    });

    it("answers the form privately, never by editing the public channel post (the form's reply must not be deferUpdate)", async () => {
        // A form opened from a button on a PUBLIC post is a modal submit "from
        // a message" in discord.js, so deferUpdate + editReply would overwrite
        // the post with the member's subscription confirmation, account
        // details included. It must be an ephemeral deferred reply instead.
        dataService.getGameSubscription.mockResolvedValue(null);
        const { button, submits } = pressButton('coupon:redeem:czn:TESTCODE1', [GOOD]);

        await handleCouponButton(button);

        expect(submits).toHaveLength(1);
        expect(submits[0].deferUpdate).not.toHaveBeenCalled();
        expect(submits[0].deferReply).toHaveBeenCalledWith(ephemeral);
    });
});

describe('the server check', () => {
    const notAllowed = "isn't available in this server";

    it('checks the press against the server it happened in', async () => {
        redemptionService.redeemOneForUser.mockResolvedValue(done(true));
        const { button } = pressButton('coupon:redeem:czn:TESTCODE1');

        await handleCouponButton(button);

        expect(guildConfig.isGuildAllowed).toHaveBeenCalledWith('1065055945123708928');
    });

    it.each(['redeem', 'subscribe'])('refuses the %s action in a server that is no longer allowed', async (action) => {
        guildConfig.isGuildAllowed.mockResolvedValue(false);
        const customId = action === 'redeem' ? 'coupon:redeem:czn:TESTCODE1' : 'coupon:subscribe:czn';
        const { button } = pressButton(customId, [GOOD]);

        await handleCouponButton(button);

        expect(button.reply).toHaveBeenCalledTimes(1);
        const payload = button.reply.mock.calls[0][0];
        expect(payload.content).toContain(notAllowed);
        expect(payload.flags).toBe(MessageFlags.Ephemeral);
        expect(button.showModal).not.toHaveBeenCalled();
        expect(button.deferReply).not.toHaveBeenCalled();
        expect(dataService.subscribe).not.toHaveBeenCalled();
        expect(redemptionService.redeemOneForUser).not.toHaveBeenCalled();
    });

    it('lets Copy code work anywhere, without even asking', async () => {
        guildConfig.isGuildAllowed.mockResolvedValue(false);
        const { button } = pressButton('coupon:copy:czn:TESTCODE1');

        await handleCouponButton(button);

        expect(button.reply).toHaveBeenCalledWith({ content: 'TESTCODE1', flags: MessageFlags.Ephemeral });
        expect(guildConfig.isGuildAllowed).not.toHaveBeenCalled();
    });

    it('refuses a press made outside a server (null guild id) the same way', async () => {
        guildConfig.isGuildAllowed.mockResolvedValue(false);
        const { button } = pressButton('coupon:redeem:czn:TESTCODE1');
        button.guildId = null;

        await handleCouponButton(button);

        expect(guildConfig.isGuildAllowed).toHaveBeenCalledWith(null);
        expect(button.reply.mock.calls[0][0].content).toContain(notAllowed);
    });

    it('does not block anyone when the allowlist read is slower than 1.5 seconds', async () => {
        vi.useFakeTimers();
        guildConfig.isGuildAllowed.mockReturnValue(new Promise(resolve => setTimeout(() => resolve(false), 10_000)));
        redemptionService.redeemOneForUser.mockResolvedValue(done(true));
        const { button } = pressButton('coupon:redeem:czn:TESTCODE1');

        const handled = handleCouponButton(button);
        await vi.advanceTimersByTimeAsync(1500);
        await handled;

        expect(button.editReply.mock.calls[0][0].content).toContain('✅ Redeemed');
    });

    it('runs both reads at once, so the two together stay within one 1.5 second budget', async () => {
        vi.useFakeTimers();
        const slow = (value: unknown) => new Promise(resolve => setTimeout(() => resolve(value), 10_000));
        guildConfig.isGuildAllowed.mockReturnValue(slow(true));
        dataService.getGameSubscription.mockReturnValue(slow(null));
        redemptionService.redeemOneForUser.mockResolvedValue({ status: 'in-progress' });
        const { button } = pressButton('coupon:redeem:czn:TESTCODE1');

        const handled = handleCouponButton(button);
        await vi.advanceTimersByTimeAsync(1500);
        await handled;

        expect(button.deferReply).toHaveBeenCalledWith(ephemeral);
    });
});

describe('Set up when the member may already be set up', () => {
    it('opens the form when they are not subscribed', async () => {
        dataService.getGameSubscription.mockResolvedValue(null);
        const { button, shownModals } = pressButton('coupon:subscribe:czn', [null]);

        await handleCouponButton(button);

        expect(shownModals).toHaveLength(1);
        expect(button.reply).not.toHaveBeenCalled();
    });

    it('says they are already set up, privately, when they are', async () => {
        const { button } = pressButton('coupon:subscribe:czn', [GOOD]);

        await handleCouponButton(button);

        expect(button.showModal).not.toHaveBeenCalled();
        expect(dataService.subscribe).not.toHaveBeenCalled();
        const payload = button.reply.mock.calls[0][0];
        expect(payload.content).toContain('already set up');
        expect(payload.content).toContain('Chaos Zero Nightmare');
        expect(payload.flags).toBe(MessageFlags.Ephemeral);
    });

    it('asks them to press Set up again when the subscription read timed out', async () => {
        vi.useFakeTimers();
        dataService.getGameSubscription.mockReturnValue(new Promise(resolve => setTimeout(() => resolve(null), 10_000)));
        const { button } = pressButton('coupon:subscribe:czn', [GOOD]);

        const handled = handleCouponButton(button);
        await vi.advanceTimersByTimeAsync(1500);
        await handled;

        expect(button.showModal).not.toHaveBeenCalled();
        const payload = button.reply.mock.calls[0][0];
        expect(payload.content).toContain('Press **Set up** again');
        expect(payload.flags).toBe(MessageFlags.Ephemeral);
    });
});

describe('the new outcomes in words', () => {
    it('details-rejected points at /redeem edit', async () => {
        redemptionService.redeemOneForUser.mockResolvedValue({ status: 'details-rejected' });
        const { button } = pressButton('coupon:redeem:czn:TESTCODE1');

        await handleCouponButton(button);

        const { content } = button.editReply.mock.calls[0][0];
        expect(content).toContain('stopped recognising your saved details');
        expect(content).toContain('/redeem edit game:czn');
    });

    it('cooling-down quotes the game and says when Rapi will try again', async () => {
        const until = Date.UTC(2026, 10, 21, 6, 0, 0);
        redemptionService.redeemOneForUser.mockResolvedValue({
            status: 'cooling-down', until, result: { message: 'This code has expired', success: false },
        });
        const { button } = pressButton('coupon:redeem:czn:TESTCODE1');

        await handleCouponButton(button);

        const { content } = button.editReply.mock.calls[0][0];
        expect(content).toContain('This code has expired');
        expect(content).toContain(`<t:${until / 1000}:R>`);
        expect(content).toContain("won't try again");
    });
});

describe('when the reply can no longer be edited', () => {
    it('DMs the member the outcome after a completed redemption', async () => {
        redemptionService.redeemOneForUser.mockResolvedValue(done(true));
        const { button } = pressButton('coupon:redeem:czn:TESTCODE1');
        button.editReply.mockRejectedValueOnce(new Error('Unknown Webhook'));

        await expect(handleCouponButton(button)).resolves.toBeUndefined();

        expect(button.user.send).toHaveBeenCalledTimes(1);
        expect(button.user.send.mock.calls[0][0].content).toContain('✅ Redeemed `TESTCODE1`');
    });

    it('does not throw when the DM is closed too', async () => {
        redemptionService.redeemOneForUser.mockResolvedValue(done(true));
        const { button } = pressButton('coupon:redeem:czn:TESTCODE1');
        button.editReply.mockRejectedValueOnce(new Error('Unknown Webhook'));
        button.user.send.mockRejectedValue(new Error('Cannot send messages to this user'));

        await expect(handleCouponButton(button)).resolves.toBeUndefined();
    });

    it('does not DM for an outcome where nothing was sent to the game', async () => {
        redemptionService.redeemOneForUser.mockResolvedValue({ status: 'inactive' });
        const { button } = pressButton('coupon:redeem:czn:TESTCODE1');
        button.editReply.mockRejectedValueOnce(new Error('Unknown Webhook'));

        await expect(handleCouponButton(button)).resolves.toBeUndefined();

        expect(button.user.send).not.toHaveBeenCalled();
    });
});

describe('how the form acknowledges, by where it was opened', () => {
    it('updates the message in place when the form came from an ephemeral message (Set up under a private reply)', async () => {
        const { button, submits } = pressButton('coupon:subscribe:czn', [GOOD], { ephemeralMessage: true });
        dataService.getGameSubscription.mockResolvedValue(null);

        await handleCouponButton(button);

        expect(submits).toHaveLength(1);
        expect(submits[0].deferUpdate).toHaveBeenCalled();
        expect(submits[0].deferReply).not.toHaveBeenCalled();
    });

    it('replies privately, never editing the post, when the form came from a public message', async () => {
        const { button, submits } = pressButton('coupon:redeem:czn:TESTCODE1', [GOOD], { ephemeralMessage: false });
        dataService.getGameSubscription.mockResolvedValue(null);

        await handleCouponButton(button);

        expect(submits[0].deferUpdate).not.toHaveBeenCalled();
        expect(submits[0].deferReply).toHaveBeenCalledWith(ephemeral);
    });
});
