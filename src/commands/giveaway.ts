import {
    SlashCommandBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    Role,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { getGiveawayDataService } from '../services/giveawayDataService';
import { getGiveawayManagementService } from '../services/giveawayManagementService';
import { getGiveawayWheelService } from '../services/giveawayWheelService';
import { EndCondition } from '../utils/interfaces/Giveaway.interface';
import { GIVEAWAY_CONFIG } from '../utils/data/giveawayConfig';
import { getGachaGuildConfigService } from '../services/gachaGuildConfigService';

const RAPI_BOT_THUMBNAIL_URL = process.env.CDN_DOMAIN_URL + '/assets/rapi-bot-thumbnail.jpg';

/**
 * Check if user has mod permissions
 */
async function checkModPermission(interaction: ChatInputCommandInteraction): Promise<boolean> {
    const guild = interaction.guild;
    if (!guild) return false;

    const member = await guild.members.fetch(interaction.user.id);
    return member.roles.cache.some((role: Role) =>
        role.name.toLowerCase() === 'mods'
    ) || member.permissions.has(PermissionFlagsBits.Administrator);
}

/**
 * Parse end time string (ISO timestamp or relative like "2h", "1d")
 */
function parseEndTime(input: string): Date | null {
    // Try parsing as ISO timestamp first
    const isoDate = new Date(input);
    if (!isNaN(isoDate.getTime()) && isoDate > new Date()) {
        return isoDate;
    }

    // Parse relative time (e.g., "2h", "30m", "1d")
    const match = input.match(/^(\d+)(m|h|d)$/i);
    if (match) {
        const amount = parseInt(match[1]);
        const unit = match[2].toLowerCase();

        const now = new Date();
        if (unit === 'm') {
            return new Date(now.getTime() + amount * 60 * 1000);
        } else if (unit === 'h') {
            return new Date(now.getTime() + amount * 60 * 60 * 1000);
        } else if (unit === 'd') {
            return new Date(now.getTime() + amount * 24 * 60 * 60 * 1000);
        }
    }

    return null;
}

// ==================== Command Handlers ====================

async function handleJoin(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const giveawayId = interaction.options.getString('giveaway-id', true);
    const managementService = getGiveawayManagementService();
    const dataService = getGiveawayDataService();

    // Verify giveaway exists
    const giveaway = await dataService.getGiveaway(giveawayId);
    if (!giveaway) {
        await interaction.editReply({ content: '❌ Giveaway not found. Please check the ID and try again.' });
        return;
    }

    if (giveaway.status !== 'active') {
        await interaction.editReply({ content: '❌ This giveaway is not currently active.' });
        return;
    }

    const result = await managementService.enterGiveaway(
        interaction.client,
        giveawayId,
        interaction.user
    );

    if (!result.success) {
        await interaction.editReply({ content: `❌ ${result.error}` });
        return;
    }

    let message = `✅ You've entered the giveaway for **${giveaway.prizeName}**!`;
    if (result.previousGiveaway) {
        message += `\n\n⚠️ You were automatically removed from "${result.previousGiveaway}" since you can only be in one active giveaway at a time.`;
    }

    await interaction.editReply({ content: message });
}

async function handleLeave(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const dataService = getGiveawayDataService();
    const managementService = getGiveawayManagementService();

    // Find user's active entry
    const activeEntry = await dataService.getUserActiveEntry(interaction.user.id);
    if (!activeEntry) {
        await interaction.editReply({ content: '❌ You are not entered in any active giveaway.' });
        return;
    }

    const removed = await managementService.leaveGiveaway(activeEntry.giveawayId, interaction.user.id);

    if (removed) {
        await interaction.editReply({
            content: `✅ You have left the giveaway: **${activeEntry.giveaway.title}**`
        });
    } else {
        await interaction.editReply({ content: '❌ Failed to leave giveaway. Please try again.' });
    }
}

async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const dataService = getGiveawayDataService();

    // Get user's active entry
    const activeEntry = await dataService.getUserActiveEntry(interaction.user.id);

    if (!activeEntry) {
        await interaction.editReply({ content: '📋 You are not currently entered in any giveaway.' });
        return;
    }

    const giveaway = activeEntry.giveaway;
    const userEntry = giveaway.entries.find(e => e.discordId === interaction.user.id);

    const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle('📊 Your Giveaway Status')
        .addFields(
            { name: 'Giveaway', value: giveaway.title, inline: false },
            { name: 'Prize', value: giveaway.prizeName, inline: false },
            { name: 'Entered At', value: `<t:${Math.floor(new Date(userEntry!.enteredAt).getTime() / 1000)}:F>`, inline: true },
            { name: 'Total Entries', value: giveaway.entries.length.toString(), inline: true },
            { name: 'Giveaway ID', value: `\`${giveaway.id}\``, inline: false }
        )
        .setFooter({ text: 'Giveaway System', iconURL: RAPI_BOT_THUMBNAIL_URL })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleWinners(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const limit = interaction.options.getInteger('limit') || 10;
    const dataService = getGiveawayDataService();

    if (!interaction.guildId) {
        await interaction.editReply({ content: '❌ This command can only be used in a server.' });
        return;
    }

    const winners = await dataService.getGuildWinners(interaction.guildId, limit);

    if (winners.length === 0) {
        await interaction.editReply({ content: '📋 No winners yet in this server.' });
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🏆 Recent Giveaway Winners')
        .setDescription(winners.map((w, i) =>
            `${i + 1}. <@${w.discordId}> - **${w.prizeName}** (<t:${Math.floor(new Date(w.wonAt).getTime() / 1000)}:R>)`
        ).join('\n'))
        .setFooter({ text: `Showing ${winners.length} winner(s)`, iconURL: RAPI_BOT_THUMBNAIL_URL })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

// ==================== Mod Command Handlers ====================

async function handleCreate(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const title = interaction.options.getString('title', true);
    const description = interaction.options.getString('description', true);
    const prize = interaction.options.getString('prize', true);
    const endTimeStr = interaction.options.getString('end-time');
    const maxEntries = interaction.options.getInteger('max-entries');

    // Validate lengths
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

    // Build end conditions
    const endConditions: EndCondition[] = [{ type: 'manual' }];

    if (endTimeStr) {
        const endTime = parseEndTime(endTimeStr);
        if (!endTime) {
            await interaction.editReply({
                content: '❌ Invalid end time format. Use ISO timestamp (YYYY-MM-DDTHH:MM:SS) or relative time (e.g., "2h", "30m", "1d")'
            });
            return;
        }
        endConditions.push({
            type: 'scheduled',
            scheduledEndTime: endTime.toISOString()
        });
    }

    if (maxEntries && maxEntries > 0) {
        endConditions.push({
            type: 'entry_count',
            maxEntries
        });
    }

    try {
        const managementService = getGiveawayManagementService();
        const giveaway = await managementService.createGiveaway(
            interaction.client,
            interaction.guildId!,
            interaction.user.id,
            {
                title,
                description,
                prizeName: prize,
                endConditions
            }
        );

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ Giveaway Created!')
            .addFields(
                { name: 'Title', value: giveaway.title, inline: false },
                { name: 'Prize', value: giveaway.prizeName, inline: false },
                { name: 'Giveaway ID', value: `\`${giveaway.id}\``, inline: false },
                { name: '📝 For Users', value: `Users can join with: \`/giveaway join giveaway-id:${giveaway.id}\``, inline: false }
            )
            .setFooter({ text: 'Giveaway System', iconURL: RAPI_BOT_THUMBNAIL_URL })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
        await interaction.editReply({ content: `❌ ${error.message}` });
    }
}

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const dataService = getGiveawayDataService();
    const giveaways = await dataService.getAllGiveaways(interaction.guildId!);

    if (giveaways.length === 0) {
        await interaction.editReply({ content: '📋 No giveaways found in this server.' });
        return;
    }

    // Sort by created date (newest first)
    giveaways.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Create pages
    const itemsPerPage = GIVEAWAY_CONFIG.GIVEAWAYS_PER_PAGE;
    const pages: EmbedBuilder[] = [];
    const totalPages = Math.ceil(giveaways.length / itemsPerPage);

    for (let i = 0; i < totalPages; i++) {
        const pageGiveaways = giveaways.slice(i * itemsPerPage, (i + 1) * itemsPerPage);
        const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('📋 Server Giveaways')
            .setDescription(pageGiveaways.map(g => {
                const statusEmoji = g.status === 'active' ? '🟢' : g.status === 'ended' ? '✅' : '❌';
                return `${statusEmoji} **${g.title}**\nPrize: ${g.prizeName}\nID: \`${g.id}\`\nEntries: ${g.entries.length}\nStatus: ${g.status}`;
            }).join('\n\n'))
            .setFooter({ text: `Page ${i + 1} of ${totalPages}`, iconURL: RAPI_BOT_THUMBNAIL_URL })
            .setTimestamp();

        pages.push(embed);
    }

    // Single page - no pagination needed
    if (pages.length === 1) {
        await interaction.editReply({ embeds: [pages[0]] });
        return;
    }

    // Multiple pages - add pagination buttons
    let currentPage = 0;
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('giveaway_list_prev')
            .setLabel('Previous')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId('giveaway_list_next')
            .setLabel('Next')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(pages.length <= 1)
    );

    const message = await interaction.editReply({
        embeds: [pages[currentPage]],
        components: [row]
    });

    const collector = message.createMessageComponentCollector({
        time: 5 * 60 * 1000 // 5 minutes
    });

    collector.on('collect', async (i) => {
        if (i.user.id !== interaction.user.id) {
            await i.reply({
                content: 'You cannot use these buttons.',
                ephemeral: true
            });
            return;
        }

        if (i.customId === 'giveaway_list_next') {
            currentPage = Math.min(currentPage + 1, pages.length - 1);
        } else if (i.customId === 'giveaway_list_prev') {
            currentPage = Math.max(currentPage - 1, 0);
        }

        row.components[0].setDisabled(currentPage === 0);
        row.components[1].setDisabled(currentPage === pages.length - 1);

        await i.update({
            embeds: [pages[currentPage]],
            components: [row]
        });
    });

    collector.on('end', () => {
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            row.components.map(button => ButtonBuilder.from(button).setDisabled(true))
        );
        message.edit({ components: [disabledRow] }).catch(() => {});
    });
}

async function handleEntries(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const giveawayId = interaction.options.getString('giveaway-id', true);
    const dataService = getGiveawayDataService();

    const giveaway = await dataService.getGiveaway(giveawayId);
    if (!giveaway) {
        await interaction.editReply({ content: '❌ Giveaway not found.' });
        return;
    }

    if (giveaway.entries.length === 0) {
        await interaction.editReply({ content: '📋 No entries yet for this giveaway.' });
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`📋 Entries for: ${giveaway.title}`)
        .setDescription(giveaway.entries.map((e, i) =>
            `${i + 1}. <@${e.discordId}> (${e.username}) - <t:${Math.floor(new Date(e.enteredAt).getTime() / 1000)}:R>`
        ).join('\n'))
        .setFooter({ text: `Total: ${giveaway.entries.length} entries`, iconURL: RAPI_BOT_THUMBNAIL_URL })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleSpin(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const giveawayId = interaction.options.getString('giveaway-id', true);
    const dataService = getGiveawayDataService();
    const wheelService = getGiveawayWheelService();
    const managementService = getGiveawayManagementService();

    const giveaway = await dataService.getGiveaway(giveawayId);
    if (!giveaway) {
        await interaction.editReply({ content: '❌ Giveaway not found.' });
        return;
    }

    if (giveaway.status !== 'active') {
        await interaction.editReply({ content: '❌ This giveaway is not active.' });
        return;
    }

    if (giveaway.entries.length === 0) {
        await interaction.editReply({ content: '❌ Cannot generate wheel with no entries.' });
        return;
    }

    try {
        const wheelUrl = wheelService.generateWheelUrl(giveaway);
        await dataService.updateGiveaway(giveawayId, {
            wheelUrl,
            wheelSpunAt: new Date().toISOString()
        });

        // Post to mod channel
        const modChannel = await managementService.findModChannel(interaction.client, giveaway.guildId);
        if (modChannel) {
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('🎡 Giveaway Ready to Spin!')
                .setDescription(`Click the link below to spin the wheel for: **${giveaway.prizeName}**`)
                .addFields(
                    { name: 'Wheel URL', value: `[Click to Spin](${wheelUrl})`, inline: false },
                    { name: 'Participants', value: `${giveaway.entries.length} entrants`, inline: true },
                    { name: 'Giveaway ID', value: `\`${giveaway.id}\``, inline: true }
                )
                .setFooter({ text: 'After spinning, use /giveaway select-winner to confirm the winner.', iconURL: RAPI_BOT_THUMBNAIL_URL })
                .setTimestamp();

            await modChannel.send({ embeds: [embed] });
        }

        await interaction.editReply({
            content: `✅ Wheel URL generated and posted to ${GIVEAWAY_CONFIG.MOD_CHANNEL_NAME} channel!\n\n🎡 [Open Wheel](${wheelUrl})\n\n${wheelService.getWheelInstructions()}`
        });
    } catch (error: any) {
        await interaction.editReply({ content: `❌ ${error.message}` });
    }
}

async function handleSelectWinner(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const giveawayId = interaction.options.getString('giveaway-id', true);
    const winnerUser = interaction.options.getUser('winner', true);
    const managementService = getGiveawayManagementService();
    const dataService = getGiveawayDataService();

    const giveaway = await dataService.getGiveaway(giveawayId);
    if (!giveaway) {
        await interaction.editReply({ content: '❌ Giveaway not found.' });
        return;
    }

    // Validate winner is an entrant
    const isEntrant = giveaway.entries.some(e => e.discordId === winnerUser.id);
    if (!isEntrant) {
        await interaction.editReply({
            content: '❌ Selected user is not an entrant in this giveaway. Please select someone who entered.'
        });
        return;
    }

    try {
        await managementService.endGiveaway(
            interaction.client,
            giveawayId,
            interaction.user.id,
            winnerUser.id
        );

        await interaction.editReply({
            content: `✅ Winner selected! ${winnerUser.toString()} has been notified via DM and the announcement has been posted to the moderator channel.`
        });
    } catch (error: any) {
        await interaction.editReply({ content: `❌ ${error.message}` });
    }
}

async function handleCancel(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const giveawayId = interaction.options.getString('giveaway-id', true);
    const reason = interaction.options.getString('reason');
    const managementService = getGiveawayManagementService();
    const dataService = getGiveawayDataService();

    const giveaway = await dataService.getGiveaway(giveawayId);
    if (!giveaway) {
        await interaction.editReply({ content: '❌ Giveaway not found.' });
        return;
    }

    try {
        await managementService.cancelGiveaway(giveawayId, interaction.user.id, reason || undefined);

        let message = `✅ Giveaway "${giveaway.title}" has been cancelled.`;
        if (reason) {
            message += `\n**Reason:** ${reason}`;
        }

        await interaction.editReply({ content: message });

        // Notify mod channel
        const modChannel = await managementService.findModChannel(interaction.client, giveaway.guildId);
        if (modChannel) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Giveaway Cancelled')
                .setDescription(`**${giveaway.title}** has been cancelled by <@${interaction.user.id}>`)
                .addFields(
                    { name: 'Prize', value: giveaway.prizeName, inline: true },
                    { name: 'Entries', value: giveaway.entries.length.toString(), inline: true }
                )
                .setFooter({ text: 'Giveaway System', iconURL: RAPI_BOT_THUMBNAIL_URL })
                .setTimestamp();

            if (reason) {
                embed.addFields({ name: 'Reason', value: reason, inline: false });
            }

            await modChannel.send({ embeds: [embed] });
        }
    } catch (error: any) {
        await interaction.editReply({ content: `❌ ${error.message}` });
    }
}

async function handleStats(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const dataService = getGiveawayDataService();
    const stats = await dataService.getGuildStats(interaction.guildId!);

    const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle('📊 Giveaway Statistics')
        .addFields(
            { name: 'Total Giveaways', value: stats.totalGiveaways.toString(), inline: true },
            { name: 'Active', value: stats.activeCount.toString(), inline: true },
            { name: 'Ended', value: stats.endedCount.toString(), inline: true },
            { name: 'Total Winners', value: stats.totalWinners.toString(), inline: true },
            { name: 'Total Entries', value: stats.totalEntries.toString(), inline: true },
            { name: 'Avg Entries/Giveaway', value: stats.totalGiveaways > 0 ? (stats.totalEntries / stats.totalGiveaways).toFixed(1) : '0', inline: true }
        )
        .setFooter({ text: 'Giveaway System', iconURL: RAPI_BOT_THUMBNAIL_URL })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

// ==================== Main Command Export ====================

const modCommands = ['create', 'list', 'entries', 'spin', 'select-winner', 'cancel', 'stats'];

export const data = new SlashCommandBuilder()
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
        .addStringOption(opt => opt
            .setName('title')
            .setDescription('Giveaway title')
            .setRequired(true))
        .addStringOption(opt => opt
            .setName('description')
            .setDescription('Giveaway description')
            .setRequired(true))
        .addStringOption(opt => opt
            .setName('prize')
            .setDescription('Prize name')
            .setRequired(true))
        .addStringOption(opt => opt
            .setName('end-time')
            .setDescription('End time (ISO timestamp or relative: "2h", "30m", "1d")')
            .setRequired(false))
        .addIntegerOption(opt => opt
            .setName('max-entries')
            .setDescription('Maximum number of entries before auto-end')
            .setMinValue(1)
            .setRequired(false)))

    .addSubcommand(sub => sub
        .setName('list')
        .setDescription('[MOD] List all giveaways'))

    .addSubcommand(sub => sub
        .setName('entries')
        .setDescription('[MOD] View all entries for a giveaway')
        .addStringOption(opt => opt
            .setName('giveaway-id')
            .setDescription('The giveaway ID')
            .setRequired(true)))

    .addSubcommand(sub => sub
        .setName('spin')
        .setDescription('[MOD] Generate Wheel of Names URL for a giveaway')
        .addStringOption(opt => opt
            .setName('giveaway-id')
            .setDescription('The giveaway ID')
            .setRequired(true)))

    .addSubcommand(sub => sub
        .setName('select-winner')
        .setDescription('[MOD] Select winner after spinning the wheel')
        .addStringOption(opt => opt
            .setName('giveaway-id')
            .setDescription('The giveaway ID')
            .setRequired(true))
        .addUserOption(opt => opt
            .setName('winner')
            .setDescription('The winner (must be an entrant)')
            .setRequired(true)))

    .addSubcommand(sub => sub
        .setName('cancel')
        .setDescription('[MOD] Cancel a giveaway')
        .addStringOption(opt => opt
            .setName('giveaway-id')
            .setDescription('The giveaway ID')
            .setRequired(true))
        .addStringOption(opt => opt
            .setName('reason')
            .setDescription('Reason for cancellation')
            .setRequired(false)))

    .addSubcommand(sub => sub
        .setName('stats')
        .setDescription('[MOD] View server giveaway statistics'));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Check if guild is allowed
    const configService = getGachaGuildConfigService();
    const isAllowed = await configService.isGuildAllowed(interaction.guildId);
    if (!isAllowed) {
        await interaction.reply({
            content: '❌ This server is not authorized to use the giveaway system.',
            ephemeral: true
        });
        return;
    }

    const subcommand = interaction.options.getSubcommand();

    // Check mod permissions for mod-only commands
    if (modCommands.includes(subcommand)) {
        const isMod = await checkModPermission(interaction);
        if (!isMod) {
            await interaction.reply({
                content: '❌ You need the `mods` role or Administrator permission to use this command.',
                ephemeral: true
            });
            return;
        }
    }

    try {
        // Route to appropriate handler
        switch (subcommand) {
            case 'join':
                await handleJoin(interaction);
                break;
            case 'leave':
                await handleLeave(interaction);
                break;
            case 'status':
                await handleStatus(interaction);
                break;
            case 'winners':
                await handleWinners(interaction);
                break;
            case 'create':
                await handleCreate(interaction);
                break;
            case 'list':
                await handleList(interaction);
                break;
            case 'entries':
                await handleEntries(interaction);
                break;
            case 'spin':
                await handleSpin(interaction);
                break;
            case 'select-winner':
                await handleSelectWinner(interaction);
                break;
            case 'cancel':
                await handleCancel(interaction);
                break;
            case 'stats':
                await handleStats(interaction);
                break;
            default:
                await interaction.reply({
                    content: '❌ Unknown subcommand.',
                    ephemeral: true
                });
        }
    } catch (error: any) {
        console.error(`Error in /giveaway ${subcommand}:`, error);
        const errorMessage = error.message || 'An unexpected error occurred.';

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: `❌ ${errorMessage}` });
        } else {
            await interaction.reply({ content: `❌ ${errorMessage}`, ephemeral: true });
        }
    }
}
