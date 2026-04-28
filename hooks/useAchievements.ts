import { useCallback, useEffect, useState } from 'react';
import {
  achievementService,
  AchievementWithProgress,
  AchievementUnlock,
} from '../libs/services/achievements/achievement-service';
import type { AchievementTrigger } from '../libs/services/achievements/definitions';

export interface UseAchievementsResult {
  achievements: AchievementWithProgress[];
  loading: boolean;
  unlocked: AchievementWithProgress[];
  refresh: () => Promise<void>;
  track: (trigger: AchievementTrigger, delta?: number, snapshot?: number) => Promise<AchievementUnlock[]>;
  markNotified: (id: string) => Promise<void>;
}

export function useAchievements(): UseAchievementsResult {
  const [achievements, setAchievements] = useState<AchievementWithProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    achievementService
      .list()
      .then((list) => {
        if (mounted) {
          setAchievements(list);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });
    const unsub = achievementService.subscribe((next) => {
      if (mounted) setAchievements(next);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const refresh = useCallback(async () => {
    const list = await achievementService.list();
    setAchievements(list);
  }, []);

  const track = useCallback(
    async (trigger: AchievementTrigger, delta?: number, snapshot?: number) => {
      return achievementService.track(trigger, delta ?? 1, snapshot);
    },
    []
  );

  const markNotified = useCallback(async (id: string) => {
    await achievementService.markNotified(id);
  }, []);

  return {
    achievements,
    loading,
    unlocked: achievements.filter((a) => a.unlocked),
    refresh,
    track,
    markNotified,
  };
}
