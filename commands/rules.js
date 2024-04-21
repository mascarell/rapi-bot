// Dependencies
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription(`Rapi Rules (she'll ban you if you don't behave)`),
  async execute(msg) {
    msg.reply({
      content: `<:literawooo:1056600445558210632> SERVER RULES <:literawooo:1056600445558210632> \n 

➜ Try to follow the rules or you'll get banned by Rapi
➜ This is a place to chill and enjoy a community of people who share a love for the games we cover, if you can't keep conversations civil, you'll get banned
➜ Don't be a dick in general, just be chill and nice to other people
➜ Don't be racist, this includes memes with racial slurs
➜ Spicy art is fine, NSFW is not allowed (I'm sorry fellow degenerates)
➜ If you want to argue with someone, go to DMs, this server / our streams are not the place
➜ If you are a content creator DM any of the mods so you can share your content on the videos channel
`,
      ephemeral: false
    })
  }
}