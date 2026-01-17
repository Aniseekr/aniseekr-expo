import {
  AnimeSourceProvider,
  WritableAnimeProvider,
  ImportedUserProfile,
  normalizeStatus,
  normalizeScore,
} from './base-provider';
import { PlatformType, AnimeStatus, UniversalAnimeItem } from '../auth/types';
import { authService } from '../auth/auth-service';

const BANGUMI_API = 'https://api.bgm.tv';

interface BangumiCollection {
  subject_id: number;
  subject: {
    id: number;
    name: string;
    name_cn?: string;
    images?: { large?: string; common?: string };
    eps?: number;
  };
  type: number;
  rate: number;
  ep_status: number;
  private: boolean;
  comment?: string;
}

export class BangumiProvider implements WritableAnimeProvider {
  platform: PlatformType = 'bangumi';

  private async request<T>(endpoint: string, token: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${BANGUMI_API}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'aniseekr/1.0 (expo)',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Bangumi API Error: ${response.status}`);
    }

    return response.json();
  }

  async authenticate(): Promise<string> {
    const credentials = await authService.connectPlatform('bangumi');
    if (!credentials) throw new Error('Authentication cancelled');
    return credentials.token.accessToken;
  }

  async fetchUserList(token: string): Promise<UniversalAnimeItem[]> {
    const me = await this.request<{ username: string }>('/v0/me', token);

    type CollectionResponse = { data: BangumiCollection[]; total: number };
    const collections = await this.request<CollectionResponse>(
      `/v0/users/${me.username}/collections?subject_type=2&limit=100`,
      token
    );

    return collections.data.map((item) => this.mapEntry(item));
  }

  async fetchUserProfile(token: string): Promise<ImportedUserProfile> {
    const data = await this.request<{
      username: string;
      nickname: string;
      avatar?: { large?: string };
    }>('/v0/me', token);

    return {
      username: data.nickname || data.username,
      avatarUrl: data.avatar?.large,
      sourcePlatform: 'bangumi',
    };
  }

  async updateProgress(animeId: string, progress: number, token: string): Promise<void> {
    const episodes = await this.request<{ data: { id: number; ep: number }[] }>(
      `/v0/subjects/${animeId}/episodes`,
      token
    );

    const targetEp = episodes.data.find((ep) => ep.ep === progress);
    if (targetEp) {
      await this.request(`/v0/users/-/collections/${animeId}/episodes/${targetEp.id}`, token, {
        method: 'POST',
        body: JSON.stringify({ type: 2 }),
      });
    }
  }

  async updateScore(animeId: string, score: number, token: string): Promise<void> {
    const bangumiScore = Math.round(score * 2);
    await this.request(`/v0/users/-/collections/${animeId}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ rate: bangumiScore }),
    });
  }

  async updateStatus(animeId: string, status: AnimeStatus, token: string): Promise<void> {
    const statusMap: Record<AnimeStatus, number> = {
      planned: 1,
      completed: 2,
      watching: 3,
      on_hold: 4,
      dropped: 5,
    };

    await this.request(`/v0/users/-/collections/${animeId}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ type: statusMap[status] }),
    });
  }

  async addToList(animeId: string, status: AnimeStatus, token: string): Promise<void> {
    await this.updateStatus(animeId, status, token);
  }

  async removeFromList(animeId: string, token: string): Promise<void> {
    await this.request(`/v0/users/-/collections/${animeId}`, token, {
      method: 'DELETE',
    });
  }

  private mapEntry(item: BangumiCollection): UniversalAnimeItem {
    const statusMap: Record<number, AnimeStatus> = {
      1: 'planned',
      2: 'completed',
      3: 'watching',
      4: 'on_hold',
      5: 'dropped',
    };

    const imageUrl = item.subject.images?.large || item.subject.images?.common || '';

    return {
      id: `bangumi_${item.subject_id}`,
      platformIds: { bangumi: String(item.subject_id) },
      title: item.subject.name_cn || item.subject.name,
      titleJapanese: item.subject.name,
      imageUrl: imageUrl.replace('http://', 'https://'),
      status: statusMap[item.type] || 'watching',
      progress: item.ep_status,
      totalEpisodes: item.subject.eps,
      score: item.rate > 0 ? item.rate / 2 : undefined,
      notes: item.comment,
      updatedAt: new Date(),
      source: 'bangumi',
    };
  }
}

export const bangumiProvider = new BangumiProvider();
