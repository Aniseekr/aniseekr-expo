// FilterCyclePill — single pill that cycles through the available filter
// states on tap. Replaces the horizontal strip of FilterPill chips when we
// want a more compact filter affordance. Shows the current label + badge and
// a small cycle hint glyph so the tap-to-rotate gesture is discoverable.

import React, { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius } from '../../../constants/DesignSystem';
import { ThemedText } from '../../themed';
import type { ThemePalette } from '../../../context/ThemeContext';
import type { PilgrimageSpotFilter } from '../../../libs/services/pilgrimage/pilgrimage-detail-filter';

export interface FilterCyclePillState {
  filter: PilgrimageSpotFilter;
  label: string;
  badge: number;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

export interface FilterCyclePillProps {
  states: readonly FilterCyclePillState[];
  current: PilgrimageSpotFilter;
  themeColor: string;
  themeColorFg: string;
  theme: ThemePalette;
  onCycle: (next: PilgrimageSpotFilter) => void;
}

function FilterCyclePillImpl({
  states,
  current,
  themeColor,
  themeColorFg,
  theme,
  onCycle,
}: FilterCyclePillProps) {
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const currentIndex = Math.max(
    0,
    states.findIndex((s) => s.filter === current)
  );
  const active = states[currentIndex] ?? states[0];
  const fg = themeColorFg;

  const handlePress = () => {
    if (states.length <= 1) return;
    const next = states[(currentIndex + 1) % states.length];
    onCycle(next.filter);
  };

  if (!active) return null;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ selected: true }}
      accessibilityLabel={`Filter: ${active.label}. Tap to cycle.`}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: themeColor, borderColor: themeColor },
        pressed && { opacity: 0.86 },
      ]}>
      {active.icon ? <Ionicons name={active.icon} size={13} color={fg} /> : null}
      <ThemedText variant="bodySmall" weight="700" style={{ color: fg }}>
        {active.label}
      </ThemedText>
      <View style={[styles.badge, { backgroundColor: `${fg}22` }]}>
        <ThemedText variant="captionSmall" weight="700" style={{ color: fg }}>
          {active.badge}
        </ThemedText>
      </View>
      {states.length > 1 ? (
        <View style={styles.dots}>
          {states.map((s, i) => (
            <View
              key={s.filter}
              style={[
                styles.dot,
                { backgroundColor: i === currentIndex ? fg : `${fg}55` },
              ]}
            />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

function areEqual(prev: FilterCyclePillProps, next: FilterCyclePillProps): boolean {
  return (
    prev.states === next.states &&
    prev.current === next.current &&
    prev.themeColor === next.themeColor &&
    prev.themeColorFg === next.themeColorFg &&
    prev.theme === next.theme &&
    prev.onCycle === next.onCycle
  );
}

export const FilterCyclePill = memo(FilterCyclePillImpl, areEqual);

function makeStyles(theme: ThemePalette) {
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
    badge: {
      minWidth: 22,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dots: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginLeft: 2,
    },
    dot: {
      width: 4,
      height: 4,
      borderRadius: 2,
    },
  });
}
