export const CONSTANTS = {
    CDN_URL: 'https://rapi-bot.sfo3.cdn.digitaloceanspaces.com',
    RATE_LIMIT: {
        MAX_PULLS: 20,
        WINDOW_MS: 300000, // 5 minutes
        CLEANUP_INTERVAL_MS: 600000 // 10 minutes
    },
    PAGINATION: {
        TIMEOUT_MS: 900000 // 15 minutes
    }
} as const;

export const GACHA_CONFIGS = {
    nikke: {
        rates: {
            "Pilgrim": 0.004,
            "SSR": 0.04,
            "SR": 0.455,
            "R": 0.501
        },
        rarities: {
            "Pilgrim": {
                color: "#FFA500",
                footerText: "A legendary find, Commander! Are we dreaming?"
            },
            "SSR": {
                color: "#FFD700",
                footerText: "Wow! A SSR? That's incredibly lucky, Commander!"
            },
            "SR": {
                color: "#800080",
                footerText: "An SR! You're on the right track, Commander!"
            },
            "R": {
                color: "#ADD8E6",
                footerText: "It's just an R, but every squad member counts!"
            }
        }
    }
} as const; 