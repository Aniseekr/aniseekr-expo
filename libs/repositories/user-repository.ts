import { AnimeRepository } from './anime-repository';
import { platformSyncService, ImportedUserProfile } from '../services/platform-sync-service';

export interface UserProfile {
  id: string;
  username: string;
  avatarUrl: string;
  isDonator: boolean;
  stats: {
    totalRated: number;
    likedCount: number;
    cardsCount: number;
    foldersCount: number;
  };
}

// User repository that integrates with real API
export class UserRepository {
  /**
   * Get user profile from AniList API (replaces mock data)
   */
  static async getProfile(): Promise<UserProfile> {
    try {
      // Try to get profile from AniList API
      const anilistProfile = await platformSyncService.getAniListProfile();

      if (anilistProfile) {
        return {
          id: anilistProfile.id,
          username: anilistProfile.username,
          avatarUrl: anilistProfile.avatarUrl,
          isDonator: false, // Would need to check donator status separately
          stats: {
            totalRated: anilistProfile.stats.totalAnime,
            likedCount: Math.floor(anilistProfile.stats.completed * 0.3), // Estimate based on completed
            cardsCount: 0, // Would need to get from gacha service
            foldersCount: 1,
          },
        };
      }
    } catch (error) {
      console.warn('Failed to get AniList profile, using local data:', error);
    }

    // Fallback to local data if API fails
    const stats = await AnimeRepository.getUserStats();

    return {
      id: 'local-user',
      username: 'Kidney', // Or fetch from local storage
      avatarUrl: 'https://github.com/kidney.png',
      isDonator: false,
      stats: {
        totalRated: stats.totalRated,
        likedCount: stats.likedCount,
        cardsCount: 0,
        foldersCount: 1,
      },
    };
  }

  /**
   * Update user profile
   */
  static async updateProfile(data: Partial<UserProfile>): Promise<void> {
    // Save to local storage or API
    // In the future, this would sync with AniList if authenticated
  }

  /**
   * Sync data from all platforms
   */
  static async syncAllPlatforms(): Promise<void> {
    await platformSyncService.syncAll();
  }

  /**
   * Get sync status for all platforms
   */
  static getSyncStatus() {
    return platformSyncService.getAllSyncStatuses();
  }
}
