/**
 * Schedule inventory: every timed job in the bot and exactly when it runs.
 *
 * The tables below were recorded from the code as it was BEFORE every timer was
 * moved onto the JobScheduler (cron strings, timezones, intervals and startup
 * delays captured from the real services and configs). Job names are new, but
 * each timing is the one the old code used. A change here is a change to when
 * the bot does something (daily resets, PvP reminders, coupon redemption), so
 * update it deliberately, never to make the test pass.
 *
 * The services are the real ones built from the real configs; only node-schedule
 * is replaced by a recorder, and the network-facing services are stubbed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { scheduleJob } = vi.hoisted(() => ({
    scheduleJob: vi.fn(() => ({ cancel: vi.fn() })),
}));

vi.mock('node-schedule', () => ({ default: { scheduleJob } }));
vi.mock('../../assetSync/assetSyncService.js', () => ({
    getAssetSyncService: () => ({
        syncIncremental: vi.fn(),
        getRegisteredGameIds: () => [],
        getLastSyncTime: vi.fn(),
    }),
}));
vi.mock('../../youtubeNotificationService.js', () => ({
    getYouTubeNotificationService: () => ({
        pollAndNotify: async () => ({ notified: 0, errors: 0 }),
    }),
}));
vi.mock('../../../utils/logger.js', () => ({
    logger: new Proxy({}, { get: () => () => undefined }),
}));

type Table = Record<string, string>;

const cron = (expr: string, extra = '') => `cron ${expr}${extra}`;
const utc = (expr: string) => cron(expr, ' tz=Etc/UTC');
const every = (ms: number) => `every ${ms}ms`;
const once = (ms: number) => `once after ${ms}ms`;

/** Daily reset jobs: [game, warning cron, reset cron] in production. */
const DAILY_GAMES: Array<[string, string, string]> = [
    ['GODDESS OF VICTORY: NIKKE', '0 19 * * *', '0 20 * * *'],
    ['Blue Archive', '0 18 * * *', '0 19 * * *'],
    ['Trickcal: Chibi Go', '0 18 * * *', '0 19 * * *'],
    ['Chaos Zero Nightmare', '0 17 * * *', '0 18 * * *'],
    ['Lost Sword: Tales of Britannia', '0 14 * * *', '0 15 * * *'],
    ['Brown Dust 2', '0 23 * * *', '0 0 * * *'],
];

/** PvP reminder jobs: [event id, label, weekly cron (UTC)]. */
const PVP: Array<[string, string, string]> = [
    ['bd2-mirror-wars', '1 day', '59 14 * * 6'],
    ['bd2-mirror-wars', '1 hour', '59 13 * * 0'],
    ['bd2-mirror-wars', 'new season', '59 14 * * 0'],
    ['lost-sword-avalon', '2 days', '0 11 * * 5'],
    ['lost-sword-avalon', '1 day', '0 11 * * 6'],
    ['lost-sword-avalon', '1 hour', '0 14 * * 0'],
    ['lost-sword-star-reincarnation', '2 days', '0 11 * * 5'],
    ['lost-sword-star-reincarnation', '1 day', '0 11 * * 6'],
    ['lost-sword-star-reincarnation', '1 hour', '0 14 * * 0'],
];

/** Cleanup timers and the Twitch check: the same in every environment. */
const FIXED: Table = {
    'bot-activity': cron('0 */4 * * *'),
    'random-messages': cron('0 */6 * * *'),
    'twitch-stream-check': every(300_000),
    'embed-url-processed-ids-cleanup': every(300_000),
    'embed-cache-cleanup': every(600_000),
    'embed-ratelimit-cleanup': every(300_000),
    'chat-command-ratelimit-cleanup': every(7_200_000),
    'gacha-pull-ratelimit-cleanup': every(600_000),
};

function expectedProduction(): Table {
    const table: Table = { ...FIXED };
    for (const [game, warning, reset] of DAILY_GAMES) {
        table[`daily-reset:${game}-warning`] = cron(warning);
        table[`daily-reset:${game}-reset`] = cron(reset);
    }
    for (const [id, label, expr] of PVP) {
        table[`pvp:${id}-${label}`] = utc(expr);
    }
    Object.assign(table, {
        'gacha-weekly-digest': cron('0 12 * * 0'),
        'gacha-expiration-warnings': cron('0 9 * * *'),
        'gacha-auto-redemption': cron('15 */6 * * *'),
        'gacha-code-scraping': cron('*/30 * * * *'),
        'gacha-expired-cleanup': cron('0 0 * * *'),
        'gacha-unpin-finished': cron('5,35 * * * *'),
        'gacha-startup-code-scraping': once(15_000),
        'asset-sync-periodic': cron('0 * * * *', ' startup=60000'),
        'youtube-poll': cron('*/5 * * * *'),
    });
    return table;
}

function expectedDevelopment(): Table {
    const table: Table = { ...FIXED };
    for (const [game] of DAILY_GAMES) {
        table[`daily-reset:${game}-warning`] = cron('*/5 * * * *');
        table[`daily-reset:${game}-reset`] = cron('2-59/5 * * * *');
    }
    for (const [id, label] of PVP) {
        // Dev mode ignores the timezone pin: an every-N-minutes cron has no zone.
        table[`pvp:${id}-${label}`] = cron('*/3 * * * *');
    }
    Object.assign(table, {
        'gacha-weekly-digest': cron('*/10 * * * *'),
        'gacha-expiration-warnings': cron('*/5 * * * *'),
        'gacha-auto-redemption': cron('*/3 * * * *'),
        'gacha-code-scraping': cron('*/2 * * * *'),
        'gacha-expired-cleanup': cron('*/15 * * * *'),
        'gacha-unpin-finished': cron('*/2 * * * *'),
        'gacha-startup-code-scraping': once(10_000),
        'asset-sync-periodic': cron('*/10 * * * *', ' startup=60000'),
        'youtube-poll': cron('*/3 * * * *'),
    });
    return table;
}

/** Build every service the way serviceInitializer / discord.ts do, then read the registry. */
async function buildRegistry(nodeEnv: 'production' | 'development'): Promise<Table> {
    vi.resetModules();
    process.env.NODE_ENV = nodeEnv;

    const { getJobScheduler } = await import('../jobScheduler');
    const { BOT_ACTIVITY_CRON, RANDOM_MESSAGES_CRON } = await import('../schedules');
    const { DailyResetService } = await import('../../dailyResetService');
    const { dailyResetServiceConfig } = await import('../../../utils/data/gamesResetConfig');
    const { PvpReminderService } = await import('../../pvpReminderService');
    const { pvpReminderServiceConfig } = await import('../../../utils/data/pvpEventsConfig');
    const { GachaCouponScheduler } = await import('../../gachaCouponScheduler');
    const { YouTubeNotificationScheduler } = await import('../../youtubeNotificationScheduler');
    const { AssetSyncScheduler } = await import('../../assetSync/assetSyncScheduler');
    const { ChatCommandRateLimiter } = await import('../../../utils/chatCommandRateLimiter');
    const { RateLimiter } = await import('../../../commands/utils/rateLimiter');
    const { startStreamStatusCheck } = await import('../../../utils/twitch');
    await import('../../embedFix/embedCache');
    await import('../../embedFix/rateLimiter');
    await import('../../embedFix/urlFixService');

    const bot: any = { guilds: { cache: new Map() } };

    new DailyResetService(bot, dailyResetServiceConfig).initializeSchedules();
    new GachaCouponScheduler(bot, {
        weeklyDigestInterval: 10,
        expirationWarningInterval: 5,
        autoRedemptionInterval: 3,
        triggerOnStartup: false,
        startupDelay: 10,
    }).initializeSchedules();
    await new YouTubeNotificationScheduler(bot).initializeSchedules();
    new PvpReminderService(bot, pvpReminderServiceConfig).initializeSchedules();
    new AssetSyncScheduler({ devSyncIntervalMinutes: 10, logLastSyncOnStartup: false }).initializeSchedules();
    ChatCommandRateLimiter.init();
    RateLimiter.init();
    startStreamStatusCheck({});

    // discord.ts is too heavy to import (it builds the Discord client); its two
    // crons live in schedules.ts and are registered under these names there.
    const scheduler = getJobScheduler();
    scheduler.register({ name: 'bot-activity', cron: BOT_ACTIVITY_CRON }, () => undefined);
    scheduler.register({ name: 'random-messages', cron: RANDOM_MESSAGES_CRON }, () => undefined);

    const table: Table = {};
    for (const job of scheduler.list()) {
        if (job.kind === 'cron') {
            table[job.name] = cron(job.cron!, `${job.tz ? ` tz=${job.tz}` : ''}${job.startupDelayMs !== undefined ? ` startup=${job.startupDelayMs}` : ''}`);
        } else if (job.kind === 'interval') {
            table[job.name] = every(job.intervalMs!);
        } else {
            table[job.name] = once(job.startupDelayMs!);
        }
    }
    scheduler.cancelAll();
    return table;
}

describe('schedule inventory', () => {
    const env = process.env.NODE_ENV;

    beforeEach(() => {
        vi.useFakeTimers();
        scheduleJob.mockClear();
    });

    afterEach(() => {
        vi.useRealTimers();
        process.env.NODE_ENV = env;
    });

    it('production schedule is unchanged', async () => {
        expect(await buildRegistry('production')).toEqual(expectedProduction());
    });

    it('development schedule is unchanged', async () => {
        expect(await buildRegistry('development')).toEqual(expectedDevelopment());
    });

    it('registers exactly the cron expressions the old code passed to node-schedule (production)', async () => {
        scheduleJob.mockClear();
        await buildRegistry('production');
        const calls = (scheduleJob.mock.calls as unknown as Array<[unknown]>).map(([spec]) =>
            typeof spec === 'string' ? spec : `${(spec as any).rule} @${(spec as any).tz}`);
        // 12 daily + 6 gacha + youtube + asset sync + 9 pvp + 2 discord.ts
        expect(calls).toHaveLength(12 + 6 + 1 + 1 + 9 + 2);
        expect(calls).toContain('15 */6 * * *');
        expect(calls).toContain('59 14 * * 6 @Etc/UTC');
    });
});
