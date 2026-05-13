import * as FileSystem from 'expo-file-system';
import { LocalDB } from '../../db';
import type { PlatformType } from '../auth/types';

const MAPPING_URL =
  'https://github.com/Aniseekr/aniseekr-expo/releases/download/mapping-data/anime-id-mappings-merged.json';

/**
 * How long an on-device mapping is considered fresh. Mappings are rebuilt by
 * CI daily but the on-disk copy doesn't need to be refreshed that often — the
 * underlying upstream lists change slowly. 14 days keeps cold-launch fast and
 * caps cellular data usage at ~2 fetches/month.
 */
const FRESHNESS_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

const META_KEY_LAST_UPDATE = 'lastUpdatedAt';

interface AnimeMapping {
  mal_id?: number;
  anilist_id?: number;
  kitsu_id?: number;
  bangumi_id?: number;
  shikimori_id?: number;
  simkl_id?: number;
  annict_id?: number;
  anidb_id?: number;
  thetvdb_id?: number;
  themoviedb_id?: number;
  livechart_id?: number;
  // Both legacy (Fribb) and merged-script (snake_case) keys are accepted.
  'anime-planet_id'?: string;
  anime_planet_id?: string;
  anisearch_id?: number;
  'notify.moe_id'?: string;
  notify_moe_id?: string;
  type?: string;
}

const PLATFORM_TO_COLUMN: Partial<Record<PlatformType | string, string>> = {
  myanimelist: 'mal_id',
  anilist: 'anilist_id',
  kitsu: 'kitsu_id',
  bangumi: 'bangumi_id',
  shikimori: 'shikimori_id',
  simkl: 'simkl_id',
  annict: 'annict_id',
};

/**
 * Cross-platform anime ID translator.
 *
 * - SQLite-backed (table `id_mappings`) holds the mass-imported merged mapping
 *   list (Fribb × manami) downloaded from the `mapping-data` GitHub Release.
 * - `id_mappings_meta` records the last successful refresh so callers can
 *   short-circuit and avoid refetching on every launch.
 * - In-memory `manualOverrides` hold user-supplied corrections that take
 *   priority over the downloaded data.
 * - Same-source translations (`from === to`) short-circuit without a DB read.
 */
export class IDMappingService {
  private static instance: IDMappingService;

  /** key = `from:fromId:to`, value = mapped id (string for compatibility). */
  private readonly manualOverrides = new Map<string, string>();

  static getInstance(): IDMappingService {
    if (!IDMappingService.instance) {
      IDMappingService.instance = new IDMappingService();
    }
    return IDMappingService.instance;
  }

  /** Reset all in-memory state (used in tests). */
  static __resetForTests(): void {
    if (IDMappingService.instance) {
      IDMappingService.instance.manualOverrides.clear();
    }
    IDMappingService.instance = new IDMappingService();
  }

  /**
   * Download the upstream merged mapping list and replace the SQLite table
   * contents inside a single transaction. Short-circuits when the local copy
   * is younger than `FRESHNESS_WINDOW_MS`.
   */
  async updateMappings(): Promise<void> {
    const lastUpdate = await this.getLastUpdateTime();
    if (lastUpdate !== null && Date.now() - lastUpdate < FRESHNESS_WINDOW_MS) {
      return;
    }

    const fs = FileSystem as unknown as {
      cacheDirectory?: string;
      downloadAsync(url: string, dest: string): Promise<{ status: number }>;
      readAsStringAsync(path: string): Promise<string>;
    };
    const cacheDir = fs.cacheDirectory;

    if (!cacheDir) {
      throw new Error('FileSystem cache directory not available');
    }
    const mappingFile = cacheDir + 'anime-mappings.json';

    const downloadRes = await fs.downloadAsync(MAPPING_URL, mappingFile);
    if (downloadRes.status !== 200) {
      throw new Error(`Failed to download mappings: ${downloadRes.status}`);
    }

    const fileContent = await fs.readAsStringAsync(mappingFile);
    const mappings: AnimeMapping[] = JSON.parse(fileContent);
    await this.bulkInsert(mappings);
    await this.setLastUpdateTime(Date.now());
  }

  /**
   * Bulk-insert mappings inside a single transaction. Uses prepared statements
   * with 500-row chunks to keep the JS↔native bridge cost flat across the
   * ~40k row file. Public so tests can verify IDM-006 directly without hitting
   * the network.
   */
  async bulkInsert(mappings: AnimeMapping[]): Promise<void> {
    const db = await LocalDB.getDatabase();
    const CHUNK_SIZE = 500;

    await db.withTransactionAsync(async () => {
      await db.execAsync('DELETE FROM id_mappings');

      const statement = await db.prepareAsync(
        `INSERT INTO id_mappings (
          mal_id, anilist_id, kitsu_id, bangumi_id, shikimori_id, simkl_id, annict_id,
          thetvdb_id, themoviedb_id, livechart_id, anime_planet_id, anisearch_id, notify_moe_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      try {
        for (let i = 0; i < mappings.length; i += CHUNK_SIZE) {
          const chunk = mappings.slice(i, i + CHUNK_SIZE);
          for (const m of chunk) {
            await statement.executeAsync([
              m.mal_id ?? null,
              m.anilist_id ?? null,
              m.kitsu_id ?? null,
              m.bangumi_id ?? null,
              m.shikimori_id ?? null,
              m.simkl_id ?? null,
              m.annict_id ?? null,
              m.thetvdb_id ?? null,
              m.themoviedb_id ?? null,
              m.livechart_id ?? null,
              m.anime_planet_id ?? m['anime-planet_id'] ?? null,
              m.anisearch_id ?? null,
              m.notify_moe_id ?? m['notify.moe_id'] ?? null,
            ]);
          }
        }
      } finally {
        await statement.finalizeAsync();
      }
    });
  }

  /**
   * Pin a manual override that wins over any downloaded mapping. Useful for
   * fixing one-off mismatches reported by users.
   */
  setManualMapping(
    fromPlatform: string,
    fromId: number | string,
    toPlatform: string,
    toId: number | string
  ): void {
    const key = manualKey(fromPlatform, fromId, toPlatform);
    this.manualOverrides.set(key, String(toId));
  }

  /** Inspect a stored manual override (used by tests). */
  getManualMapping(
    fromPlatform: string,
    fromId: number | string,
    toPlatform: string
  ): string | null {
    return this.manualOverrides.get(manualKey(fromPlatform, fromId, toPlatform)) ?? null;
  }

  /**
   * Translate an ID from one platform to another.
   *
   * Lookup order:
   *   1. Same source/target → return original.
   *   2. Manual override.
   *   3. SQLite mapping table.
   *
   * Returns `null` when no mapping exists.
   */
  async mapID(
    fromPlatform: string,
    fromId: number | string,
    toPlatform: string
  ): Promise<string | number | null> {
    if (fromPlatform === toPlatform) return fromId;

    const manual = this.getManualMapping(fromPlatform, fromId, toPlatform);
    if (manual !== null) return manual;

    const fromCol = this.getColumnName(fromPlatform);
    const toCol = this.getColumnName(toPlatform);
    if (!fromCol || !toCol) return null;

    const db = await LocalDB.getDatabase();
    const result = await db.getFirstAsync<Record<string, string | number>>(
      `SELECT ${toCol} FROM id_mappings WHERE ${fromCol} = ? LIMIT 1`,
      fromId
    );

    return result ? (result[toCol] ?? null) : null;
  }

  /**
   * Translate one source ID to every supported platform in a single SELECT.
   *
   * Cheap on the bridge: instead of calling mapID() N times (one round-trip
   * per target) we issue one query and spread the row into a partial record.
   * Only columns with non-null values are returned, so callers can spread the
   * result into an existing `platformIds` map without overwriting populated
   * fields with nulls.
   */
  async mapAllPlatforms(
    fromPlatform: PlatformType,
    fromId: string
  ): Promise<Partial<Record<PlatformType, string>>> {
    const fromCol = this.getColumnName(fromPlatform);
    if (!fromCol) return {};

    const db = await LocalDB.getDatabase();
    const row = await db.getFirstAsync<Record<string, string | number | null>>(
      `SELECT mal_id, anilist_id, kitsu_id, bangumi_id,
              shikimori_id, simkl_id, annict_id
         FROM id_mappings
        WHERE ${fromCol} = ?
        LIMIT 1`,
      fromId
    );
    if (!row) return {};

    const out: Partial<Record<PlatformType, string>> = {};
    const COLUMN_TO_PLATFORM: Record<string, PlatformType> = {
      mal_id: 'myanimelist',
      anilist_id: 'anilist',
      kitsu_id: 'kitsu',
      bangumi_id: 'bangumi',
      shikimori_id: 'shikimori',
      simkl_id: 'simkl',
      annict_id: 'annict',
    };
    for (const [col, platform] of Object.entries(COLUMN_TO_PLATFORM)) {
      const v = row[col];
      if (v !== null && v !== undefined && v !== '') {
        out[platform] = String(v);
      }
    }
    return out;
  }

  /**
   * Timestamp (ms-since-epoch) of the last successful updateMappings, or null
   * if mappings have never been hydrated on this device.
   */
  async getLastUpdateTime(): Promise<number | null> {
    const db = await LocalDB.getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM id_mappings_meta WHERE key = ?`,
      META_KEY_LAST_UPDATE
    );
    if (!row) return null;
    const n = Number(row.value);
    return Number.isFinite(n) ? n : null;
  }

  /** Backwards-compatible alias used by some legacy call sites. */
  async translate(
    fromId: number | string,
    fromPlatform: PlatformType,
    toPlatform: PlatformType
  ): Promise<string | number | null> {
    return this.mapID(fromPlatform, fromId, toPlatform);
  }

  private async setLastUpdateTime(ts: number): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.runAsync(
      `INSERT OR REPLACE INTO id_mappings_meta (key, value) VALUES (?, ?)`,
      META_KEY_LAST_UPDATE,
      String(ts)
    );
  }

  private getColumnName(platform: string): string | null {
    return PLATFORM_TO_COLUMN[platform] ?? null;
  }
}

function manualKey(from: string, fromId: number | string, to: string): string {
  return `${from}:${fromId}:${to}`;
}

export const idMappingService = IDMappingService.getInstance();
