// Pure HTTP wrapper for the Anitabi public API (https://api.anitabi.cn).
// Domain logic (caching, fallback, ID resolution) lives in
// libs/services/pilgrimage/ — this module only knows how to make requests.

import type {
  AnitabiBangumi,
  RawAnitabiBangumiPoints,
  RawAnitabiPointsDetail,
} from '../services/pilgrimage/types';

const ANITABI_BASE_URL = 'https://api.anitabi.cn';
const USER_AGENT = 'Aniseekr/1.0';

/**
 * Local DataSourceError used by the Anitabi client.
 *
 * The global DataSourceError lives under libs/services/data-sources/, which is
 * owned by another agent and not yet present. To keep the pilgrimage module
 * self-contained we ship a compatible local copy that mirrors the spec
 * contract (see spec/architecture.md §7).
 */
export type AnitabiErrorCode =
  | 'NOT_FOUND'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'DECODING_ERROR'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'INVALID_ID'
  | 'UNKNOWN';

export class DataSourceError extends Error {
  readonly code: AnitabiErrorCode;
  readonly platform: 'anitabi';
  readonly cause?: unknown;
  constructor(code: AnitabiErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'DataSourceError';
    this.code = code;
    this.platform = 'anitabi';
    this.cause = cause;
  }
}

interface FetchOptions {
  /** Override fetch (used by tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Request timeout in ms. Defaults to 30 000. */
  timeoutMs?: number;
}

export class AnitabiClient {
  /**
   * GET /bangumi/{id}/lite — small payload with sample points.
   * Returns null when the anime has no pilgrimage entry (HTTP 404).
   */
  static async getLite(bangumiId: number, opts: FetchOptions = {}): Promise<AnitabiBangumi | null> {
    return AnitabiClient.request<AnitabiBangumi>(`/bangumi/${bangumiId}/lite`, opts);
  }

  /**
   * GET /bangumi/{id}/points — the COMPLETE point list for an anime.
   *
   * This is deliberately NOT `/points/detail`: that endpoint returns a
   * server-side-deduplicated subset (~22–80% of the real points — e.g. ぼっち
   * ざ ろっく returns 91 of 414) and exposes no paging param to widen it.
   * `/points` returns every point — its count matches the `pointsLength`
   * reported by `/lite` — wrapped in a `{ points: [...] }` object alongside
   * folder/theme metadata. {@link normalizeRawPoints} narrows the payload.
   *
   * Returns null when the anime has no pilgrimage entry (HTTP 404).
   */
  static async getPoints(
    bangumiId: number,
    opts: FetchOptions = {}
  ): Promise<RawAnitabiBangumiPoints | null> {
    return AnitabiClient.request<RawAnitabiBangumiPoints>(`/bangumi/${bangumiId}/points`, opts);
  }

  /**
   * GET /bangumi/{id}/points/detail?haveImage=true — server-deduplicated point
   * subset that, unlike `/points`, includes per-point `originURL` (the Google
   * Maps / blog link of the screenshot's source). Used as a side-channel to
   * enrich the `/points` payload with attribution links for CC BY-NC-SA 4.0
   * compliance.
   *
   * Returns null when the anime has no pilgrimage entry (HTTP 404).
   */
  static async getPointsDetail(
    bangumiId: number,
    opts: FetchOptions = {}
  ): Promise<RawAnitabiPointsDetail | null> {
    return AnitabiClient.request<RawAnitabiPointsDetail>(
      `/bangumi/${bangumiId}/points/detail?haveImage=true`,
      opts
    );
  }

  private static async request<T>(path: string, opts: FetchOptions): Promise<T | null> {
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new DataSourceError('NETWORK_ERROR', 'fetch is not available in this environment');
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const timer =
      controller !== undefined && timeoutMs > 0
        ? setTimeout(() => controller.abort(), timeoutMs)
        : undefined;

    let response: Response;
    try {
      response = await fetchImpl(`${ANITABI_BASE_URL}${path}`, {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
        signal: controller?.signal,
      });
    } catch (err) {
      if (timer !== undefined) clearTimeout(timer);
      throw new DataSourceError(
        'NETWORK_ERROR',
        `Failed to reach Anitabi: ${(err as Error).message}`,
        err
      );
    }
    if (timer !== undefined) clearTimeout(timer);

    if (response.status === 404) {
      return null;
    }
    if (response.status === 429) {
      throw new DataSourceError('RATE_LIMITED', 'Anitabi rate limit exceeded');
    }
    if (!response.ok) {
      throw new DataSourceError(
        response.status >= 500 ? 'SERVER_ERROR' : 'UNKNOWN',
        `Anitabi request failed: HTTP ${response.status}`
      );
    }

    try {
      return (await response.json()) as T;
    } catch (err) {
      throw new DataSourceError(
        'DECODING_ERROR',
        `Failed to decode Anitabi response: ${(err as Error).message}`,
        err
      );
    }
  }
}
