/**
 * Platform Sync Service
 *
 * Handles synchronization between different anime tracking platforms:
 * - AniList
 * - MyAnimeList
 * - Bangumi
 * - Annict
 *
 * This service mirrors the Swift implementation in aniseeker/Services/Import/
 */

import { anilistAPI, AniListUser, AniListMediaListEntry } from '../clients/anilist-api';

export type Platform = 'anilist' | 'myanimelist' | 'bangumi' | 'annict' | 'simkl';

export interface SyncStatus {
  platform: Platform;
  lastSync: Date | null;
  status: 'idle' | 'syncing' | 'error';
  error?: string;
}

export interface AnimeItem {
  id: string;
  platformId: string;
  title: string;
  imageUrl: string;
  progress: number;
  totalEpisodes: number;
  score: number | null;
  status: 'watching' | 'completed' | 'on_hold' | 'dropped' | 'planned';
  startedAt: Date | null;
  completedAt: Date | null;
  platform: Platform;
}

export interface UserStats {
  totalAnime: number;
  episodesWatched: number;
  minutesWatched: number;
  meanScore: number;
  watching: number;
  completed: number;
  onHold: number;
  dropped: number;
  planned: number;
}

export interface ImportedUserProfile {
  id: string;
  username: string;
  avatarUrl: string;
  platforms: Platform[];
  stats: UserStats;
}

class PlatformSyncService {
  private static instance: PlatformSyncService;
  private syncStatuses: Map<Platform, SyncStatus> = new Map();
  private accessToken: string | null = null;
  private defaultUsername: string = 'kidneyweakx'; // Fallback to public list

  private constructor() {
    // Initialize sync statuses
    ['anilist', 'myanimelist', 'bangumi', 'annict', 'simkl'].forEach((p) => {
      this.syncStatuses.set(p as Platform, {
        platform: p as Platform,
        lastSync: null,
        status: 'idle',
      });
    });
  }

  static getInstance(): PlatformSyncService {
    if (!PlatformSyncService.instance) {
      PlatformSyncService.instance = new PlatformSyncService();
    }
    return PlatformSyncService.instance;
  }

  /**
   * Get the current sync status for all platforms
   */
  getAllSyncStatuses(): SyncStatus[] {
    return Array.from(this.syncStatuses.values());
  }

  /**
   * Set AniList access token for authenticated requests
   */
  setAniListToken(token: string): void {
    this.accessToken = token;
    anilistAPI.setAccessToken(token);
  }

  /**
   * Set default username for public data fetching
   */
  setDefaultUsername(username: string): void {
    this.defaultUsername = username;
  }

  /**
   * Sync anime list from AniList
   */
  async syncAniList(): Promise<AnimeItem[]> {
    const status = this.syncStatuses.get('anilist');
    if (status) {
      status.status = 'syncing';
      status.error = undefined;
    }

    try {
      let entries: AniListMediaListEntry[];

      if (anilistAPI.isAuthenticated()) {
        // Get authenticated user's list
        entries = await anilistAPI.getAnimeList();
      } else {
        // Fall back to public list
        entries = await anilistAPI.getAnimeList(this.defaultUsername);
      }

      const items = entries.map(this.mapAniListEntryToAnimeItem);

      if (status) {
        status.status = 'idle';
        status.lastSync = new Date();
      }

      return items;
    } catch (error: any) {
      if (status) {
        status.status = 'error';
        status.error = error.message;
      }
      throw error;
    }
  }

  /**
   * Get user profile from AniList
   */
  async getAniListProfile(): Promise<ImportedUserProfile | null> {
    try {
      let user: Partial<AniListUser>;

      if (anilistAPI.isAuthenticated()) {
        user = await anilistAPI.getViewer();
      } else {
        return null;
      }

      if (!user) return null;

      return {
        id: String(user.id),
        username: user.name || 'Unknown',
        avatarUrl: user.avatar?.large || '',
        platforms: ['anilist'],
        stats: {
          totalAnime: user.statistics?.anime?.count || 0,
          episodesWatched: user.statistics?.anime?.episodesWatched || 0,
          minutesWatched: user.statistics?.anime?.minutesWatched || 0,
          meanScore: user.statistics?.anime?.meanScore || 0,
          watching: 0, // Would need to calculate from list
          completed: 0,
          onHold: 0,
          dropped: 0,
          planned: 0,
        },
      };
    } catch (error) {
      console.error('Failed to get AniList profile:', error);
      return null;
    }
  }

  /**
   * Sync all configured platforms
   */
  async syncAll(): Promise<Map<Platform, AnimeItem[]>> {
    const results = new Map<Platform, AnimeItem[]>();

    // Sync AniList first (most reliable)
    try {
      const items = await this.syncAniList();
      results.set('anilist', items);
    } catch (error) {
      console.error('Failed to sync AniList:', error);
    }

    // TODO: Add other platforms when their APIs are implemented
    // - MyAnimeList: Requires OAuth with Jikan API (read-only) or official API
    // - Bangumi: Requires OAuth
    // - Annict: Requires OAuth
    // - Simkl: Requires OAuth

    return results;
  }

  /**
   * Map AniList entry to our AnimeItem format
   */
  private mapAniListEntryToAnimeItem(entry: AniListMediaListEntry): AnimeItem {
    return {
      id: `${entry.mediaId}`,
      platformId: `${entry.mediaId}`,
      title:
        entry.media.title.english ||
        entry.media.title.romaji ||
        entry.media.title.native ||
        'Unknown',
      imageUrl: entry.media.coverImage.large || entry.media.coverImage.medium || '',
      progress: entry.progress || 0,
      totalEpisodes: entry.media.episodes || 0,
      score: entry.score || null,
      status: this.mapAniListStatus(entry.status),
      startedAt: null,
      completedAt: entry.status === 'COMPLETED' ? new Date() : null,
      platform: 'anilist',
    };
  }

  /**
   * Map AniList status to our status format
   */
  private mapAniListStatus(status: string): AnimeItem['status'] {
    switch (status) {
      case 'CURRENT':
      case 'WATCHING':
        return 'watching';
      case 'COMPLETED':
        return 'completed';
      case 'PAUSED':
      case 'ON_HOLD':
        return 'on_hold';
      case 'DROPPED':
        return 'dropped';
      case 'PLANNING':
      case 'PLANNED':
        return 'planned';
      default:
        return 'watching';
    }
  }
}

export const platformSyncService = PlatformSyncService.getInstance();
