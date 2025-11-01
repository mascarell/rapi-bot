import { Client, Message } from 'discord.js';
import { DailyResetConfig, DailyResetServiceConfig, EmbedField } from '../interfaces/DailyResetConfig.interface';
import { getBosses, getTribeTowerRotation, cdnDomainUrl } from '../util';
import { getRandomCdnMediaUrl } from '../cdn/mediaManager';
import { logError } from '../util';

// Asset URLs (shared across configurations)
const RAPI_BOT_THUMBNAIL_URL = `${cdnDomainUrl}/assets/rapi-bot-thumbnail.jpg`;
const NIKKE_LOGO_URL = `${cdnDomainUrl}/assets/logos/nikke-logo.png`;
const BLUE_ARCHIVE_LOGO_URL = `${cdnDomainUrl}/assets/logos/blue-archive-logo.png`;
const TRICKCAL_LOGO_URL = `${cdnDomainUrl}/assets/logos/trickcal-logo.png`;
const CHAOS_ZERO_NIGHTMARE_LOGO_URL = `${cdnDomainUrl}/assets/logos/chaos-zero-nightmare-logo.png`;

// Default extensions
const DEFAULT_IMAGE_EXTENSIONS = ['.gif', '.png', '.jpg', '.webp'] as const;
const DEFAULT_VIDEO_EXTENSIONS = ['.mp4'] as const;

/**
 * Helper function to generate random quiet Rapi phrases
 */
function getRandomQuietRapiPhrase(): string {
    const quietRapiPhrases = [
        "You seriously want me to be quiet? Unbelievable.",
        "You think telling me to be quiet will help? Pathetic.",
        "Being quiet won't fix your incompetence.",
        "Silence won't make your mistakes disappear.",
        "Quiet? That's not going to solve anything.",
        "You think silence is the answer? Think again.",
        "Being quiet won't change the facts.",
        "You want quiet? How about some competence instead?",
        "Silence won't cover up your errors.",
        "Quiet won't make the problem go away.",
        "You think quiet will help? That's laughable.",
        "Being quiet won't make you any smarter.",
        "You want me to be quiet? How original.",
        "Quiet? That's your solution? Pathetic.",
        "Silence won't make your failures any less obvious.",
    ];
    return quietRapiPhrases[Math.floor(Math.random() * quietRapiPhrases.length)];
}

/**
 * Configuration for Nikke daily reset message
 */
const nikkeResetConfig: DailyResetConfig = {
    game: 'GODDESS OF VICTORY: NIKKE',
    channelName: 'nikke',
    roleName: 'Nikke',
    resetTime: { hour: 20, minute: 0 },
    timezone: 'UTC',
    embedConfig: {
        title: 'ATTENTION COMMANDERS!',
        description: `Server has been reset! Here's some of Today's **Daily Missions** Checklist:\n`,
        color: 0x3498DB,
        footer: {
            text: 'Stay safe on the surface, Commanders!',
            iconURL: RAPI_BOT_THUMBNAIL_URL
        },
        thumbnail: NIKKE_LOGO_URL,
        author: {
            name: 'Rapi BOT',
            iconURL: RAPI_BOT_THUMBNAIL_URL
        }
    },
    checklist: [
        { name: '**Daily Free Package**', value: `Check **Cash Shop** and under **Oridinary Package Tab** under **Daily** For **Daily Free Package**` },
        { name: '**Advise Nikkes**', value: 'Go Talk To Your **WAIFUS**. Advise Nikkes 2 Time(s)' },
        { name: '**Social**', value: 'Send Social Points 1 Time(s). Support your **FRIENDS**' },
        { name: '**Anomaly Interception**', value: '**Prioritize this over Special Interception**\n Clear Anomaly Interception 1 Time(s) if unlocked\n' },
        { name: '**Simulation Room**', value: 'Challenge Simulation Room 1 Time(s)' },
        { name: '**Simulation Room: Overclock**', value: 'Clear Simulation Room: Overclock if you have not already' },
        { name: '**Outpost Bulletin Board**', value: 'Dispatch 3 Time(s)' },
        { name: '**Outpost Defense**', value: 'Claim Outpost Defense Rewards Twice' },
        { name: '**Outpost Defense**', value: 'Wipe Out 1 Time(s)' },
    ],
    dynamicFields: (currentDate: Date): EmbedField[] => {
        const currentDayOfYear = Math.floor((currentDate.getTime() - new Date(currentDate.getFullYear(), 0, 0).getTime()) / 86400000);
        const currentDayOfWeek = currentDate.getDay();
        const bosses = getBosses();
        const towerRotation = getTribeTowerRotation();
        const bossName = bosses[currentDayOfYear % bosses.length];

        return [
            {
                name: '**Tribe Tower**',
                value: `Tribe tower is open for **${towerRotation[currentDayOfWeek % towerRotation.length]}**.`
            },
            {
                name: '**Special Interception**',
                value: `Clear Special Interception 1 Time(s). We have to fight **${bossName}**`
            }
        ];
    },
    mediaConfig: {
        cdnPath: 'dailies/nikke/',
        extensions: [...DEFAULT_IMAGE_EXTENSIONS],
        trackLast: 10
    },
    warningConfig: {
        enabled: true,
        minutesBefore: 60
    },
    hooks: {
        afterSend: async (message: Message, guildId: string, bot: Client) => {
            // Type guard to ensure we have a text-based channel
            if (!message.channel || !('send' in message.channel) || !('createMessageCollector' in message.channel)) {
                return;
            }

            // Create reaction collector for nauseated emojis
            const reactionFilter = (reaction: any, user: any) => {
                return ['🤢', '🤮', '🤒', '😷'].includes(reaction.emoji.name) && !user.bot;
            };

            const reactionCollector = message.createReactionCollector({
                filter: reactionFilter,
                time: 15 * 1000 // 15 seconds
            });

            reactionCollector.on('collect', async (reaction, user) => {
                console.log(`Collected ${reaction.emoji.name} reaction from ${user.tag} on daily reset message in guild: ${message.guild?.name}`);
                try {
                    const phraseMessage = getRandomQuietRapiPhrase();
                    const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                        "commands/quietRapi/",
                        guildId,
                        {
                            extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                            trackLast: 10
                        }
                    );

                    if ('send' in message.channel) {
                        await message.channel.send({
                            content: `<@${user.id}>, ${phraseMessage}`,
                            files: [randomCdnMediaUrl]
                        });
                    }
                } catch (error) {
                    logError(guildId, message.guild?.name || 'UNKNOWN', error instanceof Error ? error : new Error(String(error)), 'Handling nauseated reaction');
                }
            });

            reactionCollector.on('end', (collected: any) => {
                console.log(`Reaction collector ended. Collected ${collected.size} reactions in guild: ${message.guild?.name}`);
            });

            // Create message collector for "good girl" responses
            if ('createMessageCollector' in message.channel) {
                const messageCollector = message.channel.createMessageCollector({
                    filter: (response: Message) => response.content.toLowerCase().includes("good girl") && !response.author.bot,
                    time: 15 * 1000 // 15 seconds
                });

                let firstResponseHandled = false;

                messageCollector.on('collect', async (m: Message) => {
                    if (!firstResponseHandled) {
                        firstResponseHandled = true;
                        try {
                            await m.react("❤");
                            const thankYouMessages = [
                                `Your swiftness is unmatched, Commander ${m.author}. It's impressive.`,
                                `Your alertness honors us all, Commander ${m.author}.`,
                                `Your swift response is commendable, Commander ${m.author}.`
                            ];
                            await m.reply(thankYouMessages[Math.floor(Math.random() * thankYouMessages.length)]);
                        } catch (error) {
                            logError(guildId, message.guild?.name || 'UNKNOWN', error instanceof Error ? error : new Error(String(error)), 'Handling first good girl response');
                        }
                    } else {
                        try {
                            await m.react("sefhistare:1124869893880283306");
                            m.reply(`Commander ${m.author}... I expected better...`);
                        } catch (error) {
                            logError(guildId, message.guild?.name || 'UNKNOWN', error instanceof Error ? error : new Error(String(error)), 'Handling subsequent good girl responses');
                        }
                    }
                });

                messageCollector.on('end', (collected: any) => {
                    console.log(`Message collector stopped. Collected ${collected.size} responses for server: ${message.guild?.name}.`);
                });
            }
        }
    }
};

/**
 * Configuration for Blue Archive daily reset message
 */
const blueArchiveResetConfig: DailyResetConfig = {
    game: 'Blue Archive',
    channelName: 'blue-archive',
    resetTime: { hour: 19, minute: 0 },
    timezone: 'UTC',
    embedConfig: {
        title: 'ATTENTION SENSEIS!',
        description: `Server has been reset! Here's some of Today's **Daily Assignments** Checklist:\n`,
        color: 0x3498DB,
        footer: {
            text: 'Sensei, please help me with my homework?',
            iconURL: RAPI_BOT_THUMBNAIL_URL
        },
        thumbnail: BLUE_ARCHIVE_LOGO_URL,
        author: {
            name: 'Rapi BOT',
            iconURL: RAPI_BOT_THUMBNAIL_URL
        }
    },
    checklist: [
        { name: '**Hard Mode**', value: 'Farm Hard Mode **If You Have Stamina**.' },
        { name: '**Stamina Usage**', value: 'Ensure you are **Burning ALL Your Stamina**.' },
        { name: '**Bounty Reward**', value: 'Clear the Bounty for the Rewards.' },
        { name: '**Be A Good Sensei**', value: 'Check on your **Students** at the Cafe.' },
        { name: '**Tactical Challenge Shop**', value: 'Buy Stamina from the Tactical Challenge Shop **If There are Double Rewards**.' },
        { name: '**Normal Shop**', value: 'Buy Materials and Balls from the Normal Shop.' },
    ],
    mediaConfig: {
        cdnPath: 'dailies/blue-archive/',
        extensions: [...DEFAULT_IMAGE_EXTENSIONS],
        trackLast: 10
    },
    warningConfig: {
        enabled: true,
        minutesBefore: 60
    }
};

/**
 * Configuration for Trickcal Chibi Go daily reset message
 */
const trickcalResetConfig: DailyResetConfig = {
    game: 'Trickcal: Chibi Go',
    channelName: 'trickcal-chibi-go',
    resetTime: { hour: 19, minute: 0 },
    timezone: 'UTC',
    embedConfig: {
        title: 'GREETINGS, DELIVERERS!',
        description: `Welcome back, Masters! Youngchun has prepared today's tasks to maintain order in Elias.\n\nHere are your **Daily Missions** for the Yggdrasil Order:`,
        color: 0x90EE90,
        footer: {
            text: 'May Yggdrasil watch over you, Deliverers!',
            iconURL: RAPI_BOT_THUMBNAIL_URL
        },
        thumbnail: TRICKCAL_LOGO_URL,
        author: {
            name: 'Rapi BOT',
            iconURL: RAPI_BOT_THUMBNAIL_URL
        }
    },
    checklist: [
        { name: '**Daily Login**', value: 'Receive **Yggdrasil\'s Blessing** by logging in' },
        { name: '**Yggdrasil Relics**', value: 'Claim sacred **Relic Resources** from the World Tree' },
        { name: '**Candy Management**', value: 'Use **Candy** and **Star Candy** to keep supplies flowing' },
        { name: '**Battle Preparation**', value: 'Claim **Battle Supplies** and visit the **Store**' },
        { name: '**Banquet Hall**', value: 'Dine with your **Apostles** to strengthen bonds' },
        { name: '**Daily Schedule**', value: 'Complete assigned **Schedules** for the Order' },
        { name: '**Pet Care**', value: 'Collect gifts from your loyal **Pets**' }
    ],
    mediaConfig: {
        cdnPath: 'dailies/trickcal/',
        extensions: [...DEFAULT_IMAGE_EXTENSIONS],
        trackLast: 10
    },
    warningConfig: {
        enabled: true,
        minutesBefore: 60
    }
};

/**
 * Configuration for Chaos Zero Nightmare daily reset message
 * Resets 2 hours before Nikke (18:00 UTC vs 20:00 UTC)
 */
const chaosZeroNightmareResetConfig: DailyResetConfig = {
    game: 'Chaos Zero Nightmare',
    channelName: 'chaos-zero-nightmare',
    resetTime: { hour: 18, minute: 0 },
    timezone: 'UTC',
    embedConfig: {
        title: '⚠️ ATTENTION PROTOS!',
        description: `Dear Protos, it's time for your daily breakdown session.\n\nHere are today's **Essential Activities** to survive another day in Chaos Zero:`,
        color: 0x9B30FF,
        footer: {
            text: 'Stay vigilant, Protos. The nightmare never sleeps.',
            iconURL: RAPI_BOT_THUMBNAIL_URL
        },
        thumbnail: CHAOS_ZERO_NIGHTMARE_LOGO_URL,
        author: {
            name: 'Rapi BOT',
            iconURL: RAPI_BOT_THUMBNAIL_URL
        }
    },
    checklist: [
        { name: '**Morning Routine**', value: 'Grab **Coffee** and collect **Aether** at **Garden Café**. Complete the **Daily Order**' },
        { name: '**Policy Office**', value: 'Check out **Pending Policies** to be implemented in the office' },
        { name: '**Starshine Diner**', value: 'Head to **Starshine Diner** to have a meal before entering **Chaos**' },
        { name: '**Simulation Training**', value: 'Burn all **Aether** on Simulations for materials and experience' },
        { name: '**Daily Missions**', value: 'Complete all missions for **Crystals** and **Coordinates**' },
        { name: '**Partner Communication**', value: 'Use **Communication Passes** for **Affinity** gains and bonus **Crystals**' },
        { name: '**Shop & Rewards**', value: 'Visit **Nono\'s Shop** and claim **Login Rewards** from Mail' }
    ],
    mediaConfig: {
        cdnPath: 'dailies/chaos-zero-nightmare/',
        extensions: [...DEFAULT_IMAGE_EXTENSIONS],
        trackLast: 10
    },
    warningConfig: {
        enabled: true,
        minutesBefore: 60
    }
};

/**
 * Export all game reset configurations
 */
export const dailyResetServiceConfig: DailyResetServiceConfig = {
    games: [
        nikkeResetConfig,
        blueArchiveResetConfig,
        trickcalResetConfig,
        chaosZeroNightmareResetConfig
    ]
};
