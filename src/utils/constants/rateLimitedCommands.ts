export const RATE_LIMITED_COMMANDS = [
    'booba?',
    'booty?',
    'sounds like...',
    'sounds like…',
    'seggs?',
    'kinda weird...',
    'i swear she is actually 3000 years old',
    '12+ game',
    'justice for...',
    'whale levels',
    'lap of discipline.',
    'wrong girl',
    'mold rates are not that bad',
    'ready rapi?',
    'bad girl',
    'reward?',
    'damn train',
    'damn gravedigger',
    'dead spicy?',
    'belorta...',
    'ccp rules...',
    'best girl?',
    '99%',
    'ccp #1',
    'is it over?',
    'absolute...',
    'we had a plan!',
    'ccp leadership',
    'good idea!',
    'quiet rapi',
    'entertainmentttt',
    'we casual'
] as const;

export type RateLimitedCommand = typeof RATE_LIMITED_COMMANDS[number];

export function isRateLimitedCommand(command: string): command is RateLimitedCommand {
    return RATE_LIMITED_COMMANDS.includes(command as RateLimitedCommand);
} 