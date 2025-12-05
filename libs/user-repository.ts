import { JikanClient } from "./jikan-client";

export interface UserProfile {
  id: string;
  username: string;
  avatarUrl: string;
  isDonator: boolean;
  stats: {
    totalRated: number;
    likedCount: number;
    cardsCount: number;
    foldersCount: number;
  };
}

// Simulates a user repository. 
// In the future this will connect to AniList or a local database.
export class UserRepository {
  static async getProfile(): Promise<UserProfile> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    return {
      id: "u1",
      username: "Kidney", // Or fetch from local storage
      avatarUrl: "https://github.com/kidney.png", // Placeholder or from AniList
      isDonator: true,
      stats: {
        totalRated: 207,
        likedCount: 140,
        cardsCount: 0,
        foldersCount: 8
      }
    };
  }

  // Placeholder for future update
  static async updateProfile(data: Partial<UserProfile>): Promise<void> {
    // Save to local storage or API
  }
}
