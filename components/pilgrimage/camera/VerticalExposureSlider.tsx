import { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { ThemedText } from '../../themed';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { CameraChrome, cameraControlShadow } from './cameraChrome';

const EV_MIN = -2;
const EV_MAX = 2;
const EV_RANGE = EV_MAX - EV_MIN;
const TRACK_HEIGHT = 132;
const THUMB = 18;
// How close to an integer EV counts as "snapped" — fires a tick haptic + commit.
const SNAP_HYSTERESIS = 0.12;

/** Formats an EV value for the drag readout. EV 0 reads as the neutral label. */
export function formatEV(value: number): string {
  if (value === 0) return 'EV 0';
  return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

/** Maps a touch Y within the track (0 = top) to an EV value (top = brightest). */
function evFromY(y: number): number {
  'worklet';
  const clampedY = Math.max(0, Math.min(TRACK_HEIGHT, y));
  const ev = EV_MAX - (clampedY / TRACK_HEIGHT) * EV_RANGE;
  return Math.max(EV_MIN, Math.min(EV_MAX, ev));
}

interface VerticalExposureSliderProps {
  /** Current EV (−2..+2). */
  value: number;
  themeColor: string;
  onChange: (next: number) => void;
}

/**
 * The exposure compensation control — a vertical slider pinned to a screen
 * edge: sun (brighter) at the top, moon (darker) at the bottom. Dragging the
 * track writes the live EV on the UI thread and only commits to React state on
 * an integer snap or on release, so the drag never re-renders the screen.
 *
 * rgba / #fff chrome is allowed — it floats over the live camera preview, not
 * a theme surface (CLAUDE.md camera-scrim exception).
 */
export default function VerticalExposureSlider({
  value,
  themeColor,
  onChange,
}: VerticalExposureSliderProps) {
  const liveValue = useSharedValue(value);
  const lastSnappedInt = useSharedValue<number | null>(Number.isInteger(value) ? value : null);
  const dragging = useSharedValue(false);

  // Re-sync the live value when EV is changed from OUTSIDE this control (e.g.
  // the AF-lock exposure bar). Skipped mid-drag so it can't fight the gesture.
  useEffect(() => {
    if (!dragging.value) liveValue.value = value;
  }, [value, dragging, liveValue]);

  const commit = useCallback(
    (next: number) => {
      const clamped = Math.max(EV_MIN, Math.min(EV_MAX, next));
      onChange(Number(clamped.toFixed(1)));
    },
    [onChange]
  );

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      dragging.value = true;
      const next = evFromY(e.y);
      liveValue.value = next;
      lastSnappedInt.value = Number.isInteger(next) ? next : null;
    })
    .onUpdate((e) => {
      const next = evFromY(e.y);
      liveValue.value = next;
      const nearestInt = Math.round(next);
      if (Math.abs(next - nearestInt) <= SNAP_HYSTERESIS) {
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
    })
    .onFinalize(() => {
      dragging.value = false;
    });

  // Thumb sits on the value point; translateY measured from the track top.
  const thumbStyle = useAnimatedStyle(() => {
    const ratio = (EV_MAX - liveValue.value) / EV_RANGE;
    return { transform: [{ translateY: ratio * TRACK_HEIGHT - THUMB / 2 }] };
  });

  // Themed fill from the neutral centre (EV 0) to the thumb — shows the offset.
  const fillStyle = useAnimatedStyle(() => {
    const centre = TRACK_HEIGHT / 2;
    const thumbY = ((EV_MAX - liveValue.value) / EV_RANGE) * TRACK_HEIGHT;
    return { top: Math.min(centre, thumbY), height: Math.abs(thumbY - centre) };
  });

  return (
    <View style={styles.root}>
      <Ionicons name="sunny" size={16} color={themeColor} />
      <GestureDetector gesture={pan}>
        <View style={styles.track} hitSlop={14}>
          <View style={styles.trackLine} />
          <Animated.View
            pointerEvents="none"
            style={[styles.fill, { backgroundColor: themeColor }, fillStyle]}
          />
          <Animated.View pointerEvents="none" style={[styles.thumbRow, thumbStyle]}>
            {value !== 0 ? (
              <View style={styles.valueChip}>
                <ThemedText variant="captionSmall" weight="700" style={styles.valueText}>
                  {formatEV(value)}
                </ThemedText>
              </View>
            ) : null}
            <View style={[styles.thumb, { backgroundColor: themeColor }]} />
          </Animated.View>
        </View>
      </GestureDetector>
      <Ionicons name="moon" size={15} color={CameraChrome.fgMuted} />
    </View>
  );
}

const styles = StyleSheet.create({
  // rgba / #fff over the live camera preview — camera-scrim exception (CLAUDE.md).
  root: {
    alignItems: 'center',
    gap: 8,
  },
  track: {
    width: 30,
    height: TRACK_HEIGHT,
    alignItems: 'center',
  },
  trackLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: CameraChrome.border,
  },
  fill: {
    position: 'absolute',
    width: 4,
    borderRadius: 2,
  },
  thumbRow: {
    position: 'absolute',
    top: 0,
    height: THUMB,
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 2,
    borderColor: '#fff',
    ...cameraControlShadow,
  },
  // Sits to the left of the thumb; overflows the narrow track, which is fine —
  // the slider is edge-anchored so the chip opens into the screen.
  valueChip: {
    position: 'absolute',
    right: THUMB + 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderWidth: 1,
    borderColor: CameraChrome.border,
  },
  valueText: { color: '#fff' },
});
