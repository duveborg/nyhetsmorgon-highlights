import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';

// Working files for one episode live in work/<videoId>/ (gitignored).
export function episodePaths(videoId: string) {
  const dir = path.join(config.workDir, videoId);
  return {
    dir,
    playback: path.join(dir, 'playback.json'),
    audio: path.join(dir, 'audio.m4a'),
    wav: path.join(dir, 'audio.wav'),
    segments: path.join(dir, 'segments.json'),
  };
}

export const ensureDir = (dir: string) => mkdirSync(dir, { recursive: true });

export function readJson<T>(file: string): T {
  if (!existsSync(file)) throw new Error(`Missing ${path.relative(process.cwd(), file)}; run the earlier step first`);
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

export function writeJson(file: string, data: unknown) {
  ensureDir(path.dirname(file));
  writeFileSync(`${file}.tmp`, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
}

// Episode date as shown on TV4 Play, i.e. the Stockholm calendar date.
export const stockholmDate = (iso: string) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date(iso));
