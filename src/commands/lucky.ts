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
        const phrases = {
            low: [
                `Oh no, Commander... only **${luck}%** luck? That's disappointing.`,
                `Commander, with just **${luck}%** luck, today might be a struggle.`,
                `A mere **${luck}%** luck, Commander? That's not very promising.`,
                `Commander, **${luck}%** luck is quite low. Let's hope for better days.`,
                `Only **${luck}%** luck, Commander? We might need a miracle.`
            ],
            special69: [
                `Commander... **69%** luck? That's... quite suggestive. Let's keep it together.`,
                `Oh my, Commander... **69%**? That's... um, interesting. Let's stay focused.`,
                `Commander, **69%** luck? That's... unexpected. Let's keep our composure.`,
                `**69%** luck, Commander? That's... intriguing. Let's stay sharp.`,
                `Commander... **69%**? That's... quite something. Let's keep it professional.`
            ],
            perfect: [
                `Wow, Commander! **100%** luck! Today is your day to shine!`,
                `Incredible, Commander! **100%** luck means nothing can stop us!`,
                `Commander, with **100%** luck, the odds are in our favor! Let's seize the day!`,
                `A perfect **100%** luck, Commander! This is truly remarkable!`,
                `Commander, **100%** luck? We're destined for success today!`
            ],
            default: [
                `Commander, your luck for today is: **${luck}%**. Let's make the most of it.`,
                `Today's luck for you, Commander, is **${luck}%**. Let's see what it brings.`,
                `Commander, you have **${luck}%** luck today. Let's tackle the challenges ahead.`,
                `Your luck today, Commander, is **${luck}%**. Let's make it count.`,
                `Commander, expect **${luck}%** luck today. Let's face the day with confidence.`
            ]
        };

        let replyContent;
        const reactions = ['rapidd'];

        switch (true) {
            case (luck < 3):
                replyContent = phrases.low[Math.floor(Math.random() * phrases.low.length)];
                reactions.push('HAH', 'ICANT', 'wecant');
                break;
            case (luck === 69):
                replyContent = phrases.special69[Math.floor(Math.random() * phrases.special69.length)];
                reactions.push('KirbyS', 'sajcum');
                break;
            case (luck === 100):
                replyContent = phrases.perfect[Math.floor(Math.random() * phrases.perfect.length)];
                reactions.push('Gamer', 'GachaFlex');
                break;
            default:
                replyContent = phrases.default[Math.floor(Math.random() * phrases.default.length)];
        }

        const message = await interaction.reply({ content: replyContent, ephemeral: false, fetchReply: true });

        for (const reaction of reactions) {
            const emoji = interaction.guild?.emojis.cache.find(e => e.name === reaction);
            if (emoji) {
                await message.react(emoji);
            } else {
                console.warn(`Emoji '${reaction}' not found in guild ${interaction.guild?.name}`);
            }
        }
    },
};
