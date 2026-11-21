import {
    SlashCommandBuilder,
    EmbedBuilder,
    ColorResolvable,
    ChatInputCommandInteraction,
    MessageFlags,
    InteractionContextType,
} from 'discord.js';
import { SlashCommand } from '../utils/interfaces/Command.interface.js';
import {
    GACHA_CONFIGS,
    RateLimiter,
    GachaPuller,
    handlePagination
} from './utils/index.js';
import { handleCommandError } from '../utils/commandErrorHandler.js';

// Initialize rate limiter
RateLimiter.init();

/**
 * Command export for Discord.js
 * Handles gacha pull functionality for gacha games
 */
export default {
    data: new SlashCommandBuilder()
        .setContexts(InteractionContextType.Guild)
        .setName('gacha')
        .setDescription('Performs a gacha pull for your favorite gacha game!')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of pull')
                .setRequired(true)
                .addChoices(
                    { name: 'Single Pull', value: 'single' },
                    { name: 'Multi Pull (10x)', value: 'multi' }
                ))
        .addStringOption(option =>
            option.setName('game')
                .setDescription('Select the game')
                .setRequired(true)
                .addChoices(
                    { name: 'GODDESS OF VICTORY: NIKKE', value: 'nikke' }
                )),

    async execute(interaction: ChatInputCommandInteraction) {
        // Check the limit before deferring: a defer fixes the reply as public,
        // and the cooldown notice should only be seen by the person pulling.
        if (!RateLimiter.check(interaction.user.id)) {
            await interaction.reply({
                content: 'Commander, please wait before pulling again!',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await interaction.deferReply();

        try {
            const game = interaction.options.get('game')?.value as keyof typeof GACHA_CONFIGS;
            const pullType = interaction.options.get('type')?.value as string;
            const gameConfig = GACHA_CONFIGS[game];

            const results = await GachaPuller.pull(pullType, gameConfig);
            const embeds = results.map(result => new EmbedBuilder()
                .setTitle(`${result.name} - ${result.rarity}`)
                .setColor(gameConfig.rarities[result.rarity as keyof typeof gameConfig.rarities].color as ColorResolvable)
                .setImage(result.imageUrl)
                .setFooter({ text: gameConfig.rarities[result.rarity as keyof typeof gameConfig.rarities].footerText }));

            if (pullType === 'single') {
                await interaction.followUp({ embeds: [embeds[0]] });
                return;
            }

            await handlePagination(interaction, embeds);
        } catch (error) {
            await handleCommandError(interaction, error, 'gacha');
        }
    }
} as SlashCommand;
