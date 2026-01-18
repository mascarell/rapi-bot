import axios from 'axios';
import { ActivityType, PresenceUpdateStatus } from 'discord.js';
import { setIsStreaming } from './util.js';

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_USERNAME = 'sefhi_922';
const TWITCH_LINK = `https://www.twitch.tv/${TWITCH_USERNAME}`;

let accessToken: string | null = null;
let tokenExpiry: number = 0;

async function getAccessToken(): Promise<string> {
    if (accessToken && Date.now() < tokenExpiry) {
        return accessToken;
    }

    try {
        const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: {
                client_id: TWITCH_CLIENT_ID,
                client_secret: TWITCH_CLIENT_SECRET,
                grant_type: 'client_credentials'
            }
        });

        const newToken = response.data.access_token;
        if (!newToken) {
            throw new Error('No access token received from Twitch');
        }

        accessToken = newToken;
        tokenExpiry = Date.now() + (response.data.expires_in * 1000);
        return newToken;
    } catch (error) {
        console.error('Error getting Twitch access token:', error);
        throw error;
    }
}

async function getUserId(): Promise<string> {
    const token = await getAccessToken();
    try {
        const response = await axios.get('https://api.twitch.tv/helix/users', {
            params: {
                login: TWITCH_USERNAME
            },
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`
            }
        });
        return response.data.data[0].id;
    } catch (error) {
        console.error('Error getting Twitch user ID:', error);
        throw error;
    }
}

export async function checkStreamStatus(client: any): Promise<boolean> {
    try {
        const token = await getAccessToken();
        const userId = await getUserId();

        const response = await axios.get('https://api.twitch.tv/helix/streams', {
            params: {
                user_id: userId
            },
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`
            }
        });

        const streamData = response.data.data[0];
        const isLive = streamData && streamData.type === 'live';
        
        if (isLive) {
            client.user?.setPresence({
                status: 'online',
                activities: [{
                    name: 'Loot & Waifus',
                    type: ActivityType.Streaming,
                    url: TWITCH_LINK,
                }],
            });
            setIsStreaming(true);
        } else {
            client.user?.setPresence({
                status: PresenceUpdateStatus.Online,
                activities: [{
                    name: 'SIMULATION ROOM',
                    type: ActivityType.Competing,
                }],
            });
            setIsStreaming(false);
        }

        return isLive;
    } catch (error) {
        console.error('Error checking Twitch stream status:', error);
        return false;
    }
}

export function startStreamStatusCheck(client: any) {
    // Check every 5 minutes
    setInterval(async () => {
        await checkStreamStatus(client);
    }, 5 * 60 * 1000);
} 