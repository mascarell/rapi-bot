const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");
const nikkeData = require("../utils/data/characters/nikke.json");
const soloLevelingData = require("../utils/data/characters/soloLeveling.json");

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
                .addChoices({ name: "GODDESS OF VICTORY: NIKKE", value: "nikke" }, { name: "Solo Leveling", value: "solo_leveling" })),

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

        const results = game === "nikke" ? pullCharacters(pullType, nikkeData) : pullCharacters(pullType, soloLevelingData);
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
    if (rand < rates.SSR) return rand < rates.Pilgrim ? "Pilgrim" : "SSR";
    if (rand < rates.SSR + rates.SR) return "SR";
    return "R";
}
function generateEmbeds(characters, game) {
    return characters.map(char => new EmbedBuilder()
        .setTitle(`${char.name} - Rarity: ${char.rarity}`)
        .setColor(getColorByRarity(char.rarity, game))
        .setImage(char.image)
        .setFooter({ text: getFooterTextByRarity(char.rarity, game) }));
}

function getColorByRarity(rarity, game) {
    const colors = {
        nikke: { Pilgrim: "#FFA500", SSR: "#FFD700", SR: "#800080", R: "#ADD8E6" },
        solo_leveling: { SSR: "#FF4500", SR: "#4682B4", R: "#778899" }
    };
    return colors[game][rarity] || "#FFFFFF";
}

function getFooterTextByRarity(rarity, game) {
    const messages = {
        nikke: {
            Pilgrim: "A legendary find, Commander! Are we dreaming?",
            SSR: "Wow! A SSR? That's incredibly lucky, Commander!",
            SR: "An SR! You're on the right track, Commander!",
            R: "It's just an R, but every squad member counts!"
        },
        solo_leveling: {
            SSR: "A legendary find, Commander! Are we dreaming?",
            SR: "An SR! You're on the right track, Commander!",
            R: "It's just an R, but every member counts!"
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
