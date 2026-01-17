import * as FileSystem from 'expo-file-system';
import { LocalDB } from '../../db';

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

export class IDMappingService {
  private static instance: IDMappingService;

  static getInstance(): IDMappingService {
    if (!IDMappingService.instance) {
      IDMappingService.instance = new IDMappingService();
    }
    return IDMappingService.instance;
  }

  async updateMappings(): Promise<void> {
    const fs = FileSystem as any;
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

  async mapID(
    fromPlatform: string,
    fromId: number | string,
    toPlatform: string
  ): Promise<string | number | null> {
    const db = await LocalDB.getDatabase();

    const fromCol = this.getColumnName(fromPlatform);
    const toCol = this.getColumnName(toPlatform);

    if (!fromCol || !toCol) return null;

    const result = await db.getFirstAsync<{ [key: string]: string | number }>(
      `SELECT ${toCol} FROM id_mappings WHERE ${fromCol} = ?`,
      fromId
    );

    return result ? result[toCol] : null;
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

export const idMappingService = IDMappingService.getInstance();
