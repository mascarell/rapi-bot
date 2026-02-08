import { Message } from 'discord.js';
import { getRandomCdnMediaUrl } from '../../utils/cdn/mediaManager.js';
import { logger } from '../../utils/logger.js';

// Default extensions
const DEFAULT_IMAGE_EXTENSIONS = ['.gif', '.png', '.jpg', '.webp'] as const;
const DEFAULT_VIDEO_EXTENSIONS = ['.mp4'] as const;

export { DEFAULT_IMAGE_EXTENSIONS, DEFAULT_VIDEO_EXTENSIONS };

export interface MediaCommandOptions {
    path: string;
    extensions?: readonly string[];
    trackLast?: number;
    replyText?: string;
    reaction?: string;
}

/**
 * Execute a media command (fetch random file from CDN and reply)
 */
export async function executeMediaCommand(
    msg: Message,
    options: MediaCommandOptions
): Promise<void> {
    const { path, extensions, trackLast, replyText, reaction } = options;

    const randomCdnMediaUrl = await getRandomCdnMediaUrl(
        path,
        msg.guild!.id,
        {
            extensions: extensions ? [...extensions] : [...DEFAULT_IMAGE_EXTENSIONS],
            trackLast: trackLast || 3
        }
    );

    try {
        await msg.reply({
            content: replyText || '',
            files: [randomCdnMediaUrl]
        });

        if (reaction) {
            await msg.react(reaction);
        }
    } catch (error: any) {
        // Handle Discord's 10MB file size limit (code 40005 or status 413)
        if (error.code === 40005 || error.status === 413) {
            await msg.reply(
                'Commander, the selected media file is too large for this server (>10MB). ' +
                'You may need to boost the server to allow larger file uploads, or try the command again for a different file.'
            );
        } else {
            // Re-throw for main error handler
            throw error;
        }
    }
}
