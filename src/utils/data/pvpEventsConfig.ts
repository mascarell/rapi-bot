import { PvpEventConfig, PvpReminderServiceConfig } from '../interfaces/PvpEventConfig.interface.js';
import { cdnDomainUrl } from '../util.js';

// Asset URLs (shared with gamesResetConfig.ts)
const RAPI_BOT_THUMBNAIL_URL = `${cdnDomainUrl}/assets/rapi-bot-thumbnail.jpg`;
const BROWN_DUST_2_LOGO_URL = `${cdnDomainUrl}/assets/logos/brown-dust-2-logo.png`;

const DEFAULT_IMAGE_EXTENSIONS = ['.gif', '.png', '.jpg', '.webp'];

/**
 * Brown Dust 2 — Mirror Wars (Weekly PVP)
 *
 * Season ends every Sunday ~2:59 PM UTC.
 * Players get 40 async auto-battles per day and need to push rank before reset.
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
                description:
                    `Adventurers, the rift between mirrors grows unstable...\n\n` +
                    `**Mirror Wars season ends tomorrow (Sunday) at ~2:59 PM UTC.**\n\n` +
                    `Complete your remaining **40 async auto-battles** and climb the ranks before the mirrors shatter!`,
                color: 0xFFA500, // Orange — advance warning
                footer: {
                    text: 'May the Blood Imprint guide your path, Adventurer!',
                    iconURL: RAPI_BOT_THUMBNAIL_URL,
                },
                thumbnail: BROWN_DUST_2_LOGO_URL,
                author: { name: 'Rapi BOT', iconURL: RAPI_BOT_THUMBNAIL_URL },
                fields: [
                    {
                        name: '\u23F0 Time Remaining',
                        value: '**~24 hours** until season ends',
                        inline: true,
                    },
                    {
                        name: '\uD83C\uDFAF What to Do',
                        value: '\u2022 Use all **40 daily async battles**\n\u2022 Push for a higher rank\n\u2022 Review your defense team composition',
                        inline: true,
                    },
                ],
            },
        },
        {
            label: '1 hour',
            minutesBefore: 60, // Sunday ~1:59 PM UTC
            embedConfig: {
                title: '\uD83D\uDEA8 Mirror Wars Season Ending in 1 Hour!',
                description:
                    `The mirrors are cracking, Adventurer! Time is almost up!\n\n` +
                    `**Mirror Wars season ends at ~2:59 PM UTC \u2014 less than 1 hour remains!**\n\n` +
                    `This is your **final chance** to complete battles and secure your rank. ` +
                    `The Cocytus waits for no one.`,
                color: 0xFF0000, // Red — urgent
                footer: {
                    text: 'The mirrors shatter soon... | May the Blood Imprint guide your path!',
                    iconURL: RAPI_BOT_THUMBNAIL_URL,
                },
                thumbnail: BROWN_DUST_2_LOGO_URL,
                author: { name: 'Rapi BOT', iconURL: RAPI_BOT_THUMBNAIL_URL },
                fields: [
                    {
                        name: '\u23F0 Time Remaining',
                        value: '**~1 hour** until season ends!',
                        inline: true,
                    },
                    {
                        name: '\uD83D\uDEA8 Last Call',
                        value: '\u2022 Burn remaining **async battles NOW**\n\u2022 Final rank adjustments\n\u2022 Season rewards lock after reset',
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

export const pvpReminderServiceConfig: PvpReminderServiceConfig = {
    events: [bd2MirrorWarsConfig],
    devModeInterval: 3,
};
