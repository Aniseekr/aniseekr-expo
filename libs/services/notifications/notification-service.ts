import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { LocalDB } from '../../db';
import { isObject, safeJsonParse } from '../../utils/safe-json';
import { kvGet, kvSet } from '../storage/app-storage';
import { NOTIFICATION_PREFS_KEY } from '../storage/keys';

export type NotificationKind =
  | 'episode_reminder'
  | 'daily_digest'
  | 'movie_drop'
  | 'achievement_unlock'
  | 'sync_complete';

export interface NotificationPreferences {
  episodeReminders: boolean;
  dailyDigest: boolean;
  achievementAlerts: boolean;
  leadTimeMinutes: number;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  episodeReminders: true,
  dailyDigest: false,
  achievementAlerts: true,
  leadTimeMinutes: 15,
};

export { NOTIFICATION_PREFS_KEY };

function pickValidPreferences(value: unknown): Partial<NotificationPreferences> | null {
  if (!isObject(value)) return null;
  const out: Partial<NotificationPreferences> = {};
  if (typeof value.episodeReminders === 'boolean') out.episodeReminders = value.episodeReminders;
  if (typeof value.dailyDigest === 'boolean') {
    out.dailyDigest = value.dailyDigest;
  } else if (typeof value.weeklyDigest === 'boolean') {
    out.dailyDigest = value.weeklyDigest;
  }
  if (typeof value.achievementAlerts === 'boolean') out.achievementAlerts = value.achievementAlerts;
  if (typeof value.leadTimeMinutes === 'number' && Number.isFinite(value.leadTimeMinutes)) {
    out.leadTimeMinutes = value.leadTimeMinutes;
  }
  return out;
}

/**
 * Synchronous MMKV read. Used to seed the in-memory cache on first access AND
 * as the fast path for `getCachedNotificationPrefs` / `loadNotificationPrefs`
 * — both now resolve in ≤ one microtask instead of waiting on AsyncStorage.
 */
function readPrefsSync(): NotificationPreferences {
  try {
    const raw = kvGet(NOTIFICATION_PREFS_KEY);
    const parsed = safeJsonParse(raw, isObject);
    const valid = parsed ? pickValidPreferences(parsed) : null;
    return valid ? { ...DEFAULT_PREFERENCES, ...valid } : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

// Cached in memory so hot paths (scheduling per anime, achievement send) stay
// sync. Seeded eagerly from MMKV at module load — no async warmup needed.
let cachedPrefs: NotificationPreferences = readPrefsSync();

export function loadNotificationPrefsSync(): NotificationPreferences {
  return cachedPrefs;
}

export async function loadNotificationPrefs(): Promise<NotificationPreferences> {
  return cachedPrefs;
}

export function getCachedNotificationPrefs(): NotificationPreferences {
  return cachedPrefs;
}

export async function refreshNotificationPrefs(): Promise<NotificationPreferences> {
  cachedPrefs = readPrefsSync();
  return cachedPrefs;
}

/**
 * Persist updated notification preferences and refresh the in-memory cache.
 * The settings screen calls this on every toggle/slider commit.
 */
export function saveNotificationPrefs(prefs: NotificationPreferences): void {
  cachedPrefs = prefs;
  kvSet(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
}

export interface ScheduledNotificationRow {
  id: string;
  kind: NotificationKind;
  refId?: string;
  title: string;
  body?: string;
  scheduledAt: number;
  createdAt: number;
}

export interface PermissionStatus {
  granted: boolean;
  canAskAgain: boolean;
  // Android keeps `canAskAgain` true after a denial, so it isn't enough to tell
  // "never asked" from "user denied". Mirror the raw status so the UI can be precise.
  status: 'granted' | 'denied' | 'undetermined';
}

export type PushTokenInfo = {
  data: string;
  type: 'expo' | 'device';
};

let handlerConfigured = false;

function normalizePermission(raw: Notifications.NotificationPermissionsStatus): PermissionStatus {
  const granted = raw.granted === true;
  const canAskAgain = raw.canAskAgain !== false;
  let status: PermissionStatus['status'];
  if (granted) {
    status = 'granted';
  } else if (raw.status === 'undetermined' && canAskAgain) {
    status = 'undetermined';
  } else {
    status = 'denied';
  }
  return { granted, canAskAgain, status };
}

function ensureHandler(): void {
  if (handlerConfigured) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  handlerConfigured = true;
}

export class NotificationService {
  private static instance: NotificationService;

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  async initialize(): Promise<void> {
    ensureHandler();
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Aniseekr',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
      });
      await Notifications.setNotificationChannelAsync('episodes', {
        name: 'Episode reminders',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
      });
      await Notifications.setNotificationChannelAsync('achievements', {
        name: 'Achievements',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
  }

  async getPermission(): Promise<PermissionStatus> {
    const status = await Notifications.getPermissionsAsync();
    return normalizePermission(status);
  }

  async requestPermission(): Promise<PermissionStatus> {
    const status = await Notifications.requestPermissionsAsync();
    return normalizePermission(status);
  }

  async getPushToken(): Promise<PushTokenInfo | null> {
    try {
      const expo = await Notifications.getExpoPushTokenAsync();
      if (expo?.data) return { data: expo.data, type: 'expo' };
    } catch {
      // fall through to device token
    }
    try {
      const device = await Notifications.getDevicePushTokenAsync();
      if (device?.data) return { data: String(device.data), type: 'device' };
    } catch {
      return null;
    }
    return null;
  }

  async scheduleEpisodeReminder(
    animeId: string,
    title: string,
    airTime: Date,
    leadTimeMinutes: number
  ): Promise<string | null> {
    const fireAt = new Date(airTime.getTime() - leadTimeMinutes * 60 * 1000);
    if (fireAt.getTime() <= Date.now() + 1_000) return null;

    await this.cancelByRef('episode_reminder', animeId);

    const triggerDate = new Date(fireAt.getTime());
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `${title} drops in ${leadTimeMinutes}m`,
        body: 'Tap to open Aniseekr and get ready.',
        data: { kind: 'episode_reminder', animeId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: Platform.OS === 'android' ? 'episodes' : undefined,
      },
    });

    await this.recordSchedule({
      id,
      kind: 'episode_reminder',
      refId: animeId,
      title,
      scheduledAt: fireAt.getTime(),
    });
    return id;
  }

  async scheduleDailyDigest(hour = 9, minute = 0): Promise<string | null> {
    await this.cancelByKind('daily_digest');
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Today on Aniseekr',
        body: 'Your daily digest of new episodes and recommendations.',
        data: { kind: 'daily_digest' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: Platform.OS === 'android' ? 'default' : undefined,
      },
    });
    await this.recordSchedule({
      id,
      kind: 'daily_digest',
      title: 'Daily digest',
      scheduledAt: nextDailyOccurrence(hour, minute),
    });
    return id;
  }

  async sendAchievementUnlock(achievementId: string, title: string, body: string): Promise<string> {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { kind: 'achievement_unlock', achievementId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
        repeats: false,
        channelId: Platform.OS === 'android' ? 'achievements' : undefined,
      },
    });
    await this.recordSchedule({
      id,
      kind: 'achievement_unlock',
      refId: achievementId,
      title,
      body,
      scheduledAt: Date.now() + 1_000,
    });
    return id;
  }

  async cancelByRef(kind: NotificationKind, refId: string): Promise<number> {
    const db = await LocalDB.getDatabase();
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM scheduled_notifications WHERE kind = ? AND ref_id = ?`,
      kind,
      refId
    );
    for (const row of rows) {
      try {
        await Notifications.cancelScheduledNotificationAsync(row.id);
      } catch {
        // best-effort
      }
    }
    await db.runAsync(
      `DELETE FROM scheduled_notifications WHERE kind = ? AND ref_id = ?`,
      kind,
      refId
    );
    return rows.length;
  }

  async cancelByKind(kind: NotificationKind): Promise<number> {
    const db = await LocalDB.getDatabase();
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM scheduled_notifications WHERE kind = ?`,
      kind
    );
    for (const row of rows) {
      try {
        await Notifications.cancelScheduledNotificationAsync(row.id);
      } catch {
        // best-effort
      }
    }
    await db.runAsync(`DELETE FROM scheduled_notifications WHERE kind = ?`, kind);
    return rows.length;
  }

  async cancelAll(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
    const db = await LocalDB.getDatabase();
    await db.runAsync(`DELETE FROM scheduled_notifications`);
  }

  async listScheduled(): Promise<ScheduledNotificationRow[]> {
    const db = await LocalDB.getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      kind: string;
      ref_id: string | null;
      title: string;
      body: string | null;
      scheduled_at: number;
      created_at: number;
    }>(
      `SELECT id, kind, ref_id, title, body, scheduled_at, created_at
       FROM scheduled_notifications
       ORDER BY scheduled_at ASC`
    );
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as NotificationKind,
      refId: row.ref_id ?? undefined,
      title: row.title,
      body: row.body ?? undefined,
      scheduledAt: row.scheduled_at,
      createdAt: row.created_at,
    }));
  }

  private async recordSchedule(entry: {
    id: string;
    kind: NotificationKind;
    refId?: string;
    title: string;
    body?: string;
    scheduledAt: number;
  }): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.runAsync(
      `INSERT OR REPLACE INTO scheduled_notifications
       (id, kind, ref_id, title, body, scheduled_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      entry.id,
      entry.kind,
      entry.refId ?? null,
      entry.title,
      entry.body ?? null,
      entry.scheduledAt,
      Date.now()
    );
  }
}

function nextDailyOccurrence(hour: number, minute: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime();
}

export const notificationService = NotificationService.getInstance();
