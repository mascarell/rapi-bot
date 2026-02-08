import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createPaginatedMessage,
  PaginationBuilder
} from './paginationBuilder.js';
import {
  EmbedBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
  ComponentType
} from 'discord.js';

describe('paginationBuilder.ts', () => {
  let mockInteraction: Partial<ChatInputCommandInteraction>;
  let mockMessage: any;
  let mockCollector: any;
  let pages: EmbedBuilder[];

  beforeEach(() => {
    // Create mock collector
    mockCollector = {
      on: vi.fn((event, handler) => {
        if (event === 'collect') {
          mockCollector.collectHandler = handler;
        } else if (event === 'end') {
          mockCollector.endHandler = handler;
        }
      })
    };

    // Create mock message
    mockMessage = {
      createMessageComponentCollector: vi.fn().mockReturnValue(mockCollector),
      edit: vi.fn().mockResolvedValue(undefined)
    };

    // Create mock interaction
    mockInteraction = {
      editReply: vi.fn().mockResolvedValue(mockMessage),
      user: {
        id: 'user-123',
        tag: 'TestUser#1234'
      } as any
    };

    // Create test pages
    pages = [
      new EmbedBuilder().setTitle('Page 1'),
      new EmbedBuilder().setTitle('Page 2'),
      new EmbedBuilder().setTitle('Page 3')
    ];
  });

  describe('createPaginatedMessage', () => {
    it('should throw error for empty pages', async () => {
      await expect(
        createPaginatedMessage(mockInteraction as ChatInputCommandInteraction, [], {
          customIdPrefix: 'test'
        })
      ).rejects.toThrow('Cannot paginate empty pages array');
    });

    it('should send single page without buttons', async () => {
      const singlePage = [new EmbedBuilder().setTitle('Only Page')];

      await createPaginatedMessage(mockInteraction as ChatInputCommandInteraction, singlePage, {
        customIdPrefix: 'test'
      });

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [singlePage[0]]
      });
      expect(mockMessage.createMessageComponentCollector).not.toHaveBeenCalled();
    });

    it('should send multi-page with navigation buttons', async () => {
      await createPaginatedMessage(mockInteraction as ChatInputCommandInteraction, pages, {
        customIdPrefix: 'test'
      });

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [pages[0]],
        components: expect.arrayContaining([expect.anything()])
      });

      expect(mockMessage.createMessageComponentCollector).toHaveBeenCalledWith({
        componentType: ComponentType.Button,
        time: 5 * 60 * 1000
      });
    });

    it('should use custom timeout', async () => {
      const customTimeout = 10 * 60 * 1000;

      await createPaginatedMessage(mockInteraction as ChatInputCommandInteraction, pages, {
        customIdPrefix: 'test',
        timeoutMs: customTimeout
      });

      expect(mockMessage.createMessageComponentCollector).toHaveBeenCalledWith({
        componentType: ComponentType.Button,
        time: customTimeout
      });
    });

    it('should handle next button click', async () => {
      await createPaginatedMessage(mockInteraction as ChatInputCommandInteraction, pages, {
        customIdPrefix: 'test'
      });

      const mockButtonInteraction = {
        user: { id: 'user-123' },
        customId: 'test_next',
        update: vi.fn().mockResolvedValue(undefined)
      };

      await mockCollector.collectHandler(mockButtonInteraction);

      expect(mockButtonInteraction.update).toHaveBeenCalledWith({
        embeds: [pages[1]],
        components: expect.arrayContaining([expect.anything()])
      });
    });

    it('should handle previous button click', async () => {
      await createPaginatedMessage(mockInteraction as ChatInputCommandInteraction, pages, {
        customIdPrefix: 'test'
      });

      // Click next first to go to page 2
      const mockNextButton = {
        user: { id: 'user-123' },
        customId: 'test_next',
        update: vi.fn().mockResolvedValue(undefined)
      };
      await mockCollector.collectHandler(mockNextButton);

      // Then click previous to go back to page 1
      const mockPrevButton = {
        user: { id: 'user-123' },
        customId: 'test_previous',
        update: vi.fn().mockResolvedValue(undefined)
      };
      await mockCollector.collectHandler(mockPrevButton);

      expect(mockPrevButton.update).toHaveBeenCalledWith({
        embeds: [pages[0]],
        components: expect.arrayContaining([expect.anything()])
      });
    });

    it('should reject unauthorized users', async () => {
      await createPaginatedMessage(mockInteraction as ChatInputCommandInteraction, pages, {
        customIdPrefix: 'test'
      });

      const mockUnauthorizedInteraction = {
        user: { id: 'different-user' },
        customId: 'test_next',
        reply: vi.fn().mockResolvedValue(undefined),
        update: vi.fn()
      };

      await mockCollector.collectHandler(mockUnauthorizedInteraction);

      expect(mockUnauthorizedInteraction.reply).toHaveBeenCalledWith({
        content: '❌ You cannot use these buttons.',
        flags: MessageFlags.Ephemeral
      });
      expect(mockUnauthorizedInteraction.update).not.toHaveBeenCalled();
    });

    it('should use custom unauthorized message', async () => {
      const customMessage = 'Access denied!';

      await createPaginatedMessage(mockInteraction as ChatInputCommandInteraction, pages, {
        customIdPrefix: 'test',
        unauthorizedMessage: customMessage
      });

      const mockUnauthorizedInteraction = {
        user: { id: 'different-user' },
        customId: 'test_next',
        reply: vi.fn().mockResolvedValue(undefined)
      };

      await mockCollector.collectHandler(mockUnauthorizedInteraction);

      expect(mockUnauthorizedInteraction.reply).toHaveBeenCalledWith({
        content: `❌ ${customMessage}`,
        flags: MessageFlags.Ephemeral
      });
    });

    it('should disable buttons on collector end', async () => {
      await createPaginatedMessage(mockInteraction as ChatInputCommandInteraction, pages, {
        customIdPrefix: 'test'
      });

      await mockCollector.endHandler();

      expect(mockMessage.edit).toHaveBeenCalledWith({
        components: expect.arrayContaining([expect.anything()])
      });
    });

    it('should handle message edit failure on collector end', async () => {
      mockMessage.edit = vi.fn().mockRejectedValue(new Error('Message deleted'));

      await createPaginatedMessage(mockInteraction as ChatInputCommandInteraction, pages, {
        customIdPrefix: 'test'
      });

      // Should not throw
      await expect(mockCollector.endHandler()).resolves.toBeUndefined();
    });

    it('should not go beyond last page', async () => {
      await createPaginatedMessage(mockInteraction as ChatInputCommandInteraction, pages, {
        customIdPrefix: 'test'
      });

      // Click next twice to get to last page
      const mockButton = {
        user: { id: 'user-123' },
        customId: 'test_next',
        update: vi.fn().mockResolvedValue(undefined)
      };

      await mockCollector.collectHandler(mockButton);
      await mockCollector.collectHandler(mockButton);
      await mockCollector.collectHandler(mockButton); // Try to go past last page

      // Should still be on page 3 (index 2)
      expect(mockButton.update).toHaveBeenLastCalledWith({
        embeds: [pages[2]],
        components: expect.arrayContaining([expect.anything()])
      });
    });

    it('should not go before first page', async () => {
      await createPaginatedMessage(mockInteraction as ChatInputCommandInteraction, pages, {
        customIdPrefix: 'test'
      });

      const mockButton = {
        user: { id: 'user-123' },
        customId: 'test_previous',
        update: vi.fn().mockResolvedValue(undefined)
      };

      await mockCollector.collectHandler(mockButton);

      // Should still be on page 1 (index 0)
      expect(mockButton.update).toHaveBeenCalledWith({
        embeds: [pages[0]],
        components: expect.arrayContaining([expect.anything()])
      });
    });
  });

  describe('PaginationBuilder class', () => {
    it('should build pagination with fluent API', async () => {
      const builder = PaginationBuilder.create()
        .setPages(pages)
        .setCustomIdPrefix('builder')
        .setTimeout(10000);

      await builder.send(mockInteraction as ChatInputCommandInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it('should allow adding pages individually', async () => {
      const builder = PaginationBuilder.create()
        .addPage(pages[0])
        .addPage(pages[1])
        .setCustomIdPrefix('builder');

      await builder.send(mockInteraction as ChatInputCommandInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it('should throw error if customIdPrefix not set', async () => {
      const builder = PaginationBuilder.create().setPages(pages);

      await expect(
        builder.send(mockInteraction as ChatInputCommandInteraction)
      ).rejects.toThrow('Custom ID prefix is required');
    });

    it('should support all configuration options', async () => {
      const builder = PaginationBuilder.create()
        .setPages(pages)
        .setCustomIdPrefix('test')
        .setTimeout(30000)
        .setShowPageNumbers(false)
        .setUnauthorizedMessage('No access');

      await builder.send(mockInteraction as ChatInputCommandInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it('should support method chaining', () => {
      const builder = PaginationBuilder.create();

      expect(builder.setPages(pages)).toBe(builder);
      expect(builder.setCustomIdPrefix('test')).toBe(builder);
      expect(builder.setTimeout(1000)).toBe(builder);
      expect(builder.setShowPageNumbers(true)).toBe(builder);
      expect(builder.setUnauthorizedMessage('test')).toBe(builder);
    });
  });
});
