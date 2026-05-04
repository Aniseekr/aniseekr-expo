import type { PlatformType } from '../auth/types';
import type { UnifiedAnimeItem } from '../../models/unified-anime-item';

/**
 * Lightweight typed view of platform genres returned by `fetchGenres`.
 * Synthetic IDs are minted by AniList (which only returns names) — see
 * `api_contracts.md` §1.
 */
export interface AnimeGenre {
  id: number;
  name: string;
  /** ISO 3166 region code if the genre is region-specific. */
  region?: string;
}

/** A staff credit (director, character designer, etc). */
export interface AnimeStaff {
  id: string;
  name: string;
  role?: string;
  imageUrl?: string;
}

/** A relation (sequel, prequel, side story, etc). */
export interface AnimeRelation {
  id: string;
  type: string;
  title: string;
  imageUrl?: string;
  format?: string;
}

/** A streaming availability entry (Netflix, Crunchyroll, etc). */
export interface AnimeStreaming {
  url: string;
  site: string;
}

/** Opening / ending themes (lyrics + artist). */
export interface AnimeTheme {
  openings: string[];
  endings: string[];
}

/** Aggregate rating data (per-platform stats). */
export interface PlatformRatingData {
  averageScore?: number;
  scoredBy?: number;
  popularityRank?: number;
  ratingDistribution?: Record<string, number>;
}

// MARK: - Protocols (Interface Segregation Principle)

export interface AnimeSearchable {
  searchAnime(query: string, page?: number): Promise<UnifiedAnimeItem[]>;
  fetchAnime(page: number, genreId?: number): Promise<UnifiedAnimeItem[]>;
  fetchGenres(): Promise<AnimeGenre[]>;
  fetchTopAnime(page?: number): Promise<UnifiedAnimeItem[]>;
  fetchSeasonalAnime(page?: number, season?: string, year?: number): Promise<UnifiedAnimeItem[]>;
}

export interface AnimeDetailProvider {
  fetchAnimeDetail(id: string, sourcePlatform?: PlatformType): Promise<UnifiedAnimeItem>;
}

export interface AnimeStatsProvider {
  fetchStatistics(id: string): Promise<PlatformRatingData | null>;
}

export interface AnimeMediaProvider {
  fetchAnimeStaff(id: string): Promise<AnimeStaff[]>;
  fetchAnimeRelations(id: string): Promise<AnimeRelation[]>;
  fetchAnimeStreaming(id: string): Promise<AnimeStreaming[]>;
  fetchAnimeThemes(id: string): Promise<AnimeTheme | null>;
}

/**
 * Composed protocol every concrete data source implements. Concrete
 * implementations live in sibling files (one per platform).
 */
export interface AnimeDataSource
  extends AnimeSearchable, AnimeDetailProvider, AnimeStatsProvider, AnimeMediaProvider {
  readonly type: PlatformType;
}

// MARK: - Default implementations

/**
 * Default no-op stubs for media-shaped methods. Sources that don't expose a
 * given endpoint can spread this object to inherit empty defaults rather
 * than throwing.
 *
 * Example:
 *   class KitsuDataSource implements AnimeDataSource {
 *     ...defaultMediaStubs();   // covers staff/relations/streaming/themes
 *   }
 */
export function defaultMediaStubs(): AnimeMediaProvider {
  return {
    async fetchAnimeStaff(_id: string): Promise<AnimeStaff[]> {
      return [];
    },
    async fetchAnimeRelations(_id: string): Promise<AnimeRelation[]> {
      return [];
    },
    async fetchAnimeStreaming(_id: string): Promise<AnimeStreaming[]> {
      return [];
    },
    async fetchAnimeThemes(_id: string): Promise<AnimeTheme | null> {
      return null;
    },
  };
}

export function defaultStatsStub(): AnimeStatsProvider {
  return {
    async fetchStatistics(_id: string): Promise<PlatformRatingData | null> {
      return null;
    },
  };
}
