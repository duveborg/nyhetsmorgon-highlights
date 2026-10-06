import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.ts';
import { fmt } from '../download.ts';
import { episodePaths, readJson } from '../episode.ts';
import { log } from '../log.ts';
import type { TranscribeBackend } from '../transcribe/types.ts';
import { whisperCpp } from '../transcribe/whisper-cpp.ts';
import { episodeMeta, findTranscript, writeTranscript } from '../transcripts.ts';
import type { PlaybackInfo } from './fetch.ts';

const backends: Record<string, TranscribeBackend> = { 'whisper-cpp': whisperCpp };

export async function transcribeStep(videoId: string, { force = false } = {}) {
  const existing = findTranscript(videoId);
  if (!force && existing) {
    log(`Transcript already exists: ${path.relative(process.cwd(), existing)}`);
    return;
  }
  const p = episodePaths(videoId);
  if (!existsSync(p.wav)) throw new Error(`Missing ${p.wav}; run fetch first`);

  const backend = backends[config.transcribeBackend];
  if (!backend) throw new Error(`Unknown TRANSCRIBE_BACKEND ${config.transcribeBackend}`);

  const started = Date.now();
  const result = await backend.transcribe(p.wav, p.dir);
  const file = writeTranscript({
    episode: episodeMeta(readJson<PlaybackInfo>(p.playback)),
    ...result,
    createdAt: new Date().toISOString(),
  });
  const last = result.segments.at(-1);
  log(`Transcribed ${result.segments.length} lines up to ${fmt(last?.end ?? 0)} in ${fmt((Date.now() - started) / 1000)}`);
  log(`Wrote ${path.relative(process.cwd(), file)}`);
}
