// One-off: move a work/<videoId>/transcript.json (old layout) into transcripts/.
// Usage: node --experimental-strip-types scripts/migrate-transcript.ts <videoId>
import path from 'node:path';
import { config } from '../src/config.ts';
import { readJson } from '../src/episode.ts';
import type { PlaybackInfo } from '../src/steps/fetch.ts';
import type { Transcript } from '../src/transcribe/types.ts';
import { episodeMeta, writeTranscript } from '../src/transcripts.ts';

const videoId = process.argv[2]!;
const dir = path.join(config.workDir, videoId);
const t = readJson<Transcript>(path.join(dir, 'transcript.json'));
console.log(writeTranscript({ episode: episodeMeta(readJson<PlaybackInfo>(path.join(dir, 'playback.json'))), ...t }));
