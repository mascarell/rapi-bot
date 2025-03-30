export interface GachaGameConfig {
    rates: Record<string, number>;
    rarities: Record<string, {
        color: string;
        footerText: string;
    }>;
}

export interface PullResult {
    rarity: string;
    name: string;
    imageUrl: string;
} 