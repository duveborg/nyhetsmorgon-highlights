import { readdirSync } from 'node:fs';
import path from 'node:path';
import { episodePaths, readJson, writeJson } from '../episode.ts';
import { log } from '../log.ts';
import { episodeSchema, type Episode, type Highlight } from '../schema.ts';
import { readTranscript } from '../transcripts.ts';

export const DATA_DIR = path.resolve('data/episodes');

// Writes the committed, public JSON for one episode. Contains no transcript
// text, only metadata and highlights.
export async function publishStep(videoId: string) {
  const meta = readTranscript(videoId).episode;
  const segments = readJson<Highlight[]>(episodePaths(videoId).segments);
  const date = meta.date;

  const episode: Episode = episodeSchema.parse({
    ...meta,
    url: `https://www.tv4play.se/video/${videoId}`,
    generatedAt: new Date().toISOString(),
    segments,
  });
  const file = path.join(DATA_DIR, `${date}.json`);
  writeJson(file, episode);
  log(`Published ${path.relative(process.cwd(), file)} (${segments.length} segments)`);
  writeIndex();
}

// data/episodes/index.json maps videoId -> date so the site knows which
// episodes have highlights without loading every file.
export function writeIndex() {
  const index: Record<string, string> = {};
  for (const name of readdirSync(DATA_DIR).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort()) {
    index[readJson<Episode>(path.join(DATA_DIR, name)).videoId] = name.replace('.json', '');
  }
  writeJson(path.join(DATA_DIR, 'index.json'), index);
}
