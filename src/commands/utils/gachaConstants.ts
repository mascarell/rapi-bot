export const CONSTANTS = {
    cdnDomainUrl: process.env.CDN_DOMAIN_URL as string,
    rateLimit: {
        maxPulls: 20,
        windowMs: 300000, // 5 minutes
        cleanupIntervalMs: 600000 // 10 minutes
    },
    pagination: {
        timeoutMs: 900000 // 15 minutes
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