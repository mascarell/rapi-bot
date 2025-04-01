export const rapiMessages = [
    `You're too quiet, Commander, is everything alright?`,
    `Commander, Anis was just joking with the Christmas present…`,
    `Commander! When is the next mission?`,
    `Please take care next time you go to the surface Commander.`,
    `Don't push yourself too hard Commander!`,
    `No matter what you think of us, we'll always be by your side.`,
    `Commander, I'll protect you.`,
    `Lap of discipline`,
    `Is it time to break Syuen ribs again, Commander?`,
    `I found a wet sock with a weird smell under your bed Commander, care to explain?`,
    `Marian please stop wearing your underwear inside out...`,
    `Commander, why do you bark every time you see Makima?`,
    `Scarlet or Modernia? What kind of question is that Commander? The answer is obvious...`,
    `I can't go out with you today Commander, there's a lot of paperwork to do.`,
    `Commander... did you really marry Sakura?`,
    `Those cookies were the snacks of Biscuit. Did you really ate them Commander?`,
    `Commander, why do you have a picture of Andersen on your wallet?`,
    `Commander, did you spend the night at Coin Rush again?`,
    `Commander, people are saying you kissed Blanc and Noir... is that true?`,
    `Neon said she saw you leaving room 805 at the hotel, what was that about Commander, did you have a meeting?`,
    `I guess Rosanna was right about idiots living longer.`,
    `Commander! Anis said that this swimsuit is better than my normal outfit for fighting Raptures, what do you think?`,
    `Waterpower? I don't know what that is Commander, but it sounds kinda weak.`,
    `Commander! Is it Volt or Bolt?`,
    `Commander, Admi was asking about Ruru, do you know where she is?`,
    `The Golden Ship? Commander you are already old enough to believe in that stuff, please get back to work.`,
    `Mast? Who's that? Doesn't ring a bell.`,
    `Commander, did you really tackle Crow? How did you do it?`,
    `Age is just a number? Commander, I'm calling ACPU`,
    `What do you mean my voice sounds similar to someone else? Who are you thinking about Commander? sigh...`,
    `Commander, what did you want to ask about Biscuit?`,
    `Commander, 61% is more than enough, stop complaining.`,
    `Commander, Ade said that I need to try a maid outfit, what do you think?`,
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
