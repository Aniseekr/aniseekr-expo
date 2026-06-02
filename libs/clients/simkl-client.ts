// Pure HTTP transport for the Simkl REST API (https://api.simkl.com).
// Simkl requires both a `simkl-api-key` header AND a `client_id` query
// parameter on every request — this is documented as a Simkl quirk.

import { DataSourceError } from '../services/data-sources/data-source-error';
import { rateLimiter } from '../services/rate-limiter';

const SIMKL_BASE_URL = 'https://api.simkl.com';
const USER_AGENT = 'Aniseekr/1.0 (https://github.com/Aniseekr)';

/**
 * Resolve the Simkl client ID from the EXPO public env. Real production
 * requires the key; test environments lack it (we still fire requests with
 * an empty value so unit tests can run without secrets).
 */
function getSimklClientId(): string {
  return process.env.EXPO_PUBLIC_SIMKL_CLIENT_ID || '';
}

export interface SimklRequestOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Override the API key (mostly for tests). */
  clientId?: string;
}

function buildUrl(path: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(`${SIMKL_BASE_URL}${path}`);
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
 * Build a poster URL by wrapping a Simkl CDN path in the wsrv.nl proxy.
 * Posters are returned as path fragments like `12/12345_w.jpg`.
 *
 * Returns `null` for empty input.
 */
export function wrapSimklPoster(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    // Already absolute — wrap to take advantage of the wsrv CDN cache.
    return `https://wsrv.nl/?url=${path}`;
  }
  return `https://wsrv.nl/?url=https://simkl.in/posters/${path}`;
}

export class SimklClient {
  /**
   * Issue a GET request against the Simkl API. The client_id is added both
   * as a query param (Simkl's preferred location) and as a header (some
   * endpoints insist on the header even when the param is present).
   */
  static async get<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
    opts: SimklRequestOptions = {}
  ): Promise<T> {
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new DataSourceError({
        code: 'NETWORK_ERROR',
        message: 'fetch is not available in this environment',
        platform: 'simkl',
      });
    }

    await rateLimiter.waitForAvailability('simkl');

    const clientId = opts.clientId ?? getSimklClientId();
    const finalParams: Record<string, string | number | undefined> = {
      ...params,
      client_id: clientId,
    };

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const timer =
      controller !== undefined && timeoutMs > 0
        ? setTimeout(() => controller.abort(), timeoutMs)
        : undefined;

    const url = buildUrl(path, finalParams);
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
          'simkl-api-key': clientId,
        },
        signal: controller?.signal,
      });
    } catch (err) {
      if (timer !== undefined) clearTimeout(timer);
      throw DataSourceError.fromNetwork(err, 'simkl');
    }
    if (timer !== undefined) clearTimeout(timer);

    if (response.status === 429) {
      const cooldownMs = parseRetryAfter(response.headers.get('Retry-After'));
      rateLimiter.registerCooldown('simkl', cooldownMs);
      throw DataSourceError.fromHttpStatus(429, { platform: 'simkl' });
    }
    if (!response.ok) {
      throw DataSourceError.fromHttpStatus(response.status, { platform: 'simkl' });
    }

    try {
      return (await response.json()) as T;
    } catch (err) {
      throw DataSourceError.fromDecoding(err, 'simkl');
    }
  }
}
