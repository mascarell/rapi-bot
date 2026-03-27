import { pgTable, serial, varchar, text, boolean, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const gachaSubscriptions = pgTable('gacha_subscriptions', {
    id: serial('id').primaryKey(),
    discordId: varchar('discord_id', { length: 32 }).notNull(),
    gameId: varchar('game_id', { length: 32 }).notNull(),
    gameUserId: varchar('game_user_id', { length: 128 }).notNull(),
    mode: varchar('mode', { length: 32 }).notNull(),
    subscribedAt: timestamp('subscribed_at', { withTimezone: true }).notNull().defaultNow(),
    redeemedCodes: text('redeemed_codes').array().notNull().default([]),
    ignoredCodes: text('ignored_codes').array().notNull().default([]),
    lastNotified: timestamp('last_notified', { withTimezone: true }),
    lastForceRerun: timestamp('last_force_rerun', { withTimezone: true }),
    totalRedemptions: integer('total_redemptions').notNull().default(0),
    dmDisabled: boolean('dm_disabled').notNull().default(false),
    dmDisabledAt: timestamp('dm_disabled_at', { withTimezone: true }),
    prefExpirationWarnings: boolean('pref_expiration_warnings').notNull().default(true),
    prefWeeklyDigest: boolean('pref_weekly_digest').notNull().default(true),
    prefNewCodeAlerts: boolean('pref_new_code_alerts').notNull().default(true),
}, (table) => [
    uniqueIndex('uq_sub_discord_game').on(table.discordId, table.gameId),
    index('idx_subs_game_mode').on(table.gameId, table.mode),
    index('idx_subs_discord_id').on(table.discordId),
]);
