// FilterPill — filter chip used in the spot filter strip. Memo'd so flipping
// one filter does not re-render all the other pills.

import React, { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius } from '../../../constants/DesignSystem';
import { ThemedText } from '../../themed';
import type { ThemePalette } from '../../../context/ThemeContext';
import { filterPillPropsEqual } from './_equality';

export interface FilterPillProps {
  label: string;
  active: boolean;
  badge: number;
  themeColor: string;
  themeColorFg: string;
  theme: ThemePalette;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
}

function FilterPillImpl({
  label,
  active,
  badge,
  themeColor,
  themeColorFg,
  theme,
  icon,
  onPress,
}: FilterPillProps) {
  const styles = useMemo(() => makePillStyles(theme), [theme]);
  const fg = active ? themeColorFg : theme.text.secondary;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        active
          ? { backgroundColor: themeColor, borderColor: themeColor }
          : { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <ThemedText variant="bodySmall" weight="600" style={{ color: fg }}>
        {label}
      </ThemedText>
      <View
        style={[
          styles.pillCount,
          active
            ? { backgroundColor: `${themeColorFg}22` }
            : { backgroundColor: theme.background.tertiary },
        ]}>
        <ThemedText variant="captionSmall" weight="700" style={{ color: fg }}>
          {badge}
        </ThemedText>
      </View>
    </Pressable>
  );
}

export const FilterPill = memo(FilterPillImpl, filterPillPropsEqual);

function makePillStyles(theme: ThemePalette) {
  return StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: Radius.full,
      borderWidth: 1,
    },
    pillCount: {
      minWidth: 22,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
