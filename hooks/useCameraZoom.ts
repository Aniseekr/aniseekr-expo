// Drives the real expo-camera CameraView.zoom (0..1 range) via pinch + focal-stop pills.
// This hook targets the camera *lens* — not the overlay scale. The existing
// `useOverlayTransform` (gesture composition in compare/[spotId].tsx) handles
// overlay zoom; if you want both, compose them with `Gesture.Simultaneous`.
//
// Stop→zoom is COMPUTED from an exponential inverse (see STOP_TO_ZOOM below),
// not hand-calibrated. It still relies on an assumed videoMaxZoomFactor, so
// treat 2×/3× as approximate and field-test before relying on exact parity.
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { Gesture, type PinchGesture } from 'react-native-gesture-handler';
import {
  Easing,
  runOnJS,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { FocalStop, ZoomValue } from '../components/pilgrimage/camera/types';
import { hapticsBridge } from '../modules/haptics/hapticsBridge';

// expo-camera maps this normalized `zoom` (0..1) to the iOS videoZoomFactor
// EXPONENTIALLY — videoZoomFactor = videoMaxZoomFactor ** zoom (see
// CameraSessionManager.updateZoom). A focal-stop pill is a real zoom *factor*
// (1×/2×/3×), so to land factor N we invert that curve:
//   zoom = ln(N) / ln(videoMaxZoomFactor)
//
// videoMaxZoomFactor (M) is device/format-specific and expo-camera does NOT
// expose it to JS, so we assume a value. The error is asymmetric: too LOW
// over-zooms (the blur bug), too HIGH under-zooms (still sharp, just timid) —
// so err high. 50 is mid-upper of the realistic iPhone single-lens range
// (~16–123): a 2× pill then lands ~1.6–2.4×, 3× ~2.2–3.9× across that range,
// vs the old linear guess's 5–17× and 16–123×.
// TODO: a per-model override or a native getter for the real M makes this exact.
const ASSUMED_MAX_ZOOM_FACTOR = 50;

// The real zoom factor each focal-stop pill targets. A digital-only lens can't
// go below its native FOV, so 0.5× clamps to 1× (factorToZoom maps <=1 to 0).
const STOP_TO_FACTOR: Record<FocalStop, number> = {
  0.5: 1,
  1: 1,
  2: 2,
  3: 3,
};

/** Invert expo-camera's exponential zoom curve: real factor → normalized 0..1. */
function factorToZoom(factor: number): ZoomValue {
  if (factor <= 1) return 0;
  return Math.min(1, Math.max(0, Math.log(factor) / Math.log(ASSUMED_MAX_ZOOM_FACTOR)));
}

// Derived from the exponential inverse — not hand-tuned. Consumers (snap, pinch,
// setStop, initial seed) read this unchanged.
export const STOP_TO_ZOOM: Record<FocalStop, ZoomValue> = {
  0.5: factorToZoom(STOP_TO_FACTOR[0.5]),
  1: factorToZoom(STOP_TO_FACTOR[1]),
  2: factorToZoom(STOP_TO_FACTOR[2]),
  3: factorToZoom(STOP_TO_FACTOR[3]),
};

const DEFAULT_STOPS: FocalStop[] = [0.5, 1, 2, 3];
const SNAP_TOLERANCE = 0.05;
// Pinch arc → zoom delta. 0.4 means a 2.5× pinch covers the full 0→1 range.
// Tune after field test on representative devices.
const PINCH_SENSITIVITY = 0.4;
// 120ms cadence: matches the rotation-throttle pattern elsewhere — keeps React
// state updates off the UI thread without lagging stop-snap visuals noticeably.
const THROTTLE_MS = 120;
// Focal-stop transitions ease in once and stop — deliberately NOT a spring.
// A spring overshot the target zoom and bounced back, which read as a cheap
// "toy camera" wobble; a single timed ramp settles clean like a real lens.
const ZOOM_TWEEN = { duration: 200, easing: Easing.out(Easing.cubic) } as const;

export interface UseCameraZoomInput {
  minZoom?: number;
  maxZoom?: number;
  stops?: FocalStop[];
  initial?: FocalStop;
  stopZoom?: Record<FocalStop, ZoomValue>;
}

export interface UseCameraZoomOutput {
  zoom: number;
  activeStop: FocalStop | null;
  setZoom: (z: number) => void;
  setStop: (s: FocalStop) => void;
  pinchGesture: PinchGesture;
  /**
   * The live normalized 0..1 zoom written on the UI thread. `zoom` (the JS
   * state above) is a THROTTLED mirror of this value; gesture handlers that
   * want jank-free continuous zoom (pinch, the ZoomDial) should write
   * `zoomShared.value` directly on the UI thread instead of calling `setZoom`.
   */
  zoomShared: SharedValue<number>;
}

function clamp(v: number, lo: number, hi: number): number {
  'worklet';
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function nearestStopJS(
  z: number,
  stops: FocalStop[],
  stopZoom: Record<FocalStop, ZoomValue>
): FocalStop | null {
  let best: FocalStop | null = null;
  let bestDelta = Infinity;
  for (const stop of stops) {
    const delta = Math.abs(z - stopZoom[stop]);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = stop;
    }
  }
  if (best !== null && bestDelta < SNAP_TOLERANCE) return best;
  return null;
}

export function useCameraZoom(input?: UseCameraZoomInput): UseCameraZoomOutput {
  const minZoom = input?.minZoom ?? 0;
  const maxZoom = input?.maxZoom ?? 1;
  const stops = input?.stops ?? DEFAULT_STOPS;
  const initial = input?.initial ?? 1;
  const stopZoom = input?.stopZoom ?? STOP_TO_ZOOM;

  const zoomShared = useSharedValue<number>(stopZoom[initial]);
  const savedZoom = useSharedValue<number>(stopZoom[initial]);
  const lastUpdate = useSharedValue<number>(0);

  const [zoom, setZoomState] = useState<number>(stopZoom[initial]);

  useLayoutEffect(() => {
    const target = stopZoom[initial];
    zoomShared.value = target;
    savedZoom.value = target;
    setZoomState(target);
  }, [initial, savedZoom, stopZoom, zoomShared]);

  // Throttled JS-state mirror of the shared value. Same shape as the rotation
  // throttle in useOverlayTransform — keeps React renders bounded while the
  // shared value drives CameraView.zoom directly on the UI thread.
  useDerivedValue(() => {
    const now = Date.now();
    if (now - lastUpdate.value < THROTTLE_MS) return;
    lastUpdate.value = now;
    runOnJS(setZoomState)(zoomShared.value);
  });

  const snapToStop = useCallback((stop: FocalStop) => {
    hapticsBridge.selection();
  }, []);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          savedZoom.value = zoomShared.value;
        })
        .onUpdate((e) => {
          const next = savedZoom.value + (e.scale - 1) * PINCH_SENSITIVITY;
          zoomShared.value = clamp(next, minZoom, maxZoom);
        })
        .onEnd(() => {
          // Snap to nearest stop only if we're inside hysteresis tolerance.
          // Otherwise leave the user's hand-set zoom in place — don't lie.
          let target: number | null = null;
          let snapped: FocalStop | null = null;
          for (const stop of stops) {
            const delta = Math.abs(zoomShared.value - stopZoom[stop]);
            if (delta < SNAP_TOLERANCE) {
              target = stopZoom[stop];
              snapped = stop;
              break;
            }
          }
          if (target !== null) {
            zoomShared.value = withTiming(target, ZOOM_TWEEN);
            if (snapped !== null) runOnJS(snapToStop)(snapped);
          }
        }),
    [zoomShared, savedZoom, minZoom, maxZoom, stops, stopZoom, snapToStop]
  );

  const setZoom = useCallback(
    (z: number) => {
      const clamped = Math.max(minZoom, Math.min(maxZoom, z));
      zoomShared.value = clamped;
      setZoomState(clamped);
    },
    [zoomShared, minZoom, maxZoom]
  );

  const setStop = useCallback(
    (s: FocalStop) => {
      const target = stopZoom[s];
      zoomShared.value = withTiming(target, ZOOM_TWEEN);
      setZoomState(target);
      hapticsBridge.selection();
    },
    [zoomShared, stopZoom]
  );

  const activeStop = useMemo<FocalStop | null>(
    () => nearestStopJS(zoom, stops, stopZoom),
    [zoom, stops, stopZoom]
  );

  return { zoom, activeStop, setZoom, setStop, pinchGesture, zoomShared };
}
