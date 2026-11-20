import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isModerator,
  MOD_REQUIRED_MESSAGE,
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

  describe('isModerator / checkModPermission', () => {
    const roleLookup = new Map<string, any>([
      ['role-mods', { name: 'mods' }],
      ['role-Mods', { name: 'Mods' }],
      ['role-MODS', { name: 'MODS' }],
      ['role-fan', { name: 'fan' }]
    ]);

    /** Fields Discord sends with the interaction; no member fetch involved. */
    function caller(opts: {
      userId?: string;
      perms?: bigint[];
      roles?: 'cache';
      roleIds?: string[];
    }) {
      const ids = opts.roleIds ?? [];
      const roles =
        opts.roles === 'cache' ? { cache: new Map(ids.map((id) => [id, {}])) } : ids;
      return {
        guild: { ownerId: 'owner-123', roles: { cache: roleLookup } },
        user: { id: opts.userId ?? 'user-123' },
        memberPermissions: { has: (p: bigint) => (opts.perms ?? []).includes(p) },
        member: { roles }
      } as any;
    }

    const both = async (interaction: any) => {
      const sync = isModerator(interaction);
      expect(await checkModPermission(interaction)).toBe(sync);
      return sync;
    };

    it('is true for the server owner', async () => {
      expect(await both(caller({ userId: 'owner-123' }))).toBe(true);
    });

    it('is true for Administrator', async () => {
      expect(await both(caller({ perms: [PermissionFlagsBits.Administrator] }))).toBe(true);
    });

    it('is true for Timeout Members', async () => {
      expect(await both(caller({ perms: [PermissionFlagsBits.ModerateMembers] }))).toBe(true);
    });

    it.each(['role-mods', 'role-Mods', 'role-MODS'])(
      'is true for a mods role (%s) given as an id array',
      async (id) => {
        expect(await both(caller({ roleIds: [id] }))).toBe(true);
      }
    );

    it('is true for a mods role given as a roles cache', async () => {
      expect(await both(caller({ roles: 'cache', roleIds: ['role-fan', 'role-mods'] }))).toBe(true);
    });

    it('is false for a plain member', async () => {
      expect(await both(caller({ roleIds: ['role-fan'] }))).toBe(false);
      expect(await both(caller({ roles: 'cache', roleIds: ['role-fan'] }))).toBe(false);
      expect(await both(caller({ perms: [PermissionFlagsBits.KickMembers] }))).toBe(false);
    });

    it('is false when no member data is present', async () => {
      const interaction = caller({});
      interaction.member = null;
      expect(await both(interaction)).toBe(false);
    });

    it('is false with no guild, even for the owner id', async () => {
      const interaction = caller({ userId: 'owner-123', perms: [PermissionFlagsBits.Administrator] });
      interaction.guild = null;
      expect(await both(interaction)).toBe(false);
    });

    it('never fetches the member', async () => {
      const interaction = caller({ roleIds: ['role-mods'] });
      interaction.guild.members = { fetch: vi.fn() };
      await checkModPermission(interaction);
      expect(interaction.guild.members.fetch).not.toHaveBeenCalled();
    });
  });

  describe('requireModPermission', () => {
    const interactionFor = (userId: string) =>
      ({
        guild: { ownerId: 'owner-123', roles: { cache: new Map() } },
        user: { id: userId },
        memberPermissions: { has: () => false },
        member: { roles: [] },
        reply: vi.fn().mockResolvedValue(undefined)
      }) as any;

    it('should return true and not reply if user has permission', async () => {
      const interaction = interactionFor('owner-123');
      expect(await requireModPermission(interaction)).toBe(true);
      expect(interaction.reply).not.toHaveBeenCalled();
    });

    it('should return false and reply with the shared message if user lacks permission', async () => {
      const interaction = interactionFor('user-123');
      expect(await requireModPermission(interaction)).toBe(false);
      expect(interaction.reply).toHaveBeenCalledWith({
        content: MOD_REQUIRED_MESSAGE,
        flags: expect.any(Number)
      });
    });

    it('should reply with custom message if provided', async () => {
      const interaction = interactionFor('user-123');
      const customMsg = 'Only mods can use this!';
      expect(await requireModPermission(interaction, customMsg)).toBe(false);
      expect(interaction.reply).toHaveBeenCalledWith({
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

      (mockInteraction as any).memberPermissions = {
        has: (p: bigint) => p === PermissionFlagsBits.ModerateMembers
      };
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
