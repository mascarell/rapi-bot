import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { s3Client } from '../../discord';
import { CONSTANTS } from './gachaConstants';
import { GachaGameConfig, PullResult } from './gachaTypes';
import { NikkeUtil } from './nikkeUtil';

export class GachaPuller {
    static async pull(pullType: string, gameConfig: GachaGameConfig): Promise<PullResult[]> {
        const pulls = pullType === 'multi' ? 10 : 1;
        const results: PullResult[] = [];

        for (let i = 0; i < pulls; i++) {
            const rarity = this.determineRarity(gameConfig.rates);
            const character = await this.getRandomCharacter('nikke', rarity);
            results.push(character);
        }

        return results;
    }

    private static determineRarity(rates: Record<string, number>): string {
        const rand = Math.random();
        let cumulativeRate = 0;

        for (const [rarity, rate] of Object.entries(rates)) {
            cumulativeRate += rate;
            if (rand < cumulativeRate) return rarity;
        }

        return Object.keys(rates)[0];
    }

    private static async getRandomCharacter(
        game: string,
        rarity: string
    ): Promise<PullResult> {
        const prefix = `gacha/${game}/rarities/${rarity.toLowerCase()}`;
        
        const response = await s3Client.send(new ListObjectsV2Command({
            Bucket: process.env.S3BUCKET,
            Prefix: prefix,
        }));

        if (!response.Contents?.length) {
            throw new Error(`No characters found for ${rarity}`);
        }

        const validFiles = response.Contents
            .map(obj => obj.Key?.split('/').pop())
            .filter((name): name is string => name?.endsWith('.webp') ?? false);

        if (!validFiles.length) {
            throw new Error(`No valid character files found for ${rarity}`);
        }

        const randomFile = validFiles[Math.floor(Math.random() * validFiles.length)];
        
        return {
            rarity,
            name: NikkeUtil.fileToCharacterName(randomFile),
            imageUrl: `${CONSTANTS.CDN_DOMAIN_URL}/${prefix}/${randomFile}`
        };
    }
} 