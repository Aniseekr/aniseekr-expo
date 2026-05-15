import { useCallback, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { ThemedText } from '../../../themed';
import { useTheme } from '../../../../context/ThemeContext';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';

// EV side-effect is wired by parent — chip only manages UI state.
interface ExposureChipProps {
  value: number;
  /** When true, the scrub panel opens to the LEFT of the chip (right-edge dock). */
  isLandscape?: boolean;
  onChange: (next: number) => void;
}

const EV_MIN = -2;
const EV_MAX = 2;
const EV_RANGE = EV_MAX - EV_MIN;
const TICKS = [-2, -1, 0, 1, 2];
const SNAP_HYSTERESIS = 0.1;
const SCRUB_WIDTH = 280;
const SCRUB_PADDING = 16;
const TRACK_WIDTH_DEFAULT = SCRUB_WIDTH - SCRUB_PADDING * 2;

function formatEV(v: number): string {
  if (v === 0) return 'EV 0';
  return v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1);
}

export default function ExposureChip({ value, isLandscape = false, onChange }: ExposureChipProps) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [trackWidth, setTrackWidth] = useState(TRACK_WIDTH_DEFAULT);

  const liveValue = useSharedValue(value);
  const startValue = useSharedValue(value);
  const lastSnappedInt = useSharedValue<number | null>(null);
  const trackWidthSV = useSharedValue(TRACK_WIDTH_DEFAULT);

  const indicatorColor = value === 0 ? theme.status.success : theme.accent;

  const commit = useCallback(
    (next: number) => {
      const clamped = Math.max(EV_MIN, Math.min(EV_MAX, next));
      onChange(Number(clamped.toFixed(1)));
    },
    [onChange]
  );

  const toggleExpanded = useCallback(() => {
    hapticsBridge.selection();
    setExpanded((prev) => {
      if (!prev) {
        liveValue.value = value;
        lastSnappedInt.value = Number.isInteger(value) ? value : null;
      }
      return !prev;
    });
  }, [value, liveValue, lastSnappedInt]);

  const handleLongPress = useCallback(() => {
    if (value === 0) return;
    hapticsBridge.tap();
    liveValue.value = 0;
    lastSnappedInt.value = 0;
    commit(0);
  }, [value, commit, liveValue, lastSnappedInt]);

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
    <View style={styles.wrap}>
      {expanded ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={toggleExpanded}
          accessibilityRole="button"
          accessibilityLabel="Close exposure dial"
        />
      ) : null}

      <Pressable
        onPress={toggleExpanded}
        onLongPress={handleLongPress}
        delayLongPress={300}
        accessibilityRole="adjustable"
        accessibilityLabel={`Exposure ${formatEV(value)}`}
        accessibilityState={{ expanded }}
        accessibilityValue={{ min: EV_MIN, max: EV_MAX, now: value }}
        style={({ pressed }) => [
          styles.chip,
          { borderColor: theme.glassBorder },
          pressed && { opacity: 0.75 },
        ]}>
        <Ionicons name="sunny-outline" size={16} color="#fff" />
        <ThemedText variant="caption" weight="600" style={styles.text}>
          {formatEV(value)}
        </ThemedText>
      </Pressable>

      {expanded ? (
        <View
          style={[
            styles.panel,
            isLandscape && styles.panelLandscape,
            { borderColor: theme.glassBorder },
          ]}>

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
      ) : null}
    </View>
  );
}

// rgba scrim sits over live camera — no theme surface below.
const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  chip: {
    height: 44, width: 80, borderRadius: 22, paddingHorizontal: 12, gap: 6, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  text: { color: '#fff' },
  // Panel opens BELOW the chip in portrait. In landscape the dock is a narrow
  // right-edge column, so we anchor the panel to the LEFT (right: 0 relative
  // to the chip) so the scrubber doesn't overflow under the ShutterRow rail.
  // Caller passes `isLandscape` and we swap `left` ↔ `right`.
  panel: {
    position: 'absolute', top: 52, left: 0,
    width: SCRUB_WIDTH, paddingVertical: 8, paddingHorizontal: SCRUB_PADDING,
    borderRadius: 16, borderWidth: 1, gap: 6, backgroundColor: 'rgba(0,0,0,0.55)',
  },
  panelLandscape: {
    left: undefined,
    right: 52,
    top: 0,
  },
  trackArea: { height: 32, justifyContent: 'center' },
  trackLine: { height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.35)' },
  tickHit: {
    position: 'absolute', top: 0, bottom: 0, width: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  tickMark: { width: 2, height: 10, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.6)' },
  indicator: { position: 'absolute', top: 0, bottom: 0, left: -1, width: 2, borderRadius: 1 },
});
