import { SlashCommandBuilder, CommandInteraction } from 'discord.js';
import fs from 'fs';
import { logger } from '../utils/logger.js';

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
        logger.error`Error loading user data: ${err}`;
        return {};
    }
};

const saveUserData = (data: UserData) => {
    try {
        fs.writeFileSync('user_data.json', JSON.stringify(data, null, 4));
    } catch (err) {
        logger.error`Error saving user data: ${err}`;
    }
};

userData = loadUserData();

export default {
    lastUsage: userData,
    data: new SlashCommandBuilder()
        .setName('lucky')
        .setDescription('Tells you your luck for today'),
    async execute(interaction: CommandInteraction) {
        const userID = interaction.user.id;
        const currentTime = Date.now();
        const oneDay = 43200000; // UPDATED to be 12 hours instead of 1 full day

        if (this.lastUsage[userID]) {
            const lastTime = this.lastUsage[userID].lastTime;
            const diff = currentTime - lastTime;

            if (diff < oneDay) {
                const remainingTime = oneDay - diff;
                const remainingTimeInHours = Math.floor(remainingTime / (1000 * 60 * 60));
                const remainingMinutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
                return interaction.reply({
                    content: `Sorry, Commander. You can use this command again in ${remainingTimeInHours} hours and ${remainingMinutes} minutes.`,
                    
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
            mold20: [
                `Commander, **20%** luck? Just like the Mid-Quality Mold...where SSRs are a fairy tale.`,
                `With **20%** luck, Commander, it's as slim as the Mid-Quality Mold...where dreams go to die.`,
                `Commander, **20%** luck is like the Mid-Quality Mold...where SSRs are as rare as unicorns.`,
                `**20%** luck, Commander? Just like the Mid-Quality Mold...where SSRs are a distant fantasy.`,
                `Commander, **20%** luck? It's like the Mid-Quality Mold...where the only thing guaranteed is disappointment.`
            ],
            mold50: [
                `Commander, **50%** luck? It's like the Manufacturer Mold...where a coin flip feels more reliable.`,
                `With **50%** luck, Commander, it's as balanced as the Manufacturer Mold...half chance, full letdown.`,
                `Commander, **50%** luck is like the Manufacturer Mold...where the odds are as clear as mud.`,
                `**50%** luck, Commander? Just like the Manufacturer Mold...where SSRs are a myth.`,
                `Commander, **50%** luck? It's like the Manufacturer Mold...where hope springs eternal... and falls flat.`
            ],
            mold61: [
                `Commander, **61%** luck? Just like the High Quality Mold...where dreams of SSRs go to... well, not happen.`,
                `With **61%** luck, Commander, it's like the High Quality Mold...full of hope and... disappointment.`,
                `Commander, **61%** luck is like the High Quality Mold...promises of SSRs that never quite materialize.`,
                `**61%** luck, Commander? Just like the High Quality Mold...where SSRs are as elusive as ever.`,
                `Commander, **61%** luck? It's like the High Quality Mold...great on paper, not so much in reality.`
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
            case (luck <= 3):
                replyContent = phrases.low[Math.floor(Math.random() * phrases.low.length)];
                reactions.push('sefhistare', 'gachaOver', 'HAH', 'ICANT', 'wecant');
                break;
            case (luck === 20):
                replyContent = phrases.mold20[Math.floor(Math.random() * phrases.mold20.length)];
                reactions.push('moldRates', 'SIShafted', 'gachaOver', 'ICANT', 'HAH');
                break;
            case (luck === 50):
                replyContent = phrases.mold50[Math.floor(Math.random() * phrases.mold50.length)];
                reactions.push('moldRates', 'SIShafted', 'shrugde');
                break;
            case (luck === 61):
                replyContent = phrases.mold61[Math.floor(Math.random() * phrases.mold61.length)];
                reactions.push('moldRates', 'SIShafted', 'shrugde');
                break;
            case (luck === 69):
                replyContent = phrases.special69[Math.floor(Math.random() * phrases.special69.length)];
                reactions.push('KirbyS', 'sajcum', 'rapiHUH');
                break;
            case (luck === 100):
                replyContent = phrases.perfect[Math.floor(Math.random() * phrases.perfect.length)];
                reactions.push('rapiHUH', 'Gamer', 'gachaFlex', 'gigaStare');
                break;
            default:
                replyContent = phrases.default[Math.floor(Math.random() * phrases.default.length)];
        }

        const message = await interaction.reply({ content: replyContent, fetchReply: true });

        for (const reaction of reactions) {
            const emoji = interaction.guild?.emojis.cache.find(e => e.name === reaction);
            if (emoji) {
                await message.react(emoji);
            } else {
                logger.warning`Emoji '${reaction}' not found in guild ${interaction.guild?.name}`;
            }
        }
    },
};
