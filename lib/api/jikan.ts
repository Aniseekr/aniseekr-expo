// Jikan API Client for React Native
// Documentation: https://docs.api.jikan.moe/

const BASE_URL = 'https://api.jikan.moe/v4';

export interface JikanResponse<T> {
  data: T;
  pagination?: {
    last_visible_page?: number;
    has_next_page?: boolean;
    items?: {
      count?: number;
      total?: number;
      per_page?: number;
    };
  };
}

export interface JikanAnime {
  mal_id: number;
  url: string;
  images: {
    jpg: {
      image_url: string;
      small_image_url: string;
      large_image_url: string;
    };
    webp: {
      image_url: string;
      small_image_url: string;
      large_image_url: string;
    };
  };
  trailer?: {
    youtube_id?: string;
    url?: string;
    embed_url?: string;
  };
  title: string;
  title_english?: string;
  title_japanese?: string;
  title_synonyms?: string[];
  type?: string;
  source?: string;
  episodes?: number;
  status?: string;
  airing?: boolean;
  aired: {
    from?: string;
    to?: string;
    prop: {
      from: { day?: number; month?: number; year?: number };
      to: { day?: number; month?: number; year?: number };
    };
    string?: string;
  };
  duration?: string;
  rating?: string;
  score?: number;
  scored_by?: number;
  rank?: number;
  popularity?: number;
  members?: number;
  favorites?: number;
  synopsis?: string;
  background?: string;
  season?: string;
  year?: number;
  broadcast: {
    day?: string;
    time?: string;
    timezone?: string;
    string?: string;
  };
  producers: Array<{ mal_id: number; type: string; name: string; url: string }>;
  licensors: Array<{ mal_id: number; type: string; name: string; url: string }>;
  studios: Array<{ mal_id: number; type: string; name: string; url: string }>;
  genres: Array<{ mal_id: number; type: string; name: string; url: string }>;
  explicit_genres: Array<{ mal_id: number; type: string; name: string; url: string }>;
  themes: Array<{ mal_id: number; type: string; name: string; url: string }>;
  demographics: Array<{ mal_id: number; type: string; name: string; url: string }>;
}

export interface JikanGenre {
  mal_id: number;
  name: string;
  url: string;
  count: number;
}

class RateLimiter {
  private lastRequestTime = 0;
  private readonly minInterval = 1000; // 1 second between requests

  async waitForAvailability(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }
}

const rateLimiter = new RateLimiter();

async function fetchWithRetry<T>(
  url: string,
  retries = 3
): Promise<T> {
  await rateLimiter.waitForAvailability();

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url);

      if (response.status === 429) {
        const waitTime = Math.pow(2, attempt) * 1000;
        console.warn(`⚠️ Rate limit exceeded. Retrying in ${waitTime}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (attempt === retries - 1) {
        throw error;
      }
      const waitTime = Math.pow(2, attempt) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  throw new Error('Failed after retries');
}

export class JikanClient {
  static async getTopAnime(params?: {
    page?: number;
    limit?: number;
    type?: string;
    filter?: string;
  }): Promise<JikanResponse<JikanAnime[]>> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.type) queryParams.set('type', params.type);
    if (params?.filter) queryParams.set('filter', params.filter);

    const url = `${BASE_URL}/top/anime${queryParams.toString() ? `?${queryParams}` : ''}`;
    return fetchWithRetry<JikanResponse<JikanAnime[]>>(url);
  }

  static async getAnimeGenres(): Promise<JikanResponse<JikanGenre[]>> {
    const url = `${BASE_URL}/genres/anime`;
    return fetchWithRetry<JikanResponse<JikanGenre[]>>(url);
  }

  static async getAnimeById(id: number): Promise<JikanResponse<JikanAnime>> {
    const url = `${BASE_URL}/anime/${id}`;
    return fetchWithRetry<JikanResponse<JikanAnime>>(url);
  }

  static async getAnimeByGenre(
    genreId: number,
    params?: { page?: number; limit?: number }
  ): Promise<JikanResponse<JikanAnime[]>> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.limit) queryParams.set('limit', params.limit.toString());

    const url = `${BASE_URL}/anime?genres=${genreId}${queryParams.toString() ? `&${queryParams}` : ''}`;
    return fetchWithRetry<JikanResponse<JikanAnime[]>>(url);
  }

  static async getSeasonalAnime(
    year: number,
    season: 'winter' | 'spring' | 'summer' | 'fall',
    params?: { page?: number; limit?: number }
  ): Promise<JikanResponse<JikanAnime[]>> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.limit) queryParams.set('limit', params.limit.toString());

    const url = `${BASE_URL}/seasons/${year}/${season}${queryParams.toString() ? `?${queryParams}` : ''}`;
    return fetchWithRetry<JikanResponse<JikanAnime[]>>(url);
  }

  static async searchAnime(
    query: string,
    params?: { page?: number; limit?: number }
  ): Promise<JikanResponse<JikanAnime[]>> {
    const queryParams = new URLSearchParams({ q: query });
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.limit) queryParams.set('limit', params.limit.toString());

    const url = `${BASE_URL}/anime?${queryParams}`;
    return fetchWithRetry<JikanResponse<JikanAnime[]>>(url);
  }
}



