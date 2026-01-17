/**
 * AniList API Integration Layer
 *
 * Provides real API integration with AniList for user profile and anime data.
 * This replaces mock data with actual API calls to AniList's GraphQL API.
 */

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';

export interface AniListUser {
  id: number;
  name: string;
  avatar: {
    large: string;
    medium: string;
  };
  bannerImage: string;
  about: string;
  statistics: {
    anime: {
      count: number;
      episodesWatched: number;
      minutesWatched: number;
      meanScore: number;
    };
  };
}

export interface AniListMediaListEntry {
  id: number;
  mediaId: number;
  status: string;
  progress: number;
  score: number;
  media: {
    id: number;
    title: {
      romaji: string;
      english: string;
      native: string;
    };
    coverImage: {
      large: string;
      medium: string;
    };
    episodes: number;
    format: string;
  };
}

export interface AniListViewerResponse {
  data: {
    Viewer: AniListUser;
  };
}

export interface AniListListResponse {
  data: {
    MediaListCollection: {
      lists: Array<{
        entries: AniListMediaListEntry[];
      }>;
    };
  };
}

export class AniListAPI {
  private accessToken: string | null = null;

  constructor(accessToken?: string) {
    this.accessToken = accessToken || null;
  }

  private async fetch<T>(query: string, variables: Record<string, any> = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`AniList API Error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    if (json.errors) {
      throw new Error(`AniList GraphQL Error: ${JSON.stringify(json.errors)}`);
    }

    return json.data;
  }

  /**
   * Authenticate with AniList using OAuth
   * Returns the access token
   */
  async authenticate(clientId: string, redirectUri: string): Promise<string> {
    // Build authorization URL
    const authUrl = new URL('https://anilist.co/api/v2/oauth/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');

    // For web-based auth, we'd open the URL in a browser
    // For mobile, we use ASWebAuthenticationSession (iOS) or Chrome Custom Tab (Android)

    // In a real implementation, this would return the OAuth callback URL
    // For now, we'll throw an error indicating OAuth is needed
    throw new Error('OAuth authentication required. Use native auth flow.');
  }

  /**
   * Get current viewer (authenticated user)
   */
  async getViewer(): Promise<AniListUser> {
    const query = `
      query {
        Viewer {
          id
          name
          avatar {
            large
            medium
          }
          bannerImage
          about
          statistics {
            anime {
              count
              episodesWatched
              minutesWatched
              meanScore
            }
          }
        }
      }
    `;

    const response = await this.fetch<AniListViewerResponse>(query);
    return response.data.Viewer;
  }

  /**
   * Get user's anime list
   */
  async getAnimeList(userName?: string): Promise<AniListMediaListEntry[]> {
    const query = `
      query ($userName: String) {
        MediaListCollection(userName: $userName, type: ANIME) {
          lists {
            entries {
              id
              mediaId
              status
              progress
              score
              media {
                id
                title {
                  romaji
                  english
                  native
                }
                coverImage {
                  large
                  medium
                }
                episodes
                format
              }
            }
          }
        }
      }
    `;

    const variables: Record<string, any> = {};
    if (userName) {
      variables.userName = userName;
    }

    const response = await this.fetch<AniListListResponse>(query, variables);

    const allEntries: AniListMediaListEntry[] = [];
    for (const list of response.data.MediaListCollection.lists) {
      if (list.entries) {
        allEntries.push(...list.entries);
      }
    }

    return allEntries;
  }

  /**
   * Get user profile by username (public data)
   */
  async getUserProfile(userName: string): Promise<Partial<AniListUser>> {
    const query = `
      query ($name: String) {
        User(name: $name) {
          id
          name
          avatar {
            large
            medium
          }
          bannerImage
          statistics {
            anime {
              count
              episodesWatched
              minutesWatched
              meanScore
            }
          }
        }
      }
    `;

    const response = await this.fetch<{ User: Partial<AniListUser> }>(query, {
      name: userName,
    });
    return response.User;
  }

  /**
   * Set access token for authenticated requests
   */
  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return !!this.accessToken;
  }
}

// Export singleton instance
export const anilistAPI = new AniListAPI();
