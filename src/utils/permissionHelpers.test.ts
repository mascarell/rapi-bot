import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  checkModPermission,
  requireModPermission,
  hasRole,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  isGuildOwner,
  isAdmin,
  getMember,
  PermissionHelper
} from './permissionHelpers.js';
import { ChatInputCommandInteraction, PermissionFlagsBits, Guild, GuildMember } from 'discord.js';

describe('permissionHelpers.ts', () => {
  let mockInteraction: Partial<ChatInputCommandInteraction>;
  let mockGuild: Partial<Guild>;
  let mockMember: Partial<GuildMember>;

  beforeEach(() => {
    // Create Collection-like object for roles.cache
    const rolesCache = new Map();
    (rolesCache as any).some = function(predicate: (role: any) => boolean) {
      for (const [, role] of this) {
        if (predicate(role)) return true;
      }
      return false;
    };

    // Create mock member with roles and permissions
    mockMember = {
      roles: {
        cache: rolesCache
      } as any,
      permissions: {
        has: vi.fn().mockReturnValue(false)
      } as any
    };

    // Create mock guild
    mockGuild = {
      ownerId: 'owner-123',
      members: {
        fetch: vi.fn().mockResolvedValue(mockMember)
      } as any
    };

    // Create mock interaction
    mockInteraction = {
      guild: mockGuild as Guild,
      user: {
        id: 'user-123'
      } as any,
      reply: vi.fn().mockResolvedValue(undefined)
    };
  });

  describe('checkModPermission', () => {
    it('should return true if user has mods role', async () => {
      const modsRole = { name: 'mods' } as any;
      (mockMember.roles!.cache as Map<string, any>).set('role-1', modsRole);

      const result = await checkModPermission(mockInteraction as ChatInputCommandInteraction);

      expect(result).toBe(true);
    });

    it('should return true if user has Mods role (case insensitive)', async () => {
      const modsRole = { name: 'Mods' } as any;
      (mockMember.roles!.cache as Map<string, any>).set('role-1', modsRole);

      const result = await checkModPermission(mockInteraction as ChatInputCommandInteraction);

      expect(result).toBe(true);
    });

    it('should return true if user has MODS role (uppercase)', async () => {
      const modsRole = { name: 'MODS' } as any;
      (mockMember.roles!.cache as Map<string, any>).set('role-1', modsRole);

      const result = await checkModPermission(mockInteraction as ChatInputCommandInteraction);

      expect(result).toBe(true);
    });

    it('should return true if user has Administrator permission', async () => {
      mockMember.permissions!.has = vi.fn().mockReturnValue(true);

      const result = await checkModPermission(mockInteraction as ChatInputCommandInteraction);

      expect(result).toBe(true);
      expect(mockMember.permissions!.has).toHaveBeenCalledWith(PermissionFlagsBits.Administrator);
    });

    it('should return false if user has neither mods role nor admin permission', async () => {
      const otherRole = { name: 'member' } as any;
      (mockMember.roles!.cache as Map<string, any>).set('role-1', otherRole);
      mockMember.permissions!.has = vi.fn().mockReturnValue(false);

      const result = await checkModPermission(mockInteraction as ChatInputCommandInteraction);

      expect(result).toBe(false);
    });

    it('should return false if guild is null', async () => {
      mockInteraction.guild = null;

      const result = await checkModPermission(mockInteraction as ChatInputCommandInteraction);

      expect(result).toBe(false);
    });

    it('should return false if fetching member fails', async () => {
      mockGuild.members!.fetch = vi.fn().mockRejectedValue(new Error('Member not found'));

      const result = await checkModPermission(mockInteraction as ChatInputCommandInteraction);

      expect(result).toBe(false);
    });
  });

  describe('requireModPermission', () => {
    it('should return true and not reply if user has permission', async () => {
      const modsRole = { name: 'mods' } as any;
      (mockMember.roles!.cache as Map<string, any>).set('role-1', modsRole);

      const result = await requireModPermission(mockInteraction as ChatInputCommandInteraction);

      expect(result).toBe(true);
      expect(mockInteraction.reply).not.toHaveBeenCalled();
    });

    it('should return false and reply with default message if user lacks permission', async () => {
      mockMember.permissions!.has = vi.fn().mockReturnValue(false);

      const result = await requireModPermission(mockInteraction as ChatInputCommandInteraction);

      expect(result).toBe(false);
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ You do not have permission to use this command.',
        flags: expect.any(Number)
      });
    });

    it('should reply with custom message if provided', async () => {
      const customMsg = 'Only mods can use this!';

      const result = await requireModPermission(
        mockInteraction as ChatInputCommandInteraction,
        customMsg
      );

      expect(result).toBe(false);
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: customMsg,
        flags: expect.any(Number)
      });
    });
  });

  describe('hasRole', () => {
    it('should return true if user has the specified role', async () => {
      const testRole = { name: 'TestRole' } as any;
      (mockMember.roles!.cache as Map<string, any>).set('role-1', testRole);

      const result = await hasRole(mockInteraction as ChatInputCommandInteraction, 'TestRole');

      expect(result).toBe(true);
    });

    it('should be case insensitive', async () => {
      const testRole = { name: 'TestRole' } as any;
      (mockMember.roles!.cache as Map<string, any>).set('role-1', testRole);

      const result = await hasRole(mockInteraction as ChatInputCommandInteraction, 'testrole');

      expect(result).toBe(true);
    });

    it('should return false if user does not have the role', async () => {
      const otherRole = { name: 'OtherRole' } as any;
      (mockMember.roles!.cache as Map<string, any>).set('role-1', otherRole);

      const result = await hasRole(mockInteraction as ChatInputCommandInteraction, 'TestRole');

      expect(result).toBe(false);
    });

    it('should return false if guild is null', async () => {
      mockInteraction.guild = null;

      const result = await hasRole(mockInteraction as ChatInputCommandInteraction, 'TestRole');

      expect(result).toBe(false);
    });
  });

  describe('hasPermission', () => {
    it('should return true if user has the permission', async () => {
      mockMember.permissions!.has = vi.fn().mockReturnValue(true);

      const result = await hasPermission(
        mockInteraction as ChatInputCommandInteraction,
        PermissionFlagsBits.ManageMessages
      );

      expect(result).toBe(true);
      expect(mockMember.permissions!.has).toHaveBeenCalledWith(PermissionFlagsBits.ManageMessages);
    });

    it('should return false if user does not have the permission', async () => {
      mockMember.permissions!.has = vi.fn().mockReturnValue(false);

      const result = await hasPermission(
        mockInteraction as ChatInputCommandInteraction,
        PermissionFlagsBits.ManageMessages
      );

      expect(result).toBe(false);
    });

    it('should return false if guild is null', async () => {
      mockInteraction.guild = null;

      const result = await hasPermission(
        mockInteraction as ChatInputCommandInteraction,
        PermissionFlagsBits.ManageMessages
      );

      expect(result).toBe(false);
    });
  });

  describe('hasAnyPermission', () => {
    it('should return true if user has any of the permissions', async () => {
      mockMember.permissions!.has = vi
        .fn()
        .mockImplementation((perm: bigint) => perm === PermissionFlagsBits.ManageMessages);

      const result = await hasAnyPermission(mockInteraction as ChatInputCommandInteraction, [
        PermissionFlagsBits.Administrator,
        PermissionFlagsBits.ManageMessages
      ]);

      expect(result).toBe(true);
    });

    it('should return false if user has none of the permissions', async () => {
      mockMember.permissions!.has = vi.fn().mockReturnValue(false);

      const result = await hasAnyPermission(mockInteraction as ChatInputCommandInteraction, [
        PermissionFlagsBits.Administrator,
        PermissionFlagsBits.ManageMessages
      ]);

      expect(result).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    it('should return true if user has all permissions', async () => {
      mockMember.permissions!.has = vi.fn().mockReturnValue(true);

      const result = await hasAllPermissions(mockInteraction as ChatInputCommandInteraction, [
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ManageRoles
      ]);

      expect(result).toBe(true);
    });

    it('should return false if user is missing any permission', async () => {
      mockMember.permissions!.has = vi
        .fn()
        .mockImplementation((perm: bigint) => perm === PermissionFlagsBits.ManageMessages);

      const result = await hasAllPermissions(mockInteraction as ChatInputCommandInteraction, [
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ManageRoles
      ]);

      expect(result).toBe(false);
    });
  });

  describe('isGuildOwner', () => {
    it('should return true if user is guild owner', async () => {
      mockInteraction.user!.id = 'owner-123';

      const result = await isGuildOwner(mockInteraction as ChatInputCommandInteraction);

      expect(result).toBe(true);
    });

    it('should return false if user is not guild owner', async () => {
      mockInteraction.user!.id = 'user-456';

      const result = await isGuildOwner(mockInteraction as ChatInputCommandInteraction);

      expect(result).toBe(false);
    });

    it('should return false if guild is null', async () => {
      mockInteraction.guild = null;

      const result = await isGuildOwner(mockInteraction as ChatInputCommandInteraction);

      expect(result).toBe(false);
    });
  });

  describe('isAdmin', () => {
    it('should return true if user is guild owner', async () => {
      mockInteraction.user!.id = 'owner-123';

      const result = await isAdmin(mockInteraction as ChatInputCommandInteraction);

      expect(result).toBe(true);
    });

    it('should return true if user has Administrator permission', async () => {
      mockInteraction.user!.id = 'user-456';
      mockMember.permissions!.has = vi.fn().mockReturnValue(true);

      const result = await isAdmin(mockInteraction as ChatInputCommandInteraction);

      expect(result).toBe(true);
    });

    it('should return false if user is neither owner nor admin', async () => {
      mockInteraction.user!.id = 'user-456';
      mockMember.permissions!.has = vi.fn().mockReturnValue(false);

      const result = await isAdmin(mockInteraction as ChatInputCommandInteraction);

      expect(result).toBe(false);
    });
  });

  describe('getMember', () => {
    it('should return member if found', async () => {
      const result = await getMember(mockInteraction as ChatInputCommandInteraction);

      expect(result).toBe(mockMember);
    });

    it('should return null if guild is null', async () => {
      mockInteraction.guild = null;

      const result = await getMember(mockInteraction as ChatInputCommandInteraction);

      expect(result).toBeNull();
    });

    it('should return null if fetch fails', async () => {
      mockGuild.members!.fetch = vi.fn().mockRejectedValue(new Error('Not found'));

      const result = await getMember(mockInteraction as ChatInputCommandInteraction);

      expect(result).toBeNull();
    });
  });

  describe('PermissionHelper class', () => {
    it('should provide static methods that call function equivalents', async () => {
      const modsRole = { name: 'mods' } as any;
      (mockMember.roles!.cache as Map<string, any>).set('role-1', modsRole);

      const checkResult = await PermissionHelper.checkMod(
        mockInteraction as ChatInputCommandInteraction
      );
      expect(checkResult).toBe(true);

      const hasRoleResult = await PermissionHelper.hasRole(
        mockInteraction as ChatInputCommandInteraction,
        'mods'
      );
      expect(hasRoleResult).toBe(true);

      mockInteraction.user!.id = 'owner-123';
      const ownerResult = await PermissionHelper.isGuildOwner(
        mockInteraction as ChatInputCommandInteraction
      );
      expect(ownerResult).toBe(true);

      const memberResult = await PermissionHelper.getMember(
        mockInteraction as ChatInputCommandInteraction
      );
      expect(memberResult).toBe(mockMember);
    });
  });
});
