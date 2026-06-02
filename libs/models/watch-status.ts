import type { AnimeStatus } from '../services/auth/types';

/**
 * WatchStatus mirrors the Swift `WatchStatus` enum used across data sources and merge logic.
 *
 * The base set is reused from `AnimeStatus` (`'watching' | 'completed' | 'on_hold' | 'dropped' |
 * 'planned'`) and we add `'unknown'` because providers sometimes return entries that haven't been
 * categorized yet.
 */
export type WatchStatus = AnimeStatus | 'unknown';
