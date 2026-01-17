import {
  AnimeSourceProvider,
  WritableAnimeProvider,
  ImportedUserProfile,
  normalizeStatus,
  normalizeScore,
} from './base-provider';
import { PlatformType, AnimeStatus, UniversalAnimeItem } from '../auth/types';
import { authService } from '../auth/auth-service';

const SHIKIMORI_API = 'https://shikimori.one/api';

interface ShikimoriUserRate {
  id: number;
  score: number;
  status: string;
  text?: string;
  episodes?: number;
  chapters?: number;
  volumes?: number;
  text_html?: string;
  rewatches?: number;
  created_at?: string;
  updated_at?: string;
  user?: { id: number; nickname: string; avatar: string };
  anime?: ShikimoriAnime; // Depending on include
  target_id: number;
  target_type: string;
}

interface ShikimoriAnime {
  id: number;
  name: string;
  russian: string;
  image: { original: string; preview: string; x96: string; x48: string };
  url: string;
  kind: string;
  score: string;
  status: string;
  episodes: number;
  episodes_aired: number;
  aired_on: string;
  released_on: string;
}

interface ShikimoriUser {
  id: number;
  nickname: string;
  avatar: string;
  image: {
    x160: string;
    x148: string;
    x80: string;
    x64: string;
    x48: string;
    x32: string;
    x16: string;
  };
  last_online_at: string;
  url: string;
}

export class ShikimoriProvider implements WritableAnimeProvider {
  platform: PlatformType = 'shikimori';

  private async request<T>(endpoint: string, token: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${SHIKIMORI_API}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'aniseekr/1.0',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Shikimori API Error: ${response.status}`);
    }

    return response.json();
  }

  async authenticate(): Promise<string> {
    const credentials = await authService.connectPlatform('shikimori');
    if (!credentials) throw new Error('Authentication cancelled');
    return credentials.token.accessToken;
  }

  async fetchUserList(token: string): Promise<UniversalAnimeItem[]> {
    const user = await this.fetchUserProfile(token);
    let allItems: UniversalAnimeItem[] = [];
    let page = 1;
    let hasMore = true;

    // Shikimori user_rates endpoint is paginated
    while (hasMore) {
      const rates = await this.request<ShikimoriUserRate[]>(
        `/v2/user_rates?user_id=${user.username}&target_type=Anime&limit=100&page=${page}`,
        token
      );

      if (rates.length === 0) {
        hasMore = false;
      } else {
        for (const rate of rates) {
          if (rate.target_type === 'Anime') {
            allItems.push(this.mapEntry(rate));
          }
        }
        page++;
      }

      if (rates.length < 100) hasMore = false;
    }

    return allItems;
  }

  async fetchUserProfile(token: string): Promise<ImportedUserProfile> {
    const user = await this.request<ShikimoriUser>('/users/whoami', token);

    return {
      username: user.nickname,
      avatarUrl: user.image.x160,
      sourcePlatform: 'shikimori',
    };
  }

  async updateProgress(animeId: string, progress: number, token: string): Promise<void> {
    const rateId = await this.getUserRateId(animeId, token);

    if (rateId) {
      await this.request(`/v2/user_rates/${rateId}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ user_rate: { episodes: progress } }),
      });
    } else {
      await this.createUserRate(animeId, { episodes: progress }, token);
    }
  }

  async updateScore(animeId: string, score: number, token: string): Promise<void> {
    const rateId = await this.getUserRateId(animeId, token);
    if (rateId) {
      await this.request(`/v2/user_rates/${rateId}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ user_rate: { score } }),
      });
    } else {
      await this.createUserRate(animeId, { score }, token);
    }
  }

  async updateStatus(animeId: string, status: AnimeStatus, token: string): Promise<void> {
    const statusMap: Record<AnimeStatus, string> = {
      watching: 'watching',
      completed: 'completed',
      on_hold: 'on_hold',
      dropped: 'dropped',
      planned: 'planned',
    };

    const rateId = await this.getUserRateId(animeId, token);
    if (rateId) {
      await this.request(`/v2/user_rates/${rateId}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ user_rate: { status: statusMap[status] } }),
      });
    } else {
      await this.createUserRate(animeId, { status: statusMap[status] }, token);
    }
  }

  async addToList(animeId: string, status: AnimeStatus, token: string): Promise<void> {
    await this.updateStatus(animeId, status, token);
  }

  async removeFromList(animeId: string, token: string): Promise<void> {
    const rateId = await this.getUserRateId(animeId, token);
    if (rateId) {
      await this.request(`/v2/user_rates/${rateId}`, token, {
        method: 'DELETE',
      });
    }
  }

  private async getUserRateId(animeId: string, token: string): Promise<number | null> {
    const user = await this.fetchUserProfile(token);
    const rates = await this.request<ShikimoriUserRate[]>(
      `/v2/user_rates?user_id=${user.username}&target_id=${animeId}&target_type=Anime`,
      token
    );
    return rates.length > 0 ? rates[0].id : null;
  }

  private async createUserRate(
    animeId: string,
    attributes: Partial<ShikimoriUserRate>,
    token: string
  ): Promise<void> {
    const user = await this.fetchUserProfile(token);
    await this.request('/v2/user_rates', token, {
      method: 'POST',
      body: JSON.stringify({
        user_rate: {
          user_id: user.username,
          target_id: animeId,
          target_type: 'Anime',
          ...attributes,
        },
      }),
    });
  }

  private mapEntry(rate: ShikimoriUserRate): UniversalAnimeItem {
    const anime = rate.anime;
    const imageUrl = anime
      ? `https://shikimori.one${anime.image.original || anime.image.preview}`
      : '';

    return {
      id: `shikimori_${rate.target_id}`,
      platformIds: { shikimori: String(rate.target_id) },
      title: anime ? anime.russian || anime.name : `Anime #${rate.target_id}`,
      titleEnglish: anime?.name,
      imageUrl,
      status: normalizeStatus(rate.status),
      progress: rate.episodes || 0,
      totalEpisodes: anime?.episodes,
      score: rate.score > 0 ? rate.score : undefined,
      updatedAt: rate.updated_at ? new Date(rate.updated_at) : new Date(),
      source: 'shikimori',
    };
  }
}

export const shikimoriProvider = new ShikimoriProvider();
