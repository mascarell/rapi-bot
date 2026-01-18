// Dependencies
import { SlashCommandBuilder, ChatInputCommandInteraction, AutocompleteInteraction ,
    MessageFlags
} from 'discord.js';
import moment from 'moment-timezone';
import gamesData from '../utils/data/gamesData';

export default {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Get upcoming reset timer for a game')
        .addSubcommand((subcommand) =>
            subcommand
                .setName('time')
                .setDescription('Checks the time until the next daily reset for the specified game.')
                .addStringOption((option) =>
                    option
                        .setName('game')
                        .setDescription('The name of the game')
                        .setRequired(false)
                        .setAutocomplete(true)
                )
        ),
    async execute(interaction: ChatInputCommandInteraction) {
        const gameName = (interaction.options.get('game')?.value as string || 'nikke').toLowerCase();
        const gameData = gamesData.find((game) => game.game.toLowerCase().includes(gameName));

        if (!gameData) {
            await interaction.reply({
                content: `Commander, I am unable to locate your game in your room. Maybe Anis was in your room again...`,
                
            });
            return;
        }

        // Calculate the next reset time
        const { timezone, dailyReset, game, server } = gameData;
        let resetTime = moment.tz(dailyReset, 'HH:mm', timezone);
        if (moment.tz(timezone).isAfter(resetTime)) {
            resetTime.add(1, 'day');
        }

        // Determine the formatting based on the time difference
        const timeDifference = resetTime.diff(moment.tz(timezone), 'hours', true);
        const resetTimestamp = timeDifference <= 4 ? `<t:${resetTime.unix()}:R>` : `<t:${resetTime.unix()}:F>`;

        await interaction.reply({
            content: `Commander, the next reset for **${game}** (${server} Server) is ${resetTimestamp}.`,
            
        });
    },
    async autocomplete(interaction: AutocompleteInteraction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const filtered = gamesData
            .filter((game) => game.game.toLowerCase().includes(focusedValue))
            .map((game) => ({ name: game.game, value: game.game }));

        await interaction.respond(filtered.slice(0, 25)); // Discord limits to 25 results
    },
};
