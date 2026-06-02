import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { View, Platform, StyleSheet, Pressable, Text } from 'react-native';
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
import { Radius, TabBar as TabBarTokens, bottomPad } from '../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../context/ThemeContext';
import {
  isFloatingTabBarHidden,
  subscribeFloatingTabBarVisibility,
} from '../libs/navigation/floating-tab-bar-visibility';
import {
  FLOATING_TAB_BAR_HIDE_DURATION_MS,
  FLOATING_TAB_BAR_SHOW_DURATION_MS,
} from '../libs/navigation/floating-tab-bar-animation';

const PILL_HORIZONTAL_MARGIN = 16;
const PILL_INNER_PADDING = 8;

const COLLAPSED_WIDTH = 44;
const TAB_HEIGHT = 44;
const LABEL_TRAILING_PAD = 14;
const ACTIVE_ICON_SIZE = 18;
const INACTIVE_ICON_SIZE = 20;

const FOCUS_SPRING = { damping: 20, stiffness: 220, mass: 0.6 } as const;
const PRESS_IN_SPRING = { damping: 14, stiffness: 320 } as const;
const PRESS_OUT_SPRING = { damping: 12, stiffness: 280 } as const;
// Slide far enough that the elevation shadow on Android also clears the screen.
const HIDE_TRANSLATE_Y = 120;

// Permanently hidden — these routes never appear in the bar at all (e.g.
// `href: null`, `tabBarButton: null` registrations). They should be excluded
// from the visible pill list.
const isPermanentlyHidden = (options: any) =>
  options?.href === null || options?.tabBarButton === null;

// Transiently hidden — the focused screen wants the bar hidden right now
// (e.g. bangumi cards mode, a nested sub-screen). The route itself is still
// a navigable tab, so it stays in `visibleRoutes` so other tabs can show its
// pill. The whole bar animates out instead.
const isTransientlyHidden = (options: any) =>
  (options?.tabBarStyle as any)?.display === 'none' || options?.tabBarVisible === false;

export default function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { theme, effectiveMode } = useTheme();
  const externallyHidden = useSyncExternalStore(
    subscribeFloatingTabBarVisibility,
    isFloatingTabBarHidden,
    isFloatingTabBarHidden
  );
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const blurTint =
    effectiveMode === 'light' ? 'systemThickMaterialLight' : 'systemThickMaterialDark';

  const bottomMargin = Platform.select({
    ios: bottomPad(insets),
    android: bottomPad(insets),
  });

  const visibleRoutes = state.routes.filter((route) => {
    const { options } = descriptors[route.key];
    return !isPermanentlyHidden(options);
  });

  const activeRouteKey = state.routes[state.index]?.key;
  const activeOptions = activeRouteKey ? descriptors[activeRouteKey]?.options : undefined;

  // Hide whenever:
  //   - active route options are missing (mid-init),
  //   - active route is permanently or transiently hidden,
  //   - active tab has drilled into a nested non-index route (e.g. (rate)/rating,
  //     anime/[id]). Nested screens may forget to call parent.setOptions, and
  //     racey setOptions inside useEffect can leave the bar visible for a frame.
  const shouldHide = useMemo(() => {
    if (externallyHidden) return true;
    if (!activeOptions) return true;
    if (isPermanentlyHidden(activeOptions)) return true;
    if (isTransientlyHidden(activeOptions)) return true;
    const activeRoute = state.routes[state.index] as {
      state?: { index?: number; routes?: { name: string }[] };
    };
    const nested = activeRoute?.state;
    if (nested && typeof nested.index === 'number' && nested.routes) {
      const nestedActive = nested.routes[nested.index];
      if (nestedActive && nestedActive.name !== 'index') return true;
    }
    return false;
  }, [activeOptions, externallyHidden, state.routes, state.index]);

  // BlurView stays mounted across hide toggles — re-creating it on every
  // remount was the source of the visible frame drops on Android when flipping
  // out of bangumi cards mode. We drive translateY+opacity on the UI thread
  // instead so the GPU keeps the blur compositing context alive.
  const hideProgress = useSharedValue(shouldHide ? 1 : 0);
  useEffect(() => {
    hideProgress.value = withTiming(shouldHide ? 1 : 0, {
      duration: shouldHide ? FLOATING_TAB_BAR_HIDE_DURATION_MS : FLOATING_TAB_BAR_SHOW_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [shouldHide, hideProgress]);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: hideProgress.value * HIDE_TRANSLATE_Y }],
    opacity: 1 - hideProgress.value,
  }));

  return (
    <Animated.View
      style={[styles.container, { bottom: bottomMargin }, containerAnimatedStyle]}
      pointerEvents={shouldHide ? 'none' : 'box-none'}>
      <View style={styles.pill}>
        <BlurView
          intensity={80}
          tint={Platform.OS === 'ios' ? blurTint : effectiveMode === 'light' ? 'light' : 'dark'}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.pillBackground} pointerEvents="none" />
        <View style={styles.pillBorder} pointerEvents="none" />

        <View style={styles.tabRow}>
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
    </Animated.View>
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
  const [labelWidth, setLabelWidth] = useState(0);
  const pressScale = useSharedValue(1);
  const focusProgress = useSharedValue(isFocused ? 1 : 0);
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const activeFg = theme.accent;
  const inactiveFg = theme.text.tertiary;
  // Active pill fill = accent at ~18% alpha (0x2E), border = accent at ~45% (0x73).
  const activeBg = `${theme.accent}2E`;
  const activeBorder = `${theme.accent}73`;

  useEffect(() => {
    focusProgress.value = withSpring(isFocused ? 1 : 0, FOCUS_SPRING);
  }, [isFocused, focusProgress]);

  const expandedWidth =
    labelWidth > 0 ? COLLAPSED_WIDTH + labelWidth + LABEL_TRAILING_PAD : COLLAPSED_WIDTH;

  const pillStyle = useAnimatedStyle(() => ({
    width: COLLAPSED_WIDTH + focusProgress.value * (expandedWidth - COLLAPSED_WIDTH),
    backgroundColor: interpolateColor(focusProgress.value, [0, 1], ['rgba(0,0,0,0)', activeBg]),
    borderColor: interpolateColor(focusProgress.value, [0, 1], ['rgba(0,0,0,0)', activeBorder]),
    transform: [{ scale: pressScale.value }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: focusProgress.value,
    transform: [{ translateX: (1 - focusProgress.value) * -6 }],
  }));

  const inactiveIconStyle = useAnimatedStyle(() => ({
    opacity: 1 - focusProgress.value,
  }));
  const activeIconStyle = useAnimatedStyle(() => ({
    opacity: focusProgress.value,
  }));

  const handlePressIn = () => {
    pressScale.value = withSpring(0.94, PRESS_IN_SPRING);
  };
  const handlePressOut = () => {
    pressScale.value = withSpring(1, PRESS_OUT_SPRING);
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      hitSlop={6}>
      <Animated.View style={[styles.tabPill, pillStyle]}>
        <View style={styles.iconBox}>
          {renderIcon ? (
            <>
              <Animated.View style={inactiveIconStyle}>
                {renderIcon({
                  focused: false,
                  color: inactiveFg,
                  size: INACTIVE_ICON_SIZE,
                })}
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, styles.iconCenter, activeIconStyle]}>
                {renderIcon({
                  focused: true,
                  color: activeFg,
                  size: ACTIVE_ICON_SIZE,
                })}
              </Animated.View>
            </>
          ) : null}
        </View>
        <Animated.Text
          style={[styles.label, { color: activeFg }, labelStyle]}
          numberOfLines={1}
          allowFontScaling={false}>
          {label}
        </Animated.Text>
      </Animated.View>
      <Text
        style={styles.labelMeasure}
        numberOfLines={1}
        allowFontScaling={false}
        onLayout={(e) => {
          const w = Math.ceil(e.nativeEvent.layout.width);
          if (w !== labelWidth) setLabelWidth(w);
        }}>
        {label}
      </Text>
    </Pressable>
  );
}

const makeStyles = (theme: ThemePalette) =>
  StyleSheet.create({
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
          shadowOpacity: 0.32,
          shadowRadius: 24,
        },
        android: { elevation: 14 },
      }),
    },
    pillBackground: {
      ...StyleSheet.absoluteFillObject,
      // 78% alpha overlay on the theme's secondary surface so the bar visibly
      // belongs to the active palette without losing the glass-blur effect.
      backgroundColor: `${theme.background.secondary}C7`,
    },
    pillBorder: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: Radius.tabBar,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    tabRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    tabPill: {
      height: TAB_HEIGHT,
      borderRadius: TAB_HEIGHT / 2,
      flexDirection: 'row',
      alignItems: 'center',
      overflow: 'hidden',
      borderWidth: 1,
    },
    iconBox: {
      width: COLLAPSED_WIDTH,
      height: TAB_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconCenter: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginRight: LABEL_TRAILING_PAD,
    },
    labelMeasure: {
      position: 'absolute',
      opacity: 0,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
  });
