import { pgTable, serial, varchar, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const notificationSubscriptions = pgTable('notification_subscriptions', {
    id: serial('id').primaryKey(),
    discordId: varchar('discord_id', { length: 32 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    notificationType: varchar('notification_type', { length: 128 }).notNull(),
    subscribedAt: timestamp('subscribed_at', { withTimezone: true }).notNull().defaultNow(),
    dmDisabled: boolean('dm_disabled').notNull().default(false),
    dmDisabledAt: timestamp('dm_disabled_at', { withTimezone: true }),
}, (table) => [
    uniqueIndex('uq_notif_discord_type').on(table.discordId, table.notificationType),
    index('idx_notif_type').on(table.notificationType),
    index('idx_notif_user').on(table.discordId),
]);
