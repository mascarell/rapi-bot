const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const charactersData = JSON.parse(
    fs.readFileSync(
        path.join(__dirname, "..", "utils", "characters.json"),
        "utf-8"
    )
);

// Object to track command usage per user with timestamps
const userCommandUsage = {};

// Cleanup job to remove old entries every 10 minutes
setInterval(() => {
    const currentTime = Date.now();
    Object.keys(userCommandUsage).forEach((userId) => {
        userCommandUsage[userId] = userCommandUsage[userId].filter(
            (time) => currentTime - time < 300000
        ); // 300,000 ms = 5 minutes
        // If no entries remain for a user, delete the key entirely
        if (userCommandUsage[userId].length === 0) {
            delete userCommandUsage[userId];
        }
    });
    console.log("Cleanup job ran, userCommandUsage pruned");
}, 600000); // 600,000 ms = 10 minutes

module.exports = {
    data: new SlashCommandBuilder()
        .setName("gacha")
        .setDescription("Performs a gacha pull for NIKKE!")
        .addStringOption((option) =>
            option
                .setName("type")
                .setDescription("Type of pull")
                .setRequired(true)
                .addChoices(
                    { name: "single", value: "single" },
                    // This should work as intended. If not just comment out below to avoid multi pulls
                    { name: "multi", value: "multi" }
                )
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false }); // Defer the reply initially

        const userId = interaction.user.id;

        // Check if the user is the bot itself
        if (userId === interaction.client.user.id) {
            return; // Do nothing if the user is the bot itself
        }

        const currentTime = Date.now();
        if (!userCommandUsage[userId]) {
            userCommandUsage[userId] = [];
        }
        userCommandUsage[userId].push(currentTime);
        userCommandUsage[userId] = userCommandUsage[userId].filter(
            (time) => currentTime - time < 300000
        );

        // Gamba warning if 20+ uses within 5 minutes (more than 10 pulls a minute lol).
        if (userCommandUsage[userId].length >= 20) {
            await interaction.followUp({
                content:
                    "Commander, let's take it easy with the gacha, shall we? Too much excitement in such a short time isn't good for anyone!",
                ephemeral: false,
            });
            return; // Exit the function to prevent further execution
        }

        const pullType = interaction.options.getString("type");
        const results = pullCharacters(pullType);
        const embeds = generateEmbeds(results);

        if (pullType === "multi") {
            let currentPage = 0;
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("previous")
                    .setLabel("Previous")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId("page")
                    .setLabel(`Page ${currentPage + 1} of ${embeds.length}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId("next")
                    .setLabel("Next")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(embeds.length <= 1)
            );

            const message = await interaction.followUp({
                embeds: [embeds[currentPage]],
                components: [row],
            });

            const collector = message.createMessageComponentCollector({
                time: 120000,
            });

            collector.on("collect", async (i) => {
                if (i.user.id === interaction.user.id) {
                    i.customId === "next" ? currentPage++ : currentPage--;
                    currentPage =
                        ((currentPage % embeds.length) + embeds.length) %
                        embeds.length; // Cycle pages
                    row.components[0].setDisabled(currentPage === 0);
                    row.components[1].setLabel(
                        `Page ${currentPage + 1} of ${embeds.length}`
                    );
                    row.components[2].setDisabled(
                        currentPage === embeds.length - 1
                    );
                    await i.update({
                        embeds: [embeds[currentPage]],
                        components: [row],
                    });
                } else {
                    await i.reply({
                        content: "Commander, this is not YOUR pull results... I expected better.",
                        ephemeral: true,
                    });
                }
            });

            collector.on("end", () => {
                const disabledRow = new ActionRowBuilder().addComponents(
                    row.components.map((component) =>
                        ButtonBuilder.from(component).setDisabled(true)
                    )
                );
                message.edit({
                    components: [disabledRow],
                    content:
                        "Current interaction ended. Use '/gacha' again to pull more!",
                });
            });
        } else {
            await interaction.followUp({ embeds: [embeds[0]] });
        }
    },
};

function pullCharacters(pullType) {
    const SSR_RATE = 0.04; // 4% chance for SSR
    const PILGRIM_RATE = 0.0005; // 0.05% chance under SSR for Pilgrim
    const SR_RATE = 0.43; // 43% chance for SR
    const R_RATE = 0.53; // 53% chance for R
    const results = [];
    const pulls = pullType === "multi" ? 10 : 1;

    for (let i = 0; i < pulls; i++) {
        const rand = Math.random();
        let rarity, characterPool;

        if (rand < SSR_RATE) {
            if (rand < PILGRIM_RATE) {
                rarity = "Pilgrim";
                characterPool = charactersData.Pilgrim;
            } else {
                rarity = "SSR";
                characterPool = charactersData.SSR;
            }
        } else if (rand < SSR_RATE + SR_RATE) {
            rarity = "SR";
            characterPool = charactersData.SR;
        } else {
            rarity = "R";
            characterPool = charactersData.R;
        }

        const character =
            characterPool[Math.floor(Math.random() * characterPool.length)];
        results.push({ ...character, rarity });
    }

    return results;
}

function generateEmbeds(characters) {
    return characters.map((char) => {
        return new EmbedBuilder()
            .setTitle(`${char.name} - Rarity: ${char.rarity}`)
            .setColor(getColorByRarity(char.rarity))
            .setImage(char.image)
            .setFooter({ text: getFooterTextByRarity(char.rarity) });
    });
}

function getColorByRarity(rarity) {
    switch (rarity) {
        case "Pilgrim":
            return "#FFA500"; // Light orange
        case "SSR":
            return "#FFD700"; // Gold
        case "SR":
            return "#800080"; // Purple
        case "R":
            return "#ADD8E6"; // Light blue
        default:
            return "#FFFFFF"; // White as default
    }
}

function getFooterTextByRarity(rarity) {
    switch (rarity) {
        case "Pilgrim":
            return "A legendary find, Commander! Are we dreaming?";
        case "SSR":
            return "Wow! A SSR? That's incredibly lucky, Commander!";
        case "SR":
            return "An SR! You're on the right track, Commander!";
        case "R":
            return "It's just an R, but every squad member counts!";
        default:
            return "Keep pulling, Commander! Victory awaits!";
    }
}
