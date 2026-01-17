import {
  AnimeSourceProvider,
  ImportedUserProfile,
  normalizeStatus,
  normalizeScore,
} from './base-provider';
import { PlatformType, AnimeStatus, UniversalAnimeItem } from '../auth/types';
import { authService } from '../auth/auth-service';

interface KavitaSeries {
  id: number;
  name: string;
  originalName: string;
  format: number;
  thumbUrl?: string;
  pagesRead: number;
  pages: number;
}

interface KavitaUser {
  username: string;
  email: string;
}

export class KavitaProvider implements AnimeSourceProvider {
  platform: PlatformType = 'kavita';

  private async request<T>(
    endpoint: string,
    token: string,
    baseUrl: string,
    options: RequestInit = {}
  ): Promise<T> {
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');

    const response = await fetch(`${cleanBaseUrl}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Kavita API Error: ${response.status}`);
    }

    return response.json();
  }

  async authenticate(): Promise<string> {
    const credentials = await authService.connectPlatform('kavita');
    if (!credentials) throw new Error('Authentication cancelled');
    return credentials.token.accessToken;
  }

  async fetchUserList(token: string): Promise<UniversalAnimeItem[]> {
    const credentials = authService.getCredentials('kavita');
    if (!credentials?.serverUrl) throw new Error('Kavita server URL not configured');

    const baseUrl = credentials.serverUrl;

    const seriesList = await this.request<KavitaSeries[]>('/api/Series/all', token, baseUrl);

    return seriesList.map((item) => this.mapEntry(item, baseUrl, token));
  }

  async fetchUserProfile(token: string): Promise<ImportedUserProfile> {
    const credentials = authService.getCredentials('kavita');
    if (!credentials?.serverUrl) throw new Error('Kavita server URL not configured');

    const user = await this.request<KavitaUser>('/api/users/me', token, credentials.serverUrl);

    return {
      username: user.username,
      avatarUrl: undefined,
      sourcePlatform: 'kavita',
    };
  }

  private mapEntry(item: KavitaSeries, baseUrl: string, token: string): UniversalAnimeItem {
    let status: AnimeStatus = 'planned';
    if (item.pagesRead > 0) {
      if (item.pagesRead >= item.pages && item.pages > 0) {
        status = 'completed';
      } else {
        status = 'watching';
      }
    }

    const imageUrl = `${baseUrl.replace(/\/$/, '')}/api/image/series-cover?seriesId=${item.id}&apiKey=${token}`;

    return {
      id: `kavita_${item.id}`,
      platformIds: { kavita: String(item.id) },
      title: item.name,
      titleEnglish: item.originalName,
      imageUrl,
      status,
      progress: item.pagesRead,
      totalEpisodes: item.pages,
      score: undefined,
      updatedAt: new Date(),
      source: 'kavita',
    };
  }
}

export const kavitaProvider = new KavitaProvider();
