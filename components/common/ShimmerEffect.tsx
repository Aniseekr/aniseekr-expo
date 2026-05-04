import { memo, useEffect } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Radius } from '../../constants/DesignSystem';

interface ShimmerEffectProps {
  width?: number | `${number}%`;
  height?: number | `${number}%`;
  borderRadius?: number;
  style?: ViewStyle;
  duration?: number;
  intensity?: 'low' | 'medium' | 'high';
}

const INTENSITY_COLORS: Record<'low' | 'medium' | 'high', [string, string, string]> = {
  low: ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.04)'],
  medium: ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.18)', 'rgba(255,255,255,0.06)'],
  high: ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.28)', 'rgba(255,255,255,0.10)'],
};

function ShimmerEffectComponent({
  width = '100%',
  height = 16,
  borderRadius = Radius.sm,
  style,
  duration = 1400,
  intensity = 'medium',
}: ShimmerEffectProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
  }, [duration, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: -200 + progress.value * 400,
      },
    ],
  }));

  return (
    <View
      style={[
        styles.container,
        { width: width as any, height: height as any, borderRadius },
        style,
      ]}>
      <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
        <LinearGradient
          colors={INTENSITY_COLORS[intensity]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
});

export const ShimmerEffect = memo(ShimmerEffectComponent);
