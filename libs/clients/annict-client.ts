/**
 * Pure HTTP transport for the Annict v1 API.
 *
 * Per `spec/api_contracts.md` §4:
 *   - Base URL `https://api.annict.com`.
 *   - Auth: bearer token; obtained via OAuth `client_credentials` flow.
 *   - Token cache: in-memory, refresh when expired with a 60s safety margin.
 *   - Rate-limit channel `annict` (500ms min interval).
 *
 * Domain logic (UnifiedAnimeItem mapping, AniList image fallback) lives in
 * `annict-data-source.ts`. This client only knows how to issue requests and
 * manage the OAuth token cache.
 */
import { rateLimiter } from '../services/rate-limiter';
import { DataSourceError } from '../services/data-sources/data-source-error';

export const ANNICT_BASE_URL = 'https://api.annict.com';
export const ANNICT_USER_AGENT = 'Aniseekr/1.0 (https://github.com/Aniseekr)';

// MARK: - Wire types

/**
 * Annict v1 work entry. Some fields are heterogeneous (e.g. `mal_anime_id` may
 * arrive as either an integer or a string), so we keep the parsed shape
 * permissive and let the data source coerce.
 */
export interface AnnictWorkImagesFacebook {
  og_image_url?: string | null;
}
export interface AnnictWorkImages {
  recommended_url?: string | null;
  facebook?: AnnictWorkImagesFacebook | null;
}

export interface AnnictWork {
  id: number;
  title: string;
  title_kana?: string | null;
  title_en?: string | null;
  media?: string | null;
  media_text?: string | null;
  season_name?: string | null;
  season_year?: number | null;
  season_name_text?: string | null;
  episodes_count?: number | null;
  watchers_count?: number | null;
  /** Wire value may arrive as Int or String — coerce to string here. */
  mal_anime_id?: number | string | null;
  images?: AnnictWorkImages | null;
}

export interface AnnictWorksResponse {
  works: AnnictWork[];
  total_count?: number;
  next_page?: number | null;
  prev_page?: number | null;
}

export interface AnnictOAuthTokenResponse {
  access_token: string;
  token_type?: string;
  /** Lifetime in seconds. Defaults to 3600 when absent. */
  expires_in?: number;
  scope?: string;
  created_at?: number;
}

interface AnnictClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Override `Date.now()` for deterministic token-expiry tests. */
  now?: () => number;
  /** Provide an OAuth bearer token directly (skip client-credentials flow). */
  staticToken?: string;
  /** Skip rate-limit waits (used by tests). */
  skipRateLimit?: boolean;
}

// MARK: - Client

/**
 * Token cache safety margin: when the wall clock is within `TOKEN_SAFETY_MS`
 * of the cached token's `expiresAt`, we treat it as expired and refresh.
 * Per `edge_cases.md` §Annict Specific.
 */
const TOKEN_SAFETY_MS = 60_000;

interface CachedToken {
  value: string;
  /** Wall-clock timestamp (ms) at which the token becomes invalid. */
  expiresAt: number;
}

export class AnnictClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private readonly staticToken: string | null;
  private readonly skipRateLimit: boolean;
  private cachedToken: CachedToken | null = null;

  constructor(opts: AnnictClientOptions = {}) {
    const candidate = opts.fetchImpl ?? globalThis.fetch;
    if (typeof candidate !== 'function') {
      throw new DataSourceError({
        code: 'NETWORK_ERROR',
        message: 'fetch is not available in this environment',
        platform: 'annict',
      });
    }
    this.fetchImpl = candidate.bind(globalThis);
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.now = opts.now ?? Date.now;
    this.staticToken = opts.staticToken ?? null;
    this.skipRateLimit = opts.skipRateLimit ?? false;
  }

  /** Force a token refresh on the next request. */
  invalidateToken(): void {
    this.cachedToken = null;
  }

  /**
   * GET `/v1/works`. Pass `filter_title` for keyword search, `filter_ids` for
   * id lookup, and pagination via `page` / `per_page`.
   */
  async getWorks(params: {
    filterTitle?: string;
    filterIds?: (number | string)[];
    page?: number;
    perPage?: number;
    sort?: string;
    fields?: string;
  }): Promise<AnnictWorksResponse> {
    const query = new URLSearchParams();
    if (params.fields) query.set('fields', params.fields);
    if (params.filterTitle !== undefined && params.filterTitle.length > 0) {
      query.set('filter_title', params.filterTitle);
    }
    if (params.filterIds && params.filterIds.length > 0) {
      query.set('filter_ids', params.filterIds.map(String).join(','));
    }
    if (params.page !== undefined) query.set('page', String(params.page));
    if (params.perPage !== undefined) {
      query.set('per_page', String(params.perPage));
    }
    if (params.sort) query.set(params.sort, 'desc');

    const path = `/v1/works?${query.toString()}`;
    return this.requestJSON<AnnictWorksResponse>(path);
  }

  /**
   * POST `/oauth/token` with `grant_type=client_credentials`.
   *
   * Returns the raw token payload. Caches it internally with a 60s safety
   * margin so subsequent `getWorks` calls reuse the same bearer token.
   */
  async obtainToken(clientId: string, clientSecret: string): Promise<AnnictOAuthTokenResponse> {
    if (!clientId || !clientSecret) {
      throw new DataSourceError({
        code: 'UNAUTHORIZED',
        message: 'Annict client credentials are missing',
        platform: 'annict',
      });
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString();

    if (!this.skipRateLimit) {
      await rateLimiter.waitForAvailability('annict');
    }

    let response: Response;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timer =
      controller !== undefined && this.timeoutMs > 0
        ? setTimeout(() => controller.abort(), this.timeoutMs)
        : undefined;

    try {
      response = await this.fetchImpl(`${ANNICT_BASE_URL}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': ANNICT_USER_AGENT,
        },
        body,
        signal: controller?.signal,
      });
    } catch (err) {
      if (timer !== undefined) clearTimeout(timer);
      throw DataSourceError.fromNetwork(err, 'annict');
    }
    if (timer !== undefined) clearTimeout(timer);

    if (!response.ok) {
      throw DataSourceError.fromHttpStatus(response.status, { platform: 'annict' });
    }

    let parsed: AnnictOAuthTokenResponse;
    try {
      parsed = (await response.json()) as AnnictOAuthTokenResponse;
    } catch (err) {
      throw DataSourceError.fromDecoding(err, 'annict');
    }

    const expiresInMs = (parsed.expires_in ?? 3600) * 1000;
    this.cachedToken = {
      value: parsed.access_token,
      expiresAt: this.now() + expiresInMs,
    };

    return parsed;
  }

  /**
   * Set OAuth credentials so the client can lazily mint a token when an API
   * call needs one. Lives on the instance so multiple data sources can share
   * a client without leaking credentials globally.
   */
  setClientCredentials(clientId: string, clientSecret: string): void {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }
  private clientId = '';
  private clientSecret = '';

  /**
   * Returns a valid bearer token. Reuses the cached token when within
   * `expiresAt - TOKEN_SAFETY_MS`; otherwise mints a new one via
   * `client_credentials`.
   *
   * If the constructor received `staticToken`, the static token is always
   * returned without contacting `/oauth/token` (used by tests / personal token).
   */
  async getAccessToken(): Promise<string> {
    if (this.staticToken) return this.staticToken;
    const cached = this.cachedToken;
    if (cached && cached.expiresAt - TOKEN_SAFETY_MS > this.now()) {
      return cached.value;
    }
    if (!this.clientId || !this.clientSecret) {
      throw new DataSourceError({
        code: 'UNAUTHORIZED',
        message:
          'Annict client credentials not set. Call setClientCredentials before using Annict APIs.',
        platform: 'annict',
      });
    }
    const fresh = await this.obtainToken(this.clientId, this.clientSecret);
    return fresh.access_token;
  }

  // MARK: - Internals

  private async requestJSON<T>(path: string): Promise<T> {
    if (!this.skipRateLimit) {
      await rateLimiter.waitForAvailability('annict');
    }
    const token = await this.getAccessToken();
    const url = `${ANNICT_BASE_URL}${path}`;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timer =
      controller !== undefined && this.timeoutMs > 0
        ? setTimeout(() => controller.abort(), this.timeoutMs)
        : undefined;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': ANNICT_USER_AGENT,
          Authorization: `Bearer ${token}`,
        },
        signal: controller?.signal,
      });
    } catch (err) {
      if (timer !== undefined) clearTimeout(timer);
      throw DataSourceError.fromNetwork(err, 'annict');
    }
    if (timer !== undefined) clearTimeout(timer);

    if (response.status === 401 || response.status === 403) {
      // Server rejected the token — drop the cache so the next call refreshes.
      this.invalidateToken();
      throw DataSourceError.fromHttpStatus(response.status, { platform: 'annict' });
    }
    if (response.status === 404) {
      throw DataSourceError.fromHttpStatus(404, { platform: 'annict' });
    }
    if (response.status === 429) {
      const retryAfter = parseRetryAfterMs(response.headers.get('Retry-After'));
      rateLimiter.registerCooldown('annict', retryAfter ?? 60_000);
      throw new DataSourceError({
        code: 'RATE_LIMITED',
        message: 'Annict rate limit exceeded',
        platform: 'annict',
      });
    }
    if (!response.ok) {
      throw DataSourceError.fromHttpStatus(response.status, { platform: 'annict' });
    }

    try {
      return (await response.json()) as T;
    } catch (err) {
      throw DataSourceError.fromDecoding(err, 'annict');
    }
  }
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (trimmed.length === 0) return null;
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber)) {
    return Math.max(0, asNumber * 1000);
  }
  const ts = Date.parse(trimmed);
  if (Number.isFinite(ts)) {
    return Math.max(0, ts - Date.now());
  }
  return null;
}
