import { fetchJson, fetchText } from '../http.ts';
import { audioPlaylistUrl } from '../hls.ts';
import { getAccessToken } from './auth.ts';

export type Playback = {
  videoId: string;
  title: string;
  description?: string;
  broadcastDateTime: string;
  duration: number;
  expireDateTime?: string;
  manifestUrl: string;
};

type PlaybackResponse = {
  metadata: {
    title: string;
    description?: string;
    broadcastDateTime: string;
    duration: number;
    expireDateTime?: string;
    isDrmProtected: boolean;
  };
  playbackItem: { manifestUrl: string };
};

export async function getPlayback(videoId: string): Promise<Playback> {
  const params = new URLSearchParams({
    service: 'tv4play',
    device: 'browser',
    protocol: 'hls,dash',
    drm: 'widevine',
    browser: 'GoogleChrome',
    capabilities: 'live-drm-adstitch-2,yospace3,prism',
    preview: 'false',
  });
  const res = await fetchJson<PlaybackResponse>(
    `https://playback2.a2d.tv/play/${encodeURIComponent(videoId)}?${params}`,
    { headers: { Authorization: `Bearer ${await getAccessToken()}` } },
  );
  if (res.metadata.isDrmProtected) throw new Error(`Video ${videoId} is DRM protected`);
  const { title, description, broadcastDateTime, duration, expireDateTime } = res.metadata;
  return {
    videoId,
    title,
    description,
    broadcastDateTime,
    duration,
    expireDateTime,
    manifestUrl: res.playbackItem.manifestUrl,
  };
}

export async function resolveAudioPlaylist(manifestUrl: string): Promise<string> {
  return audioPlaylistUrl(manifestUrl, await fetchText(manifestUrl));
}
