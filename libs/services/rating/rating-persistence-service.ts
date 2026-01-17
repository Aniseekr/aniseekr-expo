import { LocalDB, RatingItem, UserStats } from '../../db';

export type RatingType = 'like' | 'pass' | 'super_like';

export class RatingPersistenceService {
  private static instance: RatingPersistenceService;

  static getInstance(): RatingPersistenceService {
    if (!RatingPersistenceService.instance) {
      RatingPersistenceService.instance = new RatingPersistenceService();
    }
    return RatingPersistenceService.instance;
  }

  async saveRating(animeId: string, rating: RatingType): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.runAsync(
      'INSERT OR REPLACE INTO ratings (id, rating, timestamp) VALUES (?, ?, ?)',
      animeId,
      rating,
      Date.now()
    );
  }

  async getRating(animeId: string): Promise<RatingItem | null> {
    const db = await LocalDB.getDatabase();
    return await db.getFirstAsync<RatingItem>('SELECT * FROM ratings WHERE id = ?', animeId);
  }

  async getAllRatings(): Promise<RatingItem[]> {
    const db = await LocalDB.getDatabase();
    return await db.getAllAsync<RatingItem>('SELECT * FROM ratings ORDER BY timestamp DESC');
  }

  async deleteRating(animeId: string): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.runAsync('DELETE FROM ratings WHERE id = ?', animeId);
  }

  async getStats(): Promise<UserStats> {
    return await LocalDB.getStats();
  }
}

export const ratingPersistenceService = RatingPersistenceService.getInstance();
