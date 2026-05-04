/**
 * Jikan (MyAnimeList) anime data source.
 *
 * Implements `AnimeDataSource` using the Jikan REST v4 API. HTTP transport,
 * rate-limiting, and 429 backoff live in `JikanClient`. This module owns the
 * Jikan → `UnifiedAnimeItem` field mapping documented in
 * `spec/api_contracts.md` §2.
 */

import { UnifiedAnimeItem } from '../../models/unified-anime-item';
import type { PlatformImageData } from '../../models/platform-image-data';
import type { PlatformType } from '../auth/types';
import { JikanClient, type JikanResponse } from '../../clients/jikan-client';
import { dataSourceConfig } from '../data-source-config';
import {
  type AnimeDataSource,
  type AnimeGenre,
  type AnimeRelation,
  type AnimeStaff,
  type AnimeStreaming,
  type AnimeTheme,
  type PlatformRatingData,
} from './anime-data-source';
import { DataSourceError } from './data-source-error';

// MARK: - Raw Jikan shapes (subset of response we consume)

interface JikanImage {
  image_url?: string | null;
  small_image_url?: string | null;
  large_image_url?: string | null;
  maximum_image_url?: string | null;
}

interface JikanImages {
  jpg?: JikanImage | null;
  webp?: JikanImage | null;
}

interface JikanNamed {
  mal_id?: number;
  type?: string;
  name?: string;
  url?: string;
}

interface JikanTitle {
  type?: string;
  title?: string;
}

interface JikanBroadcast {
  day?: string | null;
  time?: string | null;
  timezone?: string | null;
  string?: string | null;
}

interface JikanAired {
  from?: string | null;
  to?: string | null;
  prop?: { from?: { year?: number | null } } | null;
  string?: string | null;
}

interface JikanAnime {
  mal_id: number;
  url?: string;
  images?: JikanImages | null;
  title?: string;
  title_english?: string | null;
  title_japanese?: string | null;
  title_synonyms?: string[] | null;
  titles?: JikanTitle[] | null;
  type?: string | null;
  source?: string | null;
  episodes?: number | null;
  status?: string | null;
  aired?: JikanAired | null;
  duration?: string | null;
  rating?: string | null;
  score?: number | null;
  scored_by?: number | null;
  rank?: number | null;
  popularity?: number | null;
  members?: number | null;
  favorites?: number | null;
  synopsis?: string | null;
  background?: string | null;
  season?: string | null;
  year?: number | null;
  broadcast?: JikanBroadcast | null;
  genres?: JikanNamed[] | null;
  themes?: JikanNamed[] | null;
  demographics?: JikanNamed[] | null;
  studios?: JikanNamed[] | null;
}

interface JikanGenre {
  mal_id: number;
  name: string;
  url?: string;
  count?: number;
}

interface JikanStaffEntry {
  person?: {
    mal_id?: number;
    name?: string;
    url?: string;
    images?: JikanImages | null;
  };
  positions?: string[] | null;
}

interface JikanRelationEntry {
  relation?: string;
  entry?: { mal_id?: number; type?: string; name?: string; url?: string }[];
}

interface JikanStreamingEntry {
  name?: string;
  url?: string;
}

interface JikanThemes {
  openings?: string[] | null;
  endings?: string[] | null;
}

interface JikanScoreBucket {
  score: number;
  votes: number;
  percentage: number;
}

interface JikanStatistics {
  watching?: number;
  completed?: number;
  on_hold?: number;
  dropped?: number;
  plan_to_watch?: number;
  total?: number;
  scores?: JikanScoreBucket[] | null;
}

// MARK: - Data source implementation

export class JikanDataSource implements AnimeDataSource {
  readonly type: PlatformType = 'myanimelist';

  private readonly client: JikanClient;

  constructor(client: JikanClient = new JikanClient()) {
    this.client = client;
  }

  // MARK: - AnimeSearchable

  async searchAnime(query: string, page: number = 1): Promise<UnifiedAnimeItem[]> {
    const params: Record<string, string | number | boolean> = {
      q: query,
      page,
      limit: 20,
    };
    if (this.shouldFilterAdult()) params.sfw = true;

    const res = await this.client.get<JikanResponse<JikanAnime[]>>('/anime', params);
    return (res.data ?? []).map((a) => this.mapAnime(a));
  }

  async fetchAnime(page: number, genreId?: number): Promise<UnifiedAnimeItem[]> {
    const params: Record<string, string | number | boolean> = { page };
    if (typeof genreId === 'number') params.genres = genreId;
    if (this.shouldFilterAdult()) params.sfw = true;

    const res = await this.client.get<JikanResponse<JikanAnime[]>>('/anime', params);
    return (res.data ?? []).map((a) => this.mapAnime(a));
  }

  async fetchGenres(): Promise<AnimeGenre[]> {
    const res = await this.client.get<JikanResponse<JikanGenre[]>>('/genres/anime');
    return (res.data ?? []).map((g) => ({
      id: g.mal_id,
      name: g.name,
    }));
  }

  async fetchTopAnime(page: number = 1): Promise<UnifiedAnimeItem[]> {
    const params: Record<string, string | number | boolean> = { page };
    if (this.shouldFilterAdult()) params.sfw = true;

    const res = await this.client.get<JikanResponse<JikanAnime[]>>('/top/anime', params);
    return (res.data ?? []).map((a) => this.mapAnime(a));
  }

  async fetchSeasonalAnime(
    page: number = 1,
    season?: string,
    year?: number
  ): Promise<UnifiedAnimeItem[]> {
    const params: Record<string, string | number | boolean> = { page };
    if (this.shouldFilterAdult()) params.sfw = true;

    let path = '/seasons/now';
    if (typeof year === 'number' && season) {
      path = `/seasons/${year}/${season.toLowerCase()}`;
    }

    const res = await this.client.get<JikanResponse<JikanAnime[]>>(path, params);
    return (res.data ?? []).map((a) => this.mapAnime(a));
  }

  // MARK: - AnimeDetailProvider

  async fetchAnimeDetail(id: string): Promise<UnifiedAnimeItem> {
    const malId = Number.parseInt(id, 10);
    if (!Number.isFinite(malId) || malId <= 0) {
      throw new DataSourceError({
        code: 'INVALID_ID',
        platform: 'myanimelist',
        message: `Jikan: invalid id "${id}"`,
      });
    }
    const res = await this.client.get<JikanResponse<JikanAnime>>(`/anime/${malId}`);
    if (!res.data) {
      throw new DataSourceError({
        code: 'NOT_FOUND',
        platform: 'myanimelist',
        message: `Jikan: no data for id ${malId}`,
      });
    }
    return this.mapAnime(res.data);
  }

  // MARK: - AnimeStatsProvider

  async fetchStatistics(id: string): Promise<PlatformRatingData | null> {
    const malId = Number.parseInt(id, 10);
    if (!Number.isFinite(malId) || malId <= 0) return null;

    const res = await this.client.get<JikanResponse<JikanStatistics>>(`/anime/${malId}/statistics`);
    const stats = res.data;
    if (!stats) return null;

    const ratingDistribution: Record<string, number> = {};
    if (Array.isArray(stats.scores)) {
      for (const bucket of stats.scores) {
        ratingDistribution[String(bucket.score)] = bucket.votes;
      }
    }
    // Status distribution piggybacks on the same map for now (caller can
    // refine via `key.startsWith('status:')`). Encoded with explicit keys to
    // avoid colliding with score buckets.
    if (typeof stats.watching === 'number') ratingDistribution['status:watching'] = stats.watching;
    if (typeof stats.completed === 'number')
      ratingDistribution['status:completed'] = stats.completed;
    if (typeof stats.on_hold === 'number') ratingDistribution['status:onHold'] = stats.on_hold;
    if (typeof stats.dropped === 'number') ratingDistribution['status:dropped'] = stats.dropped;
    if (typeof stats.plan_to_watch === 'number')
      ratingDistribution['status:planToWatch'] = stats.plan_to_watch;
    if (typeof stats.total === 'number') ratingDistribution['status:total'] = stats.total;

    return {
      scoredBy: stats.total,
      ratingDistribution,
    };
  }

  // MARK: - AnimeMediaProvider

  async fetchAnimeStaff(id: string): Promise<AnimeStaff[]> {
    const malId = Number.parseInt(id, 10);
    if (!Number.isFinite(malId) || malId <= 0) return [];

    const res = await this.client.get<JikanResponse<JikanStaffEntry[]>>(`/anime/${malId}/staff`);
    return (res.data ?? [])
      .map((entry): AnimeStaff | null => {
        const person = entry.person;
        if (!person) return null;
        const positions = entry.positions ?? [];
        return {
          id: String(person.mal_id ?? ''),
          name: person.name ?? 'Unknown',
          role: positions[0],
          imageUrl: bestJikanImage(person.images) ?? undefined,
        };
      })
      .filter((s): s is AnimeStaff => s !== null);
  }

  async fetchAnimeRelations(id: string): Promise<AnimeRelation[]> {
    const malId = Number.parseInt(id, 10);
    if (!Number.isFinite(malId) || malId <= 0) return [];

    const res = await this.client.get<JikanResponse<JikanRelationEntry[]>>(
      `/anime/${malId}/relations`
    );
    const rows: AnimeRelation[] = [];
    for (const entry of res.data ?? []) {
      if (!entry.entry) continue;
      for (const child of entry.entry) {
        rows.push({
          id: String(child.mal_id ?? ''),
          type: entry.relation ?? 'Related',
          title: child.name ?? 'Unknown',
          format: child.type ?? undefined,
        });
      }
    }
    return rows;
  }

  async fetchAnimeStreaming(id: string): Promise<AnimeStreaming[]> {
    const malId = Number.parseInt(id, 10);
    if (!Number.isFinite(malId) || malId <= 0) return [];

    const res = await this.client.get<JikanResponse<JikanStreamingEntry[]>>(
      `/anime/${malId}/streaming`
    );
    return (res.data ?? [])
      .filter((s): s is JikanStreamingEntry => Boolean(s.url && s.name))
      .map((s) => ({ site: s.name as string, url: s.url as string }));
  }

  async fetchAnimeThemes(id: string): Promise<AnimeTheme | null> {
    const malId = Number.parseInt(id, 10);
    if (!Number.isFinite(malId) || malId <= 0) return null;

    const res = await this.client.get<JikanResponse<JikanThemes>>(`/anime/${malId}/themes`);
    if (!res.data) return null;
    return {
      openings: res.data.openings ?? [],
      endings: res.data.endings ?? [],
    };
  }

  // MARK: - Internal

  private shouldFilterAdult(): boolean {
    return !dataSourceConfig.allowR18Content;
  }

  private mapAnime(anime: JikanAnime): UnifiedAnimeItem {
    const coverImageURL = bestJikanImage(anime.images);
    const platformImages: Partial<Record<PlatformType, PlatformImageData>> = {};
    if (coverImageURL) {
      platformImages.myanimelist = { large: coverImageURL };
    }

    // Tags: union of themes + demographics, de-duplicated.
    const tagSet = new Set<string>();
    for (const t of anime.themes ?? []) {
      if (t.name) tagSet.add(t.name);
    }
    for (const d of anime.demographics ?? []) {
      if (d.name) tagSet.add(d.name);
    }

    // Synonyms: prefer the canonical `title_synonyms` array; fall back to the
    // alt-titles array when present (useful for cross-language search).
    const synonyms: string[] = [...(anime.title_synonyms ?? [])];
    let titleChinese: string | null = null;
    if (Array.isArray(anime.titles)) {
      for (const t of anime.titles) {
        if (!t.title) continue;
        if ((t.type ?? '').toLowerCase().includes('chinese')) {
          titleChinese = t.title;
        }
        if (!synonyms.includes(t.title)) synonyms.push(t.title);
      }
    }

    const broadcastDay = normalizeBroadcastDay(anime.broadcast?.day ?? null);
    const startDate = parseAiredDate(anime.aired);

    const malId = anime.mal_id;
    const platformData: Partial<Record<PlatformType, { id: string }>> = {
      myanimelist: { id: String(malId) },
    };

    return new UnifiedAnimeItem({
      title: anime.title ?? 'Unknown',
      titleEnglish: anime.title_english ?? null,
      titleJapanese: anime.title_japanese ?? null,
      titleChinese,
      titleRomaji: anime.title ?? null,
      synonyms,
      synopsis: anime.synopsis ?? null,
      idMal: malId,
      format: anime.type ?? null,
      coverImageURL: coverImageURL ?? null,
      platformImages,
      malScore: typeof anime.score === 'number' ? anime.score : null,
      totalEpisodes: anime.episodes ?? null,
      year: typeof anime.year === 'number' ? anime.year : (anime.aired?.prop?.from?.year ?? null),
      season: anime.season ? anime.season.toUpperCase() : null,
      startDate,
      broadcastDay,
      genres: (anime.genres ?? []).map((g) => g.name).filter((n): n is string => Boolean(n)),
      tags: Array.from(tagSet),
      studios: (anime.studios ?? []).map((s) => s.name).filter((n): n is string => Boolean(n)),
      platformData,
    });
  }
}

// MARK: - Helpers

const MAL_PLACEHOLDER_PATTERN = /(no_pic|questionmark)/i;

function isPlaceholder(url: string | null | undefined): boolean {
  if (!url) return true;
  return MAL_PLACEHOLDER_PATTERN.test(url);
}

/**
 * Image priority: webp.large > jpg.large > webp.image > jpg.image. Skips
 * MAL "no image" placeholders so callers fall through to the next provider's
 * cover when the source row has nothing.
 */
function bestJikanImage(images: JikanImages | null | undefined): string | null {
  if (!images) return null;
  const candidates = [
    images.webp?.large_image_url,
    images.jpg?.large_image_url,
    images.webp?.image_url,
    images.jpg?.image_url,
  ];
  for (const c of candidates) {
    if (c && !isPlaceholder(c)) return c;
  }
  return null;
}

function normalizeBroadcastDay(day: string | null): string | null {
  if (!day) return null;
  const trimmed = day.trim();
  if (!trimmed || trimmed.toLowerCase() === 'unknown') return null;
  return trimmed;
}

function parseAiredDate(aired: JikanAired | null | undefined): Date | null {
  if (!aired?.from) return null;
  const d = new Date(aired.from);
  return Number.isFinite(d.getTime()) ? d : null;
}
