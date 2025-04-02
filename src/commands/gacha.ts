import {
    SlashCommandBuilder,
    EmbedBuilder,
    ColorResolvable,
    ChatInputCommandInteraction,
} from 'discord.js';
import { SlashCommand } from '../utils/interfaces/Command.interface';
import { 
    GACHA_CONFIGS,
    RateLimiter,
    GachaPuller,
    handlePagination 
} from './utils';

// Initialize rate limiter
RateLimiter.init();

/**
 * Command export for Discord.js
 * Handles gacha pull functionality for gacha games
 */
module.exports = {
    data: new SlashCommandBuilder()
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
        await interaction.deferReply();

        try {
            if (!RateLimiter.check(interaction.user.id)) {
                await interaction.followUp("Commander, please wait before pulling again!");
                return;
            }

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
            console.error('Gacha pull error:', error);
            await interaction.followUp('Commander, there was an error with the gacha system...');
        }
    }
} as SlashCommand;
