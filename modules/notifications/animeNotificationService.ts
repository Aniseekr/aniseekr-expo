import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Anime } from '../../components/rate/types';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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
  private notifications: Map<string, string> = new Map(); // animeId -> notificationId

  private constructor() {}

  static getInstance(): AnimeNotificationService {
    if (!AnimeNotificationService.instance) {
      AnimeNotificationService.instance = new AnimeNotificationService();
    }
    return AnimeNotificationService.instance;
  }

  async requestPermissions(): Promise<boolean> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('Notification permissions not granted');
        return false;
      }

      // Configure notification channel for Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('anime-reminders', {
          name: 'Anime Reminders',
          description: 'Notifications for new anime episodes',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF6B6B',
          sound: 'default',
        });
      }

      return true;
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      return false;
    }
  }

  async scheduleAnimeNotification(anime: Anime): Promise<string | null> {
    if (!anime.nextAiringEpisode) {
      console.warn('Anime has no next airing episode');
      return null;
    }

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      return null;
    }

    const { airingAt, episode } = anime.nextAiringEpisode;
    const notificationId = this.notifications.get(anime.id);

    // Cancel existing notification if any
    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    }

    // Schedule 30 minutes before airing
    const triggerTime = airingAt * 1000 - 30 * 60 * 1000; // 30 minutes before
    const now = Date.now();

    if (triggerTime <= now) {
      console.warn('Airing time is too soon or in the past');
      return null;
    }

    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: `${anime.title} - Episode ${episode}`,
          body: `New episode airing in 30 minutes!`,
          data: {
            animeId: anime.id,
            animeTitle: anime.title,
            episode,
          },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: {
          date: new Date(triggerTime),
        },
      });

      this.notifications.set(anime.id, notificationId);
      return notificationId;
    } catch (error) {
      console.error('Error scheduling notification:', error);
      return null;
    }
  }

  async cancelAnimeNotification(animeId: string): Promise<void> {
    const notificationId = this.notifications.get(animeId);
    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      this.notifications.delete(animeId);
    }
  }

  async cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
    this.notifications.clear();
  }

  async getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
    return await Notifications.getAllScheduledNotificationsAsync();
  }

  isAnimeScheduled(animeId: string): boolean {
    return this.notifications.has(animeId);
  }
}

export const animeNotificationService = AnimeNotificationService.getInstance();
