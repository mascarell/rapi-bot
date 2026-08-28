import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../utils/cdn/mediaManager.js', () => ({
    getRandomCdnMediaUrl: vi.fn(),
}));

// EmbedBuilder.setThumbnail validates URL format; the asset URL helper returns
// relative paths in test envs (no CDN_DOMAIN_URL). Stub with an absolute URL.
vi.mock('../../config/assets.js', () => ({
    getAssetUrls: () => ({
        rapiBot: { thumbnail: 'https://example.com/thumb.png' },
    }),
    DEFAULT_IMAGE_EXTENSIONS: ['.gif', '.png', '.jpg', '.webp'],
}));

import { getRandomCdnMediaUrl } from '../../utils/cdn/mediaManager.js';
import { checkCoopPing, COOP_ROLE_ID } from '../coopPingHandler';

const mockedMediaUrl = 'https://cdn.example.com/commands/coop/rally.png';

let channelCounter = 0;

function createMessage(overrides: {
    roleIds?: string[];
    isBot?: boolean;
    guild?: unknown;
    channelId?: string;
} = {}) {
    const roleIds = overrides.roleIds ?? [COOP_ROLE_ID];
    const reply = vi.fn().mockResolvedValue({});

    return {
        author: { id: 'user-1', bot: overrides.isBot ?? false },
        guild: 'guild' in overrides ? overrides.guild : { id: 'guild-1' },
        channel: { id: overrides.channelId ?? `channel-${++channelCounter}` },
        mentions: { roles: new Map(roleIds.map(id => [id, { id }])) },
        reply,
    } as any;
}

describe('checkCoopPing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (getRandomCdnMediaUrl as any).mockResolvedValue(mockedMediaUrl);
    });

    it('announces co-op when the co-op role is pinged', async () => {
        const msg = createMessage();

        await checkCoopPing(msg);

        expect(msg.reply).toHaveBeenCalledTimes(1);
        const embed = msg.reply.mock.calls[0][0].embeds[0];
        expect(embed.data.title).toContain('ATTENTION ALL COMMANDERS');
        expect(embed.data.description).toContain(`<@&${COOP_ROLE_ID}>`);
        expect(embed.data.description).toContain('<@user-1>');
        expect(embed.data.image.url).toBe(mockedMediaUrl);
    });

    it('ignores messages that do not ping the co-op role', async () => {
        const msg = createMessage({ roleIds: ['999'] });

        await checkCoopPing(msg);

        expect(msg.reply).not.toHaveBeenCalled();
    });

    it('ignores bot messages and DMs', async () => {
        const botMsg = createMessage({ isBot: true });
        const dmMsg = createMessage({ guild: null });

        await checkCoopPing(botMsg);
        await checkCoopPing(dmMsg);

        expect(botMsg.reply).not.toHaveBeenCalled();
        expect(dmMsg.reply).not.toHaveBeenCalled();
    });

    it('only announces once per channel within the cooldown window', async () => {
        const first = createMessage({ channelId: 'shared-channel' });
        const second = createMessage({ channelId: 'shared-channel' });

        await checkCoopPing(first);
        await checkCoopPing(second);

        expect(first.reply).toHaveBeenCalledTimes(1);
        expect(second.reply).not.toHaveBeenCalled();
    });

    it('still announces when the CDN has no co-op media', async () => {
        (getRandomCdnMediaUrl as any).mockRejectedValue(new Error('No media files available'));
        const msg = createMessage();

        await checkCoopPing(msg);

        expect(msg.reply).toHaveBeenCalledTimes(1);
        expect(msg.reply.mock.calls[0][0].embeds[0].data.image).toBeUndefined();
    });

    it('does not throw when the reply fails', async () => {
        const msg = createMessage();
        msg.reply.mockRejectedValue(new Error('Missing Permissions'));

        await expect(checkCoopPing(msg)).resolves.toBeUndefined();
    });
});
