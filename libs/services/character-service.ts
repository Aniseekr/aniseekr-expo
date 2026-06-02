import { JikanClient } from '../clients/jikan-client';

export interface Character {
  id: number;
  name: string;
  images: {
    jpg: {
      imageUrl: string;
    };
    webp?: {
      imageUrl: string;
    };
  };
  favorites?: number;
}

interface JikanResponse<T> {
  data: T;
  pagination?: {
    last_visible_page: number;
    has_next_page: boolean;
  };
}

interface AnimeCharacter {
  character: Character;
  role: string;
  favorites?: number;
}

class CharacterService {
  private static instance: CharacterService;
  private gachaPool: Character[] = [];
  private poolLastUpdated: Date | null = null;
  private readonly poolCacheDuration = 3600000; // 1 hour in milliseconds

  private constructor() {}

  static getInstance(): CharacterService {
    if (!CharacterService.instance) {
      CharacterService.instance = new CharacterService();
    }
    return CharacterService.instance;
  }

  /**
   * Fetch top characters (popular characters for gacha pool)
   */
  async fetchTopCharacters(page: number = 1, limit: number = 25): Promise<Character[]> {
    try {
      const response = await JikanClient.get<JikanResponse<Character[]>>('/top/characters', {
        page,
        limit,
      });
      return response.data ?? [];
    } catch (error) {
      console.error('Error fetching top characters:', error);
      throw error;
    }
  }

  /**
   * Fetch characters from a specific anime
   */
  async fetchAnimeCharacters(animeId: number): Promise<Character[]> {
    try {
      const response = await JikanClient.get<JikanResponse<AnimeCharacter[]>>(
        `/anime/${animeId}/characters`
      );
      return (response.data ?? []).map((item) => item.character);
    } catch (error) {
      console.error(`Error fetching characters for anime ${animeId}:`, error);
      throw error;
    }
  }

  /**
   * Fetch character details by ID
   */
  async fetchCharacterDetails(id: number): Promise<Character> {
    try {
      const response = await JikanClient.get<JikanResponse<Character>>(`/characters/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching character ${id}:`, error);
      throw error;
    }
  }

  /**
   * Build gacha pool from top characters
   */
  async buildGachaPool(size: number = 100): Promise<Character[]> {
    if (!this.shouldRefreshPool() && this.gachaPool.length >= size) {
      return this.gachaPool.slice(0, size);
    }

    const allCharacters: Character[] = [];
    let page = 1;
    const limit = 25;

    // Fetch multiple pages to build pool
    while (allCharacters.length < size) {
      try {
        const characters = await this.fetchTopCharacters(page, limit);
        if (characters.length === 0) {
          break;
        }
        allCharacters.push(...characters);
        page += 1;

        // Limit to prevent infinite loops
        if (page > 10) {
          break;
        }

        // Small delay to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 400));
      } catch (error) {
        console.error(`Error building gacha pool at page ${page}:`, error);
        break;
      }
    }

    this.gachaPool = allCharacters.slice(0, size);
    this.poolLastUpdated = new Date();
    console.log(`🎰 Gacha pool initialized with ${this.gachaPool.length} characters`);

    return this.gachaPool;
  }

  /**
   * Get current gacha pool
   */
  getGachaPool(): Character[] {
    return this.gachaPool;
  }

  /**
   * Check if pool needs refresh
   */
  private shouldRefreshPool(): boolean {
    if (!this.poolLastUpdated) return true;
    return Date.now() - this.poolLastUpdated.getTime() > this.poolCacheDuration;
  }
}

export const characterService = CharacterService.getInstance();
