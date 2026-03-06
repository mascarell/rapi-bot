/**
 * Configuration for the YouTube Upload Notification System
 */

export const YOUTUBE_CONFIG = {
    DATA_PATH: 'data/youtube-notifications',
    RSS_FEED_BASE_URL: 'https://www.youtube.com/feeds/videos.xml?channel_id=',
    FETCH_TIMEOUT_MS: 10000,
    VIDEOS_CHANNEL_NAME: 'videos',
    EMBED_COLOR: 0xFF0000, // YouTube red
    CACHE_TTL: 5 * 60 * 1000, // 5 minutes
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
