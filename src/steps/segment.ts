import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { config } from '../config.ts';
import { episodePaths, readJson, writeJson } from '../episode.ts';
import { claudeCli } from '../llm/claude-cli.ts';
import type { LlmBackend } from '../llm/types.ts';
import { log } from '../log.ts';
import { categories, highlightSchema, type Highlight } from '../schema.ts';
import { readTranscript } from '../transcripts.ts';

const backends: Record<string, LlmBackend> = { 'claude-cli': claudeCli };

const OVERLAP_SECONDS = 300;
// Points each highlight slightly before the line where the topic starts.
const START_LEAD_SECONDS = 3;
// Highlights closer together than this are treated as duplicates.
const MIN_GAP_SECONDS = 10;

// What the LLM returns. Timestamps are copied verbatim from the transcript
// ("1:23:45") rather than converted to seconds, to avoid arithmetic slips.
const timestamp = z.string().regex(/^\d:\d{2}:\d{2}$/);
const llmResponseSchema = z.object({
  segments: z.array(
    z.object({
      start: timestamp,
      title: z.string(),
      summary: z.string(),
      category: z.enum(categories),
      repeatOf: timestamp.nullable(),
    }),
  ),
});
type LlmSegment = z.infer<typeof llmResponseSchema>['segments'][number];

const SYSTEM = `Du gör en körschema-lista över TV4:s morgonprogram Nyhetsmorgon (direktsänt, ca 4,5 timmar) från en transkribering, så att tittare kan hoppa direkt till början av varje del av programmet.

Ett inslag är ett helt programblock, inte ett enskilt ämne. Tänk "här börjar Nyheterna" eller "här börjar intervjun med X", inte varje fråga eller nyhet i blocket.

Regler:
- Nyhetssändningar (ungefär varje halvtimme, oftast med nyhetsuppläsaren, reportage och direktrapporter från reportrar) är ETT inslag var, från första nyheten tills programledarna i studion tar över igen. Titeln är "Nyheterna", summary listar de 2–4 största nyheterna. Väder och sport som läses direkt i anslutning till sändningen hör till samma inslag.
- En intervju, ett gästsamtal eller en panel är ETT inslag från påannonsen tills samtalet är slut, även om det tar upp flera ämnen eller fortsätter med tittarfrågor. Titeln nämner gästen och ämnet, t.ex. "Mouna Esmaeilzadeh om Nobelpriset i medicin".
- Fristående block som väder, sportsnack, matlagning eller ett reportage som sänds för sig blir ett eget inslag.
- Programledarnas korta prat mellan inslag, hälsningar, "efter pausen …", reklamavbrott, kanalpromos och trailers blir inga inslag.
- Om ett block (t.ex. ett reportage eller en intervju) sänds igen senare, sätt repeatOf till starttiden för första sändningen. Nyhetssändningar är aldrig repriser; sätt repeatOf till null för dem.
- start = tidsstämpeln, kopierad exakt från transkriberingen, för den rad där blocket börjar (programledarens påannons räknas). Hellre en rad för tidigt än för sent.
- title: svensk, kort (högst ca 60 tecken), specifik.
- summary: en kort mening på svenska (högst ca 25 ord).
- category: välj den bästa av ${categories.join(', ')}. Nyhetssändningar är alltid nyheter.
- Avslöja aldrig utfallet av Triss-skrapningar, tävlingar eller dragningar, varken i title eller summary: inga vinstsummor, inga vinnare och inte om någon vann. Beskriv bara vem som skrapar eller tävlar.
- Som riktmärke blir det 3–6 inslag per 40 minuter.
- Transkriberingen är maskingenererad och kan innehålla felhörda ord och namn. Rätta uppenbara fel i rubriker när sammanhanget gör det tydligt, men hitta inte på.`;

// Cached chunk results are keyed on the prompt, so editing it re-runs the LLM.
const PROMPT_HASH = createHash('sha256').update(SYSTEM).digest('hex').slice(0, 8);

export async function segmentStep(videoId: string, { force = false } = {}) {
  const p = episodePaths(videoId);
  if (!force && existsSync(p.segments)) {
    log(`Segments already exist: ${p.segments}`);
    return;
  }
  const transcript = readTranscript(videoId);
  const { duration } = transcript.episode;
  const backend = backends[config.llmBackend];
  if (!backend) throw new Error(`Unknown LLM_BACKEND ${config.llmBackend}`);

  const chunkSeconds = config.segmentChunkMinutes * 60;
  const found: Highlight[] = [];

  for (let from = 0, i = 0; from < duration; from += chunkSeconds, i++) {
    const to = Math.min(from + chunkSeconds, duration);
    const cacheFile = path.join(p.dir, 'segment-chunks', PROMPT_HASH, `${i}.json`);

    let raw: LlmSegment[];
    if (!force && existsSync(cacheFile)) {
      raw = readJson<LlmSegment[]>(cacheFile);
      log(`Chunk ${i} (${hms(from)}–${hms(to)}): cached, ${raw.length} segments`);
    } else {
      const lines = transcript.segments
        .filter((s) => s.end > from - OVERLAP_SECONDS && s.start < to + OVERLAP_SECONDS)
        .map((s) => `[${hms(s.start)}] ${s.text}`);
      const started = Date.now();
      const res = llmResponseSchema.parse(
        await backend.generate({ system: SYSTEM, prompt: chunkPrompt(from, to, lines, found), schema: z.toJSONSchema(llmResponseSchema) }),
      );
      // Only keep segments starting in this chunk's own range; the overlap is context.
      raw = res.segments.filter((s) => seconds(s.start) >= from && seconds(s.start) < to);
      writeJson(cacheFile, raw);
      log(`Chunk ${i} (${hms(from)}–${hms(to)}): ${raw.length} segments in ${Math.round((Date.now() - started) / 1000)}s`);
    }

    for (const s of raw) {
      found.push({
        start: Math.max(0, seconds(s.start) - START_LEAD_SECONDS),
        title: s.title.trim(),
        summary: s.summary.trim(),
        category: s.category,
        repeatOf: s.repeatOf === null ? null : Math.max(0, seconds(s.repeatOf) - START_LEAD_SECONDS),
      });
    }
  }

  const segments = validate(found, duration);
  writeJson(p.segments, segments);
  log(`Wrote ${segments.length} segments (${segments.filter((s) => s.repeatOf !== null).length} repeats) to ${p.segments}`);
}

function chunkPrompt(from: number, to: number, lines: string[], earlier: Highlight[]) {
  const earlierList = earlier.length
    ? earlier.map((s) => `[${hms(s.start + START_LEAD_SECONDS)}] (${s.category}) ${s.title}`).join('\n')
    : '(inga än)';
  return `Inslag som redan hittats tidigare i programmet (för att känna igen upprepningar):
${earlierList}

Nedan är transkriberingen från ${hms(Math.max(0, from - OVERLAP_SECONDS))} till ${hms(to + OVERLAP_SECONDS)}.
Lista bara inslag som BÖRJAR mellan ${hms(from)} och ${hms(to)}. Texten utanför det intervallet är bara sammanhang. Ett block som redan pågår vid ${hms(from)} (se listan ovan) ska inte listas igen.

${lines.join('\n')}`;
}

// Final checks: schema, ascending times within the episode, no duplicates,
// and repeatOf pointing at an actual earlier highlight.
function validate(found: Highlight[], duration: number): Highlight[] {
  const sorted = [...found].sort((a, b) => a.start - b.start);
  const out: Highlight[] = [];
  for (const s of sorted) {
    if (s.start >= duration) {
      log(`  dropping "${s.title}": starts after end of episode`);
      continue;
    }
    // Two starts within a few seconds: the earlier one barely lasts, so the
    // later one is the real segment.
    const prev = out.at(-1);
    if (prev && s.start - prev.start < MIN_GAP_SECONDS) {
      log(`  dropping "${prev.title}": only ${Math.round(s.start - prev.start)}s before "${s.title}"`);
      out.pop();
    }
    out.push({ ...s, repeatOf: s.repeatOf === null ? null : nearestEarlier(out, s) });
  }
  return z.array(highlightSchema).parse(out);
}

function nearestEarlier(earlier: Highlight[], s: Highlight): number | null {
  const candidates = earlier.filter((e) => e.start < s.start);
  const best = candidates.reduce<Highlight | undefined>(
    (b, e) => (!b || Math.abs(e.start - s.repeatOf!) < Math.abs(b.start - s.repeatOf!) ? e : b),
    undefined,
  );
  return best && Math.abs(best.start - s.repeatOf!) <= 60 ? best.start : null;
}

const hms = (t: number) => {
  const s = Math.floor(t);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const seconds = (ts: string) => {
  const [h, m, s] = ts.split(':').map(Number);
  return h! * 3600 + m! * 60 + s!;
};
