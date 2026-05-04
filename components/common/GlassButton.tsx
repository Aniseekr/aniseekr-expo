import { memo, ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Colors, Radius } from '../../constants/DesignSystem';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

interface GlassButtonProps {
  size?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  children: ReactNode;
  highlightColor?: string;
  isActive?: boolean;
  disabled?: boolean;
  intensity?: number;
  haptic?: 'light' | 'medium' | 'heavy' | 'selection' | 'tap' | 'none';
  style?: ViewStyle;
  shape?: 'circle' | 'pill';
  innerPadding?: number;
}

function GlassButtonComponent({
  size = 50,
  onPress,
  onLongPress,
  children,
  highlightColor,
  isActive = false,
  disabled = false,
  intensity = 30,
  haptic = 'light',
  style,
  shape = 'circle',
  innerPadding,
}: GlassButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.92, { damping: 12, stiffness: 350 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 12, stiffness: 350 });
  };
  const handlePress = () => {
    if (haptic === 'none') return onPress?.();
    if (haptic === 'selection') hapticsBridge.selection();
    else if (haptic === 'tap') hapticsBridge.tap();
    else hapticsBridge.impact(haptic);
    onPress?.();
  };

  const radius = shape === 'circle' ? size / 2 : Radius.full;
  const padding = innerPadding ?? (shape === 'circle' ? 0 : 12);

  const tintColor = isActive ? (highlightColor ?? Colors.primary) + 'CC' : Colors.glass.medium;
  const borderColor = isActive ? (highlightColor ?? Colors.primary) : Colors.glass.border;

  return (
    <Animated.View style={[animatedStyle, { borderRadius: radius }, style]}>
      <Pressable
        onPress={handlePress}
        onLongPress={onLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={({ pressed }) => [
          styles.base,
          {
            width: shape === 'circle' ? size : undefined,
            height: shape === 'circle' ? size : undefined,
            minHeight: shape === 'pill' ? size : undefined,
            borderRadius: radius,
            paddingHorizontal: padding,
            opacity: disabled ? 0.4 : pressed ? 0.92 : 1,
          },
        ]}>
        {Platform.OS === 'ios' ? (
          <BlurView
            intensity={intensity}
            tint="systemThickMaterialDark"
            style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
          />
        ) : null}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: tintColor,
              borderRadius: radius,
              borderWidth: 1,
              borderColor,
            },
          ]}
          pointerEvents="none"
        />
        <View style={styles.content}>{children}</View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
    }),
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    zIndex: 1,
  },
});

export const GlassButton = memo(GlassButtonComponent);
