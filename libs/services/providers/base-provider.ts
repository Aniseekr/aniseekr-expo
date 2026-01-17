import { PlatformType, AnimeStatus, UniversalAnimeItem } from '../auth/types';

export interface ImportedUserProfile {
  username: string;
  avatarUrl?: string;
  sourcePlatform: PlatformType;
}

export interface AnimeSourceProvider {
  platform: PlatformType;
  authenticate(): Promise<string>;
  fetchUserList(token: string): Promise<UniversalAnimeItem[]>;
  fetchUserProfile(token: string): Promise<ImportedUserProfile>;
}

export interface WritableAnimeProvider extends AnimeSourceProvider {
  updateProgress(animeId: string, progress: number, token: string): Promise<void>;
  updateScore(animeId: string, score: number, token: string): Promise<void>;
  updateStatus(animeId: string, status: AnimeStatus, token: string): Promise<void>;
  addToList(animeId: string, status: AnimeStatus, token: string): Promise<void>;
  removeFromList(animeId: string, token: string): Promise<void>;
}

export function isWritableProvider(
  provider: AnimeSourceProvider
): provider is WritableAnimeProvider {
  return 'updateProgress' in provider && 'updateScore' in provider;
}

export const STATUS_MAP: Record<string, AnimeStatus> = {
  watching: 'watching',
  current: 'watching',
  CURRENT: 'watching',
  WATCHING: 'watching',

  completed: 'completed',
  COMPLETED: 'completed',

  on_hold: 'on_hold',
  onhold: 'on_hold',
  paused: 'on_hold',
  PAUSED: 'on_hold',
  ON_HOLD: 'on_hold',

  dropped: 'dropped',
  DROPPED: 'dropped',

  plan_to_watch: 'planned',
  planned: 'planned',
  planning: 'planned',
  PLANNING: 'planned',
  want_to_watch: 'planned',
  plantowatch: 'planned',
};

export function normalizeStatus(status: string): AnimeStatus {
  const normalized = STATUS_MAP[status.toLowerCase()] || STATUS_MAP[status];
  return normalized || 'watching';
}

export function normalizeScore(score: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  if (maxScore === 10) return score;
  if (maxScore === 100) return score / 10;
  if (maxScore === 20) return score / 2;
  if (maxScore === 5) return score * 2;
  return (score / maxScore) * 10;
}
