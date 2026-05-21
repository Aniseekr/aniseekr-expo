// Drives the live camera zoom in REAL factor units (e.g. 0.5×, 1×, 2×, 3×).
//
// VisionCamera exposes the actual sensor zoom factor on every device, so the
// expo-camera-era curve-guessing (ASSUMED_MAX_ZOOM_FACTOR) is gone — pinch and
// focal-stop pills now operate directly in factor space, bounded by
// `device.minZoom..device.maxZoom`.
//
// `zoomShared` is the canonical UI-thread value; the React `zoom` mirror is
// throttled at 120ms so JS-side rendering (active-stop chip, dial label) stays
// stable without forcing the camera surface through React state on every
// gesture frame.
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Gesture, type PinchGesture } from 'react-native-gesture-handler';
import {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { FocalStop, ZoomValue } from '../components/pilgrimage/camera/types';
import { shouldReseedZoomState } from '../libs/services/pilgrimage/camera-zoom-state';
import { hapticsBridge } from '../modules/haptics/hapticsBridge';

// Real zoom factors per focal-stop pill. Identity in v5 — the dial label and
// the camera engine both speak the same factor units, so a "2× pill" simply
// targets `zoom = 2`.
export const STOP_TO_ZOOM: Record<FocalStop, ZoomValue> = {
  0.5: 0.5,
  1: 1,
  2: 2,
  3: 3,
};

const DEFAULT_STOPS: FocalStop[] = [0.5, 1, 2, 3];
// ±0.1× in factor space — within this distance to a stop the dial snaps and
// flips the active chip. Wider than the old normalized 0.05 because factor
// space is sparser than 0..1.
const SNAP_TOLERANCE = 0.1;
// Multiplier applied per unit of pinch scale change. Pinch is naturally
// multiplicative, so `nextZoom = savedZoom * e.scale` reads as "double-pinch
// = double-zoom" — matches every native camera app.
const THROTTLE_MS = 120;
const ZOOM_TWEEN = { duration: 200, easing: Easing.out(Easing.cubic) } as const;

export interface UseCameraZoomInput {
  /** Real device min zoom factor (typically 0.5× on Pro phones, 1× on single-lens). */
  minZoom?: number;
  /** Real device max zoom factor (e.g. 15× on iPhone 15 Pro). */
  maxZoom?: number;
  stops?: FocalStop[];
  initial?: FocalStop;
  stopZoom?: Record<FocalStop, ZoomValue>;
  /**
   * Fired once per pinch gesture when the user pinches IN past 85% of the
   * device's `minZoom` floor — a clear "I want to go wider than this lens
   * can give me" intent. The compare screen wires this to the strategic
   * FSM's `requestSwitch('ultra-wide')` on standalone-switch cohorts so a
   * pinch-in past 1× on the wide session swaps to the standalone ultra-wide
   * session (the 0.5× affordance, gesture-driven rather than chip-driven).
   * One-shot per gesture: resets in `onBegin`.
   */
  onPinchBelowMin?: () => void;
  /**
   * Mirror of {@link onPinchBelowMin} for the reverse direction. Fired once
   * per pinch gesture when the user pinches OUT past 105% of `maxZoom` —
   * used on the ultra-wide session (`maxZoom ≈ 1.0`) to swap back to the
   * wide session when the user pinches out past ~1.05×. Callers should only
   * supply this on lenses where a swap target exists; otherwise leave
   * undefined so a normal wide-session zoom-in past `maxZoom` is just
   * clamped, not interpreted as a swap intent.
   */
  onPinchAboveMax?: () => void;
  /**
   * Hint to the dial-snap calculation. Ultra-wide sessions report `minZoom`
   * = `maxZoom` = 1.0 in the camera's own units; the user thinks of that
   * frame as "0.5x" (wide-equivalent). Without this hint the dial would
   * highlight the "1" pillar while the ultra-wide preview is up. When set
   * to `'ultra-wide'` we treat the live zoom as `native × ULTRA_WIDE_INTRINSIC_RATIO`
   * (currently 0.5 — close enough to the empirical 0.46–0.67 range across
   * shipped phones for the snap to land on the right pillar).
   */
  activeLens?: 'wide' | 'ultra-wide';
}

/** Approximation of the ultra-wide lens's field-of-view ratio relative to
 *  the main wide lens. Empirical: 0.46–0.67 across S20FE/Pixel/Xiaomi. The
 *  dial's pillar label is the user's mental model ("0.5x"), so we pick a
 *  number that maps native 1.0 to the label "0.5" — exact device intrinsics
 *  are not exposed by VisionCamera and would only marginally shift the
 *  snap calculation. */
const ULTRA_WIDE_INTRINSIC_RATIO = 0.5;

export interface UseCameraZoomOutput {
  /** Throttled (120ms) JS mirror of `zoomShared`. Safe to render. */
  zoom: number;
  activeStop: FocalStop | null;
  setZoom: (z: number) => void;
  setStop: (s: FocalStop) => void;
  pinchGesture: PinchGesture;
  /**
   * Live UI-thread zoom in real factor units. Pinch and the ZoomDial write to
   * this directly; pass it straight through to `<CameraStage zoomShared={...}/>`.
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
  const minZoom = input?.minZoom ?? 1;
  const maxZoom = input?.maxZoom ?? 1;
  const stops = input?.stops ?? DEFAULT_STOPS;
  const initial = input?.initial ?? 1;
  const stopZoom = input?.stopZoom ?? STOP_TO_ZOOM;
  const onPinchBelowMin = input?.onPinchBelowMin;
  const onPinchAboveMax = input?.onPinchAboveMax;
  const activeLens = input?.activeLens ?? 'wide';

  const initialFactor = clamp(stopZoom[initial], minZoom, maxZoom);
  const zoomShared = useSharedValue<number>(initialFactor);
  const savedZoom = useSharedValue<number>(initialFactor);
  const lastUpdate = useSharedValue<number>(0);
  // Per-gesture trigger latches: ensure each onPinchBelowMin / onPinchAboveMax
  // fires at most ONCE per pinch. Without these the user would re-fire the
  // lens-swap intent on every onUpdate frame while the threshold is held,
  // spamming the FSM with TAP_ISLAND events and racing the session swap.
  const belowMinTriggered = useSharedValue<boolean>(false);
  const aboveMaxTriggered = useSharedValue<boolean>(false);
  const previousInitialZoomRef = useRef<number>(initialFactor);

  const [zoom, setZoomState] = useState<number>(initialFactor);

  useLayoutEffect(() => {
    const target = clamp(stopZoom[initial], minZoom, maxZoom);
    const previousInitialZoom = previousInitialZoomRef.current;
    previousInitialZoomRef.current = target;
    if (!shouldReseedZoomState({ currentZoom: zoomShared.value, previousInitialZoom })) {
      return;
    }
    zoomShared.value = target;
    savedZoom.value = target;
    setZoomState(target);
  }, [initial, savedZoom, stopZoom, zoomShared, minZoom, maxZoom]);

  useAnimatedReaction(
    () => zoomShared.value,
    (current, previous) => {
      if (previous !== null && Math.abs(current - previous) < 0.000001) return;
      const now = Date.now();
      if (now - lastUpdate.value < THROTTLE_MS) return;
      lastUpdate.value = now;
      runOnJS(setZoomState)(current);
    }
  );

  const snapToStop = useCallback((_stop: FocalStop) => {
    hapticsBridge.selection();
  }, []);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          savedZoom.value = zoomShared.value;
          // Reset trigger latches so a fresh gesture can fire its swap
          // callback again. Without this only the first pinch of the session
          // could trigger a lens swap.
          belowMinTriggered.value = false;
          aboveMaxTriggered.value = false;
        })
        .onUpdate((e) => {
          // Multiplicative pinch in factor space: a 2× pinch doubles the
          // current zoom, a 0.5× pinch halves it. Matches native camera UX.
          const next = savedZoom.value * e.scale;
          zoomShared.value = clamp(next, minZoom, maxZoom);
          // Lens-swap intent detection. 85% (below) / 115% (above) thresholds
          // require a clear "past the wall" gesture, not just brushing the
          // floor with a small numeric overshoot from gesture noise. Each
          // callback latches per-gesture so we don't re-fire on every frame.
          if (
            onPinchBelowMin !== undefined &&
            !belowMinTriggered.value &&
            next < minZoom * 0.85
          ) {
            belowMinTriggered.value = true;
            runOnJS(onPinchBelowMin)();
          }
          if (
            onPinchAboveMax !== undefined &&
            !aboveMaxTriggered.value &&
            next > maxZoom * 1.05
          ) {
            aboveMaxTriggered.value = true;
            runOnJS(onPinchAboveMax)();
          }
        })
        .onEnd(() => {
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
            runOnJS(setZoomState)(target);
            if (snapped !== null) runOnJS(snapToStop)(snapped);
          } else {
            runOnJS(setZoomState)(zoomShared.value);
          }
        }),
    [
      zoomShared,
      savedZoom,
      minZoom,
      maxZoom,
      stops,
      stopZoom,
      snapToStop,
      belowMinTriggered,
      aboveMaxTriggered,
      onPinchBelowMin,
      onPinchAboveMax,
    ]
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
      const target = clamp(stopZoom[s], minZoom, maxZoom);
      zoomShared.value = withTiming(target, ZOOM_TWEEN);
      setZoomState(target);
      hapticsBridge.selection();
    },
    [zoomShared, stopZoom, minZoom, maxZoom]
  );

  const activeStop = useMemo<FocalStop | null>(() => {
    // The camera's native zoom is 1.0 on the ultra-wide session — but in the
    // user's mental model that frame is "0.5x" (wide-equivalent). Translate
    // before snapping so the dial highlights the "0.5" pillar instead of "1"
    // while ultra-wide is up. On wide / unknown, this is a no-op.
    const widthEquiv = activeLens === 'ultra-wide' ? zoom * ULTRA_WIDE_INTRINSIC_RATIO : zoom;
    return nearestStopJS(widthEquiv, stops, stopZoom);
  }, [zoom, stops, stopZoom, activeLens]);

  return { zoom, activeStop, setZoom, setStop, pinchGesture, zoomShared };
}
