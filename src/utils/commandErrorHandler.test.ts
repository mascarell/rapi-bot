import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleCommandError,
  withErrorHandling,
  ValidationError,
  PermissionError,
  NotFoundError,
  handleTypedError,
  CommandErrorHandler
} from './commandErrorHandler.js';
import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { logger } from './logger.js';

// Mock the logger
vi.mock('./logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}));

describe('commandErrorHandler.ts', () => {
  let mockInteraction: Partial<ChatInputCommandInteraction>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockInteraction = {
      reply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      replied: false,
      deferred: false,
      user: {
        id: 'user-123',
        tag: 'TestUser#1234'
      } as any
    };
  });

  describe('handleCommandError', () => {
    it('should handle Error instance', async () => {
      const error = new Error('Test error message');

      await handleCommandError(mockInteraction as ChatInputCommandInteraction, error, 'testCommand');

      expect(logger.error).toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ Test error message',
        flags: MessageFlags.Ephemeral
      });
    });

    it('should handle string error', async () => {
      await handleCommandError(mockInteraction as ChatInputCommandInteraction, 'String error', 'testCommand');

      expect(logger.error).toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ String error',
        flags: MessageFlags.Ephemeral
      });
    });

    it('should handle unknown error type', async () => {
      await handleCommandError(mockInteraction as ChatInputCommandInteraction, { weird: 'object' }, 'testCommand');

      expect(logger.error).toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ An unknown error occurred',
        flags: MessageFlags.Ephemeral
      });
    });

    it('should use editReply if interaction is already replied', async () => {
      mockInteraction.replied = true;
      const error = new Error('Test error');

      await handleCommandError(mockInteraction as ChatInputCommandInteraction, error);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '❌ Test error'
      });
      expect(mockInteraction.reply).not.toHaveBeenCalled();
    });

    it('should use editReply if interaction is deferred', async () => {
      mockInteraction.deferred = true;
      const error = new Error('Test error');

      await handleCommandError(mockInteraction as ChatInputCommandInteraction, error);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '❌ Test error'
      });
      expect(mockInteraction.reply).not.toHaveBeenCalled();
    });

    it('should handle message already starting with ❌', async () => {
      const error = new Error('❌ Already has emoji');

      await handleCommandError(mockInteraction as ChatInputCommandInteraction, error);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ Already has emoji',
        flags: MessageFlags.Ephemeral
      });
    });

    it('should include context in log message', async () => {
      const error = new Error('Test error');

      await handleCommandError(mockInteraction as ChatInputCommandInteraction, error, 'myCommand');

      // LogTape uses tagged template, so it receives array of template parts + values
      expect(logger.error).toHaveBeenCalled();
      const callArgs = (logger.error as any).mock.calls[0];
      // Check that the call includes context
      expect(callArgs.some((arg: any) => String(arg).includes('myCommand'))).toBe(true);
    });

    it('should log without context if not provided', async () => {
      const error = new Error('Test error');

      await handleCommandError(mockInteraction as ChatInputCommandInteraction, error);

      expect(logger.error).toHaveBeenCalled();
    });

    it('should log stack trace for Error instances', async () => {
      const error = new Error('Test error');
      error.stack = 'Stack trace here';

      await handleCommandError(mockInteraction as ChatInputCommandInteraction, error);

      expect(logger.debug).toHaveBeenCalled();
    });

    it('should handle reply failure gracefully', async () => {
      mockInteraction.reply = vi.fn().mockRejectedValue(new Error('Reply failed'));
      const error = new Error('Original error');

      await handleCommandError(mockInteraction as ChatInputCommandInteraction, error);

      // Should log the reply failure
      expect(logger.error).toHaveBeenCalledTimes(2); // Original error + reply failure
    });
  });

  describe('withErrorHandling', () => {
    it('should wrap handler and catch errors', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Handler error'));
      const wrappedHandler = withErrorHandling(handler, 'testHandler');

      await wrappedHandler(mockInteraction);

      expect(handler).toHaveBeenCalledWith(mockInteraction);
      expect(logger.error).toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ Handler error',
        flags: MessageFlags.Ephemeral
      });
    });

    it('should not interfere if handler succeeds', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const wrappedHandler = withErrorHandling(handler, 'testHandler');

      await wrappedHandler(mockInteraction);

      expect(handler).toHaveBeenCalledWith(mockInteraction);
      expect(logger.error).not.toHaveBeenCalled();
      expect(mockInteraction.reply).not.toHaveBeenCalled();
    });

    it('should handle multiple arguments', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Error'));
      const wrappedHandler = withErrorHandling(handler, 'test');

      await wrappedHandler(mockInteraction, 'arg1', 'arg2');

      expect(handler).toHaveBeenCalledWith(mockInteraction, 'arg1', 'arg2');
    });

    it('should log error if no interaction found in args', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Error'));
      const wrappedHandler = withErrorHandling(handler, 'test');

      await wrappedHandler('not', 'an', 'interaction');

      expect(logger.error).toHaveBeenCalled();
      const callArgs = (logger.error as any).mock.calls[0];
      expect(callArgs.some((arg: any) => String(arg).includes('test'))).toBe(true);
    });
  });

  describe('Custom error classes', () => {
    it('should create ValidationError', () => {
      const error = new ValidationError('Invalid input');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('Invalid input');
    });

    it('should create PermissionError', () => {
      const error = new PermissionError('No permission');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(PermissionError);
      expect(error.name).toBe('PermissionError');
      expect(error.message).toBe('No permission');
    });

    it('should create NotFoundError', () => {
      const error = new NotFoundError('Not found');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.name).toBe('NotFoundError');
      expect(error.message).toBe('Not found');
    });
  });

  describe('handleTypedError', () => {
    it('should handle ValidationError with warning log', async () => {
      const error = new ValidationError('Validation failed');

      await handleTypedError(mockInteraction as ChatInputCommandInteraction, error, 'testCmd');

      expect(logger.warn).toHaveBeenCalled();
      const callArgs = (logger.warn as any).mock.calls[0];
      expect(callArgs.some((arg: any) => String(arg).includes('testCmd'))).toBe(true);
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ Validation failed',
        flags: MessageFlags.Ephemeral
      });
    });

    it('should handle PermissionError with warning log', async () => {
      const error = new PermissionError('Access denied');

      await handleTypedError(mockInteraction as ChatInputCommandInteraction, error, 'testCmd');

      expect(logger.warn).toHaveBeenCalled();
      const callArgs = (logger.warn as any).mock.calls[0];
      expect(callArgs.some((arg: any) => String(arg).includes('testCmd'))).toBe(true);
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ Access denied',
        flags: MessageFlags.Ephemeral
      });
    });

    it('should handle NotFoundError with info log', async () => {
      const error = new NotFoundError('Resource not found');

      await handleTypedError(mockInteraction as ChatInputCommandInteraction, error, 'testCmd');

      expect(logger.info).toHaveBeenCalled();
      const callArgs = (logger.info as any).mock.calls[0];
      expect(callArgs.some((arg: any) => String(arg).includes('testCmd'))).toBe(true);
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ Resource not found',
        flags: MessageFlags.Ephemeral
      });
    });

    it('should fall back to standard error handling for unknown types', async () => {
      const error = new Error('Standard error');

      await handleTypedError(mockInteraction as ChatInputCommandInteraction, error, 'testCmd');

      expect(logger.error).toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalled();
    });
  });

  describe('CommandErrorHandler class', () => {
    it('should provide static handle method', async () => {
      const error = new Error('Test error');

      await CommandErrorHandler.handle(
        mockInteraction as ChatInputCommandInteraction,
        error,
        'test'
      );

      expect(logger.error).toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalled();
    });

    it('should provide static handleTyped method', async () => {
      const error = new ValidationError('Invalid');

      await CommandErrorHandler.handleTyped(
        mockInteraction as ChatInputCommandInteraction,
        error,
        'test'
      );

      expect(logger.warn).toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalled();
    });

    it('should provide static wrap method', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Error'));
      const wrapped = CommandErrorHandler.wrap(handler, 'test');

      await wrapped(mockInteraction);

      expect(logger.error).toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('should handle null error', async () => {
      await handleCommandError(mockInteraction as ChatInputCommandInteraction, null);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ An unknown error occurred',
        flags: MessageFlags.Ephemeral
      });
    });

    it('should handle undefined error', async () => {
      await handleCommandError(mockInteraction as ChatInputCommandInteraction, undefined);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ An unknown error occurred',
        flags: MessageFlags.Ephemeral
      });
    });

    it('should handle number error', async () => {
      await handleCommandError(mockInteraction as ChatInputCommandInteraction, 42);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ An unknown error occurred',
        flags: MessageFlags.Ephemeral
      });
    });

    it('should handle empty string error', async () => {
      await handleCommandError(mockInteraction as ChatInputCommandInteraction, '');

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ ',
        flags: MessageFlags.Ephemeral
      });
    });
  });
});
