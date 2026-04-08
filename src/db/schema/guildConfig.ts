import { pgTable, serial, varchar, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const guildConfig = pgTable('guild_config', {
    id: serial('id').primaryKey(),
    configKey: varchar('config_key', { length: 64 }).notNull().unique(),
    allowedGuildIds: text('allowed_guild_ids').array().notNull().default([]),
    rulesGuildId: varchar('rules_guild_id', { length: 32 }),
    rulesChannelId: varchar('rules_channel_id', { length: 32 }),
    rulesMessageId: varchar('rules_message_id', { length: 32 }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const channelMonitors = pgTable('channel_monitors', {
    id: serial('id').primaryKey(),
    gameId: varchar('game_id', { length: 32 }).notNull().unique(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    prodChannelId: varchar('prod_channel_id', { length: 32 }).notNull(),
    devChannelId: varchar('dev_channel_id', { length: 32 }).notNull(),
});
