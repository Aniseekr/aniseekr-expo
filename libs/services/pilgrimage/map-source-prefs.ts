// Per-feature override for the pilgrimage map's tile/style SOURCE (spec D7).
//
// Why this indirection exists:
//   The map engine must NEVER hardcode its tile/style URL. Holding it behind a
//   single overridable config lets us (a) swap the Phase-1 OpenFreeMap public
//   endpoint for our own Worker+R2 read-through cache later with a config flip,
//   and (b) escape-hatch onto a backup source if OFM sunsets or rate-limits us
//   — both with NO app release. See the MapLibre migration spec (D5/D6/D7).
//
// Phase 1 default = OpenFreeMap (free, no key, no limits, commercial-OK,
// OpenMapTiles schema). The user's map-theme pref (light/dark/auto) supplies the
// mode; this module maps that mode to the matching default style, or to a
// configured override.
//
// Storage: a single MMKV key. The synchronous read seeds the engine's style on
// the first frame (Rule 10) — no flash, no async re-resolve.
import { kvGet, kvSet } from '../storage/app-storage';
import { MAP_SOURCE_STYLE_OVERRIDE_KEY } from '../storage/keys';
import { Logger } from '../../utils/logger';

/**
 * Phase-1 default style URLs — OpenFreeMap public styles (OpenMapTiles schema).
 * `positron` ≈ CARTO-Voyager light look; the dark style ≈ Dark-Matter slate.
 *
 * NOTE: confirm the exact OFM style slugs against OpenFreeMap's current catalog
 * during the P1 on-device spike. The D7 override below exists precisely so a
 * wrong/changed slug can be corrected without an app release.
 */
export const DEFAULT_MAP_STYLE_URLS = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;

type MapMode = 'light' | 'dark';

/** Trim + nullify blanks so a bad/empty value is treated as "no override". */
function cleanOverride(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolve the style URL the engine should load. A non-blank override wins over
 * the per-mode default (regardless of mode) — that's the OFM→Worker swap and
 * the OFM-sunset escape hatch. A blank/whitespace override is ignored so a bad
 * remote-config value can never blank the map (Rule 8). Pure + trivially tested.
 */
export function resolveMapStyleUrl(mode: MapMode, override?: string | null): string {
  return cleanOverride(override) ?? DEFAULT_MAP_STYLE_URLS[mode];
}

type Subscriber = (next: string | null) => void;
const subscribers = new Set<Subscriber>();

/** Synchronous read of the persisted source override (or null). Frame-1 safe. */
export function loadMapStyleOverrideSync(): string | null {
  try {
    return cleanOverride(kvGet(MAP_SOURCE_STYLE_OVERRIDE_KEY));
  } catch (err) {
    Logger.warn('[MapSourcePref] load failed, using default', err);
    return null;
  }
}

/** Async read kept for callers that want a `Promise` signature. */
export async function loadMapStyleOverride(): Promise<string | null> {
  return loadMapStyleOverrideSync();
}

/**
 * Set (or clear, with null/blank) the source override. Persisted to MMKV and
 * broadcast so the map repaints in place without a remount.
 */
export async function setMapStyleOverride(url: string | null): Promise<void> {
  const clean = cleanOverride(url);
  try {
    kvSet(MAP_SOURCE_STYLE_OVERRIDE_KEY, clean ?? '');
  } catch (err) {
    Logger.warn('[MapSourcePref] save failed', err);
  }
  subscribers.forEach((fn) => {
    try {
      fn(clean);
    } catch (err) {
      Logger.warn('[MapSourcePref] subscriber threw', err);
    }
  });
}

export function subscribeMapStyleOverride(cb: Subscriber): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}
