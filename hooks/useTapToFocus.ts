// expo-camera v17 has no focus-point API. This hook uses `autofocus: 'on'`
// which means "autofocus once and lock" on iOS — real AF lock behavior, but
// NOT point-of-focus. Tap = enter LOCK (we surface 'on' to CameraView), tap
// again or 5s timeout = release back to continuous ('off'). The reticle
// position is purely a visual confirmation of where the user tapped — it
// does NOT drive the lens. See CLAUDE.md Rule 8: be honest about what we
// actually know.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Gesture, type TapGesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import type { FocusPoint } from '../components/pilgrimage/camera/types';
import { hapticsBridge } from '../modules/haptics/hapticsBridge';

// Matches expo-camera's FocusMode ('on' | 'off'). Re-exported locally so
// callers don't need to import the SDK type just to type the prop.
export type AutofocusMode = 'on' | 'off';

interface UseTapToFocusInput {
  /** Auto-release the lock after this many ms (default 5000). Set 0 to disable timeout. */
  lockTimeoutMs?: number;
}

interface UseTapToFocusOutput {
  tapGesture: TapGesture;
  focusPoint: FocusPoint | null;
  afLocked: boolean;
  autofocus: AutofocusMode;
  /** Imperative release — call from shutter/capture so a stale lock doesn't outlive the shot. */
  releaseLock: () => void;
}

const DEFAULT_LOCK_TIMEOUT_MS = 5000;
// 250ms maxDuration keeps the gesture snappy — anything longer feels like a
// long-press to users. Single tap only; double-tap is reserved for future
// shortcuts (e.g. reset overlay).
const TAP_MAX_DURATION_MS = 250;

export function useTapToFocus(input?: UseTapToFocusInput): UseTapToFocusOutput {
  const lockTimeoutMs = input?.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;

  const [focusPoint, setFocusPoint] = useState<FocusPoint | null>(null);
  const [afLocked, setAfLocked] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // afLockedRef mirrors state so handleTap's toggle decision doesn't depend on
  // a stale closure value when the gesture re-fires quickly.
  const afLockedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseLock = useCallback(() => {
    clearTimer();
    afLockedRef.current = false;
    setAfLocked(false);
    setFocusPoint(null);
    hapticsBridge.tap();
  }, [clearTimer]);

  const handleTap = useCallback(
    (x: number, y: number) => {
      // Second tap while locked → release. First tap → enter lock.
      if (afLockedRef.current) {
        releaseLock();
        return;
      }
      clearTimer();
      afLockedRef.current = true;
      setAfLocked(true);
      setFocusPoint({ x, y, createdAt: Date.now() });
      hapticsBridge.selection();
      if (lockTimeoutMs > 0) {
        timerRef.current = setTimeout(() => {
          afLockedRef.current = false;
          setAfLocked(false);
          setFocusPoint(null);
          timerRef.current = null;
        }, lockTimeoutMs);
      }
    },
    [clearTimer, lockTimeoutMs, releaseLock]
  );

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(1)
        .maxDuration(TAP_MAX_DURATION_MS)
        .onEnd((e, success) => {
          if (!success) return;
          runOnJS(handleTap)(e.x, e.y);
        }),
    // lockTimeoutMs flows in via handleTap; rebuild gesture when it changes.
    [handleTap]
  );

  const autofocus: AutofocusMode = afLocked ? 'on' : 'off';

  return { tapGesture, focusPoint, afLocked, autofocus, releaseLock };
}
