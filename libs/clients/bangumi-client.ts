/**
 * Pure HTTP transport for the Bangumi (bgm.tv) API.
 *
 * Per `spec/api_contracts.md` §3:
 *   - Base URL `https://api.bgm.tv` (legacy) and `https://api.bgm.tv/v0` (modern v0).
 *   - Required `User-Agent: Aniseekr/1.0 (https://github.com/Aniseekr)`.
 *   - Rate-limit channel `bangumi` (333ms min interval).
 *
 * Domain logic (UnifiedAnimeItem mapping, Chinese-title enrichment, AniList
 * delegation) lives in `bangumi-data-source.ts`. This client only knows how
 * to issue requests, normalize image URLs, and surface DataSourceError.
 */
import { rateLimiter } from '../services/rate-limiter';
import { DataSourceError } from '../services/data-sources/data-source-error';

const BANGUMI_BASE_URL = 'https://api.bgm.tv';
const BANGUMI_USER_AGENT = 'Aniseekr/1.0 (https://github.com/Aniseekr)';

// MARK: - Wire types (Bangumi v0 subject + search responses)

export interface BangumiImages {
  large?: string;
  common?: string;
  medium?: string;
  small?: string;
  grid?: string;
}

export interface BangumiTag {
  name: string;
  count?: number;
}

export interface BangumiRating {
  total?: number;
  count?: Record<string, number>;
  score?: number;
}

export interface BangumiCollection {
  wish?: number;
  collect?: number;
  doing?: number;
  on_hold?: number;
  dropped?: number;
}

export interface BangumiInfoboxField {
  key: string;
  value: string | { v?: string; k?: string }[];
}

/** Bangumi v0 subject — used for both detail and search results. */
export interface BangumiV0Subject {
  id: number;
  /** type 2 = anime, 1 = book, 3 = music, 6 = real */
  type?: number;
  name: string;
  name_cn: string;
  summary?: string;
  date?: string;
  platform?: string;
  eps?: number;
  total_episodes?: number;
  images?: BangumiImages;
  rating?: BangumiRating;
  collection?: BangumiCollection;
  tags?: BangumiTag[];
  infobox?: BangumiInfoboxField[];
  nsfw?: boolean;
}

export interface BangumiV0SearchResponse {
  data?: BangumiV0Subject[];
  total?: number;
}

export interface BangumiRelatedSubject extends BangumiV0Subject {
  relation: string;
}

/** Calendar weekday group response. */
export interface BangumiCalendarGroup {
  weekday?: {
    en?: string;
    cn?: string;
    ja?: string;
    id?: number;
  };
  items?: BangumiV0Subject[];
}

// MARK: - Helpers

/**
 * Rewrite `http://` to `https://` for any `bgm.tv` host (bgm.tv, lain.bgm.tv,
 * etc.). Non-bgm.tv URLs are returned unchanged. Empty / null input returns null.
 *
 * Per `edge_cases.md` §Bangumi Specific:
 *   - Image URL is `https://lain.bgm.tv/...` → keep as-is.
 *   - Image URL is data URI → pass through unchanged.
 */
export function normalizeBangumiImage(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  if (!url.startsWith('http://')) return url;
  // Inspect host portion of the URL.
  // Pattern: http://<host>/...
  const slashEnd = url.indexOf('/', 'http://'.length);
  const host = (
    slashEnd >= 0 ? url.slice('http://'.length, slashEnd) : url.slice('http://'.length)
  ).toLowerCase();
  if (host.endsWith('bgm.tv')) {
    return 'https://' + url.slice('http://'.length);
  }
  return url;
}

interface FetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Optional Bangumi access token; only required for write endpoints. */
  accessToken?: string;
  /** Skip rate-limiter wait (used by tests). */
  skipRateLimit?: boolean;
}

// MARK: - Client

export class BangumiClient {
  /**
   * GET `/v0/subjects/{id}` — full Bangumi v0 subject record (Chinese title,
   * tags, infobox aliases, rating distribution, ...).
   */
  static async getSubject(id: number | string, opts: FetchOptions = {}): Promise<BangumiV0Subject> {
    const result = await BangumiClient.request<BangumiV0Subject>(
      `/v0/subjects/${encodeURIComponent(String(id))}`,
      { method: 'GET' },
      opts
    );
    if (result === null) {
      throw new DataSourceError({
        code: 'NOT_FOUND',
        message: `Bangumi subject ${id} not found`,
        platform: 'bangumi',
      });
    }
    return result;
  }

  /**
   * POST `/v0/search/subjects` — Bangumi v0 keyword search filtered to anime
   * (type 2). Returns the raw search payload; caller decides how many to keep.
   */
  static async searchSubjects(
    keyword: string,
    page: number = 1,
    opts: FetchOptions = {}
  ): Promise<BangumiV0SearchResponse> {
    const limit = 20;
    const offset = Math.max(0, (page - 1) * limit);
    const path = `/v0/search/subjects?limit=${limit}&offset=${offset}`;
    const body = JSON.stringify({
      keyword,
      sort: 'match',
      filter: { type: [2] },
    });
    const result = await BangumiClient.request<BangumiV0SearchResponse>(
      path,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      },
      opts
    );
    return result ?? { data: [] };
  }

  /**
   * GET `/v0/subjects/{id}/subjects` — related subjects. The response mixes
   * anime, books, music and other entry types; callers should filter by type.
   */
  static async getRelatedSubjects(
    id: number | string,
    opts: FetchOptions = {}
  ): Promise<BangumiRelatedSubject[]> {
    const result = await BangumiClient.request<BangumiRelatedSubject[]>(
      `/v0/subjects/${encodeURIComponent(String(id))}/subjects`,
      { method: 'GET' },
      opts
    );
    return Array.isArray(result) ? result : [];
  }

  /** GET `/calendar` — current week's broadcasting anime. */
  static async getCalendar(opts: FetchOptions = {}): Promise<BangumiCalendarGroup[]> {
    const result = await BangumiClient.request<BangumiCalendarGroup[]>(
      '/calendar',
      { method: 'GET' },
      opts
    );
    return result ?? [];
  }

  // MARK: - Internal

  private static async request<T>(
    path: string,
    init: { method: string; headers?: Record<string, string>; body?: string },
    opts: FetchOptions
  ): Promise<T | null> {
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new DataSourceError({
        code: 'NETWORK_ERROR',
        message: 'fetch is not available in this environment',
        platform: 'bangumi',
      });
    }

    if (!opts.skipRateLimit) {
      await rateLimiter.waitForAvailability('bangumi');
    }

    const headers: Record<string, string> = {
      'User-Agent': BANGUMI_USER_AGENT,
      Accept: 'application/json',
      ...(init.headers ?? {}),
    };
    if (opts.accessToken) {
      headers.Authorization = `Bearer ${opts.accessToken}`;
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const timer =
      controller !== undefined && timeoutMs > 0
        ? setTimeout(() => controller.abort(), timeoutMs)
        : undefined;

    let response: Response;
    try {
      response = await fetchImpl(`${BANGUMI_BASE_URL}${path}`, {
        method: init.method,
        headers,
        body: init.body,
        signal: controller?.signal,
      });
    } catch (err) {
      if (timer !== undefined) clearTimeout(timer);
      throw DataSourceError.fromNetwork(err, 'bangumi');
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }

    if (response.status === 200 || response.status === 201 || response.status === 304) {
      try {
        return (await response.json()) as T;
      } catch (err) {
        throw DataSourceError.fromDecoding(err, 'bangumi');
      }
    }

    if (response.status === 404) {
      return null;
    }
    if (response.status === 429) {
      const retryAfter = parseRetryAfterMs(response.headers.get('Retry-After'));
      rateLimiter.registerCooldown('bangumi', retryAfter ?? 60_000);
      throw new DataSourceError({
        code: 'RATE_LIMITED',
        message: 'Bangumi rate limit exceeded',
        platform: 'bangumi',
      });
    }
    throw DataSourceError.fromHttpStatus(response.status, { platform: 'bangumi' });
  }
}

/**
 * Parse a `Retry-After` header value into milliseconds.
 * Accepts:
 *   - integer seconds: `Retry-After: 30` → 30 000 ms
 *   - HTTP-date: `Retry-After: Wed, 21 Oct 2026 07:28:00 GMT` → ms until that time
 * Returns `null` when the header is missing or unparseable.
 */
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
