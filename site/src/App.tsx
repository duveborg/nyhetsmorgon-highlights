import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { fetchEpisodes, fetchHighlights, fetchHighlightsIndex, tv4PlayUrl, withLengths, type Highlights, type TvEpisode } from './api.ts';
import { expiryLabel } from './format.ts';
import { isSearchUrl, Search } from './Search.tsx';
import { applyFilter, categoriesOf, Filters, SegmentRow, TV4_TAB, type Filter } from './segments.tsx';

// The selected episode lives in the URL (?avsnitt=<id>) so it can be shared.
const readSelected = () => new URLSearchParams(location.search).get('avsnitt') ?? undefined;
const writeSelected = (videoId: string) => history.replaceState(null, '', `?avsnitt=${videoId}`);

// Let modified clicks open links in a new tab as usual.
const isPlainClick = (e: MouseEvent) => !(e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0);

export function App() {
  const [episodes, setEpisodes] = useState<TvEpisode[]>();
  const [index, setIndex] = useState<Record<string, string>>();
  const [error, setError] = useState<string>();
  const [selectedId, setSelectedId] = useState(readSelected);
  const [searching, setSearching] = useState(isSearchUrl);

  useEffect(() => {
    Promise.all([fetchEpisodes(), fetchHighlightsIndex()])
      .then(([eps, idx]) => {
        setEpisodes(eps);
        setIndex(idx);
        setSelectedId((id) => id ?? eps.find((e) => idx[e.id])?.id ?? eps[0]?.id);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // Switching views pushes history entries, so back/forward must re-read the URL.
  useEffect(() => {
    const onPop = () => {
      setSearching(isSearchUrl());
      setSelectedId((id) => readSelected() ?? id);
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  const selected = episodes?.find((e) => e.id === selectedId);

  const selectEpisode = (id: string) => {
    setSelectedId(id);
    writeSelected(id);
  };

  const showEpisodes = (id = selectedId) => {
    history.pushState(null, '', id ? `?avsnitt=${id}` : location.pathname);
    if (id) setSelectedId(id);
    setSearching(false);
  };

  const showSearch = () => {
    history.pushState(null, '', '?sok');
    setSearching(true);
  };

  return (
    <div className={searching ? 'layout layout--search' : 'layout'}>
      <header className="header">
        <h1>Nyhetsmorgon</h1>
        <p>Hoppa direkt till inslagen i senaste avsnitten.</p>
        <nav className="views" aria-label="Vy">
          <a
            href={selectedId ? `?avsnitt=${selectedId}` : location.pathname}
            aria-current={searching ? undefined : 'page'}
            onClick={(e) => {
              if (!isPlainClick(e)) return;
              e.preventDefault();
              showEpisodes();
            }}
          >
            Avsnitt
          </a>
          <a
            href="?sok"
            aria-current={searching ? 'page' : undefined}
            onClick={(e) => {
              if (!isPlainClick(e)) return;
              e.preventDefault();
              showSearch();
            }}
          >
            Sök i alla avsnitt
          </a>
        </nav>
      </header>

      {searching ? (
        <main className="main">
          {error && <p className="error">Kunde inte hämta avsnitt: {error}</p>}
          {!error && (!episodes || !index) && <p className="muted">Hämtar avsnitt…</p>}
          {episodes && index && <Search episodes={episodes} index={index} onOpenEpisode={showEpisodes} />}
        </main>
      ) : (
        <>
          <nav className="episodes" aria-label="Avsnitt">
            {error && <p className="error">Kunde inte hämta avsnitt: {error}</p>}
            {!episodes && !error && <p className="muted">Hämtar avsnitt…</p>}
            <ul>
              {episodes?.map((e) => {
                const expiry = expiryLabel(e.playableUntil);
                return (
                  <li key={e.id}>
                    <button
                      className="episode"
                      aria-current={e.id === selectedId}
                      onClick={() => selectEpisode(e.id)}
                    >
                      {e.imageUrl && <img src={e.imageUrl} alt="" loading="lazy" width={96} height={54} />}
                      <span>
                        <span className="episode-title">{e.title}</span>
                        {e.duration && <span className="episode-meta">{e.duration}</span>}
                        {expiry && <span className="episode-meta expiry">{expiry}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <main className="main">
            {selected && (
              <>
                <div className="episode-header">
                  <h2>{selected.title}</h2>
                  <a href={tv4PlayUrl(selected)} target={TV4_TAB}>
                    Se hela avsnittet på TV4 Play ↗
                  </a>
                  {expiryLabel(selected.playableUntil) && (
                    <p className="episode-header-expiry expiry">
                      {expiryLabel(selected.playableUntil)} från TV4 Play
                    </p>
                  )}
                  {selected.synopsis && <p className="episode-header-synopsis">{selected.synopsis}</p>}
                </div>
                <Segments key={selected.id} date={index?.[selected.id]} episode={selected} />
              </>
            )}
          </main>
        </>
      )}
    </div>
  );
}

function Segments({ date, episode }: { date?: string; episode: TvEpisode }) {
  const [data, setData] = useState<Highlights>();
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState<Filter>({ query: '', showRepeats: false });

  useEffect(() => {
    if (date) fetchHighlights(date).then(setData, (e: Error) => setError(e.message));
  }, [date]);

  const segments = useMemo(() => (data ? withLengths(data) : []), [data]);
  const categories = useMemo(() => categoriesOf(segments), [segments]);
  const visible = useMemo(() => applyFilter(segments, filter), [segments, filter]);

  if (!date) return <p className="muted">Det finns inga inslag för det här avsnittet än.</p>;
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Laddar inslag…</p>;

  return (
    <section className="segments" aria-label="Inslag">
      <Filters
        filter={filter}
        onChange={setFilter}
        categories={categories}
        repeats={segments.filter((s) => s.repeatOf !== null).length}
        placeholder="Sök i inslagen"
      />

      {visible.length === 0 && <p className="muted">Inga inslag matchar.</p>}
      <ol>
        {visible.map((s) => (
          <SegmentRow key={s.start} segment={s} href={tv4PlayUrl(episode, s.start)} />
        ))}
      </ol>
    </section>
  );
}
