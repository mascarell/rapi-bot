import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageFlags } from 'discord.js';

vi.mock('../../utils/twitch.js', () => ({ checkStreamStatus: vi.fn() }));

import { checkStreamStatus } from '../../utils/twitch.js';
import stream from '../stream';

const STREAMER = '118451485221715977';

function fakeInteraction(userId: string, url: string | null) {
    const send = vi.fn().mockResolvedValue(undefined);
    const interaction: any = {
        commandName: 'stream',
        user: { id: userId },
        options: { getString: vi.fn(() => url) },
        client: { channels: { fetch: vi.fn().mockResolvedValue({ send }) } },
        replied: false,
        deferred: false,
        reply: vi.fn().mockResolvedValue(undefined),
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
    };
    return { interaction, send };
}

const replyText = (interaction: any) => {
    const call = interaction.reply.mock.calls[0] ?? interaction.editReply.mock.calls[0];
    const arg = call[0];
    return typeof arg === 'string' ? arg : arg.content;
};

describe('/stream', () => {
    beforeEach(() => {
        vi.mocked(checkStreamStatus).mockReset();
    });

    it('makes url optional', () => {
        const option = stream.data.toJSON().options?.find(o => o.name === 'url');
        expect(option?.required).toBe(false);
    });

    it('gives anyone else the Twitch link without announcing', async () => {
        const { interaction, send } = fakeInteraction('111111111111111111', null);
        await stream.execute(interaction);
        expect(replyText(interaction)).toContain('twitch.tv/sefhi_922');
        expect(interaction.reply.mock.calls[0][0].flags).toBe(MessageFlags.Ephemeral);
        expect(send).not.toHaveBeenCalled();
        expect(checkStreamStatus).not.toHaveBeenCalled();
    });

    it('asks the streamer for a link when url is missing', async () => {
        const { interaction, send } = fakeInteraction(STREAMER, null);
        await stream.execute(interaction);
        expect(replyText(interaction)).toContain('url');
        expect(send).not.toHaveBeenCalled();
    });

    it('announces when the streamer is live', async () => {
        vi.mocked(checkStreamStatus).mockResolvedValue(true);
        const { interaction, send } = fakeInteraction(STREAMER, 'https://example.com/live');
        await stream.execute(interaction);
        expect(send).toHaveBeenCalledWith(expect.stringContaining('<https://example.com/live>'));
        expect(replyText(interaction)).toBe('Stream announcement sent!');
        expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
        expect(interaction.reply).not.toHaveBeenCalled();
    });

    it('does not announce when the stream is offline', async () => {
        vi.mocked(checkStreamStatus).mockResolvedValue(false);
        const { interaction, send } = fakeInteraction(STREAMER, 'https://example.com/live');
        await stream.execute(interaction);
        expect(send).not.toHaveBeenCalled();
        expect(replyText(interaction)).toBe('Stream is not currently live.');
    });
});
