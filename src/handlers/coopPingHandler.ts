import { Message } from 'discord.js';
import { getRandomCdnMediaUrl } from '../utils/cdn/mediaManager.js';
import { getRandomCoopPingMessage } from '../utils/util.js';
import { infoEmbed } from '../utils/embedTemplates.js';
import { DEFAULT_IMAGE_EXTENSIONS } from '../config/assets.js';
import { logger } from '../utils/logger.js';

/**
 * Role that signals a NIKKE co-op recruitment ping
 */
export const COOP_ROLE_ID = '1462080868611784913';

/**
 * CDN prefix holding the Rapi co-op announcement images
 */
const COOP_MEDIA_PATH = 'commands/coop/';

/**
 * Cooldown per channel so a burst of pings only triggers one announcement
 */
const COOP_PING_COOLDOWN_MS = 60 * 1000;

// channelId -> timestamp of last announcement
const lastAnnouncement = new Map<string, number>();

/**
 * Announces a co-op call to arms whenever the co-op role is pinged.
 * Rapi rallies the squad with a random line and image from the CDN.
 */
export async function checkCoopPing(msg: Message): Promise<void> {
    try {
        if (!msg.guild || msg.author.bot || !msg.mentions.roles.has(COOP_ROLE_ID)) {
            return;
        }

        const now = Date.now();
        const lastSent = lastAnnouncement.get(msg.channel.id) ?? 0;
        if (now - lastSent < COOP_PING_COOLDOWN_MS) {
            return;
        }
        lastAnnouncement.set(msg.channel.id, now);

        const embed = infoEmbed(
            '📡 ATTENTION ALL COMMANDERS',
            `${getRandomCoopPingMessage()}\n\nCommander <@${msg.author.id}> is rallying the squad — <@&${COOP_ROLE_ID}>, move out.`
        );

        // The announcement still goes out if the CDN has no co-op media yet
        try {
            const mediaUrl = await getRandomCdnMediaUrl(COOP_MEDIA_PATH, msg.guild.id, {
                extensions: [...DEFAULT_IMAGE_EXTENSIONS],
                trackLast: 5,
            });
            embed.setImage(mediaUrl);
        } catch (error) {
            logger.warning`Co-op ping media unavailable at ${COOP_MEDIA_PATH}: ${error}`;
        }

        await msg.reply({ embeds: [embed] });
    } catch (error) {
        // Never break message processing over an announcement
        logger.error`[coopPing] Failed to announce co-op ping in guild ${msg.guild?.id}: ${error}`;
    }
}
