// Dependencies
const { SlashCommandBuilder } = require("discord.js");
const moment = require("moment-timezone");

// Game data array
const gamesData = [
    {
        game: "GODDESS OF VICTORY: NIKKE",
        server: "Global",
        timezone: "Etc/GMT-9",
        dailyReset: "05:00",
        icon: "goddess-of-victory-nikke",
    },
    // Add more games as needed
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("daily")
        .setDescription("Get upcoming reset timer for a game")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("time")
                .setDescription(
                    "Checks the time until the next daily reset for the specified game."
                )
                .addStringOption((option) =>
                    option
                        .setName("game")
                        .setDescription("The name of the game")
                        .setRequired(false)
                )
        ),
    async execute(interaction) {
        let gameName = interaction.options.getString("game") || "Nikke";
        let gameData;

        // Special case for Nikke
        if (gameName.toLowerCase() === "nikke") {
            gameData = gamesData.find(
                (game) =>
                    game.game.toUpperCase() === "GODDESS OF VICTORY: NIKKE"
            );
        } else {
            // Partial matching for other games
            gameData = gamesData.find((game) =>
                game.game.toUpperCase().includes(gameName.toUpperCase())
            );
        }

        if (!gameData) {
            await interaction.reply({
                content: `Game not found. Please provide a valid game name.`,
                ephemeral: true,
            });
            return;
        }

        const now = moment().tz(gameData.timezone);
        let resetTime = moment.tz(
            `${moment().format("YYYY-MM-DD")} ${gameData.dailyReset}`,
            gameData.timezone
        );
        if (now > resetTime) resetTime.add(1, "days"); // Use next day's reset time if today's has passed

        // Convert reset time to Unix timestamp and format it for Discord
        const resetTimestamp = `<t:${resetTime.unix()}:R>`;

        await interaction.reply({
            content: `The next reset for **${gameData.game}** (${gameData.server} Server) is ${resetTimestamp}.`,
            ephemeral: true,
        });
    },
};
