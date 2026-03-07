/**
 * Configuration for the YouTube Upload Notification System
 */

export const YOUTUBE_CONFIG = {
    DATA_PATH: 'data/youtube-notifications',
    API_BASE_URL: 'https://www.googleapis.com/youtube/v3/playlistItems',
    API_MAX_RESULTS: 10,
    FETCH_TIMEOUT_MS: 10000,
    FETCH_MAX_RETRIES: 3,
    FETCH_RETRY_DELAY_MS: 2000,
    CACHE_TTL: 5 * 60 * 1000, // 5 minutes
    CHANNEL_DEDUP_MESSAGE_LIMIT: 50,
    ANNOUNCEMENT_PHRASES: [
        'Commander, {user} just uploaded a new video! You should watch it immediately.',
        'Attention Commander! {user} has posted new content. I recommend watching it right away.',
        'Commander! {user} dropped a new video. I already watched it... for tactical purposes.',
        '{user} just uploaded something new, Commander. Consider it a mandatory briefing.',
        'New intel from {user}, Commander! A video has just been uploaded.',
        'Commander, {user} posted a new video. I suggest we take a break and watch it together.',
    ],
} as const;

export type YoutubeConfig = typeof YOUTUBE_CONFIG;
