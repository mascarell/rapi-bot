// Define message types for better organization
export interface RapiMessage {
    text: string;
    imageConfig?: {
        cdnPath: string;
        trackLast?: number;
        extensions?: string[];
    };
}

// Helper function to create messages with image configs
export function createRapiMessage(text: string, imageConfig?: RapiMessage['imageConfig']): RapiMessage {
    return { text, imageConfig };
}

// Helper function to create image configs
export function createImageConfig(cdnPath: string, trackLast: number = 5, extensions: string[] = ['.gif', '.png', '.jpg', '.webp']) {
    return { cdnPath, trackLast, extensions };
}

export const rapiMessages: RapiMessage[] = [
    createRapiMessage(`You're too quiet, Commander, is everything alright?`),
    createRapiMessage(`Commander, Anis was just joking with the Christmas present…`),
    createRapiMessage(`Commander! When is the next mission?`),
    createRapiMessage(`Please take care next time you go to the surface Commander.`),
    createRapiMessage(`Don't push yourself too hard Commander!`),
    createRapiMessage(`No matter what you think of us, we'll always be by your side.`),
    createRapiMessage(`Commander, I'll protect you.`),
    createRapiMessage(`Lap of discipline`),
    createRapiMessage(`Is it time to break Syuen ribs again, Commander?`),
    createRapiMessage(`I found a wet sock with a weird smell under your bed Commander, care to explain?`),
    createRapiMessage(`Marian please stop wearing your underwear inside out...`),
    createRapiMessage(`Commander, why do you bark every time you see Makima?`),
    createRapiMessage(`Scarlet or Modernia? What kind of question is that Commander? The answer is obvious...`),
    createRapiMessage(`I can't go out with you today Commander, there's a lot of paperwork to do.`),
    createRapiMessage(`Commander... did you really marry Sakura?`),
    createRapiMessage(`Those cookies were the snacks of Biscuit. Did you really ate them Commander?`),
    createRapiMessage(`Commander, why do you have a picture of Andersen on your wallet?`),
    createRapiMessage(`Commander, did you spend the night at Coin Rush again?`),
    createRapiMessage(`Commander, people are saying you kissed Blanc and Noir... is that true?`),
    createRapiMessage(`Neon said she saw you leaving room 805 at the hotel, what was that about Commander, did you have a meeting?`),
    createRapiMessage(`I guess Rosanna was right about idiots living longer.`),
    createRapiMessage(
        `Commander! Anis said that this swimsuit is better than my normal outfit for fighting Raptures, what do you think?`,
        createImageConfig("commands/swimsuit/", 5)
    ),
    createRapiMessage(`Waterpower? I don't know what that is Commander, but it sounds kinda weak.`),
    createRapiMessage(`Commander! Is it Volt or Bolt?`),
    createRapiMessage(`Commander, Admi was asking about Ruru, do you know where she is?`),
    createRapiMessage(`The Golden Ship? Commander you are already old enough to believe in that stuff, please get back to work.`),
    createRapiMessage(`Mast? Who's that? Doesn't ring a bell.`),
    createRapiMessage(`Commander, did you really tackle Crow? How did you do it?`),
    createRapiMessage(`Age is just a number? Commander, I'm calling ACPU`),
    createRapiMessage(`What do you mean my voice sounds similar to someone else? Who are you thinking about Commander? sigh...`),
    createRapiMessage(`Commander, what did you want to ask about Biscuit?`),
    createRapiMessage(`Commander, 61% is more than enough, stop complaining.`),
    createRapiMessage(
        `Commander, it's so hot today... maybe I should wear something more... comfortable? *winks* What do you think, Commander?`,
        createImageConfig("commands/swimsuit/", 5)
    ),
    createRapiMessage(
        `Commander, Neon keeps saying this swimsuit makes me look... distracting. What do you think? *smirks*`,
        createImageConfig("commands/swimsuit/", 5)
    ),
];

export const readNikkeMessages = [
    "skipping the story again? You miss all the good parts...",
    "maybe try reading the dialogue. It's not just about the battles!",
    "you'd enjoy the game more if you actually read the story...",
    "always skipping content??? You're missing all the plot twists!",
    "read the story! There's more than just shooting!",
    "what's the rush? Enjoy the dialogue for once...",
    "you skip more content than you should. Try reading!!!",
    "the story is half the fun. Stop skipping it like El Shafto!!!",
    "always rushing? The dialogue has great moments, you know...",
    "ever thought about reading? You're missing out on the lore!"
];

/**
 * Generates a random social credit deduction amount
 * @returns A number between -10000 and -999999
 */
function getRandomSocialCredit(): number {
    return -Math.floor(Math.random() * (999999 - 10000 + 1) + 10000);
}

/**
 * Generates the CCP message with random social credit deductions
 * @returns Formatted CCP message
 */
function generateCCPMessage(): string {
    const socialCredit = getRandomSocialCredit();
    const formattedCredit = Math.abs(socialCredit).toLocaleString(); // Formats number with commas

    return `ATTENTION CITIZEN! 市民请注意!

This is the Central Intelligentsia of the Chinese Communist Party. 您的 Internet 浏览器历史记录和活动引起了我们的注意。 YOUR INTERNET ACTIVITY HAS ATTRACTED OUR ATTENTION. 因此，您的个人资料中的 ${formattedCredit} ( ${socialCredit} Social Credits) 个社会积分将打折。 DO NOT DO THIS AGAIN! 不要再这样做! If you do not hesitate, more Social Credits ( ${socialCredit} Social Credits ) will be subtracted from your profile, resulting in the subtraction of ration supplies. (由人民供应部重新分配 CCP) You'll also be sent into a re-education camp in the Xinjiang Uyghur Autonomous Zone. 如果您毫不犹豫，更多的社会信用将从您的个人资料中打折，从而导致口粮供应减少。 您还将被送到新疆维吾尔自治区的再教育营。

为党争光! Glory to the CCP!`;
}

// Export a function that generates a fresh message each time instead of a static string
export const getCCPMessage = () => generateCCPMessage();
