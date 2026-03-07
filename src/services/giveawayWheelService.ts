import { Giveaway } from '../utils/interfaces/Giveaway.interface.js';
import { GIVEAWAY_CONFIG } from '../utils/data/giveawayConfig.js';

export class GiveawayWheelService {
    private static instance: GiveawayWheelService;

    private constructor() {}

    public static getInstance(): GiveawayWheelService {
        if (!GiveawayWheelService.instance) {
            GiveawayWheelService.instance = new GiveawayWheelService();
        }
        return GiveawayWheelService.instance;
    }

    public generateWheelUrl(giveaway: Giveaway): string {
        if (giveaway.entries.length === 0) {
            throw new Error('Cannot generate wheel URL with no entries');
        }

        const entriesParam = giveaway.entries.map(e => e.username).join(',');
        return `${GIVEAWAY_CONFIG.WHEEL_BASE_URL}?entries=${encodeURIComponent(entriesParam)}`;
    }

    public getWheelInstructions(): string {
        return [
            '**How to use Wheel of Names:**',
            '1. Click the wheel URL to open it in your browser',
            '2. Click "Spin" on the website to select a random winner',
            '3. Once you have the winner, use `/giveaway select-winner` to officially select them',
            '4. The bot will notify the winner via DM and announce in the moderator channel',
        ].join('\n');
    }

    /** @internal Test helper */
    public static _testResetInstance(): void {
        GiveawayWheelService.instance = undefined as any;
    }
}

export const getGiveawayWheelService = (): GiveawayWheelService =>
    GiveawayWheelService.getInstance();
