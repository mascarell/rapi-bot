import { describe, it, expect, vi } from 'vitest';

vi.mock('../../utils/channelRestrictions.js', () => ({
    enforceChannelRestriction: vi.fn().mockResolvedValue(false),
}));

import rapiball from '../rapiball';

describe('/rapiball', () => {
    it('echoes the question without pinging anyone', async () => {
        const interaction: any = {
            options: { getString: vi.fn(() => '@everyone <@&123456789012345678> <@123456789012345678> ok?') },
            reply: vi.fn().mockResolvedValue(undefined),
        };
        await rapiball.execute(interaction);
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toContain('@everyone');
        expect(arg.allowedMentions).toEqual({ parse: [] });
    });
});
