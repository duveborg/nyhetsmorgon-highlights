import { config } from './config.ts';
import { log } from './log.ts';

export class HttpError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(url: string, status: number, body: string) {
    super(`HTTP ${status} for ${new URL(url).origin}${new URL(url).pathname}: ${body.slice(0, 300)}`);
    this.status = status;
    this.body = body;
  }
}

// Every request to TV4 goes through here: one at a time, at most one per
// REQUEST_INTERVAL_MS, with our User-Agent, and retried on 5xx/network errors.
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

export function politeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const run = async () => {
    const wait = lastRequestAt + config.requestIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    return fetchWithRetry(url, init);
  };
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 4): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    lastRequestAt = Date.now();
    try {
      const res = await fetch(url, {
        ...init,
        headers: { 'User-Agent': config.userAgent, ...init.headers },
      });
      if (res.status < 500 || attempt >= attempts) return res;
      log(`HTTP ${res.status}, retrying (${attempt}/${attempts - 1})`);
    } catch (err) {
      if (attempt >= attempts) throw err;
      log(`${(err as Error).message}, retrying (${attempt}/${attempts - 1})`);
    }
    await sleep(1000 * 2 ** attempt);
  }
}

export async function fetchOk(url: string, init?: RequestInit): Promise<Response> {
  const res = await politeFetch(url, init);
  if (!res.ok) throw new HttpError(url, res.status, await res.text());
  return res;
}

export const fetchText = async (url: string, init?: RequestInit) => (await fetchOk(url, init)).text();
export const fetchJson = async <T>(url: string, init?: RequestInit) =>
  (await fetchOk(url, init)).json() as Promise<T>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
