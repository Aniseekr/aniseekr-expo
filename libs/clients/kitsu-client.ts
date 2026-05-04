// Pure HTTP transport for the Kitsu JSON:API (https://kitsu.io/api/edge).
// Domain logic (mapping to UnifiedAnimeItem, fallback chains) lives in
// libs/services/data-sources/kitsu-data-source.ts. This module only handles
// rate limiting, header construction, and HTTP status → DataSourceError mapping.

import { DataSourceError } from '../services/data-sources/data-source-error';
import { rateLimiter } from '../services/rate-limiter';

const KITSU_BASE_URL = 'https://kitsu.io/api/edge';
const KITSU_ACCEPT = 'application/vnd.api+json';
const USER_AGENT = 'Aniseekr/1.0 (https://github.com/Aniseekr)';

export interface KitsuRequestOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Build a fully-qualified URL from a path and query params, encoding values
 * the way JSON:API expects (e.g. `filter[text]=foo`).
 */
function buildUrl(path: string, params: Record<string, string | number | undefined> = {}): string {
  const url = new URL(`${KITSU_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.append(key, String(value));
  }
  return url.toString();
}

/**
 * Parse a `Retry-After` header (seconds or HTTP-date) into milliseconds.
 * Falls back to 60 s when missing/unparseable per `edge_cases.md`.
 */
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

export class KitsuClient {
  /**
   * Issue a GET request against the Kitsu JSON:API. Returns the decoded JSON
   * payload (typically `{ data, included, meta, links }`).
   *
   * Throws `DataSourceError` for non-2xx responses or transport failures.
   */
  static async get<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
    opts: KitsuRequestOptions = {}
  ): Promise<T> {
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new DataSourceError({
        code: 'NETWORK_ERROR',
        message: 'fetch is not available in this environment',
        platform: 'kitsu',
      });
    }

    await rateLimiter.waitForAvailability('kitsu');

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
          Accept: KITSU_ACCEPT,
          'User-Agent': USER_AGENT,
        },
        signal: controller?.signal,
      });
    } catch (err) {
      if (timer !== undefined) clearTimeout(timer);
      throw DataSourceError.fromNetwork(err, 'kitsu');
    }
    if (timer !== undefined) clearTimeout(timer);

    if (response.status === 429) {
      const cooldownMs = parseRetryAfter(response.headers.get('Retry-After'));
      rateLimiter.registerCooldown('kitsu', cooldownMs);
      throw DataSourceError.fromHttpStatus(429, { platform: 'kitsu' });
    }
    if (!response.ok) {
      throw DataSourceError.fromHttpStatus(response.status, { platform: 'kitsu' });
    }

    try {
      return (await response.json()) as T;
    } catch (err) {
      throw DataSourceError.fromDecoding(err, 'kitsu');
    }
  }
}
