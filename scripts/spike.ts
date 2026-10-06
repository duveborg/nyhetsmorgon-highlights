// Phase 1 spike: videoId -> audio playlist URL -> first N seconds of audio.
// Usage: npm run spike -- <videoId> [seconds=300]
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.ts';
import { downloadAudio, fmt } from '../src/download.ts';
import { log } from '../src/log.ts';
import { getPlayback, resolveAudioPlaylist } from '../src/tv4/playback.ts';

const [videoId, seconds = '300'] = process.argv.slice(2);
if (!videoId) {
  console.error('Usage: npm run spike -- <videoId> [seconds]');
  process.exit(2);
}

try {
  const playback = await getPlayback(videoId);
  log(`${playback.title}, ${playback.broadcastDateTime}, ${fmt(playback.duration)}, expires ${playback.expireDateTime}`);
  const audioUrl = await resolveAudioPlaylist(playback.manifestUrl);
  console.log(audioUrl);

  mkdirSync(config.workDir, { recursive: true });
  const out = path.join(config.workDir, `${videoId}-spike.m4a`);
  const res = await downloadAudio(audioUrl, out, { maxSeconds: Number(seconds) });
  log(`Wrote ${out} (${fmt(res.seconds)}, ${res.segments} segments)`);
} catch (err) {
  log(`Error: ${(err as Error).message}`);
  process.exit(1);
}
