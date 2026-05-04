import type { AnimeStatus } from '../services/auth/types';

/**
 * WatchStatus mirrors the Swift `WatchStatus` enum used across data sources and merge logic.
 *
 * The base set is reused from `AnimeStatus` (`'watching' | 'completed' | 'on_hold' | 'dropped' |
 * 'planned'`) and we add `'unknown'` because providers sometimes return entries that haven't been
 * categorized yet.
 */
export type WatchStatus = AnimeStatus | 'unknown';

/**
 * Status precedence order used by `UnifiedAnimeItem.merge`.
 * Earlier entries win (e.g., `watching` always trumps `completed`).
 */
export const WATCH_STATUS_PRIORITY: readonly WatchStatus[] = [
  'watching',
  'completed',
  'on_hold',
  'dropped',
  'planned',
  'unknown',
] as const;

export function isWatchStatus(value: unknown): value is WatchStatus {
  return typeof value === 'string' && (WATCH_STATUS_PRIORITY as readonly string[]).includes(value);
}
