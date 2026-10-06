export const formatTime = (seconds: number) => {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export const formatLength = (seconds: number) => (seconds < 60 ? '<1 min' : `${Math.round(seconds / 60)} min`);

// "mån 5 okt" for a YYYY-MM-DD date. Noon avoids DST/timezone edge cases.
export const formatDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' });

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// Episodes stay on TV4 Play for about two weeks; warn during the last few days.
export function expiryLabel(playableUntil: string | undefined, now = new Date()) {
  if (!playableUntil) return;
  const days = Math.round((startOfDay(new Date(playableUntil)) - startOfDay(now)) / 86_400_000);
  if (days > 3) return;
  if (days <= 0) return 'Försvinner i dag';
  if (days === 1) return 'Försvinner i morgon';
  return `Försvinner om ${days} dagar`;
}
