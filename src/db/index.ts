import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';
import { logger } from '../utils/logger.js';

let pool: pg.Pool | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

/**
 * Get or create the database connection pool and Drizzle instance.
 * Returns null if DATABASE_URL is not configured (S3-only mode).
 */
export function getDb() {
    if (dbInstance) return dbInstance;

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) return null;

    pool = new pg.Pool({
        connectionString,
        max: 10,
        idleTimeoutMillis: 30000,
    });

    pool.on('error', (err) => {
        logger.error`[DB] Unexpected pool error: ${err}`;
    });

    dbInstance = drizzle(pool, { schema });
    logger.info`[DB] PostgreSQL connection pool initialized`;
    return dbInstance;
}

export type DB = NonNullable<ReturnType<typeof getDb>>;

/**
 * Gracefully close the database connection pool.
 */
export async function closeDb(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
        dbInstance = null;
        logger.info`[DB] PostgreSQL connection pool closed`;
    }
}
