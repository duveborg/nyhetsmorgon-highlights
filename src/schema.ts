import { z } from 'zod';

export const categories = [
  'nyheter',
  'intervju',
  'väder',
  'sport',
  'kultur',
  'nöje',
  'ekonomi',
  'hälsa',
  'livsstil',
  'mat',
  'övrigt',
] as const;

export const highlightSchema = z.object({
  start: z.number().nonnegative(),
  title: z.string().min(3).max(90),
  summary: z.string().min(5).max(300),
  category: z.enum(categories),
  // Start time of the earlier segment this one repeats (e.g. the half-hourly
  // news summary), or null.
  repeatOf: z.number().nonnegative().nullable(),
});
export type Highlight = z.infer<typeof highlightSchema>;

export const episodeSchema = z.object({
  videoId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string(),
  description: z.string().optional(),
  broadcastDateTime: z.string(),
  duration: z.number().positive(),
  expireDateTime: z.string().optional(),
  url: z.string().url(),
  generatedAt: z.string(),
  segments: z.array(highlightSchema),
});
export type Episode = z.infer<typeof episodeSchema>;
