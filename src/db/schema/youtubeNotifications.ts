import { pgTable, serial, varchar, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const youtubeGuildNotifications = pgTable('youtube_guild_notifications', {
    id: serial('id').primaryKey(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    channelId: varchar('channel_id', { length: 32 }).notNull(),
}, (table) => [
    uniqueIndex('uq_youtube_guild_channel').on(table.guildId, table.channelId),
]);

export const youtubeMonitoredChannels = pgTable('youtube_monitored_channels', {
    id: serial('id').primaryKey(),
    channelId: varchar('channel_id', { length: 64 }).notNull().unique(),
    discordUserId: varchar('discord_user_id', { length: 32 }).notNull(),
    lastSeenVideoId: varchar('last_seen_video_id', { length: 64 }),
    recentVideoIds: text('recent_video_ids').array().notNull().default([]),
    lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
});
