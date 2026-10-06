// Usage: npm run pipeline -- <step> <videoId> [--force]
//   steps: fetch | transcribe | segment | publish | run (all of them)
import { log } from './log.ts';
import { fetchStep } from './steps/fetch.ts';
import { publishStep } from './steps/publish.ts';
import { segmentStep } from './steps/segment.ts';
import { transcribeStep } from './steps/transcribe.ts';

const steps: Record<string, (videoId: string, opts: { force: boolean }) => Promise<void>> = {
  fetch: fetchStep,
  transcribe: transcribeStep,
  segment: segmentStep,
  publish: publishStep,
};

const args = process.argv.slice(2);
const force = args.includes('--force');
const [step, videoId] = args.filter((a) => !a.startsWith('--'));

const order = Object.keys(steps);
const toRun = step === 'run' ? order : step && steps[step] ? [step] : undefined;
if (!toRun || !videoId) {
  console.error(`Usage: npm run pipeline -- <${[...order, 'run'].join('|')}> <videoId> [--force]`);
  process.exit(2);
}

try {
  for (const name of toRun) {
    log(`== ${name} ${videoId}`);
    await steps[name]!(videoId, { force });
  }
} catch (err) {
  log(`Error: ${(err as Error).stack ?? err}`);
  process.exit(1);
}
