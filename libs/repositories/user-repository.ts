import * as FileSystem from 'expo-file-system/legacy';
import { AnimeRepository } from './anime-repository';
import { platformSyncService } from '../services/platform-sync-service';
import { kvGet, kvRemove, kvSet } from '../services/storage/app-storage';
import {
  USER_AVATAR_URI_KEY,
  USER_DISPLAY_NAME_KEY,
  USER_PRIMARY_PLATFORM_KEY,
} from '../services/storage/keys';

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
//
// All three persisted bits (primary platform, display name, avatar URI) are
// MMKV-backed strings. Every getter has a `*Sync` variant for first-frame
// `useState` seeding so the profile header doesn't flash defaults.
export class UserRepository {
  static async getProfile(): Promise<UserProfile> {
    const localAvatar = UserRepository.getAvatarUriSync();
    const displayName = UserRepository.getDisplayNameSync();

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

  /** Get sync status for all platforms */
  static getSyncStatus() {
    return platformSyncService.getAllSyncStatuses();
  }

  /** Synchronous MMKV read. `null` when never set. */
  static getPrimaryPlatformSync(): string | null {
    return kvGet(USER_PRIMARY_PLATFORM_KEY);
  }

  /** Get the user's preferred display platform (persisted) */
  static async getPrimaryPlatform(): Promise<string | null> {
    return UserRepository.getPrimaryPlatformSync();
  }

  /** Persist the user's preferred display platform */
  static async setPrimaryPlatform(platform: string): Promise<void> {
    kvSet(USER_PRIMARY_PLATFORM_KEY, platform);
  }

  /** Synchronous MMKV read. `null` when never set. */
  static getDisplayNameSync(): string | null {
    return kvGet(USER_DISPLAY_NAME_KEY);
  }

  /** Local cosmetic display name. null when never set. */
  static async getDisplayName(): Promise<string | null> {
    return UserRepository.getDisplayNameSync();
  }

  static async setDisplayName(name: string | null): Promise<void> {
    if (!name || !name.trim()) {
      kvRemove(USER_DISPLAY_NAME_KEY);
      return;
    }
    kvSet(USER_DISPLAY_NAME_KEY, name.trim());
  }

  /** Synchronous MMKV read. `null` when never set. */
  static getAvatarUriSync(): string | null {
    return kvGet(USER_AVATAR_URI_KEY);
  }

  /** Get the locally stored avatar URI (file:// path) if set. */
  static async getAvatarUri(): Promise<string | null> {
    return UserRepository.getAvatarUriSync();
  }

  /**
   * Persist the local avatar URI. Pass null to clear (also deletes the underlying file).
   */
  static async setAvatarUri(uri: string | null): Promise<void> {
    if (uri === null) {
      const existing = UserRepository.getAvatarUriSync();
      if (existing) {
        try {
          await FileSystem.deleteAsync(existing, { idempotent: true });
        } catch {
          // ignore — file may already be gone
        }
      }
      kvRemove(USER_AVATAR_URI_KEY);
      return;
    }
    kvSet(USER_AVATAR_URI_KEY, uri);
  }
}
