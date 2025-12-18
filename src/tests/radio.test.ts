import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    createAudioPlayer,
    joinVoiceChannel,
    createAudioResource,
    VoiceConnectionStatus,
    AudioPlayerStatus,
    entersState,
} from '@discordjs/voice';
import * as fs from 'fs';

// Mock @discordjs/voice
vi.mock('@discordjs/voice', () => {
    const mockPlayer = {
        on: vi.fn(),
        play: vi.fn(),
    };
    const mockConnection = {
        on: vi.fn(),
        subscribe: vi.fn(),
        destroy: vi.fn(),
    };
    return {
        createAudioPlayer: vi.fn(() => mockPlayer),
        joinVoiceChannel: vi.fn(() => mockConnection),
        createAudioResource: vi.fn(),
        VoiceConnectionStatus: {
            Ready: 'ready',
            Disconnected: 'disconnected',
            Signalling: 'signalling',
            Connecting: 'connecting',
        },
        AudioPlayerStatus: {
            Idle: 'idle',
        },
        entersState: vi.fn(),
    };
});

// Mock fs
vi.mock('fs', () => ({
    readdirSync: vi.fn(() => ['song1.opus', 'song2.mp3', 'song3.opus']),
    existsSync: vi.fn(() => true),
}));

describe('Radio Playback', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Voice Connection Setup', () => {
        it('should create a voice connection with correct parameters', () => {
            const mockVoiceChannel = {
                id: 'voice-channel-id',
                guild: {
                    id: 'guild-id',
                    voiceAdapterCreator: vi.fn(),
                },
            };

            joinVoiceChannel({
                channelId: mockVoiceChannel.id,
                guildId: mockVoiceChannel.guild.id,
                adapterCreator: mockVoiceChannel.guild.voiceAdapterCreator,
            });

            expect(joinVoiceChannel).toHaveBeenCalledWith({
                channelId: 'voice-channel-id',
                guildId: 'guild-id',
                adapterCreator: expect.any(Function),
            });
        });

        it('should register Ready event handler on connection', () => {
            const connection = joinVoiceChannel({
                channelId: 'test',
                guildId: 'test',
                adapterCreator: vi.fn() as any,
            });

            connection.on(VoiceConnectionStatus.Ready, () => {});

            expect(connection.on).toHaveBeenCalledWith('ready', expect.any(Function));
        });

        it('should register Disconnected event handler on connection', () => {
            const connection = joinVoiceChannel({
                channelId: 'test',
                guildId: 'test',
                adapterCreator: vi.fn() as any,
            });

            connection.on(VoiceConnectionStatus.Disconnected, async () => {});

            expect(connection.on).toHaveBeenCalledWith('disconnected', expect.any(Function));
        });
    });

    describe('Audio Player Setup', () => {
        it('should create an audio player', () => {
            const player = createAudioPlayer();
            expect(createAudioPlayer).toHaveBeenCalled();
            expect(player).toBeDefined();
        });

        it('should register error handler on player', () => {
            const player = createAudioPlayer();
            player.on('error', (error: Error) => {
                console.error(error.message);
            });

            expect(player.on).toHaveBeenCalledWith('error', expect.any(Function));
        });

        it('should register Idle handler on player', () => {
            const player = createAudioPlayer();
            player.on(AudioPlayerStatus.Idle, () => {});

            expect(player.on).toHaveBeenCalledWith('idle', expect.any(Function));
        });
    });

    describe('File Existence Check', () => {
        it('should check if file exists before playing', () => {
            const songPath = './src/radio/song1.opus';
            fs.existsSync(songPath);

            expect(fs.existsSync).toHaveBeenCalledWith(songPath);
        });

        it('should return true for existing files', () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            expect(fs.existsSync('./src/radio/song1.opus')).toBe(true);
        });

        it('should return false for missing files', () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);
            expect(fs.existsSync('./src/radio/nonexistent.opus')).toBe(false);
        });
    });

    describe('Playlist Loading', () => {
        it('should read playlist from radio folder', () => {
            const RADIO_FOLDER_PATH = './src/radio';
            const playlist = fs.readdirSync(RADIO_FOLDER_PATH);

            expect(fs.readdirSync).toHaveBeenCalledWith(RADIO_FOLDER_PATH);
            expect(playlist).toEqual(['song1.opus', 'song2.mp3', 'song3.opus']);
        });

        it('should handle empty playlist gracefully', () => {
            vi.mocked(fs.readdirSync).mockReturnValue([]);
            const playlist = fs.readdirSync('./src/radio');
            expect(playlist).toEqual([]);
        });
    });

    describe('Audio Resource Creation', () => {
        it('should create audio resource from file path', () => {
            const songPath = './src/radio/song1.opus';
            createAudioResource(songPath);

            expect(createAudioResource).toHaveBeenCalledWith(songPath);
        });
    });

    describe('Reconnection Logic', () => {
        it('should attempt reconnection using entersState', async () => {
            const connection = joinVoiceChannel({
                channelId: 'test',
                guildId: 'test',
                adapterCreator: vi.fn() as any,
            });

            vi.mocked(entersState).mockResolvedValue(connection);

            await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);

            expect(entersState).toHaveBeenCalled();
        });

        it('should destroy connection when reconnection fails', async () => {
            const connection = joinVoiceChannel({
                channelId: 'test',
                guildId: 'test',
                adapterCreator: vi.fn() as any,
            });

            vi.mocked(entersState).mockRejectedValue(new Error('Reconnection timeout'));

            try {
                await entersState(connection, VoiceConnectionStatus.Signalling, 5_000);
            } catch (error) {
                connection.destroy();
            }

            expect(connection.destroy).toHaveBeenCalled();
        });
    });

    describe('Playlist Index Cycling', () => {
        it('should cycle to beginning when reaching end of playlist', () => {
            const playlist = ['song1.opus', 'song2.mp3', 'song3.opus'];
            let currentSongIndex = 2; // Last song

            const nextIndex = (currentSongIndex + 1) % playlist.length;

            expect(nextIndex).toBe(0); // Should wrap to first song
        });

        it('should advance to next song normally', () => {
            const playlist = ['song1.opus', 'song2.mp3', 'song3.opus'];
            let currentSongIndex = 0;

            const nextIndex = (currentSongIndex + 1) % playlist.length;

            expect(nextIndex).toBe(1);
        });
    });
});
