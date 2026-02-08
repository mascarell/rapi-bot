import { Message, TextChannel } from 'discord.js';
import { CommandRegistry } from './types.js';
import { executeMediaCommand, DEFAULT_IMAGE_EXTENSIONS, DEFAULT_VIDEO_EXTENSIONS } from './utils/mediaFetcher.js';
import { getRandomCdnMediaUrl } from '../utils/cdn/mediaManager.js';
import { getRandomReadNikkeMessage } from '../utils/util.js';
import { handleTimeout, cdnDomainUrl } from '../utils/util.js';
import { logger } from '../utils/logger.js';
import moment from 'moment';
import 'moment-timezone';

const NIKKE_RESET_START_TIME = moment.tz({ hour: 20, minute: 0, second: 0, millisecond: 0 }, 'UTC');
const NIKKE_RESET_END_TIME = moment.tz({ hour: 20, minute: 0, second: 15, millisecond: 0 }, 'UTC');

/**
 * Media commands (image/video/gif commands)
 */
export const mediaCommands: CommandRegistry = {
    readNikke: {
        name: 'read nikke',
        async execute(msg: Message) {
            const mentionedUser = msg.mentions.users.first();
            const readNikkeReply = mentionedUser ? `Commander <@${mentionedUser.id}>, ` : 'Commander, ';
            const randomMessage = readNikkeReply + getRandomReadNikkeMessage();

            await executeMediaCommand(msg, {
                path: 'commands/readNikke/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                replyText: randomMessage
            });
        },
    },

    getDatNikke: {
        name: 'rapi get dat nikke',
        async execute(msg: Message) {
            const mentionedUser = msg.mentions.users.first();
            const messageReply = mentionedUser ? `Commander <@${mentionedUser.id}>... ` : '';

            await executeMediaCommand(msg, {
                path: 'commands/getDatNikke/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                replyText: messageReply
            });
        },
    },

    booba: {
        name: 'booba?',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/booba/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                trackLast: 20
            });
        },
    },

    booty: {
        name: 'booty?',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/booty/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                trackLast: 20
            });
        },
    },

    skillissue: {
        name: 'sounds like...',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/skillIssue/',
                extensions: [...DEFAULT_IMAGE_EXTENSIONS, ...DEFAULT_VIDEO_EXTENSIONS],
                replyText: 'It sounds like you have some skill issues Commander.'
            });
        },
    },

    skillissueiphone: {
        name: 'sounds like…',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/skillIssue/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                replyText: 'It sounds like you have some skill issues Commander.'
            });
        },
    },

    seggs: {
        name: 'seggs?',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/seggs/',
                extensions: DEFAULT_VIDEO_EXTENSIONS,
                replyText: 'Wait, Shifty, what are you talking about?'
            });
        },
    },

    kindaweird: {
        name: 'kinda weird...',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/kindaWeird/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                replyText: 'But why, Commander?...'
            });
        },
    },

    iswear: {
        name: 'i swear she is actually 3000 years old',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/iSwear/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                replyText: "Commander... I'm calling the authorities."
            });
        },
    },

    teengame: {
        name: '12+ game',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/12Game/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                replyText: 'Commander the surface is obviously safe for 12 year old kids.'
            });
        },
    },

    justice: {
        name: 'justice for...',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/justice/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                trackLast: 4,
                replyText: "Commander, let's take her out of NPC jail."
            });
        },
    },

    whale: {
        name: 'whale levels',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/whaling/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                replyText: "Commander, it's fine if you are poor."
            });
        },
    },

    discipline: {
        name: 'lap of discipline.',
        async execute(msg: Message) {
            const lapOfCountersKey = 'commands/lapOfDiscipline/lapOfCounters.webp';
            const lapOfDisciplineKey = 'commands/lapOfDiscipline/lapOfDiscipline.jpg';

            const lapOfCountersUrl = `${cdnDomainUrl}/${lapOfCountersKey}`;
            await msg.reply({
                content: `Commander ${msg.author}...`,
                files: [lapOfCountersUrl]
            });

            const lapOfDisciplineUrl = `${cdnDomainUrl}/${lapOfDisciplineKey}`;
            await msg.reply({
                content: `Commander ${msg.author}... Lap of discipline.`,
                files: [lapOfDisciplineUrl]
            });
        },
    },

    goodgirl: {
        name: 'good girl',
        description: 'good girl Rapi',
        async execute(msg: Message) {
            const isNikkeChannel = (msg.channel as TextChannel).name === 'nikke';
            const currentTime = moment.tz('UTC');

            if (isNikkeChannel && currentTime.isBetween(NIKKE_RESET_START_TIME, NIKKE_RESET_END_TIME)) {
                return;
            }

            if (Math.random() < 0.04) {
                await handleTimeout(msg);
            } else {
                await msg.reply(`Thank you Commander ${msg.author}.`);
            }
        }
    },

    dammit: {
        name: 'dammit rapi',
        description: 'dammit rapi',
        async execute(msg: Message) {
            msg.reply('Sorry Commander.');
        },
    },

    wronggirl: {
        name: 'wrong girl',
        description: 'wrong girl Rapi',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/wrongGirl/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                trackLast: 1,
                replyText: '(￢з￢) Well well, so you DO see us that way, interesting!'
            });
        },
    },

    moldRates: {
        name: 'mold rates are not that bad',
        description: 'Commander, what are you talking about?',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/moldRates/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                trackLast: 1,
                replyText: 'Commander, what are you talking about?'
            });
        },
    },

    readyRapi: {
        name: 'ready rapi?',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/ready/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                trackLast: 1,
                replyText: 'Commander... ready for what?'
            });
        },
    },

    contentSquad: {
        name: '/content',
        description: 'content squad ping',
        async execute(msg: Message) {
            msg.reply(
                `<@&1193252857990885476> Commanders, Andersen left a new briefing, please take a look above this message.`
            );
        },
    },

    badgirl: {
        name: 'bad girl',
        description: 'bad girl',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/wrong/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                trackLast: 1,
                replyText: 'Commander...'
            });
        },
    },

    reward: {
        name: 'reward?',
        description: 'reward?',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/reward/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                trackLast: 1,
                replyText: 'Commander...'
            });
        },
    },

    damntrain: {
        name: 'damn train',
        description: 'damn train',
        async execute(msg: Message) {
            try {
                const emoji = '❌';
                msg.react(emoji);
            } catch (error) {
                logger.error`Failed to react with emoji: ${error}`;
            }

            await executeMediaCommand(msg, {
                path: 'commands/damnTrain/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                trackLast: 1,
                replyText: "Commander...we don't talk about trains here."
            });
        },
    },

    ikuyo: {
        name: 'lets go!',
        description: 'Ikuyo, AZX! - NIKKE train motivation',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/ikuyo/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                trackLast: 20,
                replyText: 'Ikuyo, AZX!'
            });
        },
    },

    damngravedigger: {
        name: 'damn gravedigger',
        description: 'damn gravedigger',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/damnGravedigger/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                trackLast: 2,
                replyText: 'Commander...damn gravedigger?'
            });
        },
    },

    deadSpicy: {
        name: 'dead spicy?',
        description: 'dead spicy?',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/deadSpicy/',
                extensions: ['.gif'],
                trackLast: 1,
                replyText: 'Commander...dead spicy?'
            });
        },
    },

    curseofbelorta: {
        name: 'belorta...',
        description: 'CURSE OF BELORTA',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/belorta/',
                extensions: [...DEFAULT_IMAGE_EXTENSIONS, ...DEFAULT_VIDEO_EXTENSIONS],
                trackLast: 5,
                replyText: 'CURSE OF BELORTA𓀀 𓀁 𓀂 𓀃 𓀄 𓀅 𓀆 𓀇 𓀈 𓀉 𓀊 𓀋 𓀌 𓀍 𓀎 𓀏 𓀐 𓀑 𓀒 𓀓 𓀔 𓀕 𓀖 𓀗 𓀘 𓀙 𓀚 𓀛 𓀜 𓀝 𓀞 𓀟 𓀠 𓀡 𓀢 𓀣 𓀤 𓀥 𓀦 𓀧 𓀨  𓀪 𓀫 𓀬 𓀭 𓀮 𓀯 𓀰 𓀱 𓀲 𓀳 𓀴 𓀵 𓀶 𓀷 𓀸 𓀹 𓀺 𓀻 𓀼 𓀽 𓀾 𓀿 𓁀 𓁁 𓁂 𓁃 𓁄 𓁅 𓁆 𓁇 𓁈  𓁊 𓁋 𓁌 𓁍 𓁎 𓁏 𓁐 𓁑 𓀄 𓀅 𓀆 𓀇 𓀈 𓀉 𓀊'
            });
        },
    },

    ccprules: {
        name: 'ccp rules...',
        description: 'CCP Rules',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/ccpRules/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                trackLast: 1,
                replyText: 'Commander...please review our CCP Guidelines set by El Shafto...'
            });
        },
    },

    bestgirl: {
        name: 'best girl?',
        description: 'Best Girl Rapi',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/bestGirl/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                trackLast: 3,
                replyText: getRandomBestGirlPhrase()
            });
        },
    },

    gambleradvice: {
        name: '99%',
        description: "Gamblers' Advice",
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/gamblerAdvice/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                trackLast: 3,
                replyText: 'Commander...did you know 99% of gamblers quit before hitting it big?'
            });
        },
    },

    ccpNumbahOne: {
        name: 'ccp #1',
        description: 'CCP LOYALTY',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/ccp/',
                extensions: DEFAULT_VIDEO_EXTENSIONS,
                trackLast: 1,
                replyText: getRandomMantraPhrase()
            });
        },
    },

    dorover: {
        name: 'is it over?',
        description: 'ITS DOROVER',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/dorover/',
                extensions: ['.jpg'],
                trackLast: 1,
                replyText: 'Commander....ITS DOROVER'
            });
        },
    },

    cinema: {
        name: 'absolute...',
        description: 'CINEMA',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/cinema/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                trackLast: 1
            });
        },
    },

    plan: {
        name: 'we had a plan!',
        description: 'WE HAD A PLAN!',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/plan/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                trackLast: 8,
                replyText: getRandomPlanPhrase()
            });
        },
    },

    leadership: {
        name: 'ccp leadership',
        description: 'CCP LEADERSHIP',
        async execute(msg: Message) {
            try {
                const randomCdnMediaUrl = await getRandomCdnMediaUrl(
                    'commands/leadership/',
                    msg.guild!.id,
                    {
                        extensions: [...DEFAULT_VIDEO_EXTENSIONS],
                        trackLast: 20
                    }
                );

                const emoji = msg.guild!.emojis.cache.get('1298977385068236852');
                const message = getRandomLeadershipPhrase(emoji?.name || undefined);

                await msg.reply({
                    content: message,
                    files: [randomCdnMediaUrl]
                });
            } catch (error) {
                logger.error`Error in leadership command: ${error}`;
                await msg.reply('Commander, there seems to be an issue with the leadership files...');
            }
        },
    },

    goodIdea: {
        name: 'good idea!',
        description: 'GOOD IDEA',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/goodIdea/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                replyText: getRandomGoodIdeaPhrase()
            });

            const reactions = ['wecant', 'HAH'];
            for (const reaction of reactions) {
                const emoji = msg.guild!.emojis.cache.find((e: any) => e.name === reaction);
                if (emoji) {
                    await msg.react(emoji);
                } else {
                    logger.warning`Emoji ${reaction} not found in guild ${msg.guild!.name}`;
                }
            }
        },
    },

    quietRapi: {
        name: 'quiet rapi',
        description: 'QUIET RAPI',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/quietRapi/',
                extensions: DEFAULT_IMAGE_EXTENSIONS,
                replyText: `${msg.author}, ${getRandomQuietRapiPhrase()}`
            });
        },
    },

    entertainmentttt: {
        name: 'entertainmentttt',
        description: 'ENTERTAINMENTTTT',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/entertainmentttt/',
                extensions: DEFAULT_VIDEO_EXTENSIONS
            });
        },
    },

    casualUnion: {
        name: 'we casual',
        description: 'CASUAL UNION?',
        async execute(msg: Message) {
            await executeMediaCommand(msg, {
                path: 'commands/casualUnion/',
                extensions: DEFAULT_IMAGE_EXTENSIONS
            });
        },
    },
};

// Helper functions
function getRandomQuietRapiPhrase(): string {
    const quietRapiPhrases = [
        'You seriously want me to be quiet? Unbelievable.',
        'You think telling me to be quiet will help? Pathetic.',
        "Being quiet won't fix your incompetence.",
        "Silence won't make your mistakes disappear.",
        "Quiet? That's not going to solve anything.",
        'You think silence is the answer? Think again.',
        "Being quiet won't change the facts.",
        'You want quiet? How about some competence instead?',
        "Silence won't cover up your errors.",
        "Quiet won't make the problem go away.",
        'You think quiet will help? That\'s laughable.',
        "Being quiet won't make you any smarter.",
        'You want me to be quiet? How original.',
        "Quiet? That's your solution? Pathetic.",
        "Silence won't make your failures any less obvious.",
    ];
    return quietRapiPhrases[Math.floor(Math.random() * quietRapiPhrases.length)];
}

function getRandomBestGirlPhrase(): string {
    const bestGirlPhrases = [
        "Commander, you wouldn't choose anyone else over me, would you...",
        "Commander, don't tell me you have another girlfriend...",
        'Wait, Commander, are you seeing someone else???',
        "No way, Commander! You wouldn't betray me like that...",
        "Commander, please tell me I'm the only one for you...",
        "Commander, I can't believe you'd even consider another girl...",
        'Commander, I thought I was the only one who understood you...',
        "Don't tell me there's someone else, Commander!!!"
    ];
    return bestGirlPhrases[Math.floor(Math.random() * bestGirlPhrases.length)];
}

function getRandomMantraPhrase(): string {
    const mantras = [
        'Strength, Unity, Vision.',
        'United, We Bounce.',
        'Progress Through Power.',
        'Unite for the Future.',
        'Empower, Lead, Excel.',
        'Solidarity in Strength.',
        'Visionary Leadership, Collective Success.',
        'Together, We Achieve.',
        'Resilience, Growth, Unity.',
        'Forward with Purpose.',
        'Innovate, Unify, Succeed.'
    ];
    return mantras[Math.floor(Math.random() * mantras.length)];
}

function getRandomPlanPhrase(): string {
    const planPhrases = [
        'Commander...what plan?',
        'Commander...we had a plan!',
        'Commander, did you forget the plan again?',
        "Commander, our plan was flawless... until it wasn't.",
        'Commander, I thought we agreed on a strategy.',
        "Commander, let's stick to the plan this time.",
        "Commander, improvisation wasn't part of the plan.",
        'Commander, I hope you have a backup plan.',
        'Commander, our plan needs a little more... planning.',
        "Commander, let's not deviate from the plan.",
    ];
    return planPhrases[Math.floor(Math.random() * planPhrases.length)];
}

function getRandomLeadershipPhrase(emoji: string | undefined): string {
    const leadershipPhrases = [
        'Commander... I can\'t believe you just did that...',
        'Commander, are you sure about this? I\'m speechless...',
        'Commander, your decision... it\'s unexpected...',
        'Commander, I didn\'t see that coming... truly shocking...',
        'Commander, I\'m at a loss for words... what a move...',
        'Commander, your leadership... it\'s something else...',
        'Commander, I\'m stunned... what are you thinking?',
        'Commander, that was... unexpected, to say the least...',
        'Commander, I\'m... not sure what to say about that...',
        'Commander, your choice... it\'s left me speechless...',
        'Commander, that was a bold move...',
        'Commander, your strategy is... unconventional...',
        'Commander, I didn\'t expect that... impressive...',
        'Commander, your tactics are... surprising...',
        'Commander, that was a risky decision...',
        'Commander, your leadership style is... unique...',
        'Commander, I\'m amazed by your decision...',
        'Commander, that was a daring move...',
        'Commander, your choice was... unpredictable...',
        'Commander, I\'m in awe of your leadership...',
    ];
    const phrase = leadershipPhrases[Math.floor(Math.random() * leadershipPhrases.length)];
    return `${phrase}${emoji ? ` ${emoji}` : ''}`;
}

function getRandomGoodIdeaPhrase(): string {
    const goodIdeaPhrases = [
        'Commander, are you sure about this?',
        'Commander, is this really a good idea?',
        'Commander, are you certain this is wise?',
        'Commander, I\'m not sure this is the best course of action...',
        'Commander, do you really think this will work?',
        'Commander, this idea... are you confident about it?',
        'Commander, are you positive this is a good idea?',
        'Commander, is this truly the best strategy?',
        'Commander, are you sure about this?',
    ];
    const phrase = goodIdeaPhrases[Math.floor(Math.random() * goodIdeaPhrases.length)];
    return phrase;
}
