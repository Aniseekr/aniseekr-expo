// Series switcher row + its chip. Memo'd to avoid re-rendering every chip when
// the user taps just one. Selection callback is stable from the parent.

import React, { memo, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Radius } from '../../../constants/DesignSystem';
import { ThemedText } from '../../themed';
import type { ThemePalette } from '../../../context/ThemeContext';
import type {
  PilgrimageSeriesEntry,
  PilgrimageSeriesSelection,
} from '../../../libs/services/pilgrimage/pilgrimage-series';
import { seriesSwitchChipPropsEqual } from './_equality';

export interface SeriesSwitchChipProps {
  label: string;
  sublabel: string;
  active: boolean;
  disabled: boolean;
  badge?: number;
  themeColor: string;
  themeColorFg: string;
  theme: ThemePalette;
  onPress: () => void;
}

function SeriesSwitchChipImpl({
  label,
  sublabel,
  active,
  disabled,
  badge,
  themeColor,
  themeColorFg,
  theme,
  onPress,
}: SeriesSwitchChipProps) {
  const styles = useMemo(() => makeSeriesSwitchStyles(theme), [theme]);
  const fg = active ? themeColorFg : theme.text.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      style={({ pressed }) => [
        styles.chip,
        active
          ? { backgroundColor: themeColor, borderColor: themeColor }
          : { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
        disabled && { opacity: 0.45 },
        pressed && !disabled && { opacity: 0.86 },
      ]}>
      <View style={styles.chipTop}>
        <ThemedText variant="bodySmall" weight="800" numberOfLines={1} style={{ color: fg }}>
          {label}
        </ThemedText>
        {badge !== undefined ? (
          <ThemedText
            variant="captionSmall"
            weight="700"
            style={{ color: active ? themeColorFg : theme.text.tertiary }}>
            {badge}
          </ThemedText>
        ) : null}
      </View>
      <ThemedText
        variant="captionSmall"
        numberOfLines={1}
        style={{ color: active ? themeColorFg : theme.text.tertiary }}>
        {disabled ? 'No spots yet' : sublabel}
      </ThemedText>
    </Pressable>
  );
}

export const SeriesSwitchChip = memo(SeriesSwitchChipImpl, seriesSwitchChipPropsEqual);

export interface SeriesSwitchRowProps {
  entries: readonly PilgrimageSeriesEntry[];
  availableCount: number;
  selection: PilgrimageSeriesSelection;
  themeColor: string;
  themeColorFg: string;
  theme: ThemePalette;
  onSelect: (selection: PilgrimageSeriesSelection) => void;
}

function SeriesSwitchRowImpl({
  entries,
  availableCount,
  selection,
  themeColor,
  themeColorFg,
  theme,
  onSelect,
}: SeriesSwitchRowProps) {
  const styles = useMemo(() => makeSeriesSwitchStyles(theme), [theme]);
  const canSelectAll = availableCount > 1;
  // Per-entry stable handlers built once per render (cheap; memo on the parent
  // keeps the row stable, and chip-level memo prevents downstream renders).
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}>
      {canSelectAll ? (
        <SeriesSwitchChip
          label="All"
          sublabel={`${availableCount} titles`}
          active={selection === 'all'}
          disabled={false}
          themeColor={themeColor}
          themeColorFg={themeColorFg}
          theme={theme}
          onPress={() => onSelect('all')}
        />
      ) : null}
      {entries.map((entry) => {
        const enabled = entry.anime !== null;
        const title = entry.subject.titleCn || entry.subject.title;
        const active =
          selection === entry.subject.id || (!canSelectAll && selection === 'all' && enabled);
        return (
          <SeriesSwitchChip
            key={entry.subject.id}
            label={entry.subject.label}
            sublabel={title}
            active={active}
            disabled={!enabled}
            badge={entry.anime?.pointsLength ?? 0}
            themeColor={themeColor}
            themeColorFg={themeColorFg}
            theme={theme}
            onPress={() => onSelect(entry.subject.id)}
          />
        );
      })}
    </ScrollView>
  );
}

function rowEqual(prev: SeriesSwitchRowProps, next: SeriesSwitchRowProps): boolean {
  return (
    prev.entries === next.entries &&
    prev.availableCount === next.availableCount &&
    prev.selection === next.selection &&
    prev.themeColor === next.themeColor &&
    prev.themeColorFg === next.themeColorFg &&
    prev.theme === next.theme &&
    prev.onSelect === next.onSelect
  );
}

export const SeriesSwitchRow = memo(SeriesSwitchRowImpl, rowEqual);

function makeSeriesSwitchStyles(theme: ThemePalette) {
  return StyleSheet.create({
    row: {
      gap: 8,
      paddingRight: 2,
    },
    chip: {
      width: 132,
      minHeight: 52,
      justifyContent: 'center',
      gap: 3,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: Radius.md,
      borderWidth: 1,
    },
    chipTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 6,
    },
  });
}
