export type GiveawayStatus = 'active' | 'ended' | 'cancelled';

export type EndConditionType = 'manual' | 'scheduled' | 'entry_count';

export interface GiveawayEntry {
    discordId: string;
    enteredAt: string;
    username: string;
}

export interface GiveawayWinner {
    discordId: string;
    giveawayId: string;
    wonAt: string;
    prizeName: string;
    notified: boolean;
    notifiedAt?: string;
}

export interface EndCondition {
    type: EndConditionType;
    scheduledEndTime?: string;
    maxEntries?: number;
}

export interface Giveaway {
    id: string;
    guildId: string;
    createdBy: string;
    createdAt: string;
    title: string;
    description: string;
    prizeName: string;
    status: GiveawayStatus;
    entries: GiveawayEntry[];
    winnerId?: string;
    endConditions: EndCondition[];
    endedAt?: string;
    endedBy?: string;
    wheelUrl?: string;
    wheelSpunAt?: string;
    modChannelId?: string;
}

export interface UserGiveawayStats {
    discordId: string;
    totalEntered: number;
    totalWon: number;
    wins: Array<{
        giveawayId: string;
        prizeName: string;
        wonAt: string;
    }>;
    lastEnteredAt?: string;
}

export interface GiveawayData {
    giveaways: Giveaway[];
    winners: GiveawayWinner[];
    userStats: UserGiveawayStats[];
    lastUpdated: string;
    schemaVersion: number;
}
