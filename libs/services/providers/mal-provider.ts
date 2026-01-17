import {
  AnimeSourceProvider,
  WritableAnimeProvider,
  ImportedUserProfile,
  normalizeStatus,
  normalizeScore,
} from './base-provider';
import { PlatformType, AnimeStatus, UniversalAnimeItem, PLATFORM_CONFIGS } from '../auth/types';
import { authService } from '../auth/auth-service';

const MAL_API_BASE = 'https://api.myanimelist.net/v2';

interface MALAnimeListItem {
  node: {
    id: number;
    title: string;
    main_picture?: { large?: string; medium?: string };
    num_episodes?: number;
    alternative_titles?: { en?: string; ja?: string };
    genres?: { id: number; name: string }[];
  };
  list_status: {
    status: string;
    score: number;
    num_episodes_watched: number;
    start_date?: string;
    finish_date?: string;
    comments?: string;
    num_times_rewatched: number;
  };
}

interface MALUserResponse {
  id: number;
  name: string;
  picture?: string;
}

export class MALProvider implements WritableAnimeProvider {
  platform: PlatformType = 'myanimelist';

  private async request<T>(endpoint: string, token: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${MAL_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`MAL API Error: ${response.status}`);
    }

    return response.json();
  }

  async authenticate(): Promise<string> {
    const credentials = await authService.connectPlatform('myanimelist');
    if (!credentials) throw new Error('Authentication cancelled');
    return credentials.token.accessToken;
  }

  async fetchUserList(token: string): Promise<UniversalAnimeItem[]> {
    const fields = 'list_status,num_episodes,alternative_titles,genres,main_picture';
    const allItems: UniversalAnimeItem[] = [];
    let nextUrl: string | null = `/users/@me/animelist?fields=${fields}&limit=1000`;

    type MALListResponse = { data: MALAnimeListItem[]; paging?: { next?: string } };

    while (nextUrl) {
      const response: MALListResponse = await this.request<MALListResponse>(nextUrl, token);

      for (const item of response.data) {
        allItems.push(this.mapEntry(item));
      }

      nextUrl = response.paging?.next ? response.paging.next.replace(MAL_API_BASE, '') : null;
    }

    return allItems;
  }

  async fetchUserProfile(token: string): Promise<ImportedUserProfile> {
    const data = await this.request<MALUserResponse>('/users/@me?fields=picture', token);

    return {
      username: data.name,
      avatarUrl: data.picture,
      sourcePlatform: 'myanimelist',
    };
  }

  async updateProgress(animeId: string, progress: number, token: string): Promise<void> {
    await this.request(`/anime/${animeId}/my_list_status`, token, {
      method: 'PATCH',
      body: `num_watched_episodes=${progress}`,
    });
  }

  async updateScore(animeId: string, score: number, token: string): Promise<void> {
    const malScore = Math.round(score);
    await this.request(`/anime/${animeId}/my_list_status`, token, {
      method: 'PATCH',
      body: `score=${malScore}`,
    });
  }

  async updateStatus(animeId: string, status: AnimeStatus, token: string): Promise<void> {
    const statusMap: Record<AnimeStatus, string> = {
      watching: 'watching',
      completed: 'completed',
      on_hold: 'on_hold',
      dropped: 'dropped',
      planned: 'plan_to_watch',
    };

    await this.request(`/anime/${animeId}/my_list_status`, token, {
      method: 'PATCH',
      body: `status=${statusMap[status]}`,
    });
  }

  async addToList(animeId: string, status: AnimeStatus, token: string): Promise<void> {
    await this.updateStatus(animeId, status, token);
  }

  async removeFromList(animeId: string, token: string): Promise<void> {
    await this.request(`/anime/${animeId}/my_list_status`, token, {
      method: 'DELETE',
    });
  }

  private mapEntry(item: MALAnimeListItem): UniversalAnimeItem {
    const { node, list_status } = item;

    return {
      id: `mal_${node.id}`,
      platformIds: { myanimelist: String(node.id) },
      title: node.title,
      titleEnglish: node.alternative_titles?.en,
      titleJapanese: node.alternative_titles?.ja,
      imageUrl: node.main_picture?.large || node.main_picture?.medium || '',
      status: normalizeStatus(list_status.status),
      progress: list_status.num_episodes_watched,
      totalEpisodes: node.num_episodes,
      score: list_status.score > 0 ? list_status.score : undefined,
      startDate: list_status.start_date ? new Date(list_status.start_date) : undefined,
      endDate: list_status.finish_date ? new Date(list_status.finish_date) : undefined,
      notes: list_status.comments,
      rewatchCount: list_status.num_times_rewatched,
      updatedAt: new Date(),
      source: 'myanimelist',
    };
  }
}

export const malProvider = new MALProvider();
