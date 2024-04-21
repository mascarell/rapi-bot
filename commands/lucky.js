// Dependencies
const { SlashCommandBuilder } = require("discord.js");
const fs = require('fs');

let userData = {}; //loading user info from data file
try {
    const data = fs.readFileSync('user_data.json', 'utf8');
    userData = JSON.parse(data);
} catch (err) {
    console.error('Error loading user data:', err);
}

module.exports = {
    lastUsage: userData, //stores the user info
    data: new SlashCommandBuilder()
        .setName('lucky')
        .setDescription('Tells you your luck for today'),
    async execute(interaction) {
        userID = interaction.user.id; //gets user id 

        if (this.lastUsage[userID]) { //checks to make sure if the user hasn't used the command recently
            lastTime = this.lastUsage[userID].lastTime;
            currentTime = Date.now();


            diff = currentTime - lastTime; //calculates in miliseconds because of discord not having actual hours (24 hours is approx 86400000 miliseconds)
            oneDay = 86400000;

            if (diff < oneDay) {
                remainingTime = oneDay - diff;
                remainingTimeInHours = Math.floor(remainingTime / (1000 * 60 * 60));
                remainingMinutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
                return interaction.reply({
                    content: `Sorry, Commander. You can use this command again in ${remainingTimeInHours} hours and ${remainingMinutes} minutes.`,
                    ephemeral: false
                });
            }
        }
        this.lastUsage[userID] = { //this updates the last usage from the user 
            lastTime: Date.now()
        };

        try { //saves user data to the json file
            fs.writeFileSync('user_data.json', JSON.stringify(this.lastUsage, null, 4));
        } catch (err) {
            console.error('Error saving user data:', err);
        }

        const x = Math.floor((Math.random() * 100) + 1); // generates the "luck" random percentage for the user
        interaction.reply({ content: `Commander, your luck for today is: ${x}%`, ephemeral: false })
    }
};



