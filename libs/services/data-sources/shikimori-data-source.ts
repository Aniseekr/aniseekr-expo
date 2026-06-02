// Shikimori data source — implements `AnimeDataSource` against the Shikimori
// REST API. Mapping rules mirror the iOS aniseeker port (see api_contracts.md §6).

import { prefixShikimoriImage, ShikimoriClient } from '../../clients/shikimori-client';
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

const SHIKIMORI_PAGE_SIZE = 20;

interface ShikimoriImage {
  original: string;
  preview?: string;
  x96?: string;
  x48?: string;
}

interface ShikimoriGenre {
  id: number;
  name: string;
  russian?: string | null;
  kind?: string | null;
}

interface ShikimoriStudio {
  id: number;
  name: string;
  filtered_name?: string | null;
  real?: boolean | null;
  image?: string | null;
}

interface ShikimoriAnimeBase {
  id: number;
  name: string;
  russian?: string | null;
  english?: (string | null)[] | null;
  japanese?: (string | null)[] | null;
  synonyms?: (string | null)[] | null;
  image: ShikimoriImage;
  url?: string;
  kind?: string | null;
  score?: string | null;
  status?: string | null;
  episodes?: number | null;
  episodes_aired?: number | null;
  aired_on?: string | null;
  released_on?: string | null;
}

interface ShikimoriAnimeListItem extends ShikimoriAnimeBase {}

interface ShikimoriAnimeDetail extends ShikimoriAnimeBase {
  rating?: string | null;
  duration?: number | null;
  description?: string | null;
  description_html?: string | null;
  description_source?: string | null;
  franchise?: string | null;
  myanimelist_id?: number | null;
  genres?: ShikimoriGenre[] | null;
  studios?: ShikimoriStudio[] | null;
}

interface ShikimoriRelationItem {
  relation: string;
  anime?: ShikimoriAnimeBase | null;
}

interface ShikimoriPersonRoleItem {
  roles: string[];
  character?: { id: number; name: string; russian?: string | null; image?: ShikimoriImage } | null;
  person?: {
    id: number;
    name: string;
    russian?: string | null;
    image?: ShikimoriImage | null;
  } | null;
}

const SHIKIMORI_KIND_TO_FORMAT: Record<string, string> = {
  tv: 'TV',
  movie: 'MOVIE',
  ova: 'OVA',
  ona: 'ONA',
  special: 'SPECIAL',
  music: 'MUSIC',
  tv_special: 'TV_SPECIAL',
  pv: 'PV',
  cm: 'CM',
};

/** Strip both BBCode (`[b]...[/b]`) and HTML tags from a Shikimori description. */
export function stripShikimoriDescription(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let out = raw.replace(/\[\/?[^\]]*\]/g, '');
  out = out.replace(/<[^>]*>/g, '');
  return out.trim();
}

function parseShikimoriScore(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function parseAiredOn(raw: string | null | undefined): {
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

function pickShikimoriFormat(kind: string | null | undefined): string | null {
  if (!kind) return null;
  return SHIKIMORI_KIND_TO_FORMAT[kind] ?? kind.toUpperCase();
}

function effectiveEpisodes(item: ShikimoriAnimeBase): number | null {
  const eps = item.episodes ?? 0;
  if (eps && eps > 0) return eps;
  const aired = item.episodes_aired ?? 0;
  if (aired && aired > 0) return aired;
  return null;
}

function firstNonEmpty(values: (string | null | undefined)[] | null | undefined): string | null {
  if (!values) return null;
  for (const v of values) {
    if (v && v.length > 0) return v;
  }
  return null;
}

function buildShikimoriItem(
  item: ShikimoriAnimeBase,
  opts?: { mergeDetail?: ShikimoriAnimeDetail }
) {
  const detail = opts?.mergeDetail;
  const coverImageURL = prefixShikimoriImage(item.image?.original);
  const previewImage = prefixShikimoriImage(item.image?.preview ?? null);
  const platformImages: Partial<Record<PlatformType, PlatformImageData>> = {};
  if (coverImageURL || previewImage) {
    platformImages.shikimori = {
      large: coverImageURL ?? previewImage ?? undefined,
      extraLarge: coverImageURL ?? undefined,
    };
  }

  const score = parseShikimoriScore(item.score ?? null);
  const { date: startDate, year } = parseAiredOn(item.aired_on);
  const format = pickShikimoriFormat(item.kind);

  const titleEnglish = firstNonEmpty(item.english) ?? firstNonEmpty(detail?.english);
  const titleJapanese = firstNonEmpty(item.japanese) ?? firstNonEmpty(detail?.japanese);
  const titleRussian = item.russian ?? detail?.russian ?? null;
  // Shikimori `name` is canonical Romaji.
  const titleRomaji = item.name;

  const synonyms = ([] as string[])
    .concat((item.synonyms ?? []).filter((v): v is string => !!v))
    .concat((detail?.synonyms ?? []).filter((v): v is string => !!v));

  const genres = (detail?.genres ?? []).map((g) => g.name).filter((n): n is string => !!n);

  const studios = (detail?.studios ?? []).map((s) => s.name).filter((n): n is string => !!n);

  const idMal = detail?.myanimelist_id ?? null;
  const synopsis = stripShikimoriDescription(detail?.description ?? null);

  return new UnifiedAnimeItem({
    title: item.name,
    titleEnglish: titleEnglish ?? null,
    titleJapanese: titleJapanese ?? null,
    titleRussian,
    titleRomaji,
    synonyms,
    synopsis,
    idMal: idMal ?? undefined,
    format,
    coverImageURL,
    extraLargeImageURL: coverImageURL,
    bannerImageURL: null,
    platformImages,
    // Shikimori scores are 0-10 (string). iOS treats them like AniList only
    // when AniList is absent — see api_contracts.md §6. We store on the
    // anilistScore channel; normalizedScore handles the >10 / <=10 split.
    anilistScore: score,
    totalEpisodes: effectiveEpisodes(item),
    year,
    startDate,
    genres,
    studios,
    platformData: { shikimori: { id: String(item.id) } },
    syncStatus: { shikimori: 'synced' },
    isAdult: (detail?.rating ?? '').toLowerCase() === 'rx',
  });
}

export class ShikimoriDataSource implements AnimeDataSource {
  readonly type: PlatformType = 'shikimori';

  async searchAnime(query: string, page?: number): Promise<UnifiedAnimeItem[]> {
    const pageNum = Math.max(1, page ?? 1);
    const items = await ShikimoriClient.get<ShikimoriAnimeListItem[]>('/animes', {
      search: query,
      page: pageNum,
      limit: SHIKIMORI_PAGE_SIZE,
    });
    return (items ?? []).map((it) => buildShikimoriItem(it));
  }

  async fetchAnime(page: number, genreId?: number): Promise<UnifiedAnimeItem[]> {
    const params: Record<string, string | number | undefined> = {
      order: 'popularity',
      page: Math.max(1, page),
      limit: SHIKIMORI_PAGE_SIZE,
    };
    if (genreId != null) params.genre = genreId;
    const items = await ShikimoriClient.get<ShikimoriAnimeListItem[]>('/animes', params);
    return (items ?? []).map((it) => buildShikimoriItem(it));
  }

  async fetchGenres(): Promise<AnimeGenre[]> {
    const items = await ShikimoriClient.get<ShikimoriGenre[]>('/genres', {});
    return (items ?? []).flatMap((g) =>
      g.kind === 'anime' || g.kind == null ? [{ id: g.id, name: g.name }] : []
    );
  }

  async fetchTopAnime(page?: number): Promise<UnifiedAnimeItem[]> {
    const pageNum = Math.max(1, page ?? 1);
    const items = await ShikimoriClient.get<ShikimoriAnimeListItem[]>('/animes', {
      order: 'ranked',
      page: pageNum,
      limit: SHIKIMORI_PAGE_SIZE,
    });
    return (items ?? []).map((it) => buildShikimoriItem(it));
  }

  async fetchSeasonalAnime(
    page?: number,
    season?: string,
    year?: number
  ): Promise<UnifiedAnimeItem[]> {
    const pageNum = Math.max(1, page ?? 1);
    const params: Record<string, string | number | undefined> = {
      order: 'popularity',
      page: pageNum,
      limit: SHIKIMORI_PAGE_SIZE,
    };
    if (season && year != null) {
      params.season = `${year}_${season.toLowerCase()}`;
    } else if (year != null) {
      params.season = String(year);
    }
    const items = await ShikimoriClient.get<ShikimoriAnimeListItem[]>('/animes', params);
    return (items ?? []).map((it) => buildShikimoriItem(it));
  }

  async fetchAnimeDetail(id: string): Promise<UnifiedAnimeItem> {
    const detail = await ShikimoriClient.get<ShikimoriAnimeDetail>(`/animes/${id}`, {});
    return buildShikimoriItem(detail, { mergeDetail: detail });
  }

  async fetchAnimeStaff(id: string): Promise<AnimeStaff[]> {
    try {
      const items = await ShikimoriClient.get<ShikimoriPersonRoleItem[]>(`/animes/${id}/roles`, {});
      const out: AnimeStaff[] = [];
      for (const role of items ?? []) {
        const person = role.person;
        if (!person) continue;
        out.push({
          id: String(person.id),
          name: person.name,
          role: role.roles?.join(', ') || undefined,
          imageUrl: prefixShikimoriImage(person.image?.original) ?? undefined,
        });
      }
      return out;
    } catch {
      return [];
    }
  }

  async fetchAnimeRelations(id: string): Promise<AnimeRelation[]> {
    try {
      const items = await ShikimoriClient.get<ShikimoriRelationItem[]>(`/animes/${id}/related`, {});
      const out: AnimeRelation[] = [];
      for (const rel of items ?? []) {
        const a = rel.anime;
        if (!a) continue;
        out.push({
          id: String(a.id),
          type: rel.relation,
          title: a.name,
          format: pickShikimoriFormat(a.kind) ?? undefined,
          imageUrl: prefixShikimoriImage(a.image?.original) ?? undefined,
        });
      }
      return out;
    } catch {
      return [];
    }
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
