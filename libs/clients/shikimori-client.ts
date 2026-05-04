// Pure HTTP transport for the Shikimori REST API (https://shikimori.one/api).
// The Shikimori service rejects requests without a `User-Agent` header — see
// edge_cases.md "Shikimori Specific". Domain mapping lives in the data source.

import { DataSourceError } from '../services/data-sources/data-source-error';
import { rateLimiter } from '../services/rate-limiter';

const SHIKIMORI_BASE_URL = 'https://shikimori.one/api';
const SHIKIMORI_IMAGE_BASE = 'https://shikimori.one';
// Shikimori specifically requires a non-default UA. They block requests using
// generic clients (curl, etc.) with HTTP 403.
const USER_AGENT = 'Aniseekr/1.0';

export interface ShikimoriRequestOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function buildUrl(path: string, params: Record<string, string | number | undefined> = {}): string {
  const url = new URL(`${SHIKIMORI_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.append(key, String(value));
  }
  return url.toString();
}

function parseRetryAfter(headerValue: string | null): number {
  if (!headerValue) return 60_000;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.floor(seconds * 1_000);
  }
  const dateMs = Date.parse(headerValue);
  if (Number.isFinite(dateMs)) {
    const delta = dateMs - Date.now();
    return delta > 0 ? delta : 60_000;
  }
  return 60_000;
}

/**
 * Prefix a Shikimori-relative image path (e.g. `/uploads/preview/animes/1.jpg`)
 * with the Shikimori host. Returns `null` for empty input or paths whose URL
 * already contains `/missing/` (Shikimori's not-found placeholder).
 */
export function prefixShikimoriImage(rel: string | null | undefined): string | null {
  if (!rel) return null;
  if (rel.includes('/missing/')) return null;
  if (/^https?:\/\//.test(rel)) {
    return rel.includes('/missing/') ? null : rel;
  }
  return `${SHIKIMORI_IMAGE_BASE}${rel}`;
}

export class ShikimoriClient {
  static async get<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
    opts: ShikimoriRequestOptions = {}
  ): Promise<T> {
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new DataSourceError({
        code: 'NETWORK_ERROR',
        message: 'fetch is not available in this environment',
        platform: 'shikimori',
      });
    }

    await rateLimiter.waitForAvailability('shikimori');

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const timer =
      controller !== undefined && timeoutMs > 0
        ? setTimeout(() => controller.abort(), timeoutMs)
        : undefined;

    const url = buildUrl(path, params);
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
        },
        signal: controller?.signal,
      });
    } catch (err) {
      if (timer !== undefined) clearTimeout(timer);
      throw DataSourceError.fromNetwork(err, 'shikimori');
    }
    if (timer !== undefined) clearTimeout(timer);

    if (response.status === 429) {
      const cooldownMs = parseRetryAfter(response.headers.get('Retry-After'));
      rateLimiter.registerCooldown('shikimori', cooldownMs);
      throw DataSourceError.fromHttpStatus(429, { platform: 'shikimori' });
    }
    if (!response.ok) {
      throw DataSourceError.fromHttpStatus(response.status, {
        platform: 'shikimori',
      });
    }

    try {
      return (await response.json()) as T;
    } catch (err) {
      throw DataSourceError.fromDecoding(err, 'shikimori');
    }
  }
}
