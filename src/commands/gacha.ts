import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    CommandInteraction,
} from 'discord.js';
import nikkeData from '../utils/data/characters/nikke.json';

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

        if (!userCommandUsage[userId]) userCommandUsage[userId] = [];
        userCommandUsage[userId].push(Date.now());

        if (userCommandUsage[userId].filter(time => Date.now() - time < 300000).length >= 20) {
            await interaction.followUp("Commander, let's take it easy with the gacha, shall we? Too much excitement isn't good!");
            return;
        }

        let data;
        switch (game) {
            case 'nikke':
                data = nikkeData;
                break;
            default:
                await interaction.reply('Selected game is not supported!');
                return;
        }

        const results = pullCharacters(pullType, data);
        const embeds = generateEmbeds(results, game);

        if (pullType === 'multi') {
            await handlePagination(interaction, embeds);
        } else {
            await interaction.followUp({ embeds: [embeds[0]] });
        }
    },
};

function pullCharacters(pullType: string, data: any) {
    const pulls = pullType === 'multi' ? 10 : 1;
    const results: any[] = [];

    for (let i = 0; i < pulls; i++) {
        const rand = Math.random();
        const rarity = determineRarity(rand, data.rates);
        const characterPool = data[rarity];
        const character = characterPool[Math.floor(Math.random() * characterPool.length)];
        results.push({ ...character, rarity });
    }
    return results;
}

function determineRarity(rand: number, rates: Record<string, number>) {
    const sortedRates = Object.entries(rates).sort((a, b) => a[1] - b[1]);
    let cumulativeRate = 0;
    for (const [rarity, rate] of sortedRates) {
        cumulativeRate += rate;
        if (rand < cumulativeRate) {
            return rarity;
        }
    }
    return 'Unknown';
}

function generateEmbeds(characters: any[], game: string) {
    return characters.map(char => new EmbedBuilder()
        .setTitle(`${char.name} - Rarity: ${char.rarity}`)
        .setColor(getColorByRarity(char.rarity, game, char.type))
        .setImage(char.image)
        .setFooter({ text: getFooterTextByRarity(char.rarity, game) }));
}

function getColorByRarity(rarity: string, game: string, itemType?: string) {
    const baseColors: Record<string, any> = {
        nikke: { "Pilgrim": "#FFA500", "SSR": "#FFD700", "SR": "#800080", "R": "#ADD8E6" }
    };
    const colors = baseColors[game];
    return (itemType ? colors[rarity][itemType] : colors[rarity]) || "#FFFFFF";
}

function getFooterTextByRarity(rarity: string, game: string) {
    const messages: Record<string, Record<string, string>> = {
        nikke: {
            "Pilgrim": "A legendary find, Commander! Are we dreaming?",
            "SSR": "Wow! A SSR? That's incredibly lucky, Commander!",
            "SR": "An SR! You're on the right track, Commander!",
            "R": "It's just an R, but every squad member counts!"
        }
    };
    return messages[game][rarity] || "Keep pulling, Commander! Victory awaits!";
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
