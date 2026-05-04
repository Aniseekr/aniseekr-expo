// Kitsu data source — implements `AnimeDataSource` against the Kitsu JSON:API.
// Mapping rules mirror the iOS aniseeker port (see api_contracts.md §5).

import { KitsuClient } from '../../clients/kitsu-client';
import type { PlatformImageData } from '../../models/platform-image-data';
import { UnifiedAnimeItem } from '../../models/unified-anime-item';
import type { PlatformType } from '../auth/types';
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

const KITSU_PAGE_SIZE = 20;
/** JSON:API rejects offsets beyond 500. Clamp page input to keep within range. */
const KITSU_MAX_OFFSET = 500;

interface KitsuJsonApi<T> {
  data: T;
  included?: KitsuResource[];
  meta?: { count?: number };
}

interface KitsuResource {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
}

interface KitsuAnimeAttributes {
  canonicalTitle?: string | null;
  titles?: Record<string, string> | null;
  abbreviatedTitles?: string[] | null;
  synopsis?: string | null;
  description?: string | null;
  averageRating?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: string | null;
  subtype?: string | null;
  episodeCount?: number | null;
  posterImage?: KitsuImage | null;
  coverImage?: KitsuImage | null;
  nsfw?: boolean | null;
}

interface KitsuImage {
  tiny?: string | null;
  small?: string | null;
  medium?: string | null;
  large?: string | null;
  original?: string | null;
}

interface KitsuAnimeResource {
  id: string;
  type: string;
  attributes: KitsuAnimeAttributes;
  relationships?: Record<string, unknown>;
}

interface KitsuCategoryResource {
  id: string;
  type: string;
  attributes: { title?: string | null; slug?: string | null };
}

function offsetForPage(page: number | undefined): number {
  const p = Math.max(1, page ?? 1);
  return Math.min((p - 1) * KITSU_PAGE_SIZE, KITSU_MAX_OFFSET);
}

/** Parse the Kitsu rating string ("82.4") to a number. NaN → null. */
function parseKitsuScore(raw: string | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseStartDate(raw: string | null | undefined): {
  date: Date | null;
  year: number | null;
} {
  if (!raw) return { date: null, year: null };
  // Kitsu serves ISO `YYYY-MM-DD`. `Date.parse` is sufficient.
  const ms = Date.parse(raw);
  const date = Number.isFinite(ms) ? new Date(ms) : null;
  const yearStr = raw.split('-')[0];
  const year = yearStr ? Number(yearStr) : NaN;
  return {
    date,
    year: Number.isFinite(year) ? year : null,
  };
}

function pickTitle(
  titles: Record<string, string> | null | undefined,
  canonical: string | null | undefined
): string {
  if (titles) {
    const enJp = titles.en_jp;
    if (enJp && enJp.length > 0) return enJp;
    const en = titles.en ?? titles.en_us;
    if (en && en.length > 0) return en;
  }
  return canonical ?? '';
}

function pickEnglish(titles: Record<string, string> | null | undefined): string | null {
  if (!titles) return null;
  return titles.en ?? titles.en_us ?? null;
}

function pickJapanese(titles: Record<string, string> | null | undefined): string | null {
  if (!titles) return null;
  return titles.ja_jp ?? null;
}

function pickRomaji(titles: Record<string, string> | null | undefined): string | null {
  if (!titles) return null;
  return titles.en_jp ?? null;
}

function buildKitsuItem(resource: KitsuAnimeResource): UnifiedAnimeItem {
  const attrs = resource.attributes ?? {};
  const titles = attrs.titles ?? null;
  const canonical = attrs.canonicalTitle ?? '';
  const title = pickTitle(titles, canonical);

  const poster = attrs.posterImage ?? null;
  const cover = attrs.coverImage ?? null;

  const coverImageURL = poster?.large ?? poster?.medium ?? poster?.small ?? null;
  const extraLargeImageURL = poster?.original ?? coverImageURL;
  const bannerImageURL = cover?.large ?? cover?.original ?? cover?.medium ?? null;

  const platformImages: Partial<Record<PlatformType, PlatformImageData>> = {};
  if (coverImageURL || extraLargeImageURL || bannerImageURL) {
    platformImages.kitsu = {
      large: coverImageURL ?? undefined,
      extraLarge: extraLargeImageURL ?? undefined,
      banner: bannerImageURL ?? undefined,
    };
  }

  const score = parseKitsuScore(attrs.averageRating ?? null);
  const { date: startDate, year } = parseStartDate(attrs.startDate ?? null);
  const synopsis = attrs.synopsis ?? attrs.description ?? null;
  const subtype = attrs.subtype ?? null;
  const format = subtype ? subtype.toUpperCase() : null;

  return new UnifiedAnimeItem({
    title,
    titleEnglish: pickEnglish(titles),
    titleJapanese: pickJapanese(titles),
    titleRomaji: pickRomaji(titles),
    synopsis,
    format,
    coverImageURL,
    extraLargeImageURL,
    bannerImageURL,
    platformImages,
    // Kitsu's averageRating is on the same 0-100 scale as AniList; reuse the
    // anilistScore field so `normalizedScore` divides correctly.
    anilistScore: score,
    totalEpisodes: attrs.episodeCount ?? null,
    year,
    startDate,
    platformData: { kitsu: { id: resource.id } },
    syncStatus: { kitsu: 'synced' },
  });
}

interface KitsuStaffAttributes {
  role?: string | null;
}
interface KitsuPersonAttributes {
  name?: string | null;
  image?: KitsuImage | null;
}

export class KitsuDataSource implements AnimeDataSource {
  readonly type: PlatformType = 'kitsu';

  async searchAnime(query: string, page?: number): Promise<UnifiedAnimeItem[]> {
    const offset = offsetForPage(page);
    const response = await KitsuClient.get<KitsuJsonApi<KitsuAnimeResource[]>>('/anime', {
      'filter[text]': query,
      'page[limit]': KITSU_PAGE_SIZE,
      'page[offset]': offset,
    });
    return (response.data ?? []).map(buildKitsuItem);
  }

  async fetchAnime(page: number, _genreId?: number): Promise<UnifiedAnimeItem[]> {
    const offset = offsetForPage(page);
    const response = await KitsuClient.get<KitsuJsonApi<KitsuAnimeResource[]>>('/anime', {
      sort: '-userCount',
      'page[limit]': KITSU_PAGE_SIZE,
      'page[offset]': offset,
    });
    return (response.data ?? []).map(buildKitsuItem);
  }

  async fetchGenres(): Promise<AnimeGenre[]> {
    const response = await KitsuClient.get<KitsuJsonApi<KitsuCategoryResource[]>>('/categories', {
      'page[limit]': 50,
    });
    return (response.data ?? []).flatMap((category) => {
      const name = category.attributes?.title;
      if (!name) return [];
      const idNum = Number(category.id);
      if (!Number.isFinite(idNum)) return [];
      return [{ id: idNum, name }];
    });
  }

  async fetchTopAnime(page?: number): Promise<UnifiedAnimeItem[]> {
    const offset = offsetForPage(page);
    const response = await KitsuClient.get<KitsuJsonApi<KitsuAnimeResource[]>>('/anime', {
      sort: '-averageRating',
      'page[limit]': KITSU_PAGE_SIZE,
      'page[offset]': offset,
    });
    return (response.data ?? []).map(buildKitsuItem);
  }

  async fetchSeasonalAnime(
    page?: number,
    season?: string,
    year?: number
  ): Promise<UnifiedAnimeItem[]> {
    const offset = offsetForPage(page);
    const params: Record<string, string | number | undefined> = {
      sort: '-userCount',
      'page[limit]': KITSU_PAGE_SIZE,
      'page[offset]': offset,
    };
    if (season) params['filter[season]'] = season.toLowerCase();
    if (year != null) params['filter[seasonYear]'] = year;
    const response = await KitsuClient.get<KitsuJsonApi<KitsuAnimeResource[]>>('/anime', params);
    return (response.data ?? []).map(buildKitsuItem);
  }

  async fetchAnimeDetail(id: string): Promise<UnifiedAnimeItem> {
    const response = await KitsuClient.get<KitsuJsonApi<KitsuAnimeResource>>(`/anime/${id}`, {});
    return buildKitsuItem(response.data);
  }

  async fetchAnimeStaff(id: string): Promise<AnimeStaff[]> {
    const response = await KitsuClient.get<KitsuJsonApi<KitsuResource[]>>(`/anime/${id}/staff`, {
      include: 'person',
      'page[limit]': 20,
    });
    const personMap = new Map<string, KitsuPersonAttributes>();
    for (const inc of response.included ?? []) {
      if (inc.type === 'people' || inc.type === 'persons') {
        personMap.set(inc.id, (inc.attributes ?? {}) as KitsuPersonAttributes);
      }
    }
    const out: AnimeStaff[] = [];
    for (const entry of response.data ?? []) {
      const attrs = (entry.attributes ?? {}) as KitsuStaffAttributes;
      const personRel = (entry.relationships?.person as { data?: { id?: string } } | undefined)
        ?.data;
      const personId = personRel?.id;
      const person = personId ? personMap.get(personId) : undefined;
      out.push({
        id: entry.id,
        name: person?.name ?? 'Unknown',
        role: attrs.role ?? undefined,
        imageUrl: person?.image?.large ?? person?.image?.medium ?? undefined,
      });
    }
    return out;
  }

  async fetchAnimeRelations(id: string): Promise<AnimeRelation[]> {
    const response = await KitsuClient.get<KitsuJsonApi<KitsuResource[]>>(
      `/anime/${id}/anime-relationships`,
      { include: 'destination', 'page[limit]': 20 }
    );
    const animeMap = new Map<string, KitsuAnimeAttributes>();
    for (const inc of response.included ?? []) {
      if (inc.type === 'anime') {
        animeMap.set(inc.id, (inc.attributes ?? {}) as KitsuAnimeAttributes);
      }
    }
    const out: AnimeRelation[] = [];
    for (const entry of response.data ?? []) {
      const attrs = (entry.attributes ?? {}) as { role?: string | null };
      const destRel = (entry.relationships?.destination as { data?: { id?: string } } | undefined)
        ?.data;
      const destId = destRel?.id ?? '';
      const dest = destId ? animeMap.get(destId) : undefined;
      const titles = dest?.titles ?? null;
      const title = pickTitle(titles, dest?.canonicalTitle ?? '');
      out.push({
        id: destId,
        type: attrs.role ?? 'related',
        title,
        format: dest?.subtype ? dest.subtype.toUpperCase() : undefined,
        imageUrl: dest?.posterImage?.large ?? dest?.posterImage?.medium ?? undefined,
      });
    }
    return out;
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

// Internal exports so tests can exercise mapping helpers directly.
export const __test__ = {
  parseKitsuScore,
  pickTitle,
  buildKitsuItem,
  parseStartDate,
};
