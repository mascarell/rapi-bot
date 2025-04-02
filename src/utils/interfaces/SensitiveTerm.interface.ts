/**
 * Interface for sensitive term configuration
 */
export interface SensitiveTerm {
    term: string;
    variations?: string[];
    category: 'location' | 'event' | 'date';
}
