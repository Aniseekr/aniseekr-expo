// Bridges the user's collection (user_anime + favorites) with the Anitabi
// pilgrimage data set. For every collected anime we resolve a Bangumi subject
// id via IDMappingService and ask Anitabi for spots. Anime that can't be
// resolved or have no Anitabi entry are silently dropped.
//
// Used by the Pilgrimage tab's "Mine" filter so the map and list reflect what
// the user has actually collected, not just the curated `featured-anime` list.

import { LocalDB } from '../../db';
import type { PlatformType } from '../auth/types';
import { dataSourceConfig } from '../data-source-config';
import { idMappingService, IDMappingService } from '../sync/id-mapping-service';
import { anitabiService, AnitabiService } from './anitabi-service';
import type { AnitabiBangumi } from './types';

export type CollectionStatus = 'watching' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch';

export interface CollectionPilgrimageEntry {
  /** Resolved Anitabi payload. */
  anime: AnitabiBangumi;
  /** Original anime id from user_anime / favorites (browse-source platform id). */
  collectionAnimeId: string;
  /** Resolved bangumi subject id. */
  bangumiId: number;
  /** Status from `user_anime`, if present. */
  status?: CollectionStatus;
  /** True when present in the favorites table. */
  isFavorite: boolean;
}

export interface CollectionPilgrimageStats {
  /** Number of collected anime that have Anitabi spots. */
  matched: number;
  /** Total distinct anime ids checked across user_anime + favorites. */
  total: number;
}

interface ServiceDeps {
  db?: typeof LocalDB;
  mappingService?: IDMappingService;
  anitabi?: AnitabiService;
  /** Override the assumed platform of stored anime ids. Defaults to browseSource. */
  sourcePlatform?: PlatformType;
}

interface RawRow {
  anime_id: string;
  status?: string | null;
  is_favorite: number;
}

const STATUS_VALUES: ReadonlySet<CollectionStatus> = new Set([
  'watching',
  'completed',
  'on_hold',
  'dropped',
  'plan_to_watch',
]);

export class CollectionPilgrimageService {
  private readonly db: typeof LocalDB;
  private readonly mappingService: IDMappingService;
  private readonly anitabi: AnitabiService;
  private readonly sourceOverride: PlatformType | undefined;

  constructor(deps: ServiceDeps = {}) {
    this.db = deps.db ?? LocalDB;
    this.mappingService = deps.mappingService ?? idMappingService;
    this.anitabi = deps.anitabi ?? anitabiService;
    this.sourceOverride = deps.sourcePlatform;
  }

  /**
   * Returns every collected anime that has Anitabi pilgrimage data.
   * Deduped by bangumi id; favorites that are also tracked in user_anime
   * collapse into a single entry with both flags set.
   */
  async getEntries(): Promise<CollectionPilgrimageEntry[]> {
    const rows = await this.loadCollectionRows();
    if (rows.length === 0) return [];

    const platform = this.resolveSourcePlatform();
    const resolved = await this.resolveBangumiIds(rows, platform);
    return this.fetchAndZip(resolved);
  }

  /** Lightweight count for the "X / Y" header chip. */
  async getStats(): Promise<CollectionPilgrimageStats> {
    const rows = await this.loadCollectionRows();
    if (rows.length === 0) return { matched: 0, total: 0 };

    const platform = this.resolveSourcePlatform();
    const resolved = await this.resolveBangumiIds(rows, platform);
    const entries = await this.fetchAndZip(resolved);
    return { matched: entries.length, total: rows.length };
  }

  private resolveSourcePlatform(): PlatformType {
    return this.sourceOverride ?? dataSourceConfig.browseSource;
  }

  private async loadCollectionRows(): Promise<RawRow[]> {
    const db = await this.db.getDatabase();
    const rows = await db.getAllAsync<RawRow>(
      `SELECT anime_id, status, 0 AS is_favorite FROM user_anime
       UNION
       SELECT id AS anime_id, NULL AS status, 1 AS is_favorite FROM favorites`
    );

    // Merge duplicates: prefer the row that has a status, OR-merge favorite flag.
    const merged = new Map<string, RawRow>();
    for (const row of rows) {
      const existing = merged.get(row.anime_id);
      if (!existing) {
        merged.set(row.anime_id, row);
        continue;
      }
      merged.set(row.anime_id, {
        anime_id: row.anime_id,
        status: existing.status ?? row.status ?? null,
        is_favorite: existing.is_favorite || row.is_favorite ? 1 : 0,
      });
    }
    return [...merged.values()];
  }

  private async resolveBangumiIds(
    rows: RawRow[],
    platform: PlatformType
  ): Promise<{ row: RawRow; bangumiId: number }[]> {
    const out: { row: RawRow; bangumiId: number }[] = [];
    await Promise.all(
      rows.map(async (row) => {
        const bangumiId = await this.translateToBangumiId(row.anime_id, platform);
        if (bangumiId !== null) out.push({ row, bangumiId });
      })
    );
    return out;
  }

  private async translateToBangumiId(
    animeId: string,
    platform: PlatformType
  ): Promise<number | null> {
    if (platform === 'bangumi') {
      const parsed = Number(animeId);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    try {
      const mapped = await this.mappingService.mapID(platform, animeId, 'bangumi');
      if (mapped === null || mapped === undefined) return null;
      const numeric = typeof mapped === 'number' ? mapped : Number(mapped);
      return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
    } catch {
      return null;
    }
  }

  private async fetchAndZip(
    resolved: { row: RawRow; bangumiId: number }[]
  ): Promise<CollectionPilgrimageEntry[]> {
    if (resolved.length === 0) return [];

    const fetched = await Promise.all(
      resolved.map(async ({ row, bangumiId }) => {
        try {
          const anime = await this.anitabi.getAnimePilgrimage(bangumiId);
          if (!anime) return null;
          return { row, bangumiId, anime };
        } catch {
          return null;
        }
      })
    );

    const seen = new Set<number>();
    const entries: CollectionPilgrimageEntry[] = [];
    for (const item of fetched) {
      if (!item || seen.has(item.bangumiId)) continue;
      seen.add(item.bangumiId);
      const status = normalizeStatus(item.row.status);
      entries.push({
        anime: item.anime,
        collectionAnimeId: item.row.anime_id,
        bangumiId: item.bangumiId,
        status,
        isFavorite: !!item.row.is_favorite,
      });
    }
    return entries;
  }
}

function normalizeStatus(raw: string | null | undefined): CollectionStatus | undefined {
  if (!raw) return undefined;
  return STATUS_VALUES.has(raw as CollectionStatus) ? (raw as CollectionStatus) : undefined;
}

export const collectionPilgrimageService = new CollectionPilgrimageService();
