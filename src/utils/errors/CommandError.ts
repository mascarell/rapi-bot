/**
 * Error class for command handling
 */
export class CommandError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CommandError';
    }
} 