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

export interface CamSwitchToastValue {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
}

interface CamSwitchToastProps {
  /** Fresh object identity on each switch re-fires the animation. Null = never shown. */
  toast: CamSwitchToastValue | null;
  themeColor: string;
}

const VISIBLE_MS = 1400;
const FADE_MS = 200;

/**
 * Generic floating pill that briefly confirms a button-tap switch.
 * Floats above the bottom controls, auto-fades after VISIBLE_MS.
 * rgba chrome — sits over the live camera preview (camera-scrim exception).
 */
export default function CamSwitchToast({ toast, themeColor }: CamSwitchToastProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(10);

  useEffect(() => {
    if (!toast) return;
    opacity.value = withSequence(
      withTiming(1, { duration: FADE_MS }),
      withDelay(VISIBLE_MS, withTiming(0, { duration: FADE_MS }))
    );
    translateY.value = withSequence(
      withTiming(0, { duration: FADE_MS }),
      withDelay(VISIBLE_MS, withTiming(10, { duration: FADE_MS }))
    );
  }, [toast, opacity, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!toast) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.pill, animStyle]}>
      <View style={[styles.iconBadge, { backgroundColor: themeColor }]}>
        <Ionicons name={toast.icon} size={14} color={readableTextOn(themeColor)} />
      </View>
      <View style={styles.textWrap}>
        <ThemedText
          variant="captionSmall"
          weight="700"
          style={[styles.label, { color: themeColor }]}>
          {toast.label.toUpperCase()}
        </ThemedText>
        {toast.hint ? (
          <ThemedText variant="captionSmall" weight="500" style={styles.hint}>
            {toast.hint}
          </ThemedText>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(0,0,0,0.84)',
  },
  iconBadge: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { gap: 1 },
  label: { letterSpacing: 0.8 },
  hint: { color: 'rgba(255,255,255,0.75)' },
});
