import { existsSync } from 'node:fs';
import path from 'node:path';

if (existsSync('.env')) process.loadEnvFile('.env');

function env(name: string, fallback?: string): string {
  const value = process.env[name] || fallback;
  if (value === undefined) throw new Error(`Missing env var ${name} (see .env.example)`);
  return value;
}

export const config = {
  tv4RefreshToken: process.env.TV4_REFRESH_TOKEN || undefined,
  clientName: env('TV4_CLIENT_NAME', 'tv4-web'),
  clientVersion: env('TV4_CLIENT_VERSION', '5.5.0'),
  userAgent: env('USER_AGENT', 'nyhetsmorgon-highlights/0.1'),
  requestIntervalMs: Number(env('REQUEST_INTERVAL_MS', '250')),
  workDir: path.resolve(env('WORK_DIR', 'work')),
  stateDir: path.resolve('.state'),
  transcribeBackend: env('TRANSCRIBE_BACKEND', 'whisper-cpp'),
  whisperCli: env('WHISPER_CLI', 'whisper-cli'),
  whisperModel: path.resolve(env('WHISPER_MODEL', 'models/kb-whisper-large.bin')),
  whisperThreads: Number(env('WHISPER_THREADS', '8')),
  llmBackend: env('LLM_BACKEND', 'claude-cli'),
  llmModel: env('LLM_MODEL', 'sonnet'),
  claudeCli: env('CLAUDE_CLI', 'claude'),
  segmentChunkMinutes: Number(env('SEGMENT_CHUNK_MINUTES', '40')),
};
