// Pilgrimage detail "header" — the parallax hero + stats card + filter
// controls that ride above the list. Used as FlashList ListHeaderComponent
// in list/grid modes and inside the Animated.ScrollView in map / empty modes.
//
// All input is plumbed in via props (no hooks) so the same chunk renders
// identically in both scroll surfaces.

import React from 'react';
import { Linking, Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText, readableTextOn } from '../../themed';
import type { ThemePalette } from '../../../context/ThemeContext';
import { getPilgrimageAnimeTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import { mergePilgrimageSeriesEntries } from '../../../libs/services/pilgrimage/pilgrimage-series';
import type {
  PilgrimageSeriesEntry,
  PilgrimageSeriesSelection,
} from '../../../libs/services/pilgrimage/pilgrimage-series';
import {
  countPilgrimageSpotFilters,
  type PilgrimageSpotFilter,
} from '../../../libs/services/pilgrimage/pilgrimage-detail-filter';
import type { PilgrimageDetailViewPreset } from '../../../libs/services/pilgrimage/pilgrimage-detail-flow';
import { DetailViewPresetButton } from './DetailViewPresetButton';
import { FilterPill } from './FilterPill';
import { SeriesSwitchRow } from './SeriesSwitch';
import { StatCell } from './StatCell';
import { formatDistanceKm } from './_helpers';
import type { PilgrimageDetailStyles } from './routeStyles';

export interface PilgrimageDetailHeaderProps {
  anime: ReturnType<typeof mergePilgrimageSeriesEntries>['anime'];
  animeTitles: ReturnType<typeof getPilgrimageAnimeTitles> | null;
  animeSubtitle?: string;
  browseLabel: string;
  filteredGroupedSpotsLength: number;
  filteredMappablePointCount: number;
  groupedCounts: ReturnType<typeof countPilgrimageSpotFilters>;
  hasSeriesSwitcher: boolean;
  heroAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  heroContentStyle: ReturnType<typeof useAnimatedStyle>;
  isEmpty: boolean;
  normalizedSpotSearchQuery: string;
  onOpenBrowse: () => void;
  onSearchChange: (text: string) => void;
  onSearchClear: () => void;
  onSeriesSelect: (next: PilgrimageSeriesSelection) => void;
  onSpotFilterChange: (filter: PilgrimageSpotFilter) => void;
  onViewPresetChange: (preset: PilgrimageDetailViewPreset) => void;
  posterUri: string;
  seriesEntries: readonly PilgrimageSeriesEntry[];
  effectiveSeriesSelection: PilgrimageSeriesSelection;
  availableSeriesEntriesCount: number;
  spotFilter: PilgrimageSpotFilter;
  spotSearchQuery: string;
  spotStats: { spotCount: number; radiusKm: number };
  userStats: { visitedCount: number; capturedCount: number };
  activeViewPreset: PilgrimageDetailViewPreset;
  styles: PilgrimageDetailStyles;
  theme: ThemePalette;
  themeColor: string;
  themeColorFg: string;
}

export function PilgrimageDetailHeader(props: PilgrimageDetailHeaderProps) {
  const {
    anime,
    animeTitles,
    animeSubtitle,
    browseLabel,
    filteredGroupedSpotsLength,
    filteredMappablePointCount,
    groupedCounts,
    hasSeriesSwitcher,
    heroAnimatedStyle,
    heroContentStyle,
    isEmpty,
    normalizedSpotSearchQuery,
    onOpenBrowse,
    onSearchChange,
    onSearchClear,
    onSeriesSelect,
    onSpotFilterChange,
    onViewPresetChange,
    posterUri,
    seriesEntries,
    effectiveSeriesSelection,
    availableSeriesEntriesCount,
    spotFilter,
    spotSearchQuery,
    spotStats,
    userStats,
    activeViewPreset,
    styles,
    theme,
    themeColor,
    themeColorFg,
  } = props;
  return (
    <>
      <View style={styles.heroWrap}>
        <Animated.View style={[styles.heroImageWrap, heroAnimatedStyle]}>
          <Image
            source={posterUri ? { uri: posterUri } : null}
            style={styles.heroImage}
            contentFit="cover"
            transition={250}
          />
        </Animated.View>
        <LinearGradient
          colors={[
            'rgba(0,0,0,0)',
            `${theme.background.primary}66`,
            `${theme.background.primary}E6`,
            theme.background.primary,
          ]}
          locations={[0, 0.4, 0.78, 1]}
          style={styles.heroGradient}
        />
        <Animated.View style={[styles.heroOverlay, heroContentStyle]}>
          {anime ? (
            <View
              style={[
                styles.heroSpotBadge,
                { borderColor: `${themeColor}66`, backgroundColor: `${themeColor}1A` },
              ]}>
              <Ionicons name="location" size={11} color={themeColor} />
              <ThemedText variant="captionSmall" weight="700" style={{ color: themeColor }}>
                {spotStats.spotCount}{' '}
                {spotStats.spotCount === 1 ? 'pilgrimage scene' : 'pilgrimage scenes'}
              </ThemedText>
            </View>
          ) : null}
          <ThemedText variant="headlineLarge" weight="800" numberOfLines={2}>
            {animeTitles?.primary ?? ''}
          </ThemedText>
          {animeSubtitle ? (
            <ThemedText variant="bodyMedium" tone="secondary" numberOfLines={1}>
              {animeSubtitle}
              {anime?.city ? ` · ${anime.city}` : ''}
            </ThemedText>
          ) : anime?.city ? (
            <ThemedText variant="bodyMedium" tone="secondary" numberOfLines={1}>
              {anime.city}
            </ThemedText>
          ) : null}

          {anime ? (
            <Pressable
              onPress={onOpenBrowse}
              style={({ pressed }) => [
                styles.browseBtn,
                {
                  borderColor: `${themeColor}66`,
                  backgroundColor: `${theme.background.primary}80`,
                },
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button">
              <Ionicons name="open-outline" size={13} color={theme.text.primary} />
              <ThemedText variant="captionSmall" weight="600">
                {browseLabel}
              </ThemedText>
            </Pressable>
          ) : null}
        </Animated.View>
      </View>

      {anime ? (
        <View style={styles.statsCard}>
          <StatCell
            icon="place"
            value={String(spotStats.spotCount)}
            label={spotStats.spotCount === 1 ? 'scene' : 'scenes'}
            color={themeColor}
            theme={theme}
          />
          <View style={styles.statDivider} />
          <StatCell
            icon="my-location"
            value={spotStats.radiusKm > 0 ? `~${formatDistanceKm(spotStats.radiusKm)}` : '—'}
            label="radius"
            color={themeColor}
            theme={theme}
          />
          <View style={styles.statDivider} />
          <StatCell
            icon="check-circle"
            value={`${userStats.visitedCount}`}
            label="visited"
            color={userStats.visitedCount > 0 ? theme.status.success : themeColor}
            theme={theme}
          />
          <View style={styles.statDivider} />
          <StatCell
            icon="photo-camera"
            value={`${userStats.capturedCount}`}
            label="photos"
            color={userStats.capturedCount > 0 ? themeColor : theme.text.tertiary}
            theme={theme}
          />
        </View>
      ) : null}

      {!isEmpty && anime ? (
        <View style={styles.controlsPanel}>
          {hasSeriesSwitcher ? (
            <SeriesSwitchRow
              entries={seriesEntries}
              availableCount={availableSeriesEntriesCount}
              selection={effectiveSeriesSelection}
              themeColor={themeColor}
              themeColorFg={themeColorFg}
              theme={theme}
              onSelect={onSeriesSelect}
            />
          ) : null}

          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={theme.text.tertiary} />
            <TextInput
              value={spotSearchQuery}
              onChangeText={onSearchChange}
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
                onPress={onSearchClear}
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

          <View style={styles.viewPresetGroup}>
            <DetailViewPresetButton
              active={activeViewPreset === 'grid'}
              label="Grid"
              icon="apps"
              themeColor={themeColor}
              themeColorFg={themeColorFg}
              count={filteredGroupedSpotsLength}
              theme={theme}
              onPress={() => onViewPresetChange('grid')}
            />
            <DetailViewPresetButton
              active={activeViewPreset === 'rows'}
              label="Rows"
              icon="reorder-three"
              themeColor={themeColor}
              themeColorFg={themeColorFg}
              count={filteredGroupedSpotsLength}
              theme={theme}
              onPress={() => onViewPresetChange('rows')}
            />
            <DetailViewPresetButton
              active={activeViewPreset === 'map'}
              label="Map"
              icon="map"
              themeColor={themeColor}
              themeColorFg={themeColorFg}
              count={filteredMappablePointCount}
              theme={theme}
              onPress={() => onViewPresetChange('map')}
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillsRow}>
            <FilterPill
              label="All"
              active={spotFilter === 'all'}
              badge={groupedCounts.all}
              themeColor={themeColor}
              themeColorFg={themeColorFg}
              theme={theme}
              onPress={() => onSpotFilterChange('all')}
            />
            <FilterPill
              label="Unvisited"
              active={spotFilter === 'unvisited'}
              badge={groupedCounts.unvisited}
              themeColor={themeColor}
              themeColorFg={themeColorFg}
              theme={theme}
              onPress={() => onSpotFilterChange('unvisited')}
            />
            <FilterPill
              label="Visited"
              active={spotFilter === 'visited'}
              badge={groupedCounts.visited}
              themeColor={themeColor}
              themeColorFg={themeColorFg}
              theme={theme}
              onPress={() => onSpotFilterChange('visited')}
            />
            {groupedCounts.planned > 0 || spotFilter === 'planned' ? (
              <FilterPill
                label="Planned"
                active={spotFilter === 'planned'}
                badge={groupedCounts.planned}
                themeColor={themeColor}
                themeColorFg={themeColorFg}
                theme={theme}
                icon="flag"
                onPress={() => onSpotFilterChange('planned')}
              />
            ) : null}
            {groupedCounts.saved > 0 || spotFilter === 'saved' ? (
              <FilterPill
                label="Saved"
                active={spotFilter === 'saved'}
                badge={groupedCounts.saved}
                themeColor={themeColor}
                themeColorFg={themeColorFg}
                theme={theme}
                icon="bookmark"
                onPress={() => onSpotFilterChange('saved')}
              />
            ) : null}
            {groupedCounts.photos > 0 || spotFilter === 'photos' ? (
              <FilterPill
                label="Photos"
                active={spotFilter === 'photos'}
                badge={groupedCounts.photos}
                themeColor={themeColor}
                themeColorFg={themeColorFg}
                theme={theme}
                icon="camera"
                onPress={() => onSpotFilterChange('photos')}
              />
            ) : null}
          </ScrollView>
        </View>
      ) : null}
    </>
  );
}

export interface PilgrimageEmptyCardProps {
  styles: PilgrimageDetailStyles;
  theme: ThemePalette;
}

export function PilgrimageEmptyCard({ styles, theme }: PilgrimageEmptyCardProps) {
  return (
    <View style={styles.emptyCard}>
      <MaterialIcons name="explore-off" size={36} color={theme.text.tertiary} />
      <ThemedText variant="titleMedium" weight="700" align="center">
        No pilgrimage data yet for this anime
      </ThemedText>
      <ThemedText variant="bodySmall" tone="secondary" align="center">
        Anitabi crowd-sources scene locations. Help fill the map by contributing on anitabi.cn.
      </ThemedText>
      <Pressable
        onPress={() => Linking.openURL('https://anitabi.cn').catch(() => undefined)}
        style={({ pressed }) => [
          styles.emptyBtn,
          { backgroundColor: theme.accent },
          pressed && { opacity: 0.85 },
        ]}>
        <Ionicons name="open-outline" size={14} color={readableTextOn(theme.accent)} />
        <ThemedText
          variant="bodySmall"
          weight="700"
          style={{ color: readableTextOn(theme.accent) }}>
          Open Anitabi
        </ThemedText>
      </Pressable>
    </View>
  );
}
