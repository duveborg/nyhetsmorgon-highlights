// Backend-neutral transcript format, cached as work/<videoId>/transcript.json.
export type TranscriptSegment = { start: number; end: number; text: string };

export type Transcript = {
  backend: string;
  model: string;
  language: string;
  createdAt: string;
  segments: TranscriptSegment[];
};

export interface TranscribeBackend {
  name: string;
  transcribe(wavFile: string, workDir: string): Promise<Omit<Transcript, 'createdAt'>>;
}
