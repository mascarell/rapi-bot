import { describe, it, expect, vi } from 'vitest';
import { ChannelType } from 'discord.js';
import { enforceChannelRestriction, isInChannel } from '../channelRestrictions';

const RAPI_BOT = { id: '111111111111111111', type: ChannelType.GuildText, name: 'rapi-bot', isThread: () => false };
const GENERAL = { id: '222222222222222222', type: ChannelType.GuildText, name: 'general', isThread: () => false };
const threadIn = (parent: unknown) => ({ id: '333333333333333333', type: ChannelType.PublicThread, isThread: () => true, parent });

function interaction(channel: unknown, guildChannels: unknown[]): any {
    return {
        channel,
        guild: { channels: { cache: { find: (fn: (c: unknown) => boolean) => guildChannels.find(fn) } } },
        reply: vi.fn().mockResolvedValue(undefined),
    };
}

describe('channel restrictions', () => {
    it('allows the named channel and threads inside it', () => {
        expect(isInChannel(interaction(RAPI_BOT, [RAPI_BOT]), 'rapi-bot')).toBe(true);
        expect(isInChannel(interaction(threadIn(RAPI_BOT), [RAPI_BOT]), 'rapi-bot')).toBe(true);
        expect(isInChannel(interaction(threadIn(GENERAL), [RAPI_BOT]), 'rapi-bot')).toBe(false);
    });

    it('refuses elsewhere and points at the channel', async () => {
        const i = interaction(GENERAL, [GENERAL, RAPI_BOT]);
        expect(await enforceChannelRestriction(i, 'rapi-bot')).toBe(true);
        expect(i.reply.mock.calls[0][0].content).toContain('<#111111111111111111>');
    });

    it('does not restrict a server without that channel', async () => {
        const i = interaction(GENERAL, [GENERAL]);
        expect(await enforceChannelRestriction(i, 'rapi-bot')).toBe(false);
        expect(i.reply).not.toHaveBeenCalled();
    });
});
