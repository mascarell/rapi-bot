/**
 * Configuration for the honeypot channel.
 *
 * A honeypot is a bait channel that real members have no reason to post in:
 * visible, locked, and named so the warning is unmissable. Compromised accounts
 * running scam spam blast every channel they can see, so they trip the trap
 * before they reach the channels people actually read.
 *
 * On a trip the offender is softbanned — banned with message deletion, then
 * immediately unbanned — which removes the account and purges its recent
 * messages server-wide while leaving a real member who wandered in able to
 * rejoin with an invite.
 *
 * Deliberately a TypeScript constant rather than S3 or a slash command: a
 * channel name changes about once a year, which is slower than the release
 * cycle, and admin-only slash command surface is the most-rejected proposal on
 * this project.
 */

export const HONEYPOT_CONFIG = {
    /** Channel name (case-insensitive) that acts as the trap, in every guild. */
    CHANNEL_NAME: 'do-not-post',

    /**
     * How much of the offender's recent history the ban purges, in seconds.
     * Discord caps this at 7 days; 24h covers a spam run without touching
     * anything an account posted legitimately last week.
     */
    DELETE_MESSAGE_SECONDS: 24 * 60 * 60,

    /** Discord audit-log reason for the ban half of the softban. */
    BAN_REASON: 'Honeypot: posted in the trap channel',

    /** Discord audit-log reason for the unban half of the softban. */
    UNBAN_REASON: 'Honeypot softban release',

    /**
     * Channel name the bot looks up for mod alerts. Intentionally the same
     * channel the slur moderator uses (SLUR_MOD_CONFIG.MOD_LOG_CHANNEL_NAME) —
     * if one moves, move both.
     */
    MOD_LOG_CHANNEL_NAME: 'moderator-only',

    /** Message-content snapshot length in the mod-log embed. */
    MESSAGE_PREVIEW_LENGTH: 200,

    /**
     * Whether real bot applications and webhooks are exempt.
     *
     * Left on. A bot application cannot add itself to a guild — an admin has to
     * invite it — so a posting bot is far more likely to be a misconfigured
     * integration than an intruder, and banning someone else's bot breaks their
     * setup. The accounts this trap is actually for are compromised *user*
     * accounts running scam spam, which is what "bots" means colloquially here.
     * Flip to false if a bot ever does trip it for real.
     */
    EXEMPT_BOTS: true,

    /**
     * Ignore repeat trips from the same account for this long. A spam run posts
     * several messages a second, and without this each one races to ban an
     * account that is already gone and posts its own mod-log embed.
     */
    RECENT_ACTION_TTL_MS: 60 * 1000,

    /**
     * The pinned warning Rapi posts in the trap channel on startup.
     *
     * Short on purpose. It has one job — make sure nobody can say they were not
     * told — and a wall of text is a wall of text nobody reads. Members must be
     * able to learn the rule and the escape hatch at a glance.
     */
    NOTICE_TITLE: '🍯 Do Not Post Here',
    NOTICE_BODY: [
        'This channel is bait, Commander. Nothing happens here — it exists so spam accounts trip over it before they reach the channels that matter.',
        'Post anything and you are removed, along with your last 24 hours of messages. If that was genuinely an accident, you can rejoin — ask a mod for an invite.',
        'Move along.',
    ].join('\n\n'),

    /** How far back to look for an existing notice before posting a new one. */
    NOTICE_SEARCH_LIMIT: 50,
} as const;
