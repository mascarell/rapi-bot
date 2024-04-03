// Dependencies
const { SlashCommandBuilder } = require("discord.js");
const moment = require("moment-timezone");

const gamesData = [
    {
        game: "GODDESS OF VICTORY: NIKKE",
        server: "Global",
        timezone: "Etc/GMT-9",
        dailyReset: "05:00",
        icon: "goddess-of-victory-nikke",
    },
    // TODO: Add more games as needed. REF: https://raw.githubusercontent.com/cicerakes/Game-Time-Master/master/game-data.js
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
                        .setAutocomplete(true)
                )
        ),
    async execute(interaction) {
        const gameName =
            interaction.options.getString("game", false)?.toLowerCase() ||
            "nikke";
        const gameData = gamesData.find((game) =>
            game.game.toLowerCase().includes(gameName)
        );

        if (!gameData) {
            await interaction.reply({
                content: `Game not found. Please provide a valid game name.`,
                ephemeral: true,
            });
            return;
        }

        const now = moment.tz(gameData.timezone);
        let resetTime = moment.tz(
            `${moment().format("YYYY-MM-DD")} ${gameData.dailyReset}`,
            gameData.timezone
        );
        if (now > resetTime) {
            resetTime.add(1, "days");
        }

        const resetTimestamp = `<t:${resetTime.unix()}:R>`;

        await interaction.reply({
            content: `The next reset for **${gameData.game}** (${gameData.server} Server) is ${resetTimestamp}.`,
            ephemeral: true,
        });
    },
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const filtered = gamesData
            .filter((game) => game.game.toLowerCase().includes(focusedValue))
            .map((game) => ({ name: game.game, value: game.game }));

        await interaction.respond(filtered.slice(0, 25)); // Limit to 25 results as per Discord's limit
    },
};
