import { useCallback, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { ThemedText } from '../../../themed';
import { useTheme } from '../../../../context/ThemeContext';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';

// EV side-effect is wired by parent — this block only manages scrub UI state.
interface ExposureControlsProps {
  value: number;
  onChange: (next: number) => void;
}

const EV_MIN = -2;
const EV_MAX = 2;
const EV_RANGE = EV_MAX - EV_MIN;
const TICKS = [-2, -1, 0, 1, 2];
const SNAP_HYSTERESIS = 0.1;

export function formatEV(v: number): string {
  if (v === 0) return 'EV 0';
  return v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1);
}

/**
 * Exposure tool controls — a tick track the user drags to set EV. Renders flat
 * in normal flow (no chip, no absolute pop-out); the camera screen's exposure
 * panel mounts it, so the track just measures and fills the panel width.
 */
export default function ExposureControls({ value, onChange }: ExposureControlsProps) {
  const { theme } = useTheme();
  const [trackWidth, setTrackWidth] = useState(1);

  const liveValue = useSharedValue(value);
  const startValue = useSharedValue(value);
  const lastSnappedInt = useSharedValue<number | null>(Number.isInteger(value) ? value : null);
  const trackWidthSV = useSharedValue(1);

  const indicatorColor = value === 0 ? theme.status.success : theme.accent;

  const commit = useCallback(
    (next: number) => {
      const clamped = Math.max(EV_MIN, Math.min(EV_MAX, next));
      onChange(Number(clamped.toFixed(1)));
    },
    [onChange]
  );

  const handleTickPress = useCallback(
    (tick: number) => {
      hapticsBridge.selection();
      liveValue.value = tick;
      lastSnappedInt.value = tick;
      commit(tick);
    },
    [commit, liveValue, lastSnappedInt]
  );

  const onTrackLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width;
      if (w > 0) {
        trackWidthSV.value = w;
        setTrackWidth(w);
      }
    },
    [trackWidthSV]
  );

  const panGesture = Gesture.Pan()
    // Only claim horizontal drags so a vertical scroll of the panel still works.
    .activeOffsetX([-8, 8])
    .onStart(() => {
      startValue.value = liveValue.value;
      lastSnappedInt.value = Number.isInteger(liveValue.value) ? liveValue.value : null;
    })
    .onUpdate((e) => {
      const width = trackWidthSV.value || 1;
      const delta = (e.translationX / width) * EV_RANGE;
      const raw = startValue.value + delta;
      const next = Math.max(EV_MIN, Math.min(EV_MAX, raw));
      liveValue.value = next;
      const nearestInt = Math.round(next);
      if (Math.abs(next - nearestInt) <= SNAP_HYSTERESIS) {
        // Snap-only haptic + commit: fire once per integer crossing.
        if (lastSnappedInt.value !== nearestInt) {
          lastSnappedInt.value = nearestInt;
          runOnJS(hapticsBridge.selection)();
          runOnJS(commit)(nearestInt);
        }
      } else if (
        lastSnappedInt.value !== null &&
        Math.abs(next - lastSnappedInt.value) > SNAP_HYSTERESIS
      ) {
        lastSnappedInt.value = null;
      }
    })
    .onEnd(() => {
      const v = liveValue.value;
      const nearestInt = Math.round(v);
      const snapped =
        Math.abs(v - nearestInt) <= SNAP_HYSTERESIS ? nearestInt : Number(v.toFixed(1));
      liveValue.value = snapped;
      runOnJS(commit)(snapped);
    });

  const indicatorStyle = useAnimatedStyle(() => {
    const ratio = (liveValue.value - EV_MIN) / EV_RANGE;
    return { transform: [{ translateX: ratio * (trackWidthSV.value || 1) }] };
  });

  return (
    <View style={styles.root}>
      <GestureDetector gesture={panGesture}>
        <View style={styles.trackArea} onLayout={onTrackLayout}>
          <View style={styles.trackLine} />
          {TICKS.map((tick) => (
            <Pressable
              key={tick}
              onPress={() => handleTickPress(tick)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={`Set exposure ${formatEV(tick)}`}
              style={[styles.tickHit, { left: ((tick - EV_MIN) / EV_RANGE) * trackWidth - 12 }]}>
              <View style={styles.tickMark} />
            </Pressable>
          ))}
          <Animated.View
            pointerEvents="none"
            style={[styles.indicator, { backgroundColor: indicatorColor }, indicatorStyle]}
          />
        </View>
      </GestureDetector>
      <ThemedText variant="caption" weight="700" align="center" style={styles.text}>
        {formatEV(value)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8, paddingHorizontal: 12, paddingVertical: 4 },
  trackArea: { height: 32, justifyContent: 'center' },
  trackLine: { height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.35)' },
  tickHit: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickMark: { width: 2, height: 10, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.6)' },
  indicator: { position: 'absolute', top: 0, bottom: 0, left: -1, width: 2, borderRadius: 1 },
  text: { color: '#fff' },
});
