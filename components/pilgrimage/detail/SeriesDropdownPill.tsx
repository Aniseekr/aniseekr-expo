// SeriesDropdownPill — compact pill that displays the current series
// selection and opens a dropdown menu anchored beneath it. Replaces the
// horizontal scroll row of series chips when we want the switcher to live
// next to the back button instead of taking its own row.
//
// The pill measures itself on press so the dropdown anchors to the actual
// pill position (works regardless of how many sibling buttons sit next to
// it in the header).

import React, { memo, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type View as RNView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { ThemedText } from '../../themed';
import type { ThemePalette } from '../../../context/ThemeContext';
import type {
  PilgrimageSeriesEntry,
  PilgrimageSeriesSelection,
} from '../../../libs/services/pilgrimage/pilgrimage-series';

export interface SeriesDropdownPillProps {
  entries: readonly PilgrimageSeriesEntry[];
  availableCount: number;
  selection: PilgrimageSeriesSelection;
  themeColor: string;
  themeColorFg: string;
  theme: ThemePalette;
  onSelect: (selection: PilgrimageSeriesSelection) => void;
}

interface Anchor {
  x: number;
  y: number;
  w: number;
  h: number;
}

function SeriesDropdownPillImpl({
  entries,
  availableCount,
  selection,
  themeColor,
  themeColorFg,
  theme,
  onSelect,
}: SeriesDropdownPillProps) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const pillRef = useRef<RNView>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const canSelectAll = availableCount > 1;

  const currentLabel = useMemo(() => {
    if (selection === 'all') return canSelectAll ? 'All' : entries[0]?.subject.label ?? '—';
    const match = entries.find((e) => e.subject.id === selection);
    return match?.subject.label ?? 'All';
  }, [selection, entries, canSelectAll]);

  const currentBadge = useMemo(() => {
    if (selection === 'all') {
      return canSelectAll ? `${availableCount}` : null;
    }
    const match = entries.find((e) => e.subject.id === selection);
    return match?.anime?.pointsLength ? `${match.anime.pointsLength}` : null;
  }, [selection, entries, canSelectAll, availableCount]);

  const handlePress = () => {
    pillRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w, h });
      setOpen(true);
    });
  };

  const handleClose = () => setOpen(false);
  const handlePick = (next: PilgrimageSeriesSelection) => {
    onSelect(next);
    setOpen(false);
  };

  const menuTop = anchor ? anchor.y + anchor.h + 6 : 0;
  const menuLeft = anchor ? anchor.x : 0;

  return (
    <>
      <Pressable
        ref={pillRef}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`Series: ${currentLabel}. Tap to change.`}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: themeColor, borderColor: themeColor },
          pressed && { opacity: 0.86 },
        ]}>
        <ThemedText variant="bodySmall" weight="700" style={{ color: themeColorFg }}>
          {currentLabel}
        </ThemedText>
        {currentBadge ? (
          <View style={[styles.badge, { backgroundColor: `${themeColorFg}22` }]}>
            <ThemedText variant="captionSmall" weight="700" style={{ color: themeColorFg }}>
              {currentBadge}
            </ThemedText>
          </View>
        ) : null}
        <Ionicons name="chevron-down" size={14} color={themeColorFg} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={handleClose}>
        <Pressable style={styles.backdrop} onPress={handleClose}>
          {anchor ? (
            <View
              style={[styles.menu, { top: menuTop, left: menuLeft }]}
              onStartShouldSetResponder={() => true}>
              <ScrollView
                bounces={false}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.menuContent}>
                {canSelectAll ? (
                  <SeriesDropdownItem
                    label="All"
                    sublabel={`${availableCount} titles`}
                    active={selection === 'all'}
                    disabled={false}
                    themeColor={themeColor}
                    themeColorFg={themeColorFg}
                    theme={theme}
                    onPress={() => handlePick('all')}
                  />
                ) : null}
                {entries.map((entry) => {
                  const enabled = entry.anime !== null;
                  const title = entry.subject.titleCn || entry.subject.title;
                  const active =
                    selection === entry.subject.id ||
                    (!canSelectAll && selection === 'all' && enabled);
                  return (
                    <SeriesDropdownItem
                      key={entry.subject.id}
                      label={entry.subject.label}
                      sublabel={enabled ? title : 'No spots yet'}
                      active={active}
                      disabled={!enabled}
                      badge={entry.anime?.pointsLength}
                      themeColor={themeColor}
                      themeColorFg={themeColorFg}
                      theme={theme}
                      onPress={() => (enabled ? handlePick(entry.subject.id) : undefined)}
                    />
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}

function areEqual(prev: SeriesDropdownPillProps, next: SeriesDropdownPillProps): boolean {
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

export const SeriesDropdownPill = memo(SeriesDropdownPillImpl, areEqual);

interface SeriesDropdownItemProps {
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

function SeriesDropdownItem({
  label,
  sublabel,
  active,
  disabled,
  badge,
  themeColor,
  themeColorFg,
  theme,
  onPress,
}: SeriesDropdownItemProps) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const fg = active ? themeColorFg : theme.text.primary;
  const subFg = active ? themeColorFg : theme.text.tertiary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      style={({ pressed }) => [
        styles.item,
        active && { backgroundColor: themeColor },
        disabled && { opacity: 0.45 },
        pressed && !disabled && !active && { backgroundColor: theme.background.tertiary },
      ]}>
      <View style={styles.itemBody}>
        <ThemedText variant="bodyMedium" weight="700" numberOfLines={1} style={{ color: fg }}>
          {label}
        </ThemedText>
        <ThemedText
          variant="captionSmall"
          numberOfLines={1}
          style={{ color: subFg, marginTop: 1 }}>
          {sublabel}
        </ThemedText>
      </View>
      {badge !== undefined ? (
        <ThemedText variant="bodySmall" weight="700" style={{ color: subFg }}>
          {badge}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingLeft: 12,
      paddingRight: 10,
      paddingVertical: 8,
      minHeight: 40,
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
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    menu: {
      position: 'absolute',
      minWidth: 220,
      maxWidth: 280,
      maxHeight: 360,
      borderRadius: Radius.lg,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 12,
    },
    menuContent: {
      paddingVertical: 6,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: Spacing.md,
      paddingVertical: 10,
      minHeight: 48,
    },
    itemBody: {
      flex: 1,
      minWidth: 0,
    },
  });
}
