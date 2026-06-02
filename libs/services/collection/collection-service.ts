import * as Crypto from 'expo-crypto';
import { LocalDB } from '../../db';
import { CollectionFolder } from '../../../types';

const SYSTEM_FOLDERS: Omit<CollectionFolder, 'animeCount' | 'sharedBy' | 'createdAt'>[] = [
  {
    id: 'system_all',
    name: 'All',
    icon: 'library',
    isShared: false,
    isSystemFolder: true,
    isR18: false,
    folderType: 'watching',
  },
  {
    id: 'system_watching',
    name: 'Watching',
    icon: 'play-circle',
    isShared: false,
    isSystemFolder: true,
    isR18: false,
    folderType: 'watching',
  },
  {
    id: 'system_completed',
    name: 'Completed',
    icon: 'checkmark-circle',
    isShared: false,
    isSystemFolder: true,
    isR18: false,
    folderType: 'completed',
  },
  {
    id: 'system_dropped',
    name: 'Dropped',
    icon: 'close-circle',
    isShared: false,
    isSystemFolder: true,
    isR18: false,
    folderType: 'dropped',
  },
  {
    id: 'system_plan_to_watch',
    name: 'Plan to Watch',
    icon: 'calendar',
    isShared: false,
    isSystemFolder: true,
    isR18: false,
    folderType: 'wishlist',
  },
  {
    id: 'system_favorites',
    name: 'Favorites',
    icon: 'heart',
    isShared: false,
    isSystemFolder: true,
    isR18: false,
    folderType: 'favorites',
  },
];

class CollectionService {
  private static instance: CollectionService;

  static getInstance(): CollectionService {
    if (!CollectionService.instance) {
      CollectionService.instance = new CollectionService();
    }
    return CollectionService.instance;
  }

  async createCustomFolder(
    name: string,
    icon: string,
    isShared: boolean,
    isR18: boolean
  ): Promise<CollectionFolder> {
    const db = await LocalDB.getDatabase();
    const id = Crypto.randomUUID();
    const now = Date.now();

    await db.runAsync(
      `INSERT INTO collection_folders (id, name, icon, type, is_shared, is_r18, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      name,
      icon,
      'custom',
      isShared ? 1 : 0,
      isR18 ? 1 : 0,
      now
    );

    return {
      id,
      name,
      icon,
      isShared,
      isSystemFolder: false,
      isR18,
      folderType: 'custom',
      createdAt: new Date(now),
      animeCount: 0,
      sharedBy: 0,
    };
  }

  async deleteFolder(id: string): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.runAsync('DELETE FROM collection_folders WHERE id = ?', id);
  }

  async updateFolder(
    id: string,
    updates: Partial<{ name: string; icon: string; isShared: boolean; isR18: boolean }>
  ): Promise<void> {
    const db = await LocalDB.getDatabase();
    const sets: string[] = [];
    const args: any[] = [];

    if (updates.name !== undefined) {
      sets.push('name = ?');
      args.push(updates.name);
    }
    if (updates.icon !== undefined) {
      sets.push('icon = ?');
      args.push(updates.icon);
    }
    if (updates.isShared !== undefined) {
      sets.push('is_shared = ?');
      args.push(updates.isShared ? 1 : 0);
    }
    if (updates.isR18 !== undefined) {
      sets.push('is_r18 = ?');
      args.push(updates.isR18 ? 1 : 0);
    }

    if (sets.length === 0) return;

    args.push(id);
    await db.runAsync(`UPDATE collection_folders SET ${sets.join(', ')} WHERE id = ?`, ...args);
  }

  async addToFolder(animeId: string, folderId: string): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.runAsync(
      `INSERT OR IGNORE INTO collection_folder_items (folder_id, anime_id, added_at) VALUES (?, ?, ?)`,
      folderId,
      animeId,
      Date.now()
    );
  }

  async removeFromFolder(animeId: string, folderId: string): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.runAsync(
      'DELETE FROM collection_folder_items WHERE folder_id = ? AND anime_id = ?',
      folderId,
      animeId
    );
  }

  async getFolders(): Promise<CollectionFolder[]> {
    const db = await LocalDB.getDatabase();

    const getCount = async (sql: string, ...args: unknown[]): Promise<number> => {
      const res = await db.getFirstAsync<{ count: number }>(sql, ...(args as never[]));
      return res?.count || 0;
    };
    const getCover = async <T extends { image_url?: string | null; image?: string | null }>(
      sql: string,
      ...args: unknown[]
    ): Promise<string | undefined> => {
      const res = await db.getFirstAsync<T>(sql, ...(args as never[]));
      return res?.image_url ?? res?.image ?? undefined;
    };

    const customRows = await db.getAllAsync<{
      id: string;
      name: string;
      icon: string;
      is_shared: number;
      is_r18: number;
      created_at: number;
    }>('SELECT * FROM collection_folders ORDER BY created_at ASC');

    const customFolders: CollectionFolder[] = await Promise.all(
      customRows.map(async (row) => {
        const count = await getCount(
          'SELECT COUNT(*) as count FROM collection_folder_items WHERE folder_id = ?',
          row.id
        );
        const coverUrl = await getCover<{ image_url: string | null }>(
          `SELECT ua.image_url
             FROM collection_folder_items cfi
             JOIN user_anime ua ON ua.anime_id = cfi.anime_id
            WHERE cfi.folder_id = ? AND ua.image_url IS NOT NULL
            ORDER BY cfi.added_at DESC
            LIMIT 1`,
          row.id
        );

        return {
          id: row.id,
          name: row.name,
          icon: row.icon,
          isShared: !!row.is_shared,
          isSystemFolder: false,
          isR18: !!row.is_r18,
          folderType: 'custom',
          createdAt: new Date(row.created_at),
          animeCount: count,
          sharedBy: 0,
          coverUrl,
        };
      })
    );

    const systemFolders = await Promise.all(
      SYSTEM_FOLDERS.map(async (folder) => {
        let count = 0;
        let coverUrl: string | undefined;
        if (folder.folderType === 'favorites') {
          count = await getCount('SELECT COUNT(*) as count FROM favorites');
          coverUrl = await getCover<{ image: string | null }>(
            'SELECT image FROM favorites WHERE image IS NOT NULL ORDER BY addedAt DESC LIMIT 1'
          );
        } else if (folder.id === 'system_all') {
          count = await getCount('SELECT COUNT(*) as count FROM user_anime');
          coverUrl = await getCover<{ image_url: string | null }>(
            'SELECT image_url FROM user_anime WHERE image_url IS NOT NULL ORDER BY COALESCE(updated_at, 0) DESC LIMIT 1'
          );
        } else {
          const statusMap: Record<string, string> = {
            watching: 'watching',
            completed: 'completed',
            dropped: 'dropped',
            wishlist: 'planned',
          };
          const status = statusMap[folder.folderType];
          if (status) {
            count = await getCount(
              'SELECT COUNT(*) as count FROM user_anime WHERE status = ?',
              status
            );
            coverUrl = await getCover<{ image_url: string | null }>(
              'SELECT image_url FROM user_anime WHERE status = ? AND image_url IS NOT NULL ORDER BY COALESCE(updated_at, 0) DESC LIMIT 1',
              status
            );
          }
        }

        return {
          ...folder,
          createdAt: new Date(0),
          animeCount: count,
          sharedBy: 0,
          coverUrl,
        } as CollectionFolder;
      })
    );

    return [...systemFolders, ...customFolders];
  }

  async getFolderItems(folderId: string): Promise<string[]> {
    const db = await LocalDB.getDatabase();

    if (folderId.startsWith('system_')) {
      if (folderId === 'system_favorites') {
        const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM favorites');
        return rows.map((r) => r.id);
      }
      if (folderId === 'system_all') {
        const rows = await db.getAllAsync<{ anime_id: string }>('SELECT anime_id FROM user_anime');
        return rows.map((r) => r.anime_id);
      }

      const type = folderId.replace('system_', '');
      const statusMap: Record<string, string> = {
        watching: 'watching',
        completed: 'completed',
        dropped: 'dropped',
        plan_to_watch: 'planned',
      };

      const status = statusMap[type] || type;

      const rows = await db.getAllAsync<{ anime_id: string }>(
        'SELECT anime_id FROM user_anime WHERE status = ?',
        status
      );
      return rows.map((r) => r.anime_id);
    }

    const rows = await db.getAllAsync<{ anime_id: string }>(
      'SELECT anime_id FROM collection_folder_items WHERE folder_id = ? ORDER BY added_at DESC',
      folderId
    );
    return rows.map((r) => r.anime_id);
  }
}

export const collectionService = CollectionService.getInstance();
