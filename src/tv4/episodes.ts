import { config } from '../config.ts';
import { stockholmDate } from '../episode.ts';
import { fetchJson } from '../http.ts';

// Nyhetsmorgon has a single season on TV4 Play ("Säsong 2026").
const SEASON_ID = process.env.TV4_SEASON_ID || 'd36753e4403fe5913e21';

export type ListedEpisode = {
  videoId: string;
  title: string;
  date: string;
  playableUntil: string;
  duration: number;
  // True while the broadcast is still live (the VOD isn't complete yet).
  isLive: boolean;
};

const QUERY = `query($seasonId: ID!, $input: SeasonEpisodesInput!) {
  season(id: $seasonId) {
    episodes(input: $input) {
      items {
        id
        title
        isLiveContent
        liveEventEnd { isoString }
        playableFrom { isoString }
        playableUntil { isoString }
        duration { seconds }
      }
    }
  }
}`;

type Response = {
  data?: {
    season: {
      episodes: {
        items: {
          id: string;
          title: string;
          isLiveContent: boolean;
          liveEventEnd: { isoString: string } | null;
          playableFrom: { isoString: string };
          playableUntil: { isoString: string };
          duration: { seconds: number };
        }[];
      };
    } | null;
  };
  errors?: { message: string }[];
};

// Currently playable episodes, newest first.
export async function listEpisodes(): Promise<ListedEpisode[]> {
  const res = await fetchJson<Response>('https://nordic-gateway.tv4.a2d.tv/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'client-name': config.clientName,
      'client-version': config.clientVersion,
    },
    body: JSON.stringify({
      query: QUERY,
      variables: { seasonId: SEASON_ID, input: { limit: 100, offset: 0, excludeUnplayable: true, sortOrder: 'DESC' } },
    }),
  });
  if (res.errors?.length || !res.data?.season) {
    throw new Error(`TV4 GraphQL: ${res.errors?.[0]?.message ?? 'no season'}`);
  }
  return res.data.season.episodes.items.map((e) => ({
    videoId: e.id,
    title: e.title,
    date: stockholmDate(e.playableFrom.isoString),
    playableUntil: e.playableUntil.isoString,
    duration: e.duration.seconds,
    isLive: e.isLiveContent && (!e.liveEventEnd || new Date(e.liveEventEnd.isoString) > new Date()),
  }));
}
