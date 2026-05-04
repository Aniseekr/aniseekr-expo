// Simkl data source — implements `AnimeDataSource` against the Simkl REST API.
// Mapping rules mirror the iOS aniseeker port (see api_contracts.md §7).

import { SimklClient, wrapSimklPoster } from '../../clients/simkl-client';
import { isDataSourceError } from './data-source-error';
import type { PlatformImageData } from '../../models/platform-image-data';
import { PLATFORM_PRIORITY, UnifiedAnimeItem } from '../../models/unified-anime-item';
import type { PlatformAnimeData } from '../../models/unified-anime-item';
import type { PlatformType } from '../auth/types';
import { getCurrentYear } from '../../utils/season-utils';
import {
  defaultStatsStub,
  type AnimeDataSource,
  type AnimeGenre,
  type AnimeRelation,
  type AnimeStaff,
  type AnimeStreaming,
  type AnimeTheme,
  type PlatformRatingData,
} from './anime-data-source';

const SIMKL_PAGE_SIZE = 20;
const SIMKL_TOP_FALLBACK_DEPTH = 3;

interface SimklIds {
  simkl?: number | null;
  slug?: string | null;
  mal?: number | null;
  anidb?: number | null;
  anilist?: number | null;
  kitsu?: number | null;
  animeplanet?: string | null;
  ann?: number | null;
  livechart?: number | null;
  anisearch?: number | null;
  notifymoe?: string | null;
  tmdb?: number | null;
  imdb?: string | null;
}

interface SimklRating {
  rating?: number | null;
  votes?: number | null;
}
interface SimklRatings {
  simkl?: SimklRating | null;
  mal?: SimklRating | null;
}

interface SimklSearchItem {
  title: string;
  en_title?: string | null;
  year?: number | null;
  type?: string | null;
  ids: SimklIds;
  anime_type?: string | null;
  poster?: string | null;
  fanart?: string | null;
  ep_count?: number | null;
  total_episodes?: number | null;
  status?: string | null;
  ratings?: SimklRatings | null;
  overview?: string | null;
  genres?: string[] | null;
  aired_at?: string | null;
}

interface SimklAnimeDetail {
  title: string;
  en_title?: string | null;
  year?: number | null;
  ids: SimklIds;
  type?: string | null;
  anime_type?: string | null;
  status?: string | null;
  runtime?: number | null;
  ep_count?: number | null;
  total_episodes?: number | null;
  network?: string | null;
  country?: string | null;
  first_aired?: string | null;
  aired_at?: string | null;
  ended?: string | null;
  overview?: string | null;
  genres?: string[] | null;
  poster?: string | null;
  fanart?: string | null;
  ratings?: SimklRatings | null;
}

function parseAirDate(raw: string | null | undefined): {
  date: Date | null;
  year: number | null;
} {
  if (!raw) return { date: null, year: null };
  const ms = Date.parse(raw);
  const date = Number.isFinite(ms) ? new Date(ms) : null;
  const yearStr = raw.split('-')[0];
  const year = yearStr ? Number(yearStr) : NaN;
  return { date, year: Number.isFinite(year) ? year : null };
}

/**
 * Capture cross-platform IDs from `ids.*` into a typed `platformData` map.
 * Simkl is the only provider that publishes MAL/AniList/Kitsu IDs alongside
 * its own — a key reason we surface it as a data source.
 */
function buildPlatformData(ids: SimklIds): Partial<Record<PlatformType, PlatformAnimeData>> {
  const out: Partial<Record<PlatformType, PlatformAnimeData>> = {};
  if (ids.simkl != null) out.simkl = { id: String(ids.simkl) };
  if (ids.mal != null) out.myanimelist = { id: String(ids.mal) };
  if (ids.anilist != null) out.anilist = { id: String(ids.anilist) };
  if (ids.kitsu != null) out.kitsu = { id: String(ids.kitsu) };
  return out;
}

function buildItem(item: SimklSearchItem | SimklAnimeDetail): UnifiedAnimeItem {
  const poster = wrapSimklPoster(item.poster);
  const fanart = wrapSimklPoster(item.fanart);

  const platformImages: Partial<Record<PlatformType, PlatformImageData>> = {};
  if (poster || fanart) {
    platformImages.simkl = {
      large: poster ?? undefined,
      extraLarge: poster ?? undefined,
      banner: fanart ?? undefined,
    };
  }

  const ids = item.ids;
  const platformData = buildPlatformData(ids);
  // Ensure simkl is always present even when ids.simkl is null (rare).
  if (!platformData.simkl) {
    platformData.simkl = { id: ids.simkl != null ? String(ids.simkl) : '' };
  }

  const malScore = item.ratings?.mal?.rating ?? null;
  const totalEpisodes = item.ep_count ?? item.total_episodes ?? null;
  const aired = (item as SimklAnimeDetail).first_aired ?? item.aired_at ?? null;
  const { date: startDate, year: airedYear } = parseAirDate(aired);
  const year = item.year ?? airedYear;
  const format = item.anime_type ?? null;
  const overview = item.overview ?? null;
  const englishTitle = item.en_title ?? item.title ?? null;

  const syncStatus: Partial<Record<string, 'synced'>> = { simkl: 'synced' };
  // Carry sync hints for any cross-linked platform so the merge layer knows
  // the data was sourced from Simkl rather than fetched directly.
  for (const platform of PLATFORM_PRIORITY) {
    if (platform === 'simkl') continue;
    if (platformData[platform]) {
      syncStatus[platform] = 'synced';
    }
  }

  return new UnifiedAnimeItem({
    title: item.title,
    titleEnglish: englishTitle,
    synopsis: overview,
    idMal: ids.mal ?? null,
    format,
    coverImageURL: poster,
    extraLargeImageURL: poster,
    bannerImageURL: fanart,
    platformImages,
    malScore,
    totalEpisodes,
    year,
    startDate,
    genres: (item.genres ?? []).slice(),
    platformData,
    syncStatus: syncStatus as never,
  });
}

export class SimklDataSource implements AnimeDataSource {
  readonly type: PlatformType = 'simkl';

  /**
   * Allow injection of a "now" so tests can pin the year used for /best/.
   */
  private readonly nowFn: () => Date;

  constructor(nowFn: () => Date = () => new Date()) {
    this.nowFn = nowFn;
  }

  async searchAnime(query: string, _page?: number): Promise<UnifiedAnimeItem[]> {
    const items = await SimklClient.get<SimklSearchItem[]>('/search/anime', {
      q: query,
      limit: SIMKL_PAGE_SIZE,
      extended: 'full',
    });
    return (items ?? []).map(buildItem);
  }

  async fetchAnime(_page: number, _genreId?: number): Promise<UnifiedAnimeItem[]> {
    const items = await SimklClient.get<SimklSearchItem[]>('/anime/trending', {
      limit: SIMKL_PAGE_SIZE,
      extended: 'full',
    });
    return (items ?? []).map(buildItem);
  }

  async fetchGenres(): Promise<AnimeGenre[]> {
    // Simkl exposes no genres endpoint; return a static list so the UI still
    // has something to render.
    const COMMON = [
      'Action',
      'Adventure',
      'Comedy',
      'Drama',
      'Fantasy',
      'Horror',
      'Mystery',
      'Romance',
      'Sci-Fi',
      'Slice of Life',
      'Sports',
      'Supernatural',
      'Thriller',
    ];
    return COMMON.map((name, i) => ({ id: i + 1, name }));
  }

  async fetchTopAnime(_page?: number): Promise<UnifiedAnimeItem[]> {
    let year = getCurrentYear(this.nowFn());
    for (let attempt = 0; attempt < SIMKL_TOP_FALLBACK_DEPTH; attempt++) {
      try {
        const items = await SimklClient.get<SimklSearchItem[]>(`/anime/best/${year}`, {
          limit: SIMKL_PAGE_SIZE,
          extended: 'full',
        });
        if (items && items.length > 0) {
          return items.map(buildItem);
        }
      } catch (err) {
        // Treat NOT_FOUND as an empty bucket (year had no entries) rather
        // than a hard error — we'll fall back to the previous year below.
        if (!isDataSourceError(err) || err.code !== 'NOT_FOUND') {
          throw err;
        }
      }
      year -= 1;
    }
    return [];
  }

  async fetchSeasonalAnime(
    _page?: number,
    _season?: string,
    _year?: number
  ): Promise<UnifiedAnimeItem[]> {
    const items = await SimklClient.get<SimklSearchItem[]>('/anime/premieres', {
      limit: SIMKL_PAGE_SIZE,
      extended: 'full',
    });
    return (items ?? []).map(buildItem);
  }

  async fetchAnimeDetail(id: string): Promise<UnifiedAnimeItem> {
    const detail = await SimklClient.get<SimklAnimeDetail>(`/anime/${id}`, {
      extended: 'full',
    });
    return buildItem(detail);
  }

  async fetchAnimeStaff(_id: string): Promise<AnimeStaff[]> {
    return [];
  }

  async fetchAnimeRelations(_id: string): Promise<AnimeRelation[]> {
    return [];
  }

  async fetchAnimeStreaming(_id: string): Promise<AnimeStreaming[]> {
    return [];
  }

  async fetchAnimeThemes(_id: string): Promise<AnimeTheme | null> {
    return null;
  }

  fetchStatistics(_id: string): Promise<PlatformRatingData | null> {
    return defaultStatsStub().fetchStatistics(_id);
  }
}

export const __test__ = {
  buildItem,
  buildPlatformData,
  parseAirDate,
};
