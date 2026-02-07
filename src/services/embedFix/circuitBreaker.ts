/**
 * Circuit breaker for external API calls
 * Prevents hammering failing APIs by temporarily disabling requests
 */

import { EMBED_FIX_CONFIG } from '../../utils/data/embedFixConfig';
import { CircuitBreakerState, EmbedPlatform } from '../../utils/interfaces/EmbedFix.interface';
import { embedFixLogger } from '../../utils/logger.js';

class CircuitBreaker {
    private states: Map<EmbedPlatform, CircuitBreakerState> = new Map();

    /**
     * Check if the circuit is open (API disabled) for a platform
     * @param platform The platform to check
     * @returns true if circuit is open (should NOT make requests)
     */
    isOpen(platform: EmbedPlatform): boolean {
        const state = this.states.get(platform);

        if (!state) {
            return false;
        }

        if (!state.isOpen) {
            return false;
        }

        // Check if cooldown period has passed
        if (Date.now() >= state.openUntil) {
            // Reset to half-open state (allow one request to test)
            state.isOpen = false;
            state.failures = 0;
            embedFixLogger.debug`Circuit for ${platform} is now half-open, allowing test request`;
            return false;
        }

        return true;
    }

    /**
     * Record a successful API call
     * @param platform The platform
     */
    recordSuccess(platform: EmbedPlatform): void {
        const state = this.states.get(platform);

        if (state) {
            // Reset failures on success
            state.failures = 0;
            state.isOpen = false;
        }
    }

    /**
     * Record a failed API call
     * @param platform The platform
     */
    recordFailure(platform: EmbedPlatform): void {
        let state = this.states.get(platform);

        if (!state) {
            state = {
                failures: 0,
                lastFailure: 0,
                isOpen: false,
                openUntil: 0,
            };
            this.states.set(platform, state);
        }

        const now = Date.now();
        state.failures++;
        state.lastFailure = now;

        // Check if we should open the circuit
        if (state.failures >= EMBED_FIX_CONFIG.CIRCUIT_BREAKER_THRESHOLD) {
            state.isOpen = true;
            state.openUntil = now + EMBED_FIX_CONFIG.CIRCUIT_BREAKER_TIMEOUT;
            embedFixLogger.warn`Circuit for ${platform} is now OPEN until ${new Date(state.openUntil).toISOString()}`;
        }
    }

    /**
     * Get the current state for a platform (for debugging)
     * @param platform The platform
     */
    getState(platform: EmbedPlatform): CircuitBreakerState | undefined {
        return this.states.get(platform);
    }

    /**
     * Reset all circuit breakers (for testing)
     */
    reset(): void {
        this.states.clear();
    }

    /**
     * Reset a specific platform's circuit breaker
     * @param platform The platform to reset
     */
    resetPlatform(platform: EmbedPlatform): void {
        this.states.delete(platform);
    }
}

// Export singleton instance
export const circuitBreaker = new CircuitBreaker();
