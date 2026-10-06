import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ensureDir, stockholmDate } from './episode.ts';
import type { PlaybackInfo } from './steps/fetch.ts';
import type { Transcript } from './transcribe/types.ts';

// Transcripts are committed in transcripts/<date>-<videoId>.json together with
// the episode metadata, so segment and publish can be re-run from a fresh
// clone after the episode has expired on TV4 Play. Kept out of data/, which is
// copied into the public site.
export const TRANSCRIPTS_DIR = path.resolve('transcripts');

export type EpisodeMeta = {
  videoId: string;
  date: string;
  title: string;
  description?: string;
  broadcastDateTime: string;
  duration: number;
  expireDateTime?: string;
};

export type StoredTranscript = { episode: EpisodeMeta } & Transcript;

export const episodeMeta = (p: PlaybackInfo): EpisodeMeta => ({
  videoId: p.videoId,
  date: stockholmDate(p.broadcastDateTime),
  title: p.title,
  description: p.description,
  broadcastDateTime: p.broadcastDateTime,
  duration: p.duration,
  expireDateTime: p.expireDateTime,
});

export function findTranscript(videoId: string): string | undefined {
  if (!existsSync(TRANSCRIPTS_DIR)) return undefined;
  const name = readdirSync(TRANSCRIPTS_DIR).find((n) => n.endsWith(`-${videoId}.json`));
  return name && path.join(TRANSCRIPTS_DIR, name);
}

export function readTranscript(videoId: string): StoredTranscript {
  const file = findTranscript(videoId);
  if (!file) throw new Error(`No transcript for ${videoId} in transcripts/; run transcribe first`);
  return JSON.parse(readFileSync(file, 'utf8')) as StoredTranscript;
}

// One transcript line per row keeps the file readable and the git diffs small.
export function writeTranscript(t: StoredTranscript): string {
  const { segments, ...rest } = t;
  const round = (n: number) => Math.round(n * 100) / 100;
  const rows = segments.map((s) => `    ${JSON.stringify({ start: round(s.start), end: round(s.end), text: s.text })}`);
  const json = JSON.stringify({ ...rest, segments: [] }, null, 2).replace(
    '"segments": []',
    `"segments": [\n${rows.join(',\n')}\n  ]`,
  );

  ensureDir(TRANSCRIPTS_DIR);
  const file = path.join(TRANSCRIPTS_DIR, `${t.episode.date}-${t.episode.videoId}.json`);
  writeFileSync(`${file}.tmp`, `${json}\n`);
  renameSync(`${file}.tmp`, file);
  return file;
}
