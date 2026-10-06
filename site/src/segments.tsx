import type { TimedHighlight } from './api.ts';
import { formatLength, formatTime } from './format.ts';

// All links open in the same named tab, so clicking through segments reuses
// one TV4 Play tab instead of opening a new one per click.
export const TV4_TAB = 'tv4play';

export type Filter = { query: string; category?: string; showRepeats: boolean };

export const applyFilter = (segments: TimedHighlight[], f: Filter) => {
  const q = f.query.trim().toLocaleLowerCase('sv');
  return segments.filter(
    (s) =>
      (f.showRepeats || s.repeatOf === null) &&
      (!f.category || s.category === f.category) &&
      (!q || `${s.title} ${s.summary}`.toLocaleLowerCase('sv').includes(q)),
  );
};

export const categoriesOf = (segments: TimedHighlight[]) =>
  [...new Set(segments.map((s) => s.category))].sort((a, b) => a.localeCompare(b, 'sv'));

export function Filters({
  filter,
  onChange,
  categories,
  repeats,
  placeholder,
  autoFocus,
}: {
  filter: Filter;
  onChange: (f: Filter) => void;
  categories: string[];
  repeats: number;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="filters">
      <input
        type="search"
        placeholder={placeholder}
        value={filter.query}
        onChange={(e) => onChange({ ...filter, query: e.target.value })}
        aria-label={placeholder}
        autoFocus={autoFocus}
      />
      <div className="chips" role="group" aria-label="Kategori">
        <button aria-pressed={!filter.category} onClick={() => onChange({ ...filter, category: undefined })}>
          Alla
        </button>
        {categories.map((c) => (
          <button
            key={c}
            aria-pressed={filter.category === c}
            onClick={() => onChange({ ...filter, category: filter.category === c ? undefined : c })}
          >
            {c}
          </button>
        ))}
      </div>
      {repeats > 0 && (
        <label className="toggle">
          <input
            type="checkbox"
            checked={filter.showRepeats}
            onChange={(e) => onChange({ ...filter, showRepeats: e.target.checked })}
          />
          Visa repriser ({repeats})
        </label>
      )}
    </div>
  );
}

// Without an href the episode is no longer on TV4 Play, so the row isn't a link.
export function SegmentRow({ segment: s, href }: { segment: TimedHighlight; href?: string }) {
  const content = (
    <>
      <time className="segment-time">{formatTime(s.start)}</time>
      <span className="segment-body">
        <span className="segment-title">{s.title}</span>
        <span className="segment-summary">{s.summary}</span>
        <span className="segment-tags">
          <span className="tag">{formatLength(s.length)}</span>
          <span className="tag">{s.category}</span>
          {s.repeatOf !== null && <span className="tag">repris från {formatTime(s.repeatOf)}</span>}
          {!href && <span className="tag">inte längre på TV4 Play</span>}
        </span>
      </span>
      {href && (
        <span className="segment-play" aria-hidden>
          ▶
        </span>
      )}
    </>
  );
  return (
    <li className="segment">
      {href ? (
        <a className="segment-link" href={href} target={TV4_TAB}>
          {content}
        </a>
      ) : (
        <div className="segment-link segment-link--expired">{content}</div>
      )}
    </li>
  );
}
