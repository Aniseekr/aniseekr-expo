// Three-segment pill mode selector matching the iOS PillTabBar style.
// Outer pill is glass; the active item gets a capsule indicator using `Colors.primary`.

import { memo, useEffect } from 'react';
import { View, Text, Pressable, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Colors, FontFamily, Radius, Shadow } from '../../constants/DesignSystem';

export type ModeSelectorOption<T extends string = string> = {
  value: T;
  label: string;
};

interface ModeSelectorProps<T extends string = string> {
  options: readonly ModeSelectorOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Outer horizontal margin used to compute indicator width. */
  horizontalMargin?: number;
}

const PILL_INNER_PADDING = 6;
const PILL_HEIGHT = 50;

function ModeSelectorComponent<T extends string = string>({
  options,
  value,
  onChange,
  horizontalMargin = 16,
}: ModeSelectorProps<T>) {
  const { width: screenWidth } = useWindowDimensions();
  const innerWidth = Math.max(0, screenWidth - horizontalMargin * 2 - PILL_INNER_PADDING * 2);
  const segmentWidth = options.length > 0 ? innerWidth / options.length : 0;
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );

  const translateX = useSharedValue(activeIndex * segmentWidth);

  // Drive indicator with spring whenever the active index changes.
  useEffect(() => {
    translateX.value = withSpring(activeIndex * segmentWidth, {
      damping: 18,
      stiffness: 220,
    });
  }, [activeIndex, segmentWidth, translateX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: segmentWidth,
  }));

  return (
    <View style={[styles.pill, { borderRadius: Radius.tabBar }]}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={styles.pillBackground} pointerEvents="none" />
      <View style={[styles.pillBorder, { borderRadius: Radius.tabBar }]} pointerEvents="none" />

      <View style={styles.row}>
        <Animated.View
          pointerEvents="none"
          style={[styles.indicator, indicatorStyle]}
        />
        {options.map((option) => {
          const isActive = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              style={styles.segment}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}>
              <Text
                style={[
                  styles.label,
                  isActive ? styles.labelActive : styles.labelInactive,
                ]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: PILL_HEIGHT,
    paddingHorizontal: PILL_INNER_PADDING,
    overflow: 'hidden',
    ...Shadow.subtle,
  },
  pillBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28,28,30,0.65)',
  },
  pillBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
  },
  indicator: {
    position: 'absolute',
    top: PILL_INNER_PADDING - 2,
    bottom: PILL_INNER_PADDING - 2,
    left: 0,
    borderRadius: Radius.tabActive,
    backgroundColor: Colors.primary,
    ...Shadow.glow(Colors.primary),
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: FontFamily.rounded,
    letterSpacing: 0.1,
  },
  labelActive: {
    color: '#0A0A0A',
  },
  labelInactive: {
    color: Colors.text.secondary,
  },
});

export const ModeSelector = memo(ModeSelectorComponent) as typeof ModeSelectorComponent;
