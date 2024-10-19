import { SlashCommandBuilder, CommandInteraction } from 'discord.js';
import fs from 'fs';

interface UserData {
    [userID: string]: {
        lastTime: number;
    };
}

let userData: UserData = {};

const loadUserData = () => {
    try {
        const data = fs.readFileSync('user_data.json', 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error loading user data:', err);
        return {};
    }
};

const saveUserData = (data: UserData) => {
    try {
        fs.writeFileSync('user_data.json', JSON.stringify(data, null, 4));
    } catch (err) {
        console.error('Error saving user data:', err);
    }
};

userData = loadUserData();

module.exports = {
    lastUsage: userData,
    data: new SlashCommandBuilder()
        .setName('lucky')
        .setDescription('Tells you your luck for today'),
    async execute(interaction: CommandInteraction) {
        const userID = interaction.user.id;
        const currentTime = Date.now();
        const oneDay = 86400000;

        if (this.lastUsage[userID]) {
            const lastTime = this.lastUsage[userID].lastTime;
            const diff = currentTime - lastTime;

            if (diff < oneDay) {
                const remainingTime = oneDay - diff;
                const remainingTimeInHours = Math.floor(remainingTime / (1000 * 60 * 60));
                const remainingMinutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
                return interaction.reply({
                    content: `Sorry, Commander. You can use this command again in ${remainingTimeInHours} hours and ${remainingMinutes} minutes.`,
                    ephemeral: false,
                });
            }
        }

        this.lastUsage[userID] = { lastTime: currentTime };
        saveUserData(this.lastUsage);

        const luck = Math.floor((Math.random() * 100) + 1);
        interaction.reply({ content: `Commander, your luck for today is: ${luck}%`, ephemeral: false });
    },
};
