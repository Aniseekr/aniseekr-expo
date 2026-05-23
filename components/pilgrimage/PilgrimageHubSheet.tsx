// PilgrimageHubSheet — persistent pull-up sheet for the hub map screen.
//
// Mirrors PilgrimageDetailSheet structurally (same snap points, same chrome
// anchor plumbing) so the user perceives the hub map → detail map transition
// as a continuous focus shift rather than a hard page change. The content
// differs:
//   • Detail sheet hosts ONE anime + its scene grid.
//   • Hub sheet hosts a list of NEARBY ANIME with a swap-able "focused"
//     anime card at the top.
//
// CLAUDE.md Rule 9: owns no persistent state. View-mode, focused-anime index,
// search text and stats are all parent-owned and forwarded as props.
//
// Snap points (same as detail):
//   • peek  (~16%) — drag handle + section title row, map dominant
//   • mid   (~58%) — focused anime card + stats + first rows of nearby list
//   • full  (~92%) — everything visible

import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { ON_DARK, ThemedText, readableTextOn } from '../themed';
import type { ThemePalette } from '../../context/ThemeContext';
import type { AnitabiBangumi } from '../../libs/services/pilgrimage/types';
import {
  formatPilgrimageSubtitle,
  getPilgrimageAnimeTitles,
  type PilgrimageDisplayTitles,
} from '../../libs/services/pilgrimage/pilgrimage-localization';
import { StatCell } from './detail/StatCell';
import { formatDistanceKm } from './detail/_helpers';

export interface HubAnimeEntry {
  anime: AnitabiBangumi;
  distanceKm?: number;
  fromCollection: boolean;
  visitedCount: number;
  photoCount: number;
  is88?: boolean;
}

export interface HubStats {
  /** Anime count in the current visible / nearby list. */
  nearbyCount: number;
  /** Sum of `pointsLength` across the visible list. */
  totalScenes: number;
  /** User's total visited spot count (global, not per-anime). */
  visitedCount: number;
  /** User's total captured photo count (global). */
  photoCount: number;
}

export interface PilgrimageHubSheetProps {
  /** Visible / filtered list. */
  nearbyAnimes: readonly HubAnimeEntry[];
  /** Anime shown in the swap-able "focused" card at the top of the sheet. */
  focusedAnime: HubAnimeEntry | null;
  /** Whether the swap button cycles to something different (>= 2 visible animes). */
  canSwap: boolean;
  stats: HubStats;
  listLayout: 'grid' | 'rows';
  themeColor: string;
  themeColorFg: string;
  theme: ThemePalette;
  /** Used to render the empty state ("no match for X"). */
  searchQuery: string;
  /** Initial bottom-sheet snap index: 1 = map-first, 2 = list-first. */
  initialIndex?: number;
  /** Shared value the sheet writes its top-edge Y to, so parent chrome can anchor to the sheet's edge. */
  animatedPosition?: SharedValue<number>;
  onSheetIndexChange?: (index: number) => void;
  /** Tap an anime row / focused card → push to its detail screen. */
  onAnimePress: (anime: AnitabiBangumi) => void;
  /** Tap the swap arrow → cycle the focused-card to the next-nearest anime. */
  onSwapFocused: () => void;
  /** Tap the section title's "See all" hint → expand the sheet to full. */
  onExpandRequest?: () => void;
}

const SHEET_SNAPS = ['16%', '58%', '92%'] as const;

function PilgrimageHubSheetImpl(props: PilgrimageHubSheetProps) {
  const {
    nearbyAnimes,
    focusedAnime,
    canSwap,
    stats,
    listLayout,
    themeColor,
    themeColorFg,
    theme,
    searchQuery,
    initialIndex = 1,
    animatedPosition,
    onSheetIndexChange,
    onAnimePress,
    onSwapFocused,
    onExpandRequest,
  } = props;

  const styles = useMemo(() => makeStyles(theme), [theme]);
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => [...SHEET_SNAPS], []);

  // Default to mid snap on mount — gives the user the focused card + stats +
  // first rows of nearby list without burying the map.
  useEffect(() => {
    sheetRef.current?.snapToIndex(initialIndex);
  }, [initialIndex]);

  const handleIndexChange = useCallback(
    (index: number) => onSheetIndexChange?.(index),
    [onSheetIndexChange]
  );

  const listKey = listLayout;
  const numColumns = listLayout === 'grid' ? 2 : 1;

  const renderRow = useCallback(
    ({ item }: { item: HubAnimeEntry }) => (
      <View style={styles.rowCell}>
        <HubAnimeRow
          entry={item}
          themeColor={themeColor}
          themeColorFg={themeColorFg}
          theme={theme}
          styles={styles}
          onPress={() => onAnimePress(item.anime)}
        />
      </View>
    ),
    [onAnimePress, styles, theme, themeColor, themeColorFg]
  );

  const renderGrid = useCallback(
    ({ item }: { item: HubAnimeEntry }) => (
      <View style={styles.gridCell}>
        <HubAnimeCard
          entry={item}
          themeColor={themeColor}
          themeColorFg={themeColorFg}
          theme={theme}
          styles={styles}
          onPress={() => onAnimePress(item.anime)}
        />
      </View>
    ),
    [onAnimePress, styles, theme, themeColor, themeColorFg]
  );

  const focusedTitles = useMemo<PilgrimageDisplayTitles | null>(
    () => (focusedAnime ? getPilgrimageAnimeTitles(focusedAnime.anime) : null),
    [focusedAnime]
  );
  const focusedSubtitle = focusedTitles ? formatPilgrimageSubtitle(focusedTitles) : undefined;

  const sectionTitle = nearbyAnimes.length === 1 ? 'Nearby anime' : 'Nearby animes';

  const headerNode = (
    <View style={styles.headerWrap}>
      {focusedAnime ? (
        <FocusedAnimeCard
          entry={focusedAnime}
          titles={focusedTitles}
          subtitle={focusedSubtitle}
          themeColor={themeColor}
          themeColorFg={themeColorFg}
          theme={theme}
          styles={styles}
          canSwap={canSwap}
          onPress={() => onAnimePress(focusedAnime.anime)}
          onSwap={onSwapFocused}
        />
      ) : null}

      <View style={styles.statsRow}>
        <StatCell
          icon="movie"
          value={String(stats.nearbyCount)}
          label={stats.nearbyCount === 1 ? 'Anime' : 'Animes'}
          color={themeColor}
          theme={theme}
        />
        <View style={styles.statDivider} />
        <StatCell
          icon="place"
          value={stats.totalScenes > 0 ? String(stats.totalScenes) : '—'}
          label="Scenes"
          color={themeColor}
          theme={theme}
        />
        <View style={styles.statDivider} />
        <StatCell
          icon="check-circle-outline"
          value={String(stats.visitedCount)}
          label="Visited"
          color={stats.visitedCount > 0 ? theme.status.success : themeColor}
          theme={theme}
        />
        <View style={styles.statDivider} />
        <StatCell
          icon="photo"
          value={String(stats.photoCount)}
          label={stats.photoCount === 1 ? 'Photo' : 'Photos'}
          color={stats.photoCount > 0 ? themeColor : theme.text.tertiary}
          theme={theme}
        />
      </View>

      <View style={styles.sectionTitleRow}>
        <ThemedText variant="titleMedium" weight="800">
          {sectionTitle}
        </ThemedText>
        <Pressable
          onPress={onExpandRequest}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Expand list"
          style={({ pressed }) => [styles.sectionCta, pressed && { opacity: 0.7 }]}>
          <ThemedText variant="captionSmall" weight="600" tone="secondary">
            {nearbyAnimes.length}
          </ThemedText>
          <Ionicons name="chevron-up" size={12} color={theme.text.tertiary} />
        </Pressable>
      </View>
    </View>
  );

  const emptyNode = (
    <View style={styles.emptyCard}>
      <MaterialIcons name="explore-off" size={32} color={theme.text.tertiary} />
      <ThemedText variant="bodyMedium" tone="secondary" align="center">
        {searchQuery.trim().length > 0
          ? `No anime match "${searchQuery.trim()}".`
          : 'No nearby anime yet. Try panning the map to a different region.'}
      </ThemedText>
    </View>
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={initialIndex}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      enableContentPanningGesture
      animatedPosition={animatedPosition}
      backgroundStyle={[styles.sheetBg, { backgroundColor: theme.background.primary }]}
      handleIndicatorStyle={[styles.sheetHandle, { backgroundColor: theme.glassBorder }]}
      onChange={handleIndexChange}>
      <BottomSheetFlatList
        key={listKey}
        data={nearbyAnimes as HubAnimeEntry[]}
        keyExtractor={(item) => String(item.anime.id)}
        renderItem={listLayout === 'grid' ? renderGrid : renderRow}
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

function areEqual(prev: PilgrimageHubSheetProps, next: PilgrimageHubSheetProps): boolean {
  return (
    prev.nearbyAnimes === next.nearbyAnimes &&
    prev.focusedAnime === next.focusedAnime &&
    prev.canSwap === next.canSwap &&
    prev.stats === next.stats &&
    prev.listLayout === next.listLayout &&
    prev.themeColor === next.themeColor &&
    prev.themeColorFg === next.themeColorFg &&
    prev.theme === next.theme &&
    prev.searchQuery === next.searchQuery &&
    prev.initialIndex === next.initialIndex &&
    prev.animatedPosition === next.animatedPosition &&
    prev.onSheetIndexChange === next.onSheetIndexChange &&
    prev.onAnimePress === next.onAnimePress &&
    prev.onSwapFocused === next.onSwapFocused &&
    prev.onExpandRequest === next.onExpandRequest
  );
}

export const PilgrimageHubSheet = memo(PilgrimageHubSheetImpl, areEqual);

// ─── Subcomponents (file-local; not exported) ────────────────────────────────

interface FocusedAnimeCardProps {
  entry: HubAnimeEntry;
  titles: PilgrimageDisplayTitles | null;
  subtitle?: string;
  themeColor: string;
  themeColorFg: string;
  theme: ThemePalette;
  styles: ReturnType<typeof makeStyles>;
  canSwap: boolean;
  onPress: () => void;
  onSwap: () => void;
}

function FocusedAnimeCard({
  entry,
  titles,
  subtitle,
  themeColor,
  themeColorFg,
  theme,
  styles,
  canSwap,
  onPress,
  onSwap,
}: FocusedAnimeCardProps) {
  const anime = entry.anime;
  const distanceText = entry.distanceKm !== undefined ? formatDistanceKm(entry.distanceKm) : null;
  return (
    <View style={styles.focusedCard}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Open ${titles?.primary ?? 'anime'}`}
        style={({ pressed }) => [styles.focusedBody, pressed && { opacity: 0.92 }]}>
        <View
          style={[
            styles.posterWrap,
            { backgroundColor: theme.background.tertiary, borderColor: theme.glassBorder },
          ]}>
          {anime.cover ? (
            <Image source={{ uri: anime.cover }} style={styles.poster} contentFit="cover" />
          ) : null}
          <View style={styles.posterBadge} pointerEvents="none">
            <ThemedText
              variant="captionSmall"
              weight="800"
              numberOfLines={1}
              style={{ color: ON_DARK }}>
              {anime.pointsLength ?? 0} scenes
            </ThemedText>
          </View>
        </View>
        <View style={styles.titleColumn}>
          <View style={styles.focusedTitleRow}>
            <ThemedText variant="titleLarge" weight="800" numberOfLines={1} style={{ flex: 1 }}>
              {titles?.primary ?? 'Unknown Title'}
            </ThemedText>
            {entry.fromCollection ? (
              <View
                style={[
                  styles.collectionPill,
                  {
                    backgroundColor: `${theme.status.info}1A`,
                    borderColor: `${theme.status.info}66`,
                  },
                ]}>
                <Ionicons name="bookmark" size={10} color={theme.status.info} />
              </View>
            ) : null}
          </View>
          {subtitle ? (
            <ThemedText variant="bodySmall" tone="secondary" numberOfLines={1}>
              {subtitle}
            </ThemedText>
          ) : null}
          <View style={styles.focusedMetaRow}>
            {anime.city ? (
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={11} color={theme.text.tertiary} />
                <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
                  {anime.city}
                </ThemedText>
              </View>
            ) : null}
            {distanceText ? (
              <View style={styles.metaItem}>
                <Ionicons name="navigate" size={11} color={themeColor} />
                <ThemedText
                  variant="captionSmall"
                  weight="700"
                  style={{ color: themeColor }}
                  numberOfLines={1}>
                  {distanceText}
                </ThemedText>
              </View>
            ) : null}
            {entry.is88 ? (
              <View
                style={[
                  styles.officialPill,
                  { backgroundColor: `${themeColor}22`, borderColor: `${themeColor}66` },
                ]}>
                <Ionicons name="star" size={9} color={themeColor} />
                <ThemedText variant="captionSmall" weight="700" style={{ color: themeColor }}>
                  88
                </ThemedText>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
      <View style={styles.focusedActions}>
        <Pressable
          onPress={onSwap}
          disabled={!canSwap}
          accessibilityRole="button"
          accessibilityLabel="Switch focused anime"
          style={({ pressed }) => [
            styles.swapBtn,
            {
              backgroundColor: theme.background.secondary,
              borderColor: theme.glassBorder,
              opacity: canSwap ? 1 : 0.4,
            },
            pressed && canSwap && { opacity: 0.72 },
          ]}>
          <Ionicons name="swap-horizontal" size={16} color={theme.text.primary} />
        </Pressable>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel="Open detail"
          style={({ pressed }) => [
            styles.openBtn,
            { backgroundColor: themeColor },
            pressed && { opacity: 0.85 },
          ]}>
          <Ionicons name="chevron-forward" size={16} color={themeColorFg} />
        </Pressable>
      </View>
    </View>
  );
}

interface HubAnimeRowProps {
  entry: HubAnimeEntry;
  themeColor: string;
  themeColorFg: string;
  theme: ThemePalette;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
}

const HubAnimeRow = memo(function HubAnimeRow({
  entry,
  themeColor,
  themeColorFg,
  theme,
  styles,
  onPress,
}: HubAnimeRowProps) {
  const anime = entry.anime;
  const titles = getPilgrimageAnimeTitles(anime);
  const subtitle = formatPilgrimageSubtitle(titles);
  const distanceText = entry.distanceKm !== undefined ? formatDistanceKm(entry.distanceKm) : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${titles.primary} pilgrimage`}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.88 }]}>
      <View
        style={[
          styles.rowPosterWrap,
          { backgroundColor: theme.background.tertiary, borderColor: theme.glassBorder },
        ]}>
        {anime.cover ? (
          <Image source={{ uri: anime.cover }} style={styles.rowPoster} contentFit="cover" />
        ) : null}
        <View style={[styles.rowBadge, { backgroundColor: `${themeColor}E6` }]}>
          <ThemedText
            variant="captionSmall"
            weight="800"
            style={{ color: themeColorFg, fontSize: 10 }}>
            {anime.pointsLength ?? 0}
          </ThemedText>
        </View>
        {entry.is88 ? (
          <View
            style={[
              styles.rowOfficialDot,
              { backgroundColor: themeColor, borderColor: theme.background.secondary },
            ]}>
            <Ionicons name="star" size={8} color={themeColorFg} />
          </View>
        ) : null}
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTitleLine}>
          <ThemedText variant="bodyMedium" weight="700" numberOfLines={1} style={{ flex: 1 }}>
            {titles.primary}
          </ThemedText>
          {entry.fromCollection ? (
            <View
              style={[
                styles.collectionPill,
                {
                  backgroundColor: `${theme.status.info}1A`,
                  borderColor: `${theme.status.info}66`,
                },
              ]}>
              <Ionicons name="bookmark" size={9} color={theme.status.info} />
            </View>
          ) : null}
        </View>
        {subtitle ? (
          <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
        <View style={styles.rowMetaLine}>
          {anime.city ? (
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={11} color={theme.text.tertiary} />
              <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
                {anime.city}
              </ThemedText>
            </View>
          ) : null}
          {entry.visitedCount > 0 ? (
            <View style={styles.metaItem}>
              <Ionicons name="checkmark-circle" size={11} color={theme.status.success} />
              <ThemedText
                variant="captionSmall"
                weight="600"
                style={{ color: theme.status.success }}>
                {entry.visitedCount}
              </ThemedText>
            </View>
          ) : null}
          {distanceText ? (
            <View style={styles.metaItem}>
              <Ionicons name="navigate" size={11} color={themeColor} />
              <ThemedText variant="captionSmall" weight="700" style={{ color: themeColor }}>
                {distanceText}
              </ThemedText>
            </View>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.text.tertiary} />
    </Pressable>
  );
});

interface HubAnimeCardProps {
  entry: HubAnimeEntry;
  themeColor: string;
  themeColorFg: string;
  theme: ThemePalette;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
}

const HubAnimeCard = memo(function HubAnimeCard({
  entry,
  themeColor,
  themeColorFg,
  theme,
  styles,
  onPress,
}: HubAnimeCardProps) {
  const anime = entry.anime;
  const titles = getPilgrimageAnimeTitles(anime);
  const distanceText = entry.distanceKm !== undefined ? formatDistanceKm(entry.distanceKm) : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${titles.primary} pilgrimage`}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
      <View
        style={[
          styles.cardPosterWrap,
          { backgroundColor: theme.background.tertiary, borderColor: theme.glassBorder },
        ]}>
        {anime.cover ? (
          <Image source={{ uri: anime.cover }} style={styles.cardPoster} contentFit="cover" />
        ) : null}
        <View style={[styles.cardBadge, { backgroundColor: `${themeColor}E6` }]}>
          <ThemedText
            variant="captionSmall"
            weight="800"
            style={{ color: themeColorFg, fontSize: 10 }}>
            {anime.pointsLength ?? 0} spots
          </ThemedText>
        </View>
        {entry.fromCollection ? (
          <View
            style={[
              styles.cardCollection,
              { backgroundColor: `${theme.status.info}D9` },
            ]}>
            <Ionicons name="bookmark" size={9} color={readableTextOn(theme.status.info)} />
          </View>
        ) : null}
        {entry.visitedCount > 0 ? (
          <View style={styles.cardVisited}>
            <Ionicons name="checkmark" size={10} color={theme.status.success} />
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: theme.status.success, fontSize: 9 }}>
              {entry.visitedCount}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <View style={styles.cardMeta}>
        <ThemedText variant="bodySmall" weight="700" numberOfLines={1}>
          {titles.primary}
        </ThemedText>
        <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
          {distanceText
            ? `${distanceText}${anime.city ? ` · ${anime.city}` : ''}`
            : anime.city || '—'}
        </ThemedText>
      </View>
    </Pressable>
  );
});

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

    // Focused anime card — mirrors detail screen's title block but with a
    // swap arrow + chevron-forward at the trailing edge (mockup style).
    focusedCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      padding: 10,
      borderRadius: Radius.cardLg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.secondary,
    },
    focusedBody: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      flex: 1,
    },
    posterWrap: {
      width: 64,
      height: 64,
      borderRadius: Radius.lg,
      borderWidth: 1,
      overflow: 'hidden',
    },
    poster: { width: '100%', height: '100%' },
    posterBadge: {
      position: 'absolute',
      left: 4,
      right: 4,
      bottom: 4,
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: Radius.sm,
      backgroundColor: 'rgba(0,0,0,0.62)',
      alignItems: 'center',
    },
    titleColumn: { flex: 1, gap: 2, minWidth: 0 },
    focusedTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    focusedMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap',
      marginTop: 2,
    },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    collectionPill: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    officialPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: Radius.full,
      borderWidth: 1,
    },
    focusedActions: {
      flexDirection: 'row',
      gap: 4,
    },
    swapBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
    },
    openBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Stats row — same visual rhythm as the detail screen's stats card.
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

    // Section title row above the anime list.
    sectionTitleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: 4,
      paddingBottom: 4,
    },
    sectionCta: { flexDirection: 'row', alignItems: 'center', gap: 4 },

    // Grid + row cells.
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

    // Row cell visuals.
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      padding: 10,
      borderRadius: Radius.cardLg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.secondary,
    },
    rowPosterWrap: {
      width: 56,
      height: 56,
      borderRadius: Radius.md,
      borderWidth: 1,
      overflow: 'hidden',
    },
    rowPoster: { width: '100%', height: '100%' },
    rowBadge: {
      position: 'absolute',
      top: 4,
      left: 4,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: Radius.sm,
    },
    rowOfficialDot: {
      position: 'absolute',
      bottom: 4,
      right: 4,
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowBody: { flex: 1, minWidth: 0, gap: 2 },
    rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rowMetaLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap',
      marginTop: 2,
    },

    // Grid cell visuals.
    card: {
      borderRadius: Radius.cardLg,
      overflow: 'hidden',
      backgroundColor: theme.background.secondary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.glassBorder,
    },
    cardPosterWrap: {
      width: '100%',
      aspectRatio: 1.05,
      borderTopLeftRadius: Radius.cardLg,
      borderTopRightRadius: Radius.cardLg,
      borderBottomWidth: 1,
      overflow: 'hidden',
    },
    cardPoster: { width: '100%', height: '100%' },
    cardBadge: {
      position: 'absolute',
      top: 6,
      left: 6,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: Radius.sm,
    },
    cardCollection: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardVisited: {
      position: 'absolute',
      bottom: 6,
      right: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: Radius.sm,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderWidth: 1,
      borderColor: `${theme.status.success}66`,
    },
    cardMeta: { padding: 8, paddingHorizontal: 10, gap: 2 },

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
