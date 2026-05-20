// Tap-to-focus for the camera screen.
//
// VisionCamera supports real point-of-focus via `CameraRef.focusTo({x,y})` —
// the tap drives an actual AE/AF/AWB metering operation, not just the
// preview-only AF-lock hack we used with expo-camera v17.
//
// This hook owns:
//   - The tap gesture (single-tap, 250ms maxDuration)
//   - The reticle's visual state (point + locked flag for the FocusReticle)
//   - A JS lock-timeout that mirrors VisionCamera's default `autoResetAfter`
//     so the reticle clears around the same time the native focus releases.
//
// The hook does NOT import the engine directly — the screen wires the tap to
// the engine via `onFocus`, keeping the hook reusable / decoupled.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Gesture, type TapGesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import type { FocusPoint } from '../components/pilgrimage/camera/types';
import { hapticsBridge } from '../modules/haptics/hapticsBridge';

interface UseTapToFocusInput {
  /** Auto-release the reticle after this many ms. Mirrors the native auto-reset. */
  lockTimeoutMs?: number;
  /**
   * Fired with the view-relative tap point. Wire this to the camera engine's
   * `focus({x,y})` so the metering operation actually runs.
   */
  onFocus?: (point: { x: number; y: number }) => void;
}

interface UseTapToFocusOutput {
  tapGesture: TapGesture;
  focusPoint: FocusPoint | null;
  /** True while the JS-side lock timer is running — drives reticle highlight. */
  afLocked: boolean;
  /** Imperative release — call from shutter/capture so a stale reticle doesn't outlive the shot. */
  releaseLock: () => void;
}

const DEFAULT_LOCK_TIMEOUT_MS = 5000;
const TAP_MAX_DURATION_MS = 250;

export function useTapToFocus(input?: UseTapToFocusInput): UseTapToFocusOutput {
  const lockTimeoutMs = input?.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const onFocusRef = useRef(input?.onFocus);
  onFocusRef.current = input?.onFocus;

  const [focusPoint, setFocusPoint] = useState<FocusPoint | null>(null);
  const [afLocked, setAfLocked] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      // Second tap while locked → release. First tap → enter lock + run a
      // real metering operation at the point.
      if (afLockedRef.current) {
        releaseLock();
        return;
      }
      clearTimer();
      afLockedRef.current = true;
      setAfLocked(true);
      setFocusPoint({ x, y, createdAt: Date.now() });
      hapticsBridge.selection();
      onFocusRef.current?.({ x, y });
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
    [handleTap]
  );

  return { tapGesture, focusPoint, afLocked, releaseLock };
}
