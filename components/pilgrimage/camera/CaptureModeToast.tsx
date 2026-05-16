import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { readableTextOn, ThemedText } from '../../themed';
import type { CaptureMode } from '../../../hooks/useCameraSettings';

/**
 * A fresh object identity each time the user cycles capture mode re-triggers
 * the toast — `null` until the first change so nothing shows on mount.
 */
export interface CaptureModeToastValue {
  mode: CaptureMode;
}

interface ModeCopy {
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
}

// Frame counts are the real values the capture hooks use. Android may use
// CameraX HDR extension instead of the pseudo-HDR stack when the device
// reports it, so HDR copy is resolved at render time.
const MODE_COPY: Record<CaptureMode, ModeCopy> = {
  single: { label: 'Photo', hint: 'One sharp shot', icon: 'camera-outline' },
  burst: {
    label: 'Burst',
    hint: 'Captures 6 frames, keeps the sharpest',
    icon: 'albums-outline',
  },
  hdr: {
    label: 'HDR',
    hint: 'Blends 3 exposures for high-contrast scenes',
    icon: 'contrast-outline',
  },
};

const VISIBLE_MS = 1500;
const FADE_IN_MS = 200;
const FADE_OUT_MS = 280;

interface CaptureModeToastProps {
  /** `null` until the first mode change; a fresh object each change re-fires. */
  toast: CaptureModeToastValue | null;
  themeColor: string;
  nativeHdrActive?: boolean;
}

/**
 * Brief, non-interactive toast naming the capture mode after the user cycles
 * it from the top bar. It auto-fades — capture mode no longer keeps a
 * permanent caption near the shutter, so this is the moment of feedback that
 * tells the user what the next shutter press will do.
 */
export default function CaptureModeToast({
  toast,
  themeColor,
  nativeHdrActive = false,
}: CaptureModeToastProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(8);

  useEffect(() => {
    if (!toast) return;
    opacity.value = withSequence(
      withTiming(1, { duration: FADE_IN_MS }),
      withDelay(VISIBLE_MS, withTiming(0, { duration: FADE_OUT_MS }))
    );
    translateY.value = withSequence(
      withTiming(0, { duration: FADE_IN_MS }),
      withDelay(VISIBLE_MS, withTiming(8, { duration: FADE_OUT_MS }))
    );
  }, [toast, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!toast) return null;
  const copy =
    toast.mode === 'hdr' && nativeHdrActive
      ? {
          ...MODE_COPY.hdr,
          hint: 'Uses Android native HDR when available',
        }
      : MODE_COPY[toast.mode];

  return (
    <Animated.View pointerEvents="none" style={[styles.toast, animatedStyle]}>
      <View style={[styles.iconBadge, { backgroundColor: themeColor }]}>
        <Ionicons name={copy.icon} size={15} color={readableTextOn(themeColor)} />
      </View>
      <View style={styles.text}>
        <ThemedText
          variant="captionSmall"
          weight="700"
          style={[styles.label, { color: themeColor }]}>
          {copy.label.toUpperCase()}
        </ThemedText>
        <ThemedText variant="caption" weight="600" style={styles.hint}>
          {copy.hint}
        </ThemedText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // rgba scrim over the live camera preview — no theme surface below it
  // (CLAUDE.md camera-scrim exception).
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: '92%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flexShrink: 1, gap: 1 },
  label: { letterSpacing: 1 },
  hint: { color: '#fff' },
});
