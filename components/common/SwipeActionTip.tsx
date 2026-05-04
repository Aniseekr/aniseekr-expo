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

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
let AsyncStorage: AsyncStorageLike;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  const memory = new Map<string, string>();
  AsyncStorage = {
    async getItem(k) {
      return memory.get(k) ?? null;
    },
    async setItem(k, v) {
      memory.set(k, v);
    },
  };
}

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
  const [visible, setVisible] = useState(visibleByDefault);
  const arrowX = useSharedValue(0);
  const opacity = useSharedValue(visibleByDefault ? 1 : 0);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(`@aniseekr/tip/${storageKey}`)
      .then((v) => {
        if (!mounted) return;
        if (v !== 'seen') {
          setVisible(true);
          opacity.value = withTiming(1, { duration: 300 });
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [storageKey, opacity]);

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

  const dismiss = async () => {
    hapticsBridge.tap();
    opacity.value = withTiming(0, { duration: 200 });
    setTimeout(() => setVisible(false), 220);
    try {
      await AsyncStorage.setItem(`@aniseekr/tip/${storageKey}`, 'seen');
    } catch {}
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
