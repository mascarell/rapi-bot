/**
 * Configuration for the Rapi Radio voice playback.
 *
 * The radio is one voice channel in one guild. It used to be started by looping
 * every guild the bot is in and asking each one for a hardcoded channel ID,
 * which is wasted work in the hundreds of servers that will never have it, and
 * silently did nothing if the ID ever changed. Both the guild and the channel
 * are named here instead, with a name fallback inside that guild only.
 */

export const RADIO_CONFIG = {
    /** The guild that hosts the radio (Loot and Waifus). */
    GUILD_ID: '1054761356416528475',

    /** Voice channel to join. Checked first, before NAME_FALLBACK. */
    VOICE_CHANNEL_ID: '1229441264718577734',

    /**
     * Used when VOICE_CHANNEL_ID no longer resolves — a channel deleted and
     * recreated gets a new ID, which previously killed the radio silently.
     * Looked up inside GUILD_ID only, never across other guilds.
     */
    NAME_FALLBACK: 'rapi-radio',

    /** Folder holding the tracks. Relative to the container WORKDIR (/app). */
    FOLDER_PATH: './src/radio',

    SUPPORTED_AUDIO_EXTENSIONS: ['.mp3', '.opus', '.ogg', '.wav', '.flac', '.m4a'],

    /** How long to wait for the connection to report Ready before retrying. */
    READY_TIMEOUT_MS: 30_000,

    /**
     * Window allowed for Discord's own resume after a Disconnected event. A
     * voice region move routinely takes longer than the 5s the previous code
     * allowed, after which it gave up permanently.
     */
    RESUME_TIMEOUT_MS: 10_000,

    /** Exponential backoff between reconnect attempts. Retries forever. */
    RECONNECT_BASE_DELAY_MS: 5_000,
    RECONNECT_MAX_DELAY_MS: 5 * 60 * 1000,

    /**
     * Periodic check that playback is actually progressing. An AudioPlayer can
     * sit Idle after a resource error without a further event to wake it, and
     * the bot is unattended, so nobody would notice.
     */
    STALL_CHECK_INTERVAL_MS: 60_000,

    /**
     * Shuffle the playlist on load. Without it the same 83 files play in the
     * same alphabetical order after every restart, which is not much of a
     * radio. Set false to go back to fixed order.
     */
    SHUFFLE: true,
} as const;
