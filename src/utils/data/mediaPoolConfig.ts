/**
 * Image pools behind the `booba?` and `booty?` chat commands, and the limits
 * for adding to them with `/mod media add`.
 */

/** The Rapi home server. The only server whose moderators manage these pools. */
export const MEDIA_HOME_GUILD_ID = '1054761356416528475';

export type MediaPoolName = 'booba' | 'booty';

export interface MediaPool {
    /** S3 prefix the chat command picks from (trailing slash included). */
    prefix: string;
    /** Last word of every file name in the pool, e.g. `anis_booty.gif`. */
    suffix: string;
    /** The chat command, for display. */
    label: string;
}

export const MEDIA_POOLS: Record<MediaPoolName, MediaPool> = {
    booba: { prefix: 'commands/booba/', suffix: 'oppai', label: 'booba?' },
    booty: { prefix: 'commands/booty/', suffix: 'booty', label: 'booty?' },
};

/** Largest accepted upload, in bytes. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Give up on downloading the attachment from Discord after this long. */
export const DOWNLOAD_TIMEOUT_MS = 20_000;

/** Longest `variant` text accepted (e.g. a skin name). */
export const MAX_VARIANT_LENGTH = 40;
