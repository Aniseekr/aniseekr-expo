import {
  AnimeSourceProvider,
  WritableAnimeProvider,
  ImportedUserProfile,
  normalizeStatus,
  normalizeScore,
} from './base-provider';
import { PlatformType, AnimeStatus, UniversalAnimeItem, PLATFORM_CONFIGS } from '../auth/types';
import { authService } from '../auth/auth-service';

const SIMKL_API = 'https://api.simkl.com';

interface SimklItem {
  last_watched_at: string | null;
  status: string;
  user_rating: number | null;
  last_watched: string | null;
  watched_episodes_count: number;
  total_episodes_count: number;
  anime: {
    ids: { simkl: number; slug: string };
    title: string;
    poster: string;
    year: number;
  };
}

interface SimklUser {
  user: {
    name: string;
    avatar: string;
  };
}

export class SimklProvider implements WritableAnimeProvider {
  platform: PlatformType = 'simkl';

  private getClientId(): string {
    const config = PLATFORM_CONFIGS.simkl;
    if (!config || !config.oauth.clientId) {
      throw new Error('Simkl Client ID not configured');
    }
    return config.oauth.clientId;
  }

  private async request<T>(endpoint: string, token: string, options: RequestInit = {}): Promise<T> {
    const clientId = this.getClientId();

    const response = await fetch(`${SIMKL_API}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'simkl-api-key': clientId,
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Simkl API Error: ${response.status}`);
    }

    return response.json();
  }

  async authenticate(): Promise<string> {
    const credentials = await authService.connectPlatform('simkl');
    if (!credentials) throw new Error('Authentication cancelled');
    return credentials.token.accessToken;
  }

  async fetchUserList(token: string): Promise<UniversalAnimeItem[]> {
    const data = await this.request<{ anime: SimklItem[] }>('/sync/all-items/anime/', token);
    return data.anime.map((item) => this.mapEntry(item));
  }

  async fetchUserProfile(token: string): Promise<ImportedUserProfile> {
    const data = await this.request<SimklUser>('/users/settings', token);

    return {
      username: data.user.name,
      avatarUrl: data.user.avatar,
      sourcePlatform: 'simkl',
    };
  }

  async updateProgress(animeId: string, progress: number, token: string): Promise<void> {
    await this.syncToSimkl(animeId, { to_ep: progress }, token);
  }

  async updateScore(animeId: string, score: number, token: string): Promise<void> {
    await this.syncToSimkl(animeId, { score }, token);
  }

  async updateStatus(animeId: string, status: AnimeStatus, token: string): Promise<void> {
    const statusMap: Record<AnimeStatus, string> = {
      watching: 'watching',
      completed: 'completed',
      on_hold: 'hold',
      dropped: 'dropped',
      planned: 'plantowatch',
    };

    await this.syncToSimkl(animeId, { status: statusMap[status] }, token);
  }

  async addToList(animeId: string, status: AnimeStatus, token: string): Promise<void> {
    await this.updateStatus(animeId, status, token);
  }

  async removeFromList(animeId: string, token: string): Promise<void> {
    await this.request('/sync/history/remove', token, {
      method: 'POST',
      body: JSON.stringify({
        anime: { ids: { simkl: parseInt(animeId) } },
      }),
    });
  }

  private async syncToSimkl(
    animeId: string,
    rating: Record<string, unknown>,
    token: string
  ): Promise<void> {
    await this.request('/sync/add-to-list', token, {
      method: 'POST',
      body: JSON.stringify({
        anime: {
          ids: { simkl: parseInt(animeId) },
          user_rating: rating,
        },
      }),
    });
  }

  private mapEntry(item: SimklItem): UniversalAnimeItem {
    return {
      id: `simkl_${item.anime.ids.simkl}`,
      platformIds: { simkl: String(item.anime.ids.simkl) },
      title: item.anime.title,
      imageUrl: `https://simkl.in/posters/${item.anime.poster}_m.jpg`,
      status: normalizeStatus(item.status),
      progress: item.watched_episodes_count,
      totalEpisodes: item.total_episodes_count,
      score: item.user_rating || undefined,
      startDate: item.last_watched ? new Date(item.last_watched) : undefined,
      updatedAt: new Date(),
      source: 'simkl',
    };
  }
}

export const simklProvider = new SimklProvider();
