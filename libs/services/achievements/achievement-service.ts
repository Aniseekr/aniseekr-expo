import { LocalDB } from '../../db';
import { economyService } from '../economy/economy-service';
import {
  ACHIEVEMENT_DEFINITIONS,
  AchievementDefinition,
  AchievementTrigger,
  definitionsForTrigger,
  findDefinition,
} from './definitions';

export interface AchievementProgress {
  id: string;
  progress: number;
  unlocked: boolean;
  unlockedAt?: number;
  notified: boolean;
}

export interface AchievementWithProgress extends AchievementDefinition {
  progress: number;
  unlocked: boolean;
  unlockedAt?: number;
  notified: boolean;
}

export interface AchievementUnlock {
  definition: AchievementDefinition;
  unlockedAt: number;
  rewardBalanceAfter: number;
}

type Listener = (state: AchievementWithProgress[]) => void;

export class AchievementService {
  private static instance: AchievementService;
  private listeners = new Set<Listener>();
  private hydrated = false;
  private cache = new Map<string, AchievementProgress>();

  static getInstance(): AchievementService {
    if (!AchievementService.instance) {
      AchievementService.instance = new AchievementService();
    }
    return AchievementService.instance;
  }

  async list(): Promise<AchievementWithProgress[]> {
    if (!this.hydrated) await this.hydrate();
    return ACHIEVEMENT_DEFINITIONS.map((def) => this.toView(def));
  }

  async get(id: string): Promise<AchievementWithProgress | null> {
    const def = findDefinition(id);
    if (!def) return null;
    if (!this.hydrated) await this.hydrate();
    return this.toView(def);
  }

  async pendingNotifications(): Promise<AchievementUnlock[]> {
    if (!this.hydrated) await this.hydrate();
    const result: AchievementUnlock[] = [];
    for (const def of ACHIEVEMENT_DEFINITIONS) {
      const state = this.cache.get(def.id);
      if (state?.unlocked && !state.notified && state.unlockedAt) {
        result.push({
          definition: def,
          unlockedAt: state.unlockedAt,
          rewardBalanceAfter: 0,
        });
      }
    }
    return result;
  }

  async markNotified(id: string): Promise<void> {
    if (!this.hydrated) await this.hydrate();
    const state = this.cache.get(id);
    if (!state) return;
    const next: AchievementProgress = { ...state, notified: true };
    this.cache.set(id, next);
    await this.persist(next);
    this.notify();
  }

  async track(
    trigger: AchievementTrigger,
    delta: number = 1,
    snapshot?: number
  ): Promise<AchievementUnlock[]> {
    if (delta <= 0 && snapshot === undefined) return [];
    if (!this.hydrated) await this.hydrate();

    const definitions = definitionsForTrigger(trigger);
    const unlocks: AchievementUnlock[] = [];

    for (const def of definitions) {
      const state = this.cache.get(def.id) ?? this.empty(def.id);
      if (state.unlocked) continue;

      const nextProgress = snapshot !== undefined ? snapshot : state.progress + delta;
      const clamped = Math.min(def.target, Math.max(0, Math.floor(nextProgress)));
      const justUnlocked = clamped >= def.target;

      const updated: AchievementProgress = {
        ...state,
        progress: clamped,
        unlocked: justUnlocked,
        unlockedAt: justUnlocked ? Date.now() : state.unlockedAt,
        notified: justUnlocked ? false : state.notified,
      };
      this.cache.set(def.id, updated);
      await this.persist(updated);

      if (justUnlocked) {
        const balance = await economyService.earn(
          def.reward.currency,
          def.reward.amount,
          `achievement:${def.id}`,
          { achievementId: def.id }
        );
        unlocks.push({
          definition: def,
          unlockedAt: updated.unlockedAt!,
          rewardBalanceAfter: balance,
        });
      }
    }

    if (unlocks.length > 0) this.notify();
    return unlocks;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (this.hydrated) {
      listener(ACHIEVEMENT_DEFINITIONS.map((def) => this.toView(def)));
    }
    return () => this.listeners.delete(listener);
  }

  async resetForTesting(): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.runAsync('DELETE FROM user_achievements');
    this.cache.clear();
    this.hydrated = false;
  }

  private toView(def: AchievementDefinition): AchievementWithProgress {
    const state = this.cache.get(def.id);
    return {
      ...def,
      progress: state?.progress ?? 0,
      unlocked: state?.unlocked ?? false,
      unlockedAt: state?.unlockedAt,
      notified: state?.notified ?? false,
    };
  }

  private empty(id: string): AchievementProgress {
    return { id, progress: 0, unlocked: false, notified: false };
  }

  private async hydrate(): Promise<void> {
    const db = await LocalDB.getDatabase();
    const rows = await db.getAllAsync<{
      achievement_id: string;
      progress: number;
      unlocked: number;
      unlocked_at: number | null;
      notified: number;
    }>(
      `SELECT achievement_id, progress, unlocked, unlocked_at, notified
       FROM user_achievements`
    );
    this.cache.clear();
    for (const row of rows) {
      this.cache.set(row.achievement_id, {
        id: row.achievement_id,
        progress: row.progress,
        unlocked: row.unlocked === 1,
        unlockedAt: row.unlocked_at ?? undefined,
        notified: row.notified === 1,
      });
    }
    this.hydrated = true;
    this.notify();
  }

  private async persist(state: AchievementProgress): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.runAsync(
      `INSERT INTO user_achievements
       (achievement_id, progress, unlocked, unlocked_at, notified, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(achievement_id) DO UPDATE SET
         progress = excluded.progress,
         unlocked = excluded.unlocked,
         unlocked_at = excluded.unlocked_at,
         notified = excluded.notified,
         updated_at = excluded.updated_at`,
      state.id,
      state.progress,
      state.unlocked ? 1 : 0,
      state.unlockedAt ?? null,
      state.notified ? 1 : 0,
      Date.now()
    );
  }

  private notify(): void {
    if (this.listeners.size === 0) return;
    const snapshot = ACHIEVEMENT_DEFINITIONS.map((def) => this.toView(def));
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export const achievementService = AchievementService.getInstance();
