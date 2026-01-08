import { GachaGameConfig, GachaGameId } from '../interfaces/GachaCoupon.interface';

const cdnDomainUrl = process.env.CDN_DOMAIN_URL || '';

/**
 * Registry of supported gacha games for coupon redemption
 *
 * To add a new game:
 * 1. Add the game ID to GachaGameId type in GachaCoupon.interface.ts
 * 2. Add the game configuration below
 * 3. If the game supports auto-redemption, implement the redemption logic in the redemption service
 */
export const GACHA_GAMES: Record<GachaGameId, GachaGameConfig> = {
    'bd2': {
        id: 'bd2',
        name: 'Brown Dust 2',
        shortName: 'BD2',
        apiEndpoint: 'https://api.thebd2pulse.com/redeem/coupon',
        apiConfig: {
            appId: 'bd2-live',
            method: 'POST',
        },
        manualRedeemUrl: 'https://redeem.bd2.pmang.cloud/bd2/index.html?lang=en-US',
        supportsAutoRedeem: true,
        logoPath: `${cdnDomainUrl}/assets/logos/brown-dust-2-logo.png`,
        embedColor: 0x8B4513,
        maxNicknameLength: 24,
        maxCodeLength: 30,
        userIdFieldName: 'nickname',
        requiresUserId: true,
    },
    'lost-sword': {
        id: 'lost-sword',
        name: 'Lost Sword',
        shortName: 'LS',
        // Lost Sword uses in-game redemption only (Settings > Account > Redeem Coupon)
        manualRedeemUrl: undefined,
        supportsAutoRedeem: false,
        logoPath: `${cdnDomainUrl}/assets/logos/lost-sword-logo.png`,
        embedColor: 0x8B4513, // Brown/sword color
        maxNicknameLength: 20,
        maxCodeLength: 20,
        userIdFieldName: 'Account ID',
        requiresUserId: false,
        hasChannelMonitor: true,
        parsePatterns: {
            // Match both formats:
            // Simple: "📌 Coupon Code\nCODE123"
            // Discord: "> **📌 Coupon Code**\n> `CODE123`"
            code: /\*{0,2}📌\s*Coupon Code\*{0,2}\s*\n(?:>\s*)?`?([A-Z0-9]+)`?/i,
            // Match rewards (handles both simple and Discord formatted)
            rewards: /\*{0,2}📌\s*Rewards\*{0,2}\s*\n(?:>\s*)?-?\s*(.+?)(?=\n(?:>\s*)?\n|\n(?:>\s*)?\*{0,2}📌|$)/s,
            // Match expiration date (handles both formats)
            expiration: /\*{0,2}📌\s*Redemption Period\*{0,2}\s*\n(?:>\s*)?-?\s*Until\s+(.+)/i,
        },
    },
    // TODO: Implement NIKKE support later
    // 'nikke': {
    //     id: 'nikke',
    //     name: 'GODDESS OF VICTORY: NIKKE',
    //     shortName: 'NIKKE',
    //     // NIKKE uses in-game redemption only (no web API)
    //     manualRedeemUrl: undefined,
    //     supportsAutoRedeem: false,
    //     logoPath: `${cdnDomainUrl}/assets/logos/nikke-logo.png`,
    //     embedColor: 0x3498DB,
    //     maxNicknameLength: 20,
    //     maxCodeLength: 30,
    //     userIdFieldName: 'UID',
    // },
    // TODO: Implement Blue Archive support later
    // 'blue-archive': {
    //     id: 'blue-archive',
    //     name: 'Blue Archive',
    //     shortName: 'BA',
    //     // Blue Archive uses in-game redemption only
    //     manualRedeemUrl: undefined,
    //     supportsAutoRedeem: false,
    //     logoPath: `${cdnDomainUrl}/assets/logos/blue-archive-logo.png`,
    //     embedColor: 0x00BFFF,
    //     maxNicknameLength: 20,
    //     maxCodeLength: 30,
    //     userIdFieldName: 'UID',
    // },
};

/**
 * Get a game configuration by ID
 */
export function getGameConfig(gameId: GachaGameId): GachaGameConfig {
    const config = GACHA_GAMES[gameId];
    if (!config) {
        throw new Error(`Unknown game ID: ${gameId}`);
    }
    return config;
}

/**
 * Get all supported game IDs
 */
export function getSupportedGameIds(): GachaGameId[] {
    return Object.keys(GACHA_GAMES) as GachaGameId[];
}

/**
 * Get games that support auto-redemption
 */
export function getAutoRedeemGames(): GachaGameConfig[] {
    return Object.values(GACHA_GAMES).filter(g => g.supportsAutoRedeem);
}

/**
 * Check if a game ID is valid
 */
export function isValidGameId(gameId: string): gameId is GachaGameId {
    return gameId in GACHA_GAMES;
}
