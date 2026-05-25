// Pilgrimage detail screen.
// Path: /pilgrimage/{bangumiId}
//
// Spec: spec/pilgrimage_spec.md §8 (Routes).
//
// Visual language: map-first. The Leaflet WebView fills the screen as the
// primary surface; back/album/share buttons, the search field, the series
// switcher and the filter chips float on top of the map. A persistent
// pull-up `BottomSheet` hosts the anime info card, stats and scene grid.
// Dragging it up focuses on scenes; dragging it down (or tapping Map)
// focuses on the map. The view-mode toggle (Grid / Rows / Map) controls
// both the sheet content layout and its default snap point.
//
// CLAUDE.md Rule 9: this file is the route shell. State + side effects live
// in feature hooks (usePilgrimageDetailData / Interactions / DerivedSpots /
// SpotSheet) and every leaf is its own memo'd component under
// `components/pilgrimage/detail/`. We do not add new top-level `useState`s
// here without first asking whether the value belongs in a hook or a child.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  InteractionManager,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../context/ThemeContext';
import { ThemedText, readableTextOn } from '../../../components/themed';
import { PLATFORM_CONFIGS, type PlatformType } from '../../../libs/services/auth/types';
import { isSupportedBrowseSource } from '../../../libs/services/data-source-config';
import { getNumberParam } from '../../../libs/utils/route-params';
import {
  formatPilgrimageSubtitle,
  getPilgrimageAnimeTitles,
  getPilgrimageSpotTitles,
} from '../../../libs/services/pilgrimage/pilgrimage-localization';
import {
  getPilgrimageDetailBackRoute,
  getPilgrimageDetailChromeSeed,
} from '../../../libs/services/pilgrimage/pilgrimage-navigation';
import {
  mergePilgrimageSeriesEntries,
  type PilgrimageSeriesSelection,
} from '../../../libs/services/pilgrimage/pilgrimage-series';
import {
  getPilgrimageDetailViewPreset,
  resolvePilgrimageDetailViewPreset,
  type PilgrimageDetailViewPreset,
} from '../../../libs/services/pilgrimage/pilgrimage-detail-flow';
import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';
import { usePilgrimageDetailView } from '../../../hooks/usePilgrimageDetailView';
import { usePilgrimageDetailData } from '../../../hooks/usePilgrimageDetailData';
import { usePilgrimageUserLocation } from '../../../hooks/usePilgrimageUserLocation';
import { usePilgrimageInteractions } from '../../../hooks/usePilgrimageInteractions';
import { usePilgrimageDerivedSpots } from '../../../hooks/usePilgrimageDerivedSpots';
import { usePilgrimageSpotSheet } from '../../../hooks/usePilgrimageSpotSheet';
import {
  FilterCyclePill,
  LayoutModeButton,
  PilgrimageDetailLoadingShell,
  PilgrimageDetailSheet,
  RoundHeaderButton,
  SeriesDropdownPill,
  SpotClusterPicker,
  SpotMapView,
  SpotSheet,
  VIEW_MODE_TOGGLE_HEIGHT,
  buildBrowseUrl,
  buildMapsURL,
  getPointSourceBangumiId,
  hasValidGeo,
  makePilgrimageDetailStyles,
  type FilterCyclePillState,
} from '../../../components/pilgrimage/detail';

// Sheet snap heights as fractions of the screen — kept in lockstep with the
// snap-points array in PilgrimageDetailSheet. We use them to position the
// floating filter strip and view-mode toggle just above the sheet's peek.
const SHEET_PEEK_FRACTION = 0.16;

export default function PilgrimageDetailScreen() {
  const params = useLocalSearchParams();
  const bangumiId = getNumberParam(params, 'animeId');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  // Frame-1 chrome seed (title / poster / themeColor) carried in by the
  // lister so we can paint hero + accent before any I/O resolves
  // (CLAUDE.md Rule 10). When the real data arrives it replaces the seed.
  const chromeSeed = useMemo(() => getPilgrimageDetailChromeSeed(params), [params]);

  const { view, setView } = usePilgrimageDetailView();
  const {
    seriesSelection,
    viewMode,
    listLayout,
    mapMarkerMode,
    mapOfflineOnly,
    spotFilter,
    spotSearchQuery,
  } = view;

  const resetSeriesSelection = useCallback(() => {
    setView({ seriesSelection: 'all' });
  }, [setView]);
  const { seriesEntries, loading, error, browseSource } = usePilgrimageDetailData(
    bangumiId,
    resetSeriesSelection
  );

  const availableSeriesEntries = useMemo(
    () => seriesEntries.filter((entry) => entry.anime !== null),
    [seriesEntries]
  );
  const effectiveSeriesSelection = useMemo<PilgrimageSeriesSelection>(() => {
    if (seriesSelection === 'all') return 'all';
    return availableSeriesEntries.some((entry) => entry.subject.id === seriesSelection)
      ? seriesSelection
      : 'all';
  }, [availableSeriesEntries, seriesSelection]);
  const mergedSeries = useMemo(
    () => mergePilgrimageSeriesEntries(availableSeriesEntries, effectiveSeriesSelection),
    [availableSeriesEntries, effectiveSeriesSelection]
  );
  const anime = mergedSeries.anime;
  const points = mergedSeries.points;
  const hasSeriesSwitcher = seriesEntries.length > 1;

  const themeColor = anime?.color || chromeSeed.themeColor || theme.accent;
  const themeColorFg = readableTextOn(themeColor);
  const styles = useMemo(
    () => makePilgrimageDetailStyles(theme, insets.top),
    [theme, insets.top]
  );
  const animeTitles = useMemo(
    () => (anime ? getPilgrimageAnimeTitles(anime) : null),
    [anime]
  );
  const animeSubtitle = animeTitles ? formatPilgrimageSubtitle(animeTitles) : undefined;

  const { location: userLocation, heading: userHeading } = usePilgrimageUserLocation();
  const interactions = usePilgrimageInteractions();
  const {
    visited,
    spotIntents,
    captures,
    toggleVisitedPoint,
    toggleGroupedVisited,
    toggleSpotIntent,
    hasIntentForGroup,
  } = interactions;

  const derived = usePilgrimageDerivedSpots({
    anime,
    points,
    userLocation,
    visited,
    captures,
    spotIntents,
    spotFilter,
    spotSearchQuery,
    viewMode,
  });
  const {
    groupedSpots,
    groupedSpotByPointId,
    filteredGroupedSpots,
    filteredPoints,
    filteredPointIds,
    filteredMappablePointCount,
    groupedCounts,
    normalizedSpotSearchQuery,
    fallbackSelectedSpotId,
    spotStats,
    userStats,
    distanceFor,
    distanceForGroup,
    representativeForGroup,
  } = derived;

  const sheet = usePilgrimageSpotSheet({
    groupedSpotByPointId,
    visited,
    captures,
    spotIntents,
    distanceFor,
  });
  const {
    activeSpot,
    clusterSpots,
    selectedSpotId,
    setSelectedSpotId,
    openGroup,
    openSpot,
    openCluster,
    closeSheet,
    closeCluster,
    pickFromCluster,
    activeSpotScenes,
    activeSpotVisitedTarget,
    activeSpotVisited,
    activeSpotSaved,
    activeSpotPlanned,
    activeSpotDistance,
    activeSpotHasCapture,
    activeSpotSceneCount,
  } = sheet;

  // Track the bottom sheet's current snap index so the floating filter strip
  // and view-mode toggle can hide as the sheet covers them. The sheet
  // controls itself; we only react to its onChange to fade the chrome.
  const [sheetIndex, setSheetIndex] = useState<number>(viewMode === 'map' ? 0 : 1);

  useEffect(() => {
    // Keep the floating chrome's "ghost" snap in sync when the user flips
    // the view mode toggle (the sheet itself also snaps via an effect inside
    // PilgrimageDetailSheet).
    setSheetIndex(viewMode === 'map' ? 0 : 1);
  }, [viewMode]);

  // Keep the map's chip-strip selection in sync with the current filtered
  // pointset. If the previous pick was filtered out, fall back to the first
  // valid scene so the strip never lands on a blank chip.
  useEffect(() => {
    setSelectedSpotId((current) => {
      if (viewMode !== 'map' || filteredGroupedSpots.length === 0) {
        return current === null ? current : null;
      }
      return current && filteredPointIds.has(current) ? current : fallbackSelectedSpotId;
    });
  }, [viewMode, filteredGroupedSpots.length, filteredPointIds, fallbackSelectedSpotId, setSelectedSpotId]);

  const posterUri = useMemo(() => {
    const posterSubjectId = anime?.id ?? bangumiId;
    if (typeof posterSubjectId === 'number' && posterSubjectId > 0) {
      return `https://api.bgm.tv/v0/subjects/${posterSubjectId}/image?type=large`;
    }
    return anime?.cover ?? chromeSeed.poster ?? '';
  }, [bangumiId, anime?.id, anime?.cover, chromeSeed.poster]);

  const handleOpenMaps = useCallback((spot: AnitabiPoint) => {
    if (!hasValidGeo(spot.geo)) return;
    Haptics.selectionAsync().catch(() => undefined);
    Linking.openURL(buildMapsURL(spot.geo[0], spot.geo[1], spot.name)).catch(() => undefined);
  }, []);

  const handleToggleSaved = useCallback(
    (spot: AnitabiPoint) => toggleSpotIntent(spot, 'saved', groupedSpotByPointId),
    [toggleSpotIntent, groupedSpotByPointId]
  );
  const handleTogglePlanned = useCallback(
    (spot: AnitabiPoint) => toggleSpotIntent(spot, 'planned', groupedSpotByPointId),
    [toggleSpotIntent, groupedSpotByPointId]
  );

  const activeViewPreset = getPilgrimageDetailViewPreset(viewMode, listLayout);

  const handleViewPresetChange = useCallback(
    (preset: PilgrimageDetailViewPreset) => {
      Haptics.selectionAsync().catch(() => undefined);
      const next = resolvePilgrimageDetailViewPreset(preset);
      setView({ viewMode: next.viewMode, listLayout: next.listLayout });
    },
    [setView]
  );

  const handleOpenBrowse = useCallback(() => {
    if (!anime) return;
    const url = buildBrowseUrl(browseSource, anime.id);
    if (!url) return;
    Linking.openURL(url).catch(() => undefined);
  }, [anime, browseSource]);

  const handleBack = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    const explicitBackRoute = getPilgrimageDetailBackRoute(params);
    if (explicitBackRoute) {
      router.replace(explicitBackRoute);
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/pilgrimage');
    }
  }, [params, router]);

  const handleOpenAlbum = useCallback(() => {
    if (bangumiId === null) return;
    Haptics.selectionAsync().catch(() => undefined);
    router.push({ pathname: '/pilgrimage/album', params: { animeId: String(bangumiId) } });
  }, [router, bangumiId]);

  const handleShare = useCallback(() => {
    if (!anime) return;
    Haptics.selectionAsync().catch(() => undefined);
    const url = buildBrowseUrl(browseSource, anime.id) ?? '';
    Share.share({
      message: `${animeTitles?.primary ?? 'Pilgrimage'} · ${spotStats.spotCount} scenes${url ? `\n${url}` : ''}`,
    }).catch(() => undefined);
  }, [anime, animeTitles?.primary, browseSource, spotStats.spotCount]);

  const browseLabel = useMemo(() => {
    const platform = isSupportedBrowseSource(browseSource) ? browseSource : 'bangumi';
    return PLATFORM_CONFIGS[platform as PlatformType]?.displayName ?? 'Browse';
  }, [browseSource]);

  const buildCompareParams = useCallback(
    (spot: AnitabiPoint) => {
      const lat = hasValidGeo(spot.geo) ? String(spot.geo[0]) : undefined;
      const lng = hasValidGeo(spot.geo) ? String(spot.geo[1]) : undefined;
      const animeTitle = animeTitles?.primary ?? '';
      const spotTitles = getPilgrimageSpotTitles(spot);
      const sourceBangumiId = getPointSourceBangumiId(spot) ?? bangumiId;
      return {
        spotId: spot.id,
        imageUrl: spot.image,
        name: spotTitles.primary,
        ep: String(spot.ep),
        animeId: sourceBangumiId !== null ? String(sourceBangumiId) : '',
        animeTitle,
        themeColor,
        ...(lat ? { spotLat: lat } : {}),
        ...(lng ? { spotLng: lng } : {}),
        // CC BY-NC-SA 4.0 attribution for the reference screenshot. Both
        // fields are optional; the compare screen reads them via
        // useLocalSearchParams and only renders the credit when origin is set.
        ...(spot.origin ? { sceneOrigin: spot.origin } : {}),
        ...(spot.originURL ? { sceneOriginURL: spot.originURL } : {}),
      };
    },
    [bangumiId, animeTitles?.primary, themeColor]
  );

  // Phase 3: close the sheet first, then push the route after the dismiss
  // animation lands. `InteractionManager` defers the navigation until the
  // sheet's spring settles, so the screen never crossfades two animations.
  const handleFrameShot = useCallback(
    (spot: AnitabiPoint) => {
      Haptics.selectionAsync().catch(() => undefined);
      const params = buildCompareParams(spot);
      closeSheet();
      InteractionManager.runAfterInteractions(() => {
        router.push({ pathname: '/pilgrimage/compare/tips', params });
      });
    },
    [buildCompareParams, closeSheet, router]
  );

  const handleStartCamera = useCallback(
    (spot: AnitabiPoint) => {
      Haptics.selectionAsync().catch(() => undefined);
      const params = buildCompareParams(spot);
      closeSheet();
      InteractionManager.runAfterInteractions(() => {
        router.push({ pathname: '/pilgrimage/compare/[spotId]', params });
      });
    },
    [buildCompareParams, closeSheet, router]
  );

  const handleSeriesSelect = useCallback(
    (next: PilgrimageSeriesSelection) => {
      Haptics.selectionAsync().catch(() => undefined);
      setView({ seriesSelection: next });
    },
    [setView]
  );

  const handleSearchChange = useCallback(
    (text: string) => setView({ spotSearchQuery: text }),
    [setView]
  );
  const handleSearchClear = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    setView({ spotSearchQuery: '' });
  }, [setView]);

  const handleSpotFilterChange = useCallback(
    (filter: import('../../../libs/services/pilgrimage/pilgrimage-detail-filter').PilgrimageSpotFilter) => {
      Haptics.selectionAsync().catch(() => undefined);
      setView({ spotFilter: filter });
    },
    [setView]
  );

  const handleMarkerModeToggle = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    setView((v) => ({ mapMarkerMode: v.mapMarkerMode === 'photo' ? 'dot' : 'photo' }));
  }, [setView]);
  const handleOfflineToggle = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    setView((v) => ({ mapOfflineOnly: !v.mapOfflineOnly }));
  }, [setView]);

  const emptyMessage = normalizedSpotSearchQuery
    ? 'No spots match this search.'
    : 'No scenes match this filter.';

  // Build the ordered list of filter states the cycle pill walks through.
  // Always include all / unvisited / visited; conditionally extend with
  // planned / saved / photos when they have data (or when the current
  // selection is one of them, so the cycle can return through it).
  const filterCycleStates = useMemo<readonly FilterCyclePillState[]>(() => {
    const states: FilterCyclePillState[] = [
      { filter: 'all', label: 'All', badge: groupedCounts.all },
      { filter: 'unvisited', label: 'Unvisited', badge: groupedCounts.unvisited },
      { filter: 'visited', label: 'Visited', badge: groupedCounts.visited },
    ];
    if (groupedCounts.planned > 0 || spotFilter === 'planned') {
      states.push({
        filter: 'planned',
        label: 'Planned',
        badge: groupedCounts.planned,
        icon: 'flag',
      });
    }
    if (groupedCounts.saved > 0 || spotFilter === 'saved') {
      states.push({
        filter: 'saved',
        label: 'Saved',
        badge: groupedCounts.saved,
        icon: 'bookmark',
      });
    }
    if (groupedCounts.photos > 0 || spotFilter === 'photos') {
      states.push({
        filter: 'photos',
        label: 'Photos',
        badge: groupedCounts.photos,
        icon: 'camera',
      });
    }
    return states;
  }, [
    groupedCounts.all,
    groupedCounts.unvisited,
    groupedCounts.visited,
    groupedCounts.planned,
    groupedCounts.saved,
    groupedCounts.photos,
    spotFilter,
  ]);

  // The bottom sheet writes its top-edge Y (from the top of the screen) into
  // this shared value every frame. The floating filter strip + view-mode
  // toggle anchor to it via `useAnimatedStyle` so they hug the sheet's edge
  // instead of sitting at a fixed point that disappears behind the sheet at
  // mid snap. Starts at the screen height = sheet closed; gorhom overwrites
  // it on first layout.
  const screenHeight = Dimensions.get('window').height;
  const sheetPosition = useSharedValue(screenHeight);

  // Fallback static offset (used as bottom inset for the chrome when the
  // sheet hasn't laid out yet, or when reduced-motion is on). Keeps the
  // chrome visible above the sheet's peek edge on first paint.
  const sheetPeekOffset = useMemo(() => {
    return Math.max(
      VIEW_MODE_TOGGLE_HEIGHT + insets.bottom + 12,
      Math.round(SHEET_PEEK_FRACTION * screenHeight) + 12
    );
  }, [insets.bottom, screenHeight]);

  const handleSheetIndexChange = useCallback((idx: number) => {
    setSheetIndex(idx);
  }, []);

  // Anchor the chrome to the sheet's top edge with a 10px gap. Hide it once
  // the sheet covers the top half of the screen (full snap) so it doesn't
  // float over the scene grid.
  const chromeAnimatedStyle = useAnimatedStyle(() => {
    const bottom = Math.max(screenHeight - sheetPosition.value + 6, sheetPeekOffset);
    const hidden = sheetPosition.value < screenHeight * 0.18;
    return {
      bottom,
      opacity: hidden ? 0 : 1,
    };
  });

  const isEmpty = !loading && !error && (!anime || points.length === 0);
  const hasMap = !!anime && hasValidGeo(anime.geo) && points.length > 0;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        {loading ? (
          <PilgrimageDetailLoadingShell
            themeColor={themeColor}
            seedTitle={chromeSeed.title ?? null}
            seedSubtitle={chromeSeed.titleSecondary ?? null}
            seedPoster={chromeSeed.poster ?? null}
            topInset={insets.top}
            theme={theme}
            onBack={handleBack}
          />
        ) : error ? (
          <SafeAreaView style={styles.errorContainer}>
            <ThemedText variant="titleMedium" weight="700" align="center">
              Couldn&apos;t load pilgrimage
            </ThemedText>
            <ThemedText variant="bodyMedium" tone="secondary" align="center">
              {error}
            </ThemedText>
            <Pressable
              style={[styles.backBtn, { backgroundColor: theme.accent }]}
              onPress={handleBack}>
              <ThemedText
                variant="bodyMedium"
                weight="700"
                style={{ color: readableTextOn(theme.accent) }}>
                Go back
              </ThemedText>
            </Pressable>
          </SafeAreaView>
        ) : (
          <>
            {/* Layer 1 — map (or themed gradient fallback) fills the screen. */}
            <View style={styles.mapBackground}>
              {hasMap ? (
                <SpotMapView
                  spots={filteredPoints}
                  visited={visited}
                  ringColor={themeColor}
                  userLocation={userLocation}
                  userHeading={userHeading}
                  centerGeo={anime?.geo ?? null}
                  centerZoom={anime?.zoom ?? 12}
                  markerMode={mapMarkerMode}
                  offlineOnly={mapOfflineOnly}
                  focusSpotId={selectedSpotId}
                  controlsBottomOffset={sheetPeekOffset}
                  theme={theme}
                  onSpotPress={openSpot}
                  onClusterPick={openCluster}
                  style={styles.mapBackgroundInner}
                />
              ) : (
                <LinearGradient
                  colors={theme.gradient}
                  style={StyleSheet.absoluteFill}
                />
              )}
              <View style={styles.mapScrim} pointerEvents="none" />
            </View>

            {/* Layer 2 — top-floating chrome (header / search). Series picker
                lives inline next to the back button now (compact dropdown
                pill instead of a horizontal scroll row). */}
            <View style={styles.topOverlay} pointerEvents="box-none">
              <View style={styles.headerActions}>
                <View style={styles.headerLeftGroup}>
                  <RoundHeaderButton
                    icon="chevron-back"
                    onPress={handleBack}
                    accessibilityLabel="Back"
                    tint={theme.text.primary}
                    theme={theme}
                  />
                  {anime && hasSeriesSwitcher ? (
                    <SeriesDropdownPill
                      entries={seriesEntries}
                      availableCount={availableSeriesEntries.length}
                      selection={effectiveSeriesSelection}
                      themeColor={themeColor}
                      themeColorFg={themeColorFg}
                      theme={theme}
                      onSelect={handleSeriesSelect}
                    />
                  ) : null}
                </View>
                <View style={styles.headerRightGroup}>
                  <RoundHeaderButton
                    icon="images-outline"
                    onPress={handleOpenAlbum}
                    accessibilityLabel="Open pilgrimage album"
                    tint={themeColor}
                    theme={theme}
                  />
                  <RoundHeaderButton
                    icon="share-outline"
                    onPress={handleShare}
                    accessibilityLabel="Share"
                    tint={theme.text.primary}
                    theme={theme}
                  />
                </View>
              </View>

              {anime ? (
                <View style={styles.searchPill}>
                  <Ionicons name="search" size={16} color={theme.text.tertiary} />
                  <TextInput
                    value={spotSearchQuery}
                    onChangeText={handleSearchChange}
                    placeholder="Search spot or EP"
                    placeholderTextColor={theme.text.tertiary}
                    returnKeyType="search"
                    autoCorrect={false}
                    autoCapitalize="none"
                    selectionColor={themeColor}
                    clearButtonMode="never"
                    accessibilityLabel="Search pilgrimage spots or episodes"
                    style={[styles.searchInput, { color: theme.text.primary }]}
                  />
                  {normalizedSpotSearchQuery ? (
                    <Pressable
                      onPress={handleSearchClear}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Clear search"
                      style={({ pressed }) => [
                        styles.searchClearBtn,
                        pressed && { opacity: 0.7 },
                      ]}>
                      <Ionicons name="close-circle" size={18} color={theme.text.tertiary} />
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>

            {/* Layer 3 — map-side dock for marker / offline toggles. Only in
                map view, and only when we have a real map underneath. */}
            {hasMap && viewMode === 'map' && sheetIndex <= 1 ? (
              <View
                style={[styles.mapOptionsDock, { top: insets.top + 132 }]}
                pointerEvents="box-none">
                <LayoutModeButton
                  icon={mapMarkerMode === 'photo' ? 'image-outline' : 'ellipse'}
                  active={mapMarkerMode === 'dot'}
                  themeColor={themeColor}
                  themeColorFg={themeColorFg}
                  theme={theme}
                  accessibilityLabel={
                    mapMarkerMode === 'photo' ? 'Use dot map markers' : 'Use photo map markers'
                  }
                  onPress={handleMarkerModeToggle}
                />
                <LayoutModeButton
                  icon="cloud-offline-outline"
                  active={mapOfflineOnly}
                  themeColor={themeColor}
                  themeColorFg={themeColorFg}
                  theme={theme}
                  accessibilityLabel="Use cached map tiles only"
                  onPress={handleOfflineToggle}
                />
              </View>
            ) : null}

            {/* Layer 4+5 — floating chrome (filter cycle pill + view-mode
                toggle), anchored to the bottom sheet's top edge so it slides
                with the sheet rather than getting buried at mid snap. Hidden
                at full snap so it doesn't float over the scene grid. */}
            {anime ? (
              <Animated.View
                style={[styles.bottomChromeWrap, chromeAnimatedStyle]}
                pointerEvents="box-none">
                <View style={styles.filterCycleRow}>
                  <FilterCyclePill
                    states={filterCycleStates}
                    current={spotFilter}
                    themeColor={themeColor}
                    themeColorFg={themeColorFg}
                    theme={theme}
                    onCycle={handleSpotFilterChange}
                  />
                </View>
                <View style={styles.viewModeWrapInner}>
                  <View style={styles.viewModeBar}>
                    <ViewModeSegment
                      icon="apps"
                      label="Grid"
                      count={filteredGroupedSpots.length}
                      active={activeViewPreset === 'grid'}
                      themeColor={themeColor}
                      themeColorFg={themeColorFg}
                      theme={theme}
                      styles={styles}
                      onPress={() => handleViewPresetChange('grid')}
                    />
                    <ViewModeSegment
                      icon="reorder-three"
                      label="Rows"
                      count={filteredGroupedSpots.length}
                      active={activeViewPreset === 'rows'}
                      themeColor={themeColor}
                      themeColorFg={themeColorFg}
                      theme={theme}
                      styles={styles}
                      onPress={() => handleViewPresetChange('rows')}
                    />
                    <ViewModeSegment
                      icon="map"
                      label="Map"
                      count={filteredMappablePointCount}
                      active={activeViewPreset === 'map'}
                      themeColor={themeColor}
                      themeColorFg={themeColorFg}
                      theme={theme}
                      styles={styles}
                      onPress={() => handleViewPresetChange('map')}
                    />
                  </View>
                </View>
              </Animated.View>
            ) : null}

            {/* Layer 6 — persistent pull-up bottom sheet with anime info
                + scene grid. Snaps follow viewMode (peek for map, mid for
                grid/rows). */}
            <PilgrimageDetailSheet
              anime={anime}
              animeTitles={animeTitles}
              animeSubtitle={animeSubtitle}
              browseLabel={browseLabel}
              posterUri={posterUri}
              spotStats={spotStats}
              userStats={userStats}
              filteredGroupedSpots={filteredGroupedSpots}
              totalSpotCount={groupedSpots.length}
              listLayout={listLayout}
              viewMode={viewMode}
              themeColor={themeColor}
              themeColorFg={themeColorFg}
              theme={theme}
              visited={visited}
              captures={captures}
              spotIntents={spotIntents}
              emptyMessage={isEmpty ? 'No pilgrimage data yet for this anime.' : emptyMessage}
              animatedPosition={sheetPosition}
              onSheetIndexChange={handleSheetIndexChange}
              onOpenBrowse={handleOpenBrowse}
              onSpotPress={openGroup}
              onToggleVisited={toggleGroupedVisited}
              onOpenMaps={handleOpenMaps}
              onTakeComparison={handleFrameShot}
              representativeForGroup={representativeForGroup}
              distanceForGroup={distanceForGroup}
              hasIntentForGroup={hasIntentForGroup}
            />
          </>
        )}

        {/* Spot sheet + cluster picker stack on top of everything when open. */}
        <SpotSheet
          spot={activeSpot}
          scenes={activeSpotScenes}
          sceneCount={activeSpotSceneCount}
          themeColor={themeColor}
          themeColorFg={themeColorFg}
          distanceKm={activeSpotDistance}
          visitedTarget={activeSpotVisitedTarget}
          visited={activeSpotVisited}
          saved={activeSpotSaved}
          planned={activeSpotPlanned}
          hasCapture={activeSpotHasCapture}
          anitabiBangumiId={anime?.id ?? bangumiId ?? null}
          theme={theme}
          onClose={closeSheet}
          onToggleVisited={toggleVisitedPoint}
          onToggleSaved={handleToggleSaved}
          onTogglePlanned={handleTogglePlanned}
          onOpenMaps={handleOpenMaps}
          onStartCamera={handleStartCamera}
          onFrameShot={handleFrameShot}
          onSelectScene={openSpot}
        />

        <SpotClusterPicker
          spots={clusterSpots}
          themeColor={themeColor}
          themeColorFg={themeColorFg}
          visited={visited}
          theme={theme}
          distanceFor={distanceFor}
          onClose={closeCluster}
          onPick={pickFromCluster}
        />
      </View>
    </>
  );
}

// Segmented view-mode tab. Inlined here because it's a tiny presentational
// helper specific to this route's floating toggle — a separate file would
// add more import noise than the local component is worth.
interface ViewModeSegmentProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  count: number;
  active: boolean;
  themeColor: string;
  themeColorFg: string;
  theme: ReturnType<typeof useTheme>['theme'];
  styles: ReturnType<typeof makePilgrimageDetailStyles>;
  onPress: () => void;
}

function ViewModeSegment({
  icon,
  label,
  count,
  active,
  themeColor,
  themeColorFg,
  theme,
  styles,
  onPress,
}: ViewModeSegmentProps) {
  const fg = active ? themeColorFg : theme.text.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.viewModeSegment,
        active
          ? { backgroundColor: themeColor }
          : { backgroundColor: 'transparent' },
        pressed && { opacity: 0.86 },
      ]}>
      <Ionicons name={icon} size={14} color={fg} />
      <ThemedText variant="bodySmall" weight="700" style={{ color: fg }}>
        {label}
      </ThemedText>
      <View
        style={[
          styles.viewModeSegmentBadge,
          active
            ? { backgroundColor: `${themeColorFg}22` }
            : { backgroundColor: theme.background.tertiary },
        ]}>
        <ThemedText variant="captionSmall" weight="700" style={{ color: fg }}>
          {count}
        </ThemedText>
      </View>
    </Pressable>
  );
}
