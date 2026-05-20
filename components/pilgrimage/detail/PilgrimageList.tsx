// PilgrimageList — wraps FlashList for the pilgrimage detail's grid/rows
// modes. Owns the per-cell renderItem (stable references) so SceneTile /
// SpotRow can memo without the parent leaking new closures on every render.
//
// The empty / search-empty placeholders are also routed through this file so
// the route shell only has to choose `layout`.

import React, { memo, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { FlashList, type FlashListRef, type ListRenderItem } from '@shopify/flash-list';
import { ThemedText } from '../../themed';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import type { ThemePalette } from '../../../context/ThemeContext';
import type { AnitabiPoint, AnitabiSpot } from '../../../libs/services/pilgrimage/types';
import type { PilgrimageCapture } from '../../../libs/services/pilgrimage/captures';
import type { VisitedMap } from '../../../libs/services/pilgrimage/visited-prefs';
import type { SpotIntentKind, SpotIntentMap } from '../../../libs/services/pilgrimage/spot-intents';
import { SceneTile } from './SceneTile';
import { SpotRow } from './SpotRow';

export interface PilgrimageListProps {
  layout: 'grid' | 'rows';
  data: readonly AnitabiSpot[];
  visited: VisitedMap;
  captures: Record<string, PilgrimageCapture>;
  spotIntents: SpotIntentMap;
  themeColor: string;
  themeColorFg: string;
  theme: ThemePalette;
  representativeForGroup: (group: AnitabiSpot) => AnitabiPoint;
  distanceForGroup: (group: AnitabiSpot) => number | null;
  hasIntentForGroup: (group: AnitabiSpot, intent: SpotIntentKind) => boolean;
  onSpotPress: (group: AnitabiSpot) => void;
  onToggleVisited: (group: AnitabiSpot) => void;
  onOpenMaps: (spot: AnitabiPoint) => void;
  onTakeComparison: (spot: AnitabiPoint) => void;
  ListHeaderComponent: React.ReactElement;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
  emptyMessage?: string;
  flashListRef?: React.Ref<FlashListRef<AnitabiSpot>>;
}

// Each tile / row maps an AnitabiSpot (group) to its rep AnitabiPoint and
// derived booleans, then forwards stable group-level handlers from the parent.
function PilgrimageListImpl(props: PilgrimageListProps) {
  const {
    layout,
    data,
    visited,
    captures,
    spotIntents: _spotIntents,
    themeColor,
    themeColorFg,
    theme,
    representativeForGroup,
    distanceForGroup,
    hasIntentForGroup,
    onSpotPress,
    onToggleVisited,
    onOpenMaps,
    onTakeComparison,
    ListHeaderComponent,
    onScroll,
    contentContainerStyle,
    emptyMessage,
    flashListRef,
  } = props;

  const styles = useMemo(() => makeListStyles(theme), [theme]);

  const keyExtractor = useCallback((spot: AnitabiSpot) => spot.id, []);

  // Adapter callbacks: SceneTile / SpotRow handlers receive an AnitabiPoint
  // (the rep), but the parent owns group-level state. We do not capture the
  // group here so the per-item callback stays stable across data slices.
  const handleTilePress = useCallback(
    (spot: AnitabiPoint) => {
      const group = data.find((g) => g.scenes.some((s) => s.id === spot.id));
      if (group) onSpotPress(group);
    },
    [data, onSpotPress]
  );
  const handleTileToggleVisited = useCallback(
    (spot: AnitabiPoint) => {
      const group = data.find((g) => g.scenes.some((s) => s.id === spot.id));
      if (group) onToggleVisited(group);
    },
    [data, onToggleVisited]
  );

  const renderTile: ListRenderItem<AnitabiSpot> = useCallback(
    ({ item: gs }) => {
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

  const renderRow: ListRenderItem<AnitabiSpot> = useCallback(
    ({ item: gs }) => {
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

  const ListEmptyComponent = useMemo(
    () =>
      emptyMessage ? (
        <View style={styles.emptyCard}>
          <ThemedText variant="bodyMedium" tone="secondary" align="center">
            {emptyMessage}
          </ThemedText>
        </View>
      ) : null,
    [emptyMessage, styles.emptyCard]
  );

  if (layout === 'grid') {
    return (
      <FlashList<AnitabiSpot>
        ref={flashListRef}
        data={data as AnitabiSpot[]}
        keyExtractor={keyExtractor}
        renderItem={renderTile}
        numColumns={2}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        contentContainerStyle={contentContainerStyle}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        drawDistance={400}
      />
    );
  }

  return (
    <FlashList<AnitabiSpot>
      ref={flashListRef}
      data={data as AnitabiSpot[]}
      keyExtractor={keyExtractor}
      renderItem={renderRow}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent}
      contentContainerStyle={contentContainerStyle}
      onScroll={onScroll}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      drawDistance={400}
    />
  );
}

export const PilgrimageList = memo(PilgrimageListImpl);

function makeListStyles(theme: ThemePalette) {
  return StyleSheet.create({
    gridCell: {
      flex: 1,
      paddingHorizontal: 5,
      paddingBottom: 10,
    },
    rowCell: {
      paddingHorizontal: Spacing.screenPadding,
      paddingBottom: Spacing.sm,
    },
    emptyCard: {
      marginHorizontal: Spacing.screenPadding,
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
