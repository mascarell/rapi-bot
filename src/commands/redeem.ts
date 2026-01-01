import {
    SlashCommandBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    PermissionFlagsBits,
    Role
} from 'discord.js';
import { getGachaDataService } from '../services/gachaDataService';
import { getGachaRedemptionService } from '../services/gachaRedemptionService';
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

// ==================== Command Handlers ====================

async function handleSubscribe(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = interaction.options.getString('game', true) as GachaGameId;
    const gameUserId = interaction.options.getString('userid', true);
    const mode = interaction.options.getString('mode', true) as SubscriptionMode;

    const gameConfig = getGameConfig(gameId);

    if (gameUserId.length > gameConfig.maxNicknameLength) {
        await interaction.reply({
            content: `❌ ${gameConfig.userIdFieldName} must be ${gameConfig.maxNicknameLength} characters or less.`,
            ephemeral: true
        });
        return;
    }

    try {
        const dataService = getGachaDataService();
        await dataService.subscribe(interaction.user.id, gameId, gameUserId, mode);

        const modeDescription = mode === 'auto-redeem' && gameConfig.supportsAutoRedeem
            ? 'The bot will automatically redeem new codes for you.'
            : 'You will receive DM notifications about new and expiring codes.';

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ Subscription Activated')
            .setThumbnail(gameConfig.logoPath)
            .setDescription(`You are now subscribed to ${gameConfig.name} coupon updates!`)
            .addFields(
                { name: gameConfig.userIdFieldName, value: `\`${gameUserId}\``, inline: true },
                { name: 'Mode', value: mode === 'auto-redeem' ? '🤖 Auto-Redeem' : '📬 Notification Only', inline: true }
            )
            .addFields({ name: 'What happens now?', value: modeDescription })
            .setTimestamp()
            .setFooter({ text: 'Gacha Coupon System', iconURL: RAPI_BOT_THUMBNAIL_URL });

        if (!gameConfig.supportsAutoRedeem && mode === 'auto-redeem') {
            embed.addFields({
                name: '⚠️ Note',
                value: `Auto-redeem is not yet supported for ${gameConfig.shortName}. You will receive notifications instead.`
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error: any) {
        await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
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

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
            await interaction.reply({
                content: `❌ You are not subscribed to ${gameConfig.name}.`,
                ephemeral: true
            });
        }
    } catch (error: any) {
        await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
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
                ephemeral: true
            });
            return;
        }

        // If specific game requested
        if (gameId) {
            const gameSub = userSubs.games[gameId];
            if (!gameSub) {
                await interaction.reply({
                    content: `❌ You are not subscribed to ${getGameConfig(gameId).name}.`,
                    ephemeral: true
                });
                return;
            }

            const gameConfig = getGameConfig(gameId);
            const activeCoupons = await dataService.getActiveCoupons(gameId);
            const unredeemed = await dataService.getUnredeemedCodes(interaction.user.id, gameId);

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

            await interaction.reply({ embeds: [embed], ephemeral: true });
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

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    } catch (error: any) {
        await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
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
                ephemeral: true
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

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error: any) {
        await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
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

        await interaction.reply({ embeds: [embed], ephemeral: true });

        // Notify subscribers
        const redemptionService = getGachaRedemptionService();
        await redemptionService.notifyNewCode(interaction.client, coupon);

    } catch (error: any) {
        await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
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

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
            await interaction.reply({ content: `❌ Code \`${code}\` not found for ${gameConfig.name}.`, ephemeral: true });
        }
    } catch (error: any) {
        await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
    }
}

async function handleModList(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = interaction.options.getString('game', true) as GachaGameId;
    const gameConfig = getGameConfig(gameId);

    try {
        const dataService = getGachaDataService();
        const allCoupons = await dataService.getAllCoupons(gameId);
        const stats = await dataService.getGameStats(gameId);

        const activeCoupons = allCoupons.filter(c => c.isActive);
        const inactiveCoupons = allCoupons.filter(c => !c.isActive);

        const embed = new EmbedBuilder()
            .setColor(gameConfig.embedColor)
            .setTitle(`📋 ${gameConfig.shortName} Coupon Management`)
            .setThumbnail(gameConfig.logoPath)
            .setDescription(`**Subscribers:** ${stats.total} (🤖 ${stats.autoRedeem} | 📬 ${stats.notifyOnly})`)
            .setTimestamp()
            .setFooter({ text: 'Gacha Coupon System', iconURL: RAPI_BOT_THUMBNAIL_URL });

        if (activeCoupons.length > 0) {
            const activeList = activeCoupons.map(c => {
                const expiry = c.expirationDate ? formatDate(c.expirationDate) : 'No expiry';
                return `• \`${c.code}\` - ${c.rewards} (${expiry})`;
            }).join('\n');
            embed.addFields({ name: `✅ Active (${activeCoupons.length})`, value: activeList.substring(0, 1024) });
        } else {
            embed.addFields({ name: '✅ Active', value: 'No active coupons' });
        }

        if (inactiveCoupons.length > 0) {
            const inactiveList = inactiveCoupons.slice(-5).map(c => `• \`${c.code}\``).join('\n');
            embed.addFields({ name: `❌ Inactive (last 5 of ${inactiveCoupons.length})`, value: inactiveList });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error: any) {
        await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
    }
}

async function handleModTrigger(interaction: ChatInputCommandInteraction): Promise<void> {
    const gameId = interaction.options.getString('game', true) as GachaGameId;
    const gameConfig = getGameConfig(gameId);

    if (!gameConfig.supportsAutoRedeem) {
        await interaction.reply({
            content: `❌ Auto-redemption is not supported for ${gameConfig.name}.`,
            ephemeral: true
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

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

// ==================== Command Export ====================

module.exports = {
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
                .setName('userid')
                .setDescription('Your in-game ID (nickname/UID)')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('mode')
                .setDescription('Subscription mode')
                .setRequired(true)
                .addChoices(
                    { name: '🤖 Auto-Redeem', value: 'auto-redeem' },
                    { name: '📬 Notification Only', value: 'notification-only' }
                )))

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
                .addChoices(...GAME_CHOICES)))

        // Mod: Trigger
        .addSubcommand(sub => sub
            .setName('trigger')
            .setDescription('[Mod] Manually trigger auto-redemption')
            .addStringOption(opt => opt
                .setName('game')
                .setDescription('Which game')
                .setRequired(true)
                .addChoices(...GAME_CHOICES))),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();

        // Mod-only commands
        const modCommands = ['add', 'remove', 'list', 'trigger'];
        if (modCommands.includes(subcommand)) {
            const hasPermission = await checkModPermission(interaction);
            if (!hasPermission) {
                await interaction.reply({
                    content: '❌ You need the "mods" role or administrator permission for this command.',
                    ephemeral: true
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
