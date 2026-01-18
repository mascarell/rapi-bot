import { SlashCommandBuilder, ChatInputCommandInteraction ,
    MessageFlags
} from 'discord.js';
import { enforceChannelRestriction } from '../utils/channelRestrictions';

const rapiBallResponses = [
    // 8-ball style affirmative responses
    `Affirmative, Commander. The probability of success is acceptable.`,
    `Yes. Although Anis will probably find a way to mess it up.`,
    `Certainly. Just don't let it go to your head.`,
    `The data suggests... yes. Proceed with caution.`,
    `Without a doubt. Even Neon could figure that one out.`,
    `That's a definite yes.`,
    `About as certain as my next headshot. Very.`,
    `Tactical assessment complete. Proceed with confidence.`,
    `All systems indicate success. Move forward, Commander.`,
    
    // 8-ball style negative responses
    `Negative, Commander. That's about as likely as Syuen apologizing.`,
    `No. And before you ask again, still no.`,
    `My calculations show a 0.01% chance. So... no.`,
    `Absolutely not. Did you hit your head during the last mission?`,
    `The answer is no. Please return to your paperwork.`,
    `Dorothy's already hacked the future. She says no.`,
    `Even the Legendary Commander couldn't pull that off.`,
    `The whole Goddess Squad together couldn't make that happen.`,
    `You'd have better luck arm-wrestling a Tyrant.`,
    `That's a hard no, Commander. Accept it and move on.`,
    `Not happening. File that under 'impossible missions'.`,
    
    // 8-ball style uncertain responses
    `Unclear. Try again when you're making more sense.`,
    `Cannot compute. Your question lacks basic logic.`,
    `Ask again later. I'm dealing with Anis's latest disaster.`,
    `Insufficient data. Unlike your confidence levels.`,
    `Reply hazy. Much like your strategic planning.`,
    `Data analysis inconclusive. Reassess your parameters.`,
    `The answer eludes even my enhanced capabilities.`,
    
    // 8-ball style maybe responses
    `Perhaps. But don't get your hopes up, Commander.`,
    `It's possible. About as possible as you completing paperwork on time.`,
    `Maybe. The odds are better than your aim, at least.`,
    `Potentially. Though I've seen you defy worse odds.`,
    `50-50 chance. Like flipping a coin, but less reliable.`,
    `The probability exists, however minimal.`,
    `Not impossible, just highly improbable.`,
    `I've seen stranger things happen on the Ark.`,
    `Combat data suggests... it could go either way.`,
    
    // Sarcastic/Rapi personality responses
    `Commander, that's classified as 'terrible idea #47' in my database.`,
    `...All humans have questionable ideas. Yours are just more questionable.`,
    `Signs point to you needing more coffee, Commander.`,
    `My systems indicate... you already know the answer.`,
    `Error 404: Common sense not found in your query.`,
    `Processing... Processing... Still a bad idea.`,
    `The Raptures have a better chance of surrendering.`,
    `I'd rather face a Tyrant class alone.`,
    `Commander, even Product 23 would say no to that.`,
    `My tactical assessment: Absolutely not recommended.`,
    `The Ark Central Government is more likely to be transparent.`,
    `That's less likely than finding Marian's missing memories.`,
    `I've run 1,000 simulations. None ended well.`,
    `My analysis suggests you need a reality check, Commander.`,
    `That would require defying several laws of physics.`,
    `Even Shifty wouldn't bet on those odds.`,
    `I'm detecting high levels of delusion in your question.`,
    `Have you considered consulting a medical professional?`,
    `That's about as tactical as Anis's spending habits.`,
    `The probability matrix just laughed at your question.`,
    `My enhanced processing power is wasted on this question.`,
    `I've faced Heretics with better ideas than that.`,
    `That plan has more holes than the Ark's security.`,
    `Commander, your optimism is both admirable and concerning.`,
    `I'd need to downgrade my intelligence to agree with that.`,
    `Even in my most reckless state, I wouldn't attempt that.`,
    `The answer is etched into the very fabric of 'no'.`,
    `My combat instincts are screaming 'abort mission'.`,
    `That's what we in the business call 'suicide with extra steps'.`,
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rapiball')
        .setDescription('Ask Rapi a question and receive her tactical assessment')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('Your question for Rapi')
                .setRequired(true)),
    async execute(interaction: ChatInputCommandInteraction) {
        // Check channel restriction
        const isRestricted = await enforceChannelRestriction(interaction, 'rapi-bot');
        if (isRestricted) return;

        // Get the user's question
        const question = interaction.options.get('question')?.value as string;
        
        // Get a random response
        const response = rapiBallResponses[Math.floor(Math.random() * rapiBallResponses.length)];
        
        // Build the response
        const responseContent = `**Question:** ${question}\n\n **${response}**`;
        
        await interaction.reply({
            content: responseContent,
            
        });
    },
};
