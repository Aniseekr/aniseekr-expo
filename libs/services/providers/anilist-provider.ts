import {
  AnimeSourceProvider,
  WritableAnimeProvider,
  ImportedUserProfile,
  normalizeStatus,
  normalizeScore,
} from './base-provider';
import { PlatformType, AnimeStatus, UniversalAnimeItem, PLATFORM_CONFIGS } from '../auth/types';
import { authService } from '../auth/auth-service';

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';

interface AniListMedia {
  id: number;
  title: { romaji: string; english: string | null; native: string | null };
  episodes: number | null;
  coverImage: { large: string; medium: string };
  genres: string[];
}

interface AniListEntry {
  id: number;
  mediaId: number;
  status: string;
  progress: number;
  score: number;
  startedAt: { year: number | null; month: number | null; day: number | null } | null;
  completedAt: { year: number | null; month: number | null; day: number | null } | null;
  notes: string | null;
  repeat: number;
  media: AniListMedia;
}

export class AniListProvider implements WritableAnimeProvider {
  platform: PlatformType = 'anilist';

  private async graphql<T>(
    query: string,
    variables: Record<string, unknown> = {},
    token?: string
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`AniList API Error: ${response.status}`);
    }

    const json = await response.json();
    if (json.errors) {
      throw new Error(`GraphQL Error: ${JSON.stringify(json.errors)}`);
    }

    return json.data;
  }

  async authenticate(): Promise<string> {
    const credentials = await authService.connectPlatform('anilist');
    if (!credentials) throw new Error('Authentication cancelled');
    return credentials.token.accessToken;
  }

  async fetchUserList(token: string): Promise<UniversalAnimeItem[]> {
    const query = `
      query ($userId: Int) {
        MediaListCollection(userId: $userId, type: ANIME) {
          lists {
            entries {
              id
              mediaId
              status
              progress
              score(format: POINT_10)
              startedAt { year month day }
              completedAt { year month day }
              notes
              repeat
              media {
                id
                title { romaji english native }
                episodes
                coverImage { large medium }
                genres
              }
            }
          }
        }
      }
    `;

    const viewer = await this.graphql<{ Viewer: { id: number } }>(
      `query { Viewer { id } }`,
      {},
      token
    );

    const data = await this.graphql<{
      MediaListCollection: { lists: { entries: AniListEntry[] }[] };
    }>(query, { userId: viewer.Viewer.id }, token);

    const entries: UniversalAnimeItem[] = [];
    for (const list of data.MediaListCollection.lists) {
      for (const entry of list.entries) {
        entries.push(this.mapEntry(entry));
      }
    }

    return entries;
  }

  async fetchUserProfile(token: string): Promise<ImportedUserProfile> {
    const data = await this.graphql<{
      Viewer: { name: string; avatar: { large: string } };
    }>(`query { Viewer { name avatar { large } } }`, {}, token);

    return {
      username: data.Viewer.name,
      avatarUrl: data.Viewer.avatar?.large,
      sourcePlatform: 'anilist',
    };
  }

  private parseId(animeId: string): number {
    const id = parseInt(animeId, 10);
    if (isNaN(id)) throw new Error(`Invalid anime ID: ${animeId}`);
    return id;
  }

  async updateProgress(animeId: string, progress: number, token: string): Promise<void> {
    const mutation = `
      mutation ($mediaId: Int!, $progress: Int!) {
        SaveMediaListEntry(mediaId: $mediaId, progress: $progress) { id }
      }
    `;
    await this.graphql(mutation, { mediaId: this.parseId(animeId), progress }, token);
  }

  async updateScore(animeId: string, score: number, token: string): Promise<void> {
    const mutation = `
      mutation ($mediaId: Int!, $scoreRaw: Int!) {
        SaveMediaListEntry(mediaId: $mediaId, scoreRaw: $scoreRaw) { id }
      }
    `;
    await this.graphql(
      mutation,
      { mediaId: this.parseId(animeId), scoreRaw: Math.round(score * 10) },
      token
    );
  }

  async updateStatus(animeId: string, status: AnimeStatus, token: string): Promise<void> {
    const statusMap: Record<AnimeStatus, string> = {
      watching: 'CURRENT',
      completed: 'COMPLETED',
      on_hold: 'PAUSED',
      dropped: 'DROPPED',
      planned: 'PLANNING',
    };

    const mutation = `
      mutation ($mediaId: Int!, $status: MediaListStatus!) {
        SaveMediaListEntry(mediaId: $mediaId, status: $status) { id }
      }
    `;
    await this.graphql(
      mutation,
      { mediaId: this.parseId(animeId), status: statusMap[status] },
      token
    );
  }

  async addToList(animeId: string, status: AnimeStatus, token: string): Promise<void> {
    await this.updateStatus(animeId, status, token);
  }

  async removeFromList(animeId: string, token: string): Promise<void> {
    const mutation = `
      mutation ($mediaId: Int!) {
        DeleteMediaListEntry(mediaId: $mediaId) { deleted }
      }
    `;
    await this.graphql(mutation, { mediaId: this.parseId(animeId) }, token);
  }

  private mapEntry(entry: AniListEntry): UniversalAnimeItem {
    const title =
      entry.media.title.english ||
      entry.media.title.romaji ||
      entry.media.title.native ||
      'Unknown';

    return {
      id: `anilist_${entry.mediaId}`,
      platformIds: { anilist: String(entry.mediaId) },
      title,
      titleEnglish: entry.media.title.english || undefined,
      titleJapanese: entry.media.title.native || undefined,
      titleRomaji: entry.media.title.romaji || undefined,
      imageUrl: entry.media.coverImage.large || entry.media.coverImage.medium,
      status: normalizeStatus(entry.status),
      progress: entry.progress,
      totalEpisodes: entry.media.episodes || undefined,
      score: entry.score > 0 ? entry.score : undefined,
      startDate: this.parseDate(entry.startedAt),
      endDate: this.parseDate(entry.completedAt),
      notes: entry.notes || undefined,
      rewatchCount: entry.repeat,
      updatedAt: new Date(),
      source: 'anilist',
    };
  }

  private parseDate(
    date: { year: number | null; month: number | null; day: number | null } | null
  ): Date | undefined {
    if (!date || !date.year) return undefined;
    return new Date(date.year, (date.month || 1) - 1, date.day || 1);
  }
}

export const anilistProvider = new AniListProvider();
