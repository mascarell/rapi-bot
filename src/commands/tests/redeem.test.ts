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

// Import the command - need to use dynamic import for CommonJS module
const redeemCommand = await import('../redeem');

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
        };

        // Setup mock interaction
        mockInteraction = {
            guild: mockGuild as Guild,
            guildId: '1065055945123708928', // Test server ID (allowed)
            user: { id: 'user123' } as any,
            client: {} as Client,
            options: {
                getSubcommand: vi.fn(),
                getString: vi.fn(),
            } as any,
            reply: vi.fn().mockResolvedValue({}),
            deferReply: vi.fn().mockResolvedValue({}),
            editReply: vi.fn().mockResolvedValue({}),
        };

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

        it('should have all expected subcommands', () => {
            const subcommands = redeemCommand.data.options.map((opt: any) => opt.name);
            expect(subcommands).toContain('subscribe');
            expect(subcommands).toContain('unsubscribe');
            expect(subcommands).toContain('status');
            expect(subcommands).toContain('codes');
            expect(subcommands).toContain('add');
            expect(subcommands).toContain('remove');
            expect(subcommands).toContain('list');
            expect(subcommands).toContain('trigger');
        });
    });

    describe('Permission Checks', () => {
        it('should allow mod commands for users with mods role', async () => {
            const modsRole = { name: 'mods' } as Role;
            const mockRolesWithMods = new Collection<string, Role>();
            mockRolesWithMods.set('modsRoleId', modsRole);
            (mockMember.roles as any).cache = mockRolesWithMods;

            (mockInteraction.options!.getSubcommand as any).mockReturnValue('list');
            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            // Should not show permission error
            expect(mockInteraction.reply).not.toHaveBeenCalledWith(
                expect.objectContaining({ content: expect.stringContaining('need the "mods" role') })
            );
        });

        it('should allow mod commands for administrators', async () => {
            (mockMember.permissions as PermissionsBitField) = new PermissionsBitField(PermissionsBitField.Flags.Administrator);

            (mockInteraction.options!.getSubcommand as any).mockReturnValue('list');
            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            // Should not show permission error
            expect(mockInteraction.reply).not.toHaveBeenCalledWith(
                expect.objectContaining({ content: expect.stringContaining('need the "mods" role') })
            );
        });

        it('should reject mod commands for users without permissions', async () => {
            (mockInteraction.options!.getSubcommand as any).mockReturnValue('add');

            await redeemCommand.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('need the "mods" role'),
                    ephemeral: true
                })
            );
        });

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
                    ephemeral: true
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
                    ephemeral: true
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
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({ embeds: expect.any(Array), ephemeral: true })
            );
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
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('24 characters or less'),
                    ephemeral: true
                })
            );
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
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('only contain letters, numbers, underscores, and hyphens'),
                    ephemeral: true
                })
            );
        });

        it('should reject empty usernames', async () => {
            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                if (name === 'userid') return '   '; // Whitespace only
                if (name === 'mode') return 'auto-redeem';
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockDataService.subscribe).not.toHaveBeenCalled();
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('cannot be empty'),
                    ephemeral: true
                })
            );
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
            mockDataService.subscribe.mockRejectedValue(new Error('You are already subscribed'));

            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                if (name === 'userid') return 'TestPlayer';
                if (name === 'mode') return 'auto-redeem';
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('already subscribed'),
                    ephemeral: true
                })
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
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({ embeds: expect.any(Array), ephemeral: true })
            );
        });

        it('should handle user not subscribed', async () => {
            mockDataService.unsubscribe.mockResolvedValue(false);

            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('not subscribed'),
                    ephemeral: true
                })
            );
        });
    });

    describe('Status Subcommand', () => {
        beforeEach(() => {
            (mockInteraction.options!.getSubcommand as any).mockReturnValue('status');
        });

        it('should show no subscriptions message', async () => {
            mockDataService.getUserSubscriptions.mockResolvedValue(null);

            (mockInteraction.options!.getString as any).mockReturnValue(null);

            await redeemCommand.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('no active subscriptions'),
                    ephemeral: true
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

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({ embeds: expect.any(Array), ephemeral: true })
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

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({ embeds: expect.any(Array), ephemeral: true })
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

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('No active coupon codes'),
                    ephemeral: true
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

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({ embeds: expect.any(Array), ephemeral: true })
            );
        });
    });

    describe('Mod Add Subcommand', () => {
        beforeEach(() => {
            (mockInteraction.options!.getSubcommand as any).mockReturnValue('add');
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

            await redeemCommand.execute(mockInteraction);

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

            await redeemCommand.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('Invalid date format'),
                    ephemeral: true
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

            await redeemCommand.execute(mockInteraction);

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

            await redeemCommand.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('already exists'),
                    ephemeral: true
                })
            );
        });
    });

    describe('Mod Remove Subcommand', () => {
        beforeEach(() => {
            (mockInteraction.options!.getSubcommand as any).mockReturnValue('remove');
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

            await redeemCommand.execute(mockInteraction);

            expect(mockDataService.removeCoupon).toHaveBeenCalledWith('bd2', 'EXISTING');
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({ embeds: expect.any(Array), ephemeral: true })
            );
        });

        it('should handle non-existent code', async () => {
            mockDataService.removeCoupon.mockResolvedValue(false);

            (mockInteraction.options!.getString as any).mockImplementation((name: string) => {
                if (name === 'game') return 'bd2';
                if (name === 'code') return 'NONEXISTENT';
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('not found'),
                    ephemeral: true
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
                return null;
            });

            await redeemCommand.execute(mockInteraction);

            expect(mockDataService.getAllCoupons).toHaveBeenCalledWith('bd2');
            expect(mockDataService.getGameStats).toHaveBeenCalledWith('bd2');
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({ embeds: expect.any(Array), ephemeral: true })
            );
        });
    });

    describe('Mod Trigger Subcommand', () => {
        beforeEach(() => {
            (mockInteraction.options!.getSubcommand as any).mockReturnValue('trigger');
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

            await redeemCommand.execute(mockInteraction);

            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
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

            await redeemCommand.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('not supported'),
                    ephemeral: true
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

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('not subscribed'),
                    ephemeral: true
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
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.any(Array),
                    ephemeral: true
                })
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
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.any(Array),
                    ephemeral: true
                })
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

    describe('Autocomplete Handler', () => {
        it('should return filtered codes for autocomplete', async () => {
            const mockAutocomplete: Partial<AutocompleteInteraction> = {
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

            await redeemCommand.autocomplete(mockAutocomplete);

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

            await redeemCommand.autocomplete(mockAutocomplete);

            expect(mockAutocomplete.respond).toHaveBeenCalledWith([]);
        });
    });
});
