import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  replyEphemeral,
  replyPublic,
  editReplyEphemeral,
  replyWithEmbed,
  replyWithEmbeds,
  deferEphemeral,
  deferPublic,
  isRepliedOrDeferred,
  respondEphemeral,
  respondWithEmbed,
  InteractionHelper
} from './interactionHelpers.js';
import { EmbedBuilder, MessageFlags, ChatInputCommandInteraction } from 'discord.js';

describe('interactionHelpers.ts', () => {
  let mockInteraction: Partial<ChatInputCommandInteraction>;

  beforeEach(() => {
    // Create mock interaction with all necessary properties
    mockInteraction = {
      reply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      deferReply: vi.fn().mockResolvedValue(undefined),
      replied: false,
      deferred: false
    };
  });

  describe('replyEphemeral', () => {
    it('should reply with ephemeral flag', async () => {
      await replyEphemeral(mockInteraction as ChatInputCommandInteraction, 'Test message');

      expect(mockInteraction.reply).toHaveBeenCalledOnce();
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Test message',
        flags: MessageFlags.Ephemeral
      });
    });

    it('should handle empty content', async () => {
      await replyEphemeral(mockInteraction as ChatInputCommandInteraction, '');

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '',
        flags: MessageFlags.Ephemeral
      });
    });
  });

  describe('replyPublic', () => {
    it('should reply without ephemeral flag', async () => {
      await replyPublic(mockInteraction as ChatInputCommandInteraction, 'Public message');

      expect(mockInteraction.reply).toHaveBeenCalledOnce();
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Public message'
      });
    });
  });

  describe('editReplyEphemeral', () => {
    it('should edit reply with content', async () => {
      await editReplyEphemeral(mockInteraction as ChatInputCommandInteraction, 'Edited message');

      expect(mockInteraction.editReply).toHaveBeenCalledOnce();
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: 'Edited message'
      });
    });
  });

  describe('replyWithEmbed', () => {
    it('should reply with embed ephemerally by default', async () => {
      const embed = new EmbedBuilder().setTitle('Test Embed');

      await replyWithEmbed(mockInteraction as ChatInputCommandInteraction, embed);

      expect(mockInteraction.reply).toHaveBeenCalledOnce();
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });
    });

    it('should reply with embed publicly when specified', async () => {
      const embed = new EmbedBuilder().setTitle('Public Embed');

      await replyWithEmbed(mockInteraction as ChatInputCommandInteraction, embed, false);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [embed]
      });
    });

    it('should reply with embed ephemerally when explicitly set to true', async () => {
      const embed = new EmbedBuilder().setTitle('Ephemeral Embed');

      await replyWithEmbed(mockInteraction as ChatInputCommandInteraction, embed, true);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });
    });
  });

  describe('replyWithEmbeds', () => {
    it('should reply with multiple embeds ephemerally', async () => {
      const embed1 = new EmbedBuilder().setTitle('Embed 1');
      const embed2 = new EmbedBuilder().setTitle('Embed 2');

      await replyWithEmbeds(mockInteraction as ChatInputCommandInteraction, [embed1, embed2]);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [embed1, embed2],
        flags: MessageFlags.Ephemeral
      });
    });

    it('should reply with multiple embeds publicly', async () => {
      const embed1 = new EmbedBuilder().setTitle('Embed 1');
      const embed2 = new EmbedBuilder().setTitle('Embed 2');

      await replyWithEmbeds(mockInteraction as ChatInputCommandInteraction, [embed1, embed2], false);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [embed1, embed2]
      });
    });

    it('should handle empty embed array', async () => {
      await replyWithEmbeds(mockInteraction as ChatInputCommandInteraction, []);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [],
        flags: MessageFlags.Ephemeral
      });
    });
  });

  describe('deferEphemeral', () => {
    it('should defer reply with ephemeral flag', async () => {
      await deferEphemeral(mockInteraction as ChatInputCommandInteraction);

      expect(mockInteraction.deferReply).toHaveBeenCalledOnce();
      expect(mockInteraction.deferReply).toHaveBeenCalledWith({
        flags: MessageFlags.Ephemeral
      });
    });
  });

  describe('deferPublic', () => {
    it('should defer reply publicly', async () => {
      await deferPublic(mockInteraction as ChatInputCommandInteraction);

      expect(mockInteraction.deferReply).toHaveBeenCalledOnce();
      expect(mockInteraction.deferReply).toHaveBeenCalledWith();
    });
  });

  describe('isRepliedOrDeferred', () => {
    it('should return false when neither replied nor deferred', () => {
      mockInteraction.replied = false;
      mockInteraction.deferred = false;

      const result = isRepliedOrDeferred(mockInteraction as ChatInputCommandInteraction);

      expect(result).toBe(false);
    });

    it('should return true when replied', () => {
      mockInteraction.replied = true;
      mockInteraction.deferred = false;

      const result = isRepliedOrDeferred(mockInteraction as ChatInputCommandInteraction);

      expect(result).toBe(true);
    });

    it('should return true when deferred', () => {
      mockInteraction.replied = false;
      mockInteraction.deferred = true;

      const result = isRepliedOrDeferred(mockInteraction as ChatInputCommandInteraction);

      expect(result).toBe(true);
    });

    it('should return true when both replied and deferred', () => {
      mockInteraction.replied = true;
      mockInteraction.deferred = true;

      const result = isRepliedOrDeferred(mockInteraction as ChatInputCommandInteraction);

      expect(result).toBe(true);
    });
  });

  describe('respondEphemeral', () => {
    it('should reply when not replied or deferred', async () => {
      mockInteraction.replied = false;
      mockInteraction.deferred = false;

      await respondEphemeral(mockInteraction as ChatInputCommandInteraction, 'Response');

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Response',
        flags: MessageFlags.Ephemeral
      });
      expect(mockInteraction.editReply).not.toHaveBeenCalled();
    });

    it('should edit reply when already replied', async () => {
      mockInteraction.replied = true;
      mockInteraction.deferred = false;

      await respondEphemeral(mockInteraction as ChatInputCommandInteraction, 'Updated response');

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: 'Updated response'
      });
      expect(mockInteraction.reply).not.toHaveBeenCalled();
    });

    it('should edit reply when deferred', async () => {
      mockInteraction.replied = false;
      mockInteraction.deferred = true;

      await respondEphemeral(mockInteraction as ChatInputCommandInteraction, 'Deferred response');

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: 'Deferred response'
      });
      expect(mockInteraction.reply).not.toHaveBeenCalled();
    });
  });

  describe('respondWithEmbed', () => {
    it('should reply with embed when not replied or deferred', async () => {
      mockInteraction.replied = false;
      mockInteraction.deferred = false;
      const embed = new EmbedBuilder().setTitle('Test');

      await respondWithEmbed(mockInteraction as ChatInputCommandInteraction, embed);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });
      expect(mockInteraction.editReply).not.toHaveBeenCalled();
    });

    it('should edit reply with embed when already deferred', async () => {
      mockInteraction.replied = false;
      mockInteraction.deferred = true;
      const embed = new EmbedBuilder().setTitle('Test');

      await respondWithEmbed(mockInteraction as ChatInputCommandInteraction, embed);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [embed]
      });
      expect(mockInteraction.reply).not.toHaveBeenCalled();
    });

    it('should reply publicly when ephemeral is false', async () => {
      mockInteraction.replied = false;
      mockInteraction.deferred = false;
      const embed = new EmbedBuilder().setTitle('Public');

      await respondWithEmbed(mockInteraction as ChatInputCommandInteraction, embed, false);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [embed]
      });
    });
  });

  describe('InteractionHelper class', () => {
    it('should provide static methods that call function equivalents', async () => {
      const embed = new EmbedBuilder().setTitle('Test');

      await InteractionHelper.replyEphemeral(
        mockInteraction as ChatInputCommandInteraction,
        'Test'
      );
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Test',
        flags: MessageFlags.Ephemeral
      });

      await InteractionHelper.deferEphemeral(mockInteraction as ChatInputCommandInteraction);
      expect(mockInteraction.deferReply).toHaveBeenCalled();

      const result = InteractionHelper.isRepliedOrDeferred(
        mockInteraction as ChatInputCommandInteraction
      );
      expect(result).toBe(false);
    });
  });
});
