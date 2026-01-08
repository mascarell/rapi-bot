import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getReactionConfirmationService, CONFIRMATION_EMOJIS } from '../reactionConfirmationService';

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
            supportsAutoRedeem: true,
        },
        'lost-sword': {
            id: 'lost-sword',
            name: 'Lost Sword',
            supportsAutoRedeem: false,
        },
    },
    getGameConfig: vi.fn((gameId: string) => ({
        id: gameId,
        name: gameId === 'bd2' ? 'Brown Dust 2' : 'Lost Sword',
        supportsAutoRedeem: gameId === 'bd2',
    })),
}));

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

    describe('createMetadata', () => {
        it('should create metadata string in correct format', () => {
            const result = service.createMetadata('lost-sword', 'TESTCODE123');

            expect(result).toBe('GAMEDATA:lost-sword:TESTCODE123');
        });

        it('should work with different game IDs', () => {
            const result = service.createMetadata('bd2', 'BD2CODE');

            expect(result).toBe('GAMEDATA:bd2:BD2CODE');
        });
    });

    describe('parseMetadata', () => {
        it('should parse metadata from footer text', () => {
            const footerText = 'Gacha Coupon System | GAMEDATA:lost-sword:TESTCODE123';
            const result = service.parseMetadata(footerText);

            expect(result).not.toBeNull();
            expect(result?.gameId).toBe('lost-sword');
            expect(result?.code).toBe('TESTCODE123');
        });

        it('should return null for footer without metadata', () => {
            const footerText = 'Gacha Coupon System';
            const result = service.parseMetadata(footerText);

            expect(result).toBeNull();
        });

        it('should return null for invalid game ID in metadata', () => {
            const footerText = 'Gacha Coupon System | GAMEDATA:invalid-game:CODE';
            const result = service.parseMetadata(footerText);

            expect(result).toBeNull();
        });

        it('should handle metadata at different positions in footer', () => {
            const footerText = 'GAMEDATA:lost-sword:CODE | Some other text';
            const result = service.parseMetadata(footerText);

            expect(result).not.toBeNull();
            expect(result?.gameId).toBe('lost-sword');
            expect(result?.code).toBe('CODE');
        });
    });

    describe('buildFooterText', () => {
        it('should build footer text with metadata', () => {
            const result = service.buildFooterText('Gacha Coupon System', 'lost-sword', 'CODE123');

            expect(result).toBe('Gacha Coupon System | GAMEDATA:lost-sword:CODE123');
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

    describe('Metadata round-trip', () => {
        it('should correctly round-trip metadata creation and parsing', () => {
            const gameId = 'lost-sword';
            const code = 'ROUNDTRIP123';

            const footerText = service.buildFooterText('Gacha Coupon System', gameId, code);
            const parsed = service.parseMetadata(footerText);

            expect(parsed).not.toBeNull();
            expect(parsed?.gameId).toBe(gameId);
            expect(parsed?.code).toBe(code);
        });
    });
});
