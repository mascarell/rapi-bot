/**
 * Storage mode configuration for dual-write migration strategy.
 *
 * Each service transitions independently:
 * s3-only → dual-write-s3-primary → dual-write-pg-primary → pg-only
 *
 * Controlled via environment variables:
 *   STORAGE_MODE=s3-only              (global default)
 *   STORAGE_NOTIFICATIONS=pg-only     (per-service override)
 */

export type StorageMode = 's3-only' | 'dual-write-s3-primary' | 'dual-write-pg-primary' | 'pg-only';

const VALID_MODES: StorageMode[] = ['s3-only', 'dual-write-s3-primary', 'dual-write-pg-primary', 'pg-only'];

/**
 * Get the storage mode for a specific service.
 * Checks for per-service override first, then falls back to global default.
 *
 * @param service - Service identifier (e.g., 'notifications', 'gacha', 'votes', 'guild-config')
 */
export function getStorageMode(service: string): StorageMode {
    const envKey = `STORAGE_${service.toUpperCase().replace(/-/g, '_')}`;
    const serviceMode = process.env[envKey] as StorageMode | undefined;

    if (serviceMode && VALID_MODES.includes(serviceMode)) {
        return serviceMode;
    }

    const globalMode = process.env.STORAGE_MODE as StorageMode | undefined;
    if (globalMode && VALID_MODES.includes(globalMode)) {
        return globalMode;
    }

    return 's3-only';
}

/**
 * Check if Postgres reads are enabled for a service.
 */
export function isPgReadEnabled(service: string): boolean {
    const mode = getStorageMode(service);
    return mode === 'dual-write-pg-primary' || mode === 'pg-only';
}

/**
 * Check if Postgres writes are enabled for a service.
 */
export function isPgWriteEnabled(service: string): boolean {
    const mode = getStorageMode(service);
    return mode !== 's3-only';
}

/**
 * Check if S3 writes are enabled for a service.
 */
export function isS3WriteEnabled(service: string): boolean {
    const mode = getStorageMode(service);
    return mode !== 'pg-only';
}
