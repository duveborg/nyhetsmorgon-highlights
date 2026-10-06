import { createWriteStream } from 'node:fs';
import { rename } from 'node:fs/promises';
import { once } from 'node:events';
import { fetchOk, fetchText } from './http.ts';
import { parseMediaPlaylist } from './hls.ts';
import { log } from './log.ts';

// Downloads an fMP4 audio playlist sequentially (init segment + media
// segments) into a single playable .m4a. Writes to a .part file and renames
// on success, so a finished file is never half-written.
export async function downloadAudio(
  playlistUrl: string,
  outFile: string,
  opts: { maxSeconds?: number } = {},
): Promise<{ seconds: number; segments: number }> {
  const playlist = parseMediaPlaylist(playlistUrl, await fetchText(playlistUrl));
  let segments = playlist.segments;
  if (opts.maxSeconds !== undefined) {
    let total = 0;
    segments = segments.filter((s) => (total += s.duration) - s.duration < opts.maxSeconds!);
  }
  const seconds = segments.reduce((sum, s) => sum + s.duration, 0);
  log(`Downloading ${segments.length}/${playlist.segments.length} segments (${fmt(seconds)} of ${fmt(playlist.duration)})`);

  const part = `${outFile}.part`;
  const out = createWriteStream(part);
  try {
    for (const [i, url] of [playlist.initUrl, ...segments.map((s) => s.url)].entries()) {
      const chunk = Buffer.from(await (await fetchOk(url)).arrayBuffer());
      if (!out.write(chunk)) await once(out, 'drain');
      if (i % 100 === 0 && i > 0) log(`  ${i}/${segments.length}`);
    }
  } finally {
    out.end();
    await once(out, 'close');
  }
  await rename(part, outFile);
  return { seconds, segments: segments.length };
}

export const fmt = (s: number) =>
  [Math.floor(s / 3600), Math.floor((s % 3600) / 60), Math.floor(s % 60)]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
