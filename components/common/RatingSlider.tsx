import { memo, useEffect } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Radius } from '../../constants/DesignSystem';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { useTheme } from '../../context/ThemeContext';

interface RatingSliderProps {
  value: number; // 0-10
  onChange: (value: number) => void;
  width: number;
  height?: number;
  step?: number;
  min?: number;
  max?: number;
  style?: ViewStyle;
}

function RatingSliderComponent({
  value,
  onChange,
  width,
  height = 56,
  step = 0.5,
  min = 0,
  max = 10,
  style,
}: RatingSliderProps) {
  const { theme } = useTheme();
  const offsetX = useSharedValue(0);
  const lastInteger = useSharedValue(Math.round(value));
  const trackPad = 24;
  const innerWidth = width - trackPad * 2;

  useEffect(() => {
    const ratio = (value - min) / (max - min);
    offsetX.value = withSpring(ratio * innerWidth, { damping: 18, stiffness: 200 });
    lastInteger.value = Math.round(value);
  }, [value, innerWidth, max, min, offsetX, lastInteger]);

  const triggerHaptic = () => {
    hapticsBridge.selection();
  };

  const updateValue = (raw: number) => {
    const ratio = Math.min(1, Math.max(0, raw / innerWidth));
    const v = min + ratio * (max - min);
    const stepped = Math.round(v / step) * step;
    onChange(Number(stepped.toFixed(2)));
  };

  const pan = Gesture.Pan()
    .onBegin((e) => {
      offsetX.value = Math.min(innerWidth, Math.max(0, e.x - trackPad));
      runOnJS(updateValue)(offsetX.value);
    })
    .onUpdate((e) => {
      const x = Math.min(innerWidth, Math.max(0, e.x - trackPad));
      offsetX.value = x;
      const currentInt = Math.round((x / innerWidth) * (max - min) + min);
      if (currentInt !== lastInteger.value) {
        lastInteger.value = currentInt;
        runOnJS(triggerHaptic)();
      }
      runOnJS(updateValue)(x);
    })
    .onEnd(() => {
      runOnJS(triggerHaptic)();
    });

  const fillStyle = useAnimatedStyle(() => ({
    width: offsetX.value + trackPad,
  }));

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.container, { width, height }, style]}>
        <View style={[styles.track, { backgroundColor: theme.background.tertiary }]} />
        <Animated.View style={[styles.fill, { left: 0, top: (height - 12) / 2 }, fillStyle]}>
          <LinearGradient
            colors={[theme.accent, theme.accentLight] as [string, string]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.knob,
            {
              top: (height - 28) / 2,
              left: trackPad - 14,
              backgroundColor: '#fff',
              borderColor: theme.accent,
            },
            knobStyle,
          ]}
        />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 6,
    top: '50%',
    marginTop: -3,
    borderRadius: Radius.full,
  },
  fill: {
    position: 'absolute',
    height: 12,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  knob: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    shadowColor: Colors.background.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
});

export const RatingSlider = memo(RatingSliderComponent);
