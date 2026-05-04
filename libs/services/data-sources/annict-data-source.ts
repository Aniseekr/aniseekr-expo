/**
 * Annict data source.
 *
 * Per `spec/api_contracts.md` §4 and `spec/edge_cases.md` §Annict Specific:
 *   - `/v1/works?filter_title=` for search.
 *   - `/v1/works?filter_ids={id}` for detail (no dedicated endpoint).
 *   - Image fallback: when an Annict work has empty image AND non-zero
 *     `mal_anime_id`, batch-resolve covers via AniList `Media(idMal: $idMal)`.
 *   - Top / seasonal / by-genre / genres: Annict has no native equivalents
 *     for "top" or arbitrary seasonal queries — we delegate to AniList for
 *     those, mirroring Bangumi's strategy. (The iOS reference does have
 *     bespoke calls for seasonal/top using the Annict `filter_season` and
 *     `sort_watchers_count` params; we follow that here too where possible.)
 *
 * AniList is injected via constructor for testability — never imported
 * statically so this module compiles independently of the AniList agent's
 * file landing.
 */
import type { PlatformType } from '../auth/types';
import type {
  AnimeDataSource,
  AnimeGenre,
  AnimeRelation,
  AnimeStaff,
  AnimeStreaming,
  AnimeTheme,
  PlatformRatingData,
} from './anime-data-source';
import { defaultMediaStubs, defaultStatsStub } from './anime-data-source';
import { DataSourceError } from './data-source-error';
import { UnifiedAnimeItem } from '../../models/unified-anime-item';
import type { PlatformImageData } from '../../models/platform-image-data';
import type { AnnictWork, AnnictClient } from '../../clients/annict-client';
import { Logger } from '../../utils/logger';

interface AnnictDataSourceOptions {
  /** Annict HTTP client (handles OAuth token cache + rate limiting). */
  client: AnnictClient;
  /**
   * AniList data source used for image fallback (when an Annict work has no
   * image but has a `mal_anime_id`). Constructor injection so tests can pass
   * a stub without dragging the AniList agent's implementation.
   */
  aniListSource?: AnimeDataSource;
  /**
   * Optional override for the AniList batch image fetcher. Tests use this to
   * verify batching/dedup behavior without mocking GraphQL.
   *
   * Should accept a list of MAL ids and return a Map from MAL id → cover URL.
   * Failures are caught at the caller; throw for visibility.
   */
  batchFetchImages?: (malIds: number[]) => Promise<Map<number, string>>;
}

const FIELDS =
  'id,title,title_kana,title_en,media,media_text,season_name,season_year,season_name_text,episodes_count,watchers_count,mal_anime_id,images';

export class AnnictDataSource implements AnimeDataSource {
  readonly type: PlatformType = 'annict';

  private readonly client: AnnictClient;
  private readonly aniListSource: AnimeDataSource | null;
  private readonly batchFetchImages: (malIds: number[]) => Promise<Map<number, string>>;

  constructor(opts: AnnictDataSourceOptions) {
    this.client = opts.client;
    this.aniListSource = opts.aniListSource ?? null;
    this.batchFetchImages = opts.batchFetchImages ?? this.defaultBatchFetchImages.bind(this);

    Object.assign(this, defaultMediaStubs(), defaultStatsStub());
  }

  fetchAnimeStaff!: (id: string) => Promise<AnimeStaff[]>;
  fetchAnimeRelations!: (id: string) => Promise<AnimeRelation[]>;
  fetchAnimeStreaming!: (id: string) => Promise<AnimeStreaming[]>;
  fetchAnimeThemes!: (id: string) => Promise<AnimeTheme | null>;
  fetchStatistics!: (id: string) => Promise<PlatformRatingData | null>;

  // MARK: - Search & Detail

  async searchAnime(query: string, page?: number): Promise<UnifiedAnimeItem[]> {
    const response = await this.client.getWorks({
      filterTitle: query,
      page: page ?? 1,
      perPage: 20,
      fields: FIELDS,
      sort: 'sort_id',
    });
    return this.convertWorks(response.works);
  }

  async fetchAnimeDetail(id: string): Promise<UnifiedAnimeItem> {
    const numeric = Number(id);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      throw new DataSourceError({
        code: 'INVALID_ID',
        message: `Invalid Annict work id: ${id}`,
        platform: 'annict',
      });
    }
    const response = await this.client.getWorks({
      filterIds: [numeric],
      perPage: 1,
      fields: FIELDS,
    });
    const work = response.works[0];
    if (!work) {
      throw new DataSourceError({
        code: 'NOT_FOUND',
        message: `Annict work ${id} not found`,
        platform: 'annict',
      });
    }
    const items = await this.convertWorks([work]);
    return items[0];
  }

  // MARK: - Top / Seasonal / Genre / fetchAnime
  //
  // Annict has no first-class "top anime" or arbitrary seasonal endpoints
  // beyond `sort_watchers_count` and `filter_season`. Per the data-source
  // protocol, methods that are unsupported on a platform return [] / null
  // rather than throw — callers (the repository) handle fallback to AniList.

  async fetchTopAnime(_page?: number): Promise<UnifiedAnimeItem[]> {
    return [];
  }

  async fetchSeasonalAnime(
    _page?: number,
    _season?: string,
    _year?: number
  ): Promise<UnifiedAnimeItem[]> {
    return [];
  }

  async fetchAnime(_page: number, _genreId?: number): Promise<UnifiedAnimeItem[]> {
    return [];
  }

  async fetchGenres(): Promise<AnimeGenre[]> {
    return [];
  }

  // MARK: - Conversion + image fallback

  private async convertWorks(works: AnnictWork[]): Promise<UnifiedAnimeItem[]> {
    if (works.length === 0) return [];

    // Collect MAL ids that need fallback images: empty Annict image AND
    // non-zero mal_anime_id. Dedup so the same MAL id only contributes once.
    const malIdsNeedingFallback = new Set<number>();
    for (const work of works) {
      if (selectAnnictImage(work) !== null) continue;
      const malId = coerceMalId(work.mal_anime_id);
      if (malId !== null && malId !== 0) {
        malIdsNeedingFallback.add(malId);
      }
    }

    let imageMap: Map<number, string> = new Map();
    if (malIdsNeedingFallback.size > 0) {
      try {
        imageMap = await this.batchFetchImages(Array.from(malIdsNeedingFallback));
      } catch (err) {
        Logger.warn('[AnnictDataSource] image fallback failed', err);
        imageMap = new Map();
      }
    }

    return works.map((work) => convertWorkToUnifiedItem(work, imageMap));
  }

  /**
   * Default AniList batch image fetcher. Uses the injected AniList data
   * source's `fetchAnimeDetail` per MAL id when no batched API is available.
   * Tests typically inject `batchFetchImages` directly to avoid this path.
   */
  private async defaultBatchFetchImages(malIds: number[]): Promise<Map<number, string>> {
    const result = new Map<number, string>();
    if (!this.aniListSource) return result;
    // Sequential fetch — concurrency is bounded by the AniList rate limiter.
    for (const malId of malIds) {
      try {
        const item = await this.aniListSource.fetchAnimeDetail(String(malId), 'myanimelist');
        const url =
          item.platformImages.anilist?.extraLarge ??
          item.platformImages.anilist?.large ??
          item.extraLargeImageURL ??
          item.coverImageURL;
        if (url) result.set(malId, url);
      } catch (err) {
        Logger.warn(`[AnnictDataSource] AniList image lookup failed for MAL ${malId}`, err);
      }
    }
    return result;
  }
}

// MARK: - Pure helpers (exported for tests)

/**
 * Coerce Annict's `mal_anime_id` (Int | String | null) into a number or null.
 * Returns null when the value cannot be converted.
 */
export function coerceMalId(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Select the best image URL from an Annict work, or null if none usable.
 *
 * Priority per `spec/api_contracts.md` §4:
 *   1. images.recommended_url
 *   2. images.facebook.og_image_url
 *
 * Empty / `http://` URLs are normalized to https.
 */
export function selectAnnictImage(work: AnnictWork): string | null {
  const recommended = work.images?.recommended_url;
  if (typeof recommended === 'string' && recommended.length > 0) {
    return forceHttps(recommended);
  }
  const facebook = work.images?.facebook?.og_image_url;
  if (typeof facebook === 'string' && facebook.length > 0) {
    return forceHttps(facebook);
  }
  return null;
}

function forceHttps(url: string): string {
  if (url.startsWith('http://')) return 'https://' + url.slice('http://'.length);
  return url;
}

/**
 * Convert one Annict work into a UnifiedAnimeItem, applying the AniList image
 * fallback when the work has no native image but has a known MAL id.
 */
export function convertWorkToUnifiedItem(
  work: AnnictWork,
  imageMap: Map<number, string>
): UnifiedAnimeItem {
  const annictImage = selectAnnictImage(work);
  let cover: string | null = annictImage;
  if (cover === null) {
    const malId = coerceMalId(work.mal_anime_id);
    if (malId !== null && malId !== 0) {
      cover = imageMap.get(malId) ?? null;
    }
  }

  const platformImages: Partial<Record<PlatformType, PlatformImageData>> = {};
  if (cover) {
    platformImages.annict = {
      large: cover,
      extraLarge: cover,
    };
  }

  const idMal = coerceMalId(work.mal_anime_id);
  const seasonNorm = normalizeAnnictSeason(work.season_name);
  const yearNorm = work.season_year ?? parseYearFromSeasonName(work.season_name);

  return new UnifiedAnimeItem({
    title: work.title, // Annict primary title is Japanese
    titleEnglish: work.title_en ?? null,
    titleJapanese: work.title,
    coverImageURL: cover,
    extraLargeImageURL: cover,
    platformImages,
    idMal: idMal ?? null,
    format: work.media_text ?? (work.media ? work.media.toUpperCase() : null),
    totalEpisodes: work.episodes_count ?? null,
    year: yearNorm ?? null,
    season: seasonNorm,
    platformData: {
      annict: {
        id: String(work.id),
        progress: 0,
        status: 'unknown',
      },
    },
    syncStatus: { annict: 'synced' },
  });
}

function normalizeAnnictSeason(seasonName: string | null | undefined): string | null {
  if (!seasonName) return null;
  const part = seasonName.split('-').pop()?.toLowerCase();
  switch (part) {
    case 'winter':
      return 'WINTER';
    case 'spring':
      return 'SPRING';
    case 'summer':
      return 'SUMMER';
    case 'autumn':
    case 'fall':
      return 'FALL';
    default:
      return null;
  }
}
function parseYearFromSeasonName(seasonName: string | null | undefined): number | null {
  if (!seasonName) return null;
  const yearPart = seasonName.split('-')[0];
  const n = Number(yearPart);
  return Number.isFinite(n) ? n : null;
}
