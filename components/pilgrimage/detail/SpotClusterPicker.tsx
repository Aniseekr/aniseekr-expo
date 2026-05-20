// SpotClusterPicker — bottom-sheet style modal shown when the user taps a
// cluster on the map and the picker must let them choose one. Memo'd so
// untoggling `clusterSpots` doesn't churn the picker while the previous
// list animates out.

import React, { memo, useCallback, useMemo } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { ThemedText } from '../../themed';
import type { ThemePalette } from '../../../context/ThemeContext';
import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';
import { getPilgrimageSpotTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import type { VisitedMap } from '../../../libs/services/pilgrimage/visited-prefs';
import { formatDistanceKm, getPointSourceLabel } from './_helpers';

export interface SpotClusterPickerProps {
  spots: readonly AnitabiPoint[] | null;
  themeColor: string;
  themeColorFg: string;
  visited: VisitedMap;
  theme: ThemePalette;
  distanceFor: (spot: AnitabiPoint) => number | null;
  onClose: () => void;
  onPick: (spot: AnitabiPoint) => void;
}

function SpotClusterPickerImpl({
  spots,
  themeColor,
  themeColorFg,
  visited,
  theme,
  distanceFor,
  onClose,
  onPick,
}: SpotClusterPickerProps) {
  const styles = useMemo(() => makePickerStyles(theme), [theme]);
  const keyExtractor = useCallback((spot: AnitabiPoint) => spot.id, []);
  const renderItem = useCallback(
    ({ item: spot }: { item: AnitabiPoint }) => {
      const isVisited = visited[spot.id] === true;
      const km = distanceFor(spot);
      const titles = getPilgrimageSpotTitles(spot);
      const sourceLabel = getPointSourceLabel(spot);
      return (
        <Pressable
          onPress={() => onPick(spot)}
          style={({ pressed }) => [
            styles.row,
            isVisited && { borderColor: `${theme.status.success}66` },
            pressed && { opacity: 0.78 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Open ${titles.primary}`}>
          <View style={[styles.thumbWrap, { borderColor: themeColor }]}>
            <Image
              source={{ uri: spot.image }}
              style={styles.thumb}
              contentFit="cover"
              transition={120}
            />
            {spot.ep > 0 ? (
              <View style={[styles.epPill, { backgroundColor: `${themeColor}E6` }]}>
                <ThemedText
                  variant="captionSmall"
                  weight="800"
                  style={{ color: themeColorFg }}>
                  {sourceLabel ? `${sourceLabel} · ` : ''}EP {spot.ep}
                </ThemedText>
              </View>
            ) : null}
          </View>
          <View style={styles.rowBody}>
            <ThemedText variant="bodyMedium" weight="700" numberOfLines={2}>
              {titles.primary}
            </ThemedText>
            {titles.secondary ? (
              <ThemedText
                variant="bodySmall"
                tone="secondary"
                numberOfLines={1}
                style={{ marginTop: 1 }}>
                {titles.secondary}
              </ThemedText>
            ) : null}
            {km != null ? (
              <ThemedText
                variant="captionSmall"
                tone="tertiary"
                weight="500"
                style={{ marginTop: 3 }}>
                {formatDistanceKm(km)} away
              </ThemedText>
            ) : null}
          </View>
          {isVisited ? (
            <Ionicons name="checkmark-circle" size={20} color={theme.status.success} />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={theme.text.tertiary} />
          )}
        </Pressable>
      );
    },
    [distanceFor, onPick, styles, theme, themeColor, themeColorFg, visited]
  );
  if (!spots || spots.length === 0) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <SafeAreaView edges={['bottom']}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <ThemedText variant="titleMedium" weight="700">
                {spots.length} scenes here
              </ThemedText>
              <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={theme.text.secondary} />
              </Pressable>
            </View>
            <FlatList
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              data={spots}
              keyExtractor={keyExtractor}
              initialNumToRender={12}
              windowSize={9}
              renderItem={renderItem}
            />
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

function areEqual(prev: SpotClusterPickerProps, next: SpotClusterPickerProps): boolean {
  return (
    prev.spots === next.spots &&
    prev.themeColor === next.themeColor &&
    prev.themeColorFg === next.themeColorFg &&
    prev.visited === next.visited &&
    prev.theme === next.theme &&
    prev.distanceFor === next.distanceFor &&
    prev.onClose === next.onClose &&
    prev.onPick === next.onPick
  );
}

export const SpotClusterPicker = memo(SpotClusterPickerImpl, areEqual);

function makePickerStyles(theme: ThemePalette) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: theme.background.secondary,
      borderTopLeftRadius: Radius.xxl,
      borderTopRightRadius: Radius.xxl,
      borderColor: theme.glassBorder,
      borderTopWidth: 1,
      paddingHorizontal: Spacing.screenPadding,
      paddingTop: 8,
      paddingBottom: Spacing.sm,
      maxHeight: '70%',
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.glassBorder,
      marginBottom: Spacing.xs,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Spacing.xs,
      marginBottom: Spacing.xs,
    },
    closeBtn: {
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 15,
      backgroundColor: theme.background.tertiary,
    },
    list: {
      marginTop: 4,
    },
    listContent: {
      paddingBottom: Spacing.md,
      gap: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.background.secondary,
      borderColor: theme.glassBorder,
      borderWidth: 1,
      borderRadius: Radius.lg,
      padding: 10,
    },
    thumbWrap: {
      width: 60,
      height: 60,
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 2,
      backgroundColor: theme.background.tertiary,
      position: 'relative',
    },
    thumb: {
      width: '100%',
      height: '100%',
    },
    epPill: {
      position: 'absolute',
      left: 4,
      bottom: 4,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 5,
    },
    rowBody: {
      flex: 1,
      minWidth: 0,
    },
  });
}
