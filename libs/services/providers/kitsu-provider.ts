import {
  AnimeSourceProvider,
  WritableAnimeProvider,
  ImportedUserProfile,
  normalizeStatus,
  normalizeScore,
} from './base-provider';
import { PlatformType, AnimeStatus, UniversalAnimeItem } from '../auth/types';
import { authService } from '../auth/auth-service';

const KITSU_API = 'https://kitsu.io/api/edge';

interface KitsuAttribute {
  canonicalTitle: string;
  titles: { en?: string; en_jp?: string; ja_jp?: string };
  posterImage?: { large?: string; medium?: string; original?: string };
  episodeCount?: number;
  slug: string;
}

interface KitsuLibraryEntryAttributes {
  status: string;
  progress: number;
  ratingTwenty: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  notes: string | null;
  reconsuming: boolean;
  reconsumeCount: number;
}

interface JSONAPIResource<T> {
  id: string;
  type: string;
  attributes: T;
  relationships?: Record<string, { data: { type: string; id: string } }>;
}

interface JSONAPIResponse<T> {
  data: JSONAPIResource<T>[];
  included?: JSONAPIResource<any>[];
  meta?: { count: number };
  links?: { next?: string };
}

export class KitsuProvider implements WritableAnimeProvider {
  platform: PlatformType = 'kitsu';

  private async request<T>(endpoint: string, token: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${KITSU_API}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/vnd.api+json',
        Accept: 'application/vnd.api+json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Kitsu API Error: ${response.status}`);
    }

    return response.json();
  }

  async authenticate(): Promise<string> {
    // Kitsu uses password auth, so we expect the auth service to have the token already
    // or we trigger the login flow. Since this is a provider, we assume the user connects via UI.
    // For the provider interface, we check if we have stored credentials.
    const credentials = authService.getCredentials('kitsu');
    if (!credentials) throw new Error('Kitsu requires login');
    return credentials.token.accessToken;
  }

  async fetchUserList(token: string): Promise<UniversalAnimeItem[]> {
    const userId = await this.getUserId(token);
    let allItems: UniversalAnimeItem[] = [];
    let nextUrl: string | null =
      `/users/${userId}/library-entries?filter[kind]=anime&include=anime&page[limit]=500`;

    while (nextUrl) {
      const response: JSONAPIResponse<KitsuLibraryEntryAttributes> = await this.request<
        JSONAPIResponse<KitsuLibraryEntryAttributes>
      >(nextUrl, token);

      const animeMap = new Map<string, JSONAPIResource<KitsuAttribute>>();
      if (response.included) {
        for (const inc of response.included) {
          if (inc.type === 'anime') {
            animeMap.set(inc.id, inc as JSONAPIResource<KitsuAttribute>);
          }
        }
      }

      for (const item of response.data) {
        const animeId = item.relationships?.anime?.data?.id;
        const anime = animeId ? animeMap.get(animeId) : undefined;
        if (anime) {
          allItems.push(this.mapEntry(item, anime));
        }
      }

      nextUrl = response.links?.next ? response.links.next.replace(KITSU_API, '') : null;
    }

    return allItems;
  }

  async fetchUserProfile(token: string): Promise<ImportedUserProfile> {
    const response = await this.request<
      JSONAPIResponse<{ name: string; avatar?: { original?: string } }>
    >('/users?filter[self]=true', token);
    const user = response.data[0];

    return {
      username: user.attributes.name,
      avatarUrl: user.attributes.avatar?.original,
      sourcePlatform: 'kitsu',
    };
  }

  private async getUserId(token: string): Promise<string> {
    const response = await this.request<JSONAPIResponse<{ id: string }>>(
      '/users?filter[self]=true',
      token
    );
    return response.data[0].id;
  }

  async updateProgress(animeId: string, progress: number, token: string): Promise<void> {
    const libraryEntryId = await this.getLibraryEntryId(animeId, token);
    if (!libraryEntryId) {
      await this.createLibraryEntry(animeId, { progress }, token);
      return;
    }
    await this.updateLibraryEntry(libraryEntryId, { progress }, token);
  }

  async updateScore(animeId: string, score: number, token: string): Promise<void> {
    const libraryEntryId = await this.getLibraryEntryId(animeId, token);
    // Kitsu uses 0-20 scale
    const ratingTwenty = Math.round(score * 2);

    if (!libraryEntryId) {
      await this.createLibraryEntry(animeId, { ratingTwenty }, token);
      return;
    }
    await this.updateLibraryEntry(libraryEntryId, { ratingTwenty }, token);
  }

  async updateStatus(animeId: string, status: AnimeStatus, token: string): Promise<void> {
    const statusMap: Record<AnimeStatus, string> = {
      watching: 'current',
      completed: 'completed',
      on_hold: 'on_hold',
      dropped: 'dropped',
      planned: 'planned',
    };

    const libraryEntryId = await this.getLibraryEntryId(animeId, token);
    if (!libraryEntryId) {
      await this.createLibraryEntry(animeId, { status: statusMap[status] }, token);
      return;
    }
    await this.updateLibraryEntry(libraryEntryId, { status: statusMap[status] }, token);
  }

  async addToList(animeId: string, status: AnimeStatus, token: string): Promise<void> {
    await this.updateStatus(animeId, status, token);
  }

  async removeFromList(animeId: string, token: string): Promise<void> {
    const libraryEntryId = await this.getLibraryEntryId(animeId, token);
    if (libraryEntryId) {
      await this.request(`/library-entries/${libraryEntryId}`, token, {
        method: 'DELETE',
      });
    }
  }

  private async getLibraryEntryId(animeId: string, token: string): Promise<string | null> {
    const userId = await this.getUserId(token);
    const response = await this.request<JSONAPIResponse<any>>(
      `/library-entries?filter[userId]=${userId}&filter[animeId]=${animeId}`,
      token
    );
    return response.data.length > 0 ? response.data[0].id : null;
  }

  private async createLibraryEntry(
    animeId: string,
    attributes: Partial<KitsuLibraryEntryAttributes>,
    token: string
  ): Promise<void> {
    const userId = await this.getUserId(token);
    await this.request('/library-entries', token, {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'library-entries',
          attributes,
          relationships: {
            user: { data: { type: 'users', id: userId } },
            anime: { data: { type: 'anime', id: animeId } },
          },
        },
      }),
    });
  }

  private async updateLibraryEntry(
    entryId: string,
    attributes: Partial<KitsuLibraryEntryAttributes>,
    token: string
  ): Promise<void> {
    await this.request(`/library-entries/${entryId}`, token, {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          id: entryId,
          type: 'library-entries',
          attributes,
        },
      }),
    });
  }

  private mapEntry(
    entry: JSONAPIResource<KitsuLibraryEntryAttributes>,
    anime: JSONAPIResource<KitsuAttribute>
  ): UniversalAnimeItem {
    const attrs = entry.attributes;
    const animeAttrs = anime.attributes;

    const statusMap: Record<string, AnimeStatus> = {
      current: 'watching',
      completed: 'completed',
      on_hold: 'on_hold',
      dropped: 'dropped',
      planned: 'planned',
    };

    return {
      id: `kitsu_${anime.id}`,
      platformIds: { kitsu: anime.id },
      title: animeAttrs.canonicalTitle,
      titleEnglish: animeAttrs.titles.en || animeAttrs.titles.en_jp,
      titleJapanese: animeAttrs.titles.ja_jp,
      imageUrl:
        animeAttrs.posterImage?.large ||
        animeAttrs.posterImage?.medium ||
        animeAttrs.posterImage?.original ||
        '',
      status: statusMap[attrs.status] || 'watching',
      progress: attrs.progress,
      totalEpisodes: animeAttrs.episodeCount,
      score: attrs.ratingTwenty ? attrs.ratingTwenty / 2 : undefined,
      startDate: attrs.startedAt ? new Date(attrs.startedAt) : undefined,
      endDate: attrs.finishedAt ? new Date(attrs.finishedAt) : undefined,
      notes: attrs.notes || undefined,
      rewatchCount: attrs.reconsumeCount,
      updatedAt: new Date(),
      source: 'kitsu',
    };
  }
}

export const kitsuProvider = new KitsuProvider();
