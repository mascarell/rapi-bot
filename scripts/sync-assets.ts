#!/usr/bin/env bun
/**
 * Manual asset sync script.
 *
 * Usage:
 *   bun run scripts/sync-assets.ts                      # incremental, all games
 *   bun run scripts/sync-assets.ts --full                # full re-sync, all games
 *   bun run scripts/sync-assets.ts --game nikke          # specific game
 *   bun run scripts/sync-assets.ts --full --game nikke   # full re-sync, specific game
 */

import 'dotenv/config';
import { getAssetSyncService } from '../src/services/assetSync/index.js';

const args = process.argv.slice(2);
const isFull = args.includes('--full');
const gameIdx = args.indexOf('--game');
const gameId = gameIdx !== -1 ? args[gameIdx + 1] : undefined;
const mode = isFull ? 'full' : 'incremental';

async function main() {
    console.log(`\n=== Asset Sync (${mode}) ===\n`);

    const service = getAssetSyncService();

    if (gameId) {
        console.log(`Syncing game: ${gameId} (${mode})\n`);
        const result = await service.syncGameById(gameId, mode);
        console.log(`\nResults for ${result.gameId}:`);
        console.log(`  Synced:  ${result.synced}`);
        console.log(`  Skipped: ${result.skipped}`);
        console.log(`  Failed:  ${result.failed}`);
        console.log(`  Duration: ${result.duration}ms`);

        if (result.errors.length > 0) {
            console.log(`\nErrors:`);
            for (const err of result.errors) {
                console.log(`  - ${err.name}: ${err.error}`);
            }
        }
    } else {
        console.log(`Syncing all registered games (${mode})\n`);
        const result = await service.syncAll(mode);

        for (const gameResult of result.results) {
            console.log(`${gameResult.gameId}: synced=${gameResult.synced} skipped=${gameResult.skipped} failed=${gameResult.failed} (${gameResult.duration}ms)`);
        }

        console.log(`\nTotal: synced=${result.totalSynced} skipped=${result.totalSkipped} failed=${result.totalFailed}`);
    }

    console.log('\nDone.');
    process.exit(0);
}

main().catch(err => {
    console.error('Sync failed:', err);
    process.exit(1);
});
