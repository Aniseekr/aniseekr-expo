import { useEffect, useState } from 'react';
import { View, Platform, StyleSheet, Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors, Radius, TabBar as TabBarTokens } from '../constants/DesignSystem';

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

const ACTIVE_FG = Colors.primary;
const INACTIVE_FG = Colors.text.tertiary;
const ACTIVE_BG = 'rgba(255, 159, 10, 0.16)';
const ACTIVE_BORDER = 'rgba(255, 159, 10, 0.45)';

export default function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

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
  const activeOptions = activeRouteKey ? descriptors[activeRouteKey]?.options : undefined;
  if (!activeOptions || isHidden(activeOptions)) {
    return null;
  }

  // Hide whenever the focused tab has drilled into a nested non-index route
  // (e.g. (rate)/rating, (rate)/anime/[id]). Nested screens may forget to call
  // parent.setOptions to hide the bar, and racey setOptions inside useEffect
  // sometimes leaves the bar visible for a frame.
  const activeRoute = state.routes[state.index] as { state?: { index?: number; routes?: { name: string }[] } };
  const nested = activeRoute?.state;
  if (nested && typeof nested.index === 'number' && nested.routes) {
    const nestedActive = nested.routes[nested.index];
    if (nestedActive && nestedActive.name !== 'index') {
      return null;
    }
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
  const [labelWidth, setLabelWidth] = useState(0);
  const pressScale = useSharedValue(1);
  const focusProgress = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    focusProgress.value = withSpring(isFocused ? 1 : 0, FOCUS_SPRING);
  }, [isFocused, focusProgress]);

  const expandedWidth =
    labelWidth > 0 ? COLLAPSED_WIDTH + labelWidth + LABEL_TRAILING_PAD : COLLAPSED_WIDTH;

  const pillStyle = useAnimatedStyle(() => ({
    width: COLLAPSED_WIDTH + focusProgress.value * (expandedWidth - COLLAPSED_WIDTH),
    backgroundColor: interpolateColor(focusProgress.value, [0, 1], ['rgba(0,0,0,0)', ACTIVE_BG]),
    borderColor: interpolateColor(
      focusProgress.value,
      [0, 1],
      ['rgba(0,0,0,0)', ACTIVE_BORDER]
    ),
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
                  color: INACTIVE_FG,
                  size: INACTIVE_ICON_SIZE,
                })}
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, styles.iconCenter, activeIconStyle]}>
                {renderIcon({
                  focused: true,
                  color: ACTIVE_FG,
                  size: ACTIVE_ICON_SIZE,
                })}
              </Animated.View>
            </>
          ) : null}
        </View>
        <Animated.Text
          style={[styles.label, labelStyle]}
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
        shadowOpacity: 0.32,
        shadowRadius: 24,
      },
      android: { elevation: 14 },
    }),
  },
  pillBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,20,22,0.78)',
  },
  pillBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.tabBar,
    borderWidth: 1,
    borderColor: Colors.glass.border,
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
    color: ACTIVE_FG,
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
