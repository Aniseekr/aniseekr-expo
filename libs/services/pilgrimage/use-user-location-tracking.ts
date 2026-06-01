// useUserLocationTracking — drives the Google-Maps-style 3-state locate FAB.
//
// States (cycled by `cycleState`):
//   idle      → no live subscriptions. Last known (or last received) location
//               may still be available in `location` so the map keeps the
//               user dot visible without burning the GPS.
//   following → subscribe to GPS; each fix recentres the map at walking zoom.
//               No heading subscription (compass is off).
//   compass   → following + magnetometer/heading subscription. Heading flows
//               through a ref + delta-gate so we don't re-render React state
//               at sensor frequency (Rule 9 in CLAUDE.md).
//
// User pan/zoom (`onUserPan`) breaks following/compass back to idle. Map
// surfaces call it only for real user gestures; programmatic recentres/flyTo
// moves stay silent so following does not fight itself.
//
// Permission handling:
//   - First user tap: ask the OS (`requestForegroundPermissionsAsync`).
//   - When the OS reports `canAskAgain === false` we surface a sheet pointing
//     at Settings instead of pinging the OS again (iOS won't re-prompt, and
//     Android pre-13 won't either once the user picks "Don't ask again").
//   - The sheet only opens once per session. A user who dismisses it without
//     granting can keep mashing the FAB without the sheet popping repeatedly.
//   - AppState `active` re-checks permission so coming back from Settings
//     picks up the new status without a remount.
//
// CLAUDE.md cross-references:
//   - Rule 8 (no fake data): heading + location are always nullable, never
//     synthesised. Sensor failures keep `heading=null` so the cone hides.
//   - Rule 9 (state ownership): heading lives in `headingRef`, not React
//     state, so 60 Hz magnetometer ticks never trigger a re-render.
//   - Rule 10 (first paint): we seed `location` synchronously from the
//     in-memory cache + asynchronously from `getLastKnown` so the dot can
//     paint immediately on warm permission state.

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { locationService, type LatLng } from './location-service';
import { sameLatLng } from './pilgrimage-screen-state';
import {
  resolveLocateFabDecision,
  type LocateFollowState,
  type LocatePermissionState,
} from './locate-fab-state';

export type { LocateFollowState, LocatePermissionState } from './locate-fab-state';

/**
 * Degrees of heading change required before pushing a new value to the
 * map handle. Magnetometer outputs ~60 Hz; the native marker already eases
 * rotation enough that sub-2° wobble is invisible anyway.
 */
const HEADING_DELTA_DEG = 2;

/**
 * Default zoom used when recentring on the user. Tight enough to read street
 * names on a phone, wide enough to keep nearby pilgrimage points in frame.
 */
export const LOCATE_FAB_ZOOM = 15;
/** Compass mode zooms one step closer — "where am I facing?" is a walking-scale question. */
export const LOCATE_FAB_COMPASS_ZOOM = 17;

export interface UseUserLocationTrackingOptions {
  /**
   * Called when the hook resolves a new location *while in following or
   * compass state*. Used by surfaces to imperatively recenter the map as the
   * user moves.
   */
  onFollowLocation?: (loc: LatLng, state: 'following' | 'compass') => void;
  /**
   * Called when the device heading changes by more than HEADING_DELTA_DEG
   * (only fires in compass state). Use this to imperatively push the new
   * angle into the map handle without going through React state — sensor
   * frequency is too high to render every tick.
   * Pass `null` to clear the cone (state left compass).
   */
  onHeadingChange?: (deg: number | null) => void;
  /**
   * Optional warm-cache seed. When the surface has a location from somewhere
   * faster than the OS (route param, prior screen, persisted snapshot), pass
   * it so the user dot paints on frame 1 instead of waiting for `getCached`
   * / `getLastKnown` to resolve. Captured once at mount.
   */
  initialLocation?: LatLng | null;
}

export interface UseUserLocationTrackingResult {
  /** Current state machine value. */
  state: LocateFollowState;
  /** Latest known user coordinates, or null when nothing has been resolved yet. */
  location: LatLng | null;
  /**
   * Live heading ref. Read on a timer / animation frame and push to the
   * map handle when the delta is meaningful — never bind directly to React JSX.
   */
  headingRef: MutableRefObject<number | null>;
  /** Permission status as far as we know it. */
  permission: LocatePermissionState;
  /** True while the OS prompt is open. */
  isRequestingPermission: boolean;
  /**
   * Whether the "please grant location in Settings" sheet should be visible.
   * Driven by the hook so callers don't have to track session-level dismissal.
   */
  permissionSheetVisible: boolean;
  /** FAB onPress — drives idle → following → compass → idle. */
  cycleState: () => void;
  /** Notify the hook the user pan-gestured the map; drops back to idle. */
  onUserPan: () => void;
  /** Hide the permission sheet (Settings button → Linking.openSettings, then dismiss). */
  dismissPermissionSheet: () => void;
  /** Force-show the permission sheet (e.g. when the user re-taps the FAB after dismiss). */
  requestPermissionSheet: () => void;
}

interface InternalState {
  followState: LocateFollowState;
  permission: LocatePermissionState;
}

function mapPermissionStatus(result: {
  status: Location.PermissionStatus;
  canAskAgain: boolean;
}): LocatePermissionState {
  if (result.status === 'granted') return 'granted';
  if (result.status === 'undetermined') return 'undetermined';
  return result.canAskAgain ? 'denied' : 'blocked';
}

/**
 * Hook entrypoint. Single instance per map surface — sharing between
 * surfaces is intentionally avoided so each map controls its own subscriber
 * lifetime (i.e. tabbing away from the hub map stops the watcher).
 */
export function useUserLocationTracking(
  options: UseUserLocationTrackingOptions = {}
): UseUserLocationTrackingResult {
  const { onFollowLocation, onHeadingChange, initialLocation } = options;

  const [internal, setInternal] = useState<InternalState>(() => ({
    followState: 'idle',
    permission: 'undetermined',
  }));
  const [location, setLocation] = useState<LatLng | null>(
    () => initialLocation ?? locationService.getCached()
  );
  const [permissionSheetVisible, setPermissionSheetVisible] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);

  const headingRef = useRef<number | null>(null);
  const locationRef = useRef<LatLng | null>(location);
  const followStateRef = useRef<LocateFollowState>('idle');
  const permissionRef = useRef<LocatePermissionState>('undetermined');
  const sheetShownThisSessionRef = useRef(false);
  const onFollowLocationRef = useRef(onFollowLocation);
  onFollowLocationRef.current = onFollowLocation;
  const onHeadingChangeRef = useRef(onHeadingChange);
  onHeadingChangeRef.current = onHeadingChange;

  followStateRef.current = internal.followState;
  permissionRef.current = internal.permission;
  locationRef.current = location;

  // ─── Permission lookup on mount + on app foreground ─────────────────────
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const status = await Location.getForegroundPermissionsAsync();
        if (cancelled) return;
        const next = mapPermissionStatus(status);
        setInternal((prev) => (prev.permission === next ? prev : { ...prev, permission: next }));
      } catch {
        // Permission lookup can fail on older Android emulators; leave
        // state as 'undetermined' so the next tap goes through the prompt.
      }
    };
    refresh();
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') refresh();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  // ─── Warm-cache hydration ───────────────────────────────────────────────
  // Skip when we already have a value (cache hit during useState init).
  useEffect(() => {
    if (locationRef.current) return;
    let cancelled = false;
    locationService
      .getLastKnown()
      .then((loc) => {
        if (cancelled || !loc) return;
        if (sameLatLng(locationRef.current, loc)) return;
        setLocation(loc);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Location watcher (only while following/compass) ────────────────────
  useEffect(() => {
    if (internal.followState === 'idle') return;
    const unsubscribe = locationService.subscribeToUpdates((loc) => {
      if (sameLatLng(locationRef.current, loc)) {
        // Still fire the follow-recentre callback so a static fix nudges the
        // map back into frame if the user has manually scrolled off-centre
        // *but* hasn't dropped follow yet (e.g. on the same gesture).
        const cb = onFollowLocationRef.current;
        const fs = followStateRef.current;
        if (cb && (fs === 'following' || fs === 'compass')) cb(loc, fs);
        return;
      }
      setLocation(loc);
      const cb = onFollowLocationRef.current;
      const fs = followStateRef.current;
      if (cb && (fs === 'following' || fs === 'compass')) cb(loc, fs);
    });
    return unsubscribe;
  }, [internal.followState]);

  // ─── Heading watcher (only while compass) ───────────────────────────────
  useEffect(() => {
    if (internal.followState !== 'compass') {
      if (headingRef.current !== null) {
        headingRef.current = null;
        onHeadingChangeRef.current?.(null);
      }
      return;
    }
    let lastEmitted = Number.NaN;
    const unsubscribe = locationService.subscribeToHeading((deg) => {
      const rounded = ((Math.round(deg) % 360) + 360) % 360;
      if (Number.isFinite(lastEmitted)) {
        const raw = Math.abs(rounded - lastEmitted);
        // Wrap-around aware circular distance so 359 → 1 doesn't read as 358.
        const circular = Math.min(raw, 360 - raw);
        if (circular < HEADING_DELTA_DEG) return;
      }
      lastEmitted = rounded;
      headingRef.current = rounded;
      onHeadingChangeRef.current?.(rounded);
    });
    return () => {
      unsubscribe();
      if (headingRef.current !== null) {
        headingRef.current = null;
        onHeadingChangeRef.current?.(null);
      }
    };
  }, [internal.followState]);

  // ─── Actions ────────────────────────────────────────────────────────────
  const cycleState = useCallback(() => {
    const decision = resolveLocateFabDecision({
      current: followStateRef.current,
      permission: permissionRef.current,
      sheetShownThisSession: sheetShownThisSessionRef.current,
    });

    if (decision.kind === 'noopAlreadyShowingSheet') return;

    if (decision.kind === 'showSettingsSheet') {
      sheetShownThisSessionRef.current = true;
      setPermissionSheetVisible(true);
      return;
    }

    if (decision.kind === 'request') {
      setIsRequestingPermission(true);
      Location.requestForegroundPermissionsAsync()
        .then((result) => {
          const next = mapPermissionStatus(result);
          setInternal((prev) => (prev.permission === next ? prev : { ...prev, permission: next }));
          if (next === 'granted') {
            setInternal((prev) => ({ ...prev, followState: 'following' }));
          } else if (next === 'blocked' && !sheetShownThisSessionRef.current) {
            sheetShownThisSessionRef.current = true;
            setPermissionSheetVisible(true);
          }
        })
        .catch(() => undefined)
        .finally(() => setIsRequestingPermission(false));
      return;
    }

    const { nextFollow } = decision;
    setInternal((prev) =>
      prev.followState === nextFollow ? prev : { ...prev, followState: nextFollow }
    );
  }, []);

  const onUserPan = useCallback(() => {
    if (followStateRef.current === 'idle') return;
    setInternal((prev) => (prev.followState === 'idle' ? prev : { ...prev, followState: 'idle' }));
  }, []);

  const dismissPermissionSheet = useCallback(() => {
    setPermissionSheetVisible(false);
  }, []);

  const requestPermissionSheet = useCallback(() => {
    sheetShownThisSessionRef.current = true;
    setPermissionSheetVisible(true);
  }, []);

  return {
    state: internal.followState,
    location,
    headingRef,
    permission: internal.permission,
    isRequestingPermission,
    permissionSheetVisible,
    cycleState,
    onUserPan,
    dismissPermissionSheet,
    requestPermissionSheet,
  };
}
