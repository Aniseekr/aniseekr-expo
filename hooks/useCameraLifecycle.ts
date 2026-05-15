// CameraView lifecycle bookkeeping. We track three independent things:
//   1. isReady — flips true on the first `onCameraReady`. Stays sticky so the
//      warmup spinner doesn't blink when the SDK fires ready more than once.
//   2. mountError — string from `onMountError`, cleared on the next ready event
//      so a recovered camera no longer shows the error banner.
//   3. active — exposed as a controlled boolean so callers can pause/resume
//      capture (e.g. when navigating to a sheet) without unmounting.
//
// When the caller flips `setActive(false → true)` we also reset `isReady` so
// the warmup spinner reappears during re-mount — the CameraView will fire
// `onCameraReady` again once the underlying surface is back. This matches the
// behavior the compare screen needs after returning from a backgrounded state.
//
// Pure React state only — no AsyncStorage, no side effects beyond the
// `setActive` transition handling.

import { useCallback, useState } from 'react';

export interface UseCameraLifecycleOutput {
  isReady: boolean;
  mountError: string | null;
  /** Bind to `CameraView.onCameraReady`. Callers can compose with other listeners. */
  onCameraReady: () => void;
  /** Bind to `CameraView.onMountError` via an adapter that produces `{ nativeEvent }`. */
  onMountError: (e: { nativeEvent: { message: string } }) => void;
  /** Pause/resume the camera session. Re-activating also resets `isReady`. */
  setActive: (active: boolean) => void;
  active: boolean;
  /** Force `isReady` back to false. Use on intentional remounts. */
  reset: () => void;
}

export function useCameraLifecycle(initialActive: boolean = true): UseCameraLifecycleOutput {
  const [isReady, setIsReady] = useState<boolean>(false);
  const [mountError, setMountError] = useState<string | null>(null);
  const [active, setActiveState] = useState<boolean>(initialActive);

  const onCameraReady = useCallback(() => {
    setIsReady(true);
    setMountError(null);
  }, []);

  const onMountError = useCallback((e: { nativeEvent: { message: string } }) => {
    const msg = e?.nativeEvent?.message ?? 'Camera failed to mount';
    setMountError(msg);
  }, []);

  const reset = useCallback(() => {
    setIsReady(false);
  }, []);

  const setActive = useCallback((next: boolean) => {
    setActiveState((prev) => {
      // A false → true transition implies a re-mount; clear `isReady` so the
      // warmup spinner shows until CameraView reports ready again.
      if (!prev && next) {
        setIsReady(false);
      }
      return next;
    });
  }, []);

  return {
    isReady,
    mountError,
    onCameraReady,
    onMountError,
    setActive,
    active,
    reset,
  };
}
