import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { EmbedTemplates } from '../../utils/embedTemplates.js';
import { getJobScheduler, JobInfo } from '../../services/scheduler/jobScheduler.js';
import { HOME_GUILD_ID } from '../../utils/data/homeGuild.js';

/**
 * /mod jobs — what the bot's timed jobs are doing.
 *
 * Jobs are bot-wide (daily resets, coupon scrapes, cleanups), not per server,
 * so this is shown in the home server only, like the other bot-wide tools.
 */

export const JOBS_HOME_ONLY_MESSAGE = 'Bot job status is only shown in the Rapi home server.';

const DESCRIPTION_LIMIT = 4096;
const ERROR_LIMIT = 120;

const unix = (d: Date) => Math.floor(d.getTime() / 1000);

export function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms} ms`;
    const s = ms / 1000;
    if (s < 60) return `${Number.isInteger(s) ? s : s.toFixed(1)} s`;
    const m = s / 60;
    if (m < 60) return `${Number.isInteger(m) ? m : m.toFixed(1)} min`;
    const h = m / 60;
    return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

function scheduleText(job: JobInfo): string {
    if (job.kind === 'cron') {
        const tz = job.tz === 'Etc/UTC' || job.tz === 'UTC' ? ' UTC' : job.tz ? ` ${job.tz}` : '';
        return `\`${job.cron}\`${tz}`;
    }
    if (job.kind === 'interval') return `every ${formatDuration(job.intervalMs ?? 0)}`;
    return `once, ${formatDuration(job.startupDelayMs ?? 0)} after start`;
}

type Status = 'running' | 'failed' | 'waiting' | 'ok';

function statusOf(job: JobInfo): Status {
    if (job.running) return 'running';
    if (job.lastError) return 'failed';
    if (job.runCount === 0) return 'waiting';
    return 'ok';
}

const ICON: Record<Status, string> = { running: '🔄', failed: '❌', waiting: '⏳', ok: '✅' };
// Failures first, so they are seen even when the list is cut short.
const ORDER: Record<Status, number> = { failed: 0, running: 1, ok: 2, waiting: 3 };

export function formatJobLine(job: JobInfo): string {
    const status = statusOf(job);
    const parts = [`${ICON[status]} **${job.name}** · ${scheduleText(job)}`];
    if (job.running && job.lastRunAt) {
        parts.push(`running since <t:${unix(job.lastRunAt)}:R>`);
    } else if (job.lastRunAt) {
        const took = job.lastDurationMs !== null ? ` (${formatDuration(job.lastDurationMs)})` : '';
        parts.push(`last <t:${unix(job.lastRunAt)}:R>${took}`);
    } else {
        parts.push('not run yet');
    }
    if (job.nextRunAt) parts.push(`next <t:${unix(job.nextRunAt)}:R>`);
    let line = parts.join(' · ');
    if (job.lastError) {
        const err = job.lastError.length > ERROR_LIMIT ? `${job.lastError.slice(0, ERROR_LIMIT - 1)}…` : job.lastError;
        line += `\n  ↳ \`${err.replace(/`/g, "'")}\``;
    }
    return line;
}

/** The embed body for a job list. Pure, for tests. */
export function formatJobList(jobs: JobInfo[]): { description: string; footer: string } {
    if (jobs.length === 0) return { description: 'No jobs are registered.', footer: '0 jobs' };

    const sorted = [...jobs].sort((a, b) =>
        ORDER[statusOf(a)] - ORDER[statusOf(b)] || a.name.localeCompare(b.name));

    const lines: string[] = [];
    let length = 0;
    let shown = 0;
    for (const job of sorted) {
        const line = formatJobLine(job);
        // Leave room for the "and N more" line.
        if (length + line.length + 1 > DESCRIPTION_LIMIT - 40) break;
        lines.push(line);
        length += line.length + 1;
        shown++;
    }
    if (shown < sorted.length) lines.push(`…and ${sorted.length - shown} more`);

    const counts = sorted.reduce((acc, j) => { acc[statusOf(j)]++; return acc; },
        { failed: 0, running: 0, ok: 0, waiting: 0 } as Record<Status, number>);
    const footer = [
        `${jobs.length} job${jobs.length === 1 ? '' : 's'}`,
        counts.failed ? `${counts.failed} failed last run` : '',
        counts.running ? `${counts.running} running` : '',
    ].filter(Boolean).join(' · ');

    return { description: lines.join('\n'), footer };
}

export async function handleJobs(interaction: ChatInputCommandInteraction): Promise<void> {
    if (interaction.guildId !== HOME_GUILD_ID) {
        await interaction.reply({ content: JOBS_HOME_ONLY_MESSAGE, flags: MessageFlags.Ephemeral });
        return;
    }
    const { description, footer } = formatJobList(getJobScheduler().list());
    const embed = EmbedTemplates.info('Scheduled jobs', description)
        .setFooter({ text: `${footer} · since the bot last started` });
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
