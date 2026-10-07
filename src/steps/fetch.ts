import { execFileSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import { downloadAudio, fmt } from '../download.ts';
import { ensureDir, episodePaths, writeJson } from '../episode.ts';
import { log } from '../log.ts';
import { getPlayback, resolveAudioPlaylist, type Playback } from '../tv4/playback.ts';

export type PlaybackInfo = Playback & { audioPlaylistUrl: string };

export async function fetchStep(videoId: string, { force = false } = {}) {
  const p = episodePaths(videoId);
  ensureDir(p.dir);

  if (force || !existsSync(p.audio)) {
    const playback = await getPlayback(videoId);
    const audioPlaylistUrl = await resolveAudioPlaylist(playback.manifestUrl);
    log(`${playback.title} ${playback.broadcastDateTime} (${fmt(playback.duration)})`);
    const { seconds } = await downloadAudio(audioPlaylistUrl, p.audio);
    // Right after a live broadcast the playback API can still report the live
    // window's length (seen 2026-10-07: 6:11:00 for 4:25:24 of audio), so the
    // audio we actually got is the episode's duration.
    writeJson(p.playback, { ...playback, duration: Math.round(seconds), audioPlaylistUrl } satisfies PlaybackInfo);
  } else {
    log(`Audio already downloaded: ${p.audio}`);
  }

  if (force || !existsSync(p.wav)) {
    log('Converting to 16 kHz mono WAV');
    toWav(p.audio, `${p.wav}.part`);
    renameSync(`${p.wav}.part`, p.wav);
  }
  log(`Fetch done: ${p.wav}`);
}

// afconvert ships with macOS; elsewhere fall back to ffmpeg.
function toWav(input: string, output: string) {
  if (process.platform === 'darwin') {
    execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', input, output], { stdio: 'inherit' });
  } else {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', output], { stdio: 'inherit' });
  }
}
