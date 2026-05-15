import {
  BangumiClient,
  type BangumiV0SearchResponse,
  type BangumiV0Subject,
} from '../../clients/bangumi-client';
import { getAllIndexed, type AnitabiIndexEntry } from './anitabi-index';
import { lookupByBangumiId, type AnitabiCrossIndexEntry } from './anitabi-cross-index';
import { normalizeAnitabiImageUrl } from './anitabi-image';
import { pilgrimageRepository } from './pilgrimage-repository';
import type { AnitabiBangumi } from './types';

export type PilgrimageSearchSource = 'anitabi-index' | 'bangumi-fallback';

export interface PilgrimageSearchResult {
  bangumiId: number;
  title: string;
  titleCn: string;
  titleEnglish?: string;
  titleRomaji?: string;
  city: string;
  cover: string;
  color: string;
  pointsLength: number;
  source: PilgrimageSearchSource;
}

interface SearchOptions {
  limit?: number;
  includeBangumiFallback?: boolean;
}

interface BangumiSearchClient {
  searchSubjects(keyword: string, page?: number): Promise<BangumiV0SearchResponse>;
}

interface RepositoryLike {
  getSpotsByBangumiId(bangumiId: number): Promise<AnitabiBangumi | null>;
}

interface ServiceOptions {
  getIndexed?: () => readonly AnitabiIndexEntry[];
  lookupCrossIndex?: (bangumiId: number) => AnitabiCrossIndexEntry | null;
  bangumiClient?: BangumiSearchClient;
  repository?: RepositoryLike;
}

interface ScoredEntry {
  entry: AnitabiIndexEntry;
  score: number;
}

const DEFAULT_LIMIT = 20;
const FALLBACK_CANDIDATE_LIMIT = 10;

export class PilgrimageSearchService {
  private readonly getIndexed: () => readonly AnitabiIndexEntry[];
  private readonly lookupCrossIndex: (bangumiId: number) => AnitabiCrossIndexEntry | null;
  private readonly bangumiClient: BangumiSearchClient;
  private readonly repository: RepositoryLike;

  constructor(options: ServiceOptions = {}) {
    this.getIndexed = options.getIndexed ?? getAllIndexed;
    this.lookupCrossIndex = options.lookupCrossIndex ?? lookupByBangumiId;
    this.bangumiClient = options.bangumiClient ?? BangumiClient;
    this.repository = options.repository ?? pilgrimageRepository;
  }

  async search(query: string, options: SearchOptions = {}): Promise<PilgrimageSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const limit = normalizeLimit(options.limit);
    const local = searchLocalPilgrimageIndex(
      trimmed,
      this.getIndexed(),
      limit,
      this.lookupCrossIndex
    );
    if (local.length > 0 || options.includeBangumiFallback === false) {
      return local;
    }

    return this.searchBangumiFallback(trimmed, limit);
  }

  private async searchBangumiFallback(
    query: string,
    limit: number
  ): Promise<PilgrimageSearchResult[]> {
    let response: BangumiV0SearchResponse;
    try {
      response = await this.bangumiClient.searchSubjects(query, 1);
    } catch (err) {
      console.warn('[PilgrimageSearchService] Bangumi fallback search failed:', err);
      return [];
    }

    const candidates = (response.data ?? [])
      .filter((subject) => subject.type === undefined || subject.type === 2)
      .slice(0, FALLBACK_CANDIDATE_LIMIT);

    const results: PilgrimageSearchResult[] = [];
    const seen = new Set<number>();
    for (const candidate of candidates) {
      if (!isValidSubjectId(candidate.id) || seen.has(candidate.id)) continue;
      seen.add(candidate.id);

      let anime: AnitabiBangumi | null;
      try {
        anime = await this.repository.getSpotsByBangumiId(candidate.id);
      } catch (err) {
        console.warn('[PilgrimageSearchService] Anitabi verification failed:', err);
        continue;
      }
      if (!anime) continue;

      results.push(
        resultFromAnitabi(anime, 'bangumi-fallback', candidate, this.lookupCrossIndex(anime.id))
      );
      if (results.length >= limit) break;
    }

    return results;
  }
}

export function searchLocalPilgrimageIndex(
  query: string,
  entries: readonly AnitabiIndexEntry[],
  limit: number = DEFAULT_LIMIT,
  lookupCrossIndex: (bangumiId: number) => AnitabiCrossIndexEntry | null = lookupByBangumiId
): PilgrimageSearchResult[] {
  const normalizedQuery = normalizeSearchKey(query);
  if (!normalizedQuery) return [];

  const scored: ScoredEntry[] = [];
  for (const entry of entries) {
    const cross = lookupCrossIndex(entry.id);
    const score = scoreEntry(entry, normalizedQuery, cross);
    if (score === null) continue;
    scored.push({ entry, score });
  }

  scored.sort(
    (a, b) =>
      a.score - b.score ||
      (b.entry.pointsLength ?? 0) - (a.entry.pointsLength ?? 0) ||
      a.entry.title.localeCompare(b.entry.title)
  );

  return scored
    .slice(0, normalizeLimit(limit))
    .map(({ entry }) => resultFromIndex(entry, lookupCrossIndex(entry.id)));
}

function scoreEntry(
  entry: AnitabiIndexEntry,
  query: string,
  cross: AnitabiCrossIndexEntry | null
): number | null {
  const fields: Array<{ value: string | number | null | undefined; base: number }> = [
    { value: cross?.titleEnglish, base: 0 },
    { value: cross?.titleRomaji, base: 0 },
    { value: cross?.titleJa, base: 0 },
    { value: cross?.titleCn, base: 0 },
    { value: entry.title, base: 0 },
    { value: entry.cn, base: 0 },
    { value: entry.city, base: 30 },
    { value: entry.id, base: 50 },
  ];

  let best: number | null = null;
  for (const field of fields) {
    const value = normalizeSearchKey(String(field.value ?? ''));
    if (!value) continue;
    let score: number | null = null;
    if (value === query) score = field.base;
    else if (value.startsWith(query)) score = field.base + 10;
    else if (value.includes(query)) score = field.base + 20;

    if (score !== null && (best === null || score < best)) {
      best = score;
    }
  }
  return best;
}

function resultFromIndex(
  entry: AnitabiIndexEntry,
  cross: AnitabiCrossIndexEntry | null
): PilgrimageSearchResult {
  return {
    bangumiId: entry.id,
    title: cross?.titleJa || entry.title,
    titleCn: entry.cn || cross?.titleCn || '',
    titleEnglish: cross?.titleEnglish || undefined,
    titleRomaji: cross?.titleRomaji || undefined,
    city: entry.city,
    cover: normalizeAnitabiImageUrl(entry.cover, entry.id),
    color: entry.color,
    pointsLength: entry.pointsLength,
    source: 'anitabi-index',
  };
}

function resultFromAnitabi(
  anime: AnitabiBangumi,
  source: PilgrimageSearchSource,
  fallbackSubject?: BangumiV0Subject,
  cross?: AnitabiCrossIndexEntry | null
): PilgrimageSearchResult {
  return {
    bangumiId: anime.id,
    title: cross?.titleJa || anime.title || fallbackSubject?.name || '',
    titleCn: anime.cn || cross?.titleCn || fallbackSubject?.name_cn || '',
    titleEnglish: cross?.titleEnglish || undefined,
    titleRomaji: cross?.titleRomaji || undefined,
    city: anime.city ?? '',
    cover: normalizeAnitabiImageUrl(anime.cover, anime.id),
    color: anime.color ?? '',
    pointsLength: anime.pointsLength ?? 0,
    source,
  };
}

function normalizeSearchKey(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[『』「」《》【】()[\]（）]/g, '')
    .replace(/[!！?？:：,，.。'’"“”・\-_–—\s　]+/g, '')
    .trim();
}

function normalizeLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.floor(limit);
}

function isValidSubjectId(id: unknown): id is number {
  return typeof id === 'number' && Number.isFinite(id) && id > 0;
}

export const pilgrimageSearchService = new PilgrimageSearchService();
