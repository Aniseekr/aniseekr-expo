import { LocalDB } from '../../db';
import type { PlatformType, UniversalAnimeItem, AnimeStatus } from '../auth/types';

export type ConflictField = 'progress' | 'status' | 'score';
export type ConflictResolution = 'last_write_wins' | 'manual' | 'highest';

export interface ConflictValueEntry {
  platform: PlatformType;
  value: string | number;
  updatedAt: number;
}

export interface ConflictRecord {
  id: number;
  animeId: string;
  field: ConflictField;
  values: ConflictValueEntry[];
  resolved: boolean;
  resolution?: string;
  detectedAt: number;
  resolvedAt?: number;
}

export interface ResolvedField<T> {
  value: T;
  source: PlatformType;
  conflictId?: number;
}

export interface MergeResult {
  merged: UniversalAnimeItem;
  conflictIds: number[];
}

const STATUS_PRIORITY: Record<AnimeStatus, number> = {
  watching: 4,
  completed: 5,
  on_hold: 3,
  dropped: 2,
  planned: 1,
};

class ConflictResolutionService {
  private static instance: ConflictResolutionService;

  static getInstance(): ConflictResolutionService {
    if (!ConflictResolutionService.instance) {
      ConflictResolutionService.instance = new ConflictResolutionService();
    }
    return ConflictResolutionService.instance;
  }

  async mergeGroup(group: UniversalAnimeItem[]): Promise<MergeResult> {
    if (group.length === 0) {
      throw new Error('Cannot merge empty group');
    }
    if (group.length === 1) {
      return { merged: group[0], conflictIds: [] };
    }

    const conflictIds: number[] = [];
    const animeId = this.composeAnimeId(group);

    const progress = await this.resolveField(
      animeId,
      'progress',
      group.map((i) => ({
        platform: i.source,
        value: i.progress,
        updatedAt: i.updatedAt.getTime(),
      })),
      'highest',
      conflictIds
    );

    const status = await this.resolveField(
      animeId,
      'status',
      group.map((i) => ({
        platform: i.source,
        value: i.status,
        updatedAt: i.updatedAt.getTime(),
      })),
      'manual',
      conflictIds
    );

    const scoreCandidates = group
      .filter((i) => typeof i.score === 'number')
      .map((i) => ({
        platform: i.source,
        value: i.score!,
        updatedAt: i.updatedAt.getTime(),
      }));
    const score =
      scoreCandidates.length === 0
        ? undefined
        : await this.resolveField(
            animeId,
            'score',
            scoreCandidates,
            'last_write_wins',
            conflictIds
          );

    const platformIds = group.reduce<UniversalAnimeItem['platformIds']>(
      (acc, item) => ({ ...acc, ...item.platformIds }),
      {}
    );

    const newest = group.reduce((latest, candidate) =>
      candidate.updatedAt > latest.updatedAt ? candidate : latest
    );

    return {
      merged: {
        ...newest,
        platformIds,
        progress: progress.value as number,
        status: status.value as AnimeStatus,
        score: score?.value as number | undefined,
      },
      conflictIds,
    };
  }

  async listUnresolved(): Promise<ConflictRecord[]> {
    const db = await LocalDB.getDatabase();
    const rows = await db.getAllAsync<{
      id: number;
      anime_id: string;
      field: string;
      values_json: string;
      resolved: number;
      resolution: string | null;
      detected_at: number;
      resolved_at: number | null;
    }>(
      `SELECT id, anime_id, field, values_json, resolved, resolution,
              detected_at, resolved_at
       FROM sync_conflicts
       WHERE resolved = 0
       ORDER BY detected_at DESC`
    );

    return rows.map((row) => ({
      id: row.id,
      animeId: row.anime_id,
      field: row.field as ConflictField,
      values: parseValues(row.values_json),
      resolved: row.resolved === 1,
      resolution: row.resolution ?? undefined,
      detectedAt: row.detected_at,
      resolvedAt: row.resolved_at ?? undefined,
    }));
  }

  async resolveManually(conflictId: number, picked: PlatformType): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.runAsync(
      `UPDATE sync_conflicts
       SET resolved = 1, resolution = ?, resolved_at = ?
       WHERE id = ?`,
      `manual:${picked}`,
      Date.now(),
      conflictId
    );
  }

  async dismiss(conflictId: number): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.runAsync(
      `UPDATE sync_conflicts
       SET resolved = 1, resolution = 'dismissed', resolved_at = ?
       WHERE id = ?`,
      Date.now(),
      conflictId
    );
  }

  private async resolveField<T extends string | number>(
    animeId: string,
    field: ConflictField,
    candidates: ConflictValueEntry[],
    strategy: ConflictResolution,
    sink: number[]
  ): Promise<ResolvedField<T>> {
    if (candidates.length === 0) {
      throw new Error('Cannot resolve empty candidate set');
    }
    const distinct = new Set(candidates.map((c) => String(c.value)));
    if (distinct.size === 1) {
      const winner = candidates[0];
      return { value: winner.value as T, source: winner.platform };
    }

    let winner: ConflictValueEntry;
    switch (strategy) {
      case 'highest':
        winner = candidates.reduce((best, c) => (Number(c.value) > Number(best.value) ? c : best));
        break;
      case 'last_write_wins':
        winner = candidates.reduce((best, c) => (c.updatedAt > best.updatedAt ? c : best));
        break;
      case 'manual':
      default:
        winner = pickStatusWinner(candidates);
        break;
    }

    const conflictId = await this.recordConflict(animeId, field, candidates);
    sink.push(conflictId);

    return {
      value: winner.value as T,
      source: winner.platform,
      conflictId,
    };
  }

  private async recordConflict(
    animeId: string,
    field: ConflictField,
    candidates: ConflictValueEntry[]
  ): Promise<number> {
    const db = await LocalDB.getDatabase();
    const valuesJson = JSON.stringify(candidates);
    const result = await db.runAsync(
      `INSERT INTO sync_conflicts (anime_id, field, values_json, detected_at)
       VALUES (?, ?, ?, ?)`,
      animeId,
      field,
      valuesJson,
      Date.now()
    );
    return result.lastInsertRowId;
  }

  private composeAnimeId(group: UniversalAnimeItem[]): string {
    const ids = Object.entries(group[0].platformIds).flatMap(([platform, id]) =>
      Boolean(id) ? [`${platform}:${id}`] : []
    );
    return ids.length > 0 ? ids.join('|') : group[0].id;
  }
}

function pickStatusWinner(candidates: ConflictValueEntry[]): ConflictValueEntry {
  return candidates.reduce((best, c) => {
    const candidatePriority = STATUS_PRIORITY[c.value as AnimeStatus] ?? 0;
    const bestPriority = STATUS_PRIORITY[best.value as AnimeStatus] ?? 0;
    if (candidatePriority > bestPriority) return c;
    if (candidatePriority === bestPriority && c.updatedAt > best.updatedAt) return c;
    return best;
  });
}

function parseValues(json: string): ConflictValueEntry[] {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

export const conflictResolutionService = ConflictResolutionService.getInstance();
