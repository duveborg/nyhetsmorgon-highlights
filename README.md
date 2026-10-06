# Nyhetsmorgon Highlights

Daily segment highlights with timestamps for TV4's *Nyhetsmorgon*.

## Setup

```bash
npm install
cp .env.example .env   # then set TV4_REFRESH_TOKEN
```

### TV4 login token

The playback API requires a logged-in TV4 account (`LOGIN_REQUIRED` otherwise),
and the token endpoint only accepts `grant_type: refresh_token`. Seed it once:

1. Log in on tv4play.se and copy the session's refresh token into `TV4_REFRESH_TOKEN`.
2. The first run exchanges it and writes the rotated token to `.state/refresh_token`
   (gitignored). From then on only that file is used.
3. If TV4 rejects the token, set a fresh one in `.env` and delete `.state/refresh_token`.

## Spike

```bash
npm run spike -- <videoId> [seconds]   # prints audio playlist URL, saves work/<videoId>-spike.m4a
```

## Pipeline

```bash
npm run pipeline -- run <videoId>          # fetch → transcribe → segment → publish
npm run pipeline -- <step> <videoId> [--force]
npm run backfill -- --exclude-today        # every playable episode without highlights, oldest first
```

Each step skips work that's already done. Audio and intermediate files live in `work/<videoId>/`
(gitignored). Committed outputs:

- `transcripts/<date>-<videoId>.json`: the full transcript plus episode metadata. `segment` and
  `publish` only need this file, so highlights can be regenerated after the episode has expired
  on TV4 Play: `npm run pipeline -- segment <videoId> --force && npm run pipeline -- publish <videoId>`.
  Not part of the public site.
- `data/episodes/<date>.json` and `data/episodes/index.json`: the highlights the site serves.

## Site

```bash
npm run dev      # http://localhost:5173
npm run build    # static files in dist/
```

Fully static. The browser fetches the episode list straight from TV4's GraphQL gateway
(CORS is open) and loads highlights from `data/episodes/`. Each highlight links to
`https://www.tv4play.se/video/<id>/<slug>?time=<s>`, which the TV4 Play player reads as
the start position. Links open in one reused tab named `tv4play`.

`?avsnitt=<videoId>` selects an episode; `?sok=<query>&kategori=<c>` searches every published
episode (the browser loads all `data/episodes/<date>.json` files). Episodes TV4 no longer lists
are shown without links.

TV4 Play can't be embedded here: its login cookie is `SameSite=Lax`, so an iframe on any
non-tv4play.se host sees the viewer as logged out.
