import {
  BangumiClient,
  type BangumiRelatedSubject,
  type BangumiV0Subject,
} from '../../clients/bangumi-client';
import { anitabiService } from './anitabi-service';
import type { AnitabiBangumi, AnitabiPoint } from './types';

export type PilgrimageSeriesSelection = 'all' | number;

export interface PilgrimageSeriesPoint extends AnitabiPoint {
  sourceBangumiId: number;
  sourceAnimeTitle: string;
  sourceLabel: string;
}

export interface PilgrimageSeriesSubject {
  id: number;
  title: string;
  titleCn: string;
  relation: string;
  date: string | null;
  platform: string | null;
  label: string;
}

export interface PilgrimageSeriesEntry {
  subject: PilgrimageSeriesSubject;
  anime: AnitabiBangumi | null;
  points: readonly PilgrimageSeriesPoint[];
}

export interface PilgrimageSeriesResult {
  seedId: number;
  entries: PilgrimageSeriesEntry[];
  availableEntries: PilgrimageSeriesEntry[];
  unavailableEntries: PilgrimageSeriesEntry[];
}

interface BangumiRelatedClient {
  getSubject(id: number | string): Promise<BangumiV0Subject>;
  getRelatedSubjects(id: number | string): Promise<BangumiRelatedSubject[]>;
}

interface AnitabiLiteClient {
  getAnimePilgrimage(id: number): Promise<AnitabiBangumi | null>;
}

interface ResolveSeriesOptions {
  bangumiClient?: BangumiRelatedClient;
  anitabi?: AnitabiLiteClient;
  maxDepth?: number;
  maxSubjects?: number;
}

interface CandidateSubject {
  subject: BangumiV0Subject;
  relation: string;
  depth: number;
}

const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_MAX_SUBJECTS = 16;

const STRONG_SERIES_RELATIONS = new Set([
  '续集',
  '前传',
  '主线故事',
  '番外篇',
  '衍生',
  '总集篇',
  '全集',
  'sequel',
  'prequel',
  'main story',
  'side story',
  'spin-off',
  'spin off',
  'summary',
  'parent story',
]);

const SAME_WORLD_RELATIONS = new Set(['相同世界观', 'same setting', 'same universe']);

export async function resolvePilgrimageSeries(
  seedId: number,
  options: ResolveSeriesOptions = {}
): Promise<PilgrimageSeriesResult> {
  const bangumiClient = options.bangumiClient ?? BangumiClient;
  const anitabi = options.anitabi ?? anitabiService;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxSubjects = options.maxSubjects ?? DEFAULT_MAX_SUBJECTS;

  let seedSubject: BangumiV0Subject | null = null;
  try {
    seedSubject = await bangumiClient.getSubject(seedId);
  } catch {
    const anime = await anitabi.getAnimePilgrimage(seedId).catch(() => null);
    const fallbackSubject = subjectFromAnimeOrId(seedId, anime);
    const entry = buildSeriesEntry(fallbackSubject, '原作', anime, 0, 0);
    return buildSeriesResult(seedId, [entry]);
  }

  const candidates = await collectRelatedCandidates(seedSubject, {
    bangumiClient,
    maxDepth,
    maxSubjects,
  });

  const sorted = sortCandidates(candidates);
  const anitabiEntries = await Promise.all(
    sorted.map(async (candidate, index) => {
      const anime = await anitabi.getAnimePilgrimage(candidate.subject.id).catch(() => null);
      return buildSeriesEntry(candidate.subject, candidate.relation, anime, index, sorted.length);
    })
  );

  return buildSeriesResult(seedId, anitabiEntries);
}

export function shouldIncludeRelatedSubjectInSeries(
  seed: BangumiV0Subject,
  related: BangumiRelatedSubject
): boolean {
  if (related.type !== 2) return false;
  const relation = normalizeRelation(related.relation);
  if (STRONG_SERIES_RELATIONS.has(relation)) return true;
  if (!SAME_WORLD_RELATIONS.has(relation)) return false;
  return hasTitleAffinity(seed, related);
}

export function mergePilgrimageSeriesEntries(
  entries: readonly PilgrimageSeriesEntry[],
  selection: PilgrimageSeriesSelection
): { anime: AnitabiBangumi | null; points: PilgrimageSeriesPoint[] } {
  const selected =
    selection === 'all'
      ? entries.filter((entry) => entry.anime !== null)
      : entries.filter((entry) => entry.subject.id === selection && entry.anime !== null);

  const available = selected.filter(
    (entry): entry is PilgrimageSeriesEntry & { anime: AnitabiBangumi } => entry.anime !== null
  );
  if (available.length === 0) return { anime: null, points: [] };

  if (selection !== 'all') {
    const entry = available[0];
    return {
      anime: entry.anime,
      points: [...entry.points],
    };
  }

  const primary = available[0].anime;
  const points = available.flatMap((entry) => entry.points);
  const anime: AnitabiBangumi = {
    ...primary,
    title: primary.title,
    cn: primary.cn,
    pointsLength: available.reduce((sum, entry) => sum + (entry.anime.pointsLength ?? 0), 0),
    imagesLength: available.reduce((sum, entry) => sum + (entry.anime.imagesLength ?? 0), 0),
    litePoints: points,
  };
  return { anime, points };
}

export function annotatePilgrimageSeriesPoints(
  points: readonly AnitabiPoint[],
  anime: AnitabiBangumi,
  label: string
): PilgrimageSeriesPoint[] {
  return points.map((point) => annotatePoint(point, anime, label));
}

async function collectRelatedCandidates(
  seed: BangumiV0Subject,
  options: {
    bangumiClient: BangumiRelatedClient;
    maxDepth: number;
    maxSubjects: number;
  }
): Promise<CandidateSubject[]> {
  const seen = new Map<number, CandidateSubject>();
  seen.set(seed.id, { subject: seed, relation: '原作', depth: 0 });
  const queue: CandidateSubject[] = [{ subject: seed, relation: '原作', depth: 0 }];

  while (queue.length > 0 && seen.size < options.maxSubjects) {
    const current = queue.shift();
    if (!current || current.depth >= options.maxDepth) continue;

    let related: BangumiRelatedSubject[] = [];
    try {
      related = await options.bangumiClient.getRelatedSubjects(current.subject.id);
    } catch {
      continue;
    }

    for (const item of related) {
      if (seen.size >= options.maxSubjects) break;
      if (!shouldIncludeRelatedSubjectInSeries(seed, item)) continue;
      if (seen.has(item.id)) continue;

      const subject = relatedToSubject(item);
      const candidate: CandidateSubject = {
        subject,
        relation: item.relation,
        depth: current.depth + 1,
      };
      seen.set(subject.id, candidate);
      queue.push(candidate);
    }
  }

  return [...seen.values()];
}

function buildSeriesResult(
  seedId: number,
  entries: PilgrimageSeriesEntry[]
): PilgrimageSeriesResult {
  const availableEntries = entries.filter((entry) => entry.anime !== null);
  return {
    seedId,
    entries,
    availableEntries,
    unavailableEntries: entries.filter((entry) => entry.anime === null),
  };
}

function buildSeriesEntry(
  subject: BangumiV0Subject,
  relation: string,
  anime: AnitabiBangumi | null,
  index: number,
  total: number
): PilgrimageSeriesEntry {
  const label = resolveSeriesLabel(subject, relation, index, total);
  const seriesSubject: PilgrimageSeriesSubject = {
    id: subject.id,
    title: subject.name,
    titleCn: subject.name_cn ?? '',
    relation,
    date: subject.date ?? null,
    platform: subject.platform ?? null,
    label,
  };
  return {
    subject: seriesSubject,
    anime,
    points: anime ? annotatePilgrimageSeriesPoints(anime.litePoints ?? [], anime, label) : [],
  };
}

function annotatePoint(
  point: AnitabiPoint,
  anime: AnitabiBangumi,
  label: string
): PilgrimageSeriesPoint {
  return {
    ...point,
    sourceBangumiId: anime.id,
    sourceAnimeTitle: anime.title,
    sourceLabel: label,
  };
}

function sortCandidates(candidates: CandidateSubject[]): CandidateSubject[] {
  return [...candidates].sort((a, b) => {
    const dateA = dateRank(a.subject.date);
    const dateB = dateRank(b.subject.date);
    if (dateA !== dateB) return dateA - dateB;
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.subject.id - b.subject.id;
  });
}

function dateRank(date: string | undefined): number {
  if (!date) return Number.POSITIVE_INFINITY;
  const ts = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(ts) ? ts : Number.POSITIVE_INFINITY;
}

function resolveSeriesLabel(
  subject: BangumiV0Subject,
  relation: string,
  index: number,
  total: number
): string {
  const title = normalizeTitle(subject.name);
  const platform = normalizeTitle(subject.platform ?? '');
  const relationKey = normalizeRelation(relation);

  if (platform.includes('剧场版') || title.includes('映画') || title.includes('劇場版')) {
    return 'Movie';
  }
  const seasonMatch = title.match(/season\s*0*([0-9]+)/);
  if (seasonMatch) return `S${Number(seasonMatch[1])}`;
  const ordinalMatch = title.match(/([0-9]+)(?:st|nd|rd|th)\s*season/);
  if (ordinalMatch) return `S${Number(ordinalMatch[1])}`;
  if (title.includes('第二季') || title.includes('二期')) return 'S2';
  if (title.includes('第三季') || title.includes('三期')) return 'S3';
  if (title.includes('第四季') || title.includes('四期')) return 'S4';
  const franchiseLabel = getFranchiseLabel(subject.name);
  if (franchiseLabel) return franchiseLabel;
  if (relationKey === '总集篇' || relationKey === '全集') return 'Recap';
  if (relationKey === '番外篇' || relationKey === '衍生') return 'Side';
  if (total > 1) return `S${index + 1}`;
  return 'Main';
}

function getFranchiseLabel(title: string): string | null {
  const bangDream = title.match(/^BanG Dream!\s*(.*)$/i);
  if (!bangDream) return null;
  const suffix = bangDream[1]?.trim();
  if (!suffix) return 'BanG Dream!';
  return suffix.replace(/^[:：/\-\s]+/, '') || 'BanG Dream!';
}

function relatedToSubject(item: BangumiRelatedSubject): BangumiV0Subject {
  return {
    id: item.id,
    type: item.type,
    name: item.name,
    name_cn: item.name_cn,
    date: item.date,
    platform: item.platform,
    images: item.images,
    eps: item.eps,
    total_episodes: item.total_episodes,
    summary: item.summary,
    rating: item.rating,
    collection: item.collection,
    tags: item.tags,
    infobox: item.infobox,
    nsfw: item.nsfw,
  };
}

function subjectFromAnimeOrId(id: number, anime: AnitabiBangumi | null): BangumiV0Subject {
  return {
    id,
    type: 2,
    name: anime?.title ?? `Bangumi #${id}`,
    name_cn: anime?.cn ?? '',
  };
}

function hasTitleAffinity(seed: BangumiV0Subject, related: BangumiRelatedSubject): boolean {
  const seedKeys = titleAffinityKeys(seed);
  const relatedTitle = compactTitle([related.name, related.name_cn].filter(Boolean).join(' '));
  if (!relatedTitle) return false;
  return seedKeys.some((key) => key.length >= 5 && relatedTitle.includes(key));
}

function titleAffinityKeys(subject: BangumiV0Subject): string[] {
  const values = [subject.name, subject.name_cn].filter(Boolean);
  const keys = new Set<string>();
  for (const value of values) {
    const compact = compactTitle(value);
    if (compact.length >= 5) keys.add(compact);
    const bangDream = compact.match(/bangdream/);
    if (bangDream) keys.add(bangDream[0]);
  }
  return [...keys];
}

function compactTitle(value: string): string {
  return normalizeTitle(value).replace(/[^0-9a-z\u3040-\u30ff\u3400-\u9fff]+/g, '');
}

function normalizeRelation(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

function normalizeTitle(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}
