// StatCell — one stat tile in the pilgrimage detail stat strip. Tiny, pure,
// memo'd so a visited tap doesn't re-render the 4 sibling cells.

import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedText } from '../../themed';
import type { ThemePalette } from '../../../context/ThemeContext';
import { statCellPropsEqual } from './_equality';

export interface StatCellProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  value: string;
  label: string;
  color: string;
  theme: ThemePalette;
}

function StatCellImpl({ icon, value, label, color, theme }: StatCellProps) {
  const styles = useMemo(() => makeStatStyles(theme), [theme]);
  return (
    <View style={styles.cell}>
      <MaterialIcons name={icon} size={16} color={color} />
      <ThemedText variant="bodyMedium" weight="700">
        {value}
      </ThemedText>
      <ThemedText variant="captionSmall" tone="secondary" weight="500">
        {label}
      </ThemedText>
    </View>
  );
}

export const StatCell = memo(StatCellImpl, statCellPropsEqual);

function makeStatStyles(_theme: ThemePalette) {
  return StyleSheet.create({
    cell: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 4,
      gap: 2,
    },
  });
}
