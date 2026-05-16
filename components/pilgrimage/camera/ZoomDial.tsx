// ZoomDial — a CD-style ("動態轉牌") continuous zoom dial that replaces the old
// 4-button FocalPills row in the camera compare screen.
//
// HOW IT WORKS
// A horizontal strip of tick marks pans left/right under a FIXED center
// indicator. Dragging the strip = continuous digital zoom (the fine "0.55x
// feel"). The labeled major detents (1x/2x/3x, plus 0.5x when an ultrawide
// lens exists) are BOTH tap targets and snap points; tapping or snapping a
// detent routes through `onPickFocalStop` so the screen's existing optical
// lens-switching logic is completely unchanged.
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
// neutral. Past the last detent the strip keeps neutral ticks with NO labels —
// the app does not know the device's true max zoom factor, so it must never
// print an invented value like "4.2x".
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
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
import type { FocalStop } from './types';

/** Visible width of the dial window — the strip overflows and is clipped. */
const DIAL_WIDTH = 220;
const DIAL_HEIGHT = 56;
const CENTER_X = DIAL_WIDTH / 2;
/** Width over which edge ticks fade to dim, suggesting a curved rotating drum. */
const EDGE_FADE_PX = 56;
/** Minimum opacity a tick reaches at the very edge of the dial. */
const EDGE_MIN_OPACITY = 0.12;

interface ZoomDialProps {
  /** SharedValue from useCameraZoom — the live normalized 0..1 digital zoom. */
  zoomShared: SharedValue<number>;
  /** The focal stop currently considered active (optical lens or digital snap). */
  activeStop: FocalStop | null;
  /** Routes a labeled-detent pick through the screen's lens-switching logic. */
  onPickFocalStop: (stop: FocalStop) => void;
  themeColor: string;
  /**
   * Focal stops the device exposes via real optical lenses (from
   * useLensSwitcher). When `undefined` the dial falls back to digital-only
   * detents (`[1,2,3]`, or `[1]` front-facing).
   */
  availableStops?: FocalStop[];
  isFrontFacing?: boolean;
  /** Normalized 0..1 zoom for each focal stop (useCameraZoom's STOP_TO_ZOOM). */
  stopZoom: StopZoomMap;
  /** Virtual / auto-switching lenses the device exposes. Empty → no AUTO button. */
  virtualLenses?: string[];
  /** Tap handler for the AUTO button. Required when `virtualLenses` is non-empty. */
  onPickVirtual?: () => void;
  /** Highlight the AUTO button when an auto-switching lens is active. */
  virtualActive?: boolean;
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
  virtualLenses,
  onPickVirtual,
  virtualActive = false,
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
  // A single detent (front camera) → nothing to drag to; render a static dial.
  const interactive = detents.length > 1;

  // `dragPx` is the strip's scroll position (px sitting under the center
  // indicator). Lives on the UI thread; React never re-renders on drag.
  const dragPx = useSharedValue(0);
  const startPx = useSharedValue(0);
  const dragging = useSharedValue(false);
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
    const target = positionForZoom(zoomShared.value, detents);
    dragPx.value = withTiming(target, { duration: 180 });
    setHighlightStop(activeStop);
    lastCrossStop.current = activeStop;
    // zoomShared / dragPx / dragging are stable SharedValues — reading once is
    // intentional; continuous updates flow through the gesture, not this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detents, interactive, activeStop]);

  // Haptic + highlight feedback when a labeled detent crosses the center line.
  const syncDetentHighlight = useCallback(
    (px: number) => {
      const stop = nearestDetent(px, detents, SNAP_TOLERANCE_PX);
      if (stop === lastCrossStop.current) return;
      lastCrossStop.current = stop;
      if (stop !== null) hapticsBridge.selection();
      setHighlightStop(stop);
    },
    [detents]
  );

  // Commit a focal-stop pick on release. Routes through the screen's existing
  // onPickFocalStop so optical lens switching is unchanged. A release that
  // lands between detents keeps the user's hand-set digital zoom (no lie).
  const commitRelease = useCallback(
    (snapStop: FocalStop) => {
      onPickFocalStop(snapStop);
    },
    [onPickFocalStop]
  );

  // Pan gesture: writes SharedValues without re-rendering on every move.
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        // Keep this tiny control on the JS thread. Dragging used to send the
        // detent object array + imported helpers into Reanimated's UI runtime;
        // on some devices that path crashes as soon as the gesture updates.
        .runOnJS(true)
        .enabled(interactive)
        .onBegin(() => {
          startPx.value = dragPx.value;
          dragging.value = true;
          lastCrossStop.current = nearestDetent(dragPx.value, detents, SNAP_TOLERANCE_PX);
        })
        // Dragging the strip LEFT brings its higher-zoom ticks toward the
        // center, so a leftward translation increases zoom — invert translationX.
        .onUpdate((e) => {
          const next = dragPositionForTranslation(startPx.value, e.translationX, spanPx);
          dragPx.value = next;
          zoomShared.value = zoomForPosition(next, detents);
          syncDetentHighlight(next);
        })
        .onEnd(() => {
          const snapStop = nearestDetent(dragPx.value, detents, SNAP_TOLERANCE_PX);
          if (snapStop !== null) {
            const snapPx = positionForStop(snapStop, detents);
            if (snapPx !== null) {
              dragPx.value = withTiming(snapPx, { duration: 160 });
              zoomShared.value = withTiming(zoomForPosition(snapPx, detents), {
                duration: 160,
              });
            }
            lastCrossStop.current = snapStop;
            setHighlightStop(snapStop);
            commitRelease(snapStop);
          }
        })
        .onFinalize(() => {
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
      commitRelease,
      syncDetentHighlight,
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
      zoomShared.value = withTiming(zoomForPosition(px, detents), { duration: 160 });
      lastCrossStop.current = stop;
      setHighlightStop(stop);
      onPickFocalStop(stop);
    },
    [interactive, detents, onPickFocalStop, dragPx, zoomShared]
  );

  if (detents.length === 0 && !showAutoBtn) return null;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
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
});
