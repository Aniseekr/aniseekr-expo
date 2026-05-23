import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Colors, Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { kvGet, kvSet } from '../../libs/services/storage/app-storage';
import { SWIPE_ACTION_TIP_KEY_PREFIX } from '../../libs/services/storage/keys';

const tipMmkvKey = (storageKey: string) => `${SWIPE_ACTION_TIP_KEY_PREFIX}${storageKey}`;

interface SwipeActionTipProps {
  storageKey: string;
  message?: string;
  visibleByDefault?: boolean;
}

function SwipeActionTipComponent({
  storageKey,
  message = 'Swipe to rate',
  visibleByDefault = false,
}: SwipeActionTipProps) {
  const { theme } = useTheme();
  // Seed sync from MMKV — `visible` is correct on frame 1. Previously the
  // tip popped in after an async resolve which was visually jarring.
  const [visible, setVisible] = useState(() => {
    if (visibleByDefault) return true;
    return kvGet(tipMmkvKey(storageKey)) !== 'seen';
  });
  const arrowX = useSharedValue(0);
  const opacity = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    if (visibleByDefault) return;
    if (visible && opacity.value === 0) {
      opacity.value = withTiming(1, { duration: 300 });
    }
    // visible & opacity intentionally read only once on mount — the dismiss
    // handler owns the visible→hidden transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!visible) return;
    arrowX.value = 0;
    arrowX.value = withRepeat(
      withTiming(20, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [visible, arrowX]);

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: arrowX.value }],
  }));
  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (!visible) return null;

  const dismiss = () => {
    hapticsBridge.tap();
    opacity.value = withTiming(0, { duration: 200 });
    setTimeout(() => setVisible(false), 220);
    kvSet(tipMmkvKey(storageKey), 'seen');
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: theme.background.secondary,
          borderColor: theme.glassBorder,
        },
        containerStyle,
      ]}>
      <View style={styles.row}>
        <Animated.View style={arrowStyle}>
          <MaterialIcons name="swipe" size={20} color={theme.accent} />
        </Animated.View>
        <Text style={[styles.message, { color: theme.text.primary }]}>{message}</Text>
        <Pressable onPress={dismiss} hitSlop={12}>
          <Text style={[styles.dismiss, { color: theme.accent }]}>Got it</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 16,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  message: {
    ...Typography.titleSmall,
    flex: 1,
  },
  dismiss: {
    ...Typography.titleSmall,
    fontWeight: '700',
  },
});

export const SwipeActionTip = memo(SwipeActionTipComponent);
