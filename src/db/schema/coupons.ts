import { pgTable, serial, varchar, text, boolean, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const coupons = pgTable('coupons', {
    id: serial('id').primaryKey(),
    gameId: varchar('game_id', { length: 32 }).notNull(),
    code: varchar('code', { length: 64 }).notNull(),
    rewards: text('rewards').notNull(),
    expirationDate: timestamp('expiration_date', { withTimezone: true }),
    addedBy: varchar('added_by', { length: 32 }).notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
    isActive: boolean('is_active').notNull().default(true),
    source: varchar('source', { length: 128 }),
    redemptionCount: integer('redemption_count').notNull().default(0),
    regions: text('regions').array(),
    tags: text('tags').array(),
}, (table) => [
    uniqueIndex('uq_coupon_game_code').on(table.gameId, table.code),
    index('idx_coupons_active').on(table.gameId, table.isActive),
    index('idx_coupons_expiration').on(table.gameId, table.expirationDate),
    index('idx_coupons_added_at').on(table.gameId, table.addedAt),
]);
