// Dependencies
const { SlashCommandBuilder } = require("discord.js");
const moment = require("moment-timezone");

const gamesData = [
    {
        game: "AFK JOURNEY",
        server: "Global",
        timezone: "Europe/Madrid",
        dailyReset: "02:00",
    },
    {
        game: "GODDESS OF VICTORY: NIKKE",
        server: "Global",
        timezone: "Etc/GMT-9",
        dailyReset: "05:00",
    },
    {
        game: "SOLO LEVELING",
        server: "Global",
        timezone: "Europe/Madrid",
        dailyReset: "02:00",
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
                content: `Commander, I am unable to locate your game in your room. Maybe Anis was in your room again...`,
                ephemeral: true,
            });
            return;
        }

        // Calculate the next reset time
        const timezone = gameData.timezone;
        const dailyReset = gameData.dailyReset;
        let resetTime = moment.tz(dailyReset, "HH:mm", timezone);
        if (moment.tz(timezone).isAfter(resetTime)) {
            resetTime.add(1, "day");
        }

        // Determine the formatting based on the time difference
        const timeDifference = resetTime.diff(
            moment.tz(timezone),
            "hours",
            true
        );
        let resetTimestamp;
        if (timeDifference <= 4) {
            // Use relative format if within 4 hours
            resetTimestamp = `<t:${resetTime.unix()}:R>`;
        } else {
            // Use Long Date/Time format otherwise
            resetTimestamp = `<t:${resetTime.unix()}:F>`;
        }

        await interaction.reply({
            content: `Commander, the next reset for **${gameData.game}** (${gameData.server} Server) is ${resetTimestamp}.`,
            ephemeral: true,
        });
    },
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const filtered = gamesData
            .filter((game) => game.game.toLowerCase().includes(focusedValue))
            .map((game) => ({ name: game.game, value: game.game }));

        await interaction.respond(filtered.slice(0, 25)); // Discord limits to 25 results
    },
};
