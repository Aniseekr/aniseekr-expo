// PilgrimageDetailSheet — the persistent pull-up sheet that hosts the
// anime info card, stats and scene-spot grid for the redesigned detail
// screen. The map sits behind the sheet as the primary surface; the user
// drags this sheet up to focus on scenes and back down to focus on the map.
//
// Snap points:
//   • peek  (~16%) — drag handle + section title row, map dominant
//   • mid   (~58%) — anime card + stats + first rows of scenes
//   • full  (~92%) — everything visible
//
// The grid/rows layout toggle is owned by the parent (`listLayout`); we
// remount the inner FlatList when it flips so numColumns can change.
// `viewMode` purely selects the default snap point — `map` peeks the sheet
// so the map is dominant; `list` mid-snaps it so the grid is visible.
//
// CLAUDE.md Rule 9: this component owns nothing persistent. It mirrors the
// parent's `viewMode` into a snap index via a controlled effect and forwards
// every interaction to handler props.

import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { ON_DARK, ThemedText } from '../../themed';
import type { ThemePalette } from '../../../context/ThemeContext';
import type {
  AnitabiBangumi,
  AnitabiPoint,
  AnitabiSpot,
} from '../../../libs/services/pilgrimage/types';
import type { PilgrimageDisplayTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import type { PilgrimageCapture } from '../../../libs/services/pilgrimage/captures';
import type { VisitedMap } from '../../../libs/services/pilgrimage/visited-prefs';
import type {
  SpotIntentKind,
  SpotIntentMap,
} from '../../../libs/services/pilgrimage/spot-intents';
import { SceneTile } from './SceneTile';
import { SpotRow } from './SpotRow';
import { StatCell } from './StatCell';
import { formatDistanceKm } from './_helpers';

export interface PilgrimageDetailSheetProps {
  anime: AnitabiBangumi | null;
  animeTitles: PilgrimageDisplayTitles | null;
  animeSubtitle?: string;
  browseLabel: string;
  posterUri: string;
  spotStats: { spotCount: number; radiusKm: number };
  userStats: { visitedCount: number; capturedCount: number };
  filteredGroupedSpots: readonly AnitabiSpot[];
  totalSpotCount: number;
  listLayout: 'grid' | 'rows';
  viewMode: 'list' | 'map';
  themeColor: string;
  themeColorFg: string;
  theme: ThemePalette;
  visited: VisitedMap;
  captures: Record<string, PilgrimageCapture>;
  spotIntents: SpotIntentMap;
  emptyMessage: string;
  /** Optional shared value that the sheet writes its top-edge Y to, so the
   * parent's floating chrome (filter chips + view mode toggle) can anchor to
   * the sheet edge with a single Animated.View rather than a JS-thread tick. */
  animatedPosition?: SharedValue<number>;
  onSheetIndexChange?: (index: number) => void;
  onOpenBrowse: () => void;
  onOpenAnimePoster?: () => void;
  onSpotPress: (group: AnitabiSpot) => void;
  onToggleVisited: (group: AnitabiSpot) => void;
  onOpenMaps: (spot: AnitabiPoint) => void;
  onTakeComparison: (spot: AnitabiPoint) => void;
  representativeForGroup: (group: AnitabiSpot) => AnitabiPoint;
  distanceForGroup: (group: AnitabiSpot) => number | null;
  hasIntentForGroup: (group: AnitabiSpot, intent: SpotIntentKind) => boolean;
}

// Sheet snap points. Tuned so:
//  • peek leaves room for the floating view-mode toggle above it
//  • mid shows anime card + stats + start of scene grid
//  • full reveals everything (with safe-area handled by gorhom internals)
const SHEET_SNAPS = ['16%', '58%', '92%'] as const;

function PilgrimageDetailSheetImpl(props: PilgrimageDetailSheetProps) {
  const {
    anime,
    animeTitles,
    animeSubtitle,
    browseLabel,
    posterUri,
    spotStats,
    userStats,
    filteredGroupedSpots,
    totalSpotCount,
    listLayout,
    viewMode,
    themeColor,
    themeColorFg,
    theme,
    visited,
    captures,
    spotIntents: _spotIntents,
    emptyMessage,
    animatedPosition,
    onSheetIndexChange,
    onOpenBrowse,
    onOpenAnimePoster,
    onSpotPress,
    onToggleVisited,
    onOpenMaps,
    onTakeComparison,
    representativeForGroup,
    distanceForGroup,
    hasIntentForGroup,
  } = props;

  const styles = useMemo(() => makeStyles(theme), [theme]);
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => [...SHEET_SNAPS], []);

  // Re-snap when the parent's viewMode flips. Map mode → peek so the map is
  // primary; list mode → mid so the user sees the grid immediately.
  useEffect(() => {
    sheetRef.current?.snapToIndex(viewMode === 'map' ? 0 : 1);
  }, [viewMode]);

  // Adapter callbacks: SceneTile / SpotRow speak AnitabiPoint, but the parent
  // owns group-level toggles. We look up the group from the rep at call-time
  // so the per-item callback stays stable across data slices.
  const handleTilePress = useCallback(
    (spot: AnitabiPoint) => {
      const group = filteredGroupedSpots.find((g) => g.scenes.some((s) => s.id === spot.id));
      if (group) onSpotPress(group);
    },
    [filteredGroupedSpots, onSpotPress]
  );
  const handleTileToggleVisited = useCallback(
    (spot: AnitabiPoint) => {
      const group = filteredGroupedSpots.find((g) => g.scenes.some((s) => s.id === spot.id));
      if (group) onToggleVisited(group);
    },
    [filteredGroupedSpots, onToggleVisited]
  );

  const renderTile = useCallback(
    ({ item: gs }: { item: AnitabiSpot }) => {
      const rep = representativeForGroup(gs);
      const captured = gs.scenes.find((p) => captures[p.id]);
      return (
        <View style={styles.gridCell}>
          <SceneTile
            spot={rep}
            sceneCount={gs.scenes.length}
            themeColor={themeColor}
            themeColorFg={themeColorFg}
            distanceKm={distanceForGroup(gs)}
            visited={gs.scenes.some((p) => visited[p.id] === true)}
            saved={hasIntentForGroup(gs, 'saved')}
            planned={hasIntentForGroup(gs, 'planned')}
            hasCapture={!!captured}
            captureUri={captured ? (captures[captured.id]?.uri ?? null) : null}
            theme={theme}
            onPress={handleTilePress}
            onToggleVisited={handleTileToggleVisited}
            onTakeComparison={onTakeComparison}
          />
        </View>
      );
    },
    [
      captures,
      distanceForGroup,
      handleTilePress,
      handleTileToggleVisited,
      hasIntentForGroup,
      onTakeComparison,
      representativeForGroup,
      styles.gridCell,
      theme,
      themeColor,
      themeColorFg,
      visited,
    ]
  );

  const renderRow = useCallback(
    ({ item: gs }: { item: AnitabiSpot }) => {
      const rep = representativeForGroup(gs);
      const captured = gs.scenes.find((p) => captures[p.id]);
      return (
        <View style={styles.rowCell}>
          <SpotRow
            spot={rep}
            sceneCount={gs.scenes.length}
            themeColor={themeColor}
            themeColorFg={themeColorFg}
            distanceKm={distanceForGroup(gs)}
            visited={gs.scenes.some((p) => visited[p.id] === true)}
            saved={hasIntentForGroup(gs, 'saved')}
            planned={hasIntentForGroup(gs, 'planned')}
            hasCapture={!!captured}
            captureUri={captured ? (captures[captured.id]?.uri ?? null) : null}
            theme={theme}
            onPress={handleTilePress}
            onToggleVisited={handleTileToggleVisited}
            onOpenMaps={onOpenMaps}
          />
        </View>
      );
    },
    [
      captures,
      distanceForGroup,
      handleTilePress,
      handleTileToggleVisited,
      hasIntentForGroup,
      onOpenMaps,
      representativeForGroup,
      styles.rowCell,
      theme,
      themeColor,
      themeColorFg,
      visited,
    ]
  );

  const handleIndexChange = useCallback(
    (index: number) => {
      onSheetIndexChange?.(index);
    },
    [onSheetIndexChange]
  );

  const listKey = listLayout;
  const numColumns = listLayout === 'grid' ? 2 : 1;

  const subtitleLine = useMemo(() => {
    const parts: string[] = [];
    if (animeSubtitle) parts.push(animeSubtitle);
    else if (anime?.city) parts.push(anime.city);
    return parts.join(' ');
  }, [animeSubtitle, anime?.city]);

  const visitedLabel = userStats.visitedCount === 1 ? 'Visited' : 'Visited';
  const photosLabel = userStats.capturedCount === 1 ? 'Photo' : 'Photos';

  const headerNode = (
    <View style={styles.headerWrap}>
      <View style={styles.titleRow}>
        <Pressable
          onPress={onOpenAnimePoster}
          disabled={!onOpenAnimePoster || !anime}
          style={({ pressed }) => [
            styles.posterWrap,
            { backgroundColor: theme.background.tertiary, borderColor: theme.glassBorder },
            pressed && onOpenAnimePoster && { opacity: 0.86 },
          ]}>
          {posterUri ? (
            <Image source={{ uri: posterUri }} style={styles.poster} contentFit="cover" />
          ) : null}
          <View style={styles.posterBadge} pointerEvents="none">
            <ThemedText
              variant="captionSmall"
              weight="800"
              numberOfLines={1}
              style={{ color: ON_DARK }}>
              {spotStats.spotCount} scenes
            </ThemedText>
          </View>
        </Pressable>
        <View style={styles.titleColumn}>
          <ThemedText variant="headlineMedium" weight="800" numberOfLines={2}>
            {animeTitles?.primary ?? '—'}
          </ThemedText>
          {subtitleLine ? (
            <ThemedText variant="bodySmall" tone="secondary" numberOfLines={2}>
              {subtitleLine}
            </ThemedText>
          ) : null}
          {anime ? (
            <Pressable
              onPress={onOpenBrowse}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.browseChip,
                {
                  borderColor: `${themeColor}55`,
                  backgroundColor: `${themeColor}1A`,
                },
                pressed && { opacity: 0.85 },
              ]}>
              <Ionicons name="library-outline" size={11} color={themeColor} />
              <ThemedText
                variant="captionSmall"
                weight="700"
                style={{ color: themeColor }}
                numberOfLines={1}>
                {browseLabel}
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      </View>

      {anime ? (
        <View style={styles.statsRow}>
          <StatCell
            icon="place"
            value={String(spotStats.spotCount)}
            label={spotStats.spotCount === 1 ? 'scene' : 'scenes'}
            color={themeColor}
            theme={theme}
          />
          <View style={styles.statDivider} />
          <StatCell
            icon="explore"
            value={spotStats.radiusKm > 0 ? `~${formatDistanceKm(spotStats.radiusKm)}` : '—'}
            label="radius"
            color={themeColor}
            theme={theme}
          />
          <View style={styles.statDivider} />
          <StatCell
            icon="check-circle-outline"
            value={`${userStats.visitedCount}`}
            label={visitedLabel}
            color={userStats.visitedCount > 0 ? theme.status.success : themeColor}
            theme={theme}
          />
          <View style={styles.statDivider} />
          <StatCell
            icon="photo"
            value={`${userStats.capturedCount}`}
            label={photosLabel}
            color={userStats.capturedCount > 0 ? themeColor : theme.text.tertiary}
            theme={theme}
          />
        </View>
      ) : null}

      <View style={styles.sectionTitleRow}>
        <ThemedText variant="titleMedium" weight="800">
          Scene spots
        </ThemedText>
        <ThemedText variant="bodySmall" tone="secondary">
          {totalSpotCount} {totalSpotCount === 1 ? 'place' : 'places'}
        </ThemedText>
      </View>
    </View>
  );

  const emptyNode = (
    <View style={styles.emptyCard}>
      <MaterialIcons name="explore-off" size={32} color={theme.text.tertiary} />
      <ThemedText variant="bodyMedium" tone="secondary" align="center">
        {emptyMessage}
      </ThemedText>
    </View>
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={viewMode === 'map' ? 0 : 1}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      enableContentPanningGesture
      animatedPosition={animatedPosition}
      backgroundStyle={[styles.sheetBg, { backgroundColor: theme.background.primary }]}
      handleIndicatorStyle={[styles.sheetHandle, { backgroundColor: theme.glassBorder }]}
      onChange={handleIndexChange}>
      <BottomSheetFlatList
        key={listKey}
        data={filteredGroupedSpots as AnitabiSpot[]}
        keyExtractor={(item) => item.id}
        renderItem={listLayout === 'grid' ? renderTile : renderRow}
        numColumns={numColumns}
        ListHeaderComponent={headerNode}
        ListEmptyComponent={emptyNode}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.sheetContent}
        columnWrapperStyle={listLayout === 'grid' ? styles.gridRow : undefined}
      />
    </BottomSheet>
  );
}

function areEqual(
  prev: PilgrimageDetailSheetProps,
  next: PilgrimageDetailSheetProps
): boolean {
  return (
    prev.anime === next.anime &&
    prev.animeTitles === next.animeTitles &&
    prev.animeSubtitle === next.animeSubtitle &&
    prev.browseLabel === next.browseLabel &&
    prev.posterUri === next.posterUri &&
    prev.spotStats === next.spotStats &&
    prev.userStats === next.userStats &&
    prev.filteredGroupedSpots === next.filteredGroupedSpots &&
    prev.totalSpotCount === next.totalSpotCount &&
    prev.listLayout === next.listLayout &&
    prev.viewMode === next.viewMode &&
    prev.themeColor === next.themeColor &&
    prev.themeColorFg === next.themeColorFg &&
    prev.theme === next.theme &&
    prev.visited === next.visited &&
    prev.captures === next.captures &&
    prev.spotIntents === next.spotIntents &&
    prev.emptyMessage === next.emptyMessage &&
    prev.animatedPosition === next.animatedPosition &&
    prev.onSheetIndexChange === next.onSheetIndexChange &&
    prev.onOpenBrowse === next.onOpenBrowse &&
    prev.onOpenAnimePoster === next.onOpenAnimePoster &&
    prev.onSpotPress === next.onSpotPress &&
    prev.onToggleVisited === next.onToggleVisited &&
    prev.onOpenMaps === next.onOpenMaps &&
    prev.onTakeComparison === next.onTakeComparison &&
    prev.representativeForGroup === next.representativeForGroup &&
    prev.distanceForGroup === next.distanceForGroup &&
    prev.hasIntentForGroup === next.hasIntentForGroup
  );
}

export const PilgrimageDetailSheet = memo(PilgrimageDetailSheetImpl, areEqual);

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    sheetBg: {
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
    },
    sheetHandle: {
      width: 44,
      height: 4,
      borderRadius: 2,
    },
    sheetContent: {
      paddingBottom: Spacing.xxl,
      paddingHorizontal: Spacing.screenPadding,
    },
    headerWrap: {
      gap: Spacing.md,
      paddingBottom: Spacing.md,
    },
    titleRow: {
      flexDirection: 'row',
      gap: Spacing.md,
      alignItems: 'flex-start',
    },
    posterWrap: {
      width: 84,
      height: 84,
      borderRadius: Radius.lg,
      borderWidth: 1,
      overflow: 'hidden',
    },
    poster: {
      width: '100%',
      height: '100%',
    },
    posterBadge: {
      position: 'absolute',
      left: 6,
      right: 6,
      bottom: 6,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: Radius.sm,
      backgroundColor: 'rgba(0,0,0,0.62)',
      alignItems: 'center',
    },
    titleColumn: {
      flex: 1,
      gap: 4,
      paddingTop: 2,
    },
    browseChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: Radius.full,
      borderWidth: 1,
      marginTop: 6,
    },
    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.sm,
      paddingHorizontal: 4,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.secondary,
    },
    statDivider: {
      width: StyleSheet.hairlineWidth,
      height: 28,
      backgroundColor: theme.glassBorder,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      paddingTop: 4,
      paddingBottom: 4,
    },
    gridRow: {
      gap: Spacing.sm,
      paddingBottom: Spacing.sm,
    },
    gridCell: {
      flex: 1,
      maxWidth: '50%',
    },
    rowCell: {
      paddingBottom: Spacing.sm,
    },
    emptyCard: {
      marginTop: Spacing.lg,
      paddingVertical: Spacing.xl,
      paddingHorizontal: Spacing.lg,
      backgroundColor: theme.background.secondary,
      borderColor: theme.glassBorder,
      borderWidth: 1,
      borderRadius: Radius.cardLg,
      alignItems: 'center',
      gap: Spacing.xs,
    },
  });
}
