import { LocalDB } from '../../db';
import type { PlatformType } from '../auth/types';

const MAPPING_URL =
  'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-mini.json';

interface AnimeMapping {
  mal_id?: number;
  anilist_id?: number;
  kitsu_id?: number;
  bangumi_id?: number;
  shikimori_id?: number;
  simkl_id?: number;
  annict_id?: number;
  thetvdb_id?: number;
  themoviedb_id?: number;
  livechart_id?: number;
  'anime-planet_id'?: string;
  anisearch_id?: number;
  'notify.moe_id'?: string;
  type?: string;
}

/**
 * Cross-platform anime ID translator.
 *
 * - SQLite-backed (table `id_mappings`) holds the mass-imported mapping list
 *   from `anime-list-mini.json`.
 * - In-memory `manualOverrides` hold user-supplied corrections that take
 *   priority over the downloaded data (per `edge_cases.md` §ID Mapping).
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
   * Download the upstream mapping list and replace the SQLite table contents
   * inside a single transaction. Chunked to keep memory bounded for the
   * 100k+ row file.
   */
  async updateMappings(): Promise<void> {
    // Defer the expo-file-system import — it pulls in react-native via
    // expo-modules-core, which the test environment cannot resolve.
    const FileSystem = (await import('expo-file-system')) as unknown as {
      cacheDirectory?: string;
      downloadAsync(url: string, dest: string): Promise<{ status: number }>;
      readAsStringAsync(path: string): Promise<string>;
    };
    const fs = FileSystem;
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
  }

  /**
   * Bulk-insert mappings inside a single transaction. Public so tests can
   * verify IDM-006 directly without hitting the network.
   */
  async bulkInsert(mappings: AnimeMapping[]): Promise<void> {
    const db = await LocalDB.getDatabase();
    const CHUNK_SIZE = 50;

    await db.withTransactionAsync(async () => {
      await db.execAsync('DELETE FROM id_mappings');

      for (let i = 0; i < mappings.length; i += CHUNK_SIZE) {
        const chunk = mappings.slice(i, i + CHUNK_SIZE);

        for (const m of chunk) {
          await db.runAsync(
            `INSERT INTO id_mappings (
              mal_id, anilist_id, kitsu_id, bangumi_id, shikimori_id, simkl_id, annict_id,
              thetvdb_id, themoviedb_id, livechart_id, anime_planet_id, anisearch_id, notify_moe_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            m.mal_id || null,
            m.anilist_id || null,
            m.kitsu_id || null,
            m.bangumi_id || null,
            m.shikimori_id || null,
            m.simkl_id || null,
            m.annict_id || null,
            m.thetvdb_id || null,
            m.themoviedb_id || null,
            m.livechart_id || null,
            m['anime-planet_id'] || null,
            m.anisearch_id || null,
            m['notify.moe_id'] || null
          );
        }
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

  /** Backwards-compatible alias used by some legacy call sites. */
  async translate(
    fromId: number | string,
    fromPlatform: PlatformType,
    toPlatform: PlatformType
  ): Promise<string | number | null> {
    return this.mapID(fromPlatform, fromId, toPlatform);
  }

  private getColumnName(platform: string): string | null {
    switch (platform) {
      case 'myanimelist':
        return 'mal_id';
      case 'anilist':
        return 'anilist_id';
      case 'kitsu':
        return 'kitsu_id';
      case 'bangumi':
        return 'bangumi_id';
      case 'shikimori':
        return 'shikimori_id';
      case 'simkl':
        return 'simkl_id';
      case 'annict':
        return 'annict_id';
      default:
        return null;
    }
  }
}

function manualKey(from: string, fromId: number | string, to: string): string {
  return `${from}:${fromId}:${to}`;
}

export const idMappingService = IDMappingService.getInstance();
