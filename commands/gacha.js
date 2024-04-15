const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const charactersData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'utils', 'characters.json'), 'utf-8'));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gacha')
        .setDescription('Performs a gacha pull for NIKKE!')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of pull')
                .setRequired(true)
                .addChoices(
                    { name: 'single', value: 'single' },
                    // TODO: Disabled until we figure out how to make this shit look pretty in discord embeds...
                    // { name: 'multi', value: 'multi' } 
                )),

    async execute(interaction) {
        const pullType = interaction.options.getString('type');
        const results = pullCharacters(pullType);
        const embeds = generateEmbeds(results);
        if (embeds.length > 10) { // Discord allows a max of 10 embeds per message
            for (let i = 0; i < embeds.length; i += 10) {
                await interaction.followUp({ embeds: embeds.slice(i, i + 10) });
            }
        } else {
            await interaction.reply({ embeds: embeds, em });
        }
    }
};

function pullCharacters(pullType) {
    const SSR_RATE = 0.04;
    const SR_RATE = 0.43;
    const R_RATE = 0.53;
    const results = [];
    const pulls = pullType === 'multi' ? 10 : 1;

    for (let i = 0; i < pulls; i++) {
        const rand = Math.random();
        let rarity;
        let characterPool;

        if (rand < SSR_RATE) {
            rarity = 'SSR';
            characterPool = charactersData.SSR;
        } else if (rand < SSR_RATE + SR_RATE) {
            rarity = 'SR';
            characterPool = charactersData.SR;
        } else {
            rarity = 'R';
            characterPool = charactersData.R;
        }

        const character = characterPool[Math.floor(Math.random() * characterPool.length)];
        results.push({ ...character, rarity });
    }

    return results;
}

function generateEmbeds(characters) {
    return characters.map(char => {
        return new EmbedBuilder()
            .setTitle(`${char.name} - Rarity: ${char.rarity}`)
            .setColor(0x00AE86)
            .setImage(char.image)
            .setFooter({ text: getFooterTextByRarity(char.rarity) });
    });
}

function getFooterTextByRarity(rarity) {
    switch (rarity) {
        case 'Pilgrim':
            return "A legendary find, Commander! Are we dreaming?";
        case 'SSR':
            return "Wow! A SSR? That's incredibly lucky, Commander!";
        case 'SR':
            return "An SR! You're on the right track, Commander!";
        case 'R':
            return "It's just an R, but every squad member counts!";
        default:
            return "Keep pulling, Commander! Victory awaits!";
    }
}