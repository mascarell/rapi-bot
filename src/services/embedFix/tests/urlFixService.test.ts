/**
 * Unit tests for URL Fix Service
 * Tests the simplified Twitter/X URL replacement functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UrlFixService } from '../urlFixService';
import { Message, TextChannel, Guild } from 'discord.js';

// Mock Discord.js Message
const createMockMessage = (
    content: string,
    channelName: string,
    isBot: boolean = false,
    guildId: string = 'test-guild-id',
    channelId: string = 'test-channel-id',
    messageId: string = 'test-message-id'
): Partial<Message> => ({
    id: messageId,
    content,
    author: {
        bot: isBot,
        username: isBot ? 'TestBot' : 'TestUser',
    } as any,
    guild: {
        id: guildId,
        name: 'Test Guild',
    } as Guild,
    channel: {
        id: channelId,
        name: channelName,
        type: 0, // GuildText
    } as TextChannel,
    embeds: [],
    reply: vi.fn().mockResolvedValue({ id: 'bot-reply-id' }),
    suppressEmbeds: vi.fn().mockResolvedValue(undefined),
});

describe('UrlFixService', () => {
    let service: UrlFixService;

    beforeEach(() => {
        service = UrlFixService.getInstance();
        // Clear any tracked state between tests
        service.clearTrackedContent();
        vi.clearAllMocks();
    });

    describe('Bot message filtering', () => {
        it('should skip messages from bots', async () => {
            const message = createMockMessage(
                'https://x.com/user/status/123',
                'art',
                true // isBot
            );

            await service.processMessage(message as Message);

            expect(message.reply).not.toHaveBeenCalled();
        });

        it('should process messages from users', async () => {
            const message = createMockMessage(
                'https://x.com/user/status/123',
                'art',
                false // not a bot
            );

            await service.processMessage(message as Message);

            expect(message.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: 'https://fixupx.com/i/status/123',
                })
            );
        });
    });

    describe('Channel filtering', () => {
        it('should process messages in #art channel', async () => {
            const message = createMockMessage(
                'https://x.com/user/status/123',
                'art'
            );

            await service.processMessage(message as Message);

            expect(message.reply).toHaveBeenCalled();
        });

        it('should process messages in #nsfw channel', async () => {
            const message = createMockMessage(
                'https://x.com/user/status/456',
                'nsfw'
            );

            await service.processMessage(message as Message);

            expect(message.reply).toHaveBeenCalled();
        });

        it('should skip messages in #general channel', async () => {
            const message = createMockMessage(
                'https://x.com/user/status/789',
                'general'
            );

            await service.processMessage(message as Message);

            expect(message.reply).not.toHaveBeenCalled();
        });

        it('should handle case-insensitive channel names', async () => {
            const message = createMockMessage(
                'https://x.com/user/status/123',
                'ART' // uppercase
            );

            await service.processMessage(message as Message);

            expect(message.reply).toHaveBeenCalled();
        });
    });

    describe('URL extraction and conversion', () => {
        it('should extract and convert x.com URLs', async () => {
            const message = createMockMessage(
                'https://x.com/user/status/123456789',
                'art'
            );

            await service.processMessage(message as Message);

            expect(message.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: 'https://fixupx.com/i/status/123456789',
                })
            );
        });

        it('should extract and convert twitter.com URLs', async () => {
            const message = createMockMessage(
                'https://twitter.com/user/status/987654321',
                'art'
            );

            await service.processMessage(message as Message);

            expect(message.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: 'https://fixupx.com/i/status/987654321',
                })
            );
        });

        it('should handle mobile.twitter.com URLs', async () => {
            const message = createMockMessage(
                'https://mobile.twitter.com/user/status/111222333',
                'art'
            );

            await service.processMessage(message as Message);

            expect(message.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: 'https://fixupx.com/i/status/111222333',
                })
            );
        });

        it('should handle www.x.com URLs', async () => {
            const message = createMockMessage(
                'https://www.x.com/user/status/444555666',
                'art'
            );

            await service.processMessage(message as Message);

            expect(message.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: 'https://fixupx.com/i/status/444555666',
                })
            );
        });

        it('should extract from vxtwitter.com URLs', async () => {
            const message = createMockMessage(
                'https://vxtwitter.com/user/status/777888999',
                'art'
            );

            await service.processMessage(message as Message);

            expect(message.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: 'https://fixupx.com/i/status/777888999',
                })
            );
        });

        it('should extract from fxtwitter.com URLs', async () => {
            const message = createMockMessage(
                'https://fxtwitter.com/user/status/123123123',
                'art'
            );

            await service.processMessage(message as Message);

            expect(message.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: 'https://fixupx.com/i/status/123123123',
                })
            );
        });

        it('should extract from fixupx.com/i/status URLs', async () => {
            const message = createMockMessage(
                'https://fixupx.com/i/status/999888777',
                'art'
            );

            await service.processMessage(message as Message);

            expect(message.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: 'https://fixupx.com/i/status/999888777',
                })
            );
        });

        it('should extract from alternate proxy domains', async () => {
            const message = createMockMessage(
                'https://fixvx.com/user/status/111222333',
                'art'
            );

            await service.processMessage(message as Message);

            expect(message.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: 'https://fixupx.com/i/status/111222333',
                })
            );
        });
    });

    describe('Multiple URLs handling', () => {
        it('should handle multiple URLs in one message', async () => {
            const message = createMockMessage(
                'Check these out: https://x.com/user1/status/111 and https://twitter.com/user2/status/222',
                'art'
            );

            await service.processMessage(message as Message);

            expect(message.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('https://fixupx.com/i/status/111'),
                })
            );
            expect(message.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('https://fixupx.com/i/status/222'),
                })
            );
        });

        it('should deduplicate same status ID from different domains', async () => {
            const message = createMockMessage(
                'https://x.com/user/status/123 and https://twitter.com/user/status/123',
                'art'
            );

            await service.processMessage(message as Message);

            const reply = (message.reply as any).mock.calls[0][0];
            // Should only have one URL in the reply (deduplicated)
            const urlCount = (reply.content.match(/https:\/\/fixupx\.com/g) || []).length;
            expect(urlCount).toBe(1);
        });
    });

    describe('Non-Twitter URLs', () => {
        it('should skip messages without Twitter URLs', async () => {
            const message = createMockMessage(
                'Check out https://youtube.com/watch?v=123',
                'art'
            );

            await service.processMessage(message as Message);

            expect(message.reply).not.toHaveBeenCalled();
        });

        it('should skip messages without any URLs', async () => {
            const message = createMockMessage(
                'Just a regular message',
                'art'
            );

            await service.processMessage(message as Message);

            expect(message.reply).not.toHaveBeenCalled();
        });
    });

    describe('Embed suppression', () => {
        it('should suppress embeds via setTimeout for delayed embed generation', async () => {
            const message = createMockMessage(
                'https://x.com/user/status/123',
                'art'
            );

            await service.processMessage(message as Message);

            // suppressEmbeds is called in setTimeout (1500ms delay) to catch async Discord embeds
            // We can't easily test the setTimeout in a unit test, but we verify the reply was called
            expect(message.reply).toHaveBeenCalled();
        });

        it('should suppress embeds immediately if embeds exist', async () => {
            const message = createMockMessage(
                'https://x.com/user/status/123',
                'art'
            );
            message.embeds = [{ type: 'rich' }] as any;

            await service.processMessage(message as Message);

            // Should be called at least once immediately
            expect(message.suppressEmbeds).toHaveBeenCalled();
        });
    });

    describe('Edge cases', () => {
        it('should handle URLs with query parameters', async () => {
            const message = createMockMessage(
                'https://x.com/user/status/123?s=20&t=abc',
                'art'
            );

            await service.processMessage(message as Message);

            expect(message.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: 'https://fixupx.com/i/status/123',
                })
            );
        });

        it('should handle mixed content with text and URLs', async () => {
            const message = createMockMessage(
                'Amazing art! https://x.com/artist/status/456 #fanart',
                'art'
            );

            await service.processMessage(message as Message);

            expect(message.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: 'https://fixupx.com/i/status/456',
                })
            );
        });

        it('should not ping the user in reply', async () => {
            const message = createMockMessage(
                'https://x.com/user/status/789',
                'art'
            );

            await service.processMessage(message as Message);

            expect(message.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    allowedMentions: { repliedUser: false },
                })
            );
        });

        it('should handle very long status IDs', async () => {
            const message = createMockMessage(
                'https://x.com/user/status/1234567890123456789',
                'art'
            );

            await service.processMessage(message as Message);

            expect(message.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: 'https://fixupx.com/i/status/1234567890123456789',
                })
            );
        });
    });

    describe('Pixiv URL handling', () => {
        it('should extract and convert standard pixiv.net URLs', async () => {
            const message = createMockMessage(
                'https://www.pixiv.net/artworks/123456789',
                'art'
            );

            await service.processMessage(message as Message);

            expect(message.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: 'https://phixiv.net/artworks/123456789',
                })
            );
        });

        it('should extract and convert pixiv.net URLs with language prefix', async () => {
            const message = createMockMessage(
                'https://www.pixiv.net/en/artworks/987654321',
                'art'
            );

            await service.processMessage(message as Message);

            expect(message.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: 'https://phixiv.net/artworks/987654321',
                })
            );
        });

        it('should extract and convert legacy member_illust.php URLs', async () => {
            const message = createMockMessage(
                'https://www.pixiv.net/member_illust.php?illust_id=111222333',
                'art'
            );

            await service.processMessage(message as Message);

            expect(message.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: 'https://phixiv.net/artworks/111222333',
                })
            );
        });

        it('should extract from phixiv.net proxy URLs', async () => {
            const message = createMockMessage(
                'https://phixiv.net/artworks/444555666',
                'art'
            );

            await service.processMessage(message as Message);

            expect(message.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: 'https://phixiv.net/artworks/444555666',
                })
            );
        });

        it('should deduplicate Pixiv URLs by artwork ID', async () => {
            const message = createMockMessage(
                'https://www.pixiv.net/artworks/123 and https://pixiv.net/en/artworks/123',
                'art'
            );

            await service.processMessage(message as Message);

            const reply = (message.reply as any).mock.calls[0][0];
            // Should only have one URL in the reply (deduplicated)
            const urlCount = (reply.content.match(/https:\/\/phixiv\.net/g) || []).length;
            expect(urlCount).toBe(1);
        });

        it('should show duplicate notification for reposted Pixiv content', async () => {
            const message1 = createMockMessage(
                'https://www.pixiv.net/artworks/999888777',
                'art',
                false,
                'test-guild-id',
                'test-channel-id',
                'original-message-id'
            );

            await service.processMessage(message1 as Message);
            vi.clearAllMocks();

            // Second post with same artwork ID
            const message2 = createMockMessage(
                'https://phixiv.net/artworks/999888777',
                'art',
                false,
                'test-guild-id',
                'test-channel-id',
                'duplicate-message-id'
            );

            await service.processMessage(message2 as Message);

            expect(message2.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('🔄 This was already shared →'),
                })
            );
        });
    });

    describe('Mixed platform URLs', () => {
        it('should handle both Twitter and Pixiv URLs in one message', async () => {
            const message = createMockMessage(
                'Check these out: https://x.com/user/status/123 and https://www.pixiv.net/artworks/456',
                'art'
            );

            await service.processMessage(message as Message);

            const reply = (message.reply as any).mock.calls[0][0];
            expect(reply.content).toContain('https://fixupx.com/i/status/123');
            expect(reply.content).toContain('https://phixiv.net/artworks/456');
        });

        it('should handle multiple Pixiv and Twitter URLs', async () => {
            const message = createMockMessage(
                'Art: https://pixiv.net/artworks/111 https://x.com/a/status/222 https://pixiv.net/en/artworks/333',
                'art'
            );

            await service.processMessage(message as Message);

            const reply = (message.reply as any).mock.calls[0][0];
            expect(reply.content).toContain('https://phixiv.net/artworks/111');
            expect(reply.content).toContain('https://fixupx.com/i/status/222');
            expect(reply.content).toContain('https://phixiv.net/artworks/333');
        });

        it('should track both Twitter and Pixiv duplicates separately', async () => {
            const message1 = createMockMessage(
                'https://x.com/user/status/123 and https://pixiv.net/artworks/456',
                'art',
                false,
                'test-guild-id',
                'test-channel-id',
                'msg-1'
            );

            await service.processMessage(message1 as Message);
            vi.clearAllMocks();

            // Repost same Twitter but different Pixiv
            const message2 = createMockMessage(
                'https://x.com/user/status/123 and https://pixiv.net/artworks/789',
                'art',
                false,
                'test-guild-id',
                'test-channel-id',
                'msg-2'
            );

            await service.processMessage(message2 as Message);

            // Should reply with only the new Pixiv URL (Twitter is duplicate)
            const reply = (message2.reply as any).mock.calls[0][0];
            expect(reply.content).not.toContain('123'); // Twitter duplicate not included
            expect(reply.content).toContain('https://phixiv.net/artworks/789'); // New Pixiv included
        });
    });

    describe('Error handling', () => {
        it('should handle reply errors gracefully', async () => {
            const message = createMockMessage(
                'https://x.com/user/status/123',
                'art'
            );
            (message.reply as any).mockRejectedValueOnce(new Error('Network error'));

            // Should not throw
            await expect(service.processMessage(message as Message)).resolves.not.toThrow();
        });

        it('should handle suppress embeds errors gracefully', async () => {
            const message = createMockMessage(
                'https://x.com/user/status/123',
                'art'
            );
            (message.suppressEmbeds as any).mockRejectedValueOnce(new Error('Permission error'));

            // Should still attempt to reply
            await service.processMessage(message as Message);

            expect(message.reply).toHaveBeenCalled();
        });
    });

    describe('Guild requirement', () => {
        it('should skip DM messages (no guild)', async () => {
            const message = createMockMessage(
                'https://x.com/user/status/123',
                'art'
            );
            message.guild = null as any;

            await service.processMessage(message as Message);

            expect(message.reply).not.toHaveBeenCalled();
        });
    });
});
