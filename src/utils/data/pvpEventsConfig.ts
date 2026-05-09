import { PvpEventConfig, PvpReminderServiceConfig } from '../interfaces/PvpEventConfig.interface.js';
import { cdnDomainUrl } from '../util.js';
import { cacheBust } from '../../config/assets.js';

// Asset URLs (shared with gamesResetConfig.ts)
const RAPI_BOT_THUMBNAIL_URL = cacheBust(`${cdnDomainUrl}/assets/rapi-bot-thumbnail.jpg`);
const BROWN_DUST_2_LOGO_URL = cacheBust(`${cdnDomainUrl}/assets/logos/brown-dust-2-logo.png`);
const LOST_SWORD_LOGO_URL = cacheBust(`${cdnDomainUrl}/assets/logos/lost-sword-logo.png`);

const DEFAULT_IMAGE_EXTENSIONS = ['.gif', '.png', '.jpg', '.webp'];

/**
 * Brown Dust 2 — Mirror Wars (Weekly PVP)
 *
 * Season ends every Sunday ~2:59 PM UTC.
 * Players get 40 auto-battles per day and need to push rank before reset.
 * Rewards (Diamonds) are based on peak rank achieved during the season.
 */
const bd2MirrorWarsConfig: PvpEventConfig = {
    id: 'bd2-mirror-wars',
    game: 'Brown Dust 2',
    eventName: 'Mirror Wars',
    channelName: 'brown-dust-2',
    seasonEnd: {
        dayOfWeek: 0,  // Sunday
        hour: 14,
        minute: 59,
    },
    warnings: [
        {
            label: '1 day',
            minutesBefore: 24 * 60, // Saturday ~2:59 PM UTC
            embedConfig: {
                title: '\u2694\uFE0F Mirror Wars Season Ending Tomorrow!',
                description: (ts) =>
                    `Adventurers, the rift between mirrors grows unstable...\n\n` +
                    `**Mirror Wars season ends <t:${ts}:F> (<t:${ts}:R>).**\n\n` +
                    `Complete your remaining **40 daily battles** and climb the ranks before the mirrors shatter!`,
                color: 0xFFA500, // Orange — advance warning
                footer: {
                    text: 'May the Blood Imprint guide your path, Adventurer!',
                    iconURL: RAPI_BOT_THUMBNAIL_URL,
                },
                thumbnail: BROWN_DUST_2_LOGO_URL,
                author: { name: 'Rapi BOT', iconURL: RAPI_BOT_THUMBNAIL_URL },
                fields: (ts) => [
                    {
                        name: '\u23F0 Season Ends',
                        value: `<t:${ts}:F>\n<t:${ts}:R>`,
                        inline: true,
                    },
                    {
                        name: '\uD83C\uDFAF What to Do',
                        value: '\u2022 Use all **40 daily battles**\n\u2022 Push for a higher rank\n\u2022 Review your defense team composition',
                        inline: true,
                    },
                ],
            },
        },
        {
            label: '1 hour',
            minutesBefore: 60, // Sunday ~1:59 PM UTC
            sendDM: true, // Only the 1-hour warning sends DM notifications to subscribers
            embedConfig: {
                title: '\uD83D\uDEA8 Mirror Wars Season Ending in 1 Hour!',
                description: (ts) =>
                    `The mirrors are cracking, Adventurer! Time is almost up!\n\n` +
                    `**Mirror Wars season ends <t:${ts}:R> (<t:${ts}:t>)!**\n\n` +
                    `This is your **final chance** to complete battles and secure your rank. ` +
                    `The Cocytus waits for no one.`,
                color: 0xFF0000, // Red — urgent
                footer: {
                    text: 'The mirrors shatter soon... | May the Blood Imprint guide your path!',
                    iconURL: RAPI_BOT_THUMBNAIL_URL,
                },
                thumbnail: BROWN_DUST_2_LOGO_URL,
                author: { name: 'Rapi BOT', iconURL: RAPI_BOT_THUMBNAIL_URL },
                fields: (ts) => [
                    {
                        name: '\u23F0 Season Ends',
                        value: `<t:${ts}:t> (<t:${ts}:R>)`,
                        inline: true,
                    },
                    {
                        name: '\uD83D\uDEA8 Last Call',
                        value: '\u2022 Burn remaining **battles NOW**\n\u2022 Final rank adjustments\n\u2022 Season rewards lock after reset',
                        inline: true,
                    },
                ],
            },
        },
        {
            label: 'new season',
            minutesBefore: 0, // Fires AT season end = new season start
            embedConfig: {
                title: '\uD83C\uDF1F New Mirror Wars Season Has Begun!',
                description: (ts) =>
                    `The mirrors have been restored, Adventurer! A new season of Mirror Wars awaits!\n\n` +
                    `**Next season ends <t:${ts}:F> (<t:${ts}:R>).**\n\n` +
                    `Set your defense team, plan your strategy, and begin your climb to the top!`,
                color: 0x00CC66, // Green — celebratory / fresh start
                footer: {
                    text: 'A new season dawns! | May the Blood Imprint guide your path!',
                    iconURL: RAPI_BOT_THUMBNAIL_URL,
                },
                thumbnail: BROWN_DUST_2_LOGO_URL,
                author: { name: 'Rapi BOT', iconURL: RAPI_BOT_THUMBNAIL_URL },
                fields: (ts) => [
                    {
                        name: '\uD83D\uDCC5 Next Season Ends',
                        value: `<t:${ts}:F>\n<t:${ts}:R>`,
                        inline: true,
                    },
                    {
                        name: '\u2728 New Season Tips',
                        value: '\u2022 Update your **defense team**\n\u2022 Start battles early \u2014 don\'t wait!\n\u2022 Use all **40 daily battles**',
                        inline: true,
                    },
                ],
            },
        },
    ],
    mediaConfig: {
        cdnPath: 'dailies/bd2/',
        extensions: [...DEFAULT_IMAGE_EXTENSIONS],
        trackLast: 10,
    },
};

/**
 * Lost Sword — Avalon (Biweekly Guild Raid)
 *
 * Avalon is a biweekly event where guilds attack castles for points.
 * This server's guild attacks BOTH Camelot AND Mercia — 3 attempts each
 * (6 attempts total, split 3/3).
 *
 * Schedule: ends every other Sunday at 15:00 UTC. Anchor 2026-05-10 is the
 * end of the current active cycle (Avalon active 2026-05-03 → 2026-05-10).
 * The alternating weeks run Star Reincarnation (phaseOffset=1, see below).
 */
const lostSwordAvalonConfig: PvpEventConfig = {
    id: 'lost-sword-avalon',
    game: 'Lost Sword',
    eventName: 'Avalon',
    channelName: 'lost-sword',
    seasonEnd: {
        dayOfWeek: 0,  // Sunday
        hour: 15,      // 15:00 UTC (matches Lost Sword daily reset)
        minute: 0,
    },
    cyclePhase: {
        anchor: '2026-05-10T15:00:00Z',  // first season-end of active cycle
        intervalWeeks: 2,
        phaseOffset: 0,                  // Avalon is phase A; Star Reincarnation = phase B (offset 1)
    },
    warnings: [
        {
            label: '2 days',
            minutesBefore: (2 * 24 * 60) + 60,  // Friday 14:00 UTC (1h before daily reset to avoid notification collision)
            embedConfig: {
                title: '🏰 Avalon Ends in 2 Days — Hit Both Castles!',
                description: (ts) =>
                    `Swordbringers, the Round Table calls! Avalon's reset approaches.\n\n` +
                    `**Avalon ends <t:${ts}:F> (<t:${ts}:R>).**\n\n` +
                    `Spend your **6 attempts: 3 on Camelot, 3 on Mercia.**`,
                color: 0xFFD700, // Gold — Lost Sword brand color
                footer: {
                    text: 'May Excalibur guide your path, Swordbringers!',
                    iconURL: RAPI_BOT_THUMBNAIL_URL,
                },
                thumbnail: LOST_SWORD_LOGO_URL,
                author: { name: 'Rapi BOT', iconURL: RAPI_BOT_THUMBNAIL_URL },
                fields: (ts) => [
                    {
                        name: '⏰ Reset',
                        value: `<t:${ts}:F>\n<t:${ts}:R>`,
                        inline: true,
                    },
                    {
                        name: '🎯 Castles to Attack',
                        value: '**Camelot** AND **Mercia**\n(3 attempts each)',
                        inline: true,
                    },
                    {
                        name: '⚔️ Attempts',
                        value: '**6 attempts total** — 3 on Camelot, 3 on Mercia',
                        inline: false,
                    },
                    {
                        name: '📜 Strategy',
                        value: 'Split your **6 attempts evenly** across both castles. Coordinate in guild chat to align with team picks.',
                        inline: false,
                    },
                    {
                        name: '📖 Guides',
                        value: '[Avalon Guide](https://lootandwaifus.com/guides/avalon-guide-lost-sword/) • [Camelot Teams](https://lootandwaifus.com/teams/lost-sword-avalon-camelot-castle/) • [Prydwen Raid Guide](https://www.prydwen.gg/lost-sword/guides/raid-guide/)',
                        inline: false,
                    },
                ],
            },
        },
        {
            label: '1 day',
            minutesBefore: (24 * 60) + 60, // Saturday 14:00 UTC (1h before daily reset to avoid notification collision)
            embedConfig: {
                title: '🏰 Avalon Ends Tomorrow!',
                description: (ts) =>
                    `Swordbringers, the castle siege closes tomorrow!\n\n` +
                    `**Avalon ends <t:${ts}:F> (<t:${ts}:R>).**\n\n` +
                    `Spend remaining attempts on **both Camelot AND Mercia** — 3 each.`,
                color: 0xFFA500, // Orange — urgency rising
                footer: {
                    text: 'The Round Table awaits, Swordbringer!',
                    iconURL: RAPI_BOT_THUMBNAIL_URL,
                },
                thumbnail: LOST_SWORD_LOGO_URL,
                author: { name: 'Rapi BOT', iconURL: RAPI_BOT_THUMBNAIL_URL },
                fields: (ts) => [
                    {
                        name: '⏰ Reset',
                        value: `<t:${ts}:F>\n<t:${ts}:R>`,
                        inline: true,
                    },
                    {
                        name: '🎯 Castles',
                        value: '**Camelot** AND **Mercia** (3 each)',
                        inline: true,
                    },
                    {
                        name: '🔥 What to Do',
                        value: '• Burn remaining attempts\n• 3 on Camelot, 3 on Mercia\n• Coordinate team picks in guild chat',
                        inline: false,
                    },
                ],
            },
        },
        {
            label: '1 hour',
            minutesBefore: 60, // Sunday 14:00 UTC
            sendDM: true,      // Only the 1-hour warning DMs subscribers
            embedConfig: {
                title: '🚨 Avalon Reset in 1 Hour!',
                description: (ts) =>
                    `Final hour, Swordbringers! Avalon's reset is imminent.\n\n` +
                    `**Avalon ends <t:${ts}:R> (<t:${ts}:t>).**\n\n` +
                    `**Last chance** to spend remaining attempts on Camelot AND Mercia — rewards lock at reset.`,
                color: 0xFF0000, // Red — urgent
                footer: {
                    text: 'The siege closes! | May Excalibur guide your path!',
                    iconURL: RAPI_BOT_THUMBNAIL_URL,
                },
                thumbnail: LOST_SWORD_LOGO_URL,
                author: { name: 'Rapi BOT', iconURL: RAPI_BOT_THUMBNAIL_URL },
                fields: (ts) => [
                    {
                        name: '⏰ Reset',
                        value: `<t:${ts}:t> (<t:${ts}:R>)`,
                        inline: true,
                    },
                    {
                        name: '🚨 Last Call',
                        value: '• Spend **all 6 attempts NOW**\n• 3 on Camelot, 3 on Mercia\n• Rewards lock at reset',
                        inline: true,
                    },
                ],
            },
        },
    ],
    mediaConfig: {
        cdnPath: 'dailies/lost-sword/',
        extensions: [...DEFAULT_IMAGE_EXTENSIONS],
        trackLast: 10,
    },
};

/**
 * Lost Sword — Star Reincarnation (Biweekly Endgame Raid)
 *
 * Alternates with Avalon: when Avalon is dormant, Star Reincarnation is active.
 * Players fight 6 bosses with 2 different teams (10 chars + 6 pets total) for
 * Goddess Stones and Galaxy Essence. Damage thresholds reward Diamonds + Goddess
 * Stones at 10M / 100M / 300M. Each cycle features unique bosses and buffs that
 * demand varied team compositions.
 *
 * Schedule: ends every other Sunday at 15:00 UTC, on the alternating week from
 * Avalon (shared anchor 2026-05-10 + phaseOffset=1 → SR ends 2026-05-17, 05-31, ...).
 */
const lostSwordStarReincarnationConfig: PvpEventConfig = {
    id: 'lost-sword-star-reincarnation',
    game: 'Lost Sword',
    eventName: 'Star Reincarnation',
    channelName: 'lost-sword',
    seasonEnd: {
        dayOfWeek: 0,
        hour: 15,
        minute: 0,
    },
    cyclePhase: {
        anchor: '2026-05-10T15:00:00Z',  // shared anchor with Avalon
        intervalWeeks: 2,
        phaseOffset: 1,                  // phase B (Avalon = phase A, offset 0)
    },
    warnings: [
        {
            label: '2 days',
            minutesBefore: (2 * 24 * 60) + 60,  // Friday 14:00 UTC (1h before daily reset to avoid notification collision)
            embedConfig: {
                title: '🌌 Star Reincarnation Ends in 2 Days — Plan Your Two Teams',
                description: (ts) =>
                    `Swordbringers, the cosmos calls! Star Reincarnation's reset approaches.\n\n` +
                    `**Star Reincarnation ends <t:${ts}:F> (<t:${ts}:R>).**\n\n` +
                    `Build **two distinct teams** (5 characters + 3 pets each) and start chipping away at the 6 bosses for Goddess Stones.`,
                color: 0x9B59B6, // Purple — cosmic/Star theme
                footer: {
                    text: 'May the stars align for you, Swordbringer!',
                    iconURL: RAPI_BOT_THUMBNAIL_URL,
                },
                thumbnail: LOST_SWORD_LOGO_URL,
                author: { name: 'Rapi BOT', iconURL: RAPI_BOT_THUMBNAIL_URL },
                fields: (ts) => [
                    {
                        name: '⏰ Reset',
                        value: `<t:${ts}:F>\n<t:${ts}:R>`,
                        inline: true,
                    },
                    {
                        name: '⚔️ Format',
                        value: '**6 bosses** × **2 teams**\n10 characters + 6 pets total',
                        inline: true,
                    },
                    {
                        name: '💎 Damage Thresholds',
                        value: '• **10M** damage\n• **100M** damage\n• **300M** damage\nEach tier unlocks Diamonds + Goddess Stones',
                        inline: false,
                    },
                    {
                        name: '🌠 Strategy',
                        value: 'Each cycle features unique bosses and buffs — review boss kits and adjust your team comps. Roster depth matters here.',
                        inline: false,
                    },
                    {
                        name: '📖 Guides',
                        value: '[Star Reincarnation Guide](https://lootandwaifus.com/guides/reincarnation-of-stars-lost-sword/)',
                        inline: false,
                    },
                ],
            },
        },
        {
            label: '1 day',
            minutesBefore: (24 * 60) + 60, // Saturday 14:00 UTC (1h before daily reset to avoid notification collision)
            embedConfig: {
                title: '🌌 Star Reincarnation Ends Tomorrow!',
                description: (ts) =>
                    `Swordbringers, the cosmic raid closes tomorrow!\n\n` +
                    `**Star Reincarnation ends <t:${ts}:F> (<t:${ts}:R>).**\n\n` +
                    `Push damage on remaining bosses and lock in your highest tier rewards before reset.`,
                color: 0xFFA500, // Orange — urgency rising
                footer: {
                    text: 'The stars wait for no one, Swordbringer!',
                    iconURL: RAPI_BOT_THUMBNAIL_URL,
                },
                thumbnail: LOST_SWORD_LOGO_URL,
                author: { name: 'Rapi BOT', iconURL: RAPI_BOT_THUMBNAIL_URL },
                fields: (ts) => [
                    {
                        name: '⏰ Reset',
                        value: `<t:${ts}:F>\n<t:${ts}:R>`,
                        inline: true,
                    },
                    {
                        name: '🎯 Reward Tiers',
                        value: '**10M / 100M / 300M** damage',
                        inline: true,
                    },
                    {
                        name: '🔥 What to Do',
                        value: '• Finish remaining bosses\n• Push for next damage tier\n• Swap team comps if stuck',
                        inline: false,
                    },
                ],
            },
        },
        {
            label: '1 hour',
            minutesBefore: 60,
            sendDM: true,
            embedConfig: {
                title: '🚨 Star Reincarnation Reset in 1 Hour!',
                description: (ts) =>
                    `Final hour, Swordbringers! Star Reincarnation closes soon.\n\n` +
                    `**Star Reincarnation ends <t:${ts}:R> (<t:${ts}:t>).**\n\n` +
                    `**Last chance** to push damage tiers — Goddess Stones lock at reset.`,
                color: 0xFF0000, // Red — urgent
                footer: {
                    text: 'The stars dim! | May the cosmos guide your path!',
                    iconURL: RAPI_BOT_THUMBNAIL_URL,
                },
                thumbnail: LOST_SWORD_LOGO_URL,
                author: { name: 'Rapi BOT', iconURL: RAPI_BOT_THUMBNAIL_URL },
                fields: (ts) => [
                    {
                        name: '⏰ Reset',
                        value: `<t:${ts}:t> (<t:${ts}:R>)`,
                        inline: true,
                    },
                    {
                        name: '🚨 Last Call',
                        value: '• Finish damage pushes\n• Final boss attempts\n• Rewards lock at reset',
                        inline: true,
                    },
                ],
            },
        },
    ],
    mediaConfig: {
        cdnPath: 'dailies/lost-sword/',
        extensions: [...DEFAULT_IMAGE_EXTENSIONS],
        trackLast: 10,
    },
};

export const pvpReminderServiceConfig: PvpReminderServiceConfig = {
    events: [bd2MirrorWarsConfig, lostSwordAvalonConfig, lostSwordStarReincarnationConfig],
    devModeInterval: 3,
};
