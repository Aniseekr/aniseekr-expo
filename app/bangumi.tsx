// Bangumi seasonal screen — calendar mode uses the iOS-style focus-day carousel
// with a sticky today section on top, plus a list mode fallback.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SeasonHeader } from '../components/bangumi/SeasonHeader';
import { Anime } from '../components/rate/types';
import { AnimeList, AnimeRowCard } from '../components/bangumi/AnimeList';
import { FocusDayCarousel } from '../components/bangumi/FocusDayCarousel';
import { TodayUpdatesSection } from '../components/bangumi/TodayUpdatesSection';
import { AnimeRepository } from '../libs/repositories/anime-repository';
import { animeNotificationService } from '../modules/notifications/animeNotificationService';
import {
  Colors,
  FontFamily,
  Radius,
  Spacing,
  Typography,
} from '../constants/DesignSystem';
import { BrowseSourceChip } from '../components/common/BrowseSourceChip';

type ViewMode = 'calendar' | 'list';
type FilterMode = 'all' | 'tracking';
type Season = 'winter' | 'spring' | 'summer' | 'fall';

interface DailyAnime {
  day: string;
  anime: Anime[];
}

const weekDays = [
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
  'Sundays',
];

function getCurrentSeason(): { season: Season; year: number } {
  const date = new Date();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  let season: Season = 'winter';
  if (month >= 4 && month <= 6) season = 'spring';
  else if (month >= 7 && month <= 9) season = 'summer';
  else if (month >= 10) season = 'fall';

  return { season, year };
}

function getTodayDayString(): string {
  const day = new Date().getDay();
  const dayMapping: { [key: number]: string } = {
    0: 'Sundays',
    1: 'Mondays',
    2: 'Tuesdays',
    3: 'Wednesdays',
    4: 'Thursdays',
    5: 'Fridays',
    6: 'Saturdays',
  };
  return dayMapping[day] || 'Mondays';
}

export default function BangumiScreen() {
  const { top } = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [filterMode, setFilterMode] = useState<FilterMode>('tracking');
  const [showUnknownDays] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const { season: currentSeason, year: currentYear } = getCurrentSeason();
  const [selectedSeason, setSelectedSeason] = useState<Season>(currentSeason);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [groupedAnime, setGroupedAnime] = useState<DailyAnime[]>([]);

  useEffect(() => {
    onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeason, selectedYear]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setIsLoading(true);
    try {
      const rawAnime = await AnimeRepository.getSeasonalAnime(
        selectedSeason.toUpperCase(),
        selectedYear
      );

      const days = [
        'Sundays',
        'Mondays',
        'Tuesdays',
        'Wednesdays',
        'Thursdays',
        'Fridays',
        'Saturdays',
      ];
      const grouped: { [key: string]: Anime[] } = {};
      days.forEach((d) => (grouped[d] = []));
      grouped['Unknown'] = [];

      rawAnime.forEach((anime: Anime) => {
        if (anime.nextAiringEpisode && anime.nextAiringEpisode.airingAt) {
          const date = new Date(anime.nextAiringEpisode.airingAt * 1000);
          const dayIndex = date.getDay();
          const dayName = days[dayIndex];
          grouped[dayName].push(anime);
        } else {
          grouped['Unknown'].push(anime);
        }
      });

      const dailyAnimeList: DailyAnime[] = [
        ...days.map((day) => ({ day, anime: grouped[day] })),
        { day: 'Unknown', anime: grouped['Unknown'] },
      ];
      setGroupedAnime(dailyAnimeList);
    } catch (e) {
      console.error('Failed to fetch bangumi', e);
    } finally {
      setRefreshing(false);
      setIsLoading(false);
    }
  }, [selectedSeason, selectedYear]);

  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => (prev === 'calendar' ? 'list' : 'calendar'));
  }, []);

  const switchToPreviousSeason = useCallback(() => {
    const seasonOrder: Season[] = ['winter', 'spring', 'summer', 'fall'];
    const currentIndex = seasonOrder.indexOf(selectedSeason);
    if (currentIndex === 0) {
      setSelectedYear((prev) => prev - 1);
      setSelectedSeason('fall');
    } else {
      setSelectedSeason(seasonOrder[currentIndex - 1]);
    }
  }, [selectedSeason]);

  const switchToNextSeason = useCallback(() => {
    const seasonOrder: Season[] = ['winter', 'spring', 'summer', 'fall'];
    const currentIndex = seasonOrder.indexOf(selectedSeason);
    if (currentIndex === seasonOrder.length - 1) {
      setSelectedYear((prev) => prev + 1);
      setSelectedSeason('winter');
    } else {
      setSelectedSeason(seasonOrder[currentIndex + 1]);
    }
  }, [selectedSeason]);

  const seasonDisplayName = useMemo(
    () =>
      `${selectedYear} ${selectedSeason.charAt(0).toUpperCase() + selectedSeason.slice(1)}`,
    [selectedSeason, selectedYear]
  );

  const totalCount = useMemo(
    () => groupedAnime.reduce((acc, g) => acc + g.anime.length, 0),
    [groupedAnime]
  );

  const todayDay = getTodayDayString();
  const todayAnime = useMemo(
    () => groupedAnime.find((g) => g.day === todayDay)?.anime ?? [],
    [groupedAnime, todayDay]
  );

  const listViewData = groupedAnime.filter(
    (g) => g.anime.length > 0 || (g.day === 'Unknown' && showUnknownDays)
  );

  // Request notification permissions on mount
  useEffect(() => {
    animeNotificationService.requestPermissions();
  }, []);

  if (isLoading && !refreshing && groupedAnime.length === 0) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={Colors.gradients.background as [string, string, ...string[]]}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={[styles.safe, styles.center, { paddingTop: top }]}>
          <Text style={styles.loadingText}>Loading...</Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={Colors.gradients.background as [string, string, ...string[]]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={[styles.safe, { paddingTop: top > 0 ? 0 : Spacing.xs }]}>
        <View style={styles.chipRow}>
          <BrowseSourceChip />
        </View>

        <View style={styles.headerWrap}>
          <SeasonHeader
            seasonDisplayName={seasonDisplayName}
            onPrevSeason={switchToPreviousSeason}
            onNextSeason={switchToNextSeason}
            filterMode={filterMode}
            onFilterChange={setFilterMode}
            viewMode={viewMode}
            onViewModeToggle={toggleViewMode}
            totalCount={totalCount}
          />
        </View>

        {viewMode === 'calendar' ? (
          <View style={styles.calendarContainer}>
            <TodayUpdatesSection todayAnime={todayAnime} />
            <FocusDayCarousel
              weekDays={weekDays}
              groupedAnime={groupedAnime}
              showUnknownDays={showUnknownDays}
              isCurrentDay={(day) => day === todayDay}
              initialDay={todayDay}
            />
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 140 }}
            refreshControl={
              <RefreshControl
                tintColor={Colors.text.primary}
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[Colors.primary]}
                progressBackgroundColor={Colors.background.secondary}
              />
            }>
            {/* Show a compact weekly calendar above the list as a navigator */}
            {todayAnime.length > 0 ? (
              <TodayUpdatesSection todayAnime={todayAnime} />
            ) : null}
            <AnimeList
              listViewData={listViewData}
              renderAnimeCard={(anime) => <AnimeRowCard key={anime.id} anime={anime} />}
            />
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  safe: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...Typography.bodyLarge,
    color: Colors.text.primary,
    fontFamily: FontFamily.text,
  },
  calendarContainer: {
    flex: 1,
    minHeight: 400,
    paddingTop: Spacing.xs,
  },
  chipRow: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  headerWrap: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    ...Platform.select({
      android: { elevation: 0 },
    }),
    borderRadius: Radius.card,
  },
});
