// Segmented pill mode selector. Theme-aware indicator fill, optional icons per
// segment, and a press-scale micro-interaction. The active segment auto-picks
// readable text on top of `accentColor` so light accents (gold, pastel cyan)
// stay legible.

import { memo, useEffect } from 'react';
import { View, Text, Pressable, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, FontFamily, Radius, Shadow } from '../../constants/DesignSystem';
import { readableTextOn } from '../themed';

type IconName = keyof typeof Ionicons.glyphMap;

export type ModeSelectorOption<T extends string = string> = {
  value: T;
  label: string;
  icon?: IconName;
};

interface ModeSelectorProps<T extends string = string> {
  options: readonly ModeSelectorOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Outer horizontal margin used to compute indicator width. */
  horizontalMargin?: number;
  /** Indicator fill colour. Defaults to brand primary. */
  accentColor?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PILL_INNER_PADDING = 6;
const PILL_HEIGHT = 50;
const INDICATOR_INSET = 4;
const SPRING = { damping: 22, stiffness: 240, mass: 0.7 } as const;
const PRESS_IN_SPRING = { damping: 16, stiffness: 320 } as const;
const PRESS_OUT_SPRING = { damping: 14, stiffness: 280 } as const;

function ModeSelectorComponent<T extends string = string>({
  options,
  value,
  onChange,
  horizontalMargin = 16,
  accentColor = Colors.primary,
}: ModeSelectorProps<T>) {
  const { width: screenWidth } = useWindowDimensions();
  const innerWidth = Math.max(0, screenWidth - horizontalMargin * 2 - PILL_INNER_PADDING * 2);
  const segmentWidth = options.length > 0 ? innerWidth / options.length : 0;
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );

  const activeFg = readableTextOn(accentColor);

  const translateX = useSharedValue(activeIndex * segmentWidth);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    translateX.value = withSpring(activeIndex * segmentWidth, SPRING);
  }, [activeIndex, segmentWidth, translateX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { scale: pressScale.value }],
    width: segmentWidth - INDICATOR_INSET * 2,
  }));

  const handlePressIn = () => {
    pressScale.value = withSpring(0.97, PRESS_IN_SPRING);
  };
  const handlePressOut = () => {
    pressScale.value = withSpring(1, PRESS_OUT_SPRING);
  };

  return (
    <View style={[styles.pill, { borderRadius: Radius.tabBar }]}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={40} tint="systemThickMaterialDark" style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={styles.pillBackground} pointerEvents="none" />
      <View style={[styles.pillBorder, { borderRadius: Radius.tabBar }]} pointerEvents="none" />

      <View style={styles.row}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            { backgroundColor: accentColor, ...Shadow.glow(accentColor) },
            indicatorStyle,
          ]}
        />
        {options.map((option, index) => (
          <Segment
            key={option.value}
            option={option}
            isActive={option.value === value}
            activeFg={activeFg}
            index={index}
            translateX={translateX}
            segmentWidth={segmentWidth}
            onPress={() => onChange(option.value)}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
          />
        ))}
      </View>
    </View>
  );
}

interface SegmentProps {
  option: ModeSelectorOption;
  isActive: boolean;
  activeFg: string;
  index: number;
  translateX: SharedValue<number>;
  segmentWidth: number;
  onPress: () => void;
  onPressIn: () => void;
  onPressOut: () => void;
}

function Segment({
  option,
  isActive,
  activeFg,
  index,
  translateX,
  segmentWidth,
  onPress,
  onPressIn,
  onPressOut,
}: SegmentProps) {
  // Derive a 0→1 progress from the indicator's distance to this segment so the
  // label/icon colour and opacity blend smoothly as the indicator slides across,
  // rather than snapping when activeIndex changes.
  const progress = useDerivedValue(() => {
    if (segmentWidth <= 0) return 0;
    const center = index * segmentWidth;
    const distance = Math.abs(translateX.value - center);
    return Math.max(0, Math.min(1, 1 - distance / segmentWidth));
  });

  const iconStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + progress.value * 0.45,
    transform: [{ scale: 0.9 + progress.value * 0.1 }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.value,
      [0, 1],
      [Colors.text.secondary, activeFg]
    ),
  }));

  const arrowStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateX: (progress.value - 1) * -6 }],
  }));

  // Icon color is animated separately because Ionicons doesn't accept an
  // Animated value for `color`. We render two stacked icons and cross-fade.
  const inactiveIconWrap = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
  }));
  const activeIconWrap = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={styles.segment}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={`${option.label} mode`}>
      {option.icon ? (
        <View style={styles.iconWrap}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.iconCenter, inactiveIconWrap]}>
            <Ionicons name={option.icon} size={16} color={Colors.text.tertiary} />
          </Animated.View>
          <Animated.View style={[styles.iconCenter, iconStyle, activeIconWrap]}>
            <Ionicons name={option.icon} size={16} color={activeFg} />
          </Animated.View>
        </View>
      ) : null}
      <Animated.Text style={[styles.label, labelStyle]} allowFontScaling={false}>
        {option.label}
      </Animated.Text>
      <Animated.View style={[styles.arrow, arrowStyle]} pointerEvents="none">
        <Ionicons name="arrow-forward" size={13} color={activeFg} />
      </Animated.View>
    </AnimatedPressable>
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
    backgroundColor: 'rgba(20,20,22,0.72)',
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
    top: INDICATOR_INSET,
    bottom: INDICATOR_INSET,
    left: INDICATOR_INSET,
    borderRadius: Radius.tabActive,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  iconWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: FontFamily.rounded,
    letterSpacing: 0.2,
  },
  arrow: {
    marginLeft: 2,
  },
});

export const ModeSelector = memo(ModeSelectorComponent) as typeof ModeSelectorComponent;
