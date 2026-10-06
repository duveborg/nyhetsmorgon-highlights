import { useEffect, useMemo, useState } from 'react';
import { fetchAllHighlights, tv4PlayUrl, withLengths, type Highlights, type TvEpisode } from './api.ts';
import { expiryLabel, formatDate } from './format.ts';
import { applyFilter, categoriesOf, Filters, SegmentRow, type Filter } from './segments.tsx';

// The search lives in the URL (?sok=<query>&kategori=<c>&repriser=1) so it can be shared.
export const isSearchUrl = () => new URLSearchParams(location.search).has('sok');

const readFilter = (): Filter => {
  const p = new URLSearchParams(location.search);
  return { query: p.get('sok') ?? '', category: p.get('kategori') ?? undefined, showRepeats: p.has('repriser') };
};

const writeFilter = (f: Filter) => {
  const p = new URLSearchParams({ sok: f.query });
  if (f.category) p.set('kategori', f.category);
  if (f.showRepeats) p.set('repriser', '1');
  history.replaceState(null, '', `?${p}`);
};

export function Search({
  episodes,
  index,
  onOpenEpisode,
}: {
  episodes: TvEpisode[];
  index: Record<string, string>;
  onOpenEpisode: (videoId: string) => void;
}) {
  const [all, setAll] = useState<Highlights[]>();
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState(readFilter);

  useEffect(() => {
    fetchAllHighlights(index).then(setAll, (e: Error) => setError(e.message));
  }, [index]);

  const timed = useMemo(() => all?.map((h) => ({ h, segments: withLengths(h) })), [all]);
  const categories = useMemo(() => categoriesOf(timed?.flatMap((t) => t.segments) ?? []), [timed]);
  const repeats = useMemo(
    () => timed?.reduce((n, t) => n + t.segments.filter((s) => s.repeatOf !== null).length, 0) ?? 0,
    [timed],
  );
  const groups = useMemo(
    () =>
      timed?.map(({ h, segments }) => ({ h, segments: applyFilter(segments, filter) })).filter((g) => g.segments.length),
    [timed, filter],
  );

  // Only episodes TV4 still lists are playable; the rest have expired.
  const tvById = useMemo(() => new Map(episodes.map((e) => [e.id, e])), [episodes]);

  const changeFilter = (f: Filter) => {
    setFilter(f);
    writeFilter(f);
  };

  if (error) return <p className="error">{error}</p>;
  if (!groups) return <p className="muted">Laddar inslag…</p>;

  const hits = groups.reduce((n, g) => n + g.segments.length, 0);

  return (
    <section className="segments" aria-label="Sökresultat">
      <Filters
        filter={filter}
        onChange={changeFilter}
        categories={categories}
        repeats={repeats}
        placeholder="Sök i alla avsnitt"
        autoFocus
      />
      <p className="muted result-count">
        {hits === 0 ? 'Inga inslag matchar.' : `${hits} inslag i ${groups.length} avsnitt`}
      </p>

      {groups.map(({ h, segments }) => {
        const tv = tvById.get(h.videoId);
        const expiry = tv ? expiryLabel(tv.playableUntil) : 'Inte längre på TV4 Play';
        return (
          <div key={h.date} className="result-group">
            <h3 className="result-heading">
              <span className="result-date">{formatDate(h.date)}</span>
              {expiry && <span className="expiry">{expiry}</span>}
              {tv && (
                <a
                  href={`?avsnitt=${tv.id}`}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                    e.preventDefault();
                    onOpenEpisode(tv.id);
                  }}
                >
                  Visa avsnittet
                </a>
              )}
            </h3>
            <ol>
              {segments.map((s) => (
                <SegmentRow key={s.start} segment={s} href={tv && tv4PlayUrl(tv, s.start)} />
              ))}
            </ol>
          </div>
        );
      })}
    </section>
  );
}
