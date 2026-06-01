// Per-feature override for the pilgrimage map's tile theme.
//
// Why this is independent of the global theme mode:
//   Most users want a Google-Maps-style light map even when the rest of the app
//   is dark — labels read better, photos pop more, and a black map next to a
//   black UI just feels like a missing tile flash. We default to 'light' here
//   and let users opt into 'dark' or 'auto' (follow app theme) from settings.
//
// The map surfaces resolve this on the first frame and repaint in place when
// subscribed callers receive a pref change: no map remount, no lost camera
// state, no tile-cache miss.
//
// Storage: a single MMKV key (see app-storage). The synchronous read lets the
// map screens push the correct tile theme into MapLibre on the first frame
// instead of flashing the default and re-resolving after an async read.
import { kvGet, kvSet } from '../storage/app-storage';
import { MAP_THEME_STORAGE_KEY } from '../storage/keys';
import { Logger } from '../../utils/logger';

export { MAP_THEME_STORAGE_KEY };

/**
 * User-facing pilgrimage map theme override.
 * - 'light': force CARTO Voyager (warm Google-Maps-Light look)
 * - 'dark': force CARTO Dark Matter (lifted toward Google-Maps-Dark slate)
 * - 'auto': follow the global app theme via effectiveMode
 */
export type MapThemePref = 'light' | 'dark' | 'auto';

export const MAP_THEME_PREFS: readonly MapThemePref[] = ['light', 'dark', 'auto'] as const;

/** Default map is white — see file header for rationale. */
export const DEFAULT_MAP_THEME: MapThemePref = 'light';

/**
 * Collapse the user pref + the app's resolved theme into the binary mode the
 * tile picker / theme-vars builder expects. Pure function, trivially testable.
 */
export function resolveMapMode(
  pref: MapThemePref,
  effectiveMode: 'light' | 'dark'
): 'light' | 'dark' {
  if (pref === 'auto') return effectiveMode;
  return pref;
}

type Subscriber = (next: MapThemePref) => void;
const subscribers = new Set<Subscriber>();

function isMapThemePref(value: unknown): value is MapThemePref {
  return value === 'light' || value === 'dark' || value === 'auto';
}

/**
 * Synchronous read of the persisted map theme. Safe on the first-paint path —
 * use it to seed a `useState` initializer so the map never flashes the default.
 */
export function loadMapThemePrefSync(): MapThemePref {
  try {
    const raw = kvGet(MAP_THEME_STORAGE_KEY);
    if (raw && isMapThemePref(raw)) return raw;
  } catch (err) {
    Logger.warn('[MapThemePref] load failed, using default', err);
  }
  return DEFAULT_MAP_THEME;
}

/** Async read kept for callers that want a `Promise` signature. */
export async function loadMapThemePref(): Promise<MapThemePref> {
  return loadMapThemePrefSync();
}

export async function setMapThemePref(next: MapThemePref): Promise<void> {
  if (!isMapThemePref(next)) return;
  try {
    kvSet(MAP_THEME_STORAGE_KEY, next);
  } catch (err) {
    Logger.warn('[MapThemePref] save failed', err);
  }
  subscribers.forEach((fn) => {
    try {
      fn(next);
    } catch (err) {
      Logger.warn('[MapThemePref] subscriber threw', err);
    }
  });
}

export function subscribeMapThemePref(cb: Subscriber): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}
