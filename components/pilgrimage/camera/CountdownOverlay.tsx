import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ThemedText } from '../../themed';

export interface CountdownOverlayProps {
  remaining: number | null; // null = not shown
  themeColor: string;
  onCancel: () => void; // tap anywhere
}

const POP_FROM_SCALE = 1.3;
const POP_TO_SCALE = 1;
const OPACITY_DURATION_MS = 160;
const SPRING_CONFIG = { damping: 12, stiffness: 180, mass: 0.6 };

export function CountdownOverlay({ remaining, themeColor: _themeColor, onCancel }: CountdownOverlayProps) {
  if (remaining === null || remaining < 1) return null;
  return <CountdownOverlayInner remaining={remaining} onCancel={onCancel} />;
}

function CountdownOverlayInner({ remaining, onCancel }: { remaining: number; onCancel: () => void }) {
  const scale = useSharedValue(POP_FROM_SCALE);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = POP_FROM_SCALE;
    opacity.value = 0;
    scale.value = withSpring(POP_TO_SCALE, SPRING_CONFIG);
    opacity.value = withTiming(1, { duration: OPACITY_DURATION_MS });
  }, [remaining, scale, opacity]);

  const numberStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={onCancel}
      style={styles.root}
      accessibilityRole="button"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Capture in ${remaining} seconds, tap to cancel`}>
      <View style={styles.center} pointerEvents="none">
        <Animated.Text style={[styles.number, numberStyle]}>{remaining}</Animated.Text>
        <ThemedText variant="bodyMedium" style={styles.hint}>
          Tap to cancel
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: {
    fontSize: 144,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 160,
  },
  hint: {
    color: 'rgba(255,255,255,0.7)',
    marginTop: 12,
  },
});
