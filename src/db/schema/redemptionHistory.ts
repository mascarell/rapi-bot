import { pgTable, serial, varchar, boolean, timestamp, index } from 'drizzle-orm/pg-core';

export const redemptionHistory = pgTable('redemption_history', {
    id: serial('id').primaryKey(),
    discordId: varchar('discord_id', { length: 32 }).notNull(),
    gameId: varchar('game_id', { length: 32 }).notNull(),
    code: varchar('code', { length: 64 }).notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
    success: boolean('success').notNull(),
    errorCode: varchar('error_code', { length: 64 }),
    method: varchar('method', { length: 16 }).notNull(),
}, (table) => [
    index('idx_redemption_user_game').on(table.discordId, table.gameId, table.timestamp),
    index('idx_redemption_code').on(table.gameId, table.code, table.timestamp),
    index('idx_redemption_cleanup').on(table.timestamp),
]);
