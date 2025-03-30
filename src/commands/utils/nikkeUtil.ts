export const NikkeUtil = {
    fileToCharacterName(fileName: string): string {
        const baseName = fileName.replace(/\.webp$/, '');
        return baseName
            .split('-')
            .map((part, i) => this.capitalizeWord(part))
            .join(' ');
    },

    capitalizeWord(word: string): string {
        const specialCases: Record<string, string> = {
            'idoll': 'iDoll',
            'nikke': 'NIKKE',
            'eg': 'EG',
            'fa': 'FA',
            'ow': 'OW',
            'n102': 'N102'
        };

        return specialCases[word.toLowerCase()] || 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
}; 