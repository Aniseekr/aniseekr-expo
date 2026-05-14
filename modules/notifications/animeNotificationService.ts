/**
 * Anime Notification Service
 *
 * Thin facade over libs/services/notifications/notification-service.ts that
 * keeps a synchronous in-memory mirror (animeId -> notificationId) so UI code
 * can call `isAnimeScheduled(animeId)` without awaiting. The mirror is
 * hydrated from the OS scheduler on first use.
 *
 * Notes:
 * - Requires a dev build (expo-notifications scheduling does not work in Expo Go SDK 53+).
 * - Anime.nextAiringEpisode.airingAt is treated as unix SECONDS (AniList convention).
 */

import { useSyncExternalStore } from 'react';
import * as Notifications from 'expo-notifications';
import { Anime } from '../../components/rate/types';
import { notificationService } from '../../libs/services/notifications/notification-service';

const DEFAULT_LEAD_TIME_MINUTES = 15;

class AnimeNotificationService {
  private static instance: AnimeNotificationService;
  // animeId -> notificationId. Mirrors the subset of OS-scheduled notifications
  // whose data.kind === 'episode_reminder', so sync lookups stay cheap.
  private notifications: Map<string, string> = new Map();
  private hydrated = false;
  private hydrating: Promise<void> | null = null;
  private listeners: Set<() => void> = new Set();

  private constructor() {}

  /** Subscribe to mirror changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        console.warn('[AnimeNotificationService] listener threw', e);
      }
    }
  }

  static getInstance(): AnimeNotificationService {
    if (!AnimeNotificationService.instance) {
      AnimeNotificationService.instance = new AnimeNotificationService();
    }
    return AnimeNotificationService.instance;
  }

  /**
   * Ensure the OS handler is configured and the in-memory mirror reflects
   * what's currently scheduled. Safe to call repeatedly.
   */
  async init(): Promise<void> {
    if (this.hydrated) return;
    if (this.hydrating) return this.hydrating;
    this.hydrating = (async () => {
      try {
        await notificationService.initialize();
        await this.rehydrate();
      } finally {
        this.hydrated = true;
        this.hydrating = null;
      }
    })();
    return this.hydrating;
  }

  /** Refresh the in-memory mirror from the OS scheduler. */
  async rehydrate(): Promise<void> {
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      this.notifications.clear();
      for (const n of scheduled) {
        const data = (n.content?.data ?? {}) as { kind?: string; animeId?: string };
        if (data.kind === 'episode_reminder' && data.animeId) {
          this.notifications.set(data.animeId, n.identifier);
        }
      }
      this.notify();
    } catch (e) {
      console.warn('[AnimeNotificationService] rehydrate failed', e);
    }
  }

  isAvailable(): boolean {
    return true;
  }

  async requestPermissions(): Promise<boolean> {
    await this.init();
    const status = await notificationService.requestPermission();
    return status.granted;
  }

  /**
   * Schedule a reminder for an anime's next airing episode.
   * Returns the notification identifier, or null when no future air time is known.
   */
  async scheduleAnimeNotification(anime: Anime): Promise<string | null> {
    await this.init();

    const airingAt = anime.nextAiringEpisode?.airingAt;
    if (!airingAt) {
      console.warn(`[AnimeNotificationService] no airing time for ${anime.id} (${anime.title})`);
      return null;
    }
    // AniList exposes seconds; multiply to ms.
    const airDate = new Date(airingAt * 1000);
    if (airDate.getTime() - DEFAULT_LEAD_TIME_MINUTES * 60_000 <= Date.now() + 1_000) {
      console.warn(`[AnimeNotificationService] air time too close/past for ${anime.id}`);
      return null;
    }

    const id = await notificationService.scheduleEpisodeReminder(
      anime.id,
      anime.title,
      airDate,
      DEFAULT_LEAD_TIME_MINUTES
    );
    if (id) {
      this.notifications.set(anime.id, id);
      this.notify();
    }
    return id;
  }

  async cancelAnimeNotification(animeId: string): Promise<void> {
    await this.init();
    await notificationService.cancelByRef('episode_reminder', animeId);
    const removed = this.notifications.delete(animeId);
    if (removed) this.notify();
  }

  async cancelAllNotifications(): Promise<void> {
    await notificationService.cancelAll();
    const hadAny = this.notifications.size > 0;
    this.notifications.clear();
    if (hadAny) this.notify();
  }

  async getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
    return Notifications.getAllScheduledNotificationsAsync();
  }

  isAnimeScheduled(animeId: string): boolean {
    return this.notifications.has(animeId);
  }
}

export const animeNotificationService = AnimeNotificationService.getInstance();

/**
 * React hook returning whether `animeId` currently has an OS-scheduled reminder.
 * Re-renders automatically when the scheduled set changes (schedule, cancel,
 * clear-all, or hydrate from OS).
 */
export function useIsAnimeScheduled(animeId: string | undefined | null): boolean {
  return useSyncExternalStore(
    (listener) => animeNotificationService.subscribe(listener),
    () => (animeId ? animeNotificationService.isAnimeScheduled(animeId) : false),
    () => false
  );
}
