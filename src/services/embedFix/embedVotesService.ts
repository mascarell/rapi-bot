/**
 * Embed Votes Service
 * Manages artwork votes with S3 persistence
 */

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, S3_BUCKET } from '../../utils/cdn/config';
import { EMBED_FIX_CONFIG } from '../../utils/data/embedFixConfig';
import { embedFixLogger } from '../../utils/logger.js';
import {
    ArtworkVotes,
    EmbedPlatform,
    EmbedVotesData,
    GuildVoteData,
    VotePeriodData,
    VoteTimeAggregations,
} from '../../utils/interfaces/EmbedFix.interface';

const CURRENT_SCHEMA_VERSION = 1;

class EmbedVotesService {
    private static instance: EmbedVotesService;
    private cache: EmbedVotesData | null = null;
    private cacheExpiry: number = 0;

    private constructor() {}

    static getInstance(): EmbedVotesService {
        if (!EmbedVotesService.instance) {
            EmbedVotesService.instance = new EmbedVotesService();
        }
        return EmbedVotesService.instance;
    }

    /**
     * Get votes data from S3 with caching
     */
    async getData(): Promise<EmbedVotesData> {
        if (this.cache && Date.now() < this.cacheExpiry) {
            return this.cache;
        }

        try {
            const response = await s3Client.send(new GetObjectCommand({
                Bucket: S3_BUCKET,
                Key: EMBED_FIX_CONFIG.S3_VOTES_KEY,
            }));

            const bodyContents = await response.Body?.transformToString();
            if (!bodyContents) {
                return this.getDefaultData();
            }

            this.cache = JSON.parse(bodyContents) as EmbedVotesData;
            this.cacheExpiry = Date.now() + EMBED_FIX_CONFIG.VOTES_CACHE_TTL;
            return this.cache;
        } catch (error: any) {
            if (error.name === 'NoSuchKey' || error.Code === 'NoSuchKey') {
                embedFixLogger.warn`Data file not found, creating default...`;
                const defaultData = this.getDefaultData();
                await this.saveData(defaultData);
                return defaultData;
            }
            embedFixLogger.error`Error fetching data: ${error}`;
            throw error;
        }
    }

    /**
     * Save votes data to S3 and update cache
     */
    async saveData(data: EmbedVotesData): Promise<void> {
        data.lastUpdated = new Date().toISOString();

        await s3Client.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: EMBED_FIX_CONFIG.S3_VOTES_KEY,
            Body: JSON.stringify(data, null, 2),
            ContentType: 'application/json',
        }));

        this.cache = data;
        this.cacheExpiry = Date.now() + EMBED_FIX_CONFIG.VOTES_CACHE_TTL;
    }

    /**
     * Get default empty data structure
     */
    private getDefaultData(): EmbedVotesData {
        const now = new Date().toISOString();
        return {
            votes: {},
            timeAggregations: this.getDefaultTimeAggregations(now),
            schemaVersion: CURRENT_SCHEMA_VERSION,
            lastUpdated: now,
        };
    }

    /**
     * Get default time aggregations
     */
    private getDefaultTimeAggregations(now: string): VoteTimeAggregations {
        const emptyPeriod: VotePeriodData = {
            byGuild: {},
            global: 0,
            topArtwork: [],
            topArtists: {},
        };

        return {
            weekly: { ...emptyPeriod },
            monthly: { ...emptyPeriod },
            yearly: { ...emptyPeriod },
            lastReset: {
                weekly: now,
                monthly: now,
                yearly: now,
            },
        };
    }

    /**
     * Toggle a vote for an artwork (add if not voted, remove if already voted)
     * Returns the new guild vote count
     */
    async toggleVote(
        artworkId: string,
        guildId: string,
        userId: string
    ): Promise<{ added: boolean; newCount: number }> {
        const data = await this.getData();
        const artwork = data.votes[artworkId];

        if (!artwork) {
            // Artwork not found - shouldn't happen if recordArtwork was called
            embedFixLogger.warn`Artwork ${artworkId} not found for voting`;
            return { added: false, newCount: 0 };
        }

        const guildData = artwork.guildVotes[guildId];
        if (!guildData) {
            embedFixLogger.warn`Guild ${guildId} not found for artwork ${artworkId}`;
            return { added: false, newCount: 0 };
        }

        const voterIndex = guildData.voters.indexOf(userId);
        const wasVoted = voterIndex !== -1;

        if (wasVoted) {
            // Remove vote
            guildData.voters.splice(voterIndex, 1);
            guildData.voteCount--;
            artwork.globalVoteCount--;

            // Update time aggregations (decrement)
            this.updateTimeAggregations(data, guildId, artwork.artistUsername, -1);
        } else {
            // Add vote
            guildData.voters.push(userId);
            guildData.voteCount++;
            artwork.globalVoteCount++;
            artwork.lastVotedAt = new Date().toISOString();

            // Update time aggregations (increment)
            this.updateTimeAggregations(data, guildId, artwork.artistUsername, 1);
        }

        await this.saveData(data);

        return {
            added: !wasVoted,
            newCount: guildData.voteCount,
        };
    }

    /**
     * Update time-based aggregations when a vote changes
     */
    private updateTimeAggregations(
        data: EmbedVotesData,
        guildId: string,
        artistUsername: string,
        delta: number
    ): void {
        const periods: Array<'weekly' | 'monthly' | 'yearly'> = ['weekly', 'monthly', 'yearly'];

        for (const period of periods) {
            const periodData = data.timeAggregations[period];

            // Update guild count
            periodData.byGuild[guildId] = (periodData.byGuild[guildId] || 0) + delta;
            if (periodData.byGuild[guildId] <= 0) {
                delete periodData.byGuild[guildId];
            }

            // Update global count
            periodData.global += delta;

            // Update artist count
            periodData.topArtists[artistUsername] = (periodData.topArtists[artistUsername] || 0) + delta;
            if (periodData.topArtists[artistUsername] <= 0) {
                delete periodData.topArtists[artistUsername];
            }
        }
    }

    /**
     * Get vote count for an artwork
     */
    async getVoteCount(artworkId: string, guildId?: string): Promise<number> {
        const data = await this.getData();
        const artwork = data.votes[artworkId];

        if (!artwork) return 0;

        if (guildId) {
            return artwork.guildVotes[guildId]?.voteCount || 0;
        }

        return artwork.globalVoteCount;
    }

    /**
     * Check if a user has voted for an artwork in a guild
     */
    async hasUserVoted(artworkId: string, guildId: string, userId: string): Promise<boolean> {
        const data = await this.getData();
        const artwork = data.votes[artworkId];

        if (!artwork) return false;

        const guildData = artwork.guildVotes[guildId];
        if (!guildData) return false;

        return guildData.voters.includes(userId);
    }

    /**
     * Record a new artwork when it's first shared
     */
    async recordArtwork(
        artworkId: string,
        details: {
            originalUrl: string;
            platform: EmbedPlatform;
            artistUsername: string;
            artistName: string;
            guildId: string;
            channelId: string;
            messageId: string;
            sharedBy: string;
        }
    ): Promise<void> {
        const data = await this.getData();
        const now = new Date().toISOString();

        // Check if artwork already exists
        if (!data.votes[artworkId]) {
            // New artwork
            data.votes[artworkId] = {
                artworkId,
                originalUrl: details.originalUrl,
                platform: details.platform,
                artistUsername: details.artistUsername,
                artistName: details.artistName,
                guildVotes: {},
                globalVoteCount: 0,
                firstSharedAt: now,
                lastVotedAt: now,
            };
        }

        // Add guild entry if not exists
        if (!data.votes[artworkId].guildVotes[details.guildId]) {
            data.votes[artworkId].guildVotes[details.guildId] = {
                voters: [],
                voteCount: 0,
                sharedBy: details.sharedBy,
                sharedAt: now,
                messageId: details.messageId,
                channelId: details.channelId,
            };
        }

        await this.saveData(data);
    }

    /**
     * Get stats for a specific period
     */
    async getStats(
        guildId: string,
        period: 'weekly' | 'monthly' | 'yearly' | 'alltime'
    ): Promise<{
        guildVotes: number;
        globalVotes: number;
        topArtwork: ArtworkVotes[];
        topArtists: Array<{ username: string; votes: number }>;
    }> {
        const data = await this.getData();

        if (period === 'alltime') {
            // Calculate all-time stats from raw vote data
            let guildVotes = 0;
            let globalVotes = 0;
            const artistVotes: Record<string, number> = {};
            const artworkList: ArtworkVotes[] = [];

            for (const artwork of Object.values(data.votes)) {
                globalVotes += artwork.globalVoteCount;
                artworkList.push(artwork);

                // Artist aggregation
                artistVotes[artwork.artistUsername] = (artistVotes[artwork.artistUsername] || 0) + artwork.globalVoteCount;

                // Guild-specific count
                if (artwork.guildVotes[guildId]) {
                    guildVotes += artwork.guildVotes[guildId].voteCount;
                }
            }

            // Sort artwork by global votes
            artworkList.sort((a, b) => b.globalVoteCount - a.globalVoteCount);

            // Sort artists by votes
            const topArtists = Object.entries(artistVotes)
                .map(([username, votes]) => ({ username, votes }))
                .sort((a, b) => b.votes - a.votes)
                .slice(0, 10);

            return {
                guildVotes,
                globalVotes,
                topArtwork: artworkList.slice(0, 10),
                topArtists,
            };
        }

        // Time-based stats
        const periodData = data.timeAggregations[period];

        // Get top artwork for period
        const topArtwork = periodData.topArtwork
            .map(id => data.votes[id])
            .filter(Boolean)
            .slice(0, 10);

        // Get top artists for period
        const topArtists = Object.entries(periodData.topArtists)
            .map(([username, votes]) => ({ username, votes }))
            .sort((a, b) => b.votes - a.votes)
            .slice(0, 10);

        return {
            guildVotes: periodData.byGuild[guildId] || 0,
            globalVotes: periodData.global,
            topArtwork,
            topArtists,
        };
    }

    /**
     * Reset a time period (called by cron job)
     */
    async resetPeriod(period: 'weekly' | 'monthly' | 'yearly'): Promise<void> {
        const data = await this.getData();
        const now = new Date().toISOString();

        data.timeAggregations[period] = {
            byGuild: {},
            global: 0,
            topArtwork: [],
            topArtists: {},
        };
        data.timeAggregations.lastReset[period] = now;

        await this.saveData(data);
    }

    /**
     * Check if artwork was recently shared in this guild (duplicate detection)
     * Returns the original share info if duplicate, otherwise indicates not a duplicate
     */
    async checkDuplicate(
        artworkId: string,
        guildId: string,
        windowMs: number = 24 * 60 * 60 * 1000  // 24 hours default
    ): Promise<{
        isDuplicate: boolean;
        originalShare?: {
            sharedBy: string;
            sharedAt: string;
            messageId: string;
            channelId: string;
        };
    }> {
        const data = await this.getData();
        const artwork = data.votes[artworkId];

        if (!artwork) return { isDuplicate: false };

        const guildData = artwork.guildVotes[guildId];
        if (!guildData) return { isDuplicate: false };

        const sharedTime = new Date(guildData.sharedAt).getTime();
        const now = Date.now();

        if (now - sharedTime < windowMs) {
            return {
                isDuplicate: true,
                originalShare: {
                    sharedBy: guildData.sharedBy,
                    sharedAt: guildData.sharedAt,
                    messageId: guildData.messageId,
                    channelId: guildData.channelId,
                },
            };
        }

        return { isDuplicate: false };
    }

    /**
     * Generate artwork ID from platform and URL
     */
    static generateArtworkId(platform: EmbedPlatform, url: string): string {
        // Extract ID based on platform
        if (platform === 'twitter') {
            const match = url.match(/status\/(\d+)/);
            return match ? `twitter:${match[1]}` : `twitter:${url}`;
        }
        if (platform === 'pixiv') {
            const match = url.match(/artworks\/(\d+)/) || url.match(/illust_id=(\d+)/);
            return match ? `pixiv:${match[1]}` : `pixiv:${url}`;
        }
        if (platform === 'instagram') {
            const match = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
            return match ? `instagram:${match[2]}` : `instagram:${url}`;
        }
        return `${platform}:${url}`;
    }

    /**
     * Invalidate cache (for testing)
     */
    invalidateCache(): void {
        this.cache = null;
        this.cacheExpiry = 0;
    }
}

// Export singleton getter
export function getEmbedVotesService(): EmbedVotesService {
    return EmbedVotesService.getInstance();
}

// Export class for testing
export { EmbedVotesService };
