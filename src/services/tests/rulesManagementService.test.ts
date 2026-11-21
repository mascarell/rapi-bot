import { describe, it, expect, vi } from 'vitest';

vi.mock('../gachaGuildConfigService.js', () => ({
    getGachaGuildConfigService: () => ({
        getAllowedGuildIds: async () => ['1054761356416528475', '300000000000000009'],
        getConfig: async () => ({}),
    }),
}));
vi.mock('../../utils/logger.js', () => ({
    logger: new Proxy({}, { get: () => () => undefined }),
}));

import { getRulesManagementService } from '../rulesManagementService';
import { HOME_GUILD_ID } from '../../utils/data/homeGuild';

describe('initializeRulesMessage', () => {
    it('only posts the rules in the home server', async () => {
        const fetch = vi.fn().mockResolvedValue(null);
        await getRulesManagementService().initializeRulesMessage({ guilds: { fetch } } as any);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith(HOME_GUILD_ID);
    });
});
