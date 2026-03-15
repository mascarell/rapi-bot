import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NotificationSubscriptionService, getNotificationSubscriptionService } from '../notificationSubscriptionService';
import { NotificationSubscriptionDataService } from '../notificationSubscriptionDataService';
import { Client, EmbedBuilder, Message } from 'discord.js';

// Mock dependencies
vi.mock('../../utils/cdn/config', () => ({
    s3Client: { send: vi.fn() },
    S3_BUCKET: 'test-bucket',
}));

vi.mock('../notificationSubscriptionDataService', () => {
    const mockDataService = {
        getSubscribers: vi.fn().mockResolvedValue([]),
        addSubscription: vi.fn().mockResolvedValue(true),
        removeSubscription: vi.fn().mockResolvedValue(true),
        isSubscribed: vi.fn().mockResolvedValue(false),
        markDMDisabled: vi.fn().mockResolvedValue(undefined),
        clearDMDisabled: vi.fn().mockResolvedValue(undefined),
        getSubscriptionsForUser: vi.fn().mockResolvedValue([]),
        getData: vi.fn().mockResolvedValue({ subscriptions: {}, lastUpdated: '', schemaVersion: 1 }),
    };
    return {
        NotificationSubscriptionDataService: {
            getInstance: () => mockDataService,
        },
        getNotificationSubscriptionDataService: () => mockDataService,
    };
});

vi.mock('../../utils/dmSender', () => ({
    sendDMSafe: vi.fn().mockResolvedValue({
        id: 'dm-msg-id',
        react: vi.fn().mockResolvedValue(undefined),
    }),
}));

import { getNotificationSubscriptionDataService } from '../notificationSubscriptionDataService';
import { sendDMSafe } from '../../utils/dmSender';

describe('NotificationSubscriptionService', () => {
    let service: NotificationSubscriptionService;
    let mockDataService: ReturnType<typeof getNotificationSubscriptionDataService>;

    beforeEach(() => {
        (NotificationSubscriptionService as any).instance = null;
        service = getNotificationSubscriptionService();
        mockDataService = getNotificationSubscriptionDataService();
        vi.clearAllMocks();

        // Register a test notification type
        service.registerNotificationType({
            type: 'pvp-warning:bd2-mirror-wars',
            displayName: 'BD2 Mirror Wars PVP',
            description: 'Weekly PVP reminders',
            embedColor: 0x8B4513,
            thumbnailUrl: 'https://cdn.example.com/bd2-logo.png',
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Type Registry', () => {
        it('should register and retrieve a notification type', () => {
            const config = service.getNotificationType('pvp-warning:bd2-mirror-wars');
            expect(config).toBeDefined();
            expect(config?.displayName).toBe('BD2 Mirror Wars PVP');
        });

        it('should return undefined for unregistered type', () => {
            expect(service.getNotificationType('unknown')).toBeUndefined();
        });

        it('should return all registered types', () => {
            service.registerNotificationType({
                type: 'daily-reset:nikke',
                displayName: 'NIKKE Daily Reset',
                description: 'Daily reset reminders',
                embedColor: 0x3498DB,
            });

            const types = service.getAllNotificationTypes();
            expect(types).toHaveLength(2);
        });
    });

    describe('Subscribe', () => {
        it('should subscribe a user successfully', async () => {
            const result = await service.subscribe('user1', 'guild1', 'pvp-warning:bd2-mirror-wars');
            expect(result.success).toBe(true);
            expect(result.message).toContain('BD2 Mirror Wars PVP');
            expect(mockDataService.addSubscription).toHaveBeenCalledWith('user1', 'guild1', 'pvp-warning:bd2-mirror-wars');
        });

        it('should return error for unknown notification type', async () => {
            const result = await service.subscribe('user1', 'guild1', 'unknown-type');
            expect(result.success).toBe(false);
            expect(result.message).toBe('Unknown notification type.');
        });

        it('should return already-subscribed message', async () => {
            vi.mocked(mockDataService.addSubscription).mockResolvedValueOnce(false);

            const result = await service.subscribe('user1', 'guild1', 'pvp-warning:bd2-mirror-wars');
            expect(result.success).toBe(false);
            expect(result.message).toContain('already subscribed');
        });
    });

    describe('Unsubscribe', () => {
        it('should unsubscribe a user successfully', async () => {
            const result = await service.unsubscribe('user1', 'pvp-warning:bd2-mirror-wars');
            expect(result.success).toBe(true);
            expect(result.message).toContain('Unsubscribed');
        });

        it('should return not-subscribed message', async () => {
            vi.mocked(mockDataService.removeSubscription).mockResolvedValueOnce(false);

            const result = await service.unsubscribe('user1', 'pvp-warning:bd2-mirror-wars');
            expect(result.success).toBe(false);
            expect(result.message).toContain('not subscribed');
        });
    });

    describe('sendNotification', () => {
        it('should return zero counts when no subscribers', async () => {
            vi.mocked(mockDataService.getSubscribers).mockResolvedValueOnce([]);

            const mockBot = {} as Client;
            const embed = new EmbedBuilder().setTitle('Test').setDescription('Test');

            const result = await service.sendNotification(mockBot, 'pvp-warning:bd2-mirror-wars', embed);
            expect(result.sent).toBe(0);
            expect(result.failed).toBe(0);
            expect(result.dmDisabled).toBe(0);
        });

        it('should send DMs to subscribers and count results', async () => {
            vi.mocked(mockDataService.getSubscribers).mockResolvedValueOnce([
                { discordId: 'user1', guildId: 'g1', notificationType: 'pvp-warning:bd2-mirror-wars', subscribedAt: '' },
                { discordId: 'user2', guildId: 'g1', notificationType: 'pvp-warning:bd2-mirror-wars', subscribedAt: '' },
            ]);

            const mockUser = { id: 'user1', send: vi.fn() };
            const mockBot = {
                users: { fetch: vi.fn().mockResolvedValue(mockUser) },
            } as any;

            const embed = new EmbedBuilder().setTitle('Test').setDescription('Test');

            const result = await service.sendNotification(mockBot, 'pvp-warning:bd2-mirror-wars', embed);
            expect(result.sent).toBe(2);
            expect(sendDMSafe).toHaveBeenCalledTimes(2);
        });

        it('should skip users with dmDisabled', async () => {
            vi.mocked(mockDataService.getSubscribers).mockResolvedValueOnce([
                { discordId: 'user1', guildId: 'g1', notificationType: 'pvp-warning:bd2-mirror-wars', subscribedAt: '', dmDisabled: true },
            ]);

            const mockBot = { users: { fetch: vi.fn() } } as any;
            const embed = new EmbedBuilder().setTitle('Test').setDescription('Test');

            const result = await service.sendNotification(mockBot, 'pvp-warning:bd2-mirror-wars', embed);
            expect(result.dmDisabled).toBe(1);
            expect(result.sent).toBe(0);
            expect(sendDMSafe).not.toHaveBeenCalled();
        });

        it('should append footer tag with notification type', async () => {
            vi.mocked(mockDataService.getSubscribers).mockResolvedValueOnce([
                { discordId: 'user1', guildId: 'g1', notificationType: 'pvp-warning:bd2-mirror-wars', subscribedAt: '' },
            ]);

            const mockUser = { id: 'user1' };
            const mockBot = {
                users: { fetch: vi.fn().mockResolvedValue(mockUser) },
            } as any;

            const embed = new EmbedBuilder()
                .setTitle('Test')
                .setDescription('Test')
                .setFooter({ text: 'Original footer' });

            await service.sendNotification(mockBot, 'pvp-warning:bd2-mirror-wars', embed);

            // Check the embed passed to sendDMSafe has the footer tag
            const call = vi.mocked(sendDMSafe).mock.calls[0];
            const sentEmbed = call[1].embeds[0];
            expect(sentEmbed.data.footer?.text).toContain('[type:pvp-warning:bd2-mirror-wars]');
            expect(sentEmbed.data.footer?.text).toContain('Original footer');
        });

        it('should count failures when sendDMSafe returns null', async () => {
            vi.mocked(mockDataService.getSubscribers).mockResolvedValueOnce([
                { discordId: 'user1', guildId: 'g1', notificationType: 'pvp-warning:bd2-mirror-wars', subscribedAt: '' },
            ]);

            vi.mocked(sendDMSafe).mockResolvedValueOnce(null);

            const mockBot = {
                users: { fetch: vi.fn().mockResolvedValue({ id: 'user1' }) },
            } as any;

            const embed = new EmbedBuilder().setTitle('Test').setDescription('Test');

            const result = await service.sendNotification(mockBot, 'pvp-warning:bd2-mirror-wars', embed);
            expect(result.failed).toBe(1);
            expect(result.sent).toBe(0);
        });
    });

    describe('seedSubscribeReaction', () => {
        it('should add subscribe emoji to message', async () => {
            const mockMessage = {
                id: 'msg-123',
                react: vi.fn().mockResolvedValue(undefined),
            } as any;

            await service.seedSubscribeReaction(mockMessage, 'pvp-warning:bd2-mirror-wars');

            expect(mockMessage.react).toHaveBeenCalledWith('✉️');
        });

        it('should handle reaction failure gracefully', async () => {
            const mockMessage = {
                id: 'msg-123',
                react: vi.fn().mockRejectedValue(new Error('Missing permissions')),
            } as any;

            // Should not throw
            await expect(
                service.seedSubscribeReaction(mockMessage, 'pvp-warning:bd2-mirror-wars')
            ).resolves.not.toThrow();
        });
    });

    describe('Footer Tag Parsing', () => {
        it('should parse notification type from embed footer', () => {
            const parseMethod = (service as any).parseNotificationTypeFromEmbed.bind(service);

            const message = {
                embeds: [{
                    footer: { text: 'Some text | [type:pvp-warning:bd2-mirror-wars]' },
                }],
            } as any;

            expect(parseMethod(message)).toBe('pvp-warning:bd2-mirror-wars');
        });

        it('should return undefined for missing footer', () => {
            const parseMethod = (service as any).parseNotificationTypeFromEmbed.bind(service);

            const message = { embeds: [{}] } as any;
            expect(parseMethod(message)).toBeUndefined();
        });

        it('should return undefined for footer without type tag', () => {
            const parseMethod = (service as any).parseNotificationTypeFromEmbed.bind(service);

            const message = {
                embeds: [{ footer: { text: 'Just a normal footer' } }],
            } as any;

            expect(parseMethod(message)).toBeUndefined();
        });

        it('should return undefined for unregistered type in footer', () => {
            const parseMethod = (service as any).parseNotificationTypeFromEmbed.bind(service);

            const message = {
                embeds: [{ footer: { text: '[type:unknown-type]' } }],
            } as any;

            expect(parseMethod(message)).toBeUndefined();
        });

        it('should return undefined for message with no embeds', () => {
            const parseMethod = (service as any).parseNotificationTypeFromEmbed.bind(service);

            const message = { embeds: [] } as any;
            expect(parseMethod(message)).toBeUndefined();
        });
    });

    describe('Reaction Routing', () => {
        it('should start listening on messageReactionAdd', () => {
            const mockBot = { on: vi.fn() } as any;
            service.startListening(mockBot);
            expect(mockBot.on).toHaveBeenCalledWith('messageReactionAdd', expect.any(Function));
        });
    });
});
