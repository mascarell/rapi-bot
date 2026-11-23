import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';

vi.stubEnv('CDN_DOMAIN_URL', 'https://cdn.example.com');
vi.mock('../../utils/cdn/config', () => ({ s3Client: { send: vi.fn() }, S3_BUCKET: 'test-bucket' }));
vi.mock('../../config/assets', () => ({
    cacheBust: (url: string) => url,
    getAssetUrls: () => ({
        rapiBot: { thumbnail: 'https://example.com/thumb.png' },
        nikke: { logo: 'https://example.com/nikke.png' },
    }),
}));

import { formatJobList, formatJobLine, formatDuration, JOBS_HOME_ONLY_MESSAGE } from '../utils/modJobs';
import { getJobScheduler, resetJobScheduler, JobInfo } from '../../services/scheduler/jobScheduler';
import { HOME_GUILD_ID } from '../../utils/data/homeGuild';
import { MOD_REQUIRED_MESSAGE } from '../../utils/permissionHelpers';

const modCommand = (await import('../mod')).default;

const job = (over: Partial<JobInfo>): JobInfo => ({
    name: 'job',
    kind: 'interval',
    intervalMs: 60_000,
    running: false,
    runCount: 0,
    lastRunAt: null,
    lastDurationMs: null,
    lastError: null,
    nextRunAt: null,
    ...over,
});

const AT = new Date('2026-11-22T10:00:00Z');
const T = Math.floor(AT.getTime() / 1000);

describe('formatDuration', () => {
    it('picks a readable unit', () => {
        expect(formatDuration(250)).toBe('250 ms');
        expect(formatDuration(1500)).toBe('1.5 s');
        expect(formatDuration(60_000)).toBe('1 min');
        expect(formatDuration(6 * 3_600_000)).toBe('6 h');
    });
});

describe('formatJobLine', () => {
    it('shows a UTC cron with its last and next run', () => {
        const line = formatJobLine(job({
            name: 'daily-reset', kind: 'cron', cron: '0 20 * * *', tz: 'Etc/UTC', intervalMs: undefined,
            runCount: 1, lastRunAt: AT, lastDurationMs: 1200, nextRunAt: new Date(AT.getTime() + 86_400_000),
        }));
        expect(line).toBe(`✅ **daily-reset** · \`0 20 * * *\` UTC · last <t:${T}:R> (1.2 s) · next <t:${T + 86_400}:R>`);
    });

    it('shows a job that has not run yet', () => {
        expect(formatJobLine(job({ name: 'cleanup' }))).toBe('⏳ **cleanup** · every 1 min · not run yet');
    });

    it('shows a running job and when it started', () => {
        const line = formatJobLine(job({ name: 'twitch', running: true, runCount: 3, lastRunAt: AT }));
        expect(line).toContain('🔄 **twitch**');
        expect(line).toContain(`running since <t:${T}:R>`);
    });

    it('shows the last error, shortened and without backticks', () => {
        const line = formatJobLine(job({
            name: 'pvp', runCount: 1, lastRunAt: AT, lastDurationMs: 5, lastError: '`boom` ' + 'x'.repeat(300),
        }));
        expect(line.startsWith('❌ **pvp**')).toBe(true);
        const errLine = line.split('\n')[1];
        expect(errLine).toContain("'boom'");
        expect(errLine).not.toContain('`boom`');
        expect(errLine.length).toBeLessThan(140);
    });

    it('describes a one-shot', () => {
        expect(formatJobLine(job({ name: 'warmup', kind: 'once', intervalMs: undefined, startupDelayMs: 5000 })))
            .toContain('once, 5 s after start');
    });
});

describe('formatJobList', () => {
    it('puts failures first, then running, ok and waiting, by name', () => {
        const { description, footer } = formatJobList([
            job({ name: 'b-ok', runCount: 1, lastRunAt: AT, lastDurationMs: 1 }),
            job({ name: 'a-ok', runCount: 1, lastRunAt: AT, lastDurationMs: 1 }),
            job({ name: 'waiting' }),
            job({ name: 'busy', running: true, runCount: 1, lastRunAt: AT }),
            job({ name: 'broken', runCount: 1, lastRunAt: AT, lastDurationMs: 1, lastError: 'nope' }),
        ]);
        const names = description.split('\n').filter(l => l.includes('**')).map(l => l.match(/\*\*(.+?)\*\*/)![1]);
        expect(names).toEqual(['broken', 'busy', 'a-ok', 'b-ok', 'waiting']);
        expect(footer).toBe('5 jobs · 1 failed last run · 1 running');
    });

    it('says when nothing is registered', () => {
        expect(formatJobList([]).description).toBe('No jobs are registered.');
    });

    it('stays within the embed limit and says how many were cut', () => {
        const many = Array.from({ length: 80 }, (_, i) => job({
            name: `job-with-a-fairly-long-name-${String(i).padStart(2, '0')}`,
            runCount: 1, lastRunAt: AT, lastDurationMs: 10, nextRunAt: AT,
        }));
        const { description } = formatJobList(many);
        expect(description.length).toBeLessThanOrEqual(4096);
        expect(description).toMatch(/…and \d+ more$/);
    });
});

describe('/mod jobs', () => {
    beforeEach(() => resetJobScheduler());
    afterEach(() => resetJobScheduler());

    const interaction = (guildId: string, isMod = true) => ({
        guild: { id: guildId, name: 'Test', channels: { cache: { find: () => undefined } } },
        guildId,
        memberPermissions: { has: (p: bigint) => isMod && p === PermissionFlagsBits.ModerateMembers },
        member: { roles: [] },
        user: { id: '111111111111111111', tag: 'Mod#0001' },
        options: { getSubcommandGroup: () => null, getSubcommand: () => 'jobs' },
        reply: vi.fn().mockResolvedValue({}),
    }) as any;

    it('is a top-level /mod subcommand', () => {
        const json = modCommand.data.toJSON() as any;
        const jobs = json.options.find((o: any) => o.name === 'jobs');
        expect(jobs?.type).toBe(1);
    });

    it('lists the registered jobs in the home server', async () => {
        getJobScheduler().register({ name: 'tick', intervalMs: 3_600_000 }, () => {});
        const i = interaction(HOME_GUILD_ID);
        await modCommand.execute(i);
        const reply = i.reply.mock.calls[0][0];
        expect(reply.flags).toBeDefined();
        const embed = reply.embeds[0].toJSON();
        expect(embed.title).toContain('Scheduled jobs');
        expect(embed.description).toContain('**tick** · every 1 h · not run yet');
        expect(embed.footer.text).toContain('1 job');
    });

    it('refuses outside the home server', async () => {
        const i = interaction('300000000000000009');
        await modCommand.execute(i);
        expect(i.reply.mock.calls[0][0].content).toBe(JOBS_HOME_ONLY_MESSAGE);
    });

    it('refuses non-moderators', async () => {
        const i = interaction(HOME_GUILD_ID, false);
        await modCommand.execute(i);
        expect(i.reply.mock.calls[0][0].content).toBe(MOD_REQUIRED_MESSAGE);
    });
});
