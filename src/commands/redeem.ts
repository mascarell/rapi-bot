import {
    SlashCommandBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    PermissionFlagsBits,
    Role,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} from 'discord.js';
import { getGachaDataService } from '../services/gachaDataService';
import { getGachaRedemptionService } from '../services/gachaRedemptionService';
import { syncBD2PulseCodes } from '../services/bd2PulseScraperService';
import {
    GachaCoupon,
    GachaGameId,
    SubscriptionMode
} from '../utils/interfaces/GachaCoupon.interface';
import {
    GACHA_GAMES,
    getGameConfig,
    getSupportedGameIds,
    isValidGameId
} from '../utils/data/gachaGamesConfig';
import { getGachaGuildConfigService } from '../services/gachaGuildConfigService';

const RAPI_BOT_THUMBNAIL_URL = process.env.CDN_DOMAIN_URL + '/assets/rapi-bot-thumbnail.jpg';

// Build game choices for slash command options
const GAME_CHOICES = getSupportedGameIds().map(id => ({
    name: GACHA_GAMES[id].name,
    value: id,
}));

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
 * Format date for display
 */
function formatDate(dateStr: string | null): string {
    if (!dateStr) return 'No expiration';
    return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
    });
}

/**
 * Parse expiration date from user input
 */
function parseExpirationDate(input: string): string | null {
    if (!input || input.toLowerCase() === 'never' || input.toLowerCase() === 'none') {
        return null;
    }
    const date = new Date(input);
    if (isNaN(date.getTime())) {
        throw new Error('Invalid date format. Use YYYY-MM-DD or "never".');
    }
    return date.toISOString();
}

/**
 * Validate game user ID format
 * Prevents malformed IDs from causing API errors
 */
function validateGameUserId(gameId: GachaGameId, userId: string): { valid: boolean; error?: string } {
    const config = getGameConfig(gameId);
    const trimmedId = userId.trim();

    // Check for empty input
    if (!trimmedId) {
        return { valid: false, error: `${config.userIdFieldName} cannot be empty` };
    }

    // Check length
    if (trimmedId.length > config.maxNicknameLength) {
        return { valid: false, error: `${config.userIdFieldName} must be ${config.maxNicknameLength} characters or less` };
    }

    // Check for valid characters (alphanumeric, underscores, hyphens)
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedId)) {
        return { valid: false, error: `${config.userIdFieldName} can only contain letters, numbers, underscores, and hyphens` };
    }

    return { valid: true };
}

// ==================== Command Handlers ====================

async function handleSubscribe(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = interaction.options.getString('game', true) as GachaGameId;
    const gameUserIdInput = interaction.options.getString('userid', false); // Now optional
    let mode = interaction.options.getString('mode', true) as SubscriptionMode;

    const gameConfig = getGameConfig(gameId);

    // Force notification-only for games that don't support auto-redeem
    if (mode === 'auto-redeem' && !gameConfig.supportsAutoRedeem) {
        mode = 'notification-only';
    }

    // Use provided userid or empty string for games that don't need it
    const gameUserId = gameUserIdInput?.trim() || '';

    // Validate userid is provided for games that require it
    if (gameConfig.requiresUserId && !gameUserId) {
        await interaction.reply({
            content: `❌ ${gameConfig.userIdFieldName} is required for ${gameConfig.name}. Please provide your in-game ${gameConfig.userIdFieldName}.`,
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Only validate format if userid is provided
    if (gameUserId) {
        const validation = validateGameUserId(gameId, gameUserId);
        if (!validation.valid) {
            await interaction.reply({
                content: `❌ ${validation.error}`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
    }

    try {
        const dataService = getGachaDataService();
        await dataService.subscribe(interaction.user.id, gameId, gameUserId, mode);

        let modeDescription = mode === 'auto-redeem' && gameConfig.supportsAutoRedeem
            ? 'The bot will automatically redeem new codes for you.'
            : 'You will receive DM notifications about new and expiring codes.';

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ Subscription Activated')
            .setThumbnail(gameConfig.logoPath)
            .setDescription(`You are now subscribed to ${gameConfig.name} coupon updates!`)
            .setTimestamp()
            .setFooter({ text: 'Gacha Coupon System', iconURL: RAPI_BOT_THUMBNAIL_URL });

        // Only show userid field if the game requires one and it was provided
        if (gameConfig.requiresUserId && gameUserId) {
            embed.addFields(
                { name: gameConfig.userIdFieldName, value: `\`${gameUserId}\``, inline: true }
            );
        }
        embed.addFields(
            { name: 'Mode', value: mode === 'auto-redeem' ? '🤖 Auto-Redeem' : '📬 Notification Only', inline: true }
        );

        // Immediately redeem all active codes for auto-redeem subscribers
        if (mode === 'auto-redeem' && gameConfig.supportsAutoRedeem) {
            const redemptionService = getGachaRedemptionService();
            const result = await redemptionService.redeemAllForUser(
                interaction.client,
                interaction.user.id,
                gameId,
                gameUserId
            );

            if (result.total > 0) {
                const statusParts = [];
                if (result.successful > 0) statusParts.push(`✅ ${result.successful} redeemed`);
                if (result.alreadyRedeemed > 0) statusParts.push(`🔄 ${result.alreadyRedeemed} already claimed`);
                if (result.failed > 0) statusParts.push(`❌ ${result.failed} failed`);

                modeDescription = `Immediately redeemed ${result.total} active codes!\n${statusParts.join(' • ')}\n\nYou'll receive a DM with details.`;
            } else {
                modeDescription = 'No active codes available right now. You\'ll be notified when new codes are added!';
            }
        }

        embed.addFields({ name: 'What happens now?', value: modeDescription });

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error: any) {
        await interaction.reply({ content: `❌ ${error.message}`, flags: MessageFlags.Ephemeral });
    }
}

async function handleUnsubscribe(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = interaction.options.getString('game', true) as GachaGameId;
    const gameConfig = getGameConfig(gameId);

    try {
        const dataService = getGachaDataService();
        const removed = await dataService.unsubscribe(interaction.user.id, gameId);

        if (removed) {
            const embed = new EmbedBuilder()
                .setColor(0xFF6600)
                .setTitle('👋 Unsubscribed')
                .setDescription(`You have been unsubscribed from ${gameConfig.name} coupon updates.`)
                .setTimestamp()
                .setFooter({ text: 'Gacha Coupon System', iconURL: RAPI_BOT_THUMBNAIL_URL });

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({
                content: `❌ You are not subscribed to ${gameConfig.name}.`,
                flags: MessageFlags.Ephemeral
            });
        }
    } catch (error: any) {
        await interaction.reply({ content: `❌ ${error.message}`, flags: MessageFlags.Ephemeral });
    }
}

async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = interaction.options.getString('game') as GachaGameId | null;

    try {
        const dataService = getGachaDataService();
        const userSubs = await dataService.getUserSubscriptions(interaction.user.id);

        if (!userSubs || Object.keys(userSubs.games).length === 0) {
            await interaction.reply({
                content: '❌ You have no active subscriptions. Use `/redeem subscribe` to get started!',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // If specific game requested
        if (gameId) {
            // Use batch data loading to reduce S3 operations
            const { subscription: gameSub, activeCoupons, unredeemed } = await dataService.getSubscriberContext(interaction.user.id, gameId);

            if (!gameSub) {
                await interaction.reply({
                    content: `❌ You are not subscribed to ${getGameConfig(gameId).name}.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const gameConfig = getGameConfig(gameId);

            const embed = new EmbedBuilder()
                .setColor(gameConfig.embedColor)
                .setTitle(`📊 ${gameConfig.shortName} Subscription Status`)
                .setThumbnail(gameConfig.logoPath)
                .addFields(
                    { name: gameConfig.userIdFieldName, value: `\`${gameSub.gameUserId}\``, inline: true },
                    { name: 'Mode', value: gameSub.mode === 'auto-redeem' ? '🤖 Auto-Redeem' : '📬 Notify', inline: true },
                    { name: 'Since', value: formatDate(gameSub.subscribedAt), inline: true },
                    { name: 'Redeemed', value: `${gameSub.redeemedCodes.length}`, inline: true },
                    { name: 'Active', value: `${activeCoupons.length}`, inline: true },
                    { name: 'Pending', value: `${unredeemed.length}`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'Gacha Coupon System', iconURL: RAPI_BOT_THUMBNAIL_URL });

            if (unredeemed.length > 0) {
                const codeList = unredeemed.slice(0, 5).map(c => `• \`${c.code}\` - ${c.rewards}`).join('\n');
                embed.addFields({ name: '📌 Unredeemed Codes', value: codeList });
            }

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else {
            // Show all subscriptions
            const embed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle('📊 Your Coupon Subscriptions')
                .setTimestamp()
                .setFooter({ text: 'Gacha Coupon System', iconURL: RAPI_BOT_THUMBNAIL_URL });

            for (const [gId, gameSub] of Object.entries(userSubs.games)) {
                if (!gameSub) continue;
                const gameConfig = getGameConfig(gId as GachaGameId);
                const unredeemed = await dataService.getUnredeemedCodes(interaction.user.id, gId as GachaGameId);

                embed.addFields({
                    name: `${gameConfig.name}`,
                    value: `${gameConfig.userIdFieldName}: \`${gameSub.gameUserId}\`\nMode: ${gameSub.mode === 'auto-redeem' ? '🤖' : '📬'} | Redeemed: ${gameSub.redeemedCodes.length} | Pending: ${unredeemed.length}`,
                });
            }

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    } catch (error: any) {
        await interaction.reply({ content: `❌ ${error.message}`, flags: MessageFlags.Ephemeral });
    }
}

async function handleCodes(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = interaction.options.getString('game', true) as GachaGameId;
    const gameConfig = getGameConfig(gameId);

    try {
        const dataService = getGachaDataService();
        const activeCoupons = await dataService.getActiveCoupons(gameId);

        if (activeCoupons.length === 0) {
            await interaction.reply({
                content: `📭 No active coupon codes for ${gameConfig.name} right now.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(gameConfig.embedColor)
            .setTitle(`🎟️ ${gameConfig.shortName} Coupon Codes`)
            .setThumbnail(gameConfig.logoPath)
            .setTimestamp()
            .setFooter({ text: 'Gacha Coupon System', iconURL: RAPI_BOT_THUMBNAIL_URL });

        if (gameConfig.manualRedeemUrl) {
            embed.setDescription(`Use the [official redemption page](${gameConfig.manualRedeemUrl}) or redeem in-game.`);
        }

        for (const coupon of activeCoupons.slice(0, 10)) {
            const expiry = coupon.expirationDate
                ? `⏰ Expires: ${formatDate(coupon.expirationDate)}`
                : '♾️ No expiration';

            embed.addFields({
                name: `\`${coupon.code}\``,
                value: `${coupon.rewards}\n${expiry}${coupon.source ? `\n📍 ${coupon.source}` : ''}`
            });
        }

        if (activeCoupons.length > 10) {
            embed.addFields({ name: '...', value: `And ${activeCoupons.length - 10} more codes` });
        }

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error: any) {
        await interaction.reply({ content: `❌ ${error.message}`, flags: MessageFlags.Ephemeral });
    }
}

async function handleModAdd(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = interaction.options.getString('game', true) as GachaGameId;
    const code = interaction.options.getString('code', true);
    const rewards = interaction.options.getString('rewards', true);
    const expirationInput = interaction.options.getString('expiration') || 'never';
    const source = interaction.options.getString('source') || undefined;

    const gameConfig = getGameConfig(gameId);

    try {
        const expirationDate = parseExpirationDate(expirationInput);
        const dataService = getGachaDataService();

        const coupon: GachaCoupon = {
            code: code.toUpperCase().trim(),
            gameId,
            rewards,
            expirationDate,
            addedBy: interaction.user.id,
            addedAt: new Date().toISOString(),
            isActive: true,
            source
        };

        await dataService.addCoupon(coupon);

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ Coupon Added')
            .setThumbnail(gameConfig.logoPath)
            .addFields(
                { name: 'Game', value: gameConfig.shortName, inline: true },
                { name: 'Code', value: `\`${coupon.code}\``, inline: true },
                { name: 'Rewards', value: rewards, inline: true },
                { name: 'Expires', value: formatDate(expirationDate), inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'Gacha Coupon System', iconURL: RAPI_BOT_THUMBNAIL_URL });

        if (source) {
            embed.addFields({ name: 'Source', value: source, inline: true });
        }

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        // Notify subscribers
        const redemptionService = getGachaRedemptionService();
        await redemptionService.notifyNewCode(interaction.client, coupon);

    } catch (error: any) {
        await interaction.reply({ content: `❌ ${error.message}`, flags: MessageFlags.Ephemeral });
    }
}

async function handleModRemove(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = interaction.options.getString('game', true) as GachaGameId;
    const code = interaction.options.getString('code', true);
    const gameConfig = getGameConfig(gameId);

    try {
        const dataService = getGachaDataService();
        const removed = await dataService.removeCoupon(gameId, code);

        if (removed) {
            const embed = new EmbedBuilder()
                .setColor(0xFF6600)
                .setTitle('🗑️ Coupon Deactivated')
                .setDescription(`\`${code.toUpperCase()}\` has been deactivated for ${gameConfig.name}.`)
                .setTimestamp()
                .setFooter({ text: 'Gacha Coupon System', iconURL: RAPI_BOT_THUMBNAIL_URL });

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ content: `❌ Code \`${code}\` not found for ${gameConfig.name}.`, flags: MessageFlags.Ephemeral });
        }
    } catch (error: any) {
        await interaction.reply({ content: `❌ ${error.message}`, flags: MessageFlags.Ephemeral });
    }
}

async function handleModList(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = interaction.options.getString('game', true) as GachaGameId;
    const filter = interaction.options.getString('filter') || 'all';
    const gameConfig = getGameConfig(gameId);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const dataService = getGachaDataService();
        const allCoupons = await dataService.getAllCoupons(gameId);
        const stats = await dataService.getGameStats(gameId);
        const now = new Date();

        const activeCoupons = allCoupons.filter(c => c.isActive);
        const inactiveCoupons = allCoupons.filter(c => !c.isActive);

        // Determine which coupons to display based on filter
        let couponsToDisplay: typeof allCoupons;
        let filterLabel: string;

        switch (filter) {
            case 'active':
                couponsToDisplay = activeCoupons;
                filterLabel = 'Active Codes';
                break;
            case 'expired':
                couponsToDisplay = inactiveCoupons;
                filterLabel = 'Expired/Inactive Codes';
                break;
            default:
                couponsToDisplay = allCoupons;
                filterLabel = 'All Codes';
        }

        if (couponsToDisplay.length === 0) {
            await interaction.editReply({
                content: `📭 No ${filterLabel.toLowerCase()} found for ${gameConfig.name}.`
            });
            return;
        }

        // Build paginated embeds (10 codes per page)
        const CODES_PER_PAGE = 10;
        const pages: EmbedBuilder[] = [];
        const totalPages = Math.ceil(couponsToDisplay.length / CODES_PER_PAGE);

        for (let i = 0; i < totalPages; i++) {
            const pageCoupons = couponsToDisplay.slice(i * CODES_PER_PAGE, (i + 1) * CODES_PER_PAGE);

            const codeList = pageCoupons.map(c => {
                const expiry = c.expirationDate ? formatDate(c.expirationDate) : 'No expiry';
                let status: string;
                if (!c.isActive) {
                    status = '❌';
                } else if (c.expirationDate && new Date(c.expirationDate) <= now) {
                    status = '⏰'; // Expired but in grace period
                } else {
                    status = '✅';
                }
                return `${status} \`${c.code}\`\n   └ ${c.rewards} (${expiry})`;
            }).join('\n');

            const embed = new EmbedBuilder()
                .setColor(gameConfig.embedColor)
                .setTitle(`📋 ${gameConfig.shortName} ${filterLabel}`)
                .setThumbnail(gameConfig.logoPath)
                .setDescription(
                    `**Subscribers:** ${stats.total} (🤖 ${stats.autoRedeem} | 📬 ${stats.notifyOnly})\n` +
                    `**Total:** ${couponsToDisplay.length} codes | ✅ Active | ⏰ Grace Period | ❌ Inactive\n\n` +
                    codeList
                )
                .setFooter({ text: `Page ${i + 1} of ${totalPages}`, iconURL: RAPI_BOT_THUMBNAIL_URL })
                .setTimestamp();

            pages.push(embed);
        }

        // Use pagination if multiple pages
        if (pages.length > 1) {
            let currentPage = 0;
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId('list_previous')
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('list_page')
                    .setLabel(`Page 1 of ${totalPages}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('list_next')
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(totalPages <= 1)
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
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                currentPage = i.customId === 'list_next'
                    ? (currentPage + 1) % pages.length
                    : (currentPage - 1 + pages.length) % pages.length;

                row.components[0].setDisabled(currentPage === 0);
                row.components[1].setLabel(`Page ${currentPage + 1} of ${totalPages}`);
                row.components[2].setDisabled(currentPage === pages.length - 1);

                await i.update({
                    embeds: [pages[currentPage]],
                    components: [row]
                });
            });

            collector.on('end', () => {
                const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    row.components.map(component =>
                        ButtonBuilder.from(component).setDisabled(true)
                    )
                );
                message.edit({ components: [disabledRow] }).catch(() => {});
            });
        } else {
            await interaction.editReply({ embeds: [pages[0]] });
        }
    } catch (error: any) {
        await interaction.editReply({ content: `❌ ${error.message}` });
    }
}

async function handleModTrigger(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = interaction.options.getString('game', true) as GachaGameId;
    const gameConfig = getGameConfig(gameId);

    if (!gameConfig.supportsAutoRedeem) {
        await interaction.reply({
            content: `❌ Auto-redemption is not supported for ${gameConfig.name}.`,
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const redemptionService = getGachaRedemptionService();
        const result = await redemptionService.processGameAutoRedemptions(interaction.client, gameId);

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`🔄 ${gameConfig.shortName} Redemption Triggered`)
            .setDescription(`Processed ${result.usersProcessed} users with ${result.totalRedemptions} attempts.`)
            .addFields(
                { name: '✅ Successful', value: `${result.successful}`, inline: true },
                { name: '❌ Failed', value: `${result.failed}`, inline: true },
                { name: '⏭️ Skipped', value: `${result.skipped}`, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'Gacha Coupon System', iconURL: RAPI_BOT_THUMBNAIL_URL });

        await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
        await interaction.editReply({ content: `❌ ${error.message}` });
    }
}

// ==================== Admin Command Handlers ====================

async function handleModUnsub(interaction: ChatInputCommandInteraction): Promise<void> {
    const targetUser = interaction.options.getUser('user', true);
    const gameId = interaction.options.getString('game', true) as GachaGameId;
    const gameConfig = getGameConfig(gameId);

    try {
        const dataService = getGachaDataService();
        const removed = await dataService.adminUnsubscribe(targetUser.id, gameId);

        if (removed) {
            const embed = new EmbedBuilder()
                .setColor(0xFF6600)
                .setTitle('🔧 User Unsubscribed')
                .setDescription(`<@${targetUser.id}> has been unsubscribed from ${gameConfig.name}.`)
                .setTimestamp()
                .setFooter({ text: 'Admin Action', iconURL: RAPI_BOT_THUMBNAIL_URL });

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({
                content: `❌ <@${targetUser.id}> is not subscribed to ${gameConfig.name}.`,
                flags: MessageFlags.Ephemeral
            });
        }
    } catch (error: any) {
        await interaction.reply({ content: `❌ ${error.message}`, flags: MessageFlags.Ephemeral });
    }
}

async function handleModUpdate(interaction: ChatInputCommandInteraction): Promise<void> {
    const targetUser = interaction.options.getUser('user', true);
    const gameId = interaction.options.getString('game', true) as GachaGameId;
    const newUserId = interaction.options.getString('userid', true);
    const gameConfig = getGameConfig(gameId);

    // Validate new game user ID format
    const validation = validateGameUserId(gameId, newUserId);
    if (!validation.valid) {
        await interaction.reply({
            content: `❌ ${validation.error}`,
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    try {
        const dataService = getGachaDataService();
        await dataService.adminUpdateGameUserId(targetUser.id, gameId, newUserId);

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🔧 User ID Updated')
            .setDescription(`Updated ${gameConfig.userIdFieldName} for <@${targetUser.id}> in ${gameConfig.name}.`)
            .addFields({ name: `New ${gameConfig.userIdFieldName}`, value: `\`${newUserId}\`` })
            .setTimestamp()
            .setFooter({ text: 'Admin Action', iconURL: RAPI_BOT_THUMBNAIL_URL });

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error: any) {
        await interaction.reply({ content: `❌ ${error.message}`, flags: MessageFlags.Ephemeral });
    }
}

async function handleModLookup(interaction: ChatInputCommandInteraction): Promise<void> {
    const targetUser = interaction.options.getUser('user', true);

    try {
        const dataService = getGachaDataService();
        const userSubs = await dataService.getUserSubscriptions(targetUser.id);

        if (!userSubs || Object.keys(userSubs.games).length === 0) {
            await interaction.reply({
                content: `❌ <@${targetUser.id}> has no active subscriptions.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle(`🔍 Subscriptions for ${targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL())
            .setTimestamp()
            .setFooter({ text: 'Admin Lookup', iconURL: RAPI_BOT_THUMBNAIL_URL });

        for (const [gId, gameSub] of Object.entries(userSubs.games)) {
            if (!gameSub) continue;
            const gameConfig = getGameConfig(gId as GachaGameId);

            embed.addFields({
                name: gameConfig.name,
                value: `**${gameConfig.userIdFieldName}:** \`${gameSub.gameUserId}\`\n**Mode:** ${gameSub.mode === 'auto-redeem' ? '🤖 Auto-Redeem' : '📬 Notification Only'}\n**Since:** ${formatDate(gameSub.subscribedAt)}\n**Redeemed:** ${gameSub.redeemedCodes.length} codes`,
            });
        }

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error: any) {
        await interaction.reply({ content: `❌ ${error.message}`, flags: MessageFlags.Ephemeral });
    }
}

async function handleModReset(interaction: ChatInputCommandInteraction): Promise<void> {
    const targetUser = interaction.options.getUser('user', true);
    const gameId = interaction.options.getString('game', true) as GachaGameId;
    const gameConfig = getGameConfig(gameId);

    try {
        const dataService = getGachaDataService();
        await dataService.adminResetRedeemedCodes(targetUser.id, gameId);

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🔧 Redeemed Codes Reset')
            .setDescription(`Reset redeemed codes list for <@${targetUser.id}> in ${gameConfig.name}.`)
            .addFields({ name: 'Effect', value: 'All codes are now marked as unredeemed for this user. Auto-redemption will attempt all active codes again.' })
            .setTimestamp()
            .setFooter({ text: 'Admin Action', iconURL: RAPI_BOT_THUMBNAIL_URL });

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error: any) {
        await interaction.reply({ content: `❌ ${error.message}`, flags: MessageFlags.Ephemeral });
    }
}

async function handleSwitch(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = interaction.options.getString('game', true) as GachaGameId;
    const newMode = interaction.options.getString('mode', true) as SubscriptionMode;
    const gameConfig = getGameConfig(gameId);

    try {
        const dataService = getGachaDataService();
        const subscription = await dataService.getGameSubscription(interaction.user.id, gameId);

        if (!subscription) {
            await interaction.reply({
                content: `❌ You are not subscribed to ${gameConfig.name}. Use \`/redeem subscribe\` first.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Check if already in the requested mode
        if (subscription.mode === newMode) {
            await interaction.reply({
                content: `❌ You are already in ${newMode === 'auto-redeem' ? '🤖 Auto-Redeem' : '📬 Notification Only'} mode for ${gameConfig.name}.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        await dataService.switchSubscriptionMode(interaction.user.id, gameId, newMode);

        const modeDescription = newMode === 'auto-redeem' && gameConfig.supportsAutoRedeem
            ? 'The bot will now automatically redeem new codes for you.'
            : 'You will now receive DM notifications about new and expiring codes.';

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🔄 Mode Switched')
            .setThumbnail(gameConfig.logoPath)
            .setDescription(`Your ${gameConfig.name} subscription mode has been updated!`)
            .addFields(
                { name: 'Previous Mode', value: subscription.mode === 'auto-redeem' ? '🤖 Auto-Redeem' : '📬 Notification Only', inline: true },
                { name: 'New Mode', value: newMode === 'auto-redeem' ? '🤖 Auto-Redeem' : '📬 Notification Only', inline: true }
            )
            .addFields({ name: 'What changes?', value: modeDescription })
            .setTimestamp()
            .setFooter({ text: 'Gacha Coupon System', iconURL: RAPI_BOT_THUMBNAIL_URL });

        if (!gameConfig.supportsAutoRedeem && newMode === 'auto-redeem') {
            embed.addFields({
                name: '⚠️ Note',
                value: `Auto-redeem is not yet supported for ${gameConfig.shortName}. You will receive notifications instead.`
            });
        }

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error: any) {
        await interaction.reply({ content: `❌ ${error.message}`, flags: MessageFlags.Ephemeral });
    }
}

async function handlePreferences(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = interaction.options.getString('game', true) as GachaGameId;
    const gameConfig = getGameConfig(gameId);

    // Get toggle values (null means not provided, so we should show current status)
    const expirationWarnings = interaction.options.getBoolean('expiration_warnings');
    const weeklyDigest = interaction.options.getBoolean('weekly_digest');
    const newCodeAlerts = interaction.options.getBoolean('new_code_alerts');

    try {
        const dataService = getGachaDataService();
        const subscription = await dataService.getGameSubscription(interaction.user.id, gameId);

        if (!subscription) {
            await interaction.reply({
                content: `❌ You are not subscribed to ${gameConfig.name}. Use \`/redeem subscribe\` first.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // If no options provided, just show current preferences
        const noOptionsProvided = expirationWarnings === null && weeklyDigest === null && newCodeAlerts === null;

        if (noOptionsProvided) {
            const prefs = await dataService.getNotificationPreferences(interaction.user.id, gameId);

            const embed = new EmbedBuilder()
                .setColor(gameConfig.embedColor)
                .setTitle(`🔔 ${gameConfig.shortName} Notification Preferences`)
                .setThumbnail(gameConfig.logoPath)
                .setDescription('Your current notification settings:')
                .addFields(
                    { name: '⚠️ Expiration Warnings', value: prefs?.expirationWarnings !== false ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: '📬 Weekly Digest', value: prefs?.weeklyDigest !== false ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: '🆕 New Code Alerts', value: prefs?.newCodeAlerts !== false ? '✅ Enabled' : '❌ Disabled', inline: true }
                )
                .addFields({
                    name: '💡 How to Change',
                    value: 'Use `/redeem preferences` with options to toggle settings.\nExample: `/redeem preferences game:Brown Dust 2 weekly_digest:False`'
                })
                .setTimestamp()
                .setFooter({ text: 'Gacha Coupon System', iconURL: RAPI_BOT_THUMBNAIL_URL });

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        // Update preferences with provided values
        const updates: Partial<{
            expirationWarnings: boolean;
            weeklyDigest: boolean;
            newCodeAlerts: boolean;
        }> = {};

        if (expirationWarnings !== null) updates.expirationWarnings = expirationWarnings;
        if (weeklyDigest !== null) updates.weeklyDigest = weeklyDigest;
        if (newCodeAlerts !== null) updates.newCodeAlerts = newCodeAlerts;

        await dataService.updateNotificationPreferences(interaction.user.id, gameId, updates);

        // Get updated preferences
        const updatedPrefs = await dataService.getNotificationPreferences(interaction.user.id, gameId);

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`✅ ${gameConfig.shortName} Preferences Updated`)
            .setThumbnail(gameConfig.logoPath)
            .setDescription('Your notification preferences have been saved.')
            .addFields(
                { name: '⚠️ Expiration Warnings', value: updatedPrefs?.expirationWarnings !== false ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: '📬 Weekly Digest', value: updatedPrefs?.weeklyDigest !== false ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: '🆕 New Code Alerts', value: updatedPrefs?.newCodeAlerts !== false ? '✅ Enabled' : '❌ Disabled', inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'Gacha Coupon System', iconURL: RAPI_BOT_THUMBNAIL_URL });

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error: any) {
        await interaction.reply({ content: `❌ ${error.message}`, flags: MessageFlags.Ephemeral });
    }
}

async function handleModStats(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = interaction.options.getString('game') as GachaGameId | null;

    try {
        const dataService = getGachaDataService();

        if (gameId) {
            // Show stats for specific game
            const gameConfig = getGameConfig(gameId);
            const analytics = await dataService.getGameAnalytics(gameId);

            const embed = new EmbedBuilder()
                .setColor(gameConfig.embedColor)
                .setTitle(`📊 ${gameConfig.shortName} Analytics`)
                .setThumbnail(gameConfig.logoPath)
                .addFields(
                    { name: '👥 Subscribers', value: `Total: **${analytics.subscribers.total}**\n🤖 Auto: ${analytics.subscribers.autoRedeem}\n📬 Notify: ${analytics.subscribers.notifyOnly}`, inline: true },
                    { name: '🎟️ Coupons', value: `Total: **${analytics.coupons.total}**\n✅ Active: ${analytics.coupons.active}\n❌ Expired: ${analytics.coupons.expired}\n♾️ No Expiry: ${analytics.coupons.noExpiry}`, inline: true },
                    { name: '✨ Redemptions', value: `Total: **${analytics.redemptions.total}**\n👤 Users: ${analytics.redemptions.uniqueUsers}\n📈 Avg/User: ${analytics.redemptions.avgPerUser}`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'Gacha Coupon System', iconURL: RAPI_BOT_THUMBNAIL_URL });

            if (analytics.topCodes.length > 0) {
                const topCodesList = analytics.topCodes
                    .map((c, i) => `${i + 1}. \`${c.code}\` - ${c.redemptions} redemptions`)
                    .join('\n');
                embed.addFields({ name: '🏆 Top Codes', value: topCodesList });
            }

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else {
            // Show system-wide stats
            const analytics = await dataService.getSystemAnalytics();

            const embed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle('📊 System-Wide Analytics')
                .addFields(
                    { name: '👥 Total Subscribers', value: `${analytics.totalSubscribers}`, inline: true },
                    { name: '🎟️ Total Coupons', value: `${analytics.totalCoupons}`, inline: true },
                    { name: '✨ Total Redemptions', value: `${analytics.totalRedemptions}`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'Gacha Coupon System', iconURL: RAPI_BOT_THUMBNAIL_URL });

            // Add per-game breakdown
            if (Object.keys(analytics.byGame).length > 0) {
                let gameBreakdown = '';
                for (const [gId, stats] of Object.entries(analytics.byGame)) {
                    const config = getGameConfig(gId as GachaGameId);
                    gameBreakdown += `**${config.shortName}**: ${stats.subscribers} subs, ${stats.coupons} codes, ${stats.redemptions} redeemed\n`;
                }
                embed.addFields({ name: '🎮 By Game', value: gameBreakdown });
            }

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    } catch (error: any) {
        await interaction.reply({ content: `❌ ${error.message}`, flags: MessageFlags.Ephemeral });
    }
}

async function handleModScrape(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const result = await syncBD2PulseCodes();

        if (!result.success) {
            await interaction.editReply({ content: `❌ Scraping failed: ${result.error}` });
            return;
        }

        // Separate active and expired codes for display
        const now = new Date();
        const activeCodes = result.codes.filter(c => !c.expirationDate || new Date(c.expirationDate) > now);
        const expiredCodes = result.codes.filter(c => c.expirationDate && new Date(c.expirationDate) <= now);

        // Build status message
        let statusMessage = '';
        if (result.newCodes.length > 0) {
            statusMessage = `✅ Added **${result.newCodes.length}** new code(s)!`;
        } else if (result.skippedExisting.length > 0) {
            statusMessage = `All ${activeCodes.length} active codes already tracked.`;
        } else {
            statusMessage = 'No new redemption codes available.';
        }

        const embed = new EmbedBuilder()
            .setColor(result.newCodes.length > 0 ? 0x00FF00 : 0x3498DB)
            .setTitle('🔍 BD2 Pulse Sync')
            .setDescription(statusMessage)
            .setTimestamp()
            .setFooter({ text: 'BD2 Pulse • thebd2pulse.com', iconURL: RAPI_BOT_THUMBNAIL_URL });

        // Stats row
        embed.addFields(
            { name: '📊 Active', value: `${activeCodes.length}`, inline: true },
            { name: '⏰ Expired', value: `${expiredCodes.length}`, inline: true },
            { name: '➕ New', value: `${result.newCodes.length}`, inline: true }
        );

        // Show newly added codes
        if (result.newCodes.length > 0) {
            const newCodeDetails = result.newCodes.map(code => {
                const codeData = result.codes.find(c => c.code === code);
                if (codeData) {
                    const expiry = codeData.expirationDate
                        ? formatDate(codeData.expirationDate)
                        : '∞';
                    return `\`${code}\` → ${codeData.rewards} (${expiry})`;
                }
                return `\`${code}\``;
            }).join('\n');
            embed.addFields({ name: '🆕 New Codes Added', value: newCodeDetails.substring(0, 1024) });
        }

        // Show active codes in a cleaner table format
        if (activeCodes.length > 0) {
            const codeList = activeCodes
                .sort((a, b) => {
                    // Sort by expiration date (soonest first), then no-expiry last
                    if (!a.expirationDate && !b.expirationDate) return 0;
                    if (!a.expirationDate) return 1;
                    if (!b.expirationDate) return -1;
                    return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
                })
                .slice(0, 10)
                .map(c => {
                    const expiry = c.expirationDate
                        ? new Date(c.expirationDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : '∞';
                    const statusIcon = c.status === 'permanent' ? '🔒' : c.status === 'limited' ? '⏳' : '✨';
                    return `${statusIcon} \`${c.code}\`\n   ↳ ${c.rewards} • ${expiry}`;
                }).join('\n');

            const moreText = activeCodes.length > 10 ? `\n\n*...and ${activeCodes.length - 10} more*` : '';
            embed.addFields({ name: '✅ Active Codes', value: codeList + moreText });
        }

        // Show skipped info if relevant
        if (result.skippedExpired.length > 0) {
            embed.addFields({
                name: '⏭️ Skipped',
                value: `${result.skippedExpired.length} expired code(s) not added`,
                inline: true
            });
        }

        await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
        await interaction.editReply({ content: `❌ ${error.message}` });
    }
}

async function handleModSubscribers(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = interaction.options.getString('game', true) as GachaGameId;
    const modeFilter = interaction.options.getString('mode') || 'all';
    const gameConfig = getGameConfig(gameId);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const dataService = getGachaDataService();
        const mode = modeFilter === 'all' ? undefined : modeFilter as SubscriptionMode;
        const subscribers = await dataService.getGameSubscribers(gameId, mode);

        if (subscribers.length === 0) {
            await interaction.editReply({
                content: `No subscribers found for ${gameConfig.name}${mode ? ` (${mode})` : ''}.`
            });
            return;
        }

        // Build paginated embeds (10 subscribers per page)
        const SUBS_PER_PAGE = 10;
        const pages: EmbedBuilder[] = [];
        const totalPages = Math.ceil(subscribers.length / SUBS_PER_PAGE);

        for (let i = 0; i < totalPages; i++) {
            const pageSubscribers = subscribers.slice(i * SUBS_PER_PAGE, (i + 1) * SUBS_PER_PAGE);

            const subscriberList = pageSubscribers.map((s, idx) => {
                const sub = s.subscription;
                const modeIcon = sub.mode === 'auto-redeem' ? '🤖' : '📬';
                const redeemed = sub.redeemedCodes.length;
                return `${i * SUBS_PER_PAGE + idx + 1}. <@${s.discordId}> ${modeIcon}\n` +
                       `   └ ${gameConfig.userIdFieldName}: \`${sub.gameUserId}\` | Redeemed: ${redeemed}`;
            }).join('\n');

            const embed = new EmbedBuilder()
                .setColor(gameConfig.embedColor)
                .setTitle(`👥 ${gameConfig.shortName} Subscribers`)
                .setThumbnail(gameConfig.logoPath)
                .setDescription(
                    `**Total:** ${subscribers.length} subscribers` +
                    `${mode ? ` (${mode})` : ''}\n\n` +
                    subscriberList
                )
                .setFooter({ text: `Page ${i + 1} of ${totalPages}`, iconURL: RAPI_BOT_THUMBNAIL_URL })
                .setTimestamp();

            pages.push(embed);
        }

        // Use pagination if multiple pages
        if (pages.length > 1) {
            let currentPage = 0;
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId('sub_previous')
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('sub_page')
                    .setLabel(`Page 1 of ${totalPages}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('sub_next')
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(totalPages <= 1)
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
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                currentPage = i.customId === 'sub_next'
                    ? (currentPage + 1) % pages.length
                    : (currentPage - 1 + pages.length) % pages.length;

                row.components[0].setDisabled(currentPage === 0);
                row.components[1].setLabel(`Page ${currentPage + 1} of ${totalPages}`);
                row.components[2].setDisabled(currentPage === pages.length - 1);

                await i.update({
                    embeds: [pages[currentPage]],
                    components: [row]
                });
            });

            collector.on('end', () => {
                const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    row.components.map(component =>
                        ButtonBuilder.from(component).setDisabled(true)
                    )
                );
                message.edit({ components: [disabledRow] }).catch(() => {});
            });
        } else {
            await interaction.editReply({ embeds: [pages[0]] });
        }
    } catch (error: any) {
        await interaction.editReply({ content: `❌ ${error.message}` });
    }
}

async function handleHelp(interaction: ChatInputCommandInteraction): Promise<void> {
    const isMod = await checkModPermission(interaction);

    const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('Coupon Redemption System Help')
        .setDescription('Automatically redeem coupon codes for supported gacha games.')
        .setTimestamp()
        .setFooter({ text: 'Gacha Coupon System', iconURL: RAPI_BOT_THUMBNAIL_URL });

    // User Commands Section
    embed.addFields({
        name: 'User Commands',
        value: [
            '`/redeem subscribe` - Subscribe to a game for auto-redeem or notifications',
            '`/redeem unsubscribe` - Unsubscribe from a game',
            '`/redeem status` - View your subscription status',
            '`/redeem codes` - View active coupon codes',
            '`/redeem preferences` - Configure notification settings',
            '`/redeem switch` - Switch between auto-redeem and notification modes',
        ].join('\n'),
    });

    // Modes FAQ
    embed.addFields({
        name: 'Subscription Modes',
        value: [
            '**Auto-Redeem**: Bot automatically redeems codes for you (BD2 only)',
            '**Notification-Only**: Get DM alerts about new codes (all games)',
        ].join('\n'),
    });

    // Game-Specific Info - Brown Dust 2
    embed.addFields({
        name: 'Brown Dust 2',
        value: [
            '**Important**: Use your **in-game nickname**, NOT your UID!',
            'Find it in-game: Profile > Your display name',
            'Auto-redemption runs every 6 hours + immediately when new codes are added',
        ].join('\n'),
    });

    // Game-Specific Info - Lost Sword
    embed.addFields({
        name: 'Lost Sword',
        value: [
            '**No account ID required** - Just subscribe to get notifications',
            '**Notification-only mode** - Codes must be redeemed in-game',
            'Redeem in-game: Settings > Account > Redeem Coupon',
            'React with ✅ on DM notifications to mark codes as redeemed',
        ].join('\n'),
    });

    // Preferences FAQ
    embed.addFields({
        name: 'Notification Preferences',
        value: [
            '**Expiration Warnings**: Daily alerts for codes expiring within 3 days',
            '**Weekly Digest**: Sunday summary of unredeemed codes',
            '**New Code Alerts**: Instant DM when new codes are added',
        ].join('\n'),
    });

    // Mod Commands Section (only if user is mod)
    if (isMod) {
        embed.addFields({
            name: 'Mod Commands',
            value: [
                '`/redeem add` - Add a new coupon code',
                '`/redeem remove` - Deactivate a coupon code',
                '`/redeem list` - View all codes with stats',
                '`/redeem trigger` - Manually trigger auto-redemption',
                '`/redeem scrape` - Fetch codes from BD2 Pulse',
                '`/redeem stats` - View analytics',
                '`/redeem subscribers` - View paginated list of subscribers',
                '`/redeem lookup` - View user subscription details',
                '`/redeem unsub` - Force unsubscribe a user',
                '`/redeem update` - Update user\'s game ID',
                '`/redeem reset` - Reset user\'s redeemed codes',
            ].join('\n'),
        });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// ==================== Command Export ====================

export default {
    data: new SlashCommandBuilder()
        .setName('redeem')
        .setDescription('Gacha game coupon redemption system')

        // User: Subscribe
        .addSubcommand(sub => sub
            .setName('subscribe')
            .setDescription('Subscribe to coupon notifications for a game')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game to subscribe to')
                .setRequired(true)
                .addChoices(...GAME_CHOICES))
            .addStringOption(opt => opt
                .setName('mode')
                .setDescription('Subscription mode')
                .setRequired(true)
                .addChoices(
                    { name: '🤖 Auto-Redeem', value: 'auto-redeem' },
                    { name: '📬 Notification Only', value: 'notification-only' }
                ))
            .addStringOption(opt => opt
                .setName('userid')
                .setDescription('Your in-game ID (required for BD2, optional for Lost Sword)')
                .setRequired(false)))

        // User: Unsubscribe
        .addSubcommand(sub => sub
            .setName('unsubscribe')
            .setDescription('Unsubscribe from a game')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game to unsubscribe from')
                .setRequired(true)
                .addChoices(...GAME_CHOICES)))

        // User: Status
        .addSubcommand(sub => sub
            .setName('status')
            .setDescription('View your subscription status')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Specific game (leave empty for all)')
                .setRequired(false)
                .addChoices(...GAME_CHOICES)))

        // User: Codes
        .addSubcommand(sub => sub
            .setName('codes')
            .setDescription('View available coupon codes')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game')
                .setRequired(true)
                .addChoices(...GAME_CHOICES)))

        // Mod: Add
        .addSubcommand(sub => sub
            .setName('add')
            .setDescription('[Mod] Add a new coupon code')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game')
                .setRequired(true)
                .addChoices(...GAME_CHOICES))
            .addStringOption(opt => opt
                .setName('code')
                .setDescription('The coupon code')
                .setRequired(true)
                .setMaxLength(30))
            .addStringOption(opt => opt
                .setName('rewards')
                .setDescription('Reward description')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('expiration')
                .setDescription('Expiration date (YYYY-MM-DD or "never")')
                .setRequired(false))
            .addStringOption(opt => opt
                .setName('source')
                .setDescription('Where this code came from')
                .setRequired(false)))

        // Mod: Remove
        .addSubcommand(sub => sub
            .setName('remove')
            .setDescription('[Mod] Remove a coupon code')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game')
                .setRequired(true)
                .addChoices(...GAME_CHOICES))
            .addStringOption(opt => opt
                .setName('code')
                .setDescription('Code to remove')
                .setRequired(true)
                .setAutocomplete(true)))

        // Mod: List
        .addSubcommand(sub => sub
            .setName('list')
            .setDescription('[Mod] View all codes and stats')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game')
                .setRequired(true)
                .addChoices(...GAME_CHOICES))
            .addStringOption(opt => opt
                .setName('filter')
                .setDescription('Filter codes to display')
                .setRequired(false)
                .addChoices(
                    { name: 'All (default)', value: 'all' },
                    { name: 'Active Only', value: 'active' },
                    { name: 'Expired/Inactive Only', value: 'expired' }
                )))

        // Mod: Trigger
        .addSubcommand(sub => sub
            .setName('trigger')
            .setDescription('[Mod] Manually trigger auto-redemption')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game')
                .setRequired(true)
                .addChoices(...GAME_CHOICES)))

        // Mod: Unsub (force unsubscribe a user)
        .addSubcommand(sub => sub
            .setName('unsub')
            .setDescription('[Mod] Force unsubscribe a user')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to unsubscribe')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game')
                .setRequired(true)
                .addChoices(...GAME_CHOICES)))

        // Mod: Update (change user's game ID)
        .addSubcommand(sub => sub
            .setName('update')
            .setDescription('[Mod] Update a user\'s game ID')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to update')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game')
                .setRequired(true)
                .addChoices(...GAME_CHOICES))
            .addStringOption(opt => opt
                .setName('userid')
                .setDescription('New game user ID')
                .setRequired(true)))

        // Mod: Lookup (view user's subscriptions)
        .addSubcommand(sub => sub
            .setName('lookup')
            .setDescription('[Mod] View a user\'s subscriptions')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to lookup')
                .setRequired(true)))

        // Mod: Reset (reset redeemed codes)
        .addSubcommand(sub => sub
            .setName('reset')
            .setDescription('[Mod] Reset a user\'s redeemed codes list')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to reset')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game')
                .setRequired(true)
                .addChoices(...GAME_CHOICES)))

        // Mod: Scrape (fetch codes from BD2 Pulse)
        .addSubcommand(sub => sub
            .setName('scrape')
            .setDescription('[Mod] Fetch new codes from BD2 Pulse'))

        // Mod: Stats (analytics)
        .addSubcommand(sub => sub
            .setName('stats')
            .setDescription('[Mod] View redemption analytics and statistics')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Specific game (leave empty for system-wide)')
                .setRequired(false)
                .addChoices(...GAME_CHOICES)))

        // Mod: Subscribers (paginated list)
        .addSubcommand(sub => sub
            .setName('subscribers')
            .setDescription('[Mod] View paginated list of subscribers for a game')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game')
                .setRequired(true)
                .addChoices(...GAME_CHOICES))
            .addStringOption(opt => opt
                .setName('mode')
                .setDescription('Filter by subscription mode')
                .setRequired(false)
                .addChoices(
                    { name: 'All', value: 'all' },
                    { name: '🤖 Auto-Redeem', value: 'auto-redeem' },
                    { name: '📬 Notification Only', value: 'notification-only' }
                )))

        // User: Preferences
        .addSubcommand(sub => sub
            .setName('preferences')
            .setDescription('Configure notification preferences for a game')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game')
                .setRequired(true)
                .addChoices(...GAME_CHOICES))
            .addBooleanOption(opt => opt
                .setName('expiration_warnings')
                .setDescription('Receive warnings when codes are about to expire')
                .setRequired(false))
            .addBooleanOption(opt => opt
                .setName('weekly_digest')
                .setDescription('Receive weekly summary of your codes')
                .setRequired(false))
            .addBooleanOption(opt => opt
                .setName('new_code_alerts')
                .setDescription('Get notified when new codes are added')
                .setRequired(false)))

        // User: Switch (change subscription mode)
        .addSubcommand(sub => sub
            .setName('switch')
            .setDescription('Switch subscription mode without re-subscribing')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game')
                .setRequired(true)
                .addChoices(...GAME_CHOICES))
            .addStringOption(opt => opt
                .setName('mode')
                .setDescription('New subscription mode')
                .setRequired(true)
                .addChoices(
                    { name: '🤖 Auto-Redeem', value: 'auto-redeem' },
                    { name: '📬 Notification Only', value: 'notification-only' }
                )))

        // User: Help
        .addSubcommand(sub => sub
            .setName('help')
            .setDescription('View help and FAQs about the coupon redemption system')),

    async execute(interaction: ChatInputCommandInteraction) {
        // Check if this server is allowed to use the gacha coupon system
        const guildConfigService = getGachaGuildConfigService();
        const isAllowed = await guildConfigService.isGuildAllowed(interaction.guildId);

        if (!isAllowed) {
            await interaction.reply({
                content: '❌ The gacha coupon system is not available on this server.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        // Mod-only commands
        const modCommands = ['add', 'remove', 'list', 'trigger', 'unsub', 'update', 'lookup', 'reset', 'scrape', 'stats', 'subscribers'];
        if (modCommands.includes(subcommand)) {
            const hasPermission = await checkModPermission(interaction);
            if (!hasPermission) {
                await interaction.reply({
                    content: '❌ You need the "mods" role or administrator permission for this command.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
        }

        switch (subcommand) {
            case 'subscribe': return handleSubscribe(interaction);
            case 'unsubscribe': return handleUnsubscribe(interaction);
            case 'status': return handleStatus(interaction);
            case 'codes': return handleCodes(interaction);
            case 'add': return handleModAdd(interaction);
            case 'remove': return handleModRemove(interaction);
            case 'list': return handleModList(interaction);
            case 'trigger': return handleModTrigger(interaction);
            case 'unsub': return handleModUnsub(interaction);
            case 'update': return handleModUpdate(interaction);
            case 'lookup': return handleModLookup(interaction);
            case 'reset': return handleModReset(interaction);
            case 'scrape': return handleModScrape(interaction);
            case 'stats': return handleModStats(interaction);
            case 'subscribers': return handleModSubscribers(interaction);
            case 'preferences': return handlePreferences(interaction);
            case 'switch': return handleSwitch(interaction);
            case 'help': return handleHelp(interaction);
        }
    },

    async autocomplete(interaction: AutocompleteInteraction) {
        const focusedOption = interaction.options.getFocused(true);

        if (focusedOption.name === 'code') {
            const gameId = interaction.options.getString('game') as GachaGameId | null;
            if (!gameId || !isValidGameId(gameId)) {
                await interaction.respond([]);
                return;
            }

            try {
                const dataService = getGachaDataService();
                const coupons = await dataService.getActiveCoupons(gameId);

                const filtered = coupons
                    .filter(c => c.code.toLowerCase().includes(focusedOption.value.toLowerCase()))
                    .slice(0, 25)
                    .map(c => ({ name: `${c.code} - ${c.rewards}`, value: c.code }));

                await interaction.respond(filtered);
            } catch {
                await interaction.respond([]);
            }
        }
    }
};
