import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getReactionConfirmationService, CONFIRMATION_EMOJIS } from '../reactionConfirmationService';
import { Embed } from 'discord.js';

// Mock dependencies
vi.mock('../gachaDataService', () => ({
    getGachaDataService: vi.fn(() => ({
        markCodesRedeemed: vi.fn().mockResolvedValue(true),
        addIgnoredCode: vi.fn().mockResolvedValue(true),
        removeRedeemedCode: vi.fn().mockResolvedValue(true),
        removeIgnoredCode: vi.fn().mockResolvedValue(true),
    })),
}));

vi.mock('../../utils/data/gachaGamesConfig', () => ({
    GACHA_GAMES: {
        'bd2': {
            id: 'bd2',
            name: 'Brown Dust 2',
            shortName: 'BD2',
            supportsAutoRedeem: true,
        },
        'lost-sword': {
            id: 'lost-sword',
            name: 'Lost Sword',
            shortName: 'LS',
            supportsAutoRedeem: false,
        },
    },
    getGameConfig: vi.fn((gameId: string) => ({
        id: gameId,
        name: gameId === 'bd2' ? 'Brown Dust 2' : 'Lost Sword',
        shortName: gameId === 'bd2' ? 'BD2' : 'LS',
        supportsAutoRedeem: gameId === 'bd2',
    })),
}));

/**
 * Create a mock embed for testing
 */
function createMockEmbed(title: string, codeValue: string | null): Partial<Embed> {
    return {
        title,
        fields: codeValue ? [{ name: 'Code', value: codeValue, inline: true }] : [],
    };
}

describe('ReactionConfirmationService', () => {
    let service: ReturnType<typeof getReactionConfirmationService>;

    beforeEach(() => {
        service = getReactionConfirmationService();
    });

    describe('CONFIRMATION_EMOJIS', () => {
        it('should have correct emoji values', () => {
            expect(CONFIRMATION_EMOJIS.REDEEMED).toBe('✅');
            expect(CONFIRMATION_EMOJIS.IGNORE).toBe('❌');
            expect(CONFIRMATION_EMOJIS.RESET).toBe('🔄');
        });
    });

    describe('parseEmbedContent', () => {
        it('should parse game and code from new code notification embed', () => {
            const embed = createMockEmbed('🆕 New LS Coupon Code!', '`TESTCODE123`');
            const result = service.parseEmbedContent(embed as Embed);

            expect(result).not.toBeNull();
            expect(result?.gameId).toBe('lost-sword');
            expect(result?.code).toBe('TESTCODE123');
        });

        it('should parse game and code from expiration warning embed', () => {
            const embed = createMockEmbed('⚠️ LS Code Expiring Soon!', '`EXPIRINGCODE`');
            const result = service.parseEmbedContent(embed as Embed);

            expect(result).not.toBeNull();
            expect(result?.gameId).toBe('lost-sword');
            expect(result?.code).toBe('EXPIRINGCODE');
        });

        it('should handle code without backticks', () => {
            const embed = createMockEmbed('🆕 New LS Coupon Code!', 'PLAINCODE');
            const result = service.parseEmbedContent(embed as Embed);

            expect(result).not.toBeNull();
            expect(result?.code).toBe('PLAINCODE');
        });

        it('should return null when Code field is missing', () => {
            const embed = createMockEmbed('🆕 New LS Coupon Code!', null);
            const result = service.parseEmbedContent(embed as Embed);

            expect(result).toBeNull();
        });

        it('should return null when game shortName not found in title', () => {
            const embed = createMockEmbed('Some Unknown Title', '`CODE123`');
            const result = service.parseEmbedContent(embed as Embed);

            expect(result).toBeNull();
        });

        it('should return null when title is empty', () => {
            const embed = {
                title: null,
                fields: [{ name: 'Code', value: '`CODE123`', inline: true }],
            };
            const result = service.parseEmbedContent(embed as Embed);

            expect(result).toBeNull();
        });

        it('should work with BD2 embeds', () => {
            const embed = createMockEmbed('🆕 New BD2 Coupon Code!', '`BD2CODE`');
            const result = service.parseEmbedContent(embed as Embed);

            expect(result).not.toBeNull();
            expect(result?.gameId).toBe('bd2');
            expect(result?.code).toBe('BD2CODE');
        });
    });

    describe('buildFooterText', () => {
        it('should build clean footer text with game name', () => {
            const result = service.buildFooterText('Gacha Coupon System', 'lost-sword');

            expect(result).toBe('Gacha Coupon System • Lost Sword');
        });

        it('should work with different games', () => {
            const result = service.buildFooterText('Gacha Coupon System', 'bd2');

            expect(result).toBe('Gacha Coupon System • Brown Dust 2');
        });
    });

    describe('supportsReactionConfirmation', () => {
        it('should return true for games without auto-redeem', () => {
            const result = service.supportsReactionConfirmation('lost-sword');

            expect(result).toBe(true);
        });

        it('should return false for games with auto-redeem', () => {
            const result = service.supportsReactionConfirmation('bd2');

            expect(result).toBe(false);
        });
    });

    describe('getReactionInstructions', () => {
        it('should return instructions string with all emojis', () => {
            const result = service.getReactionInstructions();

            expect(result).toContain('✅');
            expect(result).toContain('❌');
            expect(result).toContain('🔄');
            expect(result).toContain('redeemed');
            expect(result).toContain('Ignore');
            expect(result).toContain('Reset');
        });
    });
});
