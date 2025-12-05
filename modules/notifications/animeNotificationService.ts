/**
 * Anime Notification Service - STUB
 * 
 * expo-notifications doesn't work in Expo Go for SDK 53+.
 * This is a stub implementation that provides the same API but does nothing.
 * 
 * For production, use a development build instead of Expo Go.
 * See: https://docs.expo.dev/develop/development-builds/introduction/
 */

import { Anime } from '../../components/rate/types';

export interface AnimeNotification {
  id: string;
  animeId: string;
  animeTitle: string;
  episode: number;
  airingAt: number;
  scheduled: boolean;
}

class AnimeNotificationService {
  private static instance: AnimeNotificationService;
  private notifications: Map<string, string> = new Map();

  private constructor() {
    console.log('[AnimeNotificationService] Running in stub mode (Expo Go)');
  }

  static getInstance(): AnimeNotificationService {
    if (!AnimeNotificationService.instance) {
      AnimeNotificationService.instance = new AnimeNotificationService();
    }
    return AnimeNotificationService.instance;
  }

  /**
   * Check if notifications are available
   * Always returns false in stub mode
   */
  isAvailable(): boolean {
    return false;
  }

  async requestPermissions(): Promise<boolean> {
    console.warn('[AnimeNotificationService] Notifications not available in Expo Go');
    return false;
  }

  async scheduleAnimeNotification(anime: Anime): Promise<string | null> {
    console.warn('[AnimeNotificationService] Cannot schedule - running in Expo Go');
    // Simulate success for UI purposes
    const fakeId = `stub-${anime.id}-${Date.now()}`;
    this.notifications.set(anime.id, fakeId);
    return fakeId;
  }

  async cancelAnimeNotification(animeId: string): Promise<void> {
    this.notifications.delete(animeId);
  }

  async cancelAllNotifications(): Promise<void> {
    this.notifications.clear();
  }

  async getScheduledNotifications(): Promise<any[]> {
    return [];
  }

  isAnimeScheduled(animeId: string): boolean {
    return this.notifications.has(animeId);
  }
}

export const animeNotificationService = AnimeNotificationService.getInstance();
