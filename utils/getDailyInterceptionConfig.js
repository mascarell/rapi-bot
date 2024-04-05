// Daily Interception Bosses
const bosses = [
    "Blacksmith",
    "Chatterbox",
    "Modernia",
    "Alteisen MK.VI",
    "Grave Digger",
];

function getBosses() {
    return bosses;    
}

// Daily Interception Boss Website Links
const bossesLinks = [
    "https://lootandwaifus.com/guides/special-individual-interception-blacksmith/",
    "https://lootandwaifus.com/guides/special-individual-interception-chatterbox/",
    "https://lootandwaifus.com/guides/special-individual-interception-modernia/",
    "https://lootandwaifus.com/guides/special-individual-interception-alteisen-mk-vi/",
    "https://lootandwaifus.com/guides/special-individual-interception-grave-digger/",
];

function getBossesLinks() {
    return bossesLinks;    
}

// Tribe Tower Rotation 
const towerRotation = [
    "Tetra",
    "Elysion",
    "Missilis & Pilgrim",
    "Tetra",
    "Elysion",
    "Missilis",
    "all manufacturers",
];

function getTribeTowerRotation() {
    return towerRotation;    
}

// Get Boss File Name
function getBossFileName(bossName) {
    switch (bossName) {
        // Hardcode for Thomas The Train
        case "Alteisen MK.VI":
            return "train.webp";
        default:
            return `${bossName.toLowerCase().replace(/\s+/g, '')}.webp`;
    }
}

module.exports = {
    getBosses,
    getBossesLinks,
    getTribeTowerRotation,
    getBossFileName,
};
