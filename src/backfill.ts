// Processes every playable episode that has no highlights yet, oldest (soonest
// to expire) first. Three stages run concurrently, each one episode at a time:
// download (TV4) -> transcribe (GPU) -> segment + publish (LLM).
//
// Usage: npm run backfill -- [--exclude-today] [--skip=<videoId>,...] [--dry-run]
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { episodePaths, stockholmDate } from './episode.ts';
import { log } from './log.ts';
import { fetchStep } from './steps/fetch.ts';
import { DATA_DIR, publishStep } from './steps/publish.ts';
import { segmentStep } from './steps/segment.ts';
import { transcribeStep } from './steps/transcribe.ts';
import { listEpisodes, type ListedEpisode } from './tv4/episodes.ts';

const args = process.argv.slice(2);
const excludeToday = args.includes('--exclude-today');
const dryRun = args.includes('--dry-run');
const skip = new Set(args.find((a) => a.startsWith('--skip='))?.slice(7).split(',') ?? []);

const today = stockholmDate(new Date().toISOString());
const all = await listEpisodes();
const todo = all
  .filter((e) => !e.isLive)
  .filter((e) => !(excludeToday && e.date === today))
  .filter((e) => !skip.has(e.videoId))
  .filter((e) => !existsSync(path.join(DATA_DIR, `${e.date}.json`)))
  .sort((a, b) => a.playableUntil.localeCompare(b.playableUntil));

log(`${todo.length} episodes to process:`);
for (const e of todo) log(`  ${e.date} ${e.videoId} ${e.title} (expires ${e.playableUntil})`);
if (dryRun || todo.length === 0) process.exit(0);

const failed: string[] = [];
// Runs one step and reports success; never throws, so a failed episode doesn't
// stop the others.
const stage = (name: string, e: ListedEpisode, fn: () => Promise<void>) => {
  log(`[${e.date}] ${name}`);
  return fn().then(
    () => true,
    (err: Error) => {
      log(`[${e.date}] ${name} failed: ${err.message}`);
      failed.push(`${e.date} ${name}`);
      return false;
    },
  );
};

// Runs fn for each item strictly one after another; returns one promise per item.
function sequential<T>(items: T[], fn: (item: T, i: number) => Promise<boolean>): Promise<boolean>[] {
  let prev = Promise.resolve(true);
  return items.map((item, i) => (prev = prev.then(() => fn(item, i))));
}

// Three stages, each handling one episode at a time, while the other stages
// work on other episodes.
const downloaded = sequential(todo, (e) => stage('fetch', e, () => fetchStep(e.videoId)));
const transcribed = sequential(todo, async (e, i) => {
  if (!(await downloaded[i])) return false;
  const ok = await stage('transcribe', e, () => transcribeStep(e.videoId));
  // The transcript is committed; the WAV can be recreated from audio.m4a.
  if (ok) rmSync(episodePaths(e.videoId).wav, { force: true });
  return ok;
});
const published = sequential(todo, async (e, i) => {
  if (!(await transcribed[i])) return false;
  return (
    (await stage('segment', e, () => segmentStep(e.videoId))) &&
    (await stage('publish', e, () => publishStep(e.videoId)))
  );
});

await Promise.all(published);
if (failed.length) {
  log(`Done with ${failed.length} failures: ${failed.join(', ')}. Re-run to retry; finished steps are skipped.`);
  process.exit(1);
}
log(`Done: ${todo.length} episodes processed.`);
