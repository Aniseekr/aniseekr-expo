import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

export type CollectionMode = 'collect' | 'share';

interface CollectionModeToggleProps {
  mode: CollectionMode;
  onChange: (mode: CollectionMode) => void;
}

const SEGMENT_WIDTH = 110;

function CollectionModeToggleComponent({ mode, onChange }: CollectionModeToggleProps) {
  const { theme } = useTheme();
  const indicatorX = useSharedValue(mode === 'collect' ? 0 : SEGMENT_WIDTH);
  indicatorX.value = withSpring(mode === 'collect' ? 0 : SEGMENT_WIDTH, {
    damping: 18,
    stiffness: 220,
  });

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.background.secondary,
          borderColor: theme.glassBorder,
        },
      ]}>
      <Animated.View
        style={[styles.indicator, { backgroundColor: theme.accent }, indicatorStyle]}
      />
      {(['collect', 'share'] as CollectionMode[]).map((m) => {
        const active = m === mode;
        return (
          <Pressable
            key={m}
            onPress={() => {
              hapticsBridge.selection();
              onChange(m);
            }}
            style={styles.segment}>
            <MaterialIcons
              name={m === 'collect' ? 'collections-bookmark' : 'ios-share'}
              size={16}
              color={active ? '#0E0A06' : theme.text.secondary}
            />
            <Text style={[styles.label, { color: active ? '#0E0A06' : theme.text.secondary }]}>
              {m === 'collect' ? 'Collect' : 'Share'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 22,
    borderWidth: 1,
    padding: 4,
    width: SEGMENT_WIDTH * 2 + 8,
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    width: SEGMENT_WIDTH,
    borderRadius: 18,
  },
  segment: {
    width: SEGMENT_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  label: {
    ...Typography.titleSmall,
    fontWeight: '700',
  },
});

export const CollectionModeToggle = memo(CollectionModeToggleComponent);
