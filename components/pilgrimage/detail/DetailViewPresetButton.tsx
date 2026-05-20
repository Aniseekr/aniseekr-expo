// DetailViewPresetButton — Grid / Rows / Map tab button. Three of these
// render in a row; memo'd so flipping the active preset only re-renders the
// two whose `active` flag changed.

import React, { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '../../themed';
import type { ThemePalette } from '../../../context/ThemeContext';

export interface DetailViewPresetButtonProps {
  active: boolean;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  themeColor: string;
  themeColorFg: string;
  count?: number;
  theme: ThemePalette;
  onPress: () => void;
}

function DetailViewPresetButtonImpl({
  active,
  label,
  icon,
  themeColor,
  theme,
  count,
  onPress,
}: DetailViewPresetButtonProps) {
  const styles = useMemo(() => makeTabStyles(theme), [theme]);
  const fg = active ? themeColor : theme.text.secondary;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tab,
        active
          ? {
              backgroundColor: `${themeColor}14`,
              borderColor: themeColor,
              borderWidth: 1.5,
            }
          : {
              backgroundColor: theme.background.secondary,
              borderColor: theme.glassBorder,
              borderWidth: 1,
            },
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}>
      <Ionicons name={icon} size={14} color={fg} />
      <ThemedText variant="bodySmall" weight="600" style={{ color: fg }}>
        {label}
      </ThemedText>
      {count !== undefined ? (
        <View
          style={[
            styles.countBadge,
            { backgroundColor: active ? `${themeColor}22` : theme.background.tertiary },
          ]}>
          <ThemedText variant="captionSmall" weight="700" style={{ color: fg }}>
            {count}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

function areEqual(
  prev: DetailViewPresetButtonProps,
  next: DetailViewPresetButtonProps
): boolean {
  return (
    prev.active === next.active &&
    prev.label === next.label &&
    prev.icon === next.icon &&
    prev.themeColor === next.themeColor &&
    prev.themeColorFg === next.themeColorFg &&
    prev.count === next.count &&
    prev.theme === next.theme &&
    prev.onPress === next.onPress
  );
}

export const DetailViewPresetButton = memo(DetailViewPresetButtonImpl, areEqual);

function makeTabStyles(theme: ThemePalette) {
  return StyleSheet.create({
    tab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 12,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    countBadge: {
      minWidth: 20,
      height: 18,
      paddingHorizontal: 5,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
