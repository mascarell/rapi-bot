import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    CommandInteraction,
    ColorResolvable,
} from 'discord.js';
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { s3Client } from '../discord';

// CDN Constants
const CDN_DOMAIN_URL = 'https://rapi-bot.sfo3.cdn.digitaloceanspaces.com';
// Track recently pulled characters per guild and game
const recentPulls: Map<string, Map<string, Map<string, string[]>>> = new Map();
const MAX_RECENT_PULLS = 10;

interface GachaGameConfig {
    rates: Record<string, number>;
    cdnPrefix: string;
    rarities: Record<string, {
        color: string;
        footerText: string;
    }>;
}

const GACHA_CONFIGS: Record<string, GachaGameConfig> = {
    nikke: {
        rates: {
            "Pilgrim": 0.004,
            "SSR": 0.04,
            "SR": 0.455,
            "R": 0.501
        },
        cdnPrefix: "gacha/nikke/rarities",
        rarities: {
            "Pilgrim": {
                color: "#FFA500",
                footerText: "A legendary find, Commander! Are we dreaming?"
            },
            "SSR": {
                color: "#FFD700",
                footerText: "Wow! A SSR? That's incredibly lucky, Commander!"
            },
            "SR": {
                color: "#800080",
                footerText: "An SR! You're on the right track, Commander!"
            },
            "R": {
                color: "#ADD8E6",
                footerText: "It's just an R, but every squad member counts!"
            }
        }
    }
    // Add more games here following the same structure
};

const userCommandUsage: Record<string, number[]> = {};

setInterval(() => {
    const expirationTime = 300000; // 5 minutes in milliseconds
    const currentTime = Date.now();
    for (const userId in userCommandUsage) {
        userCommandUsage[userId] = userCommandUsage[userId].filter(time => currentTime - time < expirationTime);
        if (userCommandUsage[userId].length === 0) {
            delete userCommandUsage[userId];
        }
    }
}, 600000); // Runs every 10 minutes

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gacha')
        .setDescription('Performs a gacha pull!')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of pull')
                .setRequired(true)
                .addChoices({ name: 'single', value: 'single' }, { name: 'multi', value: 'multi' }))
        .addStringOption(option =>
            option.setName('game')
                .setDescription('Select the game')
                .setRequired(true)
                .addChoices(
                    { name: 'GODDESS OF VICTORY: NIKKE', value: 'nikke' }
                )),

    async execute(interaction: CommandInteraction) {
        await interaction.deferReply();
        const game = interaction.options.get('game')?.value as string;
        const pullType = interaction.options.get('type')?.value as string;
        const userId = interaction.user.id;

        // Rate limit check
        if (!userCommandUsage[userId]) userCommandUsage[userId] = [];
        userCommandUsage[userId].push(Date.now());

        if (userCommandUsage[userId].filter(time => Date.now() - time < 300000).length >= 20) {
            await interaction.followUp("Commander, let's take it easy with the gacha, shall we? Too much excitement isn't good!");
            return;
        }

        const gameConfig = GACHA_CONFIGS[game];
        if (!gameConfig) {
            await interaction.followUp('Selected game is not supported!');
            return;
        }

        try {
            const results = await pullCharacters(pullType, gameConfig, interaction.guildId!);
            const embeds = await generateEmbeds(results, gameConfig);

            if (pullType === 'multi') {
                await handlePagination(interaction, embeds);
            } else {
                await interaction.followUp({ embeds: [embeds[0]] });
            }
        } catch (error) {
            console.error('Error in gacha pull:', error);
            await interaction.followUp('Commander, there seems to be an issue with the gacha system...');
        }
    },
};

/**
 * Gets a random character URL from the CDN while preventing recent repeats
 * 
 * @param game - The game identifier (e.g., 'nikke')
 * @param rarity - The rarity folder to pull from
 * @param guildId - Discord guild ID for tracking pulls
 * @returns Promise<string> Full CDN URL of the character image
 */
async function getRandomGachaCharacter(
    game: string,
    rarity: string,
    guildId: string
): Promise<string> {
    if (!game || !rarity || !guildId) {
        throw new Error('Missing required parameters for gacha pull');
    }

    const gameConfig = GACHA_CONFIGS[game];
    if (!gameConfig) {
        throw new Error(`Game configuration not found for ${game}`);
    }

    const prefix = `${gameConfig.cdnPrefix}/${rarity.toLowerCase()}`;
    
    try {
        // List all characters for this rarity
        const response = await s3Client.send(new ListObjectsV2Command({
            Bucket: process.env.S3BUCKET,
            Prefix: prefix,
        }));

        if (!response.Contents || response.Contents.length === 0) {
            throw new Error(`No characters found for ${game} ${rarity}`);
        }

        // Initialize tracking maps if they don't exist
        if (!recentPulls.has(guildId)) {
            recentPulls.set(guildId, new Map());
        }
        const guildPulls = recentPulls.get(guildId)!;
        
        if (!guildPulls.has(game)) {
            guildPulls.set(game, new Map());
        }
        const gamePulls = guildPulls.get(game)!;
        
        if (!gamePulls.has(rarity)) {
            gamePulls.set(rarity, []);
        }
        const rarityPulls = gamePulls.get(rarity)!;

        // Get all valid character keys
        const characterKeys = response.Contents
            .map(obj => obj.Key)
            .filter(key => key && key.match(/\.(jpg|jpeg|png|gif|webp)$/i));

        if (characterKeys.length === 0) {
            throw new Error(`No valid character images found for ${game} ${rarity}`);
        }

        // Filter out recently pulled characters
        const availableKeys = characterKeys.filter(key => !rarityPulls.includes(key!));

        // If all characters have been recently pulled, reset tracking
        if (availableKeys.length === 0) {
            gamePulls.set(rarity, []);
            const randomKey = characterKeys[Math.floor(Math.random() * characterKeys.length)]!;
            gamePulls.get(rarity)!.push(randomKey);
            return `${CDN_DOMAIN_URL}/${randomKey}`;
        }

        // Select random character from available ones
        const randomKey = availableKeys[Math.floor(Math.random() * availableKeys.length)]!;
        
        // Update tracking
        rarityPulls.push(randomKey);
        if (rarityPulls.length > MAX_RECENT_PULLS) {
            rarityPulls.shift();
        }

        return `${CDN_DOMAIN_URL}/${randomKey}`;

    } catch (error) {
        console.error(`Error in gacha pull for ${game} ${rarity}:`, error);
        throw new Error(`Failed to pull character for ${game} ${rarity}`);
    }
}

async function pullCharacters(pullType: string, gameConfig: GachaGameConfig, guildId: string) {
    const pulls = pullType === 'multi' ? 10 : 1;
    const results = [];

    for (let i = 0; i < pulls; i++) {
        const rand = Math.random();
        const rarity = determineRarity(rand, gameConfig.rates);
        
        // Get random character URL for the rarity
        const imageUrl = await getRandomGachaCharacter(
            'nikke', // or whatever game is being pulled
            rarity,
            guildId
        );

        results.push({
            rarity,
            imageUrl
        });
    }
    return results;
}

function determineRarity(rand: number, rates: Record<string, number>) {
    let cumulativeRate = 0;
    for (const [rarity, rate] of Object.entries(rates)) {
        cumulativeRate += rate;
        if (rand < cumulativeRate) {
            return rarity;
        }
    }
    return Object.keys(rates)[Object.keys(rates).length - 1]; // Return lowest rarity as fallback
}

async function generateEmbeds(results: any[], gameConfig: GachaGameConfig) {
    return results.map(result => new EmbedBuilder()
        .setTitle(`Rarity: ${result.rarity}`)
        .setColor(gameConfig.rarities[result.rarity].color as ColorResolvable)
        .setImage(result.imageUrl)
        .setFooter({ text: gameConfig.rarities[result.rarity].footerText }));
}

async function handlePagination(interaction: CommandInteraction, embeds: EmbedBuilder[]) {
    let currentPage = 0;
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("previous").setLabel("Previous").setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId("page").setLabel(`Pull 1 of ${embeds.length}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId("next").setLabel("Next").setStyle(ButtonStyle.Primary).setDisabled(embeds.length <= 1)
    );

    const message = await interaction.followUp({ embeds: [embeds[currentPage]], components: [row] });
    const collector = message.createMessageComponentCollector({ time: 900000 }); 

    collector.on("collect", async (i) => {
        if (i.user.id === interaction.user.id) {
            currentPage = i.customId === "next" ? currentPage + 1 : currentPage - 1;
            currentPage = (currentPage + embeds.length) % embeds.length;
            row.components[0].setDisabled(currentPage === 0);
            row.components[1].setLabel(`Pull ${currentPage + 1} of ${embeds.length}`);
            row.components[2].setDisabled(currentPage === embeds.length - 1);
            await i.update({ embeds: [embeds[currentPage]], components: [row] });
        } else {
            await i.reply({ content: "Commander, this is not YOUR pull results... I expected better.", ephemeral: true });
        }
    });

    collector.on("end", () => {
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            row.components.map(component => ButtonBuilder.from(component).setDisabled(true))
        );
        message.edit({ components: [disabledRow], content: "Commander, our gacha session has concluded. Re-initiate when you're prepared." });
    });
}
