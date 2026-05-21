// ZoomDial — a CD-style ("動態轉牌") continuous zoom dial that replaces the old
// 4-button FocalPills row in the camera compare screen.
//
// HOW IT WORKS
// A horizontal strip of tick marks pans left/right under a FIXED center
// indicator. Dragging the strip = continuous native zoom in real factor units.
// The labeled major detents (1x/2x/3x, plus 0.5x when an ultrawide lens exists)
// are BOTH tap targets and snap points; tapping or snapping a detent routes
// through `onPickFocalStop` so the screen's existing optical lens-switching
// logic is completely unchanged.
//
// PERFORMANCE
// The continuous drag must NOT re-render the heavy compare screen. The pan
// gesture writes `zoomShared.value` (the SharedValue from useCameraZoom)
// without touching React state on every frame; the strip's own `translateX` is
// an animated style off a local drag SharedValue. React state is only touched
// on a detent CROSS (a handful of times per drag).
//
// RULE 8 (no fake data)
// Only the real detents get a text label (0.5/1/2/3x). Every other tick is
// neutral. Past the last detent the strip keeps neutral ticks with NO labels up
// to the native device max zoom, so it never prints invented values like "4.2x".
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { ThemedText, readableTextOn } from '../../themed';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import {
  DEFAULT_DETENT_STOPS,
  FRONT_FACING_DETENT_STOPS,
  SNAP_TOLERANCE_PX,
  TICK_SPACING_PX,
  buildDetents,
  dialSpanPx,
  dragPositionForTranslation,
  nearestDetent,
  positionForStop,
  positionForZoom,
  zoomForPosition,
  type Detent,
  type StopZoomMap,
} from '../../../libs/services/pilgrimage/zoom-dial';
import type { ActiveLens } from '../../../libs/services/pilgrimage/dial-spaces';
import type { FocalStop } from './types';

/**
 * Off-strip lens-switching chip. When non-null, ZoomDial renders a tappable
 * island to the LEFT of the continuous strip. Tapping it requests a session
 * swap to `targetLens` (used on Android phones where the wide-active session
 * can't physically reach 0.5×). When null, the dial is a single continuous
 * strip — exact iOS behaviour, no regression.
 *
 * The island always lives OUTSIDE the strip. We never draft 0.5× into the
 * strip's snap detents on a wide-active standalone-switch device, because
 * VisionCamera would clamp the zoom request to the device's `minZoom`
 * silently — the user would drag to 0.5 and see the camera stop at 1.0.
 */
export interface ZoomDialIsland {
  readonly stop: FocalStop;
  readonly targetLens: ActiveLens;
}

/** Visible width of the dial window — the strip overflows and is clipped. */
const DIAL_WIDTH = 220;
const DIAL_HEIGHT = 56;
const CENTER_X = DIAL_WIDTH / 2;
/** Width over which edge ticks fade to dim, suggesting a curved rotating drum. */
const EDGE_FADE_PX = 56;
/** Minimum opacity a tick reaches at the very edge of the dial. */
const EDGE_MIN_OPACITY = 0.12;

interface ZoomDialProps {
  /** SharedValue from useCameraZoom — the live native zoom factor. */
  zoomShared: SharedValue<number>;
  /** The focal stop currently considered active (optical lens or digital snap). */
  activeStop: FocalStop | null;
  /** Routes a labeled-detent pick through the screen's lens-switching logic. */
  onPickFocalStop: (stop: FocalStop) => void;
  themeColor: string;
  /**
   * Focal stops the active VisionCamera device exposes. When `undefined` the
   * dial falls back to digital-only detents (`[1,2,3]`, or `[1]` front-facing).
   */
  availableStops?: FocalStop[];
  isFrontFacing?: boolean;
  /** Real native zoom factor for each focal stop (useCameraZoom's STOP_TO_ZOOM). */
  stopZoom: StopZoomMap;
  /** Real native maximum zoom factor from VisionCamera's active device. */
  maxZoom?: number;
  /** Virtual / auto-switching lenses the device exposes. Empty → no AUTO button. */
  virtualLenses?: string[];
  /** Tap handler for the AUTO button. Required when `virtualLenses` is non-empty. */
  onPickVirtual?: () => void;
  /** Highlight the AUTO button when an auto-switching lens is active. */
  virtualActive?: boolean;
  /** Off-strip lens-switch chip (Android standalone-switch cohorts). Tapping
   *  fires `onPickIsland(island.targetLens)` to request a camera session swap.
   *  `null` / undefined → no chip, dial behaves exactly as before. */
  island?: ZoomDialIsland | null;
  /** Called when the user taps the off-strip island chip. */
  onPickIsland?: (target: ActiveLens) => void;
  /** Dim the chip while a session swap is in flight to communicate progress. */
  islandPending?: boolean;
  /** Real native minimum zoom factor from VisionCamera's active device. Used
   *  alongside `maxZoom` as the threshold reference for the drag-driven
   *  lens-swap callbacks below. */
  minZoom?: number;
  /** One-shot callback fired from the pan gesture when the drag would write
   *  a zoom value BELOW `minZoom * 0.85` — a clear "I want wider than this
   *  lens can give me" intent. Mirrors `useCameraZoom.onPinchBelowMin` for
   *  the dial path so the user can drag the strip past the 1× floor to
   *  trigger the swap to the standalone ultra-wide. Only supply on cohorts
   *  where the swap target exists; the latch resets per gesture. */
  onDragBelowMin?: () => void;
  /** Mirror of {@link onDragBelowMin} for the reverse direction — fired when
   *  the drag would write a zoom value ABOVE `maxZoom * 1.05`. Used on the
   *  ultra-wide session to swap back to wide when the user drags the strip
   *  past the 0.5× region toward 1×. */
  onDragAboveMax?: () => void;
}

function formatStop(stop: FocalStop): string {
  return `${stop}x`;
}

/** A single tick mark on the strip. `detent` is set only on labeled detents. */
interface Tick {
  px: number;
  detent: Detent | null;
}

/** Builds the full tick list: labeled detents + neutral filler ticks. */
function buildTicks(detents: Detent[], spanPx: number): Tick[] {
  const byPx = new Map(detents.map((d) => [d.px, d]));
  const ticks: Tick[] = [];
  for (let px = 0; px <= spanPx + 0.5; px += TICK_SPACING_PX) {
    const rounded = Math.round(px);
    ticks.push({ px: rounded, detent: byPx.get(rounded) ?? null });
  }
  // Ensure every detent has a tick even if it didn't land on the grid.
  for (const d of detents) {
    if (!ticks.some((t) => Math.abs(t.px - d.px) < 0.5)) {
      ticks.push({ px: d.px, detent: d });
    }
  }
  return ticks.sort((a, b) => a.px - b.px);
}

export default function ZoomDial({
  zoomShared,
  activeStop,
  onPickFocalStop,
  themeColor,
  availableStops,
  isFrontFacing = false,
  stopZoom,
  maxZoom,
  virtualLenses,
  onPickVirtual,
  virtualActive = false,
  island,
  onPickIsland,
  islandPending = false,
  minZoom,
  onDragBelowMin,
  onDragAboveMax,
}: ZoomDialProps) {
  const stops = useMemo<FocalStop[]>(
    () => availableStops ?? (isFrontFacing ? FRONT_FACING_DETENT_STOPS : DEFAULT_DETENT_STOPS),
    [availableStops, isFrontFacing]
  );
  const detents = useMemo(() => buildDetents(stops, stopZoom), [stops, stopZoom]);
  const spanPx = useMemo(() => dialSpanPx(detents), [detents]);
  const ticks = useMemo(() => buildTicks(detents, spanPx), [detents, spanPx]);

  const showAutoBtn = (virtualLenses?.length ?? 0) > 0 && typeof onPickVirtual === 'function';
  const activeFg = readableTextOn(themeColor);
  const hasContinuousTail =
    detents.length > 0 &&
    typeof maxZoom === 'number' &&
    Number.isFinite(maxZoom) &&
    maxZoom > detents[detents.length - 1].zoom;
  const interactive = detents.length > 1 || hasContinuousTail;

  // `dragPx` is the strip's scroll position (px sitting under the center
  // indicator). Lives on the UI thread; React never re-renders on drag.
  const dragPx = useSharedValue(0);
  const startPx = useSharedValue(0);
  const dragging = useSharedValue(false);
  // Per-gesture latches so onDragBelowMin / onDragAboveMax each fire at most
  // ONCE per pan — same pattern as useCameraZoom's pinch latches. Without
  // these, holding the drag past the threshold would spam the FSM with
  // TAP_ISLAND events on every onUpdate frame.
  const dragBelowMinTriggered = useSharedValue<boolean>(false);
  const dragAboveMaxTriggered = useSharedValue<boolean>(false);
  // The detent whose label is highlighted — the only per-drag React state, and
  // it changes only on a detent cross (a few times per drag, not per frame).
  const [highlightStop, setHighlightStop] = useState<FocalStop | null>(activeStop);
  const lastCrossStop = useRef<FocalStop | null>(activeStop);

  // Seed/resync the strip from the live zoom when zoom changes from OUTSIDE the
  // dial (a focal-stop pick, pinch, mount). Skipped mid-drag so we don't fight
  // the gesture. Depends on `activeStop` because that flips on any external pick.
  useEffect(() => {
    if (!interactive) return;
    if (dragging.value) return;
    const target = positionForZoom(zoomShared.value, detents, undefined, maxZoom);
    dragPx.value = withTiming(target, { duration: 180 });
    setHighlightStop(activeStop);
    lastCrossStop.current = activeStop;
    // zoomShared / dragPx / dragging are stable SharedValues — reading once is
    // intentional; continuous updates flow through the gesture, not this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detents, interactive, activeStop, maxZoom]);

  // Haptic + highlight feedback when a labeled detent crosses the center line.
  // Pure JS — invoked from the pan-gesture worklet via runOnJS so the gesture
  // itself stays on the UI thread. The worklet decides which stop crossed
  // (it already has `detents` in closure for the px<->zoom math) and just
  // forwards the resulting FocalStop | null. No array serialisation across
  // the bridge.
  const syncDetentHighlight = useCallback((stop: FocalStop | null) => {
    if (stop === lastCrossStop.current) return;
    lastCrossStop.current = stop;
    if (stop !== null) hapticsBridge.selection();
    setHighlightStop(stop);
  }, []);

  // Commit a focal-stop pick on release. Routes through the screen's existing
  // onPickFocalStop so optical lens switching is unchanged. A release that
  // lands between detents keeps the user's hand-set digital zoom (no lie).
  const commitRelease = useCallback(
    (snapStop: FocalStop) => {
      onPickFocalStop(snapStop);
    },
    [onPickFocalStop]
  );

  // Pan gesture lives on the UI thread. The zoom-dial helpers
  // (`dragPositionForTranslation`, `zoomForPosition`, `nearestDetent`,
  // `positionForStop`) are all marked `'worklet'`, so the gesture runs at
  // 60+ fps without crossing the JS bridge each frame. Only events that
  // genuinely require React state — detent-cross highlight, snap-on-release
  // commit — get routed back via `runOnJS`. This replaces a prior
  // `runOnJS(true)` workaround that pushed every drag frame through JS and
  // caused noticeable jitter under load.
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(interactive)
        .onBegin(() => {
          'worklet';
          startPx.value = dragPx.value;
          dragging.value = true;
          // Reset swap-intent latches so a fresh gesture can fire the
          // callback again. Without reset only the first pan of the
          // session could trigger a lens swap.
          dragBelowMinTriggered.value = false;
          dragAboveMaxTriggered.value = false;
          const startStop = nearestDetent(dragPx.value, detents, SNAP_TOLERANCE_PX);
          runOnJS(syncDetentHighlight)(startStop);
        })
        // Dragging the strip LEFT brings its higher-zoom ticks toward the
        // center, so a leftward translation increases zoom — invert translationX.
        .onUpdate((e) => {
          'worklet';
          const next = dragPositionForTranslation(startPx.value, e.translationX, spanPx);
          dragPx.value = next;
          const computed = zoomForPosition(next, detents, undefined, maxZoom);
          zoomShared.value = computed;
          const stop = nearestDetent(next, detents, SNAP_TOLERANCE_PX);
          runOnJS(syncDetentHighlight)(stop);
          // Lens-swap intent: drag past 85% of minZoom (toward 0.5 on a
          // wide-active strip) → request swap to the standalone ultra-wide.
          // Mirror: drag past 105% of maxZoom (toward 1 on the ultra-wide
          // strip) → request swap back to wide. Same thresholds and same
          // one-shot latching as `useCameraZoom`'s pinch path, so dial drag
          // and pinch behave identically when both cross the wall.
          if (
            onDragBelowMin !== undefined &&
            !dragBelowMinTriggered.value &&
            typeof minZoom === 'number' &&
            computed < minZoom * 0.85
          ) {
            dragBelowMinTriggered.value = true;
            runOnJS(onDragBelowMin)();
          }
          if (
            onDragAboveMax !== undefined &&
            !dragAboveMaxTriggered.value &&
            typeof maxZoom === 'number' &&
            computed > maxZoom * 1.05
          ) {
            dragAboveMaxTriggered.value = true;
            runOnJS(onDragAboveMax)();
          }
        })
        .onEnd(() => {
          'worklet';
          const snapStop = nearestDetent(dragPx.value, detents, SNAP_TOLERANCE_PX);
          if (snapStop !== null) {
            const snapPx = positionForStop(snapStop, detents);
            if (snapPx !== null) {
              dragPx.value = withTiming(snapPx, { duration: 160 });
              zoomShared.value = withTiming(zoomForPosition(snapPx, detents, undefined, maxZoom), {
                duration: 160,
              });
            }
            runOnJS(syncDetentHighlight)(snapStop);
            runOnJS(commitRelease)(snapStop);
          }
        })
        .onFinalize(() => {
          'worklet';
          dragging.value = false;
        }),
    [
      interactive,
      spanPx,
      detents,
      dragPx,
      startPx,
      dragging,
      zoomShared,
      minZoom,
      maxZoom,
      commitRelease,
      syncDetentHighlight,
      onDragBelowMin,
      onDragAboveMax,
      dragBelowMinTriggered,
      dragAboveMaxTriggered,
    ]
  );

  // Strip translateX so the current dragPx sits under the fixed center line.
  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: CENTER_X - dragPx.value }],
  }));

  // Tapping a detent label/tick: snap there and route the pick.
  const handleTapStop = useCallback(
    (stop: FocalStop) => {
      if (!interactive) return;
      const px = positionForStop(stop, detents);
      if (px === null) return;
      hapticsBridge.selection();
      dragPx.value = withTiming(px, { duration: 160 });
      zoomShared.value = withTiming(zoomForPosition(px, detents, undefined, maxZoom), {
        duration: 160,
      });
      lastCrossStop.current = stop;
      setHighlightStop(stop);
      onPickFocalStop(stop);
    },
    [interactive, detents, onPickFocalStop, dragPx, zoomShared, maxZoom]
  );

  if (detents.length === 0 && !showAutoBtn) return null;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {island ? (
          <Pressable
            disabled={islandPending}
            onPress={() => {
              hapticsBridge.selection();
              onPickIsland?.(island.targetLens);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Switch to ${island.targetLens === 'ultra-wide' ? 'ultra-wide' : 'wide'} lens`}
            accessibilityState={{ disabled: islandPending }}
            style={({ pressed }) => [
              styles.islandChip,
              islandPending && { opacity: 0.5 },
              pressed && { opacity: 0.6 },
            ]}>
            <ThemedText variant="captionSmall" weight="700" style={styles.islandLabel}>
              {formatStop(island.stop)}
            </ThemedText>
          </Pressable>
        ) : null}
        <GestureDetector gesture={panGesture}>
          <View style={[styles.dial, { width: DIAL_WIDTH }]}>
            <Animated.View style={[styles.strip, stripStyle]}>
              {ticks.map((tick) => (
                <TickMark
                  key={tick.px}
                  tick={tick}
                  dragPx={dragPx}
                  themeColor={themeColor}
                  activeFg={activeFg}
                  highlighted={tick.detent != null && tick.detent.stop === highlightStop}
                  interactive={interactive}
                  onTap={handleTapStop}
                />
              ))}
            </Animated.View>
            {/* Edge fade gradients — suggest a curved rotating drum. rgba over
                the live camera preview (CLAUDE.md camera-scrim exception). */}
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[styles.fade, styles.fadeLeft]}
            />
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[styles.fade, styles.fadeRight]}
            />
            {/* Fixed center indicator. */}
            <View pointerEvents="none" style={styles.centerWrap}>
              <View style={[styles.centerLine, { backgroundColor: themeColor }]} />
              <View style={[styles.centerCaret, { borderTopColor: themeColor }]} />
            </View>
          </View>
        </GestureDetector>

        {showAutoBtn ? (
          <Pressable
            onPress={() => {
              hapticsBridge.selection();
              onPickVirtual?.();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Auto lens"
            accessibilityState={{ selected: virtualActive }}
            style={({ pressed }) => [
              styles.autoBtn,
              { backgroundColor: virtualActive ? themeColor : 'rgba(255,255,255,0.14)' },
              pressed && { opacity: 0.6 },
            ]}>
            <Ionicons name="aperture-outline" size={16} color={virtualActive ? activeFg : '#fff'} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

interface TickMarkProps {
  tick: Tick;
  dragPx: SharedValue<number>;
  themeColor: string;
  activeFg: string;
  highlighted: boolean;
  interactive: boolean;
  onTap: (stop: FocalStop) => void;
}

/** One tick on the strip, absolutely positioned at `left: tick.px`. Labeled
 *  detents render a 44×44 tap target + text label; neutral ticks are short
 *  unlabeled lines. Opacity fades near the dial edges (drum effect), driven by
 *  a derived value off the strip's drag position. */
function TickMark({
  tick,
  dragPx,
  themeColor,
  activeFg,
  highlighted,
  interactive,
  onTap,
}: TickMarkProps) {
  const detent = tick.detent;

  // Distance of this tick from the fixed center indicator, in screen px. The
  // strip is translated by (CENTER_X - dragPx), so the tick's on-screen offset
  // from center is exactly (tick.px - dragPx).
  const edgeStyle = useAnimatedStyle(() => {
    const d = Math.abs(tick.px - dragPx.value);
    const fadeStart = CENTER_X - EDGE_FADE_PX;
    if (d <= fadeStart) return { opacity: 1 };
    const t = Math.min(1, (d - fadeStart) / EDGE_FADE_PX);
    return { opacity: 1 - t * (1 - EDGE_MIN_OPACITY) };
  });

  return (
    <Animated.View style={[styles.tickSlot, { left: tick.px }, edgeStyle]}>
      {detent ? (
        <Pressable
          disabled={!interactive}
          onPress={() => onTap(detent.stop)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`${formatStop(detent.stop)} zoom`}
          accessibilityState={{ selected: highlighted }}
          style={styles.detentTap}>
          <View
            style={[
              styles.tickMajor,
              { backgroundColor: highlighted ? themeColor : 'rgba(255,255,255,0.85)' },
            ]}
          />
          <View style={[styles.label, highlighted && { backgroundColor: themeColor }]}>
            <ThemedText
              variant="captionSmall"
              weight="700"
              align="center"
              style={{ color: highlighted ? activeFg : '#fff' }}>
              {formatStop(detent.stop)}
            </ThemedText>
          </View>
        </Pressable>
      ) : (
        <View style={styles.tickMinor} />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // All rgba(...) below are scrims/ticks drawn directly over the live camera
  // preview — CLAUDE.md camera-scrim exception applies.
  container: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dial: {
    height: DIAL_HEIGHT,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  // Wider than the dial window; translated under the fixed center indicator.
  strip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  // Each tick is absolutely positioned at `left: tick.px`; the slot has zero
  // width so its centered mark sits exactly on tick.px.
  tickSlot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickMinor: {
    width: 2,
    height: 10,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  tickMajor: {
    width: 3,
    height: 15,
    borderRadius: 1.5,
  },
  // 44×44 hit area satisfies the touch-target minimum (Size.minTouchTarget).
  detentTap: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  label: {
    minWidth: 30,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: EDGE_FADE_PX,
  },
  fadeLeft: {
    left: 0,
  },
  fadeRight: {
    right: 0,
  },
  centerWrap: {
    position: 'absolute',
    left: CENTER_X - 8,
    top: 0,
    bottom: 0,
    width: 16,
    alignItems: 'center',
  },
  centerLine: {
    width: 2,
    flex: 1,
    borderRadius: 1,
  },
  centerCaret: {
    position: 'absolute',
    bottom: 4,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  autoBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The 0.5× / 1× island chip sits to the LEFT of the dial. Visually distinct
  // from the AUTO button so users learn it's a session-swap affordance, not
  // a snap detent. ~44px diameter satisfies the touch-target minimum.
  islandChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  islandLabel: {
    color: '#fff',
  },
});
