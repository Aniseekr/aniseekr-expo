import { Logger } from '../utils/logger';
import { dataSourceConfig } from './data-source-config';
import {
  DEFAULT_PROFILE_SHORTCUTS,
  normalizeProfileShortcuts,
  type ShortcutId,
} from './profile-shortcuts';
import {
  STREAMING_PLATFORM_IDS,
  getStreamingPlatform,
  type StreamingPlatformId,
} from './streaming/streaming-platforms';

import { kvGet, kvSet } from './storage/app-storage';
import { USER_PREFS_STORAGE_KEY } from './storage/keys';

export { USER_PREFS_STORAGE_KEY };

export type SwipeMode = 'plan' | 'like';
export type SwipeContentMode = 'fill' | 'fit';
export type SwipeRatingButtons = 'three' | 'five';

export interface SwipePrefs {
  // Right-swipe semantic: 'plan' adds to plan_to_watch, 'like' adds to favorites.
  mode: SwipeMode;
  contentMode: SwipeContentMode;
  // Bottom rating row layout used in Like mode.
  ratingButtons: SwipeRatingButtons;
  showAIInsights: boolean;
  trackingShortcut: boolean;
  showOriginalTitle: boolean;
}

export const DEFAULT_SWIPE_PREFS: SwipePrefs = {
  mode: 'plan',
  contentMode: 'fill',
  ratingButtons: 'three',
  showAIInsights: true,
  trackingShortcut: false,
  showOriginalTitle: false,
};

export type SeasonalLayout = 'carousel' | 'hero-rail' | 'showcase' | 'spotlight';

export const SEASONAL_LAYOUTS: readonly SeasonalLayout[] = [
  'carousel',
  'hero-rail',
  'showcase',
  'spotlight',
] as const;

export interface StreamingPrefs {
  /**
   * Ordered list of platform ids the user has enabled. Order matters: the
   * settings screen renders this list verbatim and the resolver uses it as
   * the secondary sort key (after `primary`).
   */
  enabled: StreamingPlatformId[];
  /** The platform opened by the "Watch now" CTA. Must be a member of `enabled` or null. */
  primary: StreamingPlatformId | null;
  /** When true, the linker probes the platform's deep-link scheme before opening the web URL. */
  preferAppDeepLink: boolean;
}

export const DEFAULT_STREAMING_PREFS: StreamingPrefs = {
  enabled: [],
  primary: null,
  preferAppDeepLink: true,
};

export interface UserPrefs {
  cardHeightPercent: number; // 70-100
  allowAdultContent: boolean;
  bangumiIncludeGames: boolean;
  bangumiShowScoreProminently: boolean;
  profileShortcuts: ShortcutId[];
  // Folder targeted by the long-press quick-add on the anime detail page.
  // Stores either a system folder id (e.g. 'system_favorites') or a custom uuid.
  lastAddedFolderId: string;
  swipe: SwipePrefs;
  seasonalLayout: SeasonalLayout;
  streamingPlatforms: StreamingPrefs;
}

export const DEFAULT_USER_PREFS: UserPrefs = {
  cardHeightPercent: 85,
  allowAdultContent: false,
  bangumiIncludeGames: false,
  bangumiShowScoreProminently: true,
  profileShortcuts: [...DEFAULT_PROFILE_SHORTCUTS],
  lastAddedFolderId: 'system_favorites',
  swipe: { ...DEFAULT_SWIPE_PREFS },
  seasonalLayout: 'carousel',
  streamingPlatforms: { ...DEFAULT_STREAMING_PREFS },
};

export function normalizeStreamingPrefs(input: unknown): StreamingPrefs {
  if (!input || typeof input !== 'object') return { ...DEFAULT_STREAMING_PREFS };
  const obj = input as Partial<StreamingPrefs> & { enabled?: unknown; primary?: unknown };

  const enabledRaw = Array.isArray(obj.enabled) ? obj.enabled : [];
  const seen = new Set<StreamingPlatformId>();
  const enabled: StreamingPlatformId[] = [];
  for (const id of enabledRaw) {
    if (typeof id !== 'string') continue;
    if (!getStreamingPlatform(id)) continue;
    const valid = id as StreamingPlatformId;
    if (seen.has(valid)) continue;
    seen.add(valid);
    enabled.push(valid);
  }

  let primary: StreamingPlatformId | null = null;
  if (typeof obj.primary === 'string' && getStreamingPlatform(obj.primary)) {
    const candidate = obj.primary as StreamingPlatformId;
    if (seen.has(candidate)) {
      primary = candidate;
    }
  }
  // Fall back to first enabled when the supplied primary is missing/invalid
  // — keeps the "Watch now" CTA always pointing at *something* the user picked.
  if (!primary && enabled.length > 0) primary = enabled[0];

  const preferAppDeepLink =
    typeof obj.preferAppDeepLink === 'boolean'
      ? obj.preferAppDeepLink
      : DEFAULT_STREAMING_PREFS.preferAppDeepLink;

  return { enabled, primary, preferAppDeepLink };
}

/**
 * Synchronous MMKV read. Safe for first-frame `useState` initialisers — no
 * `await`, no skeleton flash. The async {@link loadUserPrefs} wraps this so
 * existing call sites keep working; new code should prefer the sync variant.
 *
 * Returns a fresh defaults object on miss / parse failure so callers can
 * mutate the result without worrying about shared state.
 */
export function loadUserPrefsSync(): UserPrefs {
  try {
    const raw = kvGet(USER_PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_USER_PREFS };
    const parsed = JSON.parse(raw) as Partial<UserPrefs>;
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_USER_PREFS };
    const result: UserPrefs = {
      ...DEFAULT_USER_PREFS,
      ...parsed,
      profileShortcuts: normalizeProfileShortcuts(parsed.profileShortcuts),
      swipe: { ...DEFAULT_SWIPE_PREFS, ...(parsed.swipe ?? {}) },
      seasonalLayout: SEASONAL_LAYOUTS.includes(parsed.seasonalLayout as SeasonalLayout)
        ? (parsed.seasonalLayout as SeasonalLayout)
        : DEFAULT_USER_PREFS.seasonalLayout,
      streamingPlatforms: normalizeStreamingPrefs(parsed.streamingPlatforms),
    };
    return result;
  } catch (err) {
    Logger.warn('[UserPrefs] load failed, using defaults', err);
    return { ...DEFAULT_USER_PREFS };
  }
}

export async function loadUserPrefs(): Promise<UserPrefs> {
  const result = loadUserPrefsSync();
  // Mirror the adult-content flag onto the data-source config so the read
  // pipeline (AniList isAdult, Jikan sfw, repository safety net) reflects
  // the user's choice without a separate toggle. Fire-and-forget so the
  // returned Promise resolves immediately.
  void syncAdultFlag(result.allowAdultContent);
  return result;
}

export async function saveUserPrefs(prefs: UserPrefs): Promise<void> {
  try {
    kvSet(USER_PREFS_STORAGE_KEY, JSON.stringify(prefs));
    await syncAdultFlag(prefs.allowAdultContent);
  } catch (err) {
    Logger.warn('[UserPrefs] save failed', err);
  }
  // Notify even if persistence threw — the in-memory state held by the
  // caller already reflects the change, so other screens should match.
  notifyPrefsChanged(prefs);
}

// Pub/sub so screens that already mounted (and won't re-run their initial
// useEffect) still see prefs changes — e.g. when the anime detail page is
// kept in the Expo Router stack while the user toggles primary platform
// over in /(setting)/watch-platforms, the detail page subscribes to this
// emitter so its "Watch on" rail and CTA reflect the new primary on resume.
type PrefsListener = (prefs: UserPrefs) => void;
const prefsListeners: Set<PrefsListener> = new Set();

export function subscribeUserPrefs(listener: PrefsListener): () => void {
  prefsListeners.add(listener);
  return () => {
    prefsListeners.delete(listener);
  };
}

function notifyPrefsChanged(prefs: UserPrefs): void {
  for (const listener of prefsListeners) {
    try {
      listener(prefs);
    } catch (err) {
      Logger.warn('[UserPrefs] listener threw', err);
    }
  }
}

export async function patchUserPrefs(patch: Partial<UserPrefs>): Promise<UserPrefs> {
  const current = await loadUserPrefs();
  const next: UserPrefs = { ...current, ...patch };
  await saveUserPrefs(next);
  return next;
}

async function syncAdultFlag(allow: boolean): Promise<void> {
  try {
    if (!dataSourceConfig.isInitialized) {
      await dataSourceConfig.init();
    }
    if (dataSourceConfig.allowR18Content !== allow) {
      await dataSourceConfig.setAllowR18Content(allow);
    }
  } catch (err) {
    Logger.warn('[UserPrefs] sync adult flag failed', err);
  }
}

export async function patchSwipePrefs(patch: Partial<SwipePrefs>): Promise<SwipePrefs> {
  const current = await loadUserPrefs();
  const nextSwipe: SwipePrefs = { ...current.swipe, ...patch };
  await saveUserPrefs({ ...current, swipe: nextSwipe });
  return nextSwipe;
}

export async function patchStreamingPrefs(
  patch: Partial<StreamingPrefs>
): Promise<StreamingPrefs> {
  const current = await loadUserPrefs();
  const nextStreaming = normalizeStreamingPrefs({
    ...current.streamingPlatforms,
    ...patch,
  });
  await saveUserPrefs({ ...current, streamingPlatforms: nextStreaming });
  return nextStreaming;
}

// Re-exported for consumers that want to enumerate the catalog without
// importing both modules; keeps the public surface of user-prefs cohesive.
export { STREAMING_PLATFORM_IDS };
export type { StreamingPlatformId };
