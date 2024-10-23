// Daily Interception Bosses
const bosses = [
    "Blacksmith",
    "Chatterbox",
    "Modernia",
    "Alteisen MK.VI",
    "Grave Digger",
];

export function getBosses() {
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

export function getBossesLinks() {
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

export function getTribeTowerRotation() {
    return towerRotation;    
}

// Get Boss File Name
export function getBossFileName(bossName: string) {
    switch (bossName) {
        // Hardcode for Thomas The Train
        case "Alteisen MK.VI":
            return "train.webp";
        default:
            return `${bossName.toLowerCase().replace(/\s+/g, '')}.webp`;
    }
}
