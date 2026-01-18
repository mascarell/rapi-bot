import { Giveaway } from '../utils/interfaces/Giveaway.interface';
import { GIVEAWAY_CONFIG } from '../utils/data/giveawayConfig';

/**
 * Service for Wheel of Names integration
 * Generates shareable wheel URLs with participant names
 */
export class GiveawayWheelService {
    private static instance: GiveawayWheelService;

    private constructor() {}

    public static getInstance(): GiveawayWheelService {
        if (!GiveawayWheelService.instance) {
            GiveawayWheelService.instance = new GiveawayWheelService();
        }
        return GiveawayWheelService.instance;
    }

    /**
     * Generate Wheel of Names URL with all giveaway entries
     *
     * Wheel of Names URL format:
     * https://wheelofnames.com/?entries=Name1,Name2,Name3
     *
     * Note: Wheel of Names does not have a public API for automatic winner detection.
     * The workflow is:
     * 1. Generate wheel URL with all participant names
     * 2. Mod manually spins wheel on the website
     * 3. Mod uses /giveaway select-winner command to confirm winner
     */
    public generateWheelUrl(giveaway: Giveaway): string {
        if (giveaway.entries.length === 0) {
            throw new Error('Cannot generate wheel URL with no entries');
        }

        // Extract usernames from entries
        const entryNames = giveaway.entries.map(e => e.username);

        // Create comma-separated list and URL encode
        const entriesParam = entryNames.join(',');
        const encodedEntries = encodeURIComponent(entriesParam);

        // Generate wheel URL
        const wheelUrl = `${GIVEAWAY_CONFIG.WHEEL_BASE_URL}?entries=${encodedEntries}`;

        return wheelUrl;
    }

    /**
     * Get instructions for using the wheel
     */
    public getWheelInstructions(): string {
        return `
**How to use Wheel of Names:**
1. Click the wheel URL to open it in your browser
2. Click "Spin" on the website to select a random winner
3. Once you have the winner's name, use \`/giveaway select-winner\` to officially select them
4. The bot will notify the winner via DM and announce in the moderator channel
        `.trim();
    }

    /**
     * Validate that a username exists in the giveaway entries
     * Useful for manual winner selection
     */
    public validateWinnerExists(giveaway: Giveaway, username: string): boolean {
        return giveaway.entries.some(e =>
            e.username.toLowerCase() === username.toLowerCase()
        );
    }

    /**
     * Find Discord ID by username in giveaway entries
     */
    public findDiscordIdByUsername(giveaway: Giveaway, username: string): string | null {
        const entry = giveaway.entries.find(e =>
            e.username.toLowerCase() === username.toLowerCase()
        );
        return entry?.discordId || null;
    }
}

/**
 * Get the singleton instance of GiveawayWheelService
 */
export const getGiveawayWheelService = (): GiveawayWheelService =>
    GiveawayWheelService.getInstance();
