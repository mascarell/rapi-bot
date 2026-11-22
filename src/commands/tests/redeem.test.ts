import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    Guild,
    GuildMember,
    GuildMemberRoleManager,
    Collection,
    Role,
    PermissionsBitField,
    Client
,
    MessageFlags
} from 'discord.js';

// Set environment variable before any imports
vi.stubEnv('CDN_DOMAIN_URL', 'https://cdn.example.com');

// Mock EmbedBuilder to avoid validation issues in tests
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

// Mock the services
vi.mock('../../services/gachaDataService', () => ({
    getGachaDataService: vi.fn(),
}));

vi.mock('../../services/gachaRedemptionService', () => ({
    getGachaRedemptionService: vi.fn(),
}));

vi.mock('../../services/gachaGuildConfigService', () => ({
    getGachaGuildConfigService: vi.fn(),
}));

vi.mock('../../utils/data/gachaGamesConfig', () => ({
    GACHA_GAMES: {
        'bd2': {
            id: 'bd2',
            name: 'Brown Dust 2',
            shortName: 'BD2',
            apiEndpoint: 'https://test-api.example.com/coupon',
            apiConfig: { appId: 'bd2-live', method: 'POST' },
            supportsAutoRedeem: true,
            logoPath: 'https://cdn.example.com/bd2.png',
            embedColor: 0x8B4513,
            maxNicknameLength: 24,
            maxCodeLength: 20,
            userIdFieldName: 'Nickname',
            requiresUserId: true,
        },
        'nikke': {
            id: 'nikke',
            name: 'NIKKE',
            shortName: 'NIKKE',
            manualRedeemUrl: 'https://nikke.example.com/redeem',
            supportsAutoRedeem: false,
            logoPath: 'https://cdn.example.com/nikke.png',
            embedColor: 0xFF69B4,
            maxNicknameLength: 20,
            maxCodeLength: 20,
            userIdFieldName: 'Player ID',
            requiresUserId: false,
        },
    },
    getGameConfig: vi.fn(),
    getSupportedGameIds: vi.fn().mockReturnValue(['bd2', 'nikke']),
    isValidGameId: vi.fn().mockImplementation((id: string) => ['bd2', 'nikke'].includes(id)),
}));

import { getGachaDataService } from '../../services/gachaDataService';
import { getGachaRedemptionService } from '../../services/gachaRedemptionService';
import { getGachaGuildConfigService } from '../../services/gachaGuildConfigService';
import { getGameConfig, isValidGameId } from '../../utils/data/gachaGamesConfig';

import { EmbedBuilder } from 'discord.js';

/** Every title and description the command put into an embed. */
const embedText = (): string =>
    vi.mocked(EmbedBuilder).mock.results
        .map(r => r.value as any)
        .flatMap(e => [...e.setTitle.mock.calls, ...e.setDescription.mock.calls].map((c: any[]) => c[0]))
        .join('\n');

// Import the command - use dynamic import for ESM module
const redeemCommandModule = await import('../redeem');
const redeemCommand = redeemCommandModule.default;

describe('Redeem Command', () => {
    let mockInteraction: Partial<ChatInputCommandInteraction>;
    let mockGuild: Partial<Guild>;
    let mockMember: Partial<GuildMember>;
    let mockDataService: any;
    let mockRedemptionService: any;

    beforeEach(() => {
        // Setup mock guild member
        const mockRoles = new Collection<string, Role>();
        mockMember = {
            roles: {
                cache: mockRoles,
            } as unknown as GuildMemberRoleManager,
            permissions: new PermissionsBitField(),
        };

        // Setup mock guild
        mockGuild = {
            members: {
                fetch: vi.fn().mockResolvedValue(mockMember),
            } as any,
            // The moderator check reads the resolved caller fields Discord sends
            // with the interaction; derive them from mockMember so tests can
            // keep granting roles/permissions there.
            roles: {
                get cache() {
                    return mockMember.roles!.cache;
                },
            } as any,
        };

        // Setup mock interaction
        mockInteraction = {
            guild: mockGuild as Guild,
            guildId: '1065055945123708928', // Test server ID (allowed)
            user: { id: 'user123' } as any,
            get member() {
                return { roles: [...(mockMember.roles!.cache as Collection<string, Role>).keys()] };
            },
            get memberPermissions() {
                return mockMember.permissions;
            },
            client: {} as Client,
            options: {
                getSubcommand: vi.fn(),
                getString: vi.fn(),
            } as any,
            reply: vi.fn().mockResolvedValue({}),
            deferReply: vi.fn().mockImplementation(async function (this: any) { this.deferred = true; }),
            editReply: vi.fn().mockResolvedValue({
                // No click on "Fix details" within the test: behaves as a timeout.
                awaitMessageComponent: vi.fn().mockRejectedValue(new Error('time')),
            }),
            isModalSubmit: vi.fn().mockReturnValue(false),
            showModal: vi.fn().mockResolvedValue(undefined),
            awaitModalSubmit: vi.fn().mockRejectedValue(new Error('time')),
        } as any;

        // Setup mock data service
        mockDataService = {
            subscribe: vi.fn().mockResolvedValue(undefined),
            unsubscribe: vi.fn().mockResolvedValue(true),
            getUserSubscriptions: vi.fn().mockResolvedValue(null),
            getGameSubscription: vi.fn().mockResolvedValue(null),
            getActiveCoupons: vi.fn().mockResolvedValue([]),
            getAllCoupons: vi.fn().mockResolvedValue([]),
            getUnredeemedCodes: vi.fn().mockResolvedValue([]),
            getSubscriberContext: vi.fn().mockResolvedValue({ subscription: null, activeCoupons: [], unredeemed: [] }),
            getGameStats: vi.fn().mockResolvedValue({ total: 0, autoRedeem: 0, notifyOnly: 0 }),
            addCoupon: vi.fn().mockResolvedValue(undefined),
            removeCoupon: vi.fn().mockResolvedValue(true),
            // Notification preferences
            getNotificationPreferences: vi.fn().mockResolvedValue({
                expirationWarnings: true,
                weeklyDigest: true,
                newCodeAlerts: true,
            }),
            updateNotificationPreferences: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(getGachaDataService).mockReturnValue(mockDataService);

        // Setup mock redemption service
        mockRedemptionService = {
            notifyNewCode: vi.fn().mockResolvedValue(undefined),
            processGameAutoRedemptions: vi.fn().mockResolvedValue({
                gameId: 'bd2',
                usersProcessed: 2,
                totalRedemptions: 4,
                successful: 3,
                failed: 1,
                skipped: 0,
            }),
            redeemAllForUser: vi.fn().mockResolvedValue({
                successful: 2,
                alreadyRedeemed: 0,
                failed: 0,
                total: 2,
            }),
        };
        vi.mocked(getGachaRedemptionService).mockReturnValue(mockRedemptionService);

        // Setup mock guild config service - allow test servers by default
        const mockGuildConfigService = {
            isGuildAllowed: vi.fn().mockImplementation((guildId: string | null) => {
                // Allow the test server IDs
                const allowedIds = ['1065055945123708928', '1054761356416528475'];
                return Promise.resolve(guildId ? allowedIds.includes(guildId) : false);
            }),
            getAllowedGuildIds: vi.fn().mockResolvedValue(['1065055945123708928', '1054761356416528475']),
        };
        vi.mocked(getGachaGuildConfigService).mockReturnValue(mockGuildConfigService as any);

        // Setup game config mock
        vi.mocked(getGameConfig).mockImplementation((gameId: any) => {
            const configs: any = {
                'bd2': {
                    id: 'bd2',
                    name: 'Brown Dust 2',
                    shortName: 'BD2',
                    apiEndpoint: 'https://test-api.example.com/coupon',
                    apiConfig: { appId: 'bd2-live', method: 'POST' },
                    supportsAutoRedeem: true,
                    logoPath: 'https://cdn.example.com/bd2.png',
                    embedColor: 0x8B4513,
                    maxNicknameLength: 24,
                    maxCodeLength: 20,
                    userIdFieldName: 'Nickname',
                    requiresUserId: true,
                },
                'nikke': {
                    id: 'nikke',
                    name: 'NIKKE',
                    shortName: 'NIKKE',
                    manualRedeemUrl: 'https://nikke.example.com/redeem',
                    supportsAutoRedeem: false,
                    logoPath: 'https://cdn.example.com/nikke.png',
                    embedColor: 0xFF69B4,
                    maxNicknameLength: 20,
                    maxCodeLength: 20,
                    userIdFieldName: 'Player ID',
                    requiresUserId: false,
                },
            };
            return configs[gameId];
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Command Structure', () => {
        it('should have correct command name', () => {
            expect(redeemCommand.data.name).toBe('redeem');
        });

        it('registers exactly the member subcommands', () => {
            const subcommands = redeemCommand.data.options.map((opt: any) => opt.name);
            expect(subcommands).toEqual(['subscribe', 'edit', 'unsubscribe', 'status', 'codes', 'preferences', 'switch', 'help']);
        });
    });

    describe('Permission Checks', () => {
        it('should allow user commands without mod role', async () => {
            (mockInteraction.options!.getSubcommand as any).mockReturnValue('subscribe');
            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                if (name === 'userid') return 'TestPlayer';
                if (name === 'mode') return 'notification-only';
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockDataService.subscribe).toHaveBeenCalled();
        });
    });

    describe('Guild Restriction', () => {
        it('should reject commands from unauthorized servers', async () => {
            // Use an unauthorized guild ID
            mockInteraction.guildId = '9999999999999999999';

            (mockInteraction.options!.getSubcommand as any).mockReturnValue('subscribe');
            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                if (name === 'userid') return 'TestPlayer';
                if (name === 'mode') return 'auto-redeem';
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: '❌ The gacha coupon system is not available on this server.',
                    flags: MessageFlags.Ephemeral
                })
            );
            expect(mockDataService.subscribe).not.toHaveBeenCalled();
        });

        it('should reject commands when guildId is null (DM context)', async () => {
            mockInteraction.guildId = null as any;

            (mockInteraction.options!.getSubcommand as any).mockReturnValue('status');

            await redeemCommand.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: '❌ The gacha coupon system is not available on this server.',
                    flags: MessageFlags.Ephemeral
                })
            );
        });

        it('should allow commands from authorized test server', async () => {
            mockInteraction.guildId = '1065055945123708928'; // Test server

            (mockInteraction.options!.getSubcommand as any).mockReturnValue('subscribe');
            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                if (name === 'userid') return 'TestPlayer';
                if (name === 'mode') return 'auto-redeem';
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockDataService.subscribe).toHaveBeenCalled();
        });

        it('should allow commands from authorized production server', async () => {
            mockInteraction.guildId = '1054761356416528475'; // Production server

            (mockInteraction.options!.getSubcommand as any).mockReturnValue('subscribe');
            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                if (name === 'userid') return 'TestPlayer';
                if (name === 'mode') return 'auto-redeem';
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockDataService.subscribe).toHaveBeenCalled();
        });
    });

    describe('Subscribe Subcommand', () => {
        beforeEach(() => {
            (mockInteraction.options!.getSubcommand as any).mockReturnValue('subscribe');
        });

        it('should subscribe user successfully', async () => {
            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                if (name === 'userid') return 'TestPlayer';
                if (name === 'mode') return 'auto-redeem';
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockDataService.subscribe).toHaveBeenCalledWith(
                'user123', 'bd2', 'TestPlayer', 'auto-redeem'
            );
            // Auto-redeem answers after redeeming, so it must defer first.
            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({ embeds: expect.any(Array) })
            );
            expect(mockInteraction.reply).not.toHaveBeenCalled();
        });

        it('should reject usernames that are too long', async () => {
            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                if (name === 'userid') return 'A'.repeat(30); // Exceeds 24 char limit
                if (name === 'mode') return 'auto-redeem';
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockDataService.subscribe).not.toHaveBeenCalled();
            expect(embedText()).toContain('24 characters or less');
            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
        });

        it('should reject usernames with invalid characters', async () => {
            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                if (name === 'userid') return 'Test@Player#123'; // Invalid special characters
                if (name === 'mode') return 'auto-redeem';
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockDataService.subscribe).not.toHaveBeenCalled();
            expect(embedText()).toContain('only contain letters, numbers, underscores, and hyphens');
        });

        it('opens the form instead of failing when a required detail is blank', async () => {
            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                if (name === 'userid') return '   '; // Whitespace only
                if (name === 'mode') return 'auto-redeem';
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockInteraction.showModal).toHaveBeenCalledTimes(1);
            // The user closed the form: nothing is saved and nothing else is sent.
            expect(mockDataService.subscribe).not.toHaveBeenCalled();
            expect(mockInteraction.reply).not.toHaveBeenCalled();
        });

        it('should allow valid usernames with underscores and hyphens', async () => {
            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                if (name === 'userid') return 'Test_Player-123';
                if (name === 'mode') return 'auto-redeem';
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockDataService.subscribe).toHaveBeenCalledWith(
                'user123', 'bd2', 'Test_Player-123', 'auto-redeem'
            );
        });

        it('should handle already subscribed error', async () => {
            mockDataService.getGameSubscription.mockResolvedValue({ gameId: 'bd2', gameUserId: 'TestPlayer' });

            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                if (name === 'userid') return 'TestPlayer';
                if (name === 'mode') return 'auto-redeem';
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('/redeem edit game:bd2'),
                    flags: MessageFlags.Ephemeral
                })
            );
            expect(mockDataService.subscribe).not.toHaveBeenCalled();
        });

        it('still reports a subscribe that fails after the check (a race)', async () => {
            mockDataService.subscribe.mockRejectedValue(new Error('You are already subscribed'));
            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                if (name === 'userid') return 'TestPlayer';
                if (name === 'mode') return 'auto-redeem';
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({ content: expect.stringContaining('already subscribed') })
            );
        });
    });

    describe('Unsubscribe Subcommand', () => {
        beforeEach(() => {
            (mockInteraction.options!.getSubcommand as any).mockReturnValue('unsubscribe');
        });

        it('should unsubscribe user successfully', async () => {
            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockDataService.unsubscribe).toHaveBeenCalledWith('user123', 'bd2');
            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({ embeds: expect.any(Array) })
            );
        });

        it('should handle user not subscribed', async () => {
            mockDataService.unsubscribe.mockResolvedValue(false);

            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('not subscribed')
                })
            );
        });
    });

    describe('Status Subcommand', () => {
        beforeEach(() => {
            (mockInteraction.options!.getSubcommand as any).mockReturnValue('status');
        });

        it('defers before reading subscriptions', async () => {
            mockDataService.getUserSubscriptions.mockResolvedValue(null);
            (mockInteraction.options!.getString as any).mockReturnValue(null);

            await redeemCommand.execute(mockInteraction);

            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
            expect((mockInteraction.deferReply as any).mock.invocationCallOrder[0])
                .toBeLessThan(mockDataService.getUserSubscriptions.mock.invocationCallOrder.at(-1));
            expect(mockInteraction.reply).not.toHaveBeenCalled();
        });

        it('should show no subscriptions message', async () => {
            mockDataService.getUserSubscriptions.mockResolvedValue(null);

            (mockInteraction.options!.getString as any).mockReturnValue(null);

            await redeemCommand.execute(mockInteraction);

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('no active subscriptions')
                })
            );
        });

        it('should show subscription status for specific game', async () => {
            const subscription = {
                gameId: 'bd2',
                gameUserId: 'TestPlayer',
                mode: 'auto-redeem',
                subscribedAt: new Date().toISOString(),
                redeemedCodes: ['CODE1'],
            };
            mockDataService.getUserSubscriptions.mockResolvedValue({
                discordId: 'user123',
                games: { 'bd2': subscription }
            });
            // Mock getSubscriberContext for batch data loading
            mockDataService.getSubscriberContext.mockResolvedValue({
                subscription,
                activeCoupons: [{ code: 'CODE1' }, { code: 'CODE2' }],
                unredeemed: [{ code: 'CODE2', rewards: 'Reward' }],
            });

            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({ embeds: expect.any(Array) })
            );
        });

        it('should show all subscriptions when no game specified', async () => {
            mockDataService.getUserSubscriptions.mockResolvedValue({
                discordId: 'user123',
                games: {
                    'bd2': {
                        gameId: 'bd2',
                        gameUserId: 'TestPlayer',
                        mode: 'auto-redeem',
                        subscribedAt: new Date().toISOString(),
                        redeemedCodes: [],
                    }
                }
            });
            mockDataService.getUnredeemedCodes.mockResolvedValue([]);

            (mockInteraction.options!.getString as any).mockReturnValue(null);

            await redeemCommand.execute(mockInteraction);

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({ embeds: expect.any(Array) })
            );
        });
    });

    describe('Codes Subcommand', () => {
        beforeEach(() => {
            (mockInteraction.options!.getSubcommand as any).mockReturnValue('codes');
        });

        it('should show no codes message when empty', async () => {
            mockDataService.getActiveCoupons.mockResolvedValue([]);

            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('No active coupon codes')
                })
            );
        });

        it('should show available codes', async () => {
            mockDataService.getActiveCoupons.mockResolvedValue([
                { code: 'CODE1', rewards: '100 Gems', isActive: true },
                { code: 'CODE2', rewards: '50 Gems', isActive: true, expirationDate: '2025-12-31' },
            ]);

            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({ embeds: expect.any(Array) })
            );
        });
    });

    describe('Mod Add Subcommand', () => {
        beforeEach(() => {
            (mockInteraction.options!.getSubcommand as any).mockReturnValue('add');
            mockInteraction.guildId = '1054761356416528475'; // home server
            // Give mod permissions
            const modsRole = { name: 'mods' } as Role;
            const mockRolesWithMods = new Collection<string, Role>();
            mockRolesWithMods.set('modsRoleId', modsRole);
            (mockMember.roles as any).cache = mockRolesWithMods;
        });

        it('should add coupon successfully', async () => {
            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                if (name === 'code') return 'newcode123';
                if (name === 'rewards') return '100 Gems';
                if (name === 'expiration') return '2025-12-31';
                if (name === 'source') return 'Twitter';
                return null;
            });

            await redeemCommandModule.executeModRedeem(mockInteraction);

            expect(mockDataService.addCoupon).toHaveBeenCalledWith(
                expect.objectContaining({
                    code: 'NEWCODE123',
                    gameId: 'bd2',
                    rewards: '100 Gems',
                    source: 'Twitter',
                    isActive: true,
                })
            );
            expect(mockRedemptionService.notifyNewCode).toHaveBeenCalled();
        });

        it('should handle invalid date format', async () => {
            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                if (name === 'code') return 'newcode';
                if (name === 'rewards') return '100 Gems';
                if (name === 'expiration') return 'invalid-date';
                return null;
            });

            await redeemCommandModule.executeModRedeem(mockInteraction);

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('Invalid date format')
                })
            );
        });

        it('should allow "never" as expiration', async () => {
            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                if (name === 'code') return 'newcode';
                if (name === 'rewards') return '100 Gems';
                if (name === 'expiration') return 'never';
                return null;
            });

            await redeemCommandModule.executeModRedeem(mockInteraction);

            expect(mockDataService.addCoupon).toHaveBeenCalledWith(
                expect.objectContaining({
                    expirationDate: null,
                })
            );
        });

        it('should handle duplicate code error', async () => {
            mockDataService.addCoupon.mockRejectedValue(new Error('Coupon code already exists'));

            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                if (name === 'code') return 'existing';
                if (name === 'rewards') return '100 Gems';
                return null;
            });

            await redeemCommandModule.executeModRedeem(mockInteraction);

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('already exists')
                })
            );
        });
    });

    describe('Mod Remove Subcommand', () => {
        beforeEach(() => {
            (mockInteraction.options!.getSubcommand as any).mockReturnValue('remove');
            mockInteraction.guildId = '1054761356416528475'; // home server
            // Give mod permissions
            const modsRole = { name: 'mods' } as Role;
            const mockRolesWithMods = new Collection<string, Role>();
            mockRolesWithMods.set('modsRoleId', modsRole);
            (mockMember.roles as any).cache = mockRolesWithMods;
        });

        it('should remove coupon successfully', async () => {
            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                if (name === 'code') return 'EXISTING';
                return null;
            });

            await redeemCommandModule.executeModRedeem(mockInteraction);

            expect(mockDataService.removeCoupon).toHaveBeenCalledWith('bd2', 'EXISTING');
            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({ embeds: expect.any(Array) })
            );
        });

        it('should handle non-existent code', async () => {
            mockDataService.removeCoupon.mockResolvedValue(false);

            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                if (name === 'code') return 'NONEXISTENT';
                return null;
            });

            await redeemCommandModule.executeModRedeem(mockInteraction);

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('not found')
                })
            );
        });
    });

    describe('Mod List Subcommand', () => {
        beforeEach(() => {
            (mockInteraction.options!.getSubcommand as any).mockReturnValue('list');
            // Give mod permissions
            const modsRole = { name: 'mods' } as Role;
            const mockRolesWithMods = new Collection<string, Role>();
            mockRolesWithMods.set('modsRoleId', modsRole);
            (mockMember.roles as any).cache = mockRolesWithMods;
        });

        it('should list coupons and stats', async () => {
            mockDataService.getAllCoupons.mockResolvedValue([
                { code: 'ACTIVE1', rewards: '100 Gems', isActive: true },
                { code: 'INACTIVE1', rewards: '50 Gems', isActive: false },
            ]);
            mockDataService.getGameStats.mockResolvedValue({
                total: 10, autoRedeem: 6, notifyOnly: 4
            });

            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                if (name === 'filter') return null;
                return null;
            });

            await redeemCommandModule.executeModRedeem(mockInteraction);

            expect(mockDataService.getAllCoupons).toHaveBeenCalledWith('bd2');
            expect(mockDataService.getGameStats).toHaveBeenCalledWith('bd2');
            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({ embeds: expect.any(Array) })
            );
        });
    });

    describe('Mod Trigger Subcommand', () => {
        beforeEach(() => {
            (mockInteraction.options!.getSubcommand as any).mockReturnValue('trigger');
            mockInteraction.guildId = '1054761356416528475'; // home server
            // Give mod permissions
            const modsRole = { name: 'mods' } as Role;
            const mockRolesWithMods = new Collection<string, Role>();
            mockRolesWithMods.set('modsRoleId', modsRole);
            (mockMember.roles as any).cache = mockRolesWithMods;
        });

        it('should trigger auto-redemption for BD2', async () => {
            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                return null;
            });

            await redeemCommandModule.executeModRedeem(mockInteraction);

            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
            expect(mockRedemptionService.processGameAutoRedemptions).toHaveBeenCalled();
            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({ embeds: expect.any(Array) })
            );
        });

        it('should reject trigger for games without auto-redeem', async () => {
            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'nikke';
                return null;
            });

            await redeemCommandModule.executeModRedeem(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('not supported'),
                    flags: MessageFlags.Ephemeral
                })
            );
            expect(mockRedemptionService.processGameAutoRedemptions).not.toHaveBeenCalled();
        });
    });

    describe('Preferences Subcommand', () => {
        beforeEach(() => {
            (mockInteraction.options!.getSubcommand as any).mockReturnValue('preferences');
            (mockInteraction.options as any).getBoolean = vi.fn().mockReturnValue(null);
        });

        it('should require subscription to view preferences', async () => {
            mockDataService.getGameSubscription.mockResolvedValue(null);

            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('not subscribed')
                })
            );
        });

        it('should show current preferences when no options provided', async () => {
            mockDataService.getGameSubscription.mockResolvedValue({
                gameId: 'bd2',
                gameUserId: 'TestPlayer',
                mode: 'auto-redeem',
                subscribedAt: new Date().toISOString(),
                redeemedCodes: [],
            });

            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockDataService.getNotificationPreferences).toHaveBeenCalledWith('user123', 'bd2');
            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({ embeds: expect.any(Array) })
            );
        });

        it('should update preferences when options provided', async () => {
            mockDataService.getGameSubscription.mockResolvedValue({
                gameId: 'bd2',
                gameUserId: 'TestPlayer',
                mode: 'auto-redeem',
                subscribedAt: new Date().toISOString(),
                redeemedCodes: [],
            });

            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                return null;
            });
            (mockInteraction.options as any).getBoolean = vi.fn().mockImplementation((name: string) => {
                if (name === 'weekly_digest') return false;
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockDataService.updateNotificationPreferences).toHaveBeenCalledWith(
                'user123',
                'bd2',
                { weeklyDigest: false }
            );
            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({ embeds: expect.any(Array) })
            );
        });

        it('should update multiple preferences at once', async () => {
            mockDataService.getGameSubscription.mockResolvedValue({
                gameId: 'bd2',
                gameUserId: 'TestPlayer',
                mode: 'auto-redeem',
                subscribedAt: new Date().toISOString(),
                redeemedCodes: [],
            });

            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                return null;
            });
            (mockInteraction.options as any).getBoolean = vi.fn().mockImplementation((name: string) => {
                if (name === 'weekly_digest') return false;
                if (name === 'expiration_warnings') return true;
                if (name === 'new_code_alerts') return false;
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockDataService.updateNotificationPreferences).toHaveBeenCalledWith(
                'user123',
                'bd2',
                { weeklyDigest: false, expirationWarnings: true, newCodeAlerts: false }
            );
        });
    });

    describe('Home-server-only /mod redeem subcommands', () => {
        const HOME = '1054761356416528475';
        const OTHER = '1065055945123708928'; // allowlisted test server, not home
        const restricted = ['add', 'remove', 'trigger', 'unsub', 'update', 'reset', 'scrape', 'subscribers', 'lookup', 'stats'];
        const open = ['list'];

        beforeEach(() => {
            mockInteraction.deferReply = vi.fn().mockResolvedValue(undefined);
        });

        it.each(restricted)('refuses %s outside the home server', async (sub) => {
            mockInteraction.guildId = OTHER;
            (mockInteraction.options!.getSubcommand as any).mockReturnValue(sub);
            await redeemCommandModule.executeModRedeem(mockInteraction);
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('only moderators in the Rapi home server'),
                    flags: MessageFlags.Ephemeral,
                })
            );
            expect(mockDataService.addCoupon).not.toHaveBeenCalled();
            expect(mockInteraction.deferReply).not.toHaveBeenCalled();
        });

        it('uses the subscriber-details wording for subscribers and lookup', async () => {
            mockInteraction.guildId = OTHER;
            (mockInteraction.options!.getSubcommand as any).mockReturnValue('subscribers');
            await redeemCommandModule.executeModRedeem(mockInteraction);
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({ content: expect.stringContaining('Subscriber details cover every server') })
            );
        });

        it('allows add in the home server', async () => {
            mockInteraction.guildId = HOME;
            (mockInteraction.options!.getSubcommand as any).mockReturnValue('add');
            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                if (name === 'code') return 'homecode';
                if (name === 'rewards') return '100 Gems';
                return null;
            });
            await redeemCommandModule.executeModRedeem(mockInteraction);
            expect(mockDataService.addCoupon).toHaveBeenCalled();
        });

        it.each(open)('does not apply the home-server refusal to %s', async (sub) => {
            mockInteraction.guildId = OTHER;
            (mockInteraction.options!.getSubcommand as any).mockReturnValue(sub);
            try {
                await redeemCommandModule.executeModRedeem(mockInteraction);
            } catch {
                // the handler may fail on thin mocks; only the gate matters here
            }
            const replies = (mockInteraction.reply as any).mock.calls.map((c: any[]) => c[0]?.content ?? '');
            expect(replies.some((c: string) => String(c).includes('only moderators in the Rapi home server'))).toBe(false);
        });

        it('returns no autocomplete suggestions outside the home server', async () => {
            const ac: any = {
                guildId: OTHER,
                options: {
                    getFocused: vi.fn().mockReturnValue({ name: 'code', value: 'test' }),
                    getString: vi.fn().mockReturnValue('bd2'),
                },
                respond: vi.fn().mockResolvedValue({}),
            };
            await redeemCommandModule.autocompleteRedeemCode(ac);
            expect(ac.respond).toHaveBeenCalledWith([]);
            expect(mockDataService.getActiveCoupons).not.toHaveBeenCalled();
        });
    });

    describe('Autocomplete Handler', () => {
        it('should return filtered codes for autocomplete', async () => {
            const mockAutocomplete: Partial<AutocompleteInteraction> = {
                guildId: '1054761356416528475',
                options: {
                    getFocused: vi.fn().mockReturnValue({ name: 'code', value: 'test' }),
                    getString: vi.fn().mockReturnValue('bd2'),
                } as any,
                respond: vi.fn().mockResolvedValue({}),
            };

            mockDataService.getActiveCoupons.mockResolvedValue([
                { code: 'TESTCODE1', rewards: '100 Gems' },
                { code: 'TESTCODE2', rewards: '50 Gems' },
                { code: 'OTHER', rewards: '25 Gems' },
            ]);

            await redeemCommandModule.autocompleteRedeemCode(mockAutocomplete as any);

            expect(mockAutocomplete.respond).toHaveBeenCalledWith([
                { name: 'TESTCODE1 - 100 Gems', value: 'TESTCODE1' },
                { name: 'TESTCODE2 - 50 Gems', value: 'TESTCODE2' },
            ]);
        });

        it('should return empty array for invalid game', async () => {
            const mockAutocomplete: Partial<AutocompleteInteraction> = {
                options: {
                    getFocused: vi.fn().mockReturnValue({ name: 'code', value: 'test' }),
                    getString: vi.fn().mockReturnValue(null),
                } as any,
                respond: vi.fn().mockResolvedValue({}),
            };

            await redeemCommandModule.autocompleteRedeemCode(mockAutocomplete as any);

            expect(mockAutocomplete.respond).toHaveBeenCalledWith([]);
        });
    });

    describe('Command review fixes', () => {
        const gameOption = (game: string, mode?: string) =>
            (mockInteraction.options!.getString as any).mockImplementation((name: string) =>
                name === 'game' ? game : name === 'mode' ? (mode ?? null) : null);

        it('refuses switching to auto-redeem for a game without it', async () => {
            mockDataService.switchSubscriptionMode = vi.fn();
            mockDataService.getGameSubscription.mockResolvedValue({ mode: 'notification-only', gameUserId: 'x' });
            (mockInteraction.options!.getSubcommand as any).mockReturnValue('switch');
            gameOption('nikke', 'auto-redeem');

            await redeemCommand.execute(mockInteraction);

            expect(mockDataService.switchSubscriptionMode).not.toHaveBeenCalled();
            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({ content: expect.stringContaining("isn't available for NIKKE") })
            );
        });

        it('still switches a game that supports auto-redeem', async () => {
            mockDataService.switchSubscriptionMode = vi.fn().mockResolvedValue(undefined);
            mockDataService.getGameSubscription.mockResolvedValue({ mode: 'notification-only', gameUserId: 'x' });
            (mockInteraction.options!.getSubcommand as any).mockReturnValue('switch');
            gameOption('bd2', 'auto-redeem');

            await redeemCommand.execute(mockInteraction);

            expect(mockDataService.switchSubscriptionMode).toHaveBeenCalledWith('user123', 'bd2', 'auto-redeem');
        });

        it('asks to retry /redeem edit instead of missing the form window on a slow read', async () => {
            vi.useFakeTimers();
            try {
                mockDataService.getGameSubscription.mockReturnValue(new Promise(() => {}));
                (mockInteraction.options!.getSubcommand as any).mockReturnValue('edit');
                gameOption('bd2');

                const run = redeemCommand.execute(mockInteraction);
                await vi.advanceTimersByTimeAsync(2000);
                await run;

                expect(mockInteraction.showModal).not.toHaveBeenCalled();
                expect(mockInteraction.reply).toHaveBeenCalledWith(
                    expect.objectContaining({ content: expect.stringContaining('took too long') })
                );
            } finally {
                vi.useRealTimers();
            }
        });

        it('keeps code autocomplete names within 100 characters', async () => {
            const mockAutocomplete: any = {
                guildId: '1054761356416528475',
                options: {
                    getFocused: vi.fn().mockReturnValue({ name: 'code', value: '' }),
                    getString: vi.fn().mockReturnValue('bd2'),
                },
                respond: vi.fn().mockResolvedValue({}),
            };
            mockDataService.getActiveCoupons.mockResolvedValue([{ code: 'LONG', rewards: 'x'.repeat(300) }]);

            await redeemCommandModule.autocompleteRedeemCode(mockAutocomplete);

            const [[choices]] = mockAutocomplete.respond.mock.calls;
            expect(choices).toHaveLength(1);
            expect(choices[0].name.length).toBeLessThanOrEqual(100);
            expect(choices[0].value).toBe('LONG');
        });
    });

    describe('Help Subcommand', () => {
        const helpText = (): string =>
            vi.mocked(EmbedBuilder).mock.results
                .map(r => r.value as any)
                .flatMap(e => e.addFields.mock.calls.flatMap((c: any[]) => c.map((f: any) => f.value)))
                .join('\n');

        it('lists the moderator tools under /mod redeem for moderators', async () => {
            (mockMember.permissions as PermissionsBitField) = new PermissionsBitField(PermissionsBitField.Flags.Administrator);
            (mockInteraction.options!.getSubcommand as any).mockReturnValue('help');

            await redeemCommand.execute(mockInteraction as any);

            const text = helpText();
            for (const name of ['add', 'remove', 'list', 'trigger', 'scrape', 'stats', 'subscribers', 'lookup', 'unsub', 'update', 'reset']) {
                expect(text).toContain(`/mod redeem ${name}`);
                expect(text).not.toContain(`/redeem ${name}\``);
            }
        });

        it('hides the moderator section from everyone else', async () => {
            (mockInteraction.options!.getSubcommand as any).mockReturnValue('help');

            await redeemCommand.execute(mockInteraction as any);

            expect(helpText()).not.toContain('/mod redeem');
        });
    });
});
