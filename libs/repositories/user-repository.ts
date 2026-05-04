import * as FileSystem from 'expo-file-system/legacy';
import { AnimeRepository } from './anime-repository';
import { platformSyncService } from '../services/platform-sync-service';

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
}

let AsyncStorage: AsyncStorageLike;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  const memoryStorage = new Map<string, string>();
  AsyncStorage = {
    getItem: async (k: string) => memoryStorage.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      memoryStorage.set(k, v);
    },
    removeItem: async (k: string) => {
      memoryStorage.delete(k);
    },
  };
}

const PRIMARY_PLATFORM_KEY = 'aniseekr.user.primaryPlatform';
const AVATAR_URI_KEY = 'aniseekr.user.avatarUri';
const DISPLAY_NAME_KEY = 'aniseekr.user.displayName';
const DEFAULT_DISPLAY_NAME = 'Anime fan';

export interface UserProfile {
  id: string;
  username: string;
  avatarUrl: string;
  source: 'platform' | 'local';
  stats: {
    totalRated: number;
    likedCount: number;
    cardsCount: number;
    foldersCount: number;
  };
}

// Local-first profile: no Aniseekr account exists.
// Display identity comes from the connected primary platform when available,
// otherwise from a user-set local display name (purely cosmetic).
export class UserRepository {
  static async getProfile(): Promise<UserProfile> {
    const [localAvatar, displayName] = await Promise.all([
      UserRepository.getAvatarUri(),
      UserRepository.getDisplayName(),
    ]);

    try {
      const anilistProfile = await platformSyncService.getAniListProfile();
      if (anilistProfile) {
        return {
          id: anilistProfile.id,
          username: anilistProfile.username,
          avatarUrl: localAvatar ?? anilistProfile.avatarUrl,
          source: 'platform',
          stats: {
            totalRated: anilistProfile.stats.totalAnime,
            likedCount: Math.floor(anilistProfile.stats.completed * 0.3),
            cardsCount: 0,
            foldersCount: 1,
          },
        };
      }
    } catch (error) {
      console.warn('Failed to get AniList profile, using local data:', error);
    }

    const stats = await AnimeRepository.getUserStats();

    return {
      id: 'local',
      username: displayName ?? DEFAULT_DISPLAY_NAME,
      avatarUrl: localAvatar ?? '',
      source: 'local',
      stats: {
        totalRated: stats.totalRated,
        likedCount: stats.likedCount,
        cardsCount: 0,
        foldersCount: 0,
      },
    };
  }

  static async syncAllPlatforms(): Promise<void> {
    await platformSyncService.syncAll();
  }

  /**
   * Get sync status for all platforms
   */
  static getSyncStatus() {
    return platformSyncService.getAllSyncStatuses();
  }

  /**
   * Get the user's preferred display platform (persisted)
   */
  static async getPrimaryPlatform(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(PRIMARY_PLATFORM_KEY);
    } catch {
      return null;
    }
  }

  /**
   * Persist the user's preferred display platform
   */
  static async setPrimaryPlatform(platform: string): Promise<void> {
    try {
      await AsyncStorage.setItem(PRIMARY_PLATFORM_KEY, platform);
    } catch {
      // ignore
    }
  }

  /**
   * Local cosmetic display name. null when never set.
   */
  static async getDisplayName(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(DISPLAY_NAME_KEY);
    } catch {
      return null;
    }
  }

  static async setDisplayName(name: string | null): Promise<void> {
    if (!name || !name.trim()) {
      try {
        await AsyncStorage.removeItem?.(DISPLAY_NAME_KEY);
      } catch {
        // ignore
      }
      return;
    }
    try {
      await AsyncStorage.setItem(DISPLAY_NAME_KEY, name.trim());
    } catch {
      // ignore
    }
  }

  /**
   * Get the locally stored avatar URI (file:// path) if set.
   */
  static async getAvatarUri(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(AVATAR_URI_KEY);
    } catch {
      return null;
    }
  }

  /**
   * Persist the local avatar URI. Pass null to clear (also deletes the underlying file).
   */
  static async setAvatarUri(uri: string | null): Promise<void> {
    if (uri === null) {
      const existing = await UserRepository.getAvatarUri();
      if (existing) {
        try {
          await FileSystem.deleteAsync(existing, { idempotent: true });
        } catch {
          // ignore — file may already be gone
        }
      }
      try {
        await AsyncStorage.removeItem?.(AVATAR_URI_KEY);
      } catch {
        // ignore
      }
      return;
    }
    try {
      await AsyncStorage.setItem(AVATAR_URI_KEY, uri);
    } catch {
      // ignore
    }
  }
}
