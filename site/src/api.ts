import type { Episode as Highlights, Highlight } from '../../src/schema.ts';

export type { Highlights, Highlight };

// A highlight plus how long it runs: until the next segment starts, or until
// the end of the episode for the last one.
export type TimedHighlight = Highlight & { length: number };

export const withLengths = (h: Highlights): TimedHighlight[] => {
  const sorted = [...h.segments].sort((a, b) => a.start - b.start);
  return sorted.map((s, i) => ({ ...s, length: Math.max(0, (sorted[i + 1]?.start ?? h.duration) - s.start) }));
};

// Nyhetsmorgon has a single season on TV4 Play ("Säsong 2026"). Override with
// VITE_TV4_SEASON_ID if TV4 starts a new one.
const SEASON_ID = import.meta.env.VITE_TV4_SEASON_ID ?? 'd36753e4403fe5913e21';
const GRAPHQL_URL = 'https://nordic-gateway.tv4.a2d.tv/graphql';
const CLIENT_HEADERS = {
  'client-name': 'tv4-web',
  'client-version': import.meta.env.VITE_TV4_CLIENT_VERSION ?? '5.5.0',
};

export type TvEpisode = {
  id: string;
  title: string;
  slug: string;
  playableFrom: string;
  playableUntil?: string;
  duration?: string;
  synopsis?: string;
  imageUrl?: string;
};

const EPISODES_QUERY = `query NyhetsmorgonEpisodes($seasonId: ID!, $input: SeasonEpisodesInput!) {
  season(id: $seasonId) {
    episodes(input: $input) {
      items {
        id
        title
        slug
        playableFrom { isoString }
        playableUntil { isoString }
        duration { readableShort }
        synopsis { medium }
        images { main16x9 { sourceEncoded } }
      }
    }
  }
}`;

type EpisodesResponse = {
  data?: {
    season: {
      episodes: {
        items: {
          id: string;
          title: string;
          slug: string;
          playableFrom: { isoString: string };
          playableUntil?: { isoString: string } | null;
          duration?: { readableShort: string } | null;
          synopsis?: { medium?: string | null } | null;
          images?: { main16x9?: { sourceEncoded: string } | null } | null;
        }[];
      };
    } | null;
  };
  errors?: { message: string }[];
};

export async function fetchEpisodes(limit = 30): Promise<TvEpisode[]> {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...CLIENT_HEADERS },
    body: JSON.stringify({
      query: EPISODES_QUERY,
      variables: { seasonId: SEASON_ID, input: { limit, offset: 0, excludeUnplayable: true, sortOrder: 'DESC' } },
    }),
  });
  const json = (await res.json()) as EpisodesResponse;
  if (!res.ok || json.errors?.length || !json.data?.season) {
    throw new Error(json.errors?.[0]?.message ?? `TV4 svarade ${res.status}`);
  }
  return json.data.season.episodes.items.map((e) => ({
    id: e.id,
    title: e.title,
    slug: e.slug,
    playableFrom: e.playableFrom.isoString,
    playableUntil: e.playableUntil?.isoString,
    duration: e.duration?.readableShort,
    synopsis: e.synopsis?.medium || undefined,
    imageUrl: e.images?.main16x9?.sourceEncoded
      ? `https://imageproxy.a2d.tv/?width=320&source=${e.images.main16x9.sourceEncoded}`
      : undefined,
  }));
}

// videoId -> date of the published highlights file.
export async function fetchHighlightsIndex(): Promise<Record<string, string>> {
  // Missing before the first publish; treat anything unparsable as "no highlights".
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}episodes/index.json`);
    return res.ok ? await res.json() : {};
  } catch {
    return {};
  }
}

export async function fetchHighlights(date: string): Promise<Highlights> {
  const res = await fetch(`${import.meta.env.BASE_URL}episodes/${date}.json`);
  if (!res.ok) throw new Error(`Kunde inte ladda inslagen (${res.status})`);
  return res.json();
}

// Every published episode, newest first.
export async function fetchAllHighlights(index: Record<string, string>): Promise<Highlights[]> {
  const dates = [...new Set(Object.values(index))].sort().reverse();
  return Promise.all(dates.map(fetchHighlights));
}

// time=0 means "start over" in the TV4 player, so never send 0.
const timeParam = (seconds: number) => String(Math.max(1, Math.floor(seconds)));

export const tv4PlayUrl = (episode: Pick<TvEpisode, 'id' | 'slug'>, seconds?: number) =>
  `https://www.tv4play.se/video/${episode.id}/${episode.slug}${seconds !== undefined ? `?time=${timeParam(seconds)}` : ''}`;
