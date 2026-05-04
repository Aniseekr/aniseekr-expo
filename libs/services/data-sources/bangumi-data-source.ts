/**
 * Bangumi data source.
 *
 * Strategy (per `spec/api_contracts.md` §3 §Delegation):
 *   - `fetchAnimeDetail(id)` → native `/v0/subjects/{id}` (preferred for
 *     Chinese title, Bangumi rating, infobox aliases).
 *   - List/search operations (`searchAnime`, `fetchTopAnime`,
 *     `fetchSeasonalAnime`, `fetchAnime`, `fetchGenres`) → delegate to AniList
 *     because Bangumi has no native top/seasonal endpoints; results are then
 *     enriched with `titleChinese` from a parallel `/v0/search/subjects` call.
 *
 * AniList delegation uses constructor injection (`aniListSource`) so this
 * module's tests can run without depending on the AniList agent's concrete
 * implementation. When no source is injected, we lazy-load the real
 * `AniListDataSource` via dynamic import on first use.
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
import { AniListDataSource } from './anilist-data-source';
import { DataSourceError } from './data-source-error';
import { UnifiedAnimeItem } from '../../models/unified-anime-item';
import type { PlatformImageData } from '../../models/platform-image-data';
import {
  BangumiClient,
  normalizeBangumiImage,
  type BangumiV0Subject,
  type BangumiInfoboxField,
} from '../../clients/bangumi-client';
import { Logger } from '../../utils/logger';

interface BangumiDataSourceOptions {
  /**
   * AniList data source used for list/search delegation. Constructor
   * injection keeps the unit tests independent of the AniList agent's
   * implementation; production code passes the real AniList source when
   * the repository wires everything together.
   */
  aniListSource?: AnimeDataSource;
  /**
   * Override the Bangumi client (e.g., to inject a fake fetch in tests).
   * Static methods on `BangumiClient` are used by default.
   */
  client?: typeof BangumiClient;
  /** Optional Bangumi access token for authenticated requests. */
  accessToken?: string;
  /** Skip rate-limit waits (used by tests). */
  skipRateLimit?: boolean;
}

/**
 * Resolver for the AniList data source. Used to defer the dynamic import
 * until first delegation so this module never has a static dependency on
 * the AniList implementation file (whose owner is a sibling agent).
 */
type AniListResolver = () => Promise<AnimeDataSource>;

export class BangumiDataSource implements AnimeDataSource {
  readonly type: PlatformType = 'bangumi';

  private readonly client: typeof BangumiClient;
  private readonly accessToken?: string;
  private readonly skipRateLimit: boolean;

  /** Resolves to the AniList data source. Cached after first call. */
  private aniListResolver: AniListResolver;
  private cachedAniList: AnimeDataSource | null;

  constructor(opts: BangumiDataSourceOptions = {}) {
    this.client = opts.client ?? BangumiClient;
    this.accessToken = opts.accessToken;
    this.skipRateLimit = opts.skipRateLimit ?? false;

    if (opts.aniListSource) {
      this.cachedAniList = opts.aniListSource;
      this.aniListResolver = async () => opts.aniListSource as AnimeDataSource;
    } else {
      this.cachedAniList = null;
      this.aniListResolver = defaultAniListResolver;
    }

    // Glue in the protocol's no-op defaults for the media/stats methods we
    // don't override below (Bangumi doesn't expose staff/relations/etc.).
    Object.assign(this, defaultMediaStubs(), defaultStatsStub());
  }

  // Default-stubbed members (assigned in constructor via Object.assign).
  fetchAnimeStaff!: (id: string) => Promise<AnimeStaff[]>;
  fetchAnimeRelations!: (id: string) => Promise<AnimeRelation[]>;
  fetchAnimeStreaming!: (id: string) => Promise<AnimeStreaming[]>;
  fetchAnimeThemes!: (id: string) => Promise<AnimeTheme | null>;
  fetchStatistics!: (id: string) => Promise<PlatformRatingData | null>;

  // MARK: - Native: Bangumi v0 detail

  async fetchAnimeDetail(id: string): Promise<UnifiedAnimeItem> {
    const subject = await this.client.getSubject(id, {
      accessToken: this.accessToken,
      skipRateLimit: this.skipRateLimit,
    });
    // Defensive: per edge_cases.md §Bangumi Specific, non-anime types must
    // surface as INVALID_ID rather than be treated as anime.
    if (subject.type !== undefined && subject.type !== 2) {
      throw new DataSourceError({
        code: 'INVALID_ID',
        message: `Bangumi subject ${id} is not anime (type=${subject.type})`,
        platform: 'bangumi',
      });
    }
    return convertSubjectToUnifiedItem(subject);
  }

  // MARK: - Delegated: search / top / seasonal / by-genre / genres

  async searchAnime(query: string, page?: number): Promise<UnifiedAnimeItem[]> {
    const aniList = await this.getAniList();
    const items = await aniList.searchAnime(query, page);
    return this.enrichWithChineseTitles(items, query);
  }

  async fetchTopAnime(page?: number): Promise<UnifiedAnimeItem[]> {
    const aniList = await this.getAniList();
    const items = await aniList.fetchTopAnime(page);
    return this.enrichWithChineseTitles(items);
  }

  async fetchSeasonalAnime(
    page?: number,
    season?: string,
    year?: number
  ): Promise<UnifiedAnimeItem[]> {
    const aniList = await this.getAniList();
    const items = await aniList.fetchSeasonalAnime(page, season, year);
    return this.enrichWithChineseTitles(items);
  }

  async fetchAnime(page: number, genreId?: number): Promise<UnifiedAnimeItem[]> {
    const aniList = await this.getAniList();
    const items = await aniList.fetchAnime(page, genreId);
    return this.enrichWithChineseTitles(items);
  }

  async fetchGenres(): Promise<AnimeGenre[]> {
    const aniList = await this.getAniList();
    return aniList.fetchGenres();
  }

  // MARK: - AniList resolution

  private async getAniList(): Promise<AnimeDataSource> {
    if (this.cachedAniList) return this.cachedAniList;
    const resolved = await this.aniListResolver();
    this.cachedAniList = resolved;
    return resolved;
  }

  // MARK: - Chinese-title enrichment

  /**
   * For each item, look up its Bangumi search match and copy `titleChinese`
   * onto the item (best-effort). Failures do not throw — we just return the
   * unenriched items, matching the spec's "best-effort" wording.
   *
   * @param items   AniList-shaped UnifiedAnimeItems
   * @param keyword Optional keyword the user searched for. When omitted (top/
   *                seasonal) we issue per-title lookups against Bangumi.
   */
  private async enrichWithChineseTitles(
    items: UnifiedAnimeItem[],
    keyword?: string
  ): Promise<UnifiedAnimeItem[]> {
    if (items.length === 0) return items;

    try {
      // When the caller supplied a keyword, do a single Bangumi search and
      // try to match each AniList item by title.
      if (keyword !== undefined && keyword.length > 0) {
        const searchResp = await this.client.searchSubjects(keyword, 1, {
          skipRateLimit: this.skipRateLimit,
        });
        const candidates = searchResp.data ?? [];
        return items.map((item) => enrichItemWithCandidates(item, candidates));
      }

      // Otherwise issue one Bangumi search per item, bounded to a small
      // concurrency window to avoid hammering the API.
      const enriched = await Promise.all(
        items.map(async (item) => {
          const probe = pickBestSearchKeyword(item);
          if (!probe) return item;
          try {
            const searchResp = await this.client.searchSubjects(probe, 1, {
              skipRateLimit: this.skipRateLimit,
            });
            return enrichItemWithCandidates(item, searchResp.data ?? []);
          } catch (err) {
            Logger.warn('[BangumiDataSource] enrich search failed', err);
            return item;
          }
        })
      );
      return enriched;
    } catch (err) {
      Logger.warn('[BangumiDataSource] enrichWithChineseTitles failed', err);
      return items;
    }
  }
}

// MARK: - Module-level helpers (exported for tests where useful)

/**
 * Default resolver for the AniList data source. Static import so Hermes
 * can compile the production bundle (it doesn't support `import()`
 * expressions). Tests inject a mock via the constructor.
 */
const defaultAniListResolver: AniListResolver = async () => new AniListDataSource();

/**
 * Convert a Bangumi v0 subject into a UnifiedAnimeItem.
 *
 * Mapping per `spec/api_contracts.md` §3:
 *   - `name_cn` → titleChinese (when non-empty); also wins as `title`.
 *   - `name`    → titleJapanese; falls back to `title` when no Chinese.
 *   - HTTP image URLs on bgm.tv hosts are rewritten to HTTPS.
 *   - Tags carry through as-is.
 */
export function convertSubjectToUnifiedItem(subject: BangumiV0Subject): UnifiedAnimeItem {
  const cover = normalizeBangumiImage(subject.images?.large ?? subject.images?.common ?? null);
  const titleChinese = subject.name_cn && subject.name_cn.length > 0 ? subject.name_cn : null;
  const title = titleChinese ?? subject.name;

  const platformImages: Partial<Record<PlatformType, PlatformImageData>> = {};
  if (cover) {
    platformImages.bangumi = {
      large: cover,
      extraLarge: cover,
    };
  }

  const startDate = parseBangumiDate(subject.date);
  const tags = (subject.tags ?? []).map((t) => t.name).filter((n) => n.length > 0);
  const { titleEnglish, titleRomaji, synonyms } = extractInfoboxAliases(subject.infobox ?? null);

  return new UnifiedAnimeItem({
    title,
    titleEnglish,
    titleJapanese: subject.name,
    titleChinese,
    titleRomaji,
    synonyms,
    synopsis: subject.summary ?? null,
    format: subject.platform ?? null,
    coverImageURL: cover,
    extraLargeImageURL: cover,
    platformImages,
    bangumiScore: subject.rating?.score ?? null,
    totalEpisodes: subject.total_episodes ?? subject.eps ?? null,
    year: parseBangumiYear(subject.date),
    startDate,
    tags,
    platformData: {
      bangumi: {
        id: String(subject.id),
        progress: 0,
        score: subject.rating?.score,
        status: 'unknown',
      },
    },
    syncStatus: { bangumi: 'synced' },
  });
}

function parseBangumiDate(date: string | null | undefined): Date | null {
  if (!date) return null;
  // Bangumi serves YYYY-MM-DD; let Date parse handle it. Treat invalid as null.
  const parsed = new Date(date + 'T00:00:00Z');
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function parseBangumiYear(date: string | null | undefined): number | null {
  if (!date) return null;
  const yearPart = date.split('-')[0];
  const n = Number(yearPart);
  return Number.isFinite(n) ? n : null;
}

interface InfoboxAliases {
  titleEnglish: string | null;
  titleRomaji: string | null;
  synonyms: string[];
}

/**
 * Read aliases from a Bangumi infobox. Mirrors the iOS heuristic: pull the
 * "别名" / "alias" rows and pick the first Latin-looking string as the
 * English title.
 */
function extractInfoboxAliases(infobox: BangumiInfoboxField[] | null): InfoboxAliases {
  if (!infobox) {
    return { titleEnglish: null, titleRomaji: null, synonyms: [] };
  }
  const synonyms: string[] = [];
  let titleEnglish: string | null = null;
  let titleRomaji: string | null = null;

  for (const field of infobox) {
    const key = (field.key ?? '').toLowerCase();
    if (key !== '别名' && key !== 'alias' && key !== 'aliases') continue;
    const values = flattenInfoboxValue(field.value);
    for (const v of values) {
      if (!v) continue;
      synonyms.push(v);
      const looksLatin = /^[\x20-\x7e]+$/.test(v);
      if (looksLatin) {
        if (titleEnglish === null) titleEnglish = v;
        else if (titleRomaji === null) titleRomaji = v;
      }
    }
  }

  return { titleEnglish, titleRomaji, synonyms };
}

function flattenInfoboxValue(value: BangumiInfoboxField['value']): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    return value
      .map((entry) => entry?.v)
      .filter((s): s is string => typeof s === 'string' && s.length > 0);
  }
  return [];
}

/**
 * Pick the candidate Bangumi subject whose titles match `item` and clone the
 * item with `titleChinese` set. Returns the item unchanged when no candidate
 * matches.
 */
function enrichItemWithCandidates(
  item: UnifiedAnimeItem,
  candidates: BangumiV0Subject[]
): UnifiedAnimeItem {
  if (candidates.length === 0) return item;
  const match = candidates.find((c) => candidateMatchesItem(c, item));
  if (!match) return item;
  const chinese = match.name_cn && match.name_cn.length > 0 ? match.name_cn : null;
  if (!chinese) return item;
  return cloneWithChineseTitle(item, chinese, match.id);
}

function candidateMatchesItem(candidate: BangumiV0Subject, item: UnifiedAnimeItem): boolean {
  const knownTitles = [item.titleJapanese, item.titleEnglish, item.titleRomaji, item.title]
    .filter((t): t is string => typeof t === 'string' && t.length > 0)
    .map((t) => t.toLowerCase());
  if (knownTitles.length === 0) return false;
  const candidateTitles = [candidate.name, candidate.name_cn]
    .filter((t): t is string => typeof t === 'string' && t.length > 0)
    .map((t) => t.toLowerCase());
  return candidateTitles.some((c) => knownTitles.includes(c));
}

function cloneWithChineseTitle(
  item: UnifiedAnimeItem,
  chineseTitle: string,
  bangumiId: number
): UnifiedAnimeItem {
  const platformData = { ...item.platformData };
  if (!platformData.bangumi) {
    platformData.bangumi = {
      id: String(bangumiId),
      progress: item.maxProgress,
      score: item.bangumiScore ?? undefined,
      status: item.status,
    };
  }
  return new UnifiedAnimeItem({
    title: chineseTitle,
    titleEnglish: item.titleEnglish,
    titleJapanese: item.titleJapanese,
    titleChinese: chineseTitle,
    titleChineseTraditional: item.titleChineseTraditional,
    titleRussian: item.titleRussian,
    titleRomaji: item.titleRomaji,
    synonyms: item.synonyms,
    synopsis: item.synopsis,
    idMal: item.idMal,
    format: item.format,
    coverImageURL: item.coverImageURL,
    extraLargeImageURL: item.extraLargeImageURL,
    bannerImageURL: item.bannerImageURL,
    platformImages: item.platformImages,
    malScore: item.malScore,
    bangumiScore: item.bangumiScore,
    anilistScore: item.anilistScore,
    maxProgress: item.maxProgress,
    totalEpisodes: item.totalEpisodes,
    year: item.year,
    season: item.season,
    startDate: item.startDate,
    broadcastDay: item.broadcastDay,
    status: item.status,
    genres: item.genres,
    tags: item.tags,
    studios: item.studios,
    platformData,
    syncStatus: item.syncStatus,
  });
}

function pickBestSearchKeyword(item: UnifiedAnimeItem): string | null {
  return item.titleJapanese ?? item.titleEnglish ?? item.titleRomaji ?? item.title ?? null;
}
