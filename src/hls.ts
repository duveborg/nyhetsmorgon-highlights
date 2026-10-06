// Minimal HLS parsing: just enough for Unified Streaming VOD playlists.

const attr = (line: string, name: string) => line.match(new RegExp(`${name}="([^"]*)"`))?.[1];

export function audioPlaylistUrl(masterUrl: string, master: string): string {
  const media = master
    .split('\n')
    .filter((l) => l.startsWith('#EXT-X-MEDIA:') && l.includes('TYPE=AUDIO'));
  const uri = attr(media.find((l) => l.includes('DEFAULT=YES')) ?? media[0] ?? '', 'URI');
  if (!uri) throw new Error('No #EXT-X-MEDIA:TYPE=AUDIO with a URI in master playlist');
  return new URL(uri, masterUrl).href;
}

export type MediaPlaylist = {
  initUrl: string;
  segments: { url: string; duration: number }[];
  duration: number;
};

export function parseMediaPlaylist(playlistUrl: string, text: string): MediaPlaylist {
  const lines = text.split('\n').map((l) => l.trim());
  if (lines.some((l) => l.startsWith('#EXT-X-KEY'))) {
    throw new Error('Audio playlist is encrypted (EXT-X-KEY); not supported');
  }
  if (!lines.includes('#EXT-X-ENDLIST')) {
    throw new Error('Audio playlist has no EXT-X-ENDLIST; episode may still be live');
  }
  const map = lines.find((l) => l.startsWith('#EXT-X-MAP:'));
  const initUri = map && attr(map, 'URI');
  if (!initUri) throw new Error('Audio playlist has no #EXT-X-MAP init segment');

  const segments: MediaPlaylist['segments'] = [];
  let pending: number | undefined;
  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) pending = parseFloat(line.slice(8));
    else if (line && !line.startsWith('#') && pending !== undefined) {
      segments.push({ url: new URL(line, playlistUrl).href, duration: pending });
      pending = undefined;
    }
  }
  return {
    initUrl: new URL(initUri, playlistUrl).href,
    segments,
    duration: segments.reduce((sum, s) => sum + s.duration, 0),
  };
}
