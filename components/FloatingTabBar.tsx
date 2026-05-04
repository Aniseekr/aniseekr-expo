import { useEffect, useState } from 'react';
import { View, Platform, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors, Radius, TabBar as TabBarTokens } from '../constants/DesignSystem';

const PILL_HORIZONTAL_MARGIN = 16;
const PILL_INNER_PADDING = 8;
const INDICATOR_INSET = 4;

const SLIDE_SPRING = { damping: 22, stiffness: 240, mass: 0.6 } as const;
const FOCUS_SPRING = { damping: 18, stiffness: 220, mass: 0.5 } as const;
const PRESS_IN_SPRING = { damping: 14, stiffness: 320 } as const;
const PRESS_OUT_SPRING = { damping: 12, stiffness: 280 } as const;

export default function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [tabRowWidth, setTabRowWidth] = useState(0);

  const indicatorX = useSharedValue(0);
  const indicatorOpacity = useSharedValue(0);

  const bottomMargin = Platform.select({
    ios: insets.bottom > 0 ? insets.bottom : 16,
    android: insets.bottom > 0 ? insets.bottom + 12 : 20,
  });

  const isHidden = (options: any) =>
    options?.href === null ||
    (options?.tabBarStyle as any)?.display === 'none' ||
    options?.tabBarButton === null ||
    options?.tabBarVisible === false;

  const visibleRoutes = state.routes.filter((route) => {
    const { options } = descriptors[route.key];
    return !isHidden(options);
  });

  const activeRouteKey = state.routes[state.index]?.key;
  const focusedVisibleIndex = Math.max(
    0,
    visibleRoutes.findIndex((r) => r.key === activeRouteKey)
  );

  const tabCount = visibleRoutes.length;
  const tabWidth = tabCount > 0 ? tabRowWidth / tabCount : 0;

  useEffect(() => {
    if (tabWidth <= 0) {
      indicatorOpacity.value = 0;
      return;
    }
    const target = focusedVisibleIndex * tabWidth;
    if (indicatorOpacity.value === 0) {
      indicatorX.value = target;
      indicatorOpacity.value = withTiming(1, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      indicatorX.value = withSpring(target, SLIDE_SPRING);
    }
  }, [focusedVisibleIndex, tabWidth, indicatorOpacity, indicatorX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: Math.max(0, tabWidth - INDICATOR_INSET * 2),
    opacity: indicatorOpacity.value,
  }));

  const activeOptions = activeRouteKey ? descriptors[activeRouteKey]?.options : undefined;
  if (!activeOptions || isHidden(activeOptions)) {
    return null;
  }

  return (
    <View style={[styles.container, { bottom: bottomMargin }]} pointerEvents="box-none">
      <View style={styles.pill}>
        <BlurView
          intensity={80}
          tint={Platform.OS === 'ios' ? 'systemThickMaterialDark' : 'dark'}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.pillBackground} pointerEvents="none" />
        <View style={styles.pillBorder} pointerEvents="none" />
        <View style={styles.pillInnerBorder} pointerEvents="none" />

        <View style={styles.tabRow} onLayout={(e) => setTabRowWidth(e.nativeEvent.layout.width)}>
          <Animated.View style={[styles.indicator, indicatorStyle]} pointerEvents="none" />
          {visibleRoutes.map((route) => {
            const { options } = descriptors[route.key];
            const realIndex = state.routes.findIndex((r) => r.key === route.key);
            const isFocused = state.index === realIndex;

            const label =
              options.tabBarLabel !== undefined
                ? options.tabBarLabel
                : options.title !== undefined
                  ? options.title
                  : route.name;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                Haptics.selectionAsync().catch(() => undefined);
                navigation.navigate(route.name, route.params);
              }
            };

            const onLongPress = () => {
              navigation.emit({ type: 'tabLongPress', target: route.key });
            };

            return (
              <TabItem
                key={route.key}
                isFocused={isFocused}
                label={typeof label === 'string' ? label : ''}
                onPress={onPress}
                onLongPress={onLongPress}
                renderIcon={options.tabBarIcon}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

interface TabItemProps {
  isFocused: boolean;
  label: string;
  onPress: () => void;
  onLongPress: () => void;
  renderIcon?: (props: { focused: boolean; color: string; size: number }) => React.ReactNode;
}

function TabItem({ isFocused, label, onPress, onLongPress, renderIcon }: TabItemProps) {
  const pressScale = useSharedValue(1);
  const focusProgress = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    focusProgress.value = withSpring(isFocused ? 1 : 0, FOCUS_SPRING);
  }, [isFocused, focusProgress]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const iconWrapStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + focusProgress.value * 0.06 },
      { translateY: -focusProgress.value * 1.5 },
    ],
  }));

  const inactiveIconStyle = useAnimatedStyle(() => ({
    opacity: 1 - focusProgress.value,
  }));

  const activeIconStyle = useAnimatedStyle(() => ({
    opacity: focusProgress.value,
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(focusProgress.value, [0, 1], [Colors.text.tertiary, '#FFFFFF']),
    opacity: 0.75 + focusProgress.value * 0.25,
  }));

  const handlePressIn = () => {
    pressScale.value = withSpring(0.92, PRESS_IN_SPRING);
  };
  const handlePressOut = () => {
    pressScale.value = withSpring(1, PRESS_OUT_SPRING);
  };

  const iconSize = TabBarTokens.iconSize + 4;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.tabItem}>
      <Animated.View style={[styles.tabContent, containerStyle]}>
        <Animated.View style={[styles.iconStack, iconWrapStyle]}>
          {renderIcon ? (
            <>
              <Animated.View style={inactiveIconStyle}>
                {renderIcon({
                  focused: false,
                  color: Colors.text.tertiary,
                  size: iconSize,
                })}
              </Animated.View>
              <Animated.View
                style={[StyleSheet.absoluteFill, styles.iconCenter, activeIconStyle]}
                pointerEvents="none">
                {renderIcon({
                  focused: true,
                  color: '#FFFFFF',
                  size: iconSize,
                })}
              </Animated.View>
            </>
          ) : null}
        </Animated.View>
        <Animated.Text style={[styles.label, labelStyle]} numberOfLines={1}>
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: PILL_HORIZONTAL_MARGIN,
    right: PILL_HORIZONTAL_MARGIN,
    alignItems: 'center',
  },
  pill: {
    width: '100%',
    borderRadius: Radius.tabBar,
    overflow: 'hidden',
    paddingHorizontal: PILL_INNER_PADDING,
    height: TabBarTokens.height,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  pillBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28,28,30,0.78)',
  },
  pillBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.tabBar,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  pillInnerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.tabBar,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  tabRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  indicator: {
    position: 'absolute',
    top: INDICATOR_INSET,
    bottom: INDICATOR_INSET,
    left: INDICATOR_INSET,
    borderRadius: Radius.tabActive,
    backgroundColor: Colors.primary,
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: TabBarTokens.itemGap,
  },
  iconStack: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: TabBarTokens.labelSize,
    fontWeight: '600',
    textAlign: 'center',
  },
});
