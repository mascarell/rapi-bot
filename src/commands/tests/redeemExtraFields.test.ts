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

import { getGachaDataService } from '../../services/gachaDataService';
import { getGachaRedemptionService } from '../../services/gachaRedemptionService';
import { getGachaGuildConfigService } from '../../services/gachaGuildConfigService';
// The real game config, deliberately not mocked: the bug this file guards
// against was a mismatch between the config and the slash command.
import { GACHA_GAMES } from '../../utils/data/gachaGamesConfig';

const redeemCommand = (await import('../redeem')).default;

const subscribeOptionNames = (): string[] => {
    const json = redeemCommand.data.toJSON() as any;
    const subscribe = json.options.find((o: any) => o.name === 'subscribe');
    return subscribe.options.map((o: any) => o.name);
};

describe('/redeem subscribe extra identity fields', () => {
    it('every extraUserFields entry is read from an option that exists on /redeem subscribe', () => {
        const names = subscribeOptionNames();
        for (const game of Object.values(GACHA_GAMES)) {
            for (const field of game.extraUserFields ?? []) {
                expect(names, `${game.id}.${field.key}`).toContain(field.optionName ?? field.key);
            }
        }
    });

    describe('CZN', () => {
        let interaction: Partial<ChatInputCommandInteraction>;
        let dataService: any;
        let redemptionService: any;
        let options: Record<string, string | null>;

        beforeEach(() => {
            vi.clearAllMocks();
            options = {
                game: 'czn',
                mode: 'auto-redeem',
                userid: '12345678901',
                nickname: 'Tester',
                server: 'world_live_global',
            };
            interaction = {
                guildId: '1065055945123708928',
                user: { id: 'user123' } as any,
                client: {} as Client,
                options: {
                    getSubcommand: vi.fn().mockReturnValue('subscribe'),
                    // Keyed by the option names Discord actually sends.
                    getString: vi.fn().mockImplementation((name: string) => options[name] ?? null),
                } as any,
                reply: vi.fn().mockResolvedValue({}),
            };
            dataService = { subscribe: vi.fn().mockResolvedValue(undefined) };
            redemptionService = {
                redeemAllForUser: vi.fn().mockResolvedValue({ total: 0, successful: 0, alreadyRedeemed: 0, failed: 0 }),
            };
            (getGachaDataService as any).mockReturnValue(dataService);
            (getGachaRedemptionService as any).mockReturnValue(redemptionService);
            (getGachaGuildConfigService as any).mockReturnValue({ isGuildAllowed: vi.fn().mockResolvedValue(true) });
        });

        it('stores the server picked in the `server` option as the STOVE world', async () => {
            await redeemCommand.execute(interaction as ChatInputCommandInteraction);

            expect(dataService.subscribe).toHaveBeenCalledWith(
                'user123', 'czn', '12345678901', 'auto-redeem',
                { nickname: 'Tester', world: 'world_live_global' }
            );
            expect(redemptionService.redeemAllForUser).toHaveBeenCalledWith(
                expect.anything(), 'user123', 'czn',
                { userId: '12345678901', fields: { nickname: 'Tester', world: 'world_live_global' } }
            );
        });

        it('still rejects a subscription with no server', async () => {
            options.server = null;

            await redeemCommand.execute(interaction as ChatInputCommandInteraction);

            expect(dataService.subscribe).not.toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Server is required'),
                flags: MessageFlags.Ephemeral,
            }));
        });
    });
});
