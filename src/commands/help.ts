import { SlashCommandBuilder, CommandInteraction } from 'discord.js';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('List of custom commands available for all Commanders'),
    async execute(interaction: CommandInteraction) {
        await interaction.reply({
            content: `====================\n**SLASH COMMANDS**\n====================\n
➜ **/gacha <type> <game>** : Gamba with rapi bot, you can do singles or multis, works with NIKKE
➜ **/lucky** : How lucky are you today?
➜ **/rapiball** : Get an eight ball of Rapi's wisdom
➜ **/compositions** : Get help for NIKKE Team Compositions
➜ **/daily time <game>** : Gets the daily reset for the specified game
➜ **/rules** : Get the rules for the server
➜ **/relics** : Get lost relics guide in NIKKE
➜ **stream** : Reserved for El Shafto


====================
**CHAT COMMANDS**
====================


➜ **damn train** : Fuck Thomas The Train
➜ **damn gravedigger** : Time for OSU!
➜ **good girl** : say thanks to the best girl & bot in this server 
➜ **wrong girl** : hey, take care who you talk to  
➜ **bad girl** : we all wanted to slap her  
➜ **reward?** : 10 gems!?  
➜ **sounds like...** : you are just bad, commander  
➜ **whale levels** : how much do you spend?  
➜ **i swear she is actually 3000 years old** : what?  
➜ **ready rapi?** : 100% ready  
➜ **12+ game** : kid safe game  
➜ **booba?** : robot girl personalities  
➜ **booty?** : robot girl cakes  
➜ **kinda weird...** : tf commander...  
➜ **JUSTICE FOR...** : she doesn't belong in jail  
➜ **dammit Rapi** : 😭  
➜ **mold rates are not that bad** : 61% is enough  
➜ **seggs?** : shifty?  
➜ **Lap of discipline.** : Lap of discipline. 
➜ **ccp leadership** : View the Commander's Leadership
➜ **absolute...** : It's a movie.
➜ **ccp #1** : Inspired the Community.
➜ **we had a plan!** : Just follow the plan Commander!
➜ **is it over?** : Yes it is, Commander.
➜ **99%** : Here's some advice for you.
➜ **belorta...** : CURSE OF BELORTA.
➜ **get dat nikke** : Send Rapi to fight your rival.

`,
            ephemeral: true
        });
    }
};
