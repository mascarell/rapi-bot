import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DailyResetService } from '../dailyResetService';
import { DailyResetConfig } from '../../utils/interfaces/DailyResetConfig.interface';
import { Client, Guild, TextChannel, Collection } from 'discord.js';
import * as schedule from 'node-schedule';
import * as util from '../../utils/util';
import * as mediaManager from '../../utils/cdn/mediaManager';
import { dailyResetServiceConfig } from '../../utils/data/gamesResetConfig';

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
            expect(jobs.has('Test Game-reset')).toBe(true);
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
                expect.stringContaining('[DEV] Scheduled reset for Test Game')
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
                expect.stringContaining('Scheduled reset for Test Game at 12:00 UTC')
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

    describe('Chaos Zero Nightmare Configuration', () => {
        it('should schedule Chaos Zero Nightmare with correct reset time (18:00 UTC)', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';

            const consoleSpy = vi.spyOn(console, 'log');

            // Use the actual config to test
            const chaosZeroConfig = dailyResetServiceConfig.games.find((g: any) => g.game === 'Chaos Zero Nightmare');

            expect(chaosZeroConfig).toBeDefined();
            expect(chaosZeroConfig?.resetTime.hour).toBe(18);
            expect(chaosZeroConfig?.resetTime.minute).toBe(0);

            const service = new DailyResetService(mockBot, dailyResetServiceConfig);
            service.initializeSchedules();

            // Check that schedule includes Chaos Zero
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Scheduled reset for Chaos Zero Nightmare at 18:00 UTC')
            );

            process.env.NODE_ENV = originalEnv;
        });

        it('should use correct channel name for Chaos Zero Nightmare', () => {
            const chaosZeroConfig = dailyResetServiceConfig.games.find((g: any) => g.game === 'Chaos Zero Nightmare');

            expect(chaosZeroConfig).toBeDefined();
            expect(chaosZeroConfig?.channelName).toBe('chaos-zero-nightmare');
        });

        it('should reset 2 hours before Nikke (18:00 vs 20:00)', () => {
            const chaosZeroConfig = dailyResetServiceConfig.games.find((g: any) => g.game === 'Chaos Zero Nightmare');
            const nikkeConfig = dailyResetServiceConfig.games.find((g: any) => g.game === 'GODDESS OF VICTORY: NIKKE');

            expect(chaosZeroConfig).toBeDefined();
            expect(nikkeConfig).toBeDefined();

            const chaosZeroMinutes = (chaosZeroConfig?.resetTime.hour ?? 0) * 60 + (chaosZeroConfig?.resetTime.minute ?? 0);
            const nikkeMinutes = (nikkeConfig?.resetTime.hour ?? 0) * 60 + (nikkeConfig?.resetTime.minute ?? 0);

            expect(nikkeMinutes - chaosZeroMinutes).toBe(120); // 2 hours = 120 minutes
        });

        it('should have warning config enabled for Chaos Zero Nightmare', () => {
            const chaosZeroConfig = dailyResetServiceConfig.games.find((g: any) => g.game === 'Chaos Zero Nightmare');

            expect(chaosZeroConfig).toBeDefined();
            expect(chaosZeroConfig?.warningConfig).toBeDefined();
            expect(chaosZeroConfig?.warningConfig?.enabled).toBe(true);
            expect(chaosZeroConfig?.warningConfig?.minutesBefore).toBe(60);
        });
    });

    describe('Warning Message System', () => {
        it('should create dual schedules (warning + reset) when warning is enabled', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';

            const configWithWarning = {
                ...testConfig,
                warningConfig: {
                    enabled: true,
                    minutesBefore: 60
                }
            };

            const service = new DailyResetService(mockBot, { games: [configWithWarning] });
            service.initializeSchedules();

            const jobs = service.getScheduledJobs();
            expect(jobs.size).toBe(2); // warning + reset
            expect(jobs.has('Test Game-warning')).toBe(true);
            expect(jobs.has('Test Game-reset')).toBe(true);

            process.env.NODE_ENV = originalEnv;
        });

        it('should only create reset schedule when warning is disabled', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';

            const configWithoutWarning = {
                ...testConfig,
                warningConfig: {
                    enabled: false,
                    minutesBefore: 60
                }
            };

            const service = new DailyResetService(mockBot, { games: [configWithoutWarning] });
            service.initializeSchedules();

            const jobs = service.getScheduledJobs();
            expect(jobs.size).toBe(1); // only reset
            expect(jobs.has('Test Game-reset')).toBe(true);
            expect(jobs.has('Test Game-warning')).toBe(false);

            process.env.NODE_ENV = originalEnv;
        });

        it('should schedule warning 60 minutes before reset in production', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';

            const consoleSpy = vi.spyOn(console, 'log');

            const configWithWarning = {
                ...testConfig,
                resetTime: { hour: 20, minute: 0 },
                warningConfig: {
                    enabled: true,
                    minutesBefore: 60
                }
            };

            const service = new DailyResetService(mockBot, { games: [configWithWarning] });
            service.initializeSchedules();

            // Should log warning at 19:00 (1 hour before 20:00)
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Scheduled warning for Test Game at 19:00 UTC (60 min before reset)')
            );

            process.env.NODE_ENV = originalEnv;
        });

        it('should not include role ping in warning messages', async () => {
            vi.mocked(util.findChannelByName).mockReturnValue(mockChannel);

            const configWithRoleAndWarning = {
                ...testConfig,
                roleName: 'Test Role',
                warningConfig: {
                    enabled: true,
                    minutesBefore: 60
                }
            };

            const service = new DailyResetService(mockBot, { games: [configWithRoleAndWarning] });

            // Access private method to test warning message
            const sendWarningMessageToGuild = (service as any).sendWarningMessageToGuild;
            await sendWarningMessageToGuild.call(service, mockGuild, configWithRoleAndWarning);

            // Channel send should only be called once (for embed), not twice (role ping + embed)
            expect(mockChannel.send).toHaveBeenCalledTimes(1);
            expect(mockChannel.send).toHaveBeenCalledWith({ embeds: expect.any(Array) });
        });

        it('should build warning embed with different content than reset embed', async () => {
            const configWithWarning = {
                ...testConfig,
                warningConfig: {
                    enabled: true,
                    minutesBefore: 60
                }
            };

            const service = new DailyResetService(mockBot, { games: [configWithWarning] });

            // Build warning embed
            const buildWarningEmbed = (service as any).buildWarningEmbed;
            const warningEmbed = await buildWarningEmbed.call(service, mockGuild, configWithWarning);

            // Build reset embed
            const buildEmbed = (service as any).buildEmbed;
            const resetEmbed = await buildEmbed.call(service, mockGuild, configWithWarning);

            // Warning and reset should have different titles
            expect(warningEmbed.data.title).not.toBe(resetEmbed.data.title);
            expect(warningEmbed.data.title).toContain('Warning');

            // Warning should have fewer fields (no checklist)
            const warningFieldCount = warningEmbed.data.fields?.length || 0;
            const resetFieldCount = resetEmbed.data.fields?.length || 0;
            expect(warningFieldCount).toBeLessThan(resetFieldCount);
        });

        it('should use default warning template when no custom config provided', async () => {
            const configWithBasicWarning = {
                ...testConfig,
                game: 'Test Game',
                warningConfig: {
                    enabled: true,
                    minutesBefore: 60
                }
            };

            const service = new DailyResetService(mockBot, { games: [configWithBasicWarning] });
            const buildWarningEmbed = (service as any).buildWarningEmbed;
            const warningEmbed = await buildWarningEmbed.call(service, mockGuild, configWithBasicWarning);

            expect(warningEmbed.data.title).toBe('⚠️ Test Game Reset Warning!');
            expect(warningEmbed.data.description).toContain('60 minutes');
            expect(warningEmbed.data.color).toBe(0xFFA500); // Orange
        });

        it('should support custom warning embed config', async () => {
            const configWithCustomWarning = {
                ...testConfig,
                warningConfig: {
                    enabled: true,
                    minutesBefore: 30,
                    embedConfig: {
                        title: 'Custom Warning Title',
                        description: 'Custom warning description',
                        color: 0xFF0000
                    }
                }
            };

            const service = new DailyResetService(mockBot, { games: [configWithCustomWarning] });
            const buildWarningEmbed = (service as any).buildWarningEmbed;
            const warningEmbed = await buildWarningEmbed.call(service, mockGuild, configWithCustomWarning);

            expect(warningEmbed.data.title).toBe('Custom Warning Title');
            expect(warningEmbed.data.description).toBe('Custom warning description');
            expect(warningEmbed.data.color).toBe(0xFF0000);
        });

        it('should schedule warning with 2-minute offset in dev mode', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'development';

            const consoleSpy = vi.spyOn(console, 'log');

            const configWithWarning = {
                ...testConfig,
                warningConfig: {
                    enabled: true,
                    minutesBefore: 60
                }
            };

            const service = new DailyResetService(mockBot, { games: [configWithWarning], devModeInterval: 5 });
            service.initializeSchedules();

            // Should log both warning and reset schedules
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[DEV] Scheduled warning for Test Game every 5 minutes')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[DEV] Scheduled reset for Test Game at +2 min offset')
            );

            process.env.NODE_ENV = originalEnv;
        });

        it('should handle midnight wraparound for warning time calculation', () => {
            const service = new DailyResetService(mockBot, { games: [testConfig] });
            const calculateWarningTime = (service as any).calculateWarningTime;

            // Test: 00:30 reset - 60 min warning = 23:30 previous day
            const result = calculateWarningTime.call(service, 0, 30, 60);
            expect(result.warningHour).toBe(23);
            expect(result.warningMinute).toBe(30);
        });

        it('should execute afterSend hook for warning messages', async () => {
            vi.mocked(util.findChannelByName).mockReturnValue(mockChannel);

            const afterSendSpy = vi.fn().mockResolvedValue(undefined);
            const configWithHooksAndWarning = {
                ...testConfig,
                warningConfig: {
                    enabled: true,
                    minutesBefore: 60
                },
                hooks: {
                    afterSend: afterSendSpy
                }
            };

            const service = new DailyResetService(mockBot, { games: [configWithHooksAndWarning] });
            const sendWarningMessageToGuild = (service as any).sendWarningMessageToGuild;

            await sendWarningMessageToGuild.call(service, mockGuild, configWithHooksAndWarning);

            expect(afterSendSpy).toHaveBeenCalled();
        });

        it('should handle errors in warning message sending gracefully', async () => {
            const failingChannel = {
                ...mockChannel,
                send: vi.fn(() => Promise.reject(new Error('Send failed')))
            } as any;

            vi.mocked(util.findChannelByName).mockReturnValue(failingChannel);

            const configWithWarning = {
                ...testConfig,
                warningConfig: {
                    enabled: true,
                    minutesBefore: 60
                }
            };

            const service = new DailyResetService(mockBot, { games: [configWithWarning] });
            const sendWarningMessage = (service as any).sendWarningMessage;

            // Should not throw because errors are caught and logged internally
            await expect(sendWarningMessage.call(service, configWithWarning)).resolves.not.toThrow();
        });
    });

    describe('Time Calculation', () => {
        it('should calculate warning time correctly for normal times', () => {
            const service = new DailyResetService(mockBot, { games: [testConfig] });
            const calculateWarningTime = (service as any).calculateWarningTime;

            // Test: 20:00 - 60 min = 19:00
            let result = calculateWarningTime.call(service, 20, 0, 60);
            expect(result.warningHour).toBe(19);
            expect(result.warningMinute).toBe(0);

            // Test: 18:00 - 60 min = 17:00
            result = calculateWarningTime.call(service, 18, 0, 60);
            expect(result.warningHour).toBe(17);
            expect(result.warningMinute).toBe(0);

            // Test: 14:30 - 30 min = 14:00
            result = calculateWarningTime.call(service, 14, 30, 30);
            expect(result.warningHour).toBe(14);
            expect(result.warningMinute).toBe(0);
        });

        it('should handle midnight wraparound correctly', () => {
            const service = new DailyResetService(mockBot, { games: [testConfig] });
            const calculateWarningTime = (service as any).calculateWarningTime;

            // Test: 00:00 - 60 min = 23:00 previous day
            let result = calculateWarningTime.call(service, 0, 0, 60);
            expect(result.warningHour).toBe(23);
            expect(result.warningMinute).toBe(0);

            // Test: 00:30 - 60 min = 23:30 previous day
            result = calculateWarningTime.call(service, 0, 30, 60);
            expect(result.warningHour).toBe(23);
            expect(result.warningMinute).toBe(30);

            // Test: 01:00 - 120 min = 23:00 previous day
            result = calculateWarningTime.call(service, 1, 0, 120);
            expect(result.warningHour).toBe(23);
            expect(result.warningMinute).toBe(0);
        });

        it('should handle various minutesBefore values', () => {
            const service = new DailyResetService(mockBot, { games: [testConfig] });
            const calculateWarningTime = (service as any).calculateWarningTime;

            // Test: 15 minutes before
            let result = calculateWarningTime.call(service, 20, 0, 15);
            expect(result.warningHour).toBe(19);
            expect(result.warningMinute).toBe(45);

            // Test: 30 minutes before
            result = calculateWarningTime.call(service, 20, 0, 30);
            expect(result.warningHour).toBe(19);
            expect(result.warningMinute).toBe(30);

            // Test: 120 minutes (2 hours) before
            result = calculateWarningTime.call(service, 20, 0, 120);
            expect(result.warningHour).toBe(18);
            expect(result.warningMinute).toBe(0);
        });

        it('should handle edge case with minutes wraparound', () => {
            const service = new DailyResetService(mockBot, { games: [testConfig] });
            const calculateWarningTime = (service as any).calculateWarningTime;

            // Test: 12:15 - 30 min = 11:45
            const result = calculateWarningTime.call(service, 12, 15, 30);
            expect(result.warningHour).toBe(11);
            expect(result.warningMinute).toBe(45);
        });
    });
});
