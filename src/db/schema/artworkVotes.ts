import { pgTable, serial, varchar, text, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const artworkVotes = pgTable('artwork_votes', {
    id: serial('id').primaryKey(),
    artworkId: varchar('artwork_id', { length: 256 }).notNull().unique(),
    originalUrl: text('original_url').notNull(),
    platform: varchar('platform', { length: 32 }).notNull(),
    artistUsername: varchar('artist_username', { length: 128 }).notNull(),
    artistName: varchar('artist_name', { length: 256 }).notNull(),
    globalVoteCount: integer('global_vote_count').notNull().default(0),
    firstSharedAt: timestamp('first_shared_at', { withTimezone: true }).notNull().defaultNow(),
    lastVotedAt: timestamp('last_voted_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_artwork_platform').on(table.platform),
    index('idx_artwork_global_votes').on(table.globalVoteCount),
]);

export const guildArtworkVotes = pgTable('guild_artwork_votes', {
    id: serial('id').primaryKey(),
    artworkId: varchar('artwork_id', { length: 256 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    voters: text('voters').array().notNull().default([]),
    voteCount: integer('vote_count').notNull().default(0),
    sharedBy: varchar('shared_by', { length: 32 }).notNull(),
    sharedAt: timestamp('shared_at', { withTimezone: true }).notNull().defaultNow(),
    messageId: varchar('message_id', { length: 32 }).notNull(),
    channelId: varchar('channel_id', { length: 32 }).notNull(),
}, (table) => [
    uniqueIndex('uq_guild_artwork').on(table.artworkId, table.guildId),
    index('idx_guild_votes_guild').on(table.guildId),
]);

export const voteTimeAggregations = pgTable('vote_time_aggregations', {
    id: serial('id').primaryKey(),
    period: varchar('period', { length: 16 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }),
    artistUsername: varchar('artist_username', { length: 128 }),
    voteCount: integer('vote_count').notNull().default(0),
    lastReset: timestamp('last_reset', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    uniqueIndex('uq_agg_period_guild_artist').on(table.period, table.guildId, table.artistUsername),
    index('idx_agg_period').on(table.period),
]);
