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
                    embedConfig: {
                        title: 'Mirror Wars Ending in 1 Hour!',
                        description: 'Final hour!',
                        color: 0xFF0000,
                        footer: { text: 'Urgent footer' }
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
            expect(jobs.size).toBe(2); // 2 warnings for Mirror Wars
            expect(jobs.has('bd2-mirror-wars-1 day')).toBe(true);
            expect(jobs.has('bd2-mirror-wars-1 hour')).toBe(true);
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
            expect(jobs.size).toBe(3); // 2 from Mirror Wars + 1 from Arena
        });
    });

    describe('cancelAllSchedules', () => {
        it('should cancel all jobs and clear the map', () => {
            const service = new PvpReminderService(mockBot, testConfig);
            service.initializeSchedules();

            expect(service.getScheduledJobs().size).toBe(2);

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
            expect(jobs.size).toBe(2);

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
            expect(mirrorWars.warnings).toHaveLength(2);
            expect(mirrorWars.warnings[0].minutesBefore).toBe(24 * 60);
            expect(mirrorWars.warnings[1].minutesBefore).toBe(60);
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
        });
    });
});
