import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * These tests exercise the real RadioService.
 *
 * The previous version of this file imported nothing from production code — it
 * asserted against its own mocks and re-computed the playlist arithmetic inline,
 * so all fifteen tests passed regardless of what discord.ts did. That is why the
 * missing reconnect path shipped and then went unnoticed for eleven days.
 */

const mockPlayerState = { status: 'idle' };
const mockConnectionState = { status: 'ready' };

const playerHandlers = new Map<string, (...args: any[]) => void>();
const connectionHandlers = new Map<string, (...args: any[]) => void>();

const mockPlayer = {
    on: vi.fn((event: string, fn: any) => {
        playerHandlers.set(event, fn);
        return mockPlayer;
    }),
    play: vi.fn(),
    stop: vi.fn(),
    get state() {
        return mockPlayerState;
    },
};

const mockConnection = {
    on: vi.fn((event: string, fn: any) => {
        connectionHandlers.set(event, fn);
        return mockConnection;
    }),
    subscribe: vi.fn(),
    destroy: vi.fn(),
    get state() {
        return mockConnectionState;
    },
};

let entersStateImpl: (...args: any[]) => Promise<any> = async () => undefined;

vi.mock('@discordjs/voice', () => ({
    createAudioPlayer: vi.fn(() => mockPlayer),
    joinVoiceChannel: vi.fn(() => mockConnection),
    createAudioResource: vi.fn((p: string) => ({ path: p })),
    entersState: vi.fn((...args: any[]) => entersStateImpl(...args)),
    StreamType: { OggOpus: 'ogg/opus', Arbitrary: 'arbitrary' },
    VoiceConnectionStatus: {
        Ready: 'ready',
        Disconnected: 'disconnected',
        Signalling: 'signalling',
        Connecting: 'connecting',
    },
    AudioPlayerStatus: { Idle: 'idle', Playing: 'playing' },
}));

let files = ['a.opus', 'b.mp3', 'c.opus'];
let missing = new Set<string>();

vi.mock('fs', () => ({
    default: {
        readdirSync: vi.fn(() => files),
        existsSync: vi.fn((p: string) => !missing.has(p)),
    },
    readdirSync: vi.fn(() => files),
    existsSync: vi.fn((p: string) => !missing.has(p)),
}));

import { createAudioResource, joinVoiceChannel } from '@discordjs/voice';
import { getRadioService } from '../services/radioService';
import { RADIO_CONFIG } from '../utils/data/radioConfig.js';

function makeBot(opts: { channelId?: string; channelName?: string; guildId?: string } = {}) {
    const channel = {
        id: opts.channelId ?? RADIO_CONFIG.VOICE_CHANNEL_ID,
        name: opts.channelName ?? 'rapi-radio',
        type: 2, // ChannelType.GuildVoice
        isVoiceBased: () => true,
        guild: { id: RADIO_CONFIG.GUILD_ID, voiceAdapterCreator: vi.fn() },
    };

    const channelCache = {
        get: (id: string) => (id === channel.id ? channel : undefined),
        find: (fn: any) => (fn(channel) ? channel : undefined),
    };

    const guild = { id: RADIO_CONFIG.GUILD_ID, channels: { cache: channelCache } };

    return {
        guilds: {
            cache: {
                get: (id: string) => (id === (opts.guildId ?? RADIO_CONFIG.GUILD_ID) ? guild : undefined),
            },
        },
    } as any;
}

describe('RadioService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        playerHandlers.clear();
        connectionHandlers.clear();
        files = ['a.opus', 'b.mp3', 'c.opus'];
        missing = new Set();
        mockPlayerState.status = 'idle';
        mockConnectionState.status = 'ready';
        entersStateImpl = async () => undefined;
        getRadioService().reset();
    });

    afterEach(() => {
        getRadioService().reset();
        vi.useRealTimers();
    });

    describe('startup', () => {
        it('joins the configured guild and channel', async () => {
            await getRadioService().start(makeBot());

            expect(joinVoiceChannel).toHaveBeenCalledTimes(1);
            const arg = (joinVoiceChannel as any).mock.calls[0][0];
            expect(arg.channelId).toBe(RADIO_CONFIG.VOICE_CHANNEL_ID);
            expect(arg.guildId).toBe(RADIO_CONFIG.GUILD_ID);
        });

        it('does not join when the guild is missing, and does not throw', async () => {
            const bot = { guilds: { cache: { get: () => undefined } } } as any;

            await expect(getRadioService().start(bot)).resolves.toBeUndefined();
            expect(joinVoiceChannel).not.toHaveBeenCalled();
        });

        it('falls back to the channel name when the configured ID is gone', async () => {
            // The silent-death case: channel deleted and recreated, new ID.
            await getRadioService().start(makeBot({ channelId: 'some-new-id' }));

            expect(joinVoiceChannel).toHaveBeenCalledTimes(1);
            expect((joinVoiceChannel as any).mock.calls[0][0].channelId).toBe('some-new-id');
        });

        it('does not start with an empty playlist', async () => {
            files = [];

            await getRadioService().start(makeBot());

            expect(joinVoiceChannel).not.toHaveBeenCalled();
        });

        it('ignores files with unsupported extensions', async () => {
            files = ['a.opus', 'readme.txt', 'cover.jpg', 'b.mp3'];

            await getRadioService().start(makeBot());

            expect(getRadioService().getPlaylist().sort()).toEqual(['a.opus', 'b.mp3']);
        });
    });

    describe('playback', () => {
        it('plays the track at index 0 first, not index 1', async () => {
            // The old code started at index 0 then advanced before playing, so
            // the first file never played on a fresh boot. Asserted against the
            // loaded playlist rather than a literal name, because SHUFFLE is on.
            files = ['first.opus', 'second.opus'];
            await getRadioService().start(makeBot());

            connectionHandlers.get('ready')!();

            expect(getRadioService().getIndex()).toBe(0);
            const expected = getRadioService().getPlaylist()[0];
            expect((createAudioResource as any).mock.calls[0][0]).toContain(expected);
        });

        it('uses OggOpus for .opus', async () => {
            files = ['track.opus'];
            await getRadioService().start(makeBot());

            connectionHandlers.get('ready')!();

            expect((createAudioResource as any).mock.calls[0][1].inputType).toBe('ogg/opus');
        });

        it('uses Arbitrary for .mp3', async () => {
            files = ['track.mp3'];
            await getRadioService().start(makeBot());

            connectionHandlers.get('ready')!();

            expect((createAudioResource as any).mock.calls[0][1].inputType).toBe('arbitrary');
        });

        it('advances exactly once per finished track', async () => {
            await getRadioService().start(makeBot());
            connectionHandlers.get('ready')!();
            expect(getRadioService().getIndex()).toBe(0);

            playerHandlers.get('idle')!();
            expect(getRadioService().getIndex()).toBe(1);
        });

        it('does not double-advance when a track errors', async () => {
            // An AudioPlayer emits 'error' and then goes Idle. Advancing in both
            // handlers skipped tracks in pairs and started two resources.
            await getRadioService().start(makeBot());
            connectionHandlers.get('ready')!();
            expect(getRadioService().getIndex()).toBe(0);

            playerHandlers.get('error')!(new Error('ffmpeg exploded'));
            expect(getRadioService().getIndex()).toBe(0); // error alone must not advance

            playerHandlers.get('idle')!();
            expect(getRadioService().getIndex()).toBe(1); // Idle is the only advance
        });

        it('does not restart playback when Ready fires again on resume', async () => {
            await getRadioService().start(makeBot());
            connectionHandlers.get('ready')!();
            const callsAfterFirst = (createAudioResource as any).mock.calls.length;

            mockPlayerState.status = 'playing';
            connectionHandlers.get('ready')!();

            expect((createAudioResource as any).mock.calls.length).toBe(callsAfterFirst);
        });

        it('skips missing files without unbounded recursion', async () => {
            files = ['gone.opus', 'here.opus'];
            missing.add(`${RADIO_CONFIG.FOLDER_PATH}/gone.opus`);

            await getRadioService().start(makeBot());
            connectionHandlers.get('ready')!();

            expect((createAudioResource as any).mock.calls[0][0]).toContain('here.opus');
        });

        it('gives up after one pass when every file is missing', async () => {
            files = ['x.opus', 'y.opus'];
            missing.add(`${RADIO_CONFIG.FOLDER_PATH}/x.opus`);
            missing.add(`${RADIO_CONFIG.FOLDER_PATH}/y.opus`);

            await getRadioService().start(makeBot());

            // Must terminate rather than recurse until the stack dies.
            expect(() => connectionHandlers.get('ready')!()).not.toThrow();
            expect(createAudioResource).not.toHaveBeenCalled();
        });
    });

    describe('reconnection — the bug that caused the outage', () => {
        it('reconnects after a voice connection error', async () => {
            await getRadioService().start(makeBot());
            (joinVoiceChannel as any).mockClear();

            // This is the exact failure seen in production on 2026-09-16.
            connectionHandlers.get('error')!(
                new Error("WebSocket connection failed: Expected 101 status code")
            );

            expect(mockConnection.destroy).toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(RADIO_CONFIG.RECONNECT_BASE_DELAY_MS + 50);
            expect(joinVoiceChannel).toHaveBeenCalledTimes(1);
        });

        it('reconnects when a resume attempt fails', async () => {
            await getRadioService().start(makeBot());
            (joinVoiceChannel as any).mockClear();
            entersStateImpl = async () => {
                throw new Error('no resume');
            };

            await connectionHandlers.get('disconnected')!();
            await vi.advanceTimersByTimeAsync(RADIO_CONFIG.RECONNECT_BASE_DELAY_MS + 50);

            expect(joinVoiceChannel).toHaveBeenCalledTimes(1);
        });

        it('does not reconnect when the resume succeeds', async () => {
            await getRadioService().start(makeBot());
            (joinVoiceChannel as any).mockClear();
            entersStateImpl = async () => undefined;

            await connectionHandlers.get('disconnected')!();
            await vi.advanceTimersByTimeAsync(RADIO_CONFIG.RECONNECT_BASE_DELAY_MS + 50);

            expect(joinVoiceChannel).not.toHaveBeenCalled();
        });

        it('reconnects after being dragged out of the channel by a mod', async () => {
            await getRadioService().start(makeBot());
            (joinVoiceChannel as any).mockClear();

            getRadioService().handleForcedDisconnect(RADIO_CONFIG.GUILD_ID);
            await vi.advanceTimersByTimeAsync(RADIO_CONFIG.RECONNECT_BASE_DELAY_MS + 50);

            expect(joinVoiceChannel).toHaveBeenCalledTimes(1);
        });

        it('ignores voice state changes from other guilds', async () => {
            await getRadioService().start(makeBot());
            (joinVoiceChannel as any).mockClear();

            getRadioService().handleForcedDisconnect('some-other-guild');
            await vi.advanceTimersByTimeAsync(RADIO_CONFIG.RECONNECT_BASE_DELAY_MS + 50);

            expect(joinVoiceChannel).not.toHaveBeenCalled();
        });

        it('backs off exponentially instead of hammering Discord', async () => {
            await getRadioService().start(makeBot());
            entersStateImpl = async () => {
                throw new Error('still down');
            };

            connectionHandlers.get('error')!(new Error('down'));
            expect(getRadioService().getReconnectAttempts()).toBe(1);

            // Too early for the second attempt to have been scheduled yet.
            await vi.advanceTimersByTimeAsync(RADIO_CONFIG.RECONNECT_BASE_DELAY_MS - 100);
            expect(getRadioService().getReconnectAttempts()).toBe(1);
        });

        it('reconnects forever rather than giving up', async () => {
            await getRadioService().start(makeBot());
            entersStateImpl = async () => {
                throw new Error('down');
            };

            // Kick off the first failure, then let many backoff windows elapse.
            connectionHandlers.get('error')!(new Error('down'));

            for (let i = 0; i < 12; i++) {
                await vi.advanceTimersByTimeAsync(RADIO_CONFIG.RECONNECT_MAX_DELAY_MS + 100);
            }

            // Still trying after a dozen windows, with the delay capped.
            expect(getRadioService().getReconnectAttempts()).toBeGreaterThan(5);
        });

        it('stops reconnecting once stop() is called', async () => {
            await getRadioService().start(makeBot());
            getRadioService().stop();
            (joinVoiceChannel as any).mockClear();

            getRadioService().handleForcedDisconnect(RADIO_CONFIG.GUILD_ID);
            await vi.advanceTimersByTimeAsync(RADIO_CONFIG.RECONNECT_MAX_DELAY_MS + 100);

            expect(joinVoiceChannel).not.toHaveBeenCalled();
        });
    });

    describe('stall watchdog', () => {
        it('restarts playback when the player sits idle on a live connection', async () => {
            await getRadioService().start(makeBot());
            connectionHandlers.get('ready')!();
            const before = (createAudioResource as any).mock.calls.length;

            mockConnectionState.status = 'ready';
            mockPlayerState.status = 'idle';
            await vi.advanceTimersByTimeAsync(RADIO_CONFIG.STALL_CHECK_INTERVAL_MS + 100);

            expect((createAudioResource as any).mock.calls.length).toBeGreaterThan(before);
        });

        it('leaves a healthy player alone', async () => {
            await getRadioService().start(makeBot());
            connectionHandlers.get('ready')!();
            const before = (createAudioResource as any).mock.calls.length;

            mockPlayerState.status = 'playing';
            await vi.advanceTimersByTimeAsync(RADIO_CONFIG.STALL_CHECK_INTERVAL_MS + 100);

            expect((createAudioResource as any).mock.calls.length).toBe(before);
        });
    });

    describe('shutdown', () => {
        it('destroys the connection and stops the player', async () => {
            await getRadioService().start(makeBot());
            connectionHandlers.get('ready')!(); // so a player actually exists

            getRadioService().stop();

            expect(mockConnection.destroy).toHaveBeenCalled();
            expect(mockPlayer.stop).toHaveBeenCalled();
        });

        it('is safe to call when nothing is running', () => {
            expect(() => getRadioService().stop()).not.toThrow();
        });
    });
});
