import {
  AnimeSourceProvider,
  WritableAnimeProvider,
  ImportedUserProfile,
  normalizeStatus,
  normalizeScore,
} from './base-provider';
import { PlatformType, AnimeStatus, UniversalAnimeItem } from '../auth/types';
import { authService } from '../auth/auth-service';

const ANNICT_API = 'https://api.annict.com/v1';

interface AnnictWork {
  id: number;
  title: string;
  title_en: string;
  title_kana: string;
  media: string;
  images: {
    recommended_url: string;
    facebook: { og_image_url: string };
    twitter: { mini_url: string; normal_url: string; original_url: string };
  };
  episodes_count: number;
}

interface AnnictLibraryEntry {
  work: AnnictWork;
  status: { kind: string };
  next_episode: { number: number } | null;
}

export class AnnictProvider implements WritableAnimeProvider {
  platform: PlatformType = 'annict';

  private async request<T>(endpoint: string, token: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${ANNICT_API}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Annict API Error: ${response.status}`);
    }

    return response.json();
  }

  async authenticate(): Promise<string> {
    const credentials = await authService.connectPlatform('annict');
    if (!credentials) throw new Error('Authentication cancelled');
    return credentials.token.accessToken;
  }

  async fetchUserList(token: string): Promise<UniversalAnimeItem[]> {
    let allItems: UniversalAnimeItem[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.request<{ works: AnnictLibraryEntry[]; total_count: number }>(
        `/me/works?per_page=50&page=${page}&sort_watchers_count=desc`,
        token
      );

      for (const item of response.works) {
        allItems.push(this.mapEntry(item));
      }

      if (response.works.length < 50) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return allItems;
  }

  async fetchUserProfile(token: string): Promise<ImportedUserProfile> {
    const data = await this.request<{ username: string; avatar_url: string }>('/me', token);

    return {
      username: data.username,
      avatarUrl: data.avatar_url,
      sourcePlatform: 'annict',
    };
  }

  async updateProgress(animeId: string, progress: number, token: string): Promise<void> {
    const episodes = await this.request<{ episodes: { id: number; number: number }[] }>(
      `/episodes?filter_work_id=${animeId}&filter_number=${progress}`,
      token
    );

    if (episodes.episodes.length > 0) {
      const episodeId = episodes.episodes[0].id;
      await this.request('/me/records', token, {
        method: 'POST',
        body: JSON.stringify({ episode_id: episodeId }),
      });
    }
  }

  async updateScore(animeId: string, score: number, token: string): Promise<void> {
    await this.request('/me/records', token, {
      method: 'POST',
      body: JSON.stringify({
        work_id: parseInt(animeId),
        kind: 'anime',
        rating_overall: score,
      }),
    });
  }

  async updateStatus(animeId: string, status: AnimeStatus, token: string): Promise<void> {
    const statusMap: Record<AnimeStatus, string> = {
      watching: 'watching',
      completed: 'watched',
      on_hold: 'on_hold',
      dropped: 'stop_watching',
      planned: 'wanna_watch',
    };

    await this.request('/me/statuses', token, {
      method: 'POST',
      body: JSON.stringify({
        work_id: parseInt(animeId),
        kind: statusMap[status],
      }),
    });
  }

  async addToList(animeId: string, status: AnimeStatus, token: string): Promise<void> {
    await this.updateStatus(animeId, status, token);
  }

  async removeFromList(animeId: string, token: string): Promise<void> {
    await this.request('/me/statuses', token, {
      method: 'POST',
      body: JSON.stringify({
        work_id: parseInt(animeId),
        kind: 'no_select',
      }),
    });
  }

  private mapEntry(entry: AnnictLibraryEntry): UniversalAnimeItem {
    const { work, status } = entry;

    const statusMap: Record<string, AnimeStatus> = {
      watching: 'watching',
      watched: 'completed',
      on_hold: 'on_hold',
      stop_watching: 'dropped',
      wanna_watch: 'planned',
    };

    let progress = 0;
    if (status.kind === 'watched') progress = work.episodes_count || 0;

    const imageUrl = work.images?.facebook?.og_image_url || work.images?.recommended_url || '';

    return {
      id: `annict_${work.id}`,
      platformIds: { annict: String(work.id) },
      title: work.title,
      titleEnglish: work.title_en,
      titleJapanese: work.title,
      imageUrl,
      status: statusMap[status.kind] || 'watching',
      progress,
      totalEpisodes: work.episodes_count,
      score: undefined,
      updatedAt: new Date(),
      source: 'annict',
    };
  }
}

export const annictProvider = new AnnictProvider();
