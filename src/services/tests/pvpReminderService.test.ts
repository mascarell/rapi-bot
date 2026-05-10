import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PvpReminderService } from '../pvpReminderService';
import { PvpEventConfig, PvpReminderServiceConfig, PvpWarningConfig } from '../../utils/interfaces/PvpEventConfig.interface';
import { Client, Guild, TextChannel } from 'discord.js';
import * as util from '../../utils/util';
import * as mediaManager from '../../utils/cdn/mediaManager';

vi.mock('node-schedule', () => ({
    default: {
        scheduleJob: vi.fn((cronTime, callback) => ({
            cancel: vi.fn()
        }))
    }
}));

vi.mock('../../utils/util', () => ({
    findChannelByName: vi.fn(),
    findRoleByName: vi.fn(),
    logError: vi.fn(),
    cdnDomainUrl: 'https://cdn.example.com'
}));

vi.mock('../../utils/cdn/mediaManager', () => ({
    getRandomCdnMediaUrl: vi.fn().mockResolvedValue('https://cdn.example.com/test-image.png')
}));

const mockNotificationService = {
    seedSubscribeReaction: vi.fn().mockResolvedValue(undefined),
    sendNotification: vi.fn().mockResolvedValue({ sent: 0, failed: 0, dmDisabled: 0 }),
};

vi.mock('../notificationSubscriptionService', () => ({
    getNotificationSubscriptionService: () => mockNotificationService,
}));

describe('PvpReminderService', () => {
    let mockBot: Client;
    let mockGuild: Guild;
    let mockChannel: TextChannel;
    let testEvent: PvpEventConfig;
    let testConfig: PvpReminderServiceConfig;

    beforeEach(() => {
        mockBot = {
            guilds: {
                cache: new Map()
            }
        } as any;

        mockGuild = {
            id: 'test-guild-id',
            name: 'Test Guild',
            channels: { cache: new Map() }
        } as any;

        mockChannel = {
            id: 'test-channel-id',
            name: 'brown-dust-2',
            send: vi.fn().mockResolvedValue({
                id: 'test-message-id',
                channel: mockChannel,
                guild: mockGuild
            })
        } as any;

        (mockBot.guilds.cache as any).set('test-guild-id', mockGuild);

        testEvent = {
            id: 'bd2-mirror-wars',
            game: 'Brown Dust 2',
            eventName: 'Mirror Wars',
            channelName: 'brown-dust-2',
            seasonEnd: { dayOfWeek: 0, hour: 14, minute: 59 },
            warnings: [
                {
                    label: '1 day',
                    minutesBefore: 24 * 60,
                    embedConfig: {
                        title: 'Mirror Wars Ending Tomorrow!',
                        description: 'Season ends tomorrow.',
                        color: 0xFFA500,
                        footer: { text: 'Test footer' },
                        fields: [
                            { name: 'Time', value: '~24 hours', inline: true }
                        ]
                    }
                },
                {
                    label: '1 hour',
                    minutesBefore: 60,
                    sendDM: true,
                    embedConfig: {
                        title: 'Mirror Wars Ending in 1 Hour!',
                        description: 'Final hour!',
                        color: 0xFF0000,
                        footer: { text: 'Urgent footer' }
                    }
                },
                {
                    label: 'new season',
                    minutesBefore: 0,
                    embedConfig: {
                        title: 'New Mirror Wars Season!',
                        description: (ts: number) => `New season! Next ends <t:${ts}:F>`,
                        color: 0x00CC66,
                        footer: { text: 'New season footer' },
                        fields: (ts: number) => [
                            { name: 'Next Season Ends', value: `<t:${ts}:R>`, inline: true }
                        ]
                    }
                }
            ],
            mediaConfig: {
                cdnPath: 'dailies/bd2/',
                extensions: ['.png', '.jpg'],
                trackLast: 10
            }
        };

        testConfig = { events: [testEvent], devModeInterval: 3 };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Constructor', () => {
        it('should create an instance with bot and config', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            expect(service).toBeInstanceOf(PvpReminderService);
        });
    });

    describe('calculateWarningCron', () => {
        it('should calculate 1-day warning: Sunday 14:59 - 1440min = Saturday 14:59', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const cron = service.calculateWarningCron(testEvent, testEvent.warnings[0]);
            expect(cron).toBe('59 14 * * 6'); // Saturday 14:59
        });

        it('should calculate 1-hour warning: Sunday 14:59 - 60min = Sunday 13:59', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const cron = service.calculateWarningCron(testEvent, testEvent.warnings[1]);
            expect(cron).toBe('59 13 * * 0'); // Sunday 13:59
        });

        it('should handle week wraparound (before Monday 00:00 wraps to Sunday)', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const mondayEvent: PvpEventConfig = {
                ...testEvent,
                seasonEnd: { dayOfWeek: 1, hour: 0, minute: 30 } // Monday 00:30
            };
            const warning: PvpWarningConfig = {
                label: '2 hours',
                minutesBefore: 120,
                embedConfig: testEvent.warnings[0].embedConfig
            };

            const cron = service.calculateWarningCron(mondayEvent, warning);
            expect(cron).toBe('30 22 * * 0'); // Sunday 22:30
        });

        it('should handle Saturday event with 2-day warning wrapping to Thursday', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const saturdayEvent: PvpEventConfig = {
                ...testEvent,
                seasonEnd: { dayOfWeek: 6, hour: 12, minute: 0 } // Saturday 12:00
            };
            const warning: PvpWarningConfig = {
                label: '2 days',
                minutesBefore: 48 * 60,
                embedConfig: testEvent.warnings[0].embedConfig
            };

            const cron = service.calculateWarningCron(saturdayEvent, warning);
            expect(cron).toBe('0 12 * * 4'); // Thursday 12:00
        });

        it('should calculate new season notification: Sunday 14:59 - 0min = Sunday 14:59', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const cron = service.calculateWarningCron(testEvent, testEvent.warnings[2]);
            expect(cron).toBe('59 14 * * 0'); // Sunday 14:59 — at season end
        });

        it('should handle Sunday 00:00 event with 1-day warning = Saturday 00:00', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const sundayMidnightEvent: PvpEventConfig = {
                ...testEvent,
                seasonEnd: { dayOfWeek: 0, hour: 0, minute: 0 }
            };
            const warning: PvpWarningConfig = {
                label: '1 day',
                minutesBefore: 24 * 60,
                embedConfig: testEvent.warnings[0].embedConfig
            };

            const cron = service.calculateWarningCron(sundayMidnightEvent, warning);
            expect(cron).toBe('0 0 * * 6'); // Saturday 00:00
        });
    });

    describe('initializeSchedules', () => {
        it('should create one job per warning per event', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            service.initializeSchedules();

            const jobs = service.getScheduledJobs();
            expect(jobs.size).toBe(3); // 3 warnings for Mirror Wars
            expect(jobs.has('bd2-mirror-wars-1 day')).toBe(true);
            expect(jobs.has('bd2-mirror-wars-1 hour')).toBe(true);
            expect(jobs.has('bd2-mirror-wars-new season')).toBe(true);
        });

        it('should handle multiple events', () => {
            const secondEvent: PvpEventConfig = {
                ...testEvent,
                id: 'bd2-arena',
                eventName: 'Arena',
                warnings: [testEvent.warnings[0]] // 1 warning
            };

            const multiConfig: PvpReminderServiceConfig = {
                events: [testEvent, secondEvent],
                devModeInterval: 3
            };

            const service = new PvpReminderService(mockBot, multiConfig);
            service.initializeSchedules();

            const jobs = service.getScheduledJobs();
            expect(jobs.size).toBe(4); // 3 from Mirror Wars + 1 from Arena
        });
    });

    describe('cancelAllSchedules', () => {
        it('should cancel all jobs and clear the map', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            service.initializeSchedules();

            expect(service.getScheduledJobs().size).toBe(3);

            service.cancelAllSchedules();

            expect(service.getScheduledJobs().size).toBe(0);
        });
    });

    describe('Warning Sending', () => {
        it('should skip guilds without the target channel', async () => {
            vi.mocked(util.findChannelByName).mockReturnValue(undefined);

            const service = new PvpReminderService(mockBot, testConfig);
            const sendWarningToGuild = (service as any).sendWarningToGuild;

            await sendWarningToGuild.call(service, mockGuild, testEvent, testEvent.warnings[0]);

            expect(mockChannel.send).not.toHaveBeenCalled();
        });

        it('should send embed to the correct channel', async () => {
            vi.mocked(util.findChannelByName).mockReturnValue(mockChannel);

            const service = new PvpReminderService(mockBot, testConfig);
            const sendWarningToGuild = (service as any).sendWarningToGuild;

            await sendWarningToGuild.call(service, mockGuild, testEvent, testEvent.warnings[0]);

            expect(mockChannel.send).toHaveBeenCalledTimes(1);
            expect(mockChannel.send).toHaveBeenCalledWith({ embeds: expect.any(Array) });
        });

        it('should handle errors gracefully when sending to all guilds', async () => {
            vi.mocked(util.findChannelByName).mockReturnValue({
                ...mockChannel,
                send: vi.fn(() => Promise.reject(new Error('Send failed')))
            } as any);

            const service = new PvpReminderService(mockBot, testConfig);
            const sendWarningToAllGuilds = (service as any).sendWarningToAllGuilds;

            await expect(
                sendWarningToAllGuilds.call(service, testEvent, testEvent.warnings[0])
            ).resolves.not.toThrow();

            expect(util.logError).toHaveBeenCalled();
        });
    });

    describe('DM Notification Sending', () => {
        it('should send DM notifications once for warnings with sendDM: true', async () => {
            vi.mocked(util.findChannelByName).mockReturnValue(mockChannel);

            // Add a second guild to verify DMs aren't duplicated
            const secondGuild = { ...mockGuild, id: 'guild-2', name: 'Guild 2' };
            (mockBot.guilds.cache as any).set('guild-2', secondGuild);

            const service = new PvpReminderService(mockBot, testConfig);
            const sendWarningToAllGuilds = (service as any).sendWarningToAllGuilds;

            // Use the 1-hour warning which has sendDM: true
            await sendWarningToAllGuilds.call(service, testEvent, testEvent.warnings[1]);

            // Channel messages sent to both guilds
            expect(mockChannel.send).toHaveBeenCalledTimes(2);
            // DM notification sent only once (not per-guild)
            expect(mockNotificationService.sendNotification).toHaveBeenCalledTimes(1);
        });

        it('should not send DM notifications for warnings without sendDM', async () => {
            vi.mocked(util.findChannelByName).mockReturnValue(mockChannel);

            const service = new PvpReminderService(mockBot, testConfig);
            const sendWarningToAllGuilds = (service as any).sendWarningToAllGuilds;

            // Use the 1-day warning which does NOT have sendDM
            await sendWarningToAllGuilds.call(service, testEvent, testEvent.warnings[0]);

            expect(mockChannel.send).toHaveBeenCalledTimes(1);
            expect(mockNotificationService.sendNotification).not.toHaveBeenCalled();
        });
    });

    describe('Embed Building', () => {
        it('should build embed with correct title and color for 1-day warning', async () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const buildWarningEmbed = (service as any).buildWarningEmbed;

            const embed = await buildWarningEmbed.call(service, mockGuild, testEvent, testEvent.warnings[0]);

            expect(embed.data.title).toBe('Mirror Wars Ending Tomorrow!');
            expect(embed.data.color).toBe(0xFFA500);
            expect(embed.data.footer?.text).toBe('Test footer');
        });

        it('should build embed with correct title and color for 1-hour warning', async () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const buildWarningEmbed = (service as any).buildWarningEmbed;

            const embed = await buildWarningEmbed.call(service, mockGuild, testEvent, testEvent.warnings[1]);

            expect(embed.data.title).toBe('Mirror Wars Ending in 1 Hour!');
            expect(embed.data.color).toBe(0xFF0000);
        });

        it('should include fields when configured', async () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const buildWarningEmbed = (service as any).buildWarningEmbed;

            const embed = await buildWarningEmbed.call(service, mockGuild, testEvent, testEvent.warnings[0]);

            expect(embed.data.fields?.length).toBe(1);
            expect(embed.data.fields?.[0].name).toBe('Time');
        });

        it('should set thumbnail when configured', async () => {
            const eventWithThumbnail: PvpEventConfig = {
                ...testEvent,
                warnings: [{
                    ...testEvent.warnings[0],
                    embedConfig: {
                        ...testEvent.warnings[0].embedConfig,
                        thumbnail: 'https://cdn.example.com/logo.png'
                    }
                }]
            };

            const service = new PvpReminderService(mockBot, testConfig);
            const buildWarningEmbed = (service as any).buildWarningEmbed;

            const embed = await buildWarningEmbed.call(service, mockGuild, eventWithThumbnail, eventWithThumbnail.warnings[0]);

            expect(embed.data.thumbnail?.url).toBe('https://cdn.example.com/logo.png');
        });

        it('should set author when configured', async () => {
            const eventWithAuthor: PvpEventConfig = {
                ...testEvent,
                warnings: [{
                    ...testEvent.warnings[0],
                    embedConfig: {
                        ...testEvent.warnings[0].embedConfig,
                        author: { name: 'Rapi BOT', iconURL: 'https://cdn.example.com/icon.png' }
                    }
                }]
            };

            const service = new PvpReminderService(mockBot, testConfig);
            const buildWarningEmbed = (service as any).buildWarningEmbed;

            const embed = await buildWarningEmbed.call(service, mockGuild, eventWithAuthor, eventWithAuthor.warnings[0]);

            expect(embed.data.author?.name).toBe('Rapi BOT');
        });

        it('should include CDN media image', async () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const buildWarningEmbed = (service as any).buildWarningEmbed;

            const embed = await buildWarningEmbed.call(service, mockGuild, testEvent, testEvent.warnings[0]);

            expect(mediaManager.getRandomCdnMediaUrl).toHaveBeenCalledWith(
                'dailies/bd2/',
                'test-guild-id',
                { extensions: ['.png', '.jpg'], trackLast: 10 }
            );
            expect(embed.data.image?.url).toBe('https://cdn.example.com/test-image.png');
        });

        it('should handle media fetch failure gracefully', async () => {
            vi.mocked(mediaManager.getRandomCdnMediaUrl).mockRejectedValueOnce(new Error('CDN error'));

            const service = new PvpReminderService(mockBot, testConfig);
            const buildWarningEmbed = (service as any).buildWarningEmbed;

            const embed = await buildWarningEmbed.call(service, mockGuild, testEvent, testEvent.warnings[0]);

            // Should still build the embed without the image
            expect(embed.data.title).toBe('Mirror Wars Ending Tomorrow!');
            expect(embed.data.image).toBeUndefined();
        });

        it('should build embed with correct title and color for new season notification', async () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const buildWarningEmbed = (service as any).buildWarningEmbed;

            const embed = await buildWarningEmbed.call(service, mockGuild, testEvent, testEvent.warnings[2]);

            expect(embed.data.title).toBe('New Mirror Wars Season!');
            expect(embed.data.color).toBe(0x00CC66);
            expect(embed.data.description).toMatch(/New season! Next ends <t:\d+:F>/);
            expect(embed.data.fields).toHaveLength(1);
            expect(embed.data.fields?.[0].value).toMatch(/<t:\d+:R>/);
        });

        it('should not set image when event has no mediaConfig', async () => {
            const eventWithoutMedia: PvpEventConfig = {
                ...testEvent,
                mediaConfig: undefined
            };

            const service = new PvpReminderService(mockBot, testConfig);
            const buildWarningEmbed = (service as any).buildWarningEmbed;

            const embed = await buildWarningEmbed.call(service, mockGuild, eventWithoutMedia, eventWithoutMedia.warnings[0]);

            expect(mediaManager.getRandomCdnMediaUrl).not.toHaveBeenCalled();
            expect(embed.data.image).toBeUndefined();
        });
    });

    describe('Dev Mode', () => {
        it('should use dev interval instead of weekly crons', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'development';

            const service = new PvpReminderService(mockBot, testConfig);
            service.initializeSchedules();

            const jobs = service.getScheduledJobs();
            expect(jobs.size).toBe(3);

            process.env.NODE_ENV = originalEnv;
        });
    });

    describe('Dynamic Descriptions and Discord Timestamps', () => {
        it('should resolve function-based description with season end timestamp', async () => {
            const dynamicEvent: PvpEventConfig = {
                ...testEvent,
                warnings: [{
                    ...testEvent.warnings[0],
                    embedConfig: {
                        ...testEvent.warnings[0].embedConfig,
                        description: (ts) => `Season ends <t:${ts}:F>`,
                    }
                }]
            };

            const service = new PvpReminderService(mockBot, testConfig);
            const buildWarningEmbed = (service as any).buildWarningEmbed;

            const embed = await buildWarningEmbed.call(service, mockGuild, dynamicEvent, dynamicEvent.warnings[0]);

            expect(embed.data.description).toMatch(/Season ends <t:\d+:F>/);
        });

        it('should resolve function-based fields with season end timestamp', async () => {
            const dynamicEvent: PvpEventConfig = {
                ...testEvent,
                warnings: [{
                    ...testEvent.warnings[0],
                    embedConfig: {
                        ...testEvent.warnings[0].embedConfig,
                        fields: (ts) => [
                            { name: 'Ends', value: `<t:${ts}:R>`, inline: true }
                        ],
                    }
                }]
            };

            const service = new PvpReminderService(mockBot, testConfig);
            const buildWarningEmbed = (service as any).buildWarningEmbed;

            const embed = await buildWarningEmbed.call(service, mockGuild, dynamicEvent, dynamicEvent.warnings[0]);

            expect(embed.data.fields).toHaveLength(1);
            expect(embed.data.fields?.[0].value).toMatch(/<t:\d+:R>/);
        });

        it('should still support static description strings', async () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const buildWarningEmbed = (service as any).buildWarningEmbed;

            const embed = await buildWarningEmbed.call(service, mockGuild, testEvent, testEvent.warnings[0]);

            expect(embed.data.description).toBe('Season ends tomorrow.');
        });
    });

    describe('getNextSeasonEndTimestamp', () => {
        it('should return a Unix timestamp in the future', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const ts = service.getNextSeasonEndTimestamp(testEvent);

            const now = Math.floor(Date.now() / 1000);
            expect(ts).toBeGreaterThan(now);
        });

        it('should return a timestamp on the correct day of week', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const ts = service.getNextSeasonEndTimestamp(testEvent);

            const date = new Date(ts * 1000);
            expect(date.getUTCDay()).toBe(0); // Sunday
            expect(date.getUTCHours()).toBe(14);
            expect(date.getUTCMinutes()).toBe(59);
        });

        it('should be within the next 7 days', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const ts = service.getNextSeasonEndTimestamp(testEvent);

            const now = Math.floor(Date.now() / 1000);
            const sevenDays = 7 * 24 * 60 * 60;
            expect(ts - now).toBeLessThanOrEqual(sevenDays);
            expect(ts - now).toBeGreaterThan(0);
        });
    });

    describe('Config Validation', () => {
        it('should use actual BD2 Mirror Wars config values', async () => {
            // Import the real config to validate it
            const { pvpReminderServiceConfig } = await import('../../utils/data/pvpEventsConfig');
            const mirrorWars = pvpReminderServiceConfig.events[0];

            expect(mirrorWars.id).toBe('bd2-mirror-wars');
            expect(mirrorWars.channelName).toBe('brown-dust-2');
            expect(mirrorWars.seasonEnd).toEqual({ dayOfWeek: 0, hour: 14, minute: 59 });
            expect(mirrorWars.warnings).toHaveLength(3);
            expect(mirrorWars.warnings[0].minutesBefore).toBe(24 * 60);
            expect(mirrorWars.warnings[0].sendDM).toBeUndefined();
            expect(mirrorWars.warnings[1].minutesBefore).toBe(60);
            expect(mirrorWars.warnings[1].sendDM).toBe(true);
            expect(mirrorWars.warnings[2].minutesBefore).toBe(0);
        });

        it('should produce correct crons for actual BD2 config', async () => {
            const { pvpReminderServiceConfig } = await import('../../utils/data/pvpEventsConfig');
            const mirrorWars = pvpReminderServiceConfig.events[0];

            const service = new PvpReminderService(mockBot, pvpReminderServiceConfig);

            // 1-day warning: Saturday 14:59
            const dayWarningCron = service.calculateWarningCron(mirrorWars, mirrorWars.warnings[0]);
            expect(dayWarningCron).toBe('59 14 * * 6');

            // 1-hour warning: Sunday 13:59
            const hourWarningCron = service.calculateWarningCron(mirrorWars, mirrorWars.warnings[1]);
            expect(hourWarningCron).toBe('59 13 * * 0');

            // New season notification: Sunday 14:59 (at season end)
            const newSeasonCron = service.calculateWarningCron(mirrorWars, mirrorWars.warnings[2]);
            expect(newSeasonCron).toBe('59 14 * * 0');
        });

        it('should include Lost Sword Avalon biweekly config', async () => {
            const { pvpReminderServiceConfig } = await import('../../utils/data/pvpEventsConfig');
            const avalon = pvpReminderServiceConfig.events.find(e => e.id === 'lost-sword-avalon');
            expect(avalon).toBeDefined();
            expect(avalon!.channelName).toBe('lost-sword');
            expect(avalon!.seasonEnd).toEqual({ dayOfWeek: 0, hour: 15, minute: 0 });
            expect(avalon!.cyclePhase?.intervalWeeks).toBe(2);
            expect(avalon!.cyclePhase?.phaseOffset).toBe(0);
            expect(avalon!.cyclePhase?.anchor).toBe('2026-05-10T15:00:00Z');
            expect(avalon!.warnings.map(w => w.label)).toEqual(['2 days', '1 day', '1 hour']);
        });

        it('should include Lost Sword Star Reincarnation biweekly config', async () => {
            const { pvpReminderServiceConfig } = await import('../../utils/data/pvpEventsConfig');
            const sr = pvpReminderServiceConfig.events.find(e => e.id === 'lost-sword-star-reincarnation');
            expect(sr).toBeDefined();
            expect(sr!.channelName).toBe('lost-sword');
            expect(sr!.seasonEnd).toEqual({ dayOfWeek: 0, hour: 15, minute: 0 });
            expect(sr!.cyclePhase?.intervalWeeks).toBe(2);
            expect(sr!.cyclePhase?.phaseOffset).toBe(1);
            expect(sr!.cyclePhase?.anchor).toBe('2026-05-10T15:00:00Z');
            expect(sr!.warnings.map(w => w.label)).toEqual(['2 days', '1 day', '1 hour']);
        });

        it('Avalon and Star Reincarnation should never both fire on the same Sunday', async () => {
            const { pvpReminderServiceConfig } = await import('../../utils/data/pvpEventsConfig');
            const avalon = pvpReminderServiceConfig.events.find(e => e.id === 'lost-sword-avalon')!;
            const sr = pvpReminderServiceConfig.events.find(e => e.id === 'lost-sword-star-reincarnation')!;
            const service = new PvpReminderService(mockBot, pvpReminderServiceConfig);
            const anyWarning: PvpWarningConfig = {
                label: 'test',
                minutesBefore: 0,
                embedConfig: testEvent.warnings[0].embedConfig,
            };
            // Sweep 26 Sundays starting from the shared anchor
            for (let i = 0; i < 26; i++) {
                const sunday = new Date(Date.parse('2026-05-10T15:00:00Z') + i * 7 * 24 * 60 * 60 * 1000);
                const a = service.isActiveCycle(avalon, anyWarning, sunday);
                const b = service.isActiveCycle(sr, anyWarning, sunday);
                expect(a !== b).toBe(true);
            }
        });

        it('Avalon active cycle ends on 2026-05-10 (the anchor Sunday)', async () => {
            const { pvpReminderServiceConfig } = await import('../../utils/data/pvpEventsConfig');
            const avalon = pvpReminderServiceConfig.events.find(e => e.id === 'lost-sword-avalon')!;
            const service = new PvpReminderService(mockBot, pvpReminderServiceConfig);
            // Friday 2026-05-08 (2 days before 05-10) — 2-day warning's projected target = 05-10
            const fri = new Date('2026-05-08T15:00:00Z');
            const warning2d: PvpWarningConfig = { label: '2 days', minutesBefore: 2 * 24 * 60, embedConfig: testEvent.warnings[0].embedConfig };
            expect(service.isActiveCycle(avalon, warning2d, fri)).toBe(true);
        });

        it('Star Reincarnation first active end is 2026-05-17 (one week after Avalon ends)', async () => {
            const { pvpReminderServiceConfig } = await import('../../utils/data/pvpEventsConfig');
            const sr = pvpReminderServiceConfig.events.find(e => e.id === 'lost-sword-star-reincarnation')!;
            const service = new PvpReminderService(mockBot, pvpReminderServiceConfig);
            // Friday 2026-05-15 — 2-day warning's projected target = 05-17 (SR's first end)
            const fri = new Date('2026-05-15T15:00:00Z');
            const warning2d: PvpWarningConfig = { label: '2 days', minutesBefore: 2 * 24 * 60, embedConfig: testEvent.warnings[0].embedConfig };
            expect(service.isActiveCycle(sr, warning2d, fri)).toBe(true);
        });

        it('Avalon should NOT fire for the 2026-05-03 reset (Avalon BEGINS that Sunday, doesn\'t end)', async () => {
            const { pvpReminderServiceConfig } = await import('../../utils/data/pvpEventsConfig');
            const avalon = pvpReminderServiceConfig.events.find(e => e.id === 'lost-sword-avalon')!;
            const service = new PvpReminderService(mockBot, pvpReminderServiceConfig);
            // Friday 2026-05-01 (2 days before 05-03 — but 05-03 is Avalon START, not END)
            const fri = new Date('2026-05-01T15:00:00Z');
            const warning2d: PvpWarningConfig = { label: '2 days', minutesBefore: 2 * 24 * 60, embedConfig: testEvent.warnings[0].embedConfig };
            // 05-03 is off-cycle for Avalon (anchor=05-10, so 05-03 is one week before anchor → phase=1)
            expect(service.isActiveCycle(avalon, warning2d, fri)).toBe(false);
        });

        it('cron jitter regression: Avalon (not SR) fires for 1-hour warning at Sunday 14:00 UTC + ms jitter', async () => {
            // Bug repro: cron schedulers fire with millisecond jitter. The 1-hour warning
            // for a Sunday-resetting biweekly event should NOT roll forward to next Sunday
            // when `now` is a few ms past the scheduled :00:00 mark.
            const { pvpReminderServiceConfig } = await import('../../utils/data/pvpEventsConfig');
            const avalon = pvpReminderServiceConfig.events.find(e => e.id === 'lost-sword-avalon')!;
            const sr = pvpReminderServiceConfig.events.find(e => e.id === 'lost-sword-star-reincarnation')!;
            const service = new PvpReminderService(mockBot, pvpReminderServiceConfig);
            const warning1h: PvpWarningConfig = { label: '1 hour', minutesBefore: 60, embedConfig: testEvent.warnings[0].embedConfig };

            // Sunday 2026-05-10 14:00:00.500 UTC — cron fires with 500ms jitter
            const sunWithJitter = new Date(Date.parse('2026-05-10T14:00:00Z') + 500);
            expect(service.isActiveCycle(avalon, warning1h, sunWithJitter)).toBe(true);
            expect(service.isActiveCycle(sr, warning1h, sunWithJitter)).toBe(false);

            // Same exact second too — should also work
            const sunExact = new Date('2026-05-10T14:00:00Z');
            expect(service.isActiveCycle(avalon, warning1h, sunExact)).toBe(true);
            expect(service.isActiveCycle(sr, warning1h, sunExact)).toBe(false);
        });
    });

    describe('cyclePhase: isActiveCycle', () => {
        const buildBiweekly = (
            base: PvpEventConfig,
            phaseOffset = 0,
            skipSeasonEnds: string[] = []
        ): PvpEventConfig => ({
            ...base,
            id: 'biweekly-test',
            seasonEnd: { dayOfWeek: 0, hour: 15, minute: 0 },
            cyclePhase: {
                anchor: '2026-04-26T15:00:00Z',
                intervalWeeks: 2,
                phaseOffset,
                skipSeasonEnds,
            },
        });

        const buildWarning = (base: PvpEventConfig, label = 'test', minutesBefore = 0): PvpWarningConfig => ({
            label,
            minutesBefore,
            embedConfig: base.warnings[0].embedConfig,
        });

        it('returns true on the anchor Sunday at season-end', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const event = buildBiweekly(testEvent);
            const now = new Date('2026-04-26T14:59:59Z');
            expect(service.isActiveCycle(event, buildWarning(testEvent), now)).toBe(true);
        });

        it('returns false on the off-cycle Sunday', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const event = buildBiweekly(testEvent);
            const now = new Date('2026-05-03T14:59:59Z');
            expect(service.isActiveCycle(event, buildWarning(testEvent), now)).toBe(false);
        });

        it('returns true on the next active Sunday (anchor + 14 days)', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const event = buildBiweekly(testEvent);
            const now = new Date('2026-05-10T14:59:59Z');
            expect(service.isActiveCycle(event, buildWarning(testEvent), now)).toBe(true);
        });

        it('Friday 2-day warning projects to the upcoming Sunday and returns true on active week', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const event = buildBiweekly(testEvent);
            // Friday 2026-04-24 15:00 UTC, projected Sunday is 2026-04-26 (anchor) → active
            const now = new Date('2026-04-24T15:00:00Z');
            const warning2d = buildWarning(testEvent, '2 days', 2 * 24 * 60);
            expect(service.isActiveCycle(event, warning2d, now)).toBe(true);
        });

        it('Friday 2-day warning projects to the upcoming Sunday and returns false on off-cycle week (QA #1 regression)', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const event = buildBiweekly(testEvent);
            // Friday 2026-05-01, projected Sunday is 2026-05-03 → off-cycle
            const now = new Date('2026-05-01T15:00:00Z');
            const warning2d = buildWarning(testEvent, '2 days', 2 * 24 * 60);
            expect(service.isActiveCycle(event, warning2d, now)).toBe(false);
        });

        it('handles negative modulo (anchor in future) without crashing', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const event = buildBiweekly(testEvent);
            event.cyclePhase!.anchor = '2099-01-04T15:00:00Z';
            const now = new Date('2026-04-26T15:00:00Z');
            expect(() => service.isActiveCycle(event, buildWarning(testEvent), now)).not.toThrow();
        });

        it('skips dates listed in skipSeasonEnds (do not fire on this Sunday)', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            // 04-26 IS the active Sunday but is in skipSeasonEnds (e.g. game maintenance)
            // → isActiveCycle returns false so we don't fire
            const event = buildBiweekly(testEvent, 0, ['2026-04-26T15:00:00.000Z']);
            const now = new Date('2026-04-26T14:59:59Z');
            expect(service.isActiveCycle(event, buildWarning(testEvent), now)).toBe(false);
        });

        it('does not skip when skipSeasonEnds does not match the resolved target', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const event = buildBiweekly(testEvent, 0, ['2099-01-01T00:00:00.000Z']);
            const now = new Date('2026-04-26T14:59:59Z');
            expect(service.isActiveCycle(event, buildWarning(testEvent), now)).toBe(true);
        });

        it('Mirror Wars (no cyclePhase) fires every Sunday across 12 simulated weeks', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            for (let i = 0; i < 12; i++) {
                const sunday = new Date(Date.parse('2026-04-26T15:00:00Z') + i * 7 * 24 * 60 * 60 * 1000);
                expect(service.isActiveCycle(testEvent, buildWarning(testEvent), sunday)).toBe(true);
            }
        });

        it('Avalon (phaseOffset=0) and a hypothetical Star Reincarnation (phaseOffset=1) never both fire on the same Sunday across 26 weeks', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const avalon = buildBiweekly(testEvent, 0);
            const sr = { ...buildBiweekly(testEvent, 1), id: 'star-reincarnation-test', channelName: 'lost-sword-other' };
            for (let i = 0; i < 26; i++) {
                const sunday = new Date(Date.parse('2026-04-26T15:00:00Z') + i * 7 * 24 * 60 * 60 * 1000);
                const a = service.isActiveCycle(avalon, buildWarning(testEvent), sunday);
                const b = service.isActiveCycle(sr, buildWarning(testEvent), sunday);
                expect(a !== b).toBe(true);
            }
        });
    });

    describe('cyclePhase: getNextSeasonEndTimestamp', () => {
        it('returns timestamp 14 days out (not 7) when current week is off-cycle', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const avalonEvent: PvpEventConfig = {
                ...testEvent,
                seasonEnd: { dayOfWeek: 0, hour: 15, minute: 0 },
                cyclePhase: {
                    anchor: '2026-04-26T15:00:00Z',
                    intervalWeeks: 2,
                    phaseOffset: 0,
                },
            };
            // now = Tuesday 2026-04-28 (during off-week — wait, anchor 04-26 was active week,
            // so 05-03 is off-cycle, 05-10 is active). 04-28 is between active and off; the
            // upcoming weekly Sunday is 05-03 (off) so the result should advance to 05-10.
            const now = new Date('2026-04-28T12:00:00Z');
            const ts = service.getNextSeasonEndTimestamp(avalonEvent, now);
            const result = new Date(ts * 1000);
            expect(result.toISOString()).toBe('2026-05-10T15:00:00.000Z');
        });

        it('returns the next weekly Sunday for an event with no cyclePhase', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            const now = new Date('2026-04-28T12:00:00Z'); // Tuesday
            const ts = service.getNextSeasonEndTimestamp(testEvent, now);
            const result = new Date(ts * 1000);
            // Next Sunday at 14:59 UTC = 2026-05-03
            expect(result.toISOString()).toBe('2026-05-03T14:59:00.000Z');
        });
    });

    describe('cyclePhase: startup invariants', () => {
        it('throws when anchor weekday does not match seasonEnd.dayOfWeek', () => {
            const badEvent: PvpEventConfig = {
                ...testEvent,
                id: 'bad-event',
                seasonEnd: { dayOfWeek: 0, hour: 15, minute: 0 }, // Sunday
                cyclePhase: {
                    anchor: '2026-04-25T15:00:00Z', // Saturday — wrong weekday
                    intervalWeeks: 2,
                },
            };
            const service = new PvpReminderService(mockBot, { events: [badEvent], devModeInterval: 3 });
            expect(() => service.initializeSchedules()).toThrow(/weekday/);
        });

        it('throws when anchor time-of-day does not match seasonEnd', () => {
            const badEvent: PvpEventConfig = {
                ...testEvent,
                id: 'bad-event',
                seasonEnd: { dayOfWeek: 0, hour: 15, minute: 0 },
                cyclePhase: {
                    anchor: '2026-04-26T16:00:00Z', // wrong hour
                    intervalWeeks: 2,
                },
            };
            const service = new PvpReminderService(mockBot, { events: [badEvent], devModeInterval: 3 });
            expect(() => service.initializeSchedules()).toThrow(/time/);
        });

        it('throws on cyclePhase collision (two events share channel + interval + phaseOffset)', () => {
            const eventA: PvpEventConfig = {
                ...testEvent,
                id: 'event-a',
                channelName: 'lost-sword',
                seasonEnd: { dayOfWeek: 0, hour: 15, minute: 0 },
                cyclePhase: { anchor: '2026-04-26T15:00:00Z', intervalWeeks: 2, phaseOffset: 0 },
            };
            const eventB: PvpEventConfig = {
                ...testEvent,
                id: 'event-b',
                channelName: 'lost-sword',
                seasonEnd: { dayOfWeek: 0, hour: 15, minute: 0 },
                cyclePhase: { anchor: '2026-04-26T15:00:00Z', intervalWeeks: 2, phaseOffset: 0 }, // same offset!
            };
            const service = new PvpReminderService(mockBot, { events: [eventA, eventB], devModeInterval: 3 });
            expect(() => service.initializeSchedules()).toThrow(/collision/);
        });

        it('does not throw when two events share channel + interval but have unique phaseOffset', () => {
            const eventA: PvpEventConfig = {
                ...testEvent,
                id: 'event-a',
                channelName: 'lost-sword',
                seasonEnd: { dayOfWeek: 0, hour: 15, minute: 0 },
                cyclePhase: { anchor: '2026-04-26T15:00:00Z', intervalWeeks: 2, phaseOffset: 0 },
            };
            const eventB: PvpEventConfig = {
                ...testEvent,
                id: 'event-b',
                channelName: 'lost-sword',
                seasonEnd: { dayOfWeek: 0, hour: 15, minute: 0 },
                cyclePhase: { anchor: '2026-04-26T15:00:00Z', intervalWeeks: 2, phaseOffset: 1 },
            };
            const service = new PvpReminderService(mockBot, { events: [eventA, eventB], devModeInterval: 3 });
            expect(() => service.initializeSchedules()).not.toThrow();
        });
    });

    describe('node-schedule TZ pin', () => {
        it('passes { tz: "Etc/UTC" } when scheduling weekly cron in production', async () => {
            const scheduleMod = await import('node-schedule');
            const scheduleJobSpy = vi.mocked(scheduleMod.default.scheduleJob);
            scheduleJobSpy.mockClear();

            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';

            const service = new PvpReminderService(mockBot, testConfig);
            service.initializeSchedules();

            // First call should be the object form { rule, tz }
            const firstCall = scheduleJobSpy.mock.calls[0];
            expect(firstCall[0]).toMatchObject({ tz: 'Etc/UTC' });

            process.env.NODE_ENV = originalEnv;
        });
    });
});
