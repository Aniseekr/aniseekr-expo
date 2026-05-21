// Drives the lens-switch FSM and exposes the resulting active CameraDevice
// to the camera screen.
//
// Contract:
//   * `cohort`: from `useResolvedCameraDevices`. When null we render nothing
//     dial-side (loading state) and return `activeDevice = undefined`.
//   * `requestSwitch(target)`: invoked by ZoomDial's island-tap. Routes
//     straight to the FSM via the TAP_ISLAND event (skips dwell).
//   * `onDialEnterIsland(target)` / `onDialExitIsland()`: invoked by
//     ZoomDial's pan worklet when a drag crosses past the strip's lower wall
//     (and when it returns). Routes to DIAL_CROSS_INTO_ISLAND_REGION /
//     DIAL_RECROSS_BACK; the FSM owns the dwell timer that decides whether
//     a sustained hover commits to a session swap.
//   * `onCameraStarted` / `onCameraError`: invoked by CameraStage when
//     VisionCamera's `onStarted` / `onError` fire — keep the FSM in sync
//     with reality so we don't hand the dial a stale active device.
//
// Why a reducer rather than chained useState: the FSM has four phases and
// six events; expressing every transition as set-state-from-effect would
// produce a tangle of timing bugs. The reducer is 100% covered by
// `switch-fsm.test.ts`, so once the hook just dispatches events the
// camera screen has nothing left to argue about.

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { CameraDevice } from 'react-native-vision-camera';
import type { DeviceCohort } from '../libs/services/pilgrimage/device-cohort';
import {
  fsmReducer,
  initialFsmState,
  type ActiveLens,
  type FsmEffect,
  type FsmEvent,
  type FsmState,
} from '../libs/services/pilgrimage/switch-fsm';

export interface StrategicCameraDeviceResult {
  /** The CameraDevice currently feeding the preview. Undefined while the
   *  cohort is still null OR while a session swap is mid-flight. */
  readonly activeDevice: CameraDevice | undefined;
  /** Which physical lens family is currently active. */
  readonly activeLens: ActiveLens;
  /** True between OPEN_LENS_SESSION and CAMERA_STARTED. UI should disable
   *  capture and may overlay a snapshot/blur during this window. */
  readonly isSwitching: boolean;
  /** Last switch error, or null. UI surfaces this as a banner; tapping the
   *  island again clears it. */
  readonly error: string | null;
  /** Request a session swap (called by ZoomDial on island tap — skips
   *  dwell). */
  readonly requestSwitch: (target: ActiveLens) => void;
  /** Called by CameraStage when VisionCamera reports the new session is up. */
  readonly onCameraStarted: () => void;
  /** Called by CameraStage when VisionCamera reports a session error. */
  readonly onCameraError: (message: string) => void;
  /** Called by ZoomDial's pan worklet when a drag crosses past the lower
   *  strip wall toward the island region. The FSM moves to HOVER_BOUNDARY
   *  and arms the dwell timer; if the user holds for DWELL_MS the swap
   *  commits, otherwise `onDialExitIsland` cancels. */
  readonly onDialEnterIsland: (target: ActiveLens) => void;
  /** Called by ZoomDial when the drag returns to the continuous strip
   *  before the dwell timer fires. Cancels the pending swap. */
  readonly onDialExitIsland: () => void;
}

function applyEffects(
  effects: readonly FsmEffect[],
  dwellTimerRef: { current: ReturnType<typeof setTimeout> | null },
  onDwell: () => void,
  onOpenSession: (target: ActiveLens) => void
): void {
  for (const effect of effects) {
    switch (effect.type) {
      case 'START_DWELL_TIMER':
        if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = setTimeout(onDwell, effect.ms);
        break;
      case 'CANCEL_DWELL_TIMER':
        if (dwellTimerRef.current) {
          clearTimeout(dwellTimerRef.current);
          dwellTimerRef.current = null;
        }
        break;
      case 'OPEN_LENS_SESSION':
        onOpenSession(effect.target);
        break;
    }
  }
}

export function useStrategicCameraDevice(
  cohort: DeviceCohort | null
): StrategicCameraDeviceResult {
  // The FSM starts on 'wide' because that's the default session every
  // shipped phone opens to. If the cohort later turns out to be wide-only
  // or logical, the FSM never transitions out of STABLE/wide and the
  // session-swap path is a no-op.
  const [state, dispatch] = useReducer(reducerWithEffects, initialFsmState('wide'));
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  // The reducer wrapper invokes the pure reducer AND queues effect
  // dispatches. Effects that fire async (timer expiry, session open) are
  // routed via dispatchRef so we don't have to memoise dispatch by hand.
  function reducerWithEffects(prev: FsmState, event: FsmEvent): FsmState {
    const result = fsmReducer(prev, event);
    applyEffects(
      result.effects,
      dwellTimerRef,
      () => dispatchRef.current({ type: 'DWELL_TIMEOUT' }),
      // OPEN_LENS_SESSION is handled by the consumer (CameraStage swaps the
      // device prop on Camera). We don't drive that here — the consumer
      // reads `activeLens` from this hook and binds the right device.
      () => undefined
    );
    return result.state;
  }

  // Clean up any pending dwell timer on unmount so a backgrounded screen
  // doesn't fire a stale swap when it comes back.
  useEffect(
    () => () => {
      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
    },
    []
  );

  const requestSwitch = useCallback((target: ActiveLens) => {
    dispatchRef.current({ type: 'TAP_ISLAND', target });
  }, []);
  const onCameraStarted = useCallback(() => {
    dispatchRef.current({ type: 'CAMERA_STARTED' });
  }, []);
  const onCameraError = useCallback((message: string) => {
    dispatchRef.current({ type: 'CAMERA_ERROR', error: message });
  }, []);
  const onDialEnterIsland = useCallback((target: ActiveLens) => {
    dispatchRef.current({ type: 'DIAL_CROSS_INTO_ISLAND_REGION', target });
  }, []);
  const onDialExitIsland = useCallback(() => {
    dispatchRef.current({ type: 'DIAL_RECROSS_BACK' });
  }, []);

  const activeLens: ActiveLens =
    state.phase === 'SWITCHING'
      ? state.previousLens
      : state.phase === 'STABLE' || state.phase === 'HOVER_BOUNDARY' || state.phase === 'ERROR'
        ? state.activeLens
        : 'wide';

  const targetLens: ActiveLens =
    state.phase === 'SWITCHING' ? state.targetLens : activeLens;

  const activeDevice = useMemo<CameraDevice | undefined>(() => {
    if (!cohort) return undefined;
    // While switching, surface the TARGET device so VisionCamera starts
    // bringing the new session up. The dial keeps showing
    // `isSwitching = true` until CAMERA_STARTED arrives.
    const lensForDevice = state.phase === 'SWITCHING' ? targetLens : activeLens;
    if (lensForDevice === 'ultra-wide' && cohort.ultraWide) return cohort.ultraWide;
    return cohort.primary;
  }, [cohort, state.phase, activeLens, targetLens]);

  const isSwitching = state.phase === 'SWITCHING';
  const error = state.phase === 'ERROR' ? state.error : null;

  return {
    activeDevice,
    activeLens,
    isSwitching,
    error,
    requestSwitch,
    onCameraStarted,
    onCameraError,
    onDialEnterIsland,
    onDialExitIsland,
  };
}
