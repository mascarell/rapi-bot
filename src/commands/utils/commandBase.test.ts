import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CommandBase,
  createSuccessReply,
  createErrorReply,
  createCommandContext
} from './commandBase.js';
import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';

// Mock the utility modules
vi.mock('../../utils/interactionHelpers.js', () => ({
  replyEphemeral: vi.fn().mockResolvedValue(undefined),
  editReplyEphemeral: vi.fn().mockResolvedValue(undefined),
  respondWithEmbed: vi.fn().mockResolvedValue(undefined),
  deferEphemeral: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../utils/commandErrorHandler.js', () => ({
  handleCommandError: vi.fn().mockResolvedValue(undefined),
  withErrorHandling: vi.fn((handler) => handler)
}));

vi.mock('../../utils/permissionHelpers.js', () => ({
  checkModPermission: vi.fn().mockResolvedValue(false),
  requireModPermission: vi.fn().mockResolvedValue(false)
}));

// Import mocked modules
import * as interactionHelpers from '../../utils/interactionHelpers.js';
import * as commandErrorHandler from '../../utils/commandErrorHandler.js';
import * as permissionHelpers from '../../utils/permissionHelpers.js';

describe('commandBase.ts', () => {
  let mockInteraction: Partial<ChatInputCommandInteraction>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockInteraction = {
      user: {
        id: 'user-123',
        tag: 'TestUser#1234'
      } as any,
      guild: {
        id: 'guild-123'
      } as any,
      reply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined)
    };
  });

  describe('CommandBase class', () => {
    // Create a concrete implementation for testing
    class TestCommand extends CommandBase {
      async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await this.replyEphemeral(interaction, 'test');
      }
    }

    let command: TestCommand;

    beforeEach(() => {
      command = new TestCommand();
    });

    describe('replyEphemeral', () => {
      it('should call replyEphemeral from interactionHelpers', async () => {
        await command['replyEphemeral'](mockInteraction as ChatInputCommandInteraction, 'test');

        expect(interactionHelpers.replyEphemeral).toHaveBeenCalledWith(
          mockInteraction,
          'test'
        );
      });
    });

    describe('editReplyEphemeral', () => {
      it('should call editReplyEphemeral from interactionHelpers', async () => {
        await command['editReplyEphemeral'](mockInteraction as ChatInputCommandInteraction, 'test');

        expect(interactionHelpers.editReplyEphemeral).toHaveBeenCalledWith(
          mockInteraction,
          'test'
        );
      });
    });

    describe('respondWithEmbed', () => {
      it('should call respondWithEmbed with ephemeral true by default', async () => {
        const embed = new EmbedBuilder().setTitle('Test');

        await command['respondWithEmbed'](mockInteraction as ChatInputCommandInteraction, embed);

        expect(interactionHelpers.respondWithEmbed).toHaveBeenCalledWith(
          mockInteraction,
          embed,
          true
        );
      });

      it('should call respondWithEmbed with ephemeral false when specified', async () => {
        const embed = new EmbedBuilder().setTitle('Test');

        await command['respondWithEmbed'](mockInteraction as ChatInputCommandInteraction, embed, false);

        expect(interactionHelpers.respondWithEmbed).toHaveBeenCalledWith(
          mockInteraction,
          embed,
          false
        );
      });
    });

    describe('deferEphemeral', () => {
      it('should call deferEphemeral from interactionHelpers', async () => {
        await command['deferEphemeral'](mockInteraction as ChatInputCommandInteraction);

        expect(interactionHelpers.deferEphemeral).toHaveBeenCalledWith(mockInteraction);
      });
    });

    describe('replySuccess', () => {
      it('should add success emoji to message', async () => {
        await command['replySuccess'](mockInteraction as ChatInputCommandInteraction, 'Done');

        expect(interactionHelpers.replyEphemeral).toHaveBeenCalledWith(
          mockInteraction,
          '✅ Done'
        );
      });

      it('should handle message without emoji', async () => {
        await command['replySuccess'](mockInteraction as ChatInputCommandInteraction, 'Success');

        expect(interactionHelpers.replyEphemeral).toHaveBeenCalledWith(
          mockInteraction,
          '✅ Success'
        );
      });
    });

    describe('replyError', () => {
      it('should add error emoji to message', async () => {
        await command['replyError'](mockInteraction as ChatInputCommandInteraction, 'Failed');

        expect(interactionHelpers.replyEphemeral).toHaveBeenCalledWith(
          mockInteraction,
          '❌ Failed'
        );
      });

      it('should handle message without emoji', async () => {
        await command['replyError'](mockInteraction as ChatInputCommandInteraction, 'Error occurred');

        expect(interactionHelpers.replyEphemeral).toHaveBeenCalledWith(
          mockInteraction,
          '❌ Error occurred'
        );
      });
    });

    describe('handleError', () => {
      it('should call handleCommandError with context', async () => {
        const error = new Error('Test error');

        await command['handleError'](mockInteraction as ChatInputCommandInteraction, error, 'testCommand');

        expect(commandErrorHandler.handleCommandError).toHaveBeenCalledWith(
          mockInteraction,
          error,
          'testCommand'
        );
      });

      it('should work with string errors', async () => {
        await command['handleError'](mockInteraction as ChatInputCommandInteraction, 'string error', 'test');

        expect(commandErrorHandler.handleCommandError).toHaveBeenCalledWith(
          mockInteraction,
          'string error',
          'test'
        );
      });
    });

    describe('checkMod', () => {
      it('should call checkModPermission', async () => {
        vi.mocked(permissionHelpers.checkModPermission).mockResolvedValue(true);

        const result = await command['checkMod'](mockInteraction as ChatInputCommandInteraction);

        expect(permissionHelpers.checkModPermission).toHaveBeenCalledWith(mockInteraction);
        expect(result).toBe(true);
      });

      it('should return false when user lacks permission', async () => {
        vi.mocked(permissionHelpers.checkModPermission).mockResolvedValue(false);

        const result = await command['checkMod'](mockInteraction as ChatInputCommandInteraction);

        expect(result).toBe(false);
      });
    });

    describe('requireMod', () => {
      it('should call requireModPermission with default message', async () => {
        vi.mocked(permissionHelpers.requireModPermission).mockResolvedValue(true);

        const result = await command['requireMod'](mockInteraction as ChatInputCommandInteraction);

        expect(permissionHelpers.requireModPermission).toHaveBeenCalledWith(
          mockInteraction,
          undefined
        );
        expect(result).toBe(true);
      });

      it('should call requireModPermission with custom message', async () => {
        vi.mocked(permissionHelpers.requireModPermission).mockResolvedValue(false);

        const result = await command['requireMod'](
          mockInteraction as ChatInputCommandInteraction,
          'Custom error'
        );

        expect(permissionHelpers.requireModPermission).toHaveBeenCalledWith(
          mockInteraction,
          'Custom error'
        );
        expect(result).toBe(false);
      });
    });

    describe('wrapHandler', () => {
      it('should call withErrorHandling', async () => {
        const handler = vi.fn().mockResolvedValue(undefined);

        const wrapped = command['wrapHandler'](handler, 'test');

        expect(commandErrorHandler.withErrorHandling).toHaveBeenCalledWith(
          handler,
          'test'
        );
      });
    });

    describe('execute method (abstract)', () => {
      it('should be callable on concrete implementation', async () => {
        await command.execute(mockInteraction as ChatInputCommandInteraction);

        expect(interactionHelpers.replyEphemeral).toHaveBeenCalledWith(
          mockInteraction,
          'test'
        );
      });
    });
  });

  describe('createSuccessReply', () => {
    it('should create function that sends success messages', async () => {
      const success = createSuccessReply(mockInteraction as ChatInputCommandInteraction);

      await success('Operation completed');

      expect(interactionHelpers.replyEphemeral).toHaveBeenCalledWith(
        mockInteraction,
        '✅ Operation completed'
      );
    });

    it('should create function that can be called multiple times', async () => {
      const success = createSuccessReply(mockInteraction as ChatInputCommandInteraction);

      await success('First message');
      await success('Second message');

      expect(interactionHelpers.replyEphemeral).toHaveBeenCalledTimes(2);
      expect(interactionHelpers.replyEphemeral).toHaveBeenNthCalledWith(
        1,
        mockInteraction,
        '✅ First message'
      );
      expect(interactionHelpers.replyEphemeral).toHaveBeenNthCalledWith(
        2,
        mockInteraction,
        '✅ Second message'
      );
    });

    it('should handle empty messages', async () => {
      const success = createSuccessReply(mockInteraction as ChatInputCommandInteraction);

      await success('');

      expect(interactionHelpers.replyEphemeral).toHaveBeenCalledWith(
        mockInteraction,
        '✅ '
      );
    });
  });

  describe('createErrorReply', () => {
    it('should create function that sends error messages', async () => {
      const error = createErrorReply(mockInteraction as ChatInputCommandInteraction);

      await error('Something went wrong');

      expect(interactionHelpers.replyEphemeral).toHaveBeenCalledWith(
        mockInteraction,
        '❌ Something went wrong'
      );
    });

    it('should create function that can be called multiple times', async () => {
      const error = createErrorReply(mockInteraction as ChatInputCommandInteraction);

      await error('First error');
      await error('Second error');

      expect(interactionHelpers.replyEphemeral).toHaveBeenCalledTimes(2);
      expect(interactionHelpers.replyEphemeral).toHaveBeenNthCalledWith(
        1,
        mockInteraction,
        '❌ First error'
      );
      expect(interactionHelpers.replyEphemeral).toHaveBeenNthCalledWith(
        2,
        mockInteraction,
        '❌ Second error'
      );
    });

    it('should handle empty messages', async () => {
      const error = createErrorReply(mockInteraction as ChatInputCommandInteraction);

      await error('');

      expect(interactionHelpers.replyEphemeral).toHaveBeenCalledWith(
        mockInteraction,
        '❌ '
      );
    });
  });

  describe('createCommandContext', () => {
    it('should create context with reply method', async () => {
      const ctx = createCommandContext(
        mockInteraction as ChatInputCommandInteraction,
        'test'
      );

      await ctx.reply('test message');

      expect(interactionHelpers.replyEphemeral).toHaveBeenCalledWith(
        mockInteraction,
        'test message'
      );
    });

    it('should create context with edit method', async () => {
      const ctx = createCommandContext(
        mockInteraction as ChatInputCommandInteraction,
        'test'
      );

      await ctx.edit('edited message');

      expect(interactionHelpers.editReplyEphemeral).toHaveBeenCalledWith(
        mockInteraction,
        'edited message'
      );
    });

    it('should create context with embed method', async () => {
      const ctx = createCommandContext(
        mockInteraction as ChatInputCommandInteraction,
        'test'
      );
      const embed = new EmbedBuilder().setTitle('Test');

      await ctx.embed(embed);

      expect(interactionHelpers.respondWithEmbed).toHaveBeenCalledWith(
        mockInteraction,
        embed,
        true
      );
    });

    it('should create context with embed method (non-ephemeral)', async () => {
      const ctx = createCommandContext(
        mockInteraction as ChatInputCommandInteraction,
        'test'
      );
      const embed = new EmbedBuilder().setTitle('Test');

      await ctx.embed(embed, false);

      expect(interactionHelpers.respondWithEmbed).toHaveBeenCalledWith(
        mockInteraction,
        embed,
        false
      );
    });

    it('should create context with defer method', async () => {
      const ctx = createCommandContext(
        mockInteraction as ChatInputCommandInteraction,
        'test'
      );

      await ctx.defer();

      expect(interactionHelpers.deferEphemeral).toHaveBeenCalledWith(mockInteraction);
    });

    it('should create context with success method', async () => {
      const ctx = createCommandContext(
        mockInteraction as ChatInputCommandInteraction,
        'test'
      );

      await ctx.success('Success message');

      expect(interactionHelpers.replyEphemeral).toHaveBeenCalledWith(
        mockInteraction,
        '✅ Success message'
      );
    });

    it('should create context with error method (string)', async () => {
      const ctx = createCommandContext(
        mockInteraction as ChatInputCommandInteraction,
        'test'
      );

      await ctx.error('Error message');

      expect(interactionHelpers.replyEphemeral).toHaveBeenCalledWith(
        mockInteraction,
        '❌ Error message'
      );
    });

    it('should create context with error method (Error object)', async () => {
      const ctx = createCommandContext(
        mockInteraction as ChatInputCommandInteraction,
        'testCommand'
      );
      const error = new Error('Test error');

      await ctx.error(error);

      expect(commandErrorHandler.handleCommandError).toHaveBeenCalledWith(
        mockInteraction,
        error,
        'testCommand'
      );
    });

    it('should create context with checkMod method', async () => {
      vi.mocked(permissionHelpers.checkModPermission).mockResolvedValue(true);

      const ctx = createCommandContext(
        mockInteraction as ChatInputCommandInteraction,
        'test'
      );

      const result = await ctx.checkMod();

      expect(permissionHelpers.checkModPermission).toHaveBeenCalledWith(mockInteraction);
      expect(result).toBe(true);
    });

    it('should create context with requireMod method', async () => {
      vi.mocked(permissionHelpers.requireModPermission).mockResolvedValue(true);

      const ctx = createCommandContext(
        mockInteraction as ChatInputCommandInteraction,
        'test'
      );

      const result = await ctx.requireMod();

      expect(permissionHelpers.requireModPermission).toHaveBeenCalledWith(
        mockInteraction,
        undefined
      );
      expect(result).toBe(true);
    });

    it('should create context with requireMod method (custom message)', async () => {
      vi.mocked(permissionHelpers.requireModPermission).mockResolvedValue(false);

      const ctx = createCommandContext(
        mockInteraction as ChatInputCommandInteraction,
        'test'
      );

      const result = await ctx.requireMod('Custom message');

      expect(permissionHelpers.requireModPermission).toHaveBeenCalledWith(
        mockInteraction,
        'Custom message'
      );
      expect(result).toBe(false);
    });

    it('should create context with wrap method', async () => {
      const ctx = createCommandContext(
        mockInteraction as ChatInputCommandInteraction,
        'testContext'
      );
      const handler = vi.fn().mockResolvedValue(undefined);

      const wrapped = ctx.wrap(handler);

      expect(commandErrorHandler.withErrorHandling).toHaveBeenCalledWith(
        handler,
        'testContext'
      );
    });

    it('should preserve context across method calls', async () => {
      const ctx = createCommandContext(
        mockInteraction as ChatInputCommandInteraction,
        'persistentContext'
      );

      await ctx.success('First');
      await ctx.error('Second');
      await ctx.reply('Third');

      // All calls should use the same interaction
      expect(interactionHelpers.replyEphemeral).toHaveBeenCalledTimes(3);
      expect(interactionHelpers.replyEphemeral).toHaveBeenNthCalledWith(
        1,
        mockInteraction,
        '✅ First'
      );
      expect(interactionHelpers.replyEphemeral).toHaveBeenNthCalledWith(
        2,
        mockInteraction,
        '❌ Second'
      );
      expect(interactionHelpers.replyEphemeral).toHaveBeenNthCalledWith(
        3,
        mockInteraction,
        'Third'
      );
    });
  });

  describe('Integration patterns', () => {
    it('should support class-based command pattern', async () => {
      class MyCommand extends CommandBase {
        async execute(interaction: ChatInputCommandInteraction): Promise<void> {
          if (!(await this.requireMod(interaction))) return;

          try {
            await this.replySuccess(interaction, 'Done');
          } catch (error) {
            await this.handleError(interaction, error, 'myCommand');
          }
        }
      }

      vi.mocked(permissionHelpers.requireModPermission).mockResolvedValue(true);

      const cmd = new MyCommand();
      await cmd.execute(mockInteraction as ChatInputCommandInteraction);

      expect(permissionHelpers.requireModPermission).toHaveBeenCalled();
      expect(interactionHelpers.replyEphemeral).toHaveBeenCalledWith(
        mockInteraction,
        '✅ Done'
      );
    });

    it('should support functional command pattern with context', async () => {
      async function execute(interaction: ChatInputCommandInteraction) {
        const cmd = createCommandContext(interaction, 'functionalCommand');

        if (!(await cmd.requireMod())) return;

        try {
          await cmd.success('Completed');
        } catch (error) {
          await cmd.error(error);
        }
      }

      vi.mocked(permissionHelpers.requireModPermission).mockResolvedValue(true);

      await execute(mockInteraction as ChatInputCommandInteraction);

      expect(permissionHelpers.requireModPermission).toHaveBeenCalled();
      expect(interactionHelpers.replyEphemeral).toHaveBeenCalledWith(
        mockInteraction,
        '✅ Completed'
      );
    });

    it('should support helper function pattern', async () => {
      const success = createSuccessReply(mockInteraction as ChatInputCommandInteraction);
      const error = createErrorReply(mockInteraction as ChatInputCommandInteraction);

      await success('Step 1 complete');
      await success('Step 2 complete');
      await error('Step 3 failed');

      expect(interactionHelpers.replyEphemeral).toHaveBeenCalledTimes(3);
    });
  });
});
