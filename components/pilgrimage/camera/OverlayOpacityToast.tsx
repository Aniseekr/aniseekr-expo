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

/**
 * A fresh object identity each time the user cycles overlay opacity re-triggers
 * the toast — `null` until the first change so nothing shows on mount.
 */
export interface OverlayOpacityToastValue {
  opacity: number;
}

const VISIBLE_MS = 1500;
const FADE_IN_MS = 200;
const FADE_OUT_MS = 280;

interface OverlayOpacityToastProps {
  /** `null` until the first opacity change; a fresh object each change re-fires. */
  toast: OverlayOpacityToastValue | null;
  themeColor: string;
}

/**
 * Brief, non-interactive toast naming the overlay blend level after the user
 * cycles it from the top bar. It auto-fades — the quick cycle button has no
 * permanent caption, so this is the moment of feedback that confirms the new
 * opacity.
 */
export default function OverlayOpacityToast({ toast, themeColor }: OverlayOpacityToastProps) {
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

  return (
    <Animated.View pointerEvents="none" style={[styles.toast, animatedStyle]}>
      <View style={[styles.iconBadge, { backgroundColor: themeColor }]}>
        <Ionicons name="layers-outline" size={15} color={readableTextOn(themeColor)} />
      </View>
      <ThemedText variant="caption" weight="700" style={styles.label}>
        {`疊圖 ${Math.round(toast.opacity * 100)}%`}
      </ThemedText>
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
  label: { color: '#fff' },
});
