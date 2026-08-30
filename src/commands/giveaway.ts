import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { getGiveawayDataService } from '../services/giveawayDataService.js';
import { getGiveawayManagementService } from '../services/giveawayManagementService.js';
import { getGiveawayWheelService } from '../services/giveawayWheelService.js';
import { EndCondition } from '../utils/interfaces/Giveaway.interface.js';
import { GIVEAWAY_CONFIG } from '../utils/data/giveawayConfig.js';
import { getGachaGuildConfigService } from '../services/gachaGuildConfigService.js';
import { requireModPermission } from '../utils/permissionHelpers.js';
import { handleCommandError } from '../utils/commandErrorHandler.js';
import { replyEphemeral, deferEphemeral, respondEphemeral } from '../utils/interactionHelpers.js';
import { successEmbed, infoEmbed, errorEmbed, EmbedColors, customEmbed } from '../utils/embedTemplates.js';
import { createPaginatedMessage } from './utils/paginationBuilder.js';

function parseEndTime(input: string): Date | null {
    const isoDate = new Date(input);
    if (!isNaN(isoDate.getTime()) && isoDate > new Date()) return isoDate;

    const match = input.match(/^(\d+)(m|h|d)$/i);
    if (!match) return null;

    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    const ms = unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
    return new Date(Date.now() + amount * ms);
}

function toTimestamp(iso: string): string {
    return `<t:${Math.floor(new Date(iso).getTime() / 1000)}`;
}

// ==================== User Command Handlers ====================

async function handleJoin(interaction: ChatInputCommandInteraction): Promise<void> {
    await deferEphemeral(interaction);

    const giveawayId = interaction.options.getString('giveaway-id', true);
    const dataService = getGiveawayDataService();

    const giveaway = await dataService.getGiveaway(giveawayId);
    if (!giveaway) {
        await interaction.editReply({ content: '❌ Giveaway not found. Please check the ID and try again.' });
        return;
    }
    if (giveaway.status !== 'active') {
        await interaction.editReply({ content: '❌ This giveaway is not currently active.' });
        return;
    }

    const result = await dataService.enterGiveaway(giveawayId, {
        discordId: interaction.user.id,
        enteredAt: new Date().toISOString(),
        username: interaction.user.username,
    });

    if (!result.success) {
        await interaction.editReply({ content: `❌ ${result.error}` });
        return;
    }

    let message = `You've entered the giveaway for **${giveaway.prizeName}**!`;
    if (result.previousGiveaway) {
        message += `\n\nYou were automatically removed from "${result.previousGiveaway}" since you can only be in one active giveaway at a time.`;
    }
    await interaction.editReply({ embeds: [successEmbed('Giveaway Joined!', message)] });

    // Check if entry limit was reached
    const managementService = getGiveawayManagementService();
    await managementService.checkEndConditions(interaction.client, giveawayId);
}

async function handleLeave(interaction: ChatInputCommandInteraction): Promise<void> {
    await deferEphemeral(interaction);
    const dataService = getGiveawayDataService();

    const activeEntry = await dataService.getUserActiveEntry(interaction.user.id);
    if (!activeEntry) {
        await interaction.editReply({ content: '❌ You are not entered in any active giveaway.' });
        return;
    }

    const removed = await dataService.removeEntry(activeEntry.giveawayId, interaction.user.id);
    if (removed) {
        await interaction.editReply({
            embeds: [successEmbed('Left Giveaway', `You have left: **${activeEntry.giveaway.title}**`)]
        });
    } else {
        await interaction.editReply({ content: '❌ Failed to leave giveaway. Please try again.' });
    }
}

async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
    await deferEphemeral(interaction);
    const dataService = getGiveawayDataService();

    const activeEntry = await dataService.getUserActiveEntry(interaction.user.id);
    if (!activeEntry) {
        await interaction.editReply({ content: 'You are not currently entered in any giveaway.' });
        return;
    }

    const { giveaway } = activeEntry;
    const userEntry = giveaway.entries.find(e => e.discordId === interaction.user.id)!;

    await interaction.editReply({
        embeds: [
            infoEmbed('Your Giveaway Status')
                .addFields(
                    { name: 'Giveaway', value: giveaway.title, inline: false },
                    { name: 'Prize', value: giveaway.prizeName, inline: false },
                    { name: 'Entered At', value: `${toTimestamp(userEntry.enteredAt)}:F>`, inline: true },
                    { name: 'Total Entries', value: giveaway.entries.length.toString(), inline: true },
                    { name: 'Giveaway ID', value: `\`${giveaway.id}\``, inline: false },
                )
        ]
    });
}

async function handleWinners(interaction: ChatInputCommandInteraction): Promise<void> {
    await deferEphemeral(interaction);
    const limit = interaction.options.getInteger('limit') || 10;
    const dataService = getGiveawayDataService();

    if (!interaction.guildId) {
        await interaction.editReply({ content: '❌ This command can only be used in a server.' });
        return;
    }

    const winners = await dataService.getGuildWinners(interaction.guildId, limit);
    if (winners.length === 0) {
        await interaction.editReply({ content: 'No winners yet in this server.' });
        return;
    }

    const description = winners.map((w, i) =>
        `${i + 1}. <@${w.discordId}> - **${w.prizeName}** (${toTimestamp(w.wonAt)}:R>)`
    ).join('\n');

    await interaction.editReply({
        embeds: [customEmbed('Recent Giveaway Winners', EmbedColors.GOLD, description)]
    });
}

// ==================== Mod Command Handlers ====================

async function handleCreate(interaction: ChatInputCommandInteraction): Promise<void> {
    await deferEphemeral(interaction);

    const title = interaction.options.getString('title', true);
    const description = interaction.options.getString('description', true);
    const prize = interaction.options.getString('prize', true);
    const endTimeStr = interaction.options.getString('end-time');
    const maxEntries = interaction.options.getInteger('max-entries');

    if (title.length > GIVEAWAY_CONFIG.MAX_TITLE_LENGTH) {
        await interaction.editReply({ content: `❌ Title must be ${GIVEAWAY_CONFIG.MAX_TITLE_LENGTH} characters or less` });
        return;
    }
    if (description.length > GIVEAWAY_CONFIG.MAX_DESCRIPTION_LENGTH) {
        await interaction.editReply({ content: `❌ Description must be ${GIVEAWAY_CONFIG.MAX_DESCRIPTION_LENGTH} characters or less` });
        return;
    }
    if (prize.length > GIVEAWAY_CONFIG.MAX_PRIZE_NAME_LENGTH) {
        await interaction.editReply({ content: `❌ Prize name must be ${GIVEAWAY_CONFIG.MAX_PRIZE_NAME_LENGTH} characters or less` });
        return;
    }

    const endConditions: EndCondition[] = [{ type: 'manual' }];

    if (endTimeStr) {
        const endTime = parseEndTime(endTimeStr);
        if (!endTime) {
            await interaction.editReply({
                content: '❌ Invalid end time. Use ISO (YYYY-MM-DDTHH:MM:SS) or relative ("2h", "30m", "1d")'
            });
            return;
        }
        endConditions.push({ type: 'scheduled', scheduledEndTime: endTime.toISOString() });
    }

    if (maxEntries && maxEntries > 0) {
        endConditions.push({ type: 'entry_count', maxEntries });
    }

    const managementService = getGiveawayManagementService();
    const giveaway = await managementService.createGiveaway(
        interaction.client,
        interaction.guildId!,
        interaction.user.id,
        { title, description, prizeName: prize, endConditions }
    );

    await interaction.editReply({
        embeds: [
            successEmbed('Giveaway Created!')
                .addFields(
                    { name: 'Title', value: giveaway.title, inline: false },
                    { name: 'Prize', value: giveaway.prizeName, inline: false },
                    { name: 'Giveaway ID', value: `\`${giveaway.id}\``, inline: false },
                    { name: 'For Users', value: `Join with: \`/giveaway join giveaway-id:${giveaway.id}\``, inline: false },
                )
        ]
    });
}

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
    await deferEphemeral(interaction);
    const dataService = getGiveawayDataService();
    const giveaways = await dataService.getAllGiveaways(interaction.guildId!);

    if (giveaways.length === 0) {
        await interaction.editReply({ content: 'No giveaways found in this server.' });
        return;
    }

    giveaways.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const perPage = GIVEAWAY_CONFIG.GIVEAWAYS_PER_PAGE;
    const totalPages = Math.ceil(giveaways.length / perPage);
    const pages = Array.from({ length: totalPages }, (_, i) => {
        const pageItems = giveaways.slice(i * perPage, (i + 1) * perPage);
        const statusEmojis: Record<string, string> = { active: '🟢', ended: '✅', cancelled: '❌' };

        return infoEmbed('Server Giveaways')
            .setDescription(pageItems.map(g =>
                `${statusEmojis[g.status] || '❓'} **${g.title}**\nPrize: ${g.prizeName} | Entries: ${g.entries.length} | Status: ${g.status}\nID: \`${g.id}\``
            ).join('\n\n'));
    });

    await createPaginatedMessage(interaction, pages, { customIdPrefix: 'giveaway_list' });
}

async function handleEntries(interaction: ChatInputCommandInteraction): Promise<void> {
    await deferEphemeral(interaction);

    const giveawayId = interaction.options.getString('giveaway-id', true);
    const dataService = getGiveawayDataService();

    const giveaway = await dataService.getGiveaway(giveawayId);
    if (!giveaway) {
        await interaction.editReply({ content: '❌ Giveaway not found.' });
        return;
    }
    if (giveaway.entries.length === 0) {
        await interaction.editReply({ content: 'No entries yet for this giveaway.' });
        return;
    }

    // Paginate entries to avoid Discord's 4096 char embed limit
    const perPage = GIVEAWAY_CONFIG.ENTRIES_PER_PAGE;
    const totalPages = Math.ceil(giveaway.entries.length / perPage);
    const pages = Array.from({ length: totalPages }, (_, i) => {
        const pageEntries = giveaway.entries.slice(i * perPage, (i + 1) * perPage);
        const startIdx = i * perPage;

        return infoEmbed(`Entries for: ${giveaway.title}`)
            .setDescription(pageEntries.map((e, j) =>
                `${startIdx + j + 1}. <@${e.discordId}> (${e.username}) - ${toTimestamp(e.enteredAt)}:R>`
            ).join('\n'))
            .setFooter({ text: `Total: ${giveaway.entries.length} entries` });
    });

    await createPaginatedMessage(interaction, pages, { customIdPrefix: 'giveaway_entries' });
}

async function handleSpin(interaction: ChatInputCommandInteraction): Promise<void> {
    await deferEphemeral(interaction);

    const giveawayId = interaction.options.getString('giveaway-id', true);
    const dataService = getGiveawayDataService();
    const wheelService = getGiveawayWheelService();
    const managementService = getGiveawayManagementService();

    const giveaway = await dataService.getGiveaway(giveawayId);
    if (!giveaway) { await interaction.editReply({ content: '❌ Giveaway not found.' }); return; }
    if (giveaway.status !== 'active') { await interaction.editReply({ content: '❌ Giveaway is not active.' }); return; }
    if (giveaway.entries.length === 0) { await interaction.editReply({ content: '❌ No entries to spin.' }); return; }

    const wheelUrl = wheelService.generateWheelUrl(giveaway);
    await dataService.updateGiveaway(giveawayId, {
        wheelUrl,
        wheelSpunAt: new Date().toISOString(),
    });

    const modChannel = managementService.findModChannel(interaction.client, giveaway.guildId);
    if (modChannel) {
        await modChannel.send({
            embeds: [
                successEmbed('Giveaway Ready to Spin!',
                    `Click the link below to spin the wheel for: **${giveaway.prizeName}**`)
                    .addFields(
                        { name: 'Wheel URL', value: `[Click to Spin](${wheelUrl})`, inline: false },
                        { name: 'Participants', value: `${giveaway.entries.length} entrants`, inline: true },
                        { name: 'Giveaway ID', value: `\`${giveaway.id}\``, inline: true },
                    )
            ]
        });
    }

    await interaction.editReply({
        content: `Wheel URL generated!\n\n[Open Wheel](${wheelUrl})\n\n${wheelService.getWheelInstructions()}`
    });
}

async function handleSelectWinner(interaction: ChatInputCommandInteraction): Promise<void> {
    await deferEphemeral(interaction);

    const giveawayId = interaction.options.getString('giveaway-id', true);
    const winnerUser = interaction.options.getUser('winner', true);
    const dataService = getGiveawayDataService();

    const giveaway = await dataService.getGiveaway(giveawayId);
    if (!giveaway) { await interaction.editReply({ content: '❌ Giveaway not found.' }); return; }

    if (!giveaway.entries.some(e => e.discordId === winnerUser.id)) {
        await interaction.editReply({ content: '❌ Selected user is not an entrant in this giveaway.' });
        return;
    }

    const managementService = getGiveawayManagementService();
    await managementService.endGiveaway(interaction.client, giveawayId, interaction.user.id, winnerUser.id);

    await interaction.editReply({
        embeds: [successEmbed('Winner Selected!',
            `${winnerUser.toString()} has been notified via DM and announced in the moderator channel.`)]
    });
}

async function handleCancel(interaction: ChatInputCommandInteraction): Promise<void> {
    await deferEphemeral(interaction);

    const giveawayId = interaction.options.getString('giveaway-id', true);
    const reason = interaction.options.getString('reason') || undefined;
    const managementService = getGiveawayManagementService();

    const giveaway = await managementService.cancelGiveaway(
        interaction.client, giveawayId, interaction.user.id, reason
    );

    let message = `Giveaway "${giveaway.title}" has been cancelled.`;
    if (reason) message += `\n**Reason:** ${reason}`;

    await interaction.editReply({ embeds: [successEmbed('Giveaway Cancelled', message)] });
}

async function handleStats(interaction: ChatInputCommandInteraction): Promise<void> {
    await deferEphemeral(interaction);
    const dataService = getGiveawayDataService();
    const stats = await dataService.getGuildStats(interaction.guildId!);

    await interaction.editReply({
        embeds: [
            infoEmbed('Giveaway Statistics')
                .addFields(
                    { name: 'Total Giveaways', value: stats.totalGiveaways.toString(), inline: true },
                    { name: 'Active', value: stats.activeCount.toString(), inline: true },
                    { name: 'Ended', value: stats.endedCount.toString(), inline: true },
                    { name: 'Total Winners', value: stats.totalWinners.toString(), inline: true },
                    { name: 'Total Entries', value: stats.totalEntries.toString(), inline: true },
                    { name: 'Avg Entries', value: stats.totalGiveaways > 0
                        ? (stats.totalEntries / stats.totalGiveaways).toFixed(1) : '0', inline: true },
                )
        ]
    });
}

// ==================== Command Definition ====================

const modCommands = ['create', 'list', 'entries', 'spin', 'select-winner', 'cancel', 'stats'];

export default {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Giveaway management system')

        // User commands
        .addSubcommand(sub => sub
            .setName('join')
            .setDescription('Join an active giveaway')
            .addStringOption(opt => opt
                .setName('giveaway-id')
                .setDescription('The giveaway ID to join')
                .setRequired(true)))

        .addSubcommand(sub => sub
            .setName('leave')
            .setDescription('Leave your current giveaway'))

        .addSubcommand(sub => sub
            .setName('status')
            .setDescription('Check your current giveaway entry status'))

        .addSubcommand(sub => sub
            .setName('winners')
            .setDescription('View recent giveaway winners')
            .addIntegerOption(opt => opt
                .setName('limit')
                .setDescription('Number of winners to show (default: 10, max: 50)')
                .setMinValue(1)
                .setMaxValue(50)))

        // Mod commands
        .addSubcommand(sub => sub
            .setName('create')
            .setDescription('[MOD] Create a new giveaway')
            .addStringOption(opt => opt.setName('title').setDescription('Giveaway title').setRequired(true))
            .addStringOption(opt => opt.setName('description').setDescription('Giveaway description').setRequired(true))
            .addStringOption(opt => opt.setName('prize').setDescription('Prize name').setRequired(true))
            .addStringOption(opt => opt.setName('end-time').setDescription('End time (ISO or relative: "2h", "30m", "1d")'))
            .addIntegerOption(opt => opt.setName('max-entries').setDescription('Max entries before auto-end').setMinValue(1)))

        .addSubcommand(sub => sub
            .setName('list')
            .setDescription('[MOD] List all giveaways'))

        .addSubcommand(sub => sub
            .setName('entries')
            .setDescription('[MOD] View all entries for a giveaway')
            .addStringOption(opt => opt.setName('giveaway-id').setDescription('The giveaway ID').setRequired(true)))

        .addSubcommand(sub => sub
            .setName('spin')
            .setDescription('[MOD] Generate Wheel of Names URL')
            .addStringOption(opt => opt.setName('giveaway-id').setDescription('The giveaway ID').setRequired(true)))

        .addSubcommand(sub => sub
            .setName('select-winner')
            .setDescription('[MOD] Select winner after spinning the wheel')
            .addStringOption(opt => opt.setName('giveaway-id').setDescription('The giveaway ID').setRequired(true))
            .addUserOption(opt => opt.setName('winner').setDescription('The winner (must be an entrant)').setRequired(true)))

        .addSubcommand(sub => sub
            .setName('cancel')
            .setDescription('[MOD] Cancel a giveaway')
            .addStringOption(opt => opt.setName('giveaway-id').setDescription('The giveaway ID').setRequired(true))
            .addStringOption(opt => opt.setName('reason').setDescription('Reason for cancellation')))

        .addSubcommand(sub => sub
            .setName('stats')
            .setDescription('[MOD] View server giveaway statistics')),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const configService = getGachaGuildConfigService();
        const isAllowed = await configService.isGuildAllowed(interaction.guildId);
        if (!isAllowed) {
            await replyEphemeral(interaction, '❌ This server is not authorized to use the giveaway system.');
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (modCommands.includes(subcommand)) {
            const hasPerm = await requireModPermission(interaction);
            if (!hasPerm) return;
        }

        try {
            const handlers: Record<string, (i: ChatInputCommandInteraction) => Promise<void>> = {
                'join': handleJoin,
                'leave': handleLeave,
                'status': handleStatus,
                'winners': handleWinners,
                'create': handleCreate,
                'list': handleList,
                'entries': handleEntries,
                'spin': handleSpin,
                'select-winner': handleSelectWinner,
                'cancel': handleCancel,
                'stats': handleStats,
            };

            const handler = handlers[subcommand];
            if (handler) {
                await handler(interaction);
            } else {
                await replyEphemeral(interaction, '❌ Unknown subcommand.');
            }
        } catch (error) {
            await handleCommandError(interaction, error, `giveaway ${subcommand}`);
        }
    },
};
