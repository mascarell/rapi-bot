import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../utils/cdn/config', () => ({ s3Client: { send: vi.fn() }, S3_BUCKET: 'test-bucket' }));

import { s3Client } from '../../utils/cdn/config';
import { getGachaGuildConfigService } from '../gachaGuildConfigService';

const body = (ids: string[]) => ({ Body: { transformToString: async () => JSON.stringify({ allowedGuildIds: ids }) } });

describe('guild config cache', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        getGachaGuildConfigService().clearCache();
        vi.mocked(s3Client.send).mockReset();
    });
    afterEach(() => vi.useRealTimers());

    it('answers from an expired copy at once and refreshes behind it', async () => {
        vi.mocked(s3Client.send).mockResolvedValueOnce(body(['1']) as any);
        const service = getGachaGuildConfigService();
        expect(await service.isGuildAllowed('1')).toBe(true);

        vi.advanceTimersByTime(24 * 60 * 60 * 1000);
        let finishRead!: (v: any) => void;
        vi.mocked(s3Client.send).mockReturnValueOnce(new Promise(r => { finishRead = r; }) as any);

        // Storage hasn't answered, yet the check returns with the old list.
        expect(await service.isGuildAllowed('1')).toBe(true);
        expect(s3Client.send).toHaveBeenCalledTimes(2);

        finishRead(body(['2']));
        await vi.waitFor(async () => expect(await service.isGuildAllowed('2')).toBe(true));
    });

    it('shares one read between callers when nothing is cached', async () => {
        vi.mocked(s3Client.send).mockResolvedValue(body(['1']) as any);
        const service = getGachaGuildConfigService();
        await Promise.all([service.getConfig(), service.getConfig(), service.getConfig()]);
        expect(s3Client.send).toHaveBeenCalledTimes(1);
    });
});
