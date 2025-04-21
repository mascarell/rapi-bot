import { SlashCommandBuilder, CommandInteraction } from 'discord.js';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rapiball')
        .setDescription('8ball, but its Rapi'),
    async execute(interaction: CommandInteraction) {
        const responses = [
            'Rapi says is certain.',
            'Rapi is decidedly so.',
            'Rapi says without a doubt.',
            'Rapi says yes - definitely.',
            'Rapi says you may rely on it.',
            'Rapi says as I see it, yes.',
            'Rapi says most likely.',
            'Rapi says outlook good.',
            'Rapi says yes.',
            'Rapi says signs point to yes.',
            'Rapi says reply hazy, try again.',
            'Rapi says ask again later.',
            'Rapi says better not tell you now.',
            'Rapi says cannot predict now.',
            'Rapi says concentrate and ask again.',
            'Rapi says don\'t count on it.',
            'Rapi says my reply is no.',
            'Rapi says my sources say no.',
            'Rapi says outlook not so good.',
            'Rapi says very doubtful.',
            'Rapi says seggs = more child support',
            'Rapi says no, you cannot have seggs with Anis',
            'Rapi says Commander, that\'s classified information...',
            'Rapi says *yawns* too sleepy to answer now',
            'Rapi says this question needs tactical analysis',
            'Rapi says let me check the Outpost records first',
            'Rapi says that\'s above my clearance level',
            'Rapi says focus on the mission instead',
            'Rapi says ask me after maintenance',
            'Rapi says the Ark archives say yes',
            'Rapi says that\'s a negative, Commander',
            'Rapi says Commander... that\'s kind of weird...',
            'Rapi says maybe ask Shifty instead?',
            'Rapi says *looks at you suspiciously*',
            'Rapi says Commander, are you procrastinating again?',
            'Rapi says did you finish your dailies first?',
            'Rapi says *too busy gaming to answer*',
            'Rapi says Commander, please be serious...',
            'Rapi says *sighs* not this again Commander',
            'Rapi says have you checked the latest mission briefing?',
            'Rapi says let me consult with the squad first',
            'Rapi says that\'s a tactical error, Commander',
            'Rapi says Commander, shouldn\'t you be on patrol?',
            'Rapi says *checks her comms device*... No',
            'Rapi says that\'s not in the operation manual',
            'Rapi says let me check with HQ'
        ];
        const responseIndex = Math.floor(Math.random() * responses.length);
        const response = responses[responseIndex];
        await interaction.reply({
            content: `<:literawooo:1056600445558210632> ${response}`,
            ephemeral: false,
        });
    },
};
