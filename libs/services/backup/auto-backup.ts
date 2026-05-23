// Auto-backup scheduler.
//
// Strategy: opportunistic AppState-driven scheduler.
//   - Every time the app moves to background, we check whether the configured
//     interval has elapsed since the last successful backup. If yes, we run
//     one. If no, we no-op.
//   - The same `maybeRun` method is also wired into a background-task callback
//     (BGAppRefreshTask on iOS via expo-task-manager) by the UI layer so the
//     OS can wake us up for a refresh even when the user hasn't reopened the
//     app. The scheduler itself doesn't care which path called it.
//
// Failure handling: we persist the error but DO NOT update lastRunAt, so the
// next opportunity will retry instead of silently honoring a broken backup.

import { Logger } from '../../utils/logger';
import { mmkvAsyncStorageAdapter } from '../storage/app-storage';
import {
  AUTO_BACKUP_LAST_ERR_KEY,
  AUTO_BACKUP_LAST_RUN_KEY,
  AUTO_BACKUP_PREFS_KEY,
} from '../storage/keys';

const PREFS_KEY = AUTO_BACKUP_PREFS_KEY;
const LAST_RUN_KEY = AUTO_BACKUP_LAST_RUN_KEY;
const LAST_ERR_KEY = AUTO_BACKUP_LAST_ERR_KEY;

export interface AutoBackupPrefs {
  enabled: boolean;
  intervalHours: number;
}

export const DEFAULT_AUTO_BACKUP_PREFS: AutoBackupPrefs = {
  enabled: false,
  intervalHours: 24,
};

export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface AutoBackupOptions {
  /**
   * Optional storage injection — tests pass an in-memory FakeStorage.
   * Production defaults to the MMKV-backed AsyncStorage adapter so the
   * prefs / lastRun / lastError keys land in the same store as every
   * other migrated preference.
   */
  storage?: AsyncStorageLike;
  onBackup: () => Promise<void>;
  now?: () => number;
}

export class AutoBackupScheduler {
  private readonly storage: AsyncStorageLike;
  private readonly onBackup: () => Promise<void>;
  private readonly now: () => number;

  constructor(opts: AutoBackupOptions) {
    this.storage = opts.storage ?? mmkvAsyncStorageAdapter;
    this.onBackup = opts.onBackup;
    this.now = opts.now ?? Date.now;
  }

  async loadPrefs(): Promise<AutoBackupPrefs> {
    try {
      const raw = await this.storage.getItem(PREFS_KEY);
      if (!raw) return { ...DEFAULT_AUTO_BACKUP_PREFS };
      const parsed = JSON.parse(raw) as Partial<AutoBackupPrefs>;
      return {
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_AUTO_BACKUP_PREFS.enabled,
        intervalHours:
          typeof parsed.intervalHours === 'number' && parsed.intervalHours > 0
            ? parsed.intervalHours
            : DEFAULT_AUTO_BACKUP_PREFS.intervalHours,
      };
    } catch {
      return { ...DEFAULT_AUTO_BACKUP_PREFS };
    }
  }

  async savePrefs(prefs: AutoBackupPrefs): Promise<void> {
    await this.storage.setItem(PREFS_KEY, JSON.stringify(prefs));
  }

  async getLastRunAt(): Promise<number | null> {
    const raw = await this.storage.getItem(LAST_RUN_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  async getLastError(): Promise<string | null> {
    return await this.storage.getItem(LAST_ERR_KEY);
  }

  async maybeRun(prefs?: AutoBackupPrefs): Promise<{ ran: boolean; skippedBecause?: string }> {
    const p = prefs ?? (await this.loadPrefs());
    if (!p.enabled) return { ran: false, skippedBecause: 'disabled' };

    const now = this.now();
    const last = await this.getLastRunAt();
    const intervalMs = p.intervalHours * 60 * 60 * 1000;
    if (last !== null && now - last < intervalMs) {
      return { ran: false, skippedBecause: 'within-interval' };
    }

    try {
      await this.onBackup();
      await this.storage.setItem(LAST_RUN_KEY, String(now));
      await this.storage.removeItem(LAST_ERR_KEY);
      Logger.info('[AutoBackup] success at', new Date(now).toISOString());
      return { ran: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.storage.setItem(LAST_ERR_KEY, message);
      Logger.warn('[AutoBackup] failed:', message);
      return { ran: true, skippedBecause: `failed: ${message}` };
    }
  }
}
