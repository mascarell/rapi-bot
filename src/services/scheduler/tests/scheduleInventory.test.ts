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
 * The jobs are registered by the real startup path (initializeServices with the
 * real configs, the real discord.ts registration functions, the real limiter
 * and Twitch wiring); only node-schedule is replaced by a recorder, and the
 * network-facing collaborators are stubbed.
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
// Collaborators of initializeServices that would reach S3 / Discord.
vi.mock('../../channelMonitorService', () => ({
    getChannelMonitorService: () => ({ initialize: async () => undefined, startMonitoring: () => undefined }),
}));
vi.mock('../../reactionConfirmationService', () => ({
    getReactionConfirmationService: () => ({ startListening: () => undefined }),
}));
vi.mock('../../rulesManagementService', () => ({
    getRulesManagementService: () => ({ initializeRulesMessage: async () => ({ success: true }) }),
}));
vi.mock('../../notificationSubscriptionService', () => ({
    getNotificationSubscriptionService: () => ({
        registerNotificationType: () => undefined,
        startListening: () => undefined,
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
        table[`daily-reset:${game}-warning`] = utc(warning);
        table[`daily-reset:${game}-reset`] = utc(reset);
    }
    for (const [id, label, expr] of PVP) {
        table[`pvp:${id}-${label}`] = utc(expr);
    }
    Object.assign(table, {
        'gacha-weekly-digest': utc('0 12 * * 0'),
        'gacha-expiration-warnings': utc('0 9 * * *'),
        'gacha-auto-redemption': utc('15 */6 * * *'),
        'gacha-code-scraping': utc('*/30 * * * *'),
        'gacha-expired-cleanup': utc('0 0 * * *'),
        'gacha-unpin-finished': utc('5,35 * * * *'),
        'gacha-startup-code-scraping': once(15_000),
        'asset-sync-periodic': cron('0 * * * *', ' startup=60000'),
        'youtube-poll': cron('*/5 * * * *'),
    });
    return table;
}

function expectedDevelopment(): Table {
    const table: Table = { ...FIXED };
    for (const [game] of DAILY_GAMES) {
        table[`daily-reset:${game}-warning`] = utc('*/5 * * * *');
        table[`daily-reset:${game}-reset`] = utc('2-59/5 * * * *');
    }
    for (const [id, label] of PVP) {
        // Dev mode ignores the timezone pin: an every-N-minutes cron has no zone.
        table[`pvp:${id}-${label}`] = cron('*/3 * * * *');
    }
    Object.assign(table, {
        'gacha-weekly-digest': utc('*/10 * * * *'),
        'gacha-expiration-warnings': utc('*/5 * * * *'),
        'gacha-auto-redemption': utc('*/3 * * * *'),
        'gacha-code-scraping': utc('*/2 * * * *'),
        'gacha-expired-cleanup': utc('*/15 * * * *'),
        'gacha-unpin-finished': utc('*/2 * * * *'),
        'gacha-startup-code-scraping': once(10_000),
        'asset-sync-periodic': cron('*/10 * * * *', ' startup=60000'),
        'youtube-poll': cron('*/3 * * * *'),
    });
    return table;
}

/** Names that had a maxRunMs in the last registry built. */
let limited = new Set<string>();

/** Jobs that already had their own overlap guard on master keep no time limit. */
const GUARDED_ON_MASTER = /^(gacha-(weekly-digest|expiration-warnings|auto-redemption|code-scraping|expired-cleanup|unpin-finished|startup-.*)|youtube-poll|asset-sync-periodic)$/;

/** Build every service the way serviceInitializer / discord.ts do, then read the registry. */
async function buildRegistry(nodeEnv: 'production' | 'development'): Promise<Table> {
    vi.resetModules();
    process.env.NODE_ENV = nodeEnv;

    const { getJobScheduler } = await import('../jobScheduler');
    const { registerBotActivityJob, registerRandomMessagesJob } = await import('../discordJobs');
    const { initializeServices } = await import('../../../bootstrap/serviceInitializer');
    const { ChatCommandRateLimiter } = await import('../../../utils/chatCommandRateLimiter');
    const { RateLimiter } = await import('../../../commands/utils/rateLimiter');
    const { startStreamStatusCheck } = await import('../../../utils/twitch');
    await import('../../embedFix/embedCache');
    await import('../../embedFix/rateLimiter');
    await import('../../embedFix/urlFixService');

    const bot: any = { guilds: { cache: new Map() } };

    // The real startup path: daily resets, gacha, YouTube, PvP and asset sync
    // are all built by initializeServices with their real configs.
    await initializeServices(bot);
    ChatCommandRateLimiter.init();
    RateLimiter.init();
    startStreamStatusCheck({});

    // discord.ts is too heavy to import (it builds the Discord client), but it
    // registers through these two functions, which are the real ones.
    registerBotActivityJob(() => undefined);
    registerRandomMessagesJob(async () => undefined);

    const scheduler = getJobScheduler();
    limited = new Set(scheduler.list().filter(job => job.maxRunMs !== undefined).map(job => job.name));
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

    it('gives a time limit to every job that had no overlap guard on master, and to no other', async () => {
        for (const env of ['production', 'development'] as const) {
            const table = await buildRegistry(env);
            const expectLimited = Object.keys(table).filter(name => !GUARDED_ON_MASTER.test(name));
            expect([...limited].sort()).toEqual(expectLimited.sort());
        }
    });

    it('registers exactly the cron expressions the old code passed to node-schedule (production)', async () => {
        scheduleJob.mockClear();
        await buildRegistry('production');
        const calls = (scheduleJob.mock.calls as unknown as Array<[unknown]>).map(([spec]) =>
            typeof spec === 'string' ? spec : `${(spec as any).rule} @${(spec as any).tz}`);
        // 12 daily + 6 gacha + youtube + asset sync + 9 pvp + 2 discord.ts
        expect(calls).toHaveLength(12 + 6 + 1 + 1 + 9 + 2);
        expect(calls).toContain('15 */6 * * * @Etc/UTC');
        expect(calls).toContain('0 20 * * * @Etc/UTC');
        expect(calls).toContain('59 14 * * 6 @Etc/UTC');
    });
});
