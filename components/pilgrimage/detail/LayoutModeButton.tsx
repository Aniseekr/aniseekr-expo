// LayoutModeButton — small toggle in the map options dock (photo/dot markers,
// offline-only). Tiny pressable; memo for parity with siblings.

import React, { memo } from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ThemePalette } from '../../../context/ThemeContext';

export interface LayoutModeButtonProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  active: boolean;
  themeColor: string;
  themeColorFg: string;
  theme: ThemePalette;
  accessibilityLabel: string;
  onPress: () => void;
}

function LayoutModeButtonImpl({
  icon,
  active,
  themeColor,
  themeColorFg,
  theme,
  accessibilityLabel,
  onPress,
}: LayoutModeButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: 34,
          height: 30,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          backgroundColor: active ? themeColor : theme.background.secondary,
          borderColor: active ? themeColor : theme.glassBorder,
        },
        pressed && { opacity: 0.8 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel}>
      <Ionicons name={icon} size={16} color={active ? themeColorFg : theme.text.secondary} />
    </Pressable>
  );
}

function areEqual(prev: LayoutModeButtonProps, next: LayoutModeButtonProps): boolean {
  return (
    prev.icon === next.icon &&
    prev.active === next.active &&
    prev.themeColor === next.themeColor &&
    prev.themeColorFg === next.themeColorFg &&
    prev.theme === next.theme &&
    prev.accessibilityLabel === next.accessibilityLabel &&
    prev.onPress === next.onPress
  );
}

export const LayoutModeButton = memo(LayoutModeButtonImpl, areEqual);
