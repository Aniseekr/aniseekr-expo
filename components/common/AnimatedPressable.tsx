import React, { ReactNode } from 'react';
import { Pressable, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

interface AnimatedPressableProps {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  disabled?: boolean;
  hapticFeedback?: boolean;
}

export function AnimatedPressable({
  children,
  onPress,
  style,
  disabled = false,
  hapticFeedback = true,
}: AnimatedPressableProps) {
  const scale = useSharedValue(1);

  const pressIn = () => {
    'worklet';
    if (!disabled) {
      scale.value = withSpring(0.94, {
        damping: 15,
        stiffness: 300,
        mass: 0.5,
      });
      if (hapticFeedback) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  const pressOut = () => {
    'worklet';
    if (!disabled) {
      scale.value = withSpring(1, {
        damping: 10,
        stiffness: 300,
      });
    }
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[style, animatedStyle]}>
      <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} disabled={disabled}>
        {children}
      </Pressable>
    </Animated.View>
  );
}
