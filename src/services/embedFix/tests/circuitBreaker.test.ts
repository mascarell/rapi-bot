import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock the config before importing
vi.mock('../../../utils/data/embedFixConfig', () => ({
    EMBED_FIX_CONFIG: {
        CIRCUIT_BREAKER_THRESHOLD: 3,
        CIRCUIT_BREAKER_TIMEOUT: 1000, // 1 second for testing
    },
}));

// Import after mocking
import { circuitBreaker } from '../circuitBreaker';

describe('CircuitBreaker', () => {
    beforeEach(() => {
        circuitBreaker.reset();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('isOpen', () => {
        it('should return false for new platform', () => {
            expect(circuitBreaker.isOpen('twitter')).toBe(false);
        });

        it('should return false when failures below threshold', () => {
            circuitBreaker.recordFailure('twitter');
            circuitBreaker.recordFailure('twitter');
            expect(circuitBreaker.isOpen('twitter')).toBe(false);
        });

        it('should return true when failures reach threshold', () => {
            circuitBreaker.recordFailure('twitter');
            circuitBreaker.recordFailure('twitter');
            circuitBreaker.recordFailure('twitter');
            expect(circuitBreaker.isOpen('twitter')).toBe(true);
        });

        it('should return false after timeout (half-open state)', () => {
            // Open the circuit
            circuitBreaker.recordFailure('twitter');
            circuitBreaker.recordFailure('twitter');
            circuitBreaker.recordFailure('twitter');
            expect(circuitBreaker.isOpen('twitter')).toBe(true);

            // Advance past timeout
            vi.advanceTimersByTime(1100);

            // Should be half-open now
            expect(circuitBreaker.isOpen('twitter')).toBe(false);
        });
    });

    describe('recordSuccess', () => {
        it('should reset failures', () => {
            circuitBreaker.recordFailure('twitter');
            circuitBreaker.recordFailure('twitter');
            circuitBreaker.recordSuccess('twitter');

            const state = circuitBreaker.getState('twitter');
            expect(state?.failures).toBe(0);
            expect(state?.isOpen).toBe(false);
        });

        it('should close the circuit after being open', () => {
            // Open the circuit
            circuitBreaker.recordFailure('twitter');
            circuitBreaker.recordFailure('twitter');
            circuitBreaker.recordFailure('twitter');
            expect(circuitBreaker.isOpen('twitter')).toBe(true);

            // Wait for half-open state
            vi.advanceTimersByTime(1100);
            expect(circuitBreaker.isOpen('twitter')).toBe(false);

            // Success closes the circuit
            circuitBreaker.recordSuccess('twitter');
            expect(circuitBreaker.isOpen('twitter')).toBe(false);

            const state = circuitBreaker.getState('twitter');
            expect(state?.failures).toBe(0);
        });
    });

    describe('recordFailure', () => {
        it('should increment failure count', () => {
            circuitBreaker.recordFailure('twitter');
            const state = circuitBreaker.getState('twitter');
            expect(state?.failures).toBe(1);
        });

        it('should open circuit at threshold', () => {
            circuitBreaker.recordFailure('twitter');
            circuitBreaker.recordFailure('twitter');
            circuitBreaker.recordFailure('twitter');

            const state = circuitBreaker.getState('twitter');
            expect(state?.isOpen).toBe(true);
            expect(state?.openUntil).toBeGreaterThan(Date.now());
        });
    });

    describe('platform isolation', () => {
        it('should track platforms independently', () => {
            circuitBreaker.recordFailure('twitter');
            circuitBreaker.recordFailure('twitter');
            circuitBreaker.recordFailure('twitter');

            expect(circuitBreaker.isOpen('twitter')).toBe(true);
            expect(circuitBreaker.isOpen('pixiv')).toBe(false);
        });
    });

    describe('resetPlatform', () => {
        it('should reset a specific platform', () => {
            circuitBreaker.recordFailure('twitter');
            circuitBreaker.recordFailure('twitter');
            circuitBreaker.recordFailure('pixiv');

            circuitBreaker.resetPlatform('twitter');

            expect(circuitBreaker.getState('twitter')).toBeUndefined();
            expect(circuitBreaker.getState('pixiv')).toBeDefined();
        });
    });

    describe('reset', () => {
        it('should reset all platforms', () => {
            circuitBreaker.recordFailure('twitter');
            circuitBreaker.recordFailure('pixiv');
            circuitBreaker.recordFailure('instagram');

            circuitBreaker.reset();

            expect(circuitBreaker.getState('twitter')).toBeUndefined();
            expect(circuitBreaker.getState('pixiv')).toBeUndefined();
            expect(circuitBreaker.getState('instagram')).toBeUndefined();
        });
    });
});
