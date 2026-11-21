import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node-schedule', () => ({
    default: { scheduleJob: vi.fn(() => ({ cancel: vi.fn() })) },
}));
vi.mock('../gachaRedemptionService.js', () => ({ getGachaRedemptionService: vi.fn() }));
vi.mock('../gachaDataService.js', () => ({ getGachaDataService: vi.fn() }));
vi.mock('../couponAnnouncementService.js', () => ({ getCouponAnnouncementService: vi.fn() }));
vi.mock('../couponSourceService.js', () => ({
    syncCouponSources: vi.fn(),
    gamesWithNewCodes: vi.fn(() => []),
}));

import schedule from 'node-schedule';
import { GachaCouponScheduler } from '../gachaCouponScheduler';

/** Cron expressions the scheduler registered in production mode. */
function productionCrons(): string[] {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
        new GachaCouponScheduler({} as any).initializeSchedules();
    } finally {
        process.env.NODE_ENV = previous;
    }
    return vi.mocked(schedule.scheduleJob).mock.calls.map(call => call[0] as unknown as string);
}

describe('GachaCouponScheduler production schedule', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.mocked(schedule.scheduleJob).mockClear();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('runs auto-redemption at quarter past every sixth hour', () => {
        expect(productionCrons()).toContain('15 */6 * * *');
    });

    it('keeps auto-redemption off the code sync minutes', () => {
        const crons = productionCrons();
        expect(crons).toContain('*/30 * * * *');
        expect(crons).not.toContain('0 */6 * * *');
    });
});
