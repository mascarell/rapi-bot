import { AudioPlayer, VoiceConnection } from "@discordjs/voice";

export interface VoiceConnectionData {
    connection: VoiceConnection;
    playlist: string[];
    player?: AudioPlayer;
    currentSongIndex?: number;
}