import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getChannelMonitorService } from '../channelMonitorService';

// Mock dependencies
vi.mock('../gachaGuildConfigService', () => ({
    getGachaGuildConfigService: vi.fn(() => ({
        getChannelMonitors: vi.fn().mockResolvedValue({
            'lost-sword': {
                guildId: '1065055945123708928',
                prodChannelId: '1458612534289629214',
                devChannelId: '1458672383417253888',
            },
        }),
    })),
}));

vi.mock('../gachaDataService', () => ({
    getGachaDataService: vi.fn(() => ({
        addCoupon: vi.fn().mockResolvedValue(undefined),
        getAllCoupons: vi.fn().mockResolvedValue([]),
    })),
}));

vi.mock('../gachaRedemptionService', () => ({
    getGachaRedemptionService: vi.fn(() => ({
        notifyNewCode: vi.fn().mockResolvedValue(undefined),
    })),
}));

describe('ChannelMonitorService', () => {
    let service: ReturnType<typeof getChannelMonitorService>;

    beforeEach(() => {
        // Reset singleton
        const ChannelMonitorService = getChannelMonitorService();
        ChannelMonitorService.reset();
        service = getChannelMonitorService();
    });

    describe('parseAnnouncementMessage', () => {
        it('should extract coupon code from Lost Sword announcement', () => {
            const content = `📌 Coupon Code
GLORYLS26

📌 Rewards
Legendary Gift Box x5

📌 Redemption Period
Until January 21, 23:59 (UTC+9)`;

            const result = service.parseAnnouncementMessage('lost-sword', content);

            expect(result).not.toBeNull();
            expect(result?.code).toBe('GLORYLS26');
        });

        it('should extract rewards from announcement', () => {
            const content = `📌 Coupon Code
TESTCODE123

📌 Rewards
Legendary Gift Box x5

📌 Redemption Period
Until January 21, 23:59 (UTC+9)`;

            const result = service.parseAnnouncementMessage('lost-sword', content);

            expect(result).not.toBeNull();
            expect(result?.rewards).toBe('Legendary Gift Box x5');
        });

        it('should parse expiration date with UTC+9 timezone', () => {
            const content = `📌 Coupon Code
TESTCODE123

📌 Rewards
Test Reward

📌 Redemption Period
Until January 21, 23:59 (UTC+9)`;

            const result = service.parseAnnouncementMessage('lost-sword', content);

            expect(result).not.toBeNull();
            expect(result?.expirationDate).not.toBeNull();
            // The date should be converted to UTC (23:59 UTC+9 = 14:59 UTC)
            const expDate = new Date(result!.expirationDate!);
            expect(expDate.getUTCHours()).toBe(14);
            expect(expDate.getUTCMinutes()).toBe(59);
        });

        it('should return null if no coupon code found', () => {
            const content = `This is just a regular announcement without any coupon code.`;

            const result = service.parseAnnouncementMessage('lost-sword', content);

            expect(result).toBeNull();
        });

        it('should handle missing rewards gracefully', () => {
            const content = `📌 Coupon Code
TESTCODE123

📌 Redemption Period
Until January 21, 23:59 (UTC+9)`;

            const result = service.parseAnnouncementMessage('lost-sword', content);

            expect(result).not.toBeNull();
            expect(result?.code).toBe('TESTCODE123');
            expect(result?.rewards).toBe('Unknown rewards');
        });

        it('should handle missing expiration date', () => {
            const content = `📌 Coupon Code
TESTCODE123

📌 Rewards
Some Rewards`;

            const result = service.parseAnnouncementMessage('lost-sword', content);

            expect(result).not.toBeNull();
            expect(result?.code).toBe('TESTCODE123');
            expect(result?.expirationDate).toBeNull();
        });

        it('should handle lowercase coupon codes and normalize to uppercase', () => {
            const content = `📌 Coupon Code
testcode123

📌 Rewards
Test Reward`;

            const result = service.parseAnnouncementMessage('lost-sword', content);

            expect(result).not.toBeNull();
            expect(result?.code).toBe('TESTCODE123');
        });
    });

    describe('parseExpirationDate', () => {
        it('should parse "January 21, 23:59 (UTC+9)" format', () => {
            const result = service.parseExpirationDate('January 21, 23:59 (UTC+9)');

            expect(result).not.toBeNull();
            const date = new Date(result!);
            expect(date.getUTCMonth()).toBe(0); // January
            expect(date.getUTCDate()).toBe(21);
            expect(date.getUTCHours()).toBe(14); // 23:59 UTC+9 = 14:59 UTC
            expect(date.getUTCMinutes()).toBe(59);
        });

        it('should convert to UTC correctly for different timezones', () => {
            const resultPlus9 = service.parseExpirationDate('February 15, 12:00 (UTC+9)');
            const datePlus9 = new Date(resultPlus9!);

            expect(datePlus9.getUTCHours()).toBe(3); // 12:00 UTC+9 = 03:00 UTC
        });

        it('should handle different month names', () => {
            const months = [
                { name: 'March 1, 10:00 (UTC+0)', expected: 2 },
                { name: 'December 25, 18:00 (UTC+0)', expected: 11 },
                { name: 'July 4, 12:00 (UTC+0)', expected: 6 },
            ];

            months.forEach(({ name, expected }) => {
                const result = service.parseExpirationDate(name);
                expect(result).not.toBeNull();
                const date = new Date(result!);
                expect(date.getUTCMonth()).toBe(expected);
            });
        });

        it('should return null for unparseable dates', () => {
            const result = service.parseExpirationDate('Not a valid date');

            expect(result).toBeNull();
        });

        it('should handle simple date format without time', () => {
            const result = service.parseExpirationDate('January 21');

            expect(result).not.toBeNull();
            const date = new Date(result!);
            expect(date.getUTCMonth()).toBe(0); // January
            expect(date.getUTCDate()).toBe(21);
        });
    });

    describe('isMonitoredChannel', () => {
        it('should return null for non-monitored channel when not initialized', () => {
            const result = service.isMonitoredChannel('1234567890');

            expect(result).toBeNull();
        });
    });

    describe('toDiscordTimestamp', () => {
        it('should convert ISO date to Discord relative timestamp', () => {
            const isoDate = '2025-01-21T14:59:00.000Z';
            const result = service.toDiscordTimestamp(isoDate, 'R');

            expect(result).toMatch(/^<t:\d+:R>$/);
        });

        it('should handle null date', () => {
            const result = service.toDiscordTimestamp(null, 'R');

            expect(result).toBe('No expiration');
        });

        it('should support different format specifiers', () => {
            const isoDate = '2025-01-21T14:59:00.000Z';

            expect(service.toDiscordTimestamp(isoDate, 'F')).toMatch(/^<t:\d+:F>$/);
            expect(service.toDiscordTimestamp(isoDate, 'f')).toMatch(/^<t:\d+:f>$/);
            expect(service.toDiscordTimestamp(isoDate, 'D')).toMatch(/^<t:\d+:D>$/);
        });
    });

    describe('getMonitoredChannelIds', () => {
        it('should return empty array when not initialized', () => {
            const result = service.getMonitoredChannelIds();

            expect(result).toEqual([]);
        });
    });
});
