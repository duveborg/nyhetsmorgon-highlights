import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.ts';
import { log } from '../log.ts';
import type { TranscribeBackend } from './types.ts';

type WhisperCppJson = {
  transcription: { offsets: { from: number; to: number }; text: string }[];
};

// whisper.cpp (`brew install whisper-cpp`) with KBLab's ggml weights, e.g.
// https://huggingface.co/KBLab/kb-whisper-large/resolve/main/ggml-model.bin
export const whisperCpp: TranscribeBackend = {
  name: 'whisper-cpp',
  async transcribe(wavFile, workDir) {
    const outBase = path.join(workDir, 'whisper-cpp');
    const args = [
      '-m', config.whisperModel,
      '-l', 'sv',
      '-t', String(config.whisperThreads),
      '-f', wavFile,
      '-oj',
      '-of', outBase,
      '-np',
      '-pp',
    ];
    log(`${config.whisperCli} ${args.join(' ')}`);
    await run(config.whisperCli, args);

    const json = JSON.parse(readFileSync(`${outBase}.json`, 'utf8')) as WhisperCppJson;
    return {
      backend: 'whisper-cpp',
      model: path.basename(config.whisperModel),
      language: 'sv',
      segments: json.transcription
        .map((s) => ({ start: s.offsets.from / 1000, end: s.offsets.to / 1000, text: s.text.trim() }))
        .filter((s) => s.text),
    };
  },
};

function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    // whisper-cli prints progress on stderr; pass it through.
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))));
  });
}
