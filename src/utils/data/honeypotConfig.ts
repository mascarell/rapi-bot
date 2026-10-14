/**
 * Configuration for the honeypot channel.
 *
 * A honeypot is a bait channel that real members have no reason to post in:
 * visible, locked, and named so the warning is unmissable. Compromised accounts
 * running scam spam blast every channel they can see, so they trip the trap
 * before they reach the channels people actually read.
 *
 * On a trip the offender is permanently banned and their recent messages are
 * purged server-wide. Decided in the server on 2026-09-17: the point of the
 * trap is to get the account off the server, and a recovered account is dealt
 * with by unbanning it by hand. An earlier revision softbanned (ban, then
 * immediate unban) so an accidental trip could rejoin; that was rejected in
 * favour of removal.
 *
 * Because the action is irreversible, the mod-log embed carries the offender's
 * ID so a mod can undo it in one step.
 *
 * Deliberately a TypeScript constant rather than S3, an env var or a slash
 * command: a channel name changes about once a year, which is slower than the
 * release cycle, and admin-only slash command surface is the most-rejected
 * proposal on this project. Nothing here is a GitHub variable or secret — the
 * only setup is a Discord channel whose name matches CHANNEL_NAME.
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

    /** Discord audit-log reason for the ban. */
    BAN_REASON: 'Honeypot: posted in the trap channel',

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
        'Post anything and you are banned, permanently, and your last 24 hours of messages go with you. No warning, no second chance.',
        'Move along.',
    ].join('\n\n'),

    /** How far back to look for an existing notice before posting a new one. */
    NOTICE_SEARCH_LIMIT: 50,
} as const;
