import { GameAssetProvider } from '../types.js';
import { NikkeAssetProvider } from './nikkeAssetProvider.js';

/**
 * Registry of all game asset providers.
 * To add a new game, create a provider class and add it here.
 */
export function getAllProviders(): GameAssetProvider[] {
    return [
        new NikkeAssetProvider(),
    ];
}

export { NikkeAssetProvider };
