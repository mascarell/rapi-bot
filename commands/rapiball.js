// Dependencies
const { SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rapiball')
        .setDescription('8ball, but its rapi'),
    async execute(interaction) {
        const responses = [
            "Rapi says is certain.",
            "Rapi is decidedly so.",
            "Rapi says without a doubt.",
            "Rapi says yes - definitely.",
            "Rapi says you may rely on it.",
            "Rapi says as I see it, yes.",
            "Rapi says most likely.",
            "Rapi says outlook good.",
            "Rapi says yes.",
            "Rapi says signs point to yes.",
            "Rapi says reply hazy, try again.",
            "Rapi says ask again later.",
            "Rapi says better not tell you now.",
            "Rapi says cannot predict now.",
            "Rapi says concentrate and ask again.",
            "Rapi says don't count on it.",
            "Rapi says my reply is no.",
            "Rapi says my sources say no.",
            "Rapi says outlook not so good.",
            "Rapi says very doubtful.",
            "Rapi says seggs = more child support",
            "Rapi says no, you cannot have seggs with anis"
        ];
        const responseIndex = Math.floor(Math.random() * responses.length);
        const response = responses[responseIndex];
        await interaction.reply({
          content: `<:literawooo:1056600445558210632> ${response}`, //need to implement emotes properly
            ephemeral: false
        });
    }
};


