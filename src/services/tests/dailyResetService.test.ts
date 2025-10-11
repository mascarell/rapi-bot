import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DailyResetService } from '../dailyResetService';
import { DailyResetConfig } from '../../utils/interfaces/DailyResetConfig.interface';
import { Client, Guild, TextChannel, Collection } from 'discord.js';
import * as schedule from 'node-schedule';
import * as util from '../../utils/util';
import * as mediaManager from '../../utils/cdn/mediaManager';

// Mock the dependencies
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

describe('DailyResetService', () => {
    let mockBot: Client;
    let mockGuild: Guild;
    let mockChannel: TextChannel;
    let testConfig: DailyResetConfig;

    beforeEach(() => {
        // Create mock bot
        mockBot = {
            guilds: {
                cache: new Map()
            }
        } as any;

        // Create mock guild
        mockGuild = {
            id: 'test-guild-id',
            name: 'Test Guild',
            channels: {
                cache: new Map()
            }
        } as any;

        // Create mock channel
        mockChannel = {
            id: 'test-channel-id',
            name: 'test-channel',
            send: vi.fn().mockResolvedValue({
                id: 'test-message-id',
                channel: mockChannel,
                guild: mockGuild
            })
        } as any;

        // Add mock guild to bot
        (mockBot.guilds.cache as any).set('test-guild-id', mockGuild);

        // Create test configuration
        testConfig = {
            game: 'Test Game',
            channelName: 'test-channel',
            resetTime: { hour: 12, minute: 0 },
            timezone: 'UTC',
            embedConfig: {
                title: 'Test Title',
                description: 'Test Description',
                color: 0x3498DB,
                footer: {
                    text: 'Test Footer'
                }
            },
            checklist: [
                { name: 'Test Task 1', value: 'Test Value 1' },
                { name: 'Test Task 2', value: 'Test Value 2' }
            ],
            mediaConfig: {
                cdnPath: 'test/path/',
                extensions: ['.png', '.jpg'],
                trackLast: 5
            }
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Constructor', () => {
        it('should create an instance with bot and config', () => {
            const service = new DailyResetService(mockBot, { games: [testConfig] });
            expect(service).toBeInstanceOf(DailyResetService);
        });
    });

    describe('initializeSchedules', () => {
        it('should schedule jobs for all configured games', () => {
            const service = new DailyResetService(mockBot, { games: [testConfig] });

            service.initializeSchedules();

            // Note: We can't easily test schedule.scheduleJob since it's mocked at module level
            // Instead, we verify that the jobs map is populated
            const jobs = service.getScheduledJobs();
            expect(jobs.size).toBe(1);
        });

        it('should handle multiple game configurations', () => {
            const config2 = { ...testConfig, game: 'Test Game 2', resetTime: { hour: 14, minute: 30 } };
            const service = new DailyResetService(mockBot, { games: [testConfig, config2] });

            service.initializeSchedules();

            const jobs = service.getScheduledJobs();
            expect(jobs.size).toBe(2);
        });
    });

    describe('getScheduledJobs', () => {
        it('should return a map of scheduled jobs', () => {
            const service = new DailyResetService(mockBot, { games: [testConfig] });
            service.initializeSchedules();

            const jobs = service.getScheduledJobs();

            expect(jobs).toBeInstanceOf(Map);
            expect(jobs.size).toBe(1);
            expect(jobs.has('Test Game')).toBe(true);
        });
    });

    describe('cancelAllSchedules', () => {
        it('should cancel all scheduled jobs', () => {
            const service = new DailyResetService(mockBot, { games: [testConfig] });
            service.initializeSchedules();

            const jobsBefore = service.getScheduledJobs();
            expect(jobsBefore.size).toBe(1);

            service.cancelAllSchedules();

            const jobsAfter = service.getScheduledJobs();
            expect(jobsAfter.size).toBe(0);
        });
    });

    describe('Embed Building', () => {
        it('should build embed with all required fields', async () => {
            vi.mocked(util.findChannelByName).mockReturnValue(mockChannel);

            const service = new DailyResetService(mockBot, { games: [testConfig] });
            service.initializeSchedules();

            // Access private method through any type
            const buildEmbed = (service as any).buildEmbed;
            const embed = await buildEmbed.call(service, mockGuild, testConfig);

            expect(embed.data.title).toBe('Test Title');
            expect(embed.data.description).toBe('Test Description');
            expect(embed.data.color).toBe(0x3498DB);
            expect(embed.data.footer?.text).toBe('Test Footer');
            expect(embed.data.fields?.length).toBe(2);
        });

        it('should include dynamic fields if provided', async () => {
            const configWithDynamic = {
                ...testConfig,
                dynamicFields: (date: Date) => [
                    { name: 'Dynamic Field', value: 'Dynamic Value' }
                ]
            };

            const service = new DailyResetService(mockBot, { games: [configWithDynamic] });
            const buildEmbed = (service as any).buildEmbed;
            const embed = await buildEmbed.call(service, mockGuild, configWithDynamic);

            expect(embed.data.fields?.length).toBe(3); // 2 static + 1 dynamic
        });
    });

    describe('Configuration Validation', () => {
        it('should handle missing channel gracefully', async () => {
            vi.mocked(util.findChannelByName).mockReturnValue(undefined);

            const consoleSpy = vi.spyOn(console, 'log');
            const service = new DailyResetService(mockBot, { games: [testConfig] });

            // Access private method
            const sendResetMessageToGuild = (service as any).sendResetMessageToGuild;
            await sendResetMessageToGuild.call(service, mockGuild, testConfig);

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining("Channel 'test-channel' not found")
            );
        });

        it('should handle role ping if roleName is provided', async () => {
            const mockRole = { toString: () => '<@&role-id>' };

            vi.mocked(util.findChannelByName).mockReturnValue(mockChannel);
            vi.mocked(util.findRoleByName).mockReturnValue(mockRole as any);

            const configWithRole = { ...testConfig, roleName: 'Test Role' };
            const service = new DailyResetService(mockBot, { games: [configWithRole] });

            const sendResetMessageToGuild = (service as any).sendResetMessageToGuild;
            await sendResetMessageToGuild.call(service, mockGuild, configWithRole);

            expect(mockChannel.send).toHaveBeenCalledWith('<@&role-id>');
        });
    });

    describe('Error Handling', () => {
        it('should handle errors gracefully when sending messages', async () => {
            // Create a new mock channel that will throw an error
            const failingChannel = {
                ...mockChannel,
                send: vi.fn(() => Promise.reject(new Error('Send failed')))
            } as any;

            vi.mocked(util.findChannelByName).mockReturnValue(failingChannel);

            const service = new DailyResetService(mockBot, { games: [testConfig] });

            // The service should handle errors internally without throwing
            // We test by calling sendResetMessage which catches errors internally
            const sendResetMessage = (service as any).sendResetMessage;

            // This should not throw because errors are caught and logged internally
            await expect(sendResetMessage.call(service, testConfig)).resolves.not.toThrow();
        });
    });

    describe('Hooks', () => {
        it('should call beforeSend hook if provided', async () => {
            vi.mocked(util.findChannelByName).mockReturnValue(mockChannel);

            const beforeSendSpy = vi.fn().mockResolvedValue(undefined);
            const configWithHooks = {
                ...testConfig,
                hooks: {
                    beforeSend: beforeSendSpy
                }
            };

            const service = new DailyResetService(mockBot, { games: [configWithHooks] });
            const sendResetMessageToGuild = (service as any).sendResetMessageToGuild;

            await sendResetMessageToGuild.call(service, mockGuild, configWithHooks);

            expect(beforeSendSpy).toHaveBeenCalledWith(
                mockChannel.id,
                mockGuild.id,
                mockBot
            );
        });

        it('should call afterSend hook if provided', async () => {
            vi.mocked(util.findChannelByName).mockReturnValue(mockChannel);

            const afterSendSpy = vi.fn().mockResolvedValue(undefined);
            const configWithHooks = {
                ...testConfig,
                hooks: {
                    afterSend: afterSendSpy
                }
            };

            const service = new DailyResetService(mockBot, { games: [configWithHooks] });
            const sendResetMessageToGuild = (service as any).sendResetMessageToGuild;

            await sendResetMessageToGuild.call(service, mockGuild, configWithHooks);

            expect(afterSendSpy).toHaveBeenCalled();
        });
    });

    describe('Dev Mode', () => {
        it('should use dev mode interval when NODE_ENV is development', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'development';

            const consoleSpy = vi.spyOn(console, 'log');

            const service = new DailyResetService(mockBot, { games: [testConfig], devModeInterval: 5 });
            service.initializeSchedules();

            // Check that dev mode warning was logged
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('⚠️  DEV MODE: Daily reset messages will trigger every 5 minutes')
            );

            // Check that schedule description mentions dev mode
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('every 5 minutes (DEV MODE)')
            );

            process.env.NODE_ENV = originalEnv;
        });

        it('should use normal schedule when NODE_ENV is production', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';

            const consoleSpy = vi.spyOn(console, 'log');

            const service = new DailyResetService(mockBot, { games: [testConfig] });
            service.initializeSchedules();

            // Check that dev mode warning was NOT logged
            expect(consoleSpy).not.toHaveBeenCalledWith(
                expect.stringContaining('⚠️  DEV MODE')
            );

            // Check that normal daily schedule was used
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('0 12 * * * (UTC)')
            );

            process.env.NODE_ENV = originalEnv;
        });

        it('should use custom dev mode interval if provided', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'development';

            const consoleSpy = vi.spyOn(console, 'log');

            const service = new DailyResetService(mockBot, { games: [testConfig], devModeInterval: 10 });
            service.initializeSchedules();

            // Check that custom interval was used
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('every 10 minutes')
            );

            process.env.NODE_ENV = originalEnv;
        });
    });
});
