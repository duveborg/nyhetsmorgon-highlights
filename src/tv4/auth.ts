import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.ts';
import { fetchJson, HttpError } from '../http.ts';
import { log } from '../log.ts';

const TOKEN_URL = 'https://auth.tv4.a2d.tv/v2/auth/token';
const tokenFile = () => path.join(config.stateDir, 'refresh_token');

type TokenResponse = { access_token: string; refresh_token: string; expires_in: number };

// Refreshed well before expiry so long runs (backfill) keep working.
const ACCESS_TOKEN_MAX_AGE_MS = 30 * 60 * 1000;
let cached: { token: string; at: number } | undefined;

// TV4 has no anonymous grant: the token endpoint only exchanges a refresh
// token from a logged-in session. Refresh tokens rotate on every exchange, so
// the new one is persisted before the access token is used. Reusing an old
// refresh token may revoke the whole session.
export async function getAccessToken(): Promise<string> {
  if (cached && Date.now() - cached.at < ACCESS_TOKEN_MAX_AGE_MS) return cached.token;
  return withRefreshLock(refresh);
}

async function refresh(): Promise<string> {
  const fromState = existsSync(tokenFile());
  const refreshToken = fromState ? readFileSync(tokenFile(), 'utf8').trim() : config.tv4RefreshToken;
  if (!refreshToken) {
    throw new Error('No TV4 refresh token. Set TV4_REFRESH_TOKEN in .env (see README).');
  }

  let res: TokenResponse;
  try {
    res = await fetchJson<TokenResponse>(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Name': config.clientName },
      body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    });
  } catch (err) {
    if (err instanceof HttpError && err.status >= 400 && err.status < 500) {
      throw new Error(
        `TV4 rejected the refresh token from ${fromState ? tokenFile() : 'TV4_REFRESH_TOKEN'} ` +
          `(HTTP ${err.status}). Log in on tv4play.se, put a fresh token in TV4_REFRESH_TOKEN ` +
          `and delete ${tokenFile()}.`,
      );
    }
    throw err;
  }

  mkdirSync(config.stateDir, { recursive: true, mode: 0o700 });
  const tmp = `${tokenFile()}.tmp`;
  writeFileSync(tmp, res.refresh_token, { mode: 0o600 });
  renameSync(tmp, tokenFile());
  log('Refreshed TV4 access token');

  cached = { token: res.access_token, at: Date.now() };
  return cached.token;
}

// Several pipeline processes may run at once (e.g. backfill plus a single
// episode). The token is read, exchanged and rewritten under a lock directory
// so no two processes ever send the same, already rotated, refresh token.
async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const lock = path.join(config.stateDir, 'refresh.lock');
  mkdirSync(config.stateDir, { recursive: true, mode: 0o700 });
  for (let waited = 0; ; waited += 200) {
    try {
      mkdirSync(lock);
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      // A crashed process can leave the lock behind; a refresh takes ~1 s.
      if (Date.now() - statSync(lock).mtimeMs > 60_000) rmSync(lock, { recursive: true, force: true });
      else if (waited > 120_000) throw new Error(`Timed out waiting for ${lock}`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  try {
    return await fn();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}
