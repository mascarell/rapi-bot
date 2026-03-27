/**
 * Convert a display name to a URL/filename-safe slug.
 *
 * Rules:
 * 1. Strip colons
 * 2. Replace non-alphanumeric characters with hyphens
 * 3. Collapse consecutive hyphens
 * 4. Trim leading/trailing hyphens
 * 5. Lowercase
 *
 * Examples:
 *   "Scarlet: Black Shadow" → "scarlet-black-shadow"
 *   "D: Killer Wife"        → "d-killer-wife"
 *   "2B"                    → "2b"
 *   "iDoll Ocean"           → "idoll-ocean"
 *   "Rapi: Red Hood"        → "rapi-red-hood"
 */
export function slugify(input: string): string {
    if (!input || typeof input !== 'string') {
        throw new Error('slugify requires a non-empty string');
    }

    return input
        .replace(/:/g, '')
        .replace(/[^a-zA-Z0-9]/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
}
