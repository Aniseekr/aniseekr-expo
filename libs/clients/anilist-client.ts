/**
 * AniList GraphQL transport client.
 *
 * Pure HTTP — no domain mapping, no caching. Domain types live in
 * `libs/services/data-sources/anilist-data-source.ts`. This module owns:
 *   - rate-limit channel `anilist`
 *   - HTTP error → `DataSourceError` translation
 *   - GraphQL `errors[]` → `DataSourceError(SERVER_ERROR)` translation
 *
 * Spec: `spec/api_contracts.md` §1.
 */

import { DataSourceError } from '../services/data-sources/data-source-error';
import { rateLimiter } from '../services/rate-limiter';
import { Logger } from '../utils/logger';

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';

/**
 * Shape of every AniList GraphQL response. The server always returns either
 * `data` (success) or `errors` (server-side validation/runtime). Both can
 * appear together for partial responses; we treat any `errors` entry as
 * fatal so callers don't silently consume half-failed payloads.
 */
export interface AniListGraphQLResponse<T> {
  data?: T;
  errors?: {
    message: string;
    status?: number;
    locations?: unknown[];
  }[];
}

export interface AniListClientOptions {
  /** Optional bearer token for personalized fields (Viewer, MediaList). */
  accessToken?: string | null;
  /** Override fetch for tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
}

export interface AniListLegacyQueryOptions {
  includeAdult?: boolean;
}

// MARK: - Legacy response types kept for the existing `AnimeRepository`

export interface AniListAnime {
  id: number;
  idMal: number | null;
  title: {
    romaji: string;
    english: string | null;
    native: string | null;
  };
  coverImage: {
    large: string;
    extraLarge: string;
    color: string | null;
  };
  bannerImage: string | null;
  averageScore: number | null;
  popularity: number;
  description: string | null;
  format: string | null;
  episodes: number | null;
  duration: number | null;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
  genres: string[];
  tags: {
    name: string;
    rank: number;
    description: string | null;
    category: string | null;
    isMediaSpoiler?: boolean;
  }[];
  studios: {
    nodes: {
      name: string;
    }[];
  };
  startDate: {
    year: number | null;
    month: number | null;
    day: number | null;
  };
  nextAiringEpisode: {
    airingAt: number;
    episode: number;
  } | null;
  isAdult?: boolean | null;
}

interface AniListPage<T> {
  Page: {
    // Only present when the GraphQL query asks for it (e.g. getSeasonalAnimePage).
    pageInfo?: {
      total?: number;
      perPage?: number;
      currentPage?: number;
      lastPage?: number;
      hasNextPage?: boolean;
    };
    media: T[];
  };
}

interface GenreCollectionResponse {
  GenreCollection: string[];
}

const MEDIA_FRAGMENT = `
  fragment mediaFields on Media {
    id
    idMal
    title {
      romaji
      english
      native
    }
    coverImage {
      large
      extraLarge
      color
    }
    bannerImage
    averageScore
    meanScore
    popularity
    format
    episodes
    duration
    status
    season
    seasonYear
    genres
    tags {
      name
      rank
      description
      category
      isMediaSpoiler
    }
    studios(isMain: true) {
      nodes {
        name
      }
    }
    nextAiringEpisode {
      airingAt
      episode
    }
    isAdult
  }
`;

/**
 * Lightweight AniList GraphQL transport. Stateless aside from the optional
 * bearer token. Construct ad-hoc or share a single instance — there is no
 * connection pool or caching state to worry about.
 *
 * Methods do exactly one thing: send a query, return the typed `data`.
 * Higher-level orchestration (mapping, fallback, dedup, caching) belongs in
 * `AniListDataSource` and `AnimeRepository`.
 */
export class AniListClient {
  private fetchImpl: typeof fetch;
  private accessToken: string | null;

  constructor(options: AniListClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.accessToken = options.accessToken ?? null;
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  /** Test hook: replace fetch on this instance. */
  __setFetchForTests(fn: typeof fetch): void {
    this.fetchImpl = fn;
  }

  /**
   * Execute a GraphQL query against AniList.
   *
   * Throws `DataSourceError`:
   *   - HTTP 4xx/5xx via `DataSourceError.fromHttpStatus`
   *   - Network failures via `DataSourceError.fromNetwork`
   *   - JSON parse failures via `DataSourceError.fromDecoding`
   *   - GraphQL `errors[]` via a synthesized `SERVER_ERROR`
   */
  async query<T>(graphql: string, variables: Record<string, unknown> = {}): Promise<T> {
    await rateLimiter.waitForAvailability('anilist');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(ANILIST_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: graphql, variables }),
      });
    } catch (cause) {
      throw DataSourceError.fromNetwork(cause, 'anilist');
    }

    if (response.status === 429) {
      const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
      rateLimiter.registerCooldown('anilist', retryAfter ?? 60_000);
      throw DataSourceError.fromHttpStatus(429, {
        platform: 'anilist',
        message: 'AniList rate limited',
      });
    }

    if (!response.ok) {
      throw DataSourceError.fromHttpStatus(response.status, {
        platform: 'anilist',
        message: `AniList HTTP ${response.status}`,
      });
    }

    let json: AniListGraphQLResponse<T>;
    try {
      json = (await response.json()) as AniListGraphQLResponse<T>;
    } catch (cause) {
      throw DataSourceError.fromDecoding(cause, 'anilist');
    }

    if (json.errors && json.errors.length > 0) {
      const message = json.errors.map((e) => e.message).join('; ');
      Logger.warn('[AniListClient] GraphQL errors:', message);
      throw new DataSourceError({
        code: 'SERVER_ERROR',
        platform: 'anilist',
        message: `AniList GraphQL error: ${message}`,
      });
    }

    if (json.data === undefined) {
      throw DataSourceError.fromDecoding(
        new Error('AniList response missing data field'),
        'anilist'
      );
    }

    return json.data;
  }

  // MARK: - Legacy static facade
  //
  // The pre-existing AnimeRepository and a few UI hooks call statics like
  // `AniListClient.getTopAnime(...)`. We keep those wrappers here so the
  // legacy callers don't have to change while the repository is being
  // rewritten by another agent. New callers should construct an instance and
  // call `.query(...)` directly (or use `AniListDataSource`).

  private static defaultInstance: AniListClient | null = null;

  private static getDefaultInstance(): AniListClient {
    if (!AniListClient.defaultInstance) {
      AniListClient.defaultInstance = new AniListClient();
    }
    return AniListClient.defaultInstance;
  }

  static __setDefaultForTests(instance: AniListClient | null): void {
    AniListClient.defaultInstance = instance;
  }

  static async getTopAnime(
    page = 1,
    perPage = 20,
    options: AniListLegacyQueryOptions = {}
  ): Promise<AniListAnime[]> {
    const query = `
      query ($page: Int, $perPage: Int, $isAdult: Boolean) {
        Page(page: $page, perPage: $perPage) {
          media(sort: [POPULARITY_DESC], type: ANIME, isAdult: $isAdult) {
            ...mediaFields
            description
            startDate { year month day }
          }
        }
      }
      ${MEDIA_FRAGMENT}
    `;
    const data = await AniListClient.getDefaultInstance().query<AniListPage<AniListAnime>>(query, {
      page,
      perPage,
      ...adultQueryVariables(options),
    });
    return data.Page.media;
  }

  static async getTrendingAnime(
    page = 1,
    perPage = 20,
    options: AniListLegacyQueryOptions = {}
  ): Promise<AniListAnime[]> {
    const query = `
      query ($page: Int, $perPage: Int, $isAdult: Boolean) {
        Page(page: $page, perPage: $perPage) {
          media(sort: [TRENDING_DESC], type: ANIME, isAdult: $isAdult) {
            ...mediaFields
            description
            startDate { year month day }
          }
        }
      }
      ${MEDIA_FRAGMENT}
    `;
    const data = await AniListClient.getDefaultInstance().query<AniListPage<AniListAnime>>(query, {
      page,
      perPage,
      ...adultQueryVariables(options),
    });
    return data.Page.media;
  }

  static async getSeasonalAnime(
    season: string,
    year: number,
    page = 1,
    perPage = 20,
    options: AniListLegacyQueryOptions = {}
  ): Promise<AniListAnime[]> {
    const { media } = await AniListClient.getSeasonalAnimePage(
      season,
      year,
      page,
      perPage,
      options
    );
    return media;
  }

  /**
   * Same query as `getSeasonalAnime` but also returns `pageInfo` so callers can
   * paginate. Used by `AnimeRepository.getSeasonalAnime` to fetch the full
   * seasonal list (the single-page variant only returned 20 items, which made
   * the bangumi schedule miss most of the season).
   */
  static async getSeasonalAnimePage(
    season: string,
    year: number,
    page = 1,
    perPage = 50,
    options: AniListLegacyQueryOptions = {}
  ): Promise<{ media: AniListAnime[]; hasNextPage: boolean }> {
    const query = `
      query ($page: Int, $perPage: Int, $season: MediaSeason, $seasonYear: Int, $isAdult: Boolean) {
        Page(page: $page, perPage: $perPage) {
          pageInfo { hasNextPage }
          media(season: $season, seasonYear: $seasonYear, type: ANIME, isAdult: $isAdult, sort: [POPULARITY_DESC]) {
            ...mediaFields
            description
            startDate { year month day }
          }
        }
      }
      ${MEDIA_FRAGMENT}
    `;
    const data = await AniListClient.getDefaultInstance().query<AniListPage<AniListAnime>>(query, {
      page,
      perPage,
      season: season.toUpperCase(),
      seasonYear: year,
      ...adultQueryVariables(options),
    });
    return {
      media: data.Page.media,
      hasNextPage: data.Page.pageInfo?.hasNextPage ?? false,
    };
  }

  static async searchAnime(
    search: string,
    page = 1,
    perPage = 20,
    options: AniListLegacyQueryOptions = {}
  ): Promise<AniListAnime[]> {
    const query = `
      query ($page: Int, $perPage: Int, $search: String, $isAdult: Boolean) {
        Page(page: $page, perPage: $perPage) {
          media(search: $search, type: ANIME, isAdult: $isAdult, sort: [POPULARITY_DESC]) {
            ...mediaFields
            description
            startDate { year month day }
          }
        }
      }
      ${MEDIA_FRAGMENT}
    `;
    const data = await AniListClient.getDefaultInstance().query<AniListPage<AniListAnime>>(query, {
      page,
      perPage,
      search,
      ...adultQueryVariables(options),
    });
    return data.Page.media;
  }

  static async getAnimeByGenre(
    genre: string,
    page = 1,
    perPage = 20,
    options: AniListLegacyQueryOptions = {}
  ): Promise<AniListAnime[]> {
    const query = `
      query ($page: Int, $perPage: Int, $genre: String, $isAdult: Boolean) {
        Page(page: $page, perPage: $perPage) {
          media(genre: $genre, type: ANIME, isAdult: $isAdult, sort: [POPULARITY_DESC]) {
            ...mediaFields
            description
            startDate { year month day }
          }
        }
      }
      ${MEDIA_FRAGMENT}
    `;
    const data = await AniListClient.getDefaultInstance().query<AniListPage<AniListAnime>>(query, {
      page,
      perPage,
      genre,
      ...adultQueryVariables(options),
    });
    return data.Page.media;
  }

  static async getAnimeDetails(id: number): Promise<AniListAnime> {
    const query = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          ...mediaFields
          description
          startDate { year month day }
        }
      }
      ${MEDIA_FRAGMENT}
    `;
    const data = await AniListClient.getDefaultInstance().query<{ Media: AniListAnime }>(query, {
      id,
    });
    return data.Media;
  }

  static async getGenres(): Promise<string[]> {
    const query = `
      query {
        GenreCollection
      }
    `;
    const data = await AniListClient.getDefaultInstance().query<GenreCollectionResponse>(query);
    return data.GenreCollection;
  }
}

// MARK: - Helpers

function adultQueryVariables(options: AniListLegacyQueryOptions): { isAdult?: false } {
  return options.includeAdult === false ? { isAdult: false } : {};
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000;
  }
  // HTTP-date form: parse and compute delta.
  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    const delta = date - Date.now();
    return delta > 0 ? delta : null;
  }
  return null;
}
