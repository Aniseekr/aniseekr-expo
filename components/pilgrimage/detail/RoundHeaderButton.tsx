// RoundHeaderButton — circular sticky-header action (back / album / share).
// Tiny pressable; memo'd to match sibling extraction style.

import React, { memo, useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ThemePalette } from '../../../context/ThemeContext';

export interface RoundHeaderButtonProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  accessibilityLabel: string;
  tint: string;
  theme: ThemePalette;
}

function RoundHeaderButtonImpl({
  icon,
  onPress,
  accessibilityLabel,
  tint,
  theme,
}: RoundHeaderButtonProps) {
  const styles = useMemo(() => makeHeaderStyles(theme), [theme]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => [
        styles.roundBtn,
        { borderColor: `${tint}55` },
        pressed && { opacity: 0.78, transform: [{ scale: 0.94 }] },
      ]}>
      <Ionicons name={icon} size={18} color={tint} />
    </Pressable>
  );
}

function areEqual(prev: RoundHeaderButtonProps, next: RoundHeaderButtonProps): boolean {
  return (
    prev.icon === next.icon &&
    prev.tint === next.tint &&
    prev.theme === next.theme &&
    prev.accessibilityLabel === next.accessibilityLabel &&
    prev.onPress === next.onPress
  );
}

export const RoundHeaderButton = memo(RoundHeaderButtonImpl, areEqual);

function makeHeaderStyles(theme: ThemePalette) {
  return StyleSheet.create({
    roundBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${theme.background.secondary}CC`,
      borderWidth: 1,
    },
  });
}
