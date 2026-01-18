/**
 * BD2 Pulse Scraper Service
 *
 * Automatically fetches coupon codes from thebd2pulse.com
 * Uses Puppeteer to intercept API responses from the page
 * Runs on a schedule to keep codes up-to-date
 */

import puppeteer from 'puppeteer';
import { getGachaDataService } from './gachaDataService.js';
import { GachaCoupon } from '../utils/interfaces/GachaCoupon.interface';

const BD2_PULSE_API_URL = 'https://api.thebd2pulse.com/redeem';
const BOT_USER_ID = 'bd2pulse-scraper'; // System user ID for auto-added codes

/**
 * API response structure from BD2 Pulse
 */
interface BD2PulseApiCode {
    code: string;
    reward: {
        'zh-Hant-TW': string;
        'zh-Hans-CN': string;
        'en': string;
        'ja-JP': string;
        'ko-KR': string;
    };
    status: 'limited' | 'permanent' | 'active' | string;
    expiry_date: string | null; // Format: "YYYY/MM/DD" or null
    image_url: string | null;
}

export interface ScrapedCode {
    code: string;
    rewards: string;
    expirationDate: string | null;
    status: 'active' | 'limited' | 'permanent' | 'unknown';
}

export interface ScrapeResult {
    success: boolean;
    codes: ScrapedCode[];
    newCodes: string[];
    skippedExpired: string[];
    skippedExisting: string[];
    error?: string;
}

/**
 * Parse expiration date from BD2 Pulse API format
 * e.g., "2026/02/28" -> ISO date string
 */
function parseExpirationDate(dateText: string | null): string | null {
    if (!dateText) return null;

    // Match patterns like "2026/02/28", "2026/1/31"
    const match = dateText.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (!match) return null;

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);

    const expirationDate = new Date(year, month - 1, day, 23, 59, 59);
    return expirationDate.toISOString();
}

/**
 * Map API status to our status format
 */
function mapStatus(status: string): ScrapedCode['status'] {
    switch (status.toLowerCase()) {
        case 'limited':
            return 'limited';
        case 'permanent':
            return 'permanent';
        case 'active':
            return 'active';
        default:
            return 'unknown';
    }
}

/**
 * Fetch codes from BD2 Pulse by intercepting their API response via Puppeteer
 * The API requires browser context (CORS), so we load the page and capture the response
 */
export async function scrapeBD2PulseCodes(): Promise<ScrapedCode[]> {
    let browser;
    try {
        console.log('[BD2 Pulse] Launching browser to capture API response...');
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();

        // Store the API response when it arrives
        let apiCodes: BD2PulseApiCode[] = [];

        // Listen for the API response
        page.on('response', async (response) => {
            const url = response.url();
            if (url.includes('api.thebd2pulse.com/redeem')) {
                try {
                    const data = await response.json();
                    if (Array.isArray(data)) {
                        apiCodes = data;
                        console.log(`[BD2 Pulse] Captured API response with ${data.length} codes`);
                    }
                } catch (e) {
                    // Ignore JSON parse errors
                }
            }
        });

        // Navigate to the page (which triggers the API call)
        console.log('[BD2 Pulse] Loading page...');
        await page.goto('https://thebd2pulse.com/en/', {
            waitUntil: 'networkidle2',
            timeout: 30000,
        });

        // Give a moment for any late API calls
        await new Promise(resolve => setTimeout(resolve, 2000));

        await browser.close();
        browser = null;

        if (apiCodes.length === 0) {
            console.log('[BD2 Pulse] No codes captured from API');
            return [];
        }

        const codes: ScrapedCode[] = apiCodes.map(apiCode => ({
            code: apiCode.code.toUpperCase(),
            rewards: apiCode.reward.en || apiCode.reward['zh-Hant-TW'] || 'Unknown',
            expirationDate: parseExpirationDate(apiCode.expiry_date),
            status: mapStatus(apiCode.status),
        }));

        console.log(`[BD2 Pulse] Parsed ${codes.length} codes`);
        return codes;
    } catch (error: any) {
        console.error('Failed to fetch BD2 Pulse codes:', error.message);
        if (browser) {
            await browser.close();
        }
        throw error;
    }
}

/**
 * Check if a code is expired based on its expiration date
 */
function isCodeExpired(expirationDate: string | null): boolean {
    if (!expirationDate) return false; // No expiry = not expired
    const expiry = new Date(expirationDate);
    const now = new Date();
    return expiry < now;
}

/**
 * Sync codes from BD2 Pulse to our database
 * Filters out expired codes and tracks what was skipped
 * Returns information about what was added
 */
export async function syncBD2PulseCodes(): Promise<ScrapeResult> {
    try {
        const scrapedCodes = await scrapeBD2PulseCodes();

        if (scrapedCodes.length === 0) {
            return {
                success: true,
                codes: [],
                newCodes: [],
                skippedExpired: [],
                skippedExisting: [],
            };
        }

        const dataService = getGachaDataService();

        // Get ALL coupons (active and inactive) to check for duplicates
        const allCoupons = await dataService.getAllCoupons('bd2');
        const existingCodes = new Set(allCoupons.map(c => c.code.toUpperCase()));

        const newCodes: string[] = [];
        const skippedExpired: string[] = [];
        const skippedExisting: string[] = [];

        // Separate active codes from expired ones
        const activeCodes = scrapedCodes.filter(c => !isCodeExpired(c.expirationDate));
        const expiredCodes = scrapedCodes.filter(c => isCodeExpired(c.expirationDate));

        // Track expired codes
        for (const expired of expiredCodes) {
            if (!existingCodes.has(expired.code)) {
                skippedExpired.push(expired.code);
            }
        }

        // Process only active (non-expired) codes
        for (const scraped of activeCodes) {
            if (existingCodes.has(scraped.code)) {
                skippedExisting.push(scraped.code);
                continue;
            }

            try {
                await dataService.addCoupon({
                    code: scraped.code,
                    gameId: 'bd2',
                    rewards: scraped.rewards,
                    expirationDate: scraped.expirationDate,
                    addedBy: BOT_USER_ID,
                    addedAt: new Date().toISOString(),
                    isActive: true,
                    source: 'BD2 Pulse (Auto)',
                });
                newCodes.push(scraped.code);
                const expiryInfo = scraped.expirationDate
                    ? ` (expires ${new Date(scraped.expirationDate).toLocaleDateString()})`
                    : '';
                console.log(`[BD2 Pulse] Added new code: ${scraped.code} - ${scraped.rewards}${expiryInfo}`);
            } catch (error: any) {
                // Code might already exist (race condition) - skip silently
                if (!error.message?.includes('already exists')) {
                    console.error(`[BD2 Pulse] Failed to add code ${scraped.code}:`, error.message);
                }
            }
        }

        if (skippedExpired.length > 0) {
            console.log(`[BD2 Pulse] Skipped ${skippedExpired.length} expired codes`);
        }

        return {
            success: true,
            codes: scrapedCodes,
            newCodes,
            skippedExpired,
            skippedExisting,
        };
    } catch (error: any) {
        return {
            success: false,
            codes: [],
            newCodes: [],
            skippedExpired: [],
            skippedExisting: [],
            error: error.message,
        };
    }
}

/**
 * Get the scraper status/info
 */
export function getScraperInfo() {
    return {
        source: 'https://thebd2pulse.com',
        apiEndpoint: BD2_PULSE_API_URL,
        botUserId: BOT_USER_ID,
    };
}
