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
 * Avalon is a biweekly event where guilds attack one of 6 castles for points.
 * This server's guild attacks Camelot or Mercia.
 * Each member gets 6 attempts; first 2 give 100 Diamonds, 3rd gives 150 💎.
 * Guild rewards = highest single-castle score, so focus efforts on ONE castle.
 *
 * Schedule: ends every other Sunday at 15:00 UTC. Anchor 2026-04-26 confirms
 * the active week. The off-week runs Star Reincarnation (separate config — TBD).
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
        anchor: '2026-04-26T15:00:00Z',  // user-confirmed active Sunday
        intervalWeeks: 2,
        phaseOffset: 0,                  // Avalon is phase A; future Star Reincarnation = phase 1
    },
    warnings: [
        {
            label: '2 days',
            minutesBefore: 2 * 24 * 60,  // Friday 15:00 UTC
            embedConfig: {
                title: '🏰 Avalon Ends in 2 Days — Lock Your Castle Target',
                description: (ts) =>
                    `Swordbringers, the Round Table calls! Avalon's reset approaches.\n\n` +
                    `**Avalon ends <t:${ts}:F> (<t:${ts}:R>).**\n\n` +
                    `Coordinate with your guild — focus efforts on **ONE castle** for the best leaderboard score.`,
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
                        name: '🎯 This Server Attacks',
                        value: '**Camelot** or **Mercia** — coordinate with guild',
                        inline: true,
                    },
                    {
                        name: '⚔️ Attempts',
                        value: '6 per member\n• 1st & 2nd: **100 💎** each\n• 3rd: **150 💎**',
                        inline: false,
                    },
                    {
                        name: '📜 Strategy',
                        value: 'Guild rewards = highest single-castle score. **Focus on ONE castle** for max leaderboard impact.',
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
            minutesBefore: 24 * 60, // Saturday 15:00 UTC
            embedConfig: {
                title: '🏰 Avalon Ends Tomorrow!',
                description: (ts) =>
                    `Swordbringers, the castle siege closes tomorrow!\n\n` +
                    `**Avalon ends <t:${ts}:F> (<t:${ts}:R>).**\n\n` +
                    `Spend your remaining attempts and push your guild's chosen castle to the leaderboard.`,
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
                        name: '🎯 Castle Targets',
                        value: '**Camelot** or **Mercia**',
                        inline: true,
                    },
                    {
                        name: '🔥 What to Do',
                        value: '• Burn remaining **6 attempts**\n• Stack on guild\'s chosen castle\n• Coordinate in guild chat',
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
                    `**Last chance** to spend attempts — rewards lock at reset.`,
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
                        value: '• Spend **all 6 attempts NOW**\n• Final castle pushes\n• Rewards lock at reset',
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
    events: [bd2MirrorWarsConfig, lostSwordAvalonConfig],
    devModeInterval: 3,
};
