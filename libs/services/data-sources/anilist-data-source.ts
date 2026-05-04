/**
 * AniList anime data source.
 *
 * Implements `AnimeDataSource` using the AniList GraphQL API. All HTTP
 * concerns (rate-limiting, retries, error mapping) live in `AniListClient`;
 * this module owns the AniList → `UnifiedAnimeItem` field mapping defined
 * in `spec/api_contracts.md` §1.
 *
 * Per spec, AniList does not expose aggregate per-anime statistics in the
 * same way Jikan does, so `fetchStatistics` returns `null` (the protocol
 * default behavior).
 */

import { UnifiedAnimeItem } from '../../models/unified-anime-item';
import type { PlatformImageData } from '../../models/platform-image-data';
import type { PlatformType } from '../auth/types';
import { AniListClient } from '../../clients/anilist-client';
import { idMappingService } from '../sync/id-mapping-service';
import { getCurrentSeason, getCurrentYear } from '../../utils/season-utils';
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

// MARK: - Raw AniList shapes (what the GraphQL API returns)

interface RawAniListTitle {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
  userPreferred?: string | null;
}

interface RawAniListCoverImage {
  large?: string | null;
  extraLarge?: string | null;
  color?: string | null;
}

interface RawAniListStudios {
  nodes?: { name?: string | null; isAnimationStudio?: boolean | null }[];
}

interface RawAniListTag {
  name?: string | null;
  isMediaSpoiler?: boolean | null;
}

interface RawAniListStartDate {
  year?: number | null;
  month?: number | null;
  day?: number | null;
}

interface RawAniListNextAiring {
  airingAt?: number | null;
  episode?: number | null;
}

interface RawAniListExternalLink {
  site?: string | null;
  url?: string | null;
  type?: string | null;
}

interface RawAniListStaffEdge {
  role?: string | null;
  node?: {
    id?: number;
    name?: { full?: string | null; native?: string | null };
    image?: { large?: string | null };
  };
}

interface RawAniListRelationEdge {
  relationType?: string | null;
  node?: {
    id?: number;
    idMal?: number | null;
    title?: { userPreferred?: string | null };
    type?: string | null;
    format?: string | null;
  };
}

interface RawAniListMedia {
  id: number;
  idMal?: number | null;
  title?: RawAniListTitle | null;
  synonyms?: string[] | null;
  description?: string | null;
  format?: string | null;
  episodes?: number | null;
  duration?: number | null;
  status?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  averageScore?: number | null;
  popularity?: number | null;
  coverImage?: RawAniListCoverImage | null;
  bannerImage?: string | null;
  genres?: string[] | null;
  tags?: RawAniListTag[] | null;
  studios?: RawAniListStudios | null;
  startDate?: RawAniListStartDate | null;
  nextAiringEpisode?: RawAniListNextAiring | null;
  externalLinks?: RawAniListExternalLink[] | null;
  staff?: { edges?: RawAniListStaffEdge[] | null } | null;
  relations?: { edges?: RawAniListRelationEdge[] | null } | null;
  isAdult?: boolean | null;
}

interface PageWrapper<T> {
  Page: { media?: T[] | null };
}

interface MediaWrapper<T> {
  Media: T | null;
}

interface GenreCollectionResponse {
  GenreCollection?: string[] | null;
}

// MARK: - Reusable GraphQL fragment

const MEDIA_FIELDS = `
  id
  idMal
  title { romaji english native userPreferred }
  synonyms
  description
  format
  episodes
  duration
  status
  season
  seasonYear
  averageScore
  popularity
  coverImage { large extraLarge color }
  bannerImage
  genres
  tags { name isMediaSpoiler }
  studios(isMain: true) { nodes { name isAnimationStudio } }
  startDate { year month day }
  nextAiringEpisode { airingAt episode }
  isAdult
`;

const SEARCH_QUERY = `
  query ($search: String, $page: Int, $perPage: Int = 20, $isAdult: Boolean) {
    Page(page: $page, perPage: $perPage) {
      media(search: $search, type: ANIME, isAdult: $isAdult, sort: [POPULARITY_DESC]) {
        ${MEDIA_FIELDS}
      }
    }
  }
`;

const TOP_QUERY = `
  query ($page: Int, $perPage: Int = 20) {
    Page(page: $page, perPage: $perPage) {
      media(type: ANIME, sort: [SCORE_DESC]) {
        ${MEDIA_FIELDS}
      }
    }
  }
`;

const SEASONAL_QUERY = `
  query ($season: MediaSeason, $year: Int, $page: Int, $perPage: Int = 20) {
    Page(page: $page, perPage: $perPage) {
      media(season: $season, seasonYear: $year, type: ANIME, sort: [POPULARITY_DESC]) {
        ${MEDIA_FIELDS}
      }
    }
  }
`;

const BY_GENRE_QUERY = `
  query ($genres: [String], $page: Int, $perPage: Int = 20) {
    Page(page: $page, perPage: $perPage) {
      media(genre_in: $genres, type: ANIME, sort: [POPULARITY_DESC]) {
        ${MEDIA_FIELDS}
      }
    }
  }
`;

const DETAIL_QUERY = `
  query ($id: Int, $idMal: Int) {
    Media(id: $id, idMal: $idMal, type: ANIME) {
      ${MEDIA_FIELDS}
      externalLinks { site url type }
      staff(sort: RELEVANCE, perPage: 25) {
        edges {
          role
          node {
            id
            name { full native }
            image { large }
          }
        }
      }
      relations {
        edges {
          relationType
          node {
            id
            idMal
            title { userPreferred }
            type
            format
          }
        }
      }
    }
  }
`;

const GENRES_QUERY = `query { GenreCollection }`;

// MARK: - Data source implementation

export class AniListDataSource implements AnimeDataSource {
  readonly type: PlatformType = 'anilist';

  private readonly client: AniListClient;
  /** Synthetic genre id (1000+) → genre name. Built up by `fetchGenres`. */
  private readonly genreIdToName: Map<number, string> = new Map();

  constructor(client: AniListClient = new AniListClient()) {
    this.client = client;
  }

  // MARK: - AnimeSearchable

  async searchAnime(query: string, page: number = 1): Promise<UnifiedAnimeItem[]> {
    const data = await this.client.query<PageWrapper<RawAniListMedia>>(SEARCH_QUERY, {
      search: query,
      page,
    });
    return (data.Page.media ?? []).map((m) => this.mapMedia(m));
  }

  async fetchAnime(page: number, genreId?: number): Promise<UnifiedAnimeItem[]> {
    if (typeof genreId === 'number') {
      const name = this.genreIdToName.get(genreId);
      if (name) {
        const data = await this.client.query<PageWrapper<RawAniListMedia>>(BY_GENRE_QUERY, {
          genres: [name],
          page,
        });
        return (data.Page.media ?? []).map((m) => this.mapMedia(m));
      }
    }
    return this.fetchTopAnime(page);
  }

  async fetchGenres(): Promise<AnimeGenre[]> {
    const data = await this.client.query<GenreCollectionResponse>(GENRES_QUERY);
    const list = data.GenreCollection ?? [];
    // De-dup defensively (per edge_cases.md) without losing order.
    const seen = new Set<string>();
    const result: AnimeGenre[] = [];
    list.forEach((name, index) => {
      if (!name || seen.has(name)) return;
      seen.add(name);
      const id = index + 1000;
      this.genreIdToName.set(id, name);
      result.push({ id, name });
    });
    return result;
  }

  async fetchTopAnime(page: number = 1): Promise<UnifiedAnimeItem[]> {
    const data = await this.client.query<PageWrapper<RawAniListMedia>>(TOP_QUERY, {
      page,
    });
    return (data.Page.media ?? []).map((m) => this.mapMedia(m));
  }

  async fetchSeasonalAnime(
    page: number = 1,
    season?: string,
    year?: number
  ): Promise<UnifiedAnimeItem[]> {
    const seasonUpper = (season ?? getCurrentSeason()).toUpperCase();
    const targetYear = year ?? getCurrentYear();
    const data = await this.client.query<PageWrapper<RawAniListMedia>>(SEASONAL_QUERY, {
      season: seasonUpper,
      year: targetYear,
      page,
    });
    return (data.Page.media ?? []).map((m) => this.mapMedia(m));
  }

  // MARK: - AnimeDetailProvider

  async fetchAnimeDetail(id: string, sourcePlatform?: PlatformType): Promise<UnifiedAnimeItem> {
    const variables = await this.resolveAniListVariables(id, sourcePlatform);
    if (Object.keys(variables).length === 0) {
      throw new DataSourceError({
        code: 'INVALID_ID',
        platform: 'anilist',
        message: `AniList: cannot resolve variables for id=${id} sourcePlatform=${sourcePlatform ?? 'unknown'}`,
      });
    }

    let data: MediaWrapper<RawAniListMedia>;
    try {
      data = await this.client.query<MediaWrapper<RawAniListMedia>>(DETAIL_QUERY, variables);
    } catch (err) {
      // NOT_FOUND with `id` → retry once with `idMal` (per api_contracts.md §1).
      if (err instanceof DataSourceError && err.code === 'NOT_FOUND' && 'id' in variables) {
        const numeric = Number(id);
        if (Number.isFinite(numeric)) {
          data = await this.client.query<MediaWrapper<RawAniListMedia>>(DETAIL_QUERY, {
            idMal: numeric,
          });
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }

    if (!data.Media) {
      throw new DataSourceError({
        code: 'NOT_FOUND',
        platform: 'anilist',
        message: `AniList: media not found for ${JSON.stringify(variables)}`,
      });
    }
    return this.mapMedia(data.Media);
  }

  // MARK: - AnimeStatsProvider
  //
  // AniList exposes per-user stats (Viewer.statistics) but no aggregate-anime
  // statistics endpoint comparable to Jikan's `/anime/{id}/statistics`. The
  // protocol contract is to return `null` rather than throw.

  async fetchStatistics(_id: string): Promise<PlatformRatingData | null> {
    return null;
  }

  // MARK: - AnimeMediaProvider

  async fetchAnimeStaff(id: string, sourcePlatform?: PlatformType): Promise<AnimeStaff[]> {
    const data = await this.fetchDetailRaw(id, sourcePlatform);
    if (!data) return [];
    const edges = data.staff?.edges ?? [];
    return edges
      .map((edge): AnimeStaff | null => {
        const node = edge.node;
        if (!node) return null;
        return {
          id: String(node.id ?? ''),
          name: node.name?.full ?? node.name?.native ?? 'Unknown',
          role: edge.role ?? undefined,
          imageUrl: node.image?.large ?? undefined,
        };
      })
      .filter((s): s is AnimeStaff => s !== null);
  }

  async fetchAnimeRelations(id: string, sourcePlatform?: PlatformType): Promise<AnimeRelation[]> {
    const data = await this.fetchDetailRaw(id, sourcePlatform);
    if (!data) return [];
    const edges = data.relations?.edges ?? [];
    return edges
      .map((edge): AnimeRelation | null => {
        const node = edge.node;
        if (!node || !edge.relationType) return null;
        const entryId = node.idMal ?? node.id;
        return {
          id: String(entryId ?? ''),
          type: humanizeRelation(edge.relationType),
          title: node.title?.userPreferred ?? 'Unknown',
          format: node.format ?? node.type ?? undefined,
        };
      })
      .filter((r): r is AnimeRelation => r !== null);
  }

  async fetchAnimeStreaming(id: string, sourcePlatform?: PlatformType): Promise<AnimeStreaming[]> {
    const data = await this.fetchDetailRaw(id, sourcePlatform);
    if (!data) return [];
    const links = data.externalLinks ?? [];
    return links
      .filter((l) => (l.type ?? '').toUpperCase() === 'STREAMING' && l.url)
      .map((l) => ({
        site: l.site ?? 'Unknown',
        url: l.url ?? '',
      }));
  }

  async fetchAnimeThemes(_id: string): Promise<AnimeTheme | null> {
    // AniList has no opening/ending theme endpoint.
    return null;
  }

  // MARK: - Cross-platform variable resolution

  /**
   * Resolve AniList GraphQL variables (`id` or `idMal`) for an incoming id.
   *
   * Logic mirrors iOS `AniListAnimeDataSource.resolveAniListVariables`:
   *   - sourcePlatform === 'anilist'    → use `id`
   *   - sourcePlatform === 'myanimelist' → use `idMal`
   *   - other platforms → IDMappingService → 'anilist' (preferred) or 'myanimelist'
   *   - last resort: treat numeric id as `idMal`
   */
  async resolveAniListVariables(
    id: string,
    sourcePlatform?: PlatformType
  ): Promise<{ id?: number } | { idMal?: number } | Record<string, never>> {
    const intId = Number.parseInt(id, 10);

    if (sourcePlatform === 'anilist' && Number.isFinite(intId)) {
      return { id: intId };
    }
    if (sourcePlatform === 'myanimelist' && Number.isFinite(intId)) {
      return { idMal: intId };
    }

    if (sourcePlatform && sourcePlatform !== 'anilist') {
      const anilistId = await idMappingService.translate(id, sourcePlatform, 'anilist');
      if (anilistId !== null) {
        const numeric = Number(anilistId);
        if (Number.isFinite(numeric)) return { id: numeric };
      }

      const malId = await idMappingService.translate(id, sourcePlatform, 'myanimelist');
      if (malId !== null) {
        const numeric = Number(malId);
        if (Number.isFinite(numeric)) return { idMal: numeric };
      }
    }

    if (Number.isFinite(intId)) {
      return { idMal: intId };
    }
    return {};
  }

  // MARK: - Internal

  /**
   * Fetch the raw `Media` node for a given id without mapping. Used by the
   * staff/relations/streaming/themes helpers so they can share one HTTP call.
   * Returns `null` if the id can't be resolved (so callers return `[]`).
   */
  private async fetchDetailRaw(
    id: string,
    sourcePlatform?: PlatformType
  ): Promise<RawAniListMedia | null> {
    const variables = await this.resolveAniListVariables(id, sourcePlatform);
    if (Object.keys(variables).length === 0) return null;
    try {
      const data = await this.client.query<MediaWrapper<RawAniListMedia>>(DETAIL_QUERY, variables);
      return data.Media ?? null;
    } catch (err) {
      if (err instanceof DataSourceError && err.code === 'NOT_FOUND') return null;
      throw err;
    }
  }

  private mapMedia(media: RawAniListMedia): UnifiedAnimeItem {
    const cover = media.coverImage ?? {};
    const platformImages: Partial<Record<PlatformType, PlatformImageData>> = {};
    const anilistImage: PlatformImageData = {};
    if (cover.large) anilistImage.large = cover.large;
    if (cover.extraLarge) anilistImage.extraLarge = cover.extraLarge;
    if (media.bannerImage) anilistImage.banner = media.bannerImage;
    if (anilistImage.large || anilistImage.extraLarge || anilistImage.banner) {
      platformImages.anilist = anilistImage;
    }

    const title = media.title ?? {};
    const studios = collectStudios(media.studios);
    const tags = collectTags(media.tags);
    const synonyms = media.synonyms ?? [];
    const description = stripHtml(media.description);

    return new UnifiedAnimeItem({
      title: title.userPreferred || title.romaji || title.english || title.native || 'Unknown',
      titleEnglish: title.english ?? null,
      titleJapanese: title.native ?? null,
      titleRomaji: title.romaji ?? null,
      synonyms,
      synopsis: description,
      idMal: media.idMal ?? null,
      format: media.format ?? null,
      coverImageURL: cover.extraLarge ?? cover.large ?? null,
      extraLargeImageURL: cover.extraLarge ?? null,
      bannerImageURL: media.bannerImage ?? null,
      platformImages,
      anilistScore: media.averageScore ?? null,
      totalEpisodes: media.episodes ?? null,
      year: media.seasonYear ?? null,
      season: media.season ? media.season.toUpperCase() : null,
      startDate: parseFuzzyDate(media.startDate),
      broadcastDay: nextAiringDay(media.nextAiringEpisode?.airingAt ?? null),
      genres: media.genres ?? [],
      tags,
      studios,
      platformData: {
        anilist: {
          id: String(media.id),
          progress: 0,
        },
      },
    });
  }
}

// MARK: - Helpers

function stripHtml(value: string | null | undefined): string {
  if (value == null) return '';
  return value.replace(/<[^>]*>/g, '').trim();
}

function collectStudios(connection: RawAniListStudios | null | undefined): string[] {
  const nodes = connection?.nodes ?? [];
  const animation = nodes
    .filter((n) => n.isAnimationStudio === true)
    .map((n) => n.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0);
  if (animation.length > 0) return animation;
  return nodes.map((n) => n.name).filter((n): n is string => typeof n === 'string' && n.length > 0);
}

function collectTags(tags: RawAniListTag[] | null | undefined): string[] {
  if (!tags || tags.length === 0) return [];
  return tags
    .filter((t) => t.isMediaSpoiler !== true && typeof t.name === 'string' && t.name.length > 0)
    .map((t) => t.name as string);
}

function parseFuzzyDate(date: RawAniListStartDate | null | undefined): Date | null {
  if (!date || date.year == null) return null;
  const year = date.year;
  const month = (date.month ?? 1) - 1;
  const day = date.day ?? 1;
  const d = new Date(Date.UTC(year, month, day));
  return Number.isFinite(d.getTime()) ? d : null;
}

function nextAiringDay(airingAt: number | null): string | null {
  if (airingAt == null || airingAt <= 0) return null;
  const date = new Date(airingAt * 1000);
  const days = [
    'Sundays',
    'Mondays',
    'Tuesdays',
    'Wednesdays',
    'Thursdays',
    'Fridays',
    'Saturdays',
  ];
  return days[date.getUTCDay()] ?? null;
}

function humanizeRelation(relationType: string): string {
  return relationType
    .split('_')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}
