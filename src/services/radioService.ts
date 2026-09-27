import { Client, ChannelType, VoiceBasedChannel } from 'discord.js';
import {
    AudioPlayer,
    AudioPlayerStatus,
    VoiceConnection,
    VoiceConnectionStatus,
    createAudioPlayer,
    createAudioResource,
    entersState,
    joinVoiceChannel,
    StreamType,
} from '@discordjs/voice';
import fs from 'fs';
import path from 'path';
import { RADIO_CONFIG } from '../utils/data/radioConfig.js';
import { logger } from '../utils/logger.js';

/**
 * Rapi Radio — continuous music playback in one voice channel.
 *
 * Extracted from discord.ts, where it had no reconnect path of any kind. On
 * 2026-09-16 the voice WebSocket failed twice ("Expected 101 status code"), the
 * error was logged, and the radio stayed silent for eleven days while the
 * process kept running: nothing ever called the connect function again, because
 * it was only reachable from the ClientReady handler.
 *
 * The rules this service follows, each one a bug that actually shipped:
 *
 * - **Every failure path schedules a reconnect.** A connection error, a failed
 *   resume, a Ready timeout and being dragged out of the channel by a mod all
 *   converge on scheduleReconnect() with exponential backoff, and it retries
 *   forever because the bot is unattended.
 * - **Only Idle advances the playlist.** An AudioPlayer transitions to Idle
 *   after emitting 'error', so advancing in both handlers skipped tracks in
 *   pairs and issued two overlapping play() calls.
 * - **Ready does not restart playback that is already running.** Ready re-fires
 *   on every resume.
 * - **It logs when it connects and when it drops**, at a level production
 *   actually prints, because the previous version logged neither and there was
 *   no way to tell from the logs whether the radio had ever started.
 */
class RadioService {
    private static instance: RadioService;

    private bot: Client | null = null;
    private connection: VoiceConnection | null = null;
    private player: AudioPlayer | null = null;
    private playlist: string[] = [];

    /** -1 so the first track played is index 0. The old code started at 1. */
    private index = -1;

    private reconnectAttempts = 0;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private stallTimer: NodeJS.Timeout | null = null;

    /** Set by stop() so a deliberate shutdown is not treated as a failure. */
    private stopped = false;

    private constructor() {}

    public static getInstance(): RadioService {
        if (!RadioService.instance) {
            RadioService.instance = new RadioService();
        }
        return RadioService.instance;
    }

    /* ------------------------------------------------------------------ *
     * Lifecycle
     * ------------------------------------------------------------------ */

    public async start(bot: Client): Promise<void> {
        this.bot = bot;
        this.stopped = false;

        if (!this.loadPlaylist()) return;
        await this.connect();
        this.startStallWatchdog();
    }

    /**
     * Tears the radio down deliberately. Safe to call when nothing is running,
     * and suppresses the reconnect logic so a shutdown does not fight itself.
     */
    public stop(): void {
        this.stopped = true;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.stallTimer) {
            clearInterval(this.stallTimer);
            this.stallTimer = null;
        }

        try {
            this.player?.stop(true);
        } catch {
            // Player may already be dead; nothing to salvage.
        }
        try {
            this.connection?.destroy();
        } catch {
            // Connection may already be destroyed.
        }

        this.player = null;
        this.connection = null;
        logger.warning`[radio] stopped`;
    }

    /**
     * Called from the voiceStateUpdate handler. Being removed from the channel
     * used to destroy the connection permanently; now it reconnects, unless the
     * shutdown path asked for this.
     */
    public handleForcedDisconnect(guildId: string): void {
        if (this.stopped || guildId !== RADIO_CONFIG.GUILD_ID) return;
        logger.warning`[radio] removed from the voice channel; reconnecting`;
        this.teardownConnection();
        this.scheduleReconnect();
    }

    /* ------------------------------------------------------------------ *
     * Channel + playlist resolution
     * ------------------------------------------------------------------ */

    private resolveChannel(): VoiceBasedChannel | null {
        const guild = this.bot?.guilds.cache.get(RADIO_CONFIG.GUILD_ID);
        if (!guild) {
            logger.error`[radio] guild ${RADIO_CONFIG.GUILD_ID} not found; radio disabled`;
            return null;
        }

        const byId = guild.channels.cache.get(RADIO_CONFIG.VOICE_CHANNEL_ID);
        if (byId?.isVoiceBased()) return byId;

        const byName = guild.channels.cache.find(
            c =>
                c.type === ChannelType.GuildVoice &&
                c.name.toLowerCase() === RADIO_CONFIG.NAME_FALLBACK
        );
        if (byName?.isVoiceBased()) {
            logger.warning`[radio] channel id ${RADIO_CONFIG.VOICE_CHANNEL_ID} did not resolve; fell back to #${RADIO_CONFIG.NAME_FALLBACK}. Update RADIO_CONFIG.VOICE_CHANNEL_ID`;
            return byName;
        }

        // Loudly, because the old code had no else branch here and a renamed or
        // recreated channel meant the radio silently never started.
        logger.error`[radio] no voice channel found in guild ${RADIO_CONFIG.GUILD_ID}: id ${RADIO_CONFIG.VOICE_CHANNEL_ID} missing and no #${RADIO_CONFIG.NAME_FALLBACK}`;
        return null;
    }

    private loadPlaylist(): boolean {
        try {
            const files = fs.readdirSync(RADIO_CONFIG.FOLDER_PATH).filter(file => {
                const ext = path.extname(file).toLowerCase();
                return (RADIO_CONFIG.SUPPORTED_AUDIO_EXTENSIONS as readonly string[]).includes(ext);
            });

            if (files.length === 0) {
                logger.error`[radio] no audio files in ${RADIO_CONFIG.FOLDER_PATH}; radio disabled`;
                return false;
            }

            this.playlist = RADIO_CONFIG.SHUFFLE ? this.shuffled(files) : files;
            this.index = -1;
            logger.warning`[radio] loaded ${this.playlist.length} tracks (shuffle=${RADIO_CONFIG.SHUFFLE})`;
            return true;
        } catch (error) {
            logger.error`[radio] could not read ${RADIO_CONFIG.FOLDER_PATH}: ${this.reasonOf(error)}`;
            return false;
        }
    }

    private shuffled(files: string[]): string[] {
        const out = [...files];
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
    }

    /* ------------------------------------------------------------------ *
     * Connection
     * ------------------------------------------------------------------ */

    private async connect(): Promise<void> {
        if (this.stopped) return;

        const channel = this.resolveChannel();
        if (!channel) return;

        try {
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
            });
            this.connection = connection;

            // The bug that started all this: the old handler only logged here.
            connection.on('error', error => {
                logger.error`[radio] voice connection error: ${this.reasonOf(error)}`;
                this.teardownConnection();
                this.scheduleReconnect();
            });

            connection.on(VoiceConnectionStatus.Disconnected, async () => {
                logger.warning`[radio] disconnected; waiting for resume`;
                try {
                    await Promise.race([
                        entersState(
                            connection,
                            VoiceConnectionStatus.Signalling,
                            RADIO_CONFIG.RESUME_TIMEOUT_MS
                        ),
                        entersState(
                            connection,
                            VoiceConnectionStatus.Connecting,
                            RADIO_CONFIG.RESUME_TIMEOUT_MS
                        ),
                    ]);
                    logger.warning`[radio] resuming`;
                } catch {
                    logger.warning`[radio] resume failed; reconnecting from scratch`;
                    this.teardownConnection();
                    this.scheduleReconnect();
                }
            });

            connection.on(VoiceConnectionStatus.Ready, () => {
                this.reconnectAttempts = 0;
                logger.warning`[radio] connected to ${channel.name}`;
                this.ensurePlaying();
            });

            await entersState(
                connection,
                VoiceConnectionStatus.Ready,
                RADIO_CONFIG.READY_TIMEOUT_MS
            );
        } catch (error) {
            logger.error`[radio] failed to connect: ${this.reasonOf(error)}`;
            this.teardownConnection();
            this.scheduleReconnect();
        }
    }

    private teardownConnection(): void {
        try {
            this.connection?.destroy();
        } catch {
            // Already destroyed, or never fully created.
        }
        this.connection = null;
        this.player = null;
    }

    private scheduleReconnect(): void {
        if (this.stopped || this.reconnectTimer) return;

        const delay = Math.min(
            RADIO_CONFIG.RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts,
            RADIO_CONFIG.RECONNECT_MAX_DELAY_MS
        );
        this.reconnectAttempts++;

        logger.warning`[radio] reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts})`;

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            void this.connect();
        }, delay);
    }

    /* ------------------------------------------------------------------ *
     * Playback
     * ------------------------------------------------------------------ */

    /** Starts playback only if nothing is already playing. Ready re-fires. */
    private ensurePlaying(): void {
        if (this.player && this.player.state.status !== AudioPlayerStatus.Idle) {
            return;
        }
        this.playNext();
    }

    private playNext(): void {
        if (this.stopped || !this.connection || this.playlist.length === 0) return;

        // Bounded scan instead of the old unguarded recursion, which could blow
        // the stack if every file were missing.
        for (let tried = 0; tried < this.playlist.length; tried++) {
            this.index = (this.index + 1) % this.playlist.length;
            const track = this.playlist[this.index];
            const songPath = `${RADIO_CONFIG.FOLDER_PATH}/${track}`;

            if (!fs.existsSync(songPath)) {
                logger.warning`[radio] missing file, skipping: ${track}`;
                continue;
            }

            try {
                const ext = path.extname(songPath).toLowerCase();
                const inputType =
                    ext === '.opus' || ext === '.ogg' ? StreamType.OggOpus : StreamType.Arbitrary;

                const resource = createAudioResource(songPath, { inputType });
                this.attachPlayer();
                this.player!.play(resource);
                return;
            } catch (error) {
                logger.error`[radio] could not play ${track}: ${this.reasonOf(error)}`;
                // Fall through to the next track.
            }
        }

        logger.error`[radio] no playable track in ${this.playlist.length} entries`;
    }

    private attachPlayer(): void {
        if (this.player) return;

        const player = createAudioPlayer();
        this.player = player;
        this.connection!.subscribe(player);

        // Deliberately does NOT advance. The player goes Idle straight after an
        // error, and the Idle handler below advances; doing it in both skipped
        // tracks in pairs and started two overlapping resources.
        player.on('error', error => {
            logger.error`[radio] player error on ${this.playlist[this.index]}: ${error.message}`;
        });

        player.on(AudioPlayerStatus.Idle, () => {
            this.playNext();
        });
    }

    /**
     * Catches the stalls no event reports: a player left Idle with a live
     * connection, which is silence that would otherwise last until a redeploy.
     */
    private startStallWatchdog(): void {
        if (this.stallTimer) return;

        this.stallTimer = setInterval(() => {
            if (this.stopped) return;

            if (!this.connection) {
                this.scheduleReconnect();
                return;
            }

            if (
                this.connection.state.status === VoiceConnectionStatus.Ready &&
                (!this.player || this.player.state.status === AudioPlayerStatus.Idle)
            ) {
                logger.warning`[radio] stalled while connected; restarting playback`;
                this.playNext();
            }
        }, RADIO_CONFIG.STALL_CHECK_INTERVAL_MS);
    }

    /* ------------------------------------------------------------------ *
     * Helpers / test seams
     * ------------------------------------------------------------------ */

    private reasonOf(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }

    /** Test-only: current track index. */
    public getIndex(): number {
        return this.index;
    }

    /** Test-only: loaded playlist. */
    public getPlaylist(): string[] {
        return this.playlist;
    }

    /** Test-only: reconnect attempts since the last successful Ready. */
    public getReconnectAttempts(): number {
        return this.reconnectAttempts;
    }

    /** Test-only: reset all state between cases. */
    public reset(): void {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.stallTimer) clearInterval(this.stallTimer);
        this.reconnectTimer = null;
        this.stallTimer = null;
        this.bot = null;
        this.connection = null;
        this.player = null;
        this.playlist = [];
        this.index = -1;
        this.reconnectAttempts = 0;
        this.stopped = false;
    }
}

export const getRadioService = (): RadioService => RadioService.getInstance();
export { RadioService };
