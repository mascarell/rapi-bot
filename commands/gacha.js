const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");
const nikkeData = require("../utils/data/characters/nikke.json");
const soloLevelingData = require("../utils/data/characters/soloLeveling.json");
const wutheringWavesData = require("../utils/data/characters/wutheringWaves.json");

// Object to track command usage per user with timestamps
const userCommandUsage = {};

// Cleanup job to remove old entries
setInterval(() => {
    const expirationTime = 300000; // 5 minutes in milliseconds
    const currentTime = Date.now();
    Object.keys(userCommandUsage).forEach(userId => {
        userCommandUsage[userId] = userCommandUsage[userId].filter(time => currentTime - time < expirationTime);
        if (!userCommandUsage[userId].length) {
            delete userCommandUsage[userId];
        }
    });
}, 600000); // Runs every 10 minutes

module.exports = {
    data: new SlashCommandBuilder()
        .setName("gacha")
        .setDescription("Performs a gacha pull!")
        .addStringOption(option =>
            option.setName("type")
                .setDescription("Type of pull")
                .setRequired(true)
                .addChoices({ name: "single", value: "single" }, { name: "multi", value: "multi" }))
        .addStringOption(option =>
            option.setName("game")
                .setDescription("Select the game")
                .setRequired(true)
                .addChoices(
                    { name: "GODDESS OF VICTORY: NIKKE", value: "nikke" },
                    { name: "Solo Leveling", value: "solo_leveling" },
                    { name: "Wuthering Waves", value: "wuthering_waves"}
                )),

    async execute(interaction) {
        await interaction.deferReply();
        const game = interaction.options.getString("game");
        const pullType = interaction.options.getString("type");
        const userId = interaction.user.id;

        if (!userCommandUsage[userId]) userCommandUsage[userId] = [];
        userCommandUsage[userId].push(Date.now());

        // Warning for excessive usage
        if (userCommandUsage[userId].filter(time => Date.now() - time < 300000).length >= 20) {
            await interaction.followUp("Commander, let's take it easy with the gacha, shall we? Too much excitement isn't good!");
            return;
        }

        let data;
        switch(game) {
            case "nikke":
                data = nikkeData;
                break;
            case "solo_leveling":
                data = soloLevelingData;
                break;
            case "wuthering_waves":
                data = wutheringWavesData;
                break;
            default:
                await interaction.reply("Selected game is not supported!");
                return;
        }

        const results = pullCharacters(pullType, data);
        const embeds = generateEmbeds(results, game);

        if (pullType === "multi") {
            await handlePagination(interaction, embeds);
        } else {
            await interaction.followUp({ embeds: [embeds[0]] });
        }
    },
};

function pullCharacters(pullType, data) {
    const pulls = pullType === "multi" ? 10 : 1;
    const results = [];

    for (let i = 0; i < pulls; i++) {
        const rand = Math.random();
        let rarity = determineRarity(rand, data.rates);
        let characterPool = data[rarity];
        let character = characterPool[Math.floor(Math.random() * characterPool.length)];
        results.push({ ...character, rarity });
    }
    return results;
}

function determineRarity(rand, rates) {
    const sortedRates = Object.entries(rates).sort((a, b) => a[1] - b[1]);
    let cumulativeRate = 0;
    for (let [rarity, rate] of sortedRates) {
        cumulativeRate += rate;
        if (rand < cumulativeRate) {
            return rarity;
        }
    }
    return "Unknown";
}

function generateEmbeds(characters, game) {
    return characters.map(char => new EmbedBuilder()
        .setTitle(`${char.name} - Rarity: ${char.rarity}`)
        .setColor(getColorByRarity(char.rarity, game, char.type))
        .setImage(char.image)
        .setFooter({ text: getFooterTextByRarity(char.rarity, game) }));
}

function getColorByRarity(rarity, game, itemType) {
    const baseColors = {
        nikke: { "Pilgrim": "#FFA500", "SSR": "#FFD700", "SR": "#800080", "R": "#ADD8E6" },
        solo_leveling: { "SSD": "#FF4500", "4-Star": "#4682B4", "3-Star": "#778899" },
        wuthering_waves: { 
            "5-Star": "#FFD700", 
            "4-Star": { "character": "#800080", "weapon": "#34eb6b" }, // Different colors for character and weapon
            "3-Star": "#34a8eb" 
        }
    };
    const colors = baseColors[game];
    return colors[rarity][itemType] || colors[rarity] || "#FFFFFF";
}

function getFooterTextByRarity(rarity, game) {
    const messages = {
        nikke: {
            "Pilgrim": "A legendary find, Commander! Are we dreaming?",
            "SSR": "Wow! A SSR? That's incredibly lucky, Commander!",
            "SR": "An SR! You're on the right track, Commander!",
            "R": "It's just an R, but every squad member counts!"
        },
        solo_leveling: {
            "SSR": "A legendary find, Commander! Are we dreaming?",
            "SR": "An SR! You're on the right track, Commander!",
            "R": "It's just an R, but every member counts!"
        },
        wuthering_waves: {
            "5-Star": "Commander, you've struck gold with a 5-Star!",
            "4-Star": "Solid find, Commander! A 4-Star!",
            "3-Star": "It's a common 3-Star, but it's a start!"
        }
    };
    return messages[game][rarity] || "Keep pulling, Commander! Victory awaits!";
}

async function handlePagination(interaction, embeds) {
    let currentPage = 0;
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("previous").setLabel("Previous").setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId("page").setLabel(`Pull 1 of ${embeds.length}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId("next").setLabel("Next").setStyle(ButtonStyle.Primary).setDisabled(embeds.length <= 1)
    );

    const message = await interaction.followUp({ embeds: [embeds[currentPage]], components: [row] });
    const collector = message.createMessageComponentCollector({ time: 900000 }); // Gacha Session Ends In 15 Minutes

    collector.on("collect", async (i) => {
        if (i.user.id === interaction.user.id) {
            i.customId === "next" ? currentPage++ : currentPage--;
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
        const disabledRow = ActionRowBuilder.from(row).setComponents(
            row.components.map(component => ButtonBuilder.from(component).setDisabled(true))
        );
        message.edit({ components: [disabledRow], content: "Commander, our gacha session has concluded. Re-initiate when you're prepared." });
    });
}
