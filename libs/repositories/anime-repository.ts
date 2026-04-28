/**
 * AnimeRepository — orchestrates the seven anime data sources behind a single
 * unified surface. Mirrors the iOS reference at
 * `aniseeker/Data/Repositories/AnimeRepository.swift`.
 *
 * Responsibilities:
 *   - source resolution (preferred → browseSource → AniList default)
 *   - QueryClient request deduplication + 5-minute stale time
 *   - disk-cache (1-hour) for seasonal lists
 *   - cancellation when the user switches browse source mid-flight
 *   - genres fallback to AniList
 *   - cross-platform media fallback to Jikan when current source returns []
 *   - parallel multi-platform ratings (MAL + Bangumi + AniList)
 *
 * The legacy `static` facade (getTopAnime, getSeasonalAnime, searchAnime,
 * getAnimeByGenre, getAnimeDetails, getGenres, rateAnime, getCollection,
 * getUserStats, mapAnimeToPhoto) is preserved as thin delegators on top of
 * a singleton instance so existing UI keeps working without changes.
 */

import type { Anime, Genre, Photo } from '../../components/rate/types';
import { AniListClient, type AniListAnime } from '../clients/anilist-client';
import { LocalDB } from '../db';
import type { UnifiedAnimeItem } from '../models/unified-anime-item';
import type { PlatformImageData } from '../models/platform-image-data';
import type { PlatformType } from '../services/auth/types';
import { CacheService } from '../services/cache-service';
import {
  type AnimeDataSource,
  type AnimeGenre,
  type AnimeRelation,
  type AnimeStaff,
  type AnimeStreaming,
  type AnimeTheme,
  type PlatformRatingData,
} from '../services/data-sources/anime-data-source';
import { AniListDataSource } from '../services/data-sources/anilist-data-source';
import { AnnictDataSource } from '../services/data-sources/annict-data-source';
import { BangumiDataSource } from '../services/data-sources/bangumi-data-source';
import { JikanDataSource } from '../services/data-sources/jikan-data-source';
import { KitsuDataSource } from '../services/data-sources/kitsu-data-source';
import { ShikimoriDataSource } from '../services/data-sources/shikimori-data-source';
import { SimklDataSource } from '../services/data-sources/simkl-data-source';
import { dataSourceConfig } from '../services/data-source-config';
import { queryClient, type QueryKeyObject } from '../services/query-client';
import { idMappingService } from '../services/sync/id-mapping-service';
import { AnnictClient } from '../clients/annict-client';
import { Logger } from '../utils/logger';
import { achievementService } from '../services/achievements/achievement-service';

const SEASONAL_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const GENRES_STALE_TIME_MS = 60 * 60 * 1000; // 1 hour
const LEGACY_LIST_CACHE_TTL_MS = 60 * 60 * 1000;
const LEGACY_DETAIL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const LEGACY_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Thrown when an in-flight `fetchSeasonalAnime` discovers the user has
 * switched browseSource mid-flight. UI catches and re-fetches with the new
 * source. Equivalent to Swift `CancellationError`.
 */
export class CancellationError extends Error {
  readonly code = 'CANCELLATION';
  constructor(message = 'Operation cancelled') {
    super(message);
    this.name = 'CancellationError';
    Object.setPrototypeOf(this, CancellationError.prototype);
  }
}

export type SourceMap = Partial<Record<PlatformType, AnimeDataSource>>;

/**
 * Convert a UnifiedAnimeItem to the legacy `Anime` shape used by existing UI
 * (the photo deck, anime detail screen, etc).
 */
export function unifiedToLegacyAnime(item: UnifiedAnimeItem): Anime {
  const startDate = item.startDate
    ? {
        year: item.startDate.getUTCFullYear(),
        month: item.startDate.getUTCMonth() + 1,
        day: item.startDate.getUTCDate(),
      }
    : undefined;

  return {
    id: item.id,
    title:
      item.titleEnglish ||
      item.title ||
      item.titleRomaji ||
      item.titleJapanese ||
      'Unknown Title',
    image:
      item.bestImage('extraLarge') ??
      item.bestImage('large') ??
      item.coverImageURL ??
      '',
    bannerImage: item.bestImage('banner') ?? item.bannerImageURL ?? undefined,
    rank: item.anilistScore ?? Math.round((item.normalizedScore ?? 0) * 10),
    score: item.normalizedScore ?? undefined,
    type: item.format ?? 'TV',
    tags: item.genres.length > 0 ? item.genres : item.tags,
    mood: item.synopsis ? item.synopsis.substring(0, 100) + '...' : '',
    description: item.synopsis ?? undefined,
    durationMinutes: 24,
    studios: item.studios.length > 0 ? item.studios : undefined,
    startDate,
    status: item.displayStatus ?? undefined,
    format: item.format ?? undefined,
  };
}

export class AnimeRepository {
  private readonly sources: Map<PlatformType, AnimeDataSource>;
  private readonly queryClientImpl: typeof queryClient;
  private readonly cacheServiceImpl: typeof CacheService;
  private readonly idMapping: typeof idMappingService;
  private readonly config: typeof dataSourceConfig;

  constructor(
    sources?: SourceMap,
    deps: {
      queryClient?: typeof queryClient;
      cacheService?: typeof CacheService;
      idMappingService?: typeof idMappingService;
      dataSourceConfig?: typeof dataSourceConfig;
    } = {}
  ) {
    this.queryClientImpl = deps.queryClient ?? queryClient;
    this.cacheServiceImpl = deps.cacheService ?? CacheService;
    this.idMapping = deps.idMappingService ?? idMappingService;
    this.config = deps.dataSourceConfig ?? dataSourceConfig;

    if (sources) {
      this.sources = new Map(
        Object.entries(sources)
          .filter((entry): entry is [PlatformType, AnimeDataSource] => Boolean(entry[1]))
          .map(([k, v]) => [k as PlatformType, v])
      );
    } else {
      this.sources = AnimeRepository.buildDefaultSources();
    }
  }

  /**
   * Build the default 7-source map. Bangumi and Annict get the AniList
   * instance injected so their list/search delegation works with a shared
   * AniList instance (one HTTP layer, one rate-limit channel).
   */
  private static buildDefaultSources(): Map<PlatformType, AnimeDataSource> {
    const map = new Map<PlatformType, AnimeDataSource>();
    const aniList = new AniListDataSource();
    const jikan = new JikanDataSource();
    const bangumi = new BangumiDataSource({ aniListSource: aniList });
    let annict: AnimeDataSource | null = null;
    try {
      annict = new AnnictDataSource({
        client: new AnnictClient(),
        aniListSource: aniList,
      });
    } catch (err) {
      Logger.warn('[AnimeRepository] Annict construction failed', err);
    }
    map.set('anilist', aniList);
    map.set('myanimelist', jikan);
    map.set('bangumi', bangumi);
    if (annict) map.set('annict', annict);
    map.set('kitsu', new KitsuDataSource());
    map.set('shikimori', new ShikimoriDataSource());
    map.set('simkl', new SimklDataSource());
    return map;
  }

  /** Number of registered sources. Tests assert 7. */
  get sourceCount(): number {
    return this.sources.size;
  }

  /** Inspection helper for tests. */
  hasSource(platform: PlatformType): boolean {
    return this.sources.has(platform);
  }

  // MARK: - Unified data methods

  async fetchAnimeDetail(
    id: number | string,
    preferredSource?: PlatformType
  ): Promise<UnifiedAnimeItem> {
    const source = this.resolveSource(preferredSource);
    const idStr = String(id);
    const key = makeKey('animeDetail', { source: source.type, id: idStr });

    return this.queryClientImpl.fetch(key, async () =>
      source.fetchAnimeDetail(idStr, source.type)
    );
  }

  async searchAnime(
    query: string,
    page?: number,
    preferredSource?: PlatformType
  ): Promise<UnifiedAnimeItem[]> {
    const source = this.resolveSource(preferredSource);
    const pageNum = page ?? 1;
    const key = makeKey('searchAnime', {
      source: source.type,
      q: query,
      page: pageNum,
    });

    return this.queryClientImpl.fetch(key, async () =>
      source.searchAnime(query, pageNum)
    );
  }

  async fetchTopAnime(
    page?: number,
    preferredSource?: PlatformType
  ): Promise<UnifiedAnimeItem[]> {
    const source = this.resolveSource(preferredSource);
    const pageNum = page ?? 1;
    const key = makeKey('topAnime', { source: source.type, page: pageNum });

    return this.queryClientImpl.fetch(key, async () => source.fetchTopAnime(pageNum));
  }

  async fetchSeasonalAnime(
    page?: number,
    season?: string,
    year?: number,
    preferredSource?: PlatformType
  ): Promise<UnifiedAnimeItem[]> {
    const source = this.resolveSource(preferredSource);
    const requestPlatform = source.type;
    const pageNum = page ?? 1;
    const seasonStr = season ?? 'current';
    const yearStr = year != null ? String(year) : 'current';
    const cacheKey = `seasonal_${requestPlatform}_${yearStr}_${seasonStr}_${pageNum}`;

    // 1. Disk cache check (1h TTL).
    const cached = await this.cacheServiceImpl.get<UnifiedAnimeItem[]>(cacheKey);
    if (cached && cached.length > 0) {
      return cached;
    }

    const queryKey = makeKey('seasonalAnime', {
      source: requestPlatform,
      page: pageNum,
      season: seasonStr,
      year: yearStr,
    });

    const result = await this.queryClientImpl.fetch(queryKey, async () => {
      const items = await source.fetchSeasonalAnime(pageNum, season, year);

      // Cancellation: if user switched browseSource mid-flight (and no
      // explicit preferredSource), discard the result.
      const currentBrowseSource = this.config.browseSource;
      if (currentBrowseSource !== requestPlatform && preferredSource === undefined) {
        Logger.warn(
          `[AnimeRepository] fetchSeasonalAnime SOURCE_CHANGED_MIDFLIGHT requested=${requestPlatform} current=${currentBrowseSource} — cancelling`
        );
        throw new CancellationError(
          `Browse source changed mid-flight: ${requestPlatform} → ${currentBrowseSource}`
        );
      }

      return items;
    });

    // 2. Disk cache write — only if non-empty AND source still matches OR
    //    explicit preferredSource was passed.
    const currentBrowseSource = this.config.browseSource;
    const sourceMatches =
      currentBrowseSource === requestPlatform || preferredSource !== undefined;
    if (result.length > 0 && sourceMatches) {
      await this.cacheServiceImpl.set(cacheKey, result, SEASONAL_CACHE_TTL_MS);
    }

    return result;
  }

  async fetchAnime(
    page: number,
    genreId?: number | string,
    preferredSource?: PlatformType
  ): Promise<UnifiedAnimeItem[]> {
    const source = this.resolveSource(preferredSource);
    const genreStr = genreId != null ? String(genreId) : 'all';
    const key = makeKey('animeByGenre', {
      source: source.type,
      page,
      genre: genreStr,
    });

    const numericGenreId =
      typeof genreId === 'number'
        ? genreId
        : typeof genreId === 'string'
          ? Number.parseInt(genreId, 10)
          : undefined;

    return this.queryClientImpl.fetch(key, async () =>
      source.fetchAnime(
        page,
        Number.isFinite(numericGenreId) ? (numericGenreId as number) : undefined
      )
    );
  }

  async fetchAnimeGenres(preferredSource?: PlatformType): Promise<AnimeGenre[]> {
    const source = this.resolveSource(preferredSource);
    const sourceType = source.type;
    const cacheKey = `anime_genres_${sourceType}`;

    return this.queryClientImpl.fetch(
      cacheKey,
      async () => {
        try {
          return await source.fetchGenres();
        } catch (err) {
          // Fallback to AniList when primary source isn't AniList itself.
          if (sourceType !== 'anilist') {
            const aniList = this.sources.get('anilist');
            if (aniList) {
              Logger.info('[AnimeRepository] Falling back to AniList for genres');
              return aniList.fetchGenres();
            }
          }
          throw err;
        }
      },
      { staleTimeMs: GENRES_STALE_TIME_MS }
    );
  }

  // MARK: - Cross-platform media data

  async fetchAnimeStaff(
    id: number,
    sourcePlatform?: PlatformType
  ): Promise<AnimeStaff[]> {
    const source = this.resolveSource(undefined);
    const originPlatform = sourcePlatform ?? source.type;

    const result = await this.callWithCrossPlatform<AnimeStaff[]>(
      source,
      id,
      originPlatform,
      (s, queryId) => s.fetchAnimeStaff(queryId),
      // AniList's extended impl accepts sourcePlatform so it can do its own
      // id↔idMal resolution.
      (anilist, idStr) => anilist.fetchAnimeStaff(idStr, originPlatform)
    );

    if (result.length === 0 && source.type !== 'myanimelist') {
      const fallback = await this.fetchMediaFromJikanFallback(
        id,
        originPlatform,
        async (jikan, malId) => jikan.fetchAnimeStaff(String(malId))
      );
      return fallback ?? [];
    }
    return result;
  }

  async fetchAnimeRelations(
    id: number,
    sourcePlatform?: PlatformType
  ): Promise<AnimeRelation[]> {
    const source = this.resolveSource(undefined);
    const originPlatform = sourcePlatform ?? source.type;

    const result = await this.callWithCrossPlatform<AnimeRelation[]>(
      source,
      id,
      originPlatform,
      (s, queryId) => s.fetchAnimeRelations(queryId),
      (anilist, idStr) => anilist.fetchAnimeRelations(idStr, originPlatform)
    );

    if (result.length === 0 && source.type !== 'myanimelist') {
      const fallback = await this.fetchMediaFromJikanFallback(
        id,
        originPlatform,
        async (jikan, malId) => jikan.fetchAnimeRelations(String(malId))
      );
      return fallback ?? [];
    }
    return result;
  }

  async fetchAnimeStreaming(
    id: number,
    sourcePlatform?: PlatformType
  ): Promise<AnimeStreaming[]> {
    const source = this.resolveSource(undefined);
    const originPlatform = sourcePlatform ?? source.type;

    const result = await this.callWithCrossPlatform<AnimeStreaming[]>(
      source,
      id,
      originPlatform,
      (s, queryId) => s.fetchAnimeStreaming(queryId),
      (anilist, idStr) => anilist.fetchAnimeStreaming(idStr, originPlatform)
    );

    if (result.length === 0 && source.type !== 'myanimelist') {
      const fallback = await this.fetchMediaFromJikanFallback(
        id,
        originPlatform,
        async (jikan, malId) => jikan.fetchAnimeStreaming(String(malId))
      );
      return fallback ?? [];
    }
    return result;
  }

  async fetchAnimeThemes(
    id: number,
    sourcePlatform?: PlatformType
  ): Promise<AnimeTheme | null> {
    const source = this.resolveSource(undefined);
    const originPlatform = sourcePlatform ?? source.type;
    const queryId = await this.translateId(id, originPlatform, source.type);
    const native = await source.fetchAnimeThemes(queryId);
    if (native) return native;

    if (source.type !== 'myanimelist') {
      const fallback = await this.fetchMediaFromJikanFallback(
        id,
        originPlatform,
        async (jikan, malId) => jikan.fetchAnimeThemes(String(malId))
      );
      return fallback ?? null;
    }
    return null;
  }

  async fetchAnimeStatistics(
    id: number,
    sourcePlatform?: PlatformType
  ): Promise<PlatformRatingData | null> {
    const source = this.resolveSource(undefined);
    const originPlatform = sourcePlatform ?? source.type;
    const queryId = await this.translateId(id, originPlatform, source.type);
    return source.fetchStatistics(queryId);
  }

  async fetchMultiPlatformRatings(
    id: number,
    sourcePlatform?: PlatformType
  ): Promise<PlatformRatingData[]> {
    const platforms: PlatformType[] = ['myanimelist', 'bangumi', 'anilist'];
    const originPlatform = sourcePlatform ?? 'myanimelist';

    const settled = await Promise.all(
      platforms.map(async (platform) => {
        const src = this.sources.get(platform);
        if (!src) return null;
        try {
          const translatedId = await this.translateId(id, originPlatform, platform);
          return await src.fetchStatistics(translatedId);
        } catch {
          return null;
        }
      })
    );

    const order: Record<PlatformType, number> = {
      myanimelist: 0,
      bangumi: 1,
      anilist: 2,
      annict: 999,
      kitsu: 999,
      shikimori: 999,
      simkl: 999,
      kavita: 999,
    };

    return settled
      .map((v, idx) => (v ? { platform: platforms[idx], data: v } : null))
      .filter((entry): entry is { platform: PlatformType; data: PlatformRatingData } => entry !== null)
      .sort((a, b) => (order[a.platform] ?? 999) - (order[b.platform] ?? 999))
      .map((entry) => entry.data);
  }

  // MARK: - Source resolution + ID translation

  /**
   * 1) preferred → 2) browseSource → 3) AniList default.
   */
  private resolveSource(preferred?: PlatformType): AnimeDataSource {
    if (preferred) {
      const direct = this.sources.get(preferred);
      if (direct) return direct;
    }
    const browse = this.sources.get(this.config.browseSource);
    if (browse) return browse;
    const fallback = this.sources.get('anilist');
    if (fallback) return fallback;
    throw new Error('AnimeRepository: no AniList source registered');
  }

  /**
   * Translate an id from one platform to another via IDMappingService.
   * - same platform → return original
   * - mapping found → return mapped id (string)
   * - mapping unknown → return original (caller's empty-result fallback covers misses)
   */
  private async translateId(
    id: number | string,
    from: PlatformType | undefined,
    to: PlatformType
  ): Promise<string> {
    if (!from || from === to) return String(id);
    const mapped = await this.idMapping.translate(id, from, to);
    if (mapped !== null && mapped !== undefined) return String(mapped);
    return String(id);
  }

  /**
   * Run a media-data fetch using either:
   *   - AniList's extended sourcePlatform-aware method (when current source IS AniList)
   *   - or translated id + plain method on any other source.
   */
  private async callWithCrossPlatform<T>(
    source: AnimeDataSource,
    id: number,
    originPlatform: PlatformType,
    fallback: (s: AnimeDataSource, queryId: string) => Promise<T>,
    aniListPath: (anilist: AniListDataSource, idStr: string) => Promise<T>
  ): Promise<T> {
    if (source instanceof AniListDataSource) {
      return aniListPath(source, String(id));
    }
    const queryId = await this.translateId(id, originPlatform, source.type);
    return fallback(source, queryId);
  }

  /**
   * Generic fallback to Jikan when current source returns []. Resolves the
   * MAL id via IDMappingService (or returns the id directly when source IS
   * MAL). Errors swallowed: returns null so caller returns [].
   */
  private async fetchMediaFromJikanFallback<T>(
    id: number,
    sourcePlatform: PlatformType,
    fetch: (jikan: AnimeDataSource, malId: number) => Promise<T>
  ): Promise<T | null> {
    const malId = await this.resolveMalId(id, sourcePlatform);
    if (malId == null) return null;
    const jikan = this.sources.get('myanimelist');
    if (!jikan) return null;
    try {
      Logger.debug(`[AnimeRepository] media fallback to Jikan id=${id} → malId=${malId}`);
      return await fetch(jikan, malId);
    } catch (err) {
      Logger.warn('[AnimeRepository] Jikan fallback threw', err);
      return null;
    }
  }

  /** Resolve a MAL id from any-platform id via IDMappingService. */
  private async resolveMalId(
    id: number,
    sourcePlatform: PlatformType
  ): Promise<number | null> {
    if (sourcePlatform === 'myanimelist') return id;
    const mapped = await this.idMapping.translate(id, sourcePlatform, 'myanimelist');
    if (mapped == null) return null;
    const numeric = Number(mapped);
    return Number.isFinite(numeric) ? numeric : null;
  }

  // MARK: - Legacy static facade
  //
  // Kept so existing UI callers (useRateData.ts, app/(rate)/*, app/bangumi.tsx)
  // continue working. New callers should construct an instance and call the
  // unified methods above directly.

  private static instance: AnimeRepository | null = null;

  static defaultInstance(): AnimeRepository {
    if (!AnimeRepository.instance) {
      AnimeRepository.instance = new AnimeRepository();
    }
    return AnimeRepository.instance;
  }

  static __resetForTests(): void {
    AnimeRepository.instance = null;
  }

  static async getTopAnime(page = 1): Promise<Anime[]> {
    const cacheKey = `top_anime_${page}`;
    const cached = await CacheService.get<AniListAnime[]>(cacheKey);
    if (cached) return cached.map(mapAniListToAnime);

    const data = await AniListClient.getTopAnime(page);
    await CacheService.set(cacheKey, data, LEGACY_LIST_CACHE_TTL_MS);
    return data.map(mapAniListToAnime);
  }

  static async getSeasonalAnime(
    season?: string,
    year?: number,
    page = 1
  ): Promise<Anime[]> {
    const date = new Date();
    const currentMonth = date.getMonth();
    const currentYear = date.getFullYear();

    let targetSeason = season;
    if (!targetSeason) {
      if (currentMonth >= 2 && currentMonth <= 4) targetSeason = 'SPRING';
      else if (currentMonth >= 5 && currentMonth <= 7) targetSeason = 'SUMMER';
      else if (currentMonth >= 8 && currentMonth <= 10) targetSeason = 'FALL';
      else targetSeason = 'WINTER';
    }

    const targetYear = year ?? currentYear;
    const cacheKey = `seasonal_${targetSeason}_${targetYear}_${page}`;

    const cached = await CacheService.get<AniListAnime[]>(cacheKey);
    if (cached) return cached.map(mapAniListDetailToAnime);

    const data = await AniListClient.getSeasonalAnime(targetSeason, targetYear, page);
    await CacheService.set(cacheKey, data, LEGACY_LIST_CACHE_TTL_MS);
    return data.map(mapAniListDetailToAnime);
  }

  static async searchAnime(query: string, page = 1): Promise<Anime[]> {
    const cacheKey = `search_${query}_${page}`;
    const cached = await CacheService.get<AniListAnime[]>(cacheKey);
    if (cached) return cached.map(mapAniListToAnime);

    const data = await AniListClient.searchAnime(query, page);
    await CacheService.set(cacheKey, data, LEGACY_SEARCH_CACHE_TTL_MS);
    return data.map(mapAniListToAnime);
  }

  static async getAnimeByGenre(genre: string, page = 1): Promise<Anime[]> {
    const cacheKey = `genre_${genre}_${page}`;
    const cached = await CacheService.get<AniListAnime[]>(cacheKey);
    if (cached) return cached.map(mapAniListToAnime);

    const data = await AniListClient.getAnimeByGenre(genre, page);
    await CacheService.set(cacheKey, data, LEGACY_LIST_CACHE_TTL_MS);
    return data.map(mapAniListToAnime);
  }

  static async getGenres(): Promise<Genre[]> {
    const cacheKey = `genres_list_v2`;
    const cached = await CacheService.get<Genre[]>(cacheKey);
    if (cached) return cached;

    const genres = await AniListClient.getGenres();

    const genresWithImages: Genre[] = await Promise.all(
      genres.slice(0, 20).map(async (name) => {
        try {
          const anime = await AniListClient.getAnimeByGenre(name, 1, 1);
          const image =
            anime[0]?.coverImage?.extraLarge ?? anime[0]?.coverImage?.large ?? '';
          return {
            id: name,
            displayName: name,
            image,
          };
        } catch {
          return { id: name, displayName: name, image: '' };
        }
      })
    );

    await CacheService.set(cacheKey, genresWithImages, LEGACY_DETAIL_CACHE_TTL_MS);
    return genresWithImages;
  }

  static async getAnimeDetails(id: string): Promise<Anime> {
    const cacheKey = `anime_detail_${id}`;
    const cached = await CacheService.get<AniListAnime>(cacheKey);
    if (cached) return mapAniListDetailToAnime(cached);

    const data = await AniListClient.getAnimeDetails(Number(id));
    await CacheService.set(cacheKey, data, LEGACY_DETAIL_CACHE_TTL_MS);
    return mapAniListDetailToAnime(data);
  }

  static async rateAnime(id: string, action: 'like' | 'pass'): Promise<void> {
    await LocalDB.addRating(id, action);
    const stats = await LocalDB.getStats();
    await achievementService.track('rating.total', 1, stats.totalRated);

    if (action === 'like') {
      const anime = await AnimeRepository.getAnimeDetails(id);
      await LocalDB.addFavorite({
        id: anime.id,
        title: anime.title,
        image: anime.image,
      });
      const collection = await LocalDB.getFavorites();
      await achievementService.track('rating.like', 1, stats.likedCount);
      await achievementService.track('collection.add', 1);
      await achievementService.track('collection.size', 0, collection.length);
    } else {
      await achievementService.track('rating.pass', 1);
    }
  }

  static async getCollection(): Promise<Anime[]> {
    const favorites = await LocalDB.getFavorites();
    return favorites.map((fav) => ({
      id: fav.id,
      title: fav.title,
      image: fav.image,
      rank: 0,
      tags: [],
      mood: '',
      durationMinutes: 0,
    }));
  }

  static async getUserStats() {
    return LocalDB.getStats();
  }

  static mapAnimeToPhoto(anime: Anime): Photo {
    return {
      id: anime.id,
      url: anime.image,
      userId: 'anilist',
      title: anime.title,
      tags: anime.tags,
      score: anime.rank,
      year: new Date().getFullYear(),
      type: 'Anime',
    };
  }
}

// MARK: - Legacy mappers (preserved for the static facade)

function mapAniListToAnime(item: AniListAnime): Anime {
  return {
    id: String(item.id),
    title:
      item.title.english || item.title.romaji || item.title.native || 'Unknown Title',
    image: item.coverImage.extraLarge || item.coverImage.large,
    rank: item.averageScore || 0,
    score: item.averageScore || 0,
    type: item.format || 'TV',
    tags: item.genres.slice(0, 3),
    mood: item.description
      ? item.description.replace(/<[^>]*>?/gm, '').substring(0, 100) + '...'
      : '',
    durationMinutes: item.duration || 24,
  };
}

function mapAniListDetailToAnime(item: AniListAnime): Anime {
  return {
    id: String(item.id),
    title:
      item.title.english || item.title.romaji || item.title.native || 'Unknown Title',
    image: item.coverImage.extraLarge || item.coverImage.large,
    bannerImage: item.bannerImage || undefined,
    rank: item.averageScore || 0,
    score: item.averageScore ?? undefined,
    type: item.format || 'TV',
    tags: item.genres,
    mood: item.description ? item.description.replace(/<[^>]*>?/gm, '') : '',
    description: item.description ? item.description.replace(/<[^>]*>?/gm, '') : undefined,
    durationMinutes: item.duration || 24,
    studios: item.studios?.nodes?.map((node) => node.name) || undefined,
    startDate: item.startDate || undefined,
    status: item.status || undefined,
    format: item.format || undefined,
    nextAiringEpisode: item.nextAiringEpisode
      ? {
          airingAt: item.nextAiringEpisode.airingAt,
          episode: item.nextAiringEpisode.episode,
        }
      : undefined,
  };
}

// MARK: - Helpers

function makeKey(name: string, params: Record<string, string | number>): QueryKeyObject {
  return { name, params };
}

// Re-exports kept for callers that imported `PlatformImageData` via the
// repository module historically (none currently — guard against churn).
export type { PlatformImageData };
