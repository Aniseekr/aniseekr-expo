import { useEffect, useState } from 'react';
import {
  loadMapThemePrefSync,
  setMapThemePref,
  subscribeMapThemePref,
  type MapThemePref,
} from '../libs/services/pilgrimage/map-theme-prefs';

/**
 * React hook for the pilgrimage map theme override.
 *
 * The persisted pref is read synchronously from MMKV to seed initial state, so
 * a map screen can push the correct tile theme into its WebView on the first
 * frame. It re-renders when any other surface (the appearance settings screen,
 * another mounted map) changes it via `setMapThemePref`.
 *
 * `hydrated` is always true — MMKV is memory-mapped and the synchronous seed
 * is the same value the migration would have produced. Kept on the return type
 * so call sites that gate UI on it (e.g. compare/[spotId].tsx) keep working.
 */
export function useMapThemePref(): {
  pref: MapThemePref;
  hydrated: boolean;
  setPref: (next: MapThemePref) => Promise<void>;
} {
  const [pref, setPref] = useState<MapThemePref>(loadMapThemePrefSync);

  useEffect(() => {
    let mounted = true;
    const unsub = subscribeMapThemePref((next) => {
      if (!mounted) return;
      setPref(next);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  return { pref, hydrated: true, setPref: setMapThemePref };
}
