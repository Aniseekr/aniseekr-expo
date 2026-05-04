import type { PlatformType } from '../services/auth/types';
import { convertSimplifiedToTraditional } from '../utils/chinese-converter';
import type { PlatformImageData } from './platform-image-data';
import type { WatchStatus } from './watch-status';

/**
 * Per-platform user-specific anime data (id, progress, score, watch status).
 * Mirrors the Swift `PlatformAnimeData` struct used by `merge`.
 */
export interface PlatformAnimeData {
  id: string;
  progress?: number;
  score?: number;
  status?: WatchStatus;
}

/** Sync status carried alongside `platformData` for UI badges. */
export type PlatformSyncStatus =
  | 'notConnected'
  | 'connected'
  | 'syncing'
  | 'synced'
  | { kind: 'error'; message: string };

export type ImageType = 'large' | 'extraLarge' | 'banner';

/**
 * Platform priority used to derive the canonical `id` and to drive
 * cross-platform fallbacks. Mirrors `UnifiedAnimeItem.platformPriority`
 * in iOS aniseeker.
 */
export const PLATFORM_PRIORITY: readonly PlatformType[] = [
  'bangumi',
  'myanimelist',
  'anilist',
  'shikimori',
  'annict',
  'simkl',
  'kitsu',
  'kavita',
] as const;

/**
 * Image priority for `bestImage`. Aniseeker prefers AniList covers because
 * they are the highest-resolution and highest-quality across providers.
 */
export const IMAGE_PRIORITY: readonly PlatformType[] = [
  'anilist',
  'bangumi',
  'myanimelist',
  'shikimori',
  'simkl',
  'kitsu',
  'annict',
] as const;

/**
 * RFC4122-ish UUID v4 generated using `Math.random`. The iOS implementation
 * uses `UUID()`; we don't need cryptographic quality here — just stable,
 * unique identifiers for items that have no platform-supplied ID.
 */
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface UnifiedAnimeItemInit {
  title: string;
  titleEnglish?: string | null;
  titleJapanese?: string | null;
  titleChinese?: string | null;
  titleChineseTraditional?: string | null;
  titleRussian?: string | null;
  titleRomaji?: string | null;
  synonyms?: string[];
  searchKeywords?: string;
  synopsis?: string | null;
  idMal?: number | null;
  format?: string | null;
  coverImageURL?: string | null;
  extraLargeImageURL?: string | null;
  bannerImageURL?: string | null;
  platformImages?: Partial<Record<PlatformType, PlatformImageData>>;
  malScore?: number | null;
  bangumiScore?: number | null;
  anilistScore?: number | null;
  maxProgress?: number;
  totalEpisodes?: number | null;
  year?: number | null;
  season?: string | null;
  startDate?: Date | null;
  broadcastDay?: string | null;
  status?: WatchStatus;
  genres?: string[];
  tags?: string[];
  studios?: string[];
  platformData?: Partial<Record<PlatformType, PlatformAnimeData>>;
  syncStatus?: Partial<Record<PlatformType, PlatformSyncStatus>>;
  displayStatus?: string | null;
  sortDate?: Date | null;
}

/**
 * Universal anime data carrier merged from multiple platforms.
 *
 * Equality is by `id` (mirroring Swift `Hashable`); two items with the same
 * id are equal regardless of any other field.
 */
export class UnifiedAnimeItem {
  readonly id: string;
  readonly sourcePlatform: PlatformType | null;

  readonly title: string;
  readonly titleEnglish: string | null;
  readonly titleJapanese: string | null;
  readonly titleChinese: string | null;
  readonly titleChineseTraditional: string | null;
  readonly titleRussian: string | null;
  readonly titleRomaji: string | null;
  readonly synonyms: string[];
  readonly searchKeywords: string;
  readonly synopsis: string | null;

  readonly idMal: number | null;
  readonly format: string | null;

  readonly coverImageURL: string | null;
  readonly extraLargeImageURL: string | null;
  readonly bannerImageURL: string | null;

  readonly platformImages: Partial<Record<PlatformType, PlatformImageData>>;

  readonly malScore: number | null;
  readonly bangumiScore: number | null;
  readonly anilistScore: number | null;

  readonly maxProgress: number;
  readonly totalEpisodes: number | null;
  readonly year: number | null;
  readonly season: string | null;
  readonly startDate: Date | null;
  readonly broadcastDay: string | null;

  readonly status: WatchStatus;

  readonly genres: string[];
  readonly tags: string[];
  readonly studios: string[];

  readonly platformData: Partial<Record<PlatformType, PlatformAnimeData>>;
  readonly syncStatus: Partial<Record<PlatformType, PlatformSyncStatus>>;

  displayStatus: string | null;
  sortDate: Date | null;

  constructor(init: UnifiedAnimeItemInit) {
    const platformData = init.platformData ?? {};

    // Derive canonical id following platform priority.
    let derivedId: string | null = null;
    let derivedSource: PlatformType | null = null;
    for (const platform of PLATFORM_PRIORITY) {
      const candidate = platformData[platform];
      if (candidate && candidate.id && candidate.id.length > 0) {
        derivedId = candidate.id;
        derivedSource = platform;
        break;
      }
    }
    this.id = derivedId ?? uuid();
    this.sourcePlatform = derivedSource;

    this.title = init.title;
    this.titleEnglish = init.titleEnglish ?? null;
    this.titleJapanese = init.titleJapanese ?? null;
    this.titleChinese = init.titleChinese ?? null;
    this.titleChineseTraditional =
      init.titleChineseTraditional ??
      (init.titleChinese != null ? convertSimplifiedToTraditional(init.titleChinese) : null);
    this.titleRussian = init.titleRussian ?? null;
    this.titleRomaji = init.titleRomaji ?? null;
    this.synonyms = init.synonyms ? [...init.synonyms] : [];
    this.searchKeywords =
      init.searchKeywords ??
      UnifiedAnimeItem.buildSearchKeywords({
        titleDefault: init.title,
        titleEn: init.titleEnglish ?? null,
        titleJp: init.titleJapanese ?? null,
        titleCn: init.titleChinese ?? null,
        synonyms: this.synonyms,
      });
    this.synopsis = init.synopsis ?? null;

    this.idMal = init.idMal ?? null;
    this.format = init.format ?? null;

    this.coverImageURL = init.coverImageURL ?? null;
    this.extraLargeImageURL = init.extraLargeImageURL ?? null;
    this.bannerImageURL = init.bannerImageURL ?? null;

    this.platformImages = init.platformImages ?? {};

    this.malScore = init.malScore ?? null;
    this.bangumiScore = init.bangumiScore ?? null;
    this.anilistScore = init.anilistScore ?? null;

    this.maxProgress = init.maxProgress ?? 0;
    this.totalEpisodes = init.totalEpisodes ?? null;
    this.year = init.year ?? null;
    this.season = init.season ?? null;
    this.startDate = init.startDate ?? null;
    this.broadcastDay = init.broadcastDay ?? null;

    this.status = init.status ?? 'unknown';

    this.genres = init.genres ? [...init.genres] : [];
    this.tags = init.tags ? [...init.tags] : [];
    this.studios = init.studios ? [...init.studios] : [];

    this.platformData = platformData;
    this.syncStatus = init.syncStatus ?? {};

    this.displayStatus = init.displayStatus ?? null;
    this.sortDate = init.sortDate ?? null;
  }

  // MARK: - Computed properties

  /**
   * Normalized score on 0-10 scale across all platforms.
   * AniList scores (0-100) are divided by 10; others are already 0-10.
   *
   * Boundary: a value of exactly 10 stays at 10 (the comparison uses strict `>`).
   */
  get normalizedScore(): number | null {
    if (this.anilistScore != null) {
      return this.anilistScore > 10 ? this.anilistScore / 10 : this.anilistScore;
    }
    if (this.malScore != null) return this.malScore;
    if (this.bangumiScore != null) return this.bangumiScore;
    return null;
  }

  // Backward-compatibility alias.
  get seasonYear(): number | null {
    return this.year;
  }

  /**
   * Best image URL for the requested type. Walks the platform priority list,
   * returns first hit, falls back to top-level `coverImageURL`/
   * `extraLargeImageURL`/`bannerImageURL` for the matching type.
   */
  bestImage(type: ImageType = 'large'): string | null {
    for (const platform of IMAGE_PRIORITY) {
      const data = this.platformImages[platform];
      if (!data) continue;
      const candidate = data[type];
      if (candidate) return candidate;
    }

    switch (type) {
      case 'large':
        return this.coverImageURL;
      case 'extraLarge':
        return this.extraLargeImageURL;
      case 'banner':
        return this.bannerImageURL;
    }
  }

  // MARK: - Equality / hashability

  equals(other: UnifiedAnimeItem | null | undefined): boolean {
    if (!other) return false;
    return this.id === other.id;
  }

  /**
   * Stable hash code derived from `id`. Mirrors the Swift `Hashable`
   * semantics: two items with the same `id` produce the same hash.
   */
  get hashCode(): string {
    return this.id;
  }

  // MARK: - Static helpers

  /**
   * Concatenate all titles + synonyms into a single lowercased keyword string
   * for fast in-memory search.
   */
  static buildSearchKeywords(params: {
    titleDefault: string;
    titleEn?: string | null;
    titleJp?: string | null;
    titleCn?: string | null;
    synonyms?: string[];
  }): string {
    const titles = [params.titleDefault, params.titleEn, params.titleJp, params.titleCn].filter(
      (t): t is string => t != null
    );
    const synonyms = params.synonyms ?? [];
    return [...titles, ...synonyms].join(' ').toLowerCase();
  }

  /**
   * Merge multiple per-platform UnifiedAnimeItems into a single canonical item.
   * Returns `null` for empty input (per `edge_cases.md`), never throws.
   *
   * Precedence:
   * - title:   bangumi > MAL > AniList > first item
   * - cover:   AniList > Bangumi > MAL > first item
   * - score:   anilist/mal/bangumi captured separately; consumer normalizes
   * - genres:  unique union, sorted alphabetically
   * - tags:    unique union, sorted alphabetically
   * - status:  watching > completed > on_hold > dropped > planned
   * - progress: max across inputs
   */
  static merge(items: UnifiedAnimeItem[]): UnifiedAnimeItem | null {
    if (items.length === 0) return null;

    const bangumi = items.find((it) => it.sourcePlatform === 'bangumi');
    const mal = items.find((it) => it.sourcePlatform === 'myanimelist');
    const anilist = items.find((it) => it.sourcePlatform === 'anilist');
    const fallback = items[0];

    const title = bangumi?.title ?? mal?.title ?? anilist?.title ?? fallback.title ?? 'Unknown';

    const coverImageURL =
      anilist?.coverImageURL ??
      bangumi?.coverImageURL ??
      mal?.coverImageURL ??
      fallback.coverImageURL ??
      null;

    const platformImages: Partial<Record<PlatformType, PlatformImageData>> = {};
    for (const item of items) {
      // Carry forward each item's platform image entry plus its own coverImageURL.
      const existing = item.platformImages[item.sourcePlatform ?? 'kavita'];
      if (existing) {
        if (item.sourcePlatform) {
          platformImages[item.sourcePlatform] = existing;
        }
      } else if (item.sourcePlatform && item.coverImageURL) {
        platformImages[item.sourcePlatform] = { large: item.coverImageURL };
      }
    }

    const maxProgress = items.reduce((acc, it) => Math.max(acc, it.maxProgress), 0);

    const status = UnifiedAnimeItem.determineStatus(items);

    const platformData: Partial<Record<PlatformType, PlatformAnimeData>> = {};
    const syncStatus: Partial<Record<PlatformType, PlatformSyncStatus>> = {};
    for (const item of items) {
      if (!item.sourcePlatform) continue;
      const owned = item.platformData[item.sourcePlatform];
      platformData[item.sourcePlatform] = owned ?? {
        id: item.id,
        progress: item.maxProgress,
        score: item.normalizedScore ?? undefined,
        status: item.status,
      };
      syncStatus[item.sourcePlatform] = 'synced';
    }

    const genres = uniqueSorted(items.flatMap((it) => it.genres));
    const tags = uniqueSorted(items.flatMap((it) => it.tags));
    const studios = uniqueSorted(items.flatMap((it) => it.studios));

    return new UnifiedAnimeItem({
      title,
      titleEnglish: anilist?.titleEnglish ?? mal?.titleEnglish ?? bangumi?.titleEnglish ?? null,
      titleJapanese: bangumi?.titleJapanese ?? mal?.titleJapanese ?? anilist?.titleJapanese ?? null,
      titleChinese: bangumi?.titleChinese ?? null,
      titleChineseTraditional: bangumi?.titleChineseTraditional ?? null,
      titleRussian: items.find((it) => it.titleRussian != null)?.titleRussian ?? null,
      titleRomaji: anilist?.titleRomaji ?? null,
      synonyms: uniqueSorted(items.flatMap((it) => it.synonyms)),
      synopsis: anilist?.synopsis ?? bangumi?.synopsis ?? mal?.synopsis ?? fallback.synopsis,
      idMal: mal?.idMal ?? items.find((it) => it.idMal != null)?.idMal ?? null,
      format: anilist?.format ?? mal?.format ?? bangumi?.format ?? fallback.format,
      coverImageURL,
      extraLargeImageURL:
        anilist?.extraLargeImageURL ??
        bangumi?.extraLargeImageURL ??
        mal?.extraLargeImageURL ??
        fallback.extraLargeImageURL,
      bannerImageURL:
        anilist?.bannerImageURL ??
        bangumi?.bannerImageURL ??
        mal?.bannerImageURL ??
        fallback.bannerImageURL,
      platformImages,
      malScore: mal?.malScore ?? null,
      bangumiScore: bangumi?.bangumiScore ?? null,
      anilistScore: anilist?.anilistScore ?? null,
      maxProgress,
      totalEpisodes:
        anilist?.totalEpisodes ??
        mal?.totalEpisodes ??
        bangumi?.totalEpisodes ??
        fallback.totalEpisodes,
      year: anilist?.year ?? mal?.year ?? bangumi?.year ?? fallback.year,
      season: anilist?.season ?? mal?.season ?? bangumi?.season ?? fallback.season,
      startDate: anilist?.startDate ?? mal?.startDate ?? bangumi?.startDate ?? fallback.startDate,
      broadcastDay:
        anilist?.broadcastDay ??
        mal?.broadcastDay ??
        bangumi?.broadcastDay ??
        fallback.broadcastDay,
      status,
      genres,
      tags,
      studios,
      platformData,
      syncStatus,
    });
  }

  private static determineStatus(items: UnifiedAnimeItem[]): WatchStatus {
    const order: WatchStatus[] = ['watching', 'completed', 'on_hold', 'dropped'];
    for (const candidate of order) {
      if (items.some((it) => it.status === candidate)) {
        return candidate;
      }
    }
    return 'planned';
  }
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}
