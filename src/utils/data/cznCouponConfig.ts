import { CommonRedemptionError } from '../interfaces/GachaCoupon.interface.js';

/**
 * Chaos Zero Nightmare coupon redemption, as exposed by STOVE.
 *
 * `POST https://api.onstove.com/pub-comm/v1.0/common/coupons` with
 * `{coupon_no, game_code, game_id, lang_code, guid, nick_name, world_id}`.
 * No auth, no cookie, no CSRF token, no captcha — the page's "guest" toggle
 * issues no request at all, it only reveals the form. Verified 2026-10-10 with
 * plain curl and no browser-derived state.
 *
 * Responses are **always HTTP 200** and carry two layers:
 *
 *   outer `code !== 0`  -> a gateway/identity failure, e.g. -90009
 *   outer `code === 0`  -> read `value.result`, a STRING, where "000" is success
 *
 * So a naive `response.ok` check, or reading `value.result` as a number, both
 * report every failure as a success. Hence the explicit maps below.
 */

export const CZN_CONFIG = {
    /** STOVE's identifier for the game, sent as `game_code`. */
    GAME_CODE: 'STOVE_CHAOSZERO',
    /** Sent as `game_id`. */
    GAME_ID: 'czn',
    /** Controls the language of `value.message`, which we use as fallback text. */
    LANG_CODE: 'en',
    /** The only success value of `value.result`. */
    SUCCESS_RESULT: '000',
    /**
     * STOVE answers an invalid code with a running failure counter, and locks
     * coupon use for six hours once "multiple invalid attempts" accumulate
     * (result 5031). The threshold and whether it scopes per membership number
     * or per IP are both undocumented, so the bot must never retry a code that
     * came back invalid, and must stop offering it to other subscribers.
     */
    LOCKOUT_RESULT: '5031',
} as const;

/**
 * `value.result` -> our common error vocabulary.
 *
 * Strings taken from the redemption page's own i18n table, so this covers
 * cases we have not observed live as well as the four that were reproduced
 * (000 inferred, 5157, 5105, 5135).
 */
export const CZN_RESULT_ERRORS: Record<string, CommonRedemptionError> = {
    // Already redeemed
    '5157': 'AlreadyUsed', // "Can only be used once per character." (observed)
    '5125': 'AlreadyUsed', // "has already been used"
    '6033': 'AlreadyUsed', // already used another coupon from this group

    // Bad code
    '5105': 'InvalidCode', // "Invalid coupon code." (observed)

    // No longer redeemable
    '5135': 'ExpiredCode', // "This coupon has expired." (observed)
    '5130': 'ExpiredCode', // no longer valid
    '5161': 'ExpiredCode', // registration period expired

    // Capacity
    '5033': 'ExceededUses',
    '5155': 'ExceededUses',
    '6026': 'ExceededUses', // daily limit

    // Account / region problems that are not a wrong identity
    '5162': 'IncorrectUser', // region-restricted
    '5164': 'IncorrectUser', // wrong World

    // Lockout after repeated invalid attempts — six hours
    '5031': 'RateLimited',

    // Needs an action in-game first
    '6063': 'ValidationFailed', // must agree to the in-game ToS

    // Service state
    '6055': 'UnavailableCode', // cannot be registered at this time
    '6065': 'UnavailableCode', // game maintenance
    '999': 'Unknown', // system error
};

/**
 * Outer `code` -> our common error vocabulary, for gateway-level failures.
 */
export const CZN_OUTER_ERRORS: Record<string, CommonRedemptionError> = {
    // Membership number, nickname and world are validated together and a
    // mismatch in any one of them returns this, so the mapped message must not
    // claim to know which was wrong.
    '-90009': 'IncorrectUser',
    '-90003': 'UnavailableCode', // web maintenance
    '-90001': 'Unknown',
    '-90002': 'Unknown',
};

/**
 * Messages that override the generic ERROR_MESSAGES text, where CZN's failure
 * mode is specific enough to be worth saying out loud.
 */
export const CZN_ERROR_OVERRIDES: Partial<Record<string, string>> = {
    '5031':
        'Too many invalid codes were tried on this account — STOVE has locked ' +
        'coupon redemption for about 6 hours. Nothing to do but wait, Commander.',
    '6063':
        'You need to accept the in-game terms once before coupons can be ' +
        'redeemed. Log in, accept, then try again.',
    '5164':
        'That code is not valid on your selected server. Check the server on ' +
        'your subscription with `/redeem status game:czn`.',
    '5162': 'That code is restricted to a different region.',
};

/**
 * The `-90009` case covers three possible mistakes and the API does not say
 * which, so the user-facing text has to name all of them. STOVE also returns
 * this message in Korean regardless of `lang_code`, so we never pass it
 * through.
 */
export const CZN_IDENTITY_MISMATCH_MESSAGE =
    'STOVE did not recognise that account. Check your membership number, ' +
    'character nickname and server — all three have to match.';
