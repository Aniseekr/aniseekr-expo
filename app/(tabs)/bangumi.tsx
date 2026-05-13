// Bangumi seasonal screen — calendar mode uses the iOS-style focus-day carousel
// with a sticky today section on top, plus a list mode fallback.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SeasonHeader } from '../../components/bangumi/SeasonHeader';
import { Anime } from '../../components/rate/types';
import { AnimeList, AnimeRowCard } from '../../components/bangumi/AnimeList';
import { FocusDayCarousel } from '../../components/bangumi/FocusDayCarousel';
import { TodayUpdatesSection } from '../../components/bangumi/TodayUpdatesSection';
import { SpecialContentSection } from '../../components/bangumi/SpecialContentSection';
import { YearPickerSheet } from '../../components/bangumi/YearPickerSheet';
import {
  BangumiSettingsSheet,
  BangumiTypeFilter,
  DEFAULT_BANGUMI_PREFS,
  BangumiPreferences,
} from '../../components/bangumi/BangumiSettingsSheet';
import { NotificationManagerSheet } from '../../components/bangumi/NotificationManagerSheet';
import { shareSchedule } from '../../components/bangumi/shareSchedule';
import { ShareScheduleCard } from '../../components/bangumi/ShareScheduleCard';
import { AddTrackingSheet } from '../../components/bangumi/AddTrackingSheet';
import { BangumiActionSnackbar } from '../../components/bangumi/BangumiActionSnackbar';
import { AnimeRepository } from '../../libs/repositories/anime-repository';
import { dataSourceConfig } from '../../libs/services/data-source-config';
import { animeNotificationService } from '../../modules/notifications/animeNotificationService';
import { loadBangumiPrefs, saveBangumiPrefs } from '../../libs/services/bangumi-prefs';
import { loadUserPrefs, patchUserPrefs } from '../../libs/services/user-prefs';
import { trackingService } from '../../libs/services/tracking/tracking-service';
import { Colors, FontFamily, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { Skeleton } from '../../components/themed';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

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

function matchesTypeFilter(anime: Anime, filter: BangumiTypeFilter): boolean {
  if (filter === 'all') return true;
  const f = (anime.format ?? '').toUpperCase();
  switch (filter) {
    case 'tv':
      return f === 'TV' || f === 'TV_SHORT';
    case 'movie':
      return f === 'MOVIE';
    case 'ova':
      return f === 'OVA';
    case 'special':
      return f === 'SPECIAL' || f === 'ONA';
    default:
      return true;
  }
}

export default function BangumiScreen() {
  const { top } = useSafeAreaInsets();
  const { theme } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { season: currentSeason, year: currentYear } = getCurrentSeason();
  const [selectedSeason, setSelectedSeason] = useState<Season>(currentSeason);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [rawAnime, setRawAnime] = useState<Anime[]>([]);
  const [sourcePlatform, setSourcePlatform] = useState<string>(() => dataSourceConfig.browseSource);
  const [prefs, setPrefsState] = useState<BangumiPreferences>(DEFAULT_BANGUMI_PREFS);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNotifManager, setShowNotifManager] = useState(false);
  const [pendingShare, setPendingShare] = useState(false);
  const [trackingTarget, setTrackingTarget] = useState<Anime | null>(null);
  const [adultContent, setAdultContent] = useState(false);
  const [trackedIds, setTrackedIds] = useState<Set<string>>(() => new Set());
  const [snackbar, setSnackbar] = useState<{
    key: number;
    message: string;
    icon: React.ComponentProps<typeof MaterialIcons>['name'];
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const hydratedRef = useRef(false);
  const shareCardRef = useRef<View>(null);

  const setPrefs = useCallback<React.Dispatch<React.SetStateAction<BangumiPreferences>>>((next) => {
    setPrefsState((prev) => {
      const resolved =
        typeof next === 'function'
          ? (next as (p: BangumiPreferences) => BangumiPreferences)(prev)
          : next;
      // Only persist after the initial hydration completes so we don't
      // immediately overwrite saved prefs with the default state.
      if (hydratedRef.current) {
        void saveBangumiPrefs(resolved);
      }
      return resolved;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [loaded, userPrefs, ids] = await Promise.all([
        loadBangumiPrefs(),
        loadUserPrefs(),
        trackingService.getTrackedIdSet(),
      ]);
      if (cancelled) return;
      setPrefsState(loaded);
      setAdultContent(userPrefs.allowAdultContent);
      setTrackedIds(ids);
      hydratedRef.current = true;
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return trackingService.onTrackedIdsChange((ids) => setTrackedIds(new Set(ids)));
  }, []);

  const handleAdultContentChange = useCallback((value: boolean) => {
    setAdultContent(value);
    void patchUserPrefs({ allowAdultContent: value });
  }, []);

  const handleQuickAddWishlist = useCallback(async (anime: Anime) => {
    try {
      await trackingService.upsertTracking({
        animeId: anime.id,
        status: 'planned',
        title: anime.title,
        imageUrl: anime.image,
        totalEpisodes: anime.episodes,
      });
      hapticsBridge.success();
      setSnackbar({
        key: Date.now(),
        message: `Added "${anime.title}" to Wishlist`,
        icon: 'bookmark-added',
        actionLabel: 'Undo',
        onAction: () => {
          void trackingService.removeTracking(anime.id);
        },
      });
    } catch (e) {
      console.warn('[bangumi] quick wishlist failed', e);
      hapticsBridge.warning();
      setSnackbar({
        key: Date.now(),
        message: "Couldn't add to Wishlist",
        icon: 'error-outline',
      });
    }
  }, []);

  const handleToggleReminder = useCallback(
    async (anime: Anime, currentlyScheduled: boolean) => {
      try {
        if (currentlyScheduled) {
          await animeNotificationService.cancelAnimeNotification(anime.id);
          setSnackbar({
            key: Date.now(),
            message: `Reminder cancelled`,
            icon: 'notifications-off',
          });
        } else {
          const id = await animeNotificationService.scheduleAnimeNotification(anime);
          setSnackbar({
            key: Date.now(),
            message: id
              ? `Reminder set for "${anime.title}"`
              : `Reminders unavailable in Expo Go`,
            icon: id ? 'notifications-active' : 'info',
          });
        }
        hapticsBridge.selection();
      } catch (e) {
        console.warn('[bangumi] reminder toggle failed', e);
        hapticsBridge.warning();
      }
    },
    []
  );

  const dismissSnackbar = useCallback(() => setSnackbar(null), []);

  const viewMode = prefs.viewMode;
  const filterMode = prefs.filterMode;
  const showUnknownDays = prefs.showUnknownDays;
  const typeFilter = prefs.typeFilter;
  const setFilterMode = useCallback(
    (mode: FilterMode) => setPrefs((p) => ({ ...p, filterMode: mode })),
    [setPrefs]
  );

  const fetchSeason = useCallback(
    async (forceRefresh: boolean) => {
      setIsLoading(true);
      try {
        const fetched = await AnimeRepository.getSeasonalAnime(
          selectedSeason.toUpperCase(),
          selectedYear,
          1,
          { perPage: 50, maxItems: 200, forceRefresh }
        );
        setRawAnime(fetched);
        setSourcePlatform(dataSourceConfig.browseSource);
        setError(null);
      } catch (e) {
        console.error('Failed to fetch bangumi', e);
        setError("Couldn't load this season. Pull to retry.");
      } finally {
        setIsLoading(false);
      }
    },
    [selectedSeason, selectedYear]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchSeason(true);
    } finally {
      setRefreshing(false);
    }
  }, [fetchSeason]);

  useEffect(() => {
    if (!hydrated) return;
    fetchSeason(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeason, selectedYear, hydrated]);

  const filteredAnime = useMemo(() => {
    return rawAnime.filter((a) => {
      if (!matchesTypeFilter(a, typeFilter)) return false;
      if (filterMode === 'tracking' && !trackedIds.has(a.id)) return false;
      return true;
    });
  }, [rawAnime, typeFilter, filterMode, trackedIds]);

  const groupedAnime = useMemo<DailyAnime[]>(() => {
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

    filteredAnime.forEach((anime) => {
      if (anime.nextAiringEpisode && anime.nextAiringEpisode.airingAt) {
        const date = new Date(anime.nextAiringEpisode.airingAt * 1000);
        const dayIndex = date.getDay();
        const dayName = days[dayIndex];
        grouped[dayName].push(anime);
      } else {
        grouped['Unknown'].push(anime);
      }
    });

    return [
      ...days.map((day) => ({ day, anime: grouped[day] })),
      { day: 'Unknown', anime: grouped['Unknown'] },
    ];
  }, [filteredAnime]);

  const toggleViewMode = useCallback(() => {
    setPrefs((p) => ({ ...p, viewMode: p.viewMode === 'calendar' ? 'list' : 'calendar' }));
  }, [setPrefs]);

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
    () => `${selectedYear} ${selectedSeason.charAt(0).toUpperCase() + selectedSeason.slice(1)}`,
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

  const specialAnime = useMemo(() => {
    // When the user picks a non-'all' type filter, the daily list already
    // reflects exactly what they want — hide the "Movies & specials" section
    // to avoid redundant or contradictory rows.
    if (typeFilter !== 'all') return [];
    const isSpecial = (a: Anime) => {
      const f = (a.format ?? '').toUpperCase();
      return ['MOVIE', 'OVA', 'ONA', 'SPECIAL'].includes(f);
    };
    return rawAnime.filter(isSpecial);
  }, [rawAnime, typeFilter]);

  const handleShare = useCallback(async () => {
    const seasonLabel = `${selectedYear} ${selectedSeason.charAt(0).toUpperCase() + selectedSeason.slice(1)}`;
    setPendingShare(true);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await shareSchedule({
        seasonLabel,
        groupedAnime,
        totalCount,
        viewRef: shareCardRef,
      });
    } finally {
      setPendingShare(false);
    }
  }, [selectedYear, selectedSeason, groupedAnime, totalCount]);

  const listViewData = groupedAnime.filter(
    (g) => g.anime.length > 0 || (g.day === 'Unknown' && showUnknownDays)
  );

  const scrollToTodayKey = `${selectedSeason}-${selectedYear}-${typeFilter ?? 'all'}`;

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
        <SafeAreaView style={[styles.safe, { paddingTop: top > 0 ? 0 : Spacing.xs }]}>
          <Skeleton.AnimeCardList count={6} />
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
            onLabelTap={() => setShowYearPicker(true)}
            onOpenSettings={() => setShowSettings(true)}
          />
        </View>

        {error ? (
          <View
            style={[
              styles.errorBanner,
              {
                backgroundColor: theme.background.tertiary,
                borderColor: theme.glassBorder,
              },
            ]}>
            <MaterialIcons name="error-outline" size={20} color={theme.accent} />
            <Text style={[styles.errorText, { color: theme.text.primary }]} numberOfLines={2}>
              {error}
            </Text>
            <Pressable
              onPress={() => {
                hapticsBridge.tap();
                onRefresh();
              }}
              style={({ pressed }) => [
                styles.retryButton,
                {
                  backgroundColor: theme.accent,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              hitSlop={8}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        <YearPickerSheet
          visible={showYearPicker}
          selectedYear={selectedYear}
          onClose={() => setShowYearPicker(false)}
          onSelect={(y) => setSelectedYear(y)}
          onPrevYear={() => setSelectedYear((y) => y - 1)}
          onNextYear={() => setSelectedYear((y) => y + 1)}
        />

        <BangumiSettingsSheet
          visible={showSettings}
          preferences={prefs}
          adultContent={adultContent}
          onAdultContentChange={handleAdultContentChange}
          onClose={() => setShowSettings(false)}
          onChange={setPrefs}
          onOpenNotifications={() => {
            setShowSettings(false);
            setShowNotifManager(true);
          }}
          onShare={() => {
            setShowSettings(false);
            handleShare();
          }}
        />

        <AddTrackingSheet
          visible={!!trackingTarget}
          anime={trackingTarget}
          onClose={() => setTrackingTarget(null)}
        />

        <NotificationManagerSheet
          visible={showNotifManager}
          onClose={() => setShowNotifManager(false)}
        />

        {viewMode === 'calendar' ? (
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
            <TodayUpdatesSection
              todayAnime={todayAnime}
              onLongPressAnime={setTrackingTarget}
              trackedIds={trackedIds}
            />
            <View style={styles.calendarContainer}>
              <FocusDayCarousel
                weekDays={weekDays}
                groupedAnime={groupedAnime}
                showUnknownDays={showUnknownDays}
                isCurrentDay={(day) => day === todayDay}
                initialDay={todayDay}
                scrollToTodayKey={scrollToTodayKey}
                sourcePlatform={sourcePlatform}
                onLongPressAnime={setTrackingTarget}
                onQuickAdd={handleQuickAddWishlist}
                trackedIds={trackedIds}
              />
            </View>
            {specialAnime.length > 0 ? (
              <SpecialContentSection
                title="Movies & specials"
                subtitle={`${specialAnime.length} releases this season`}
                icon="movie-creation"
                anime={specialAnime}
              />
            ) : null}
          </ScrollView>
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
              <TodayUpdatesSection
                todayAnime={todayAnime}
                onLongPressAnime={setTrackingTarget}
                trackedIds={trackedIds}
              />
            ) : null}
            <AnimeList
              listViewData={listViewData}
              renderAnimeCard={(anime) => (
                <AnimeRowCard
                  key={anime.id}
                  anime={anime}
                  sourcePlatform={sourcePlatform}
                  isTracked={trackedIds.has(anime.id)}
                  onAddTracking={setTrackingTarget}
                  onQuickWishlist={handleQuickAddWishlist}
                  onToggleReminder={handleToggleReminder}
                />
              )}
            />
            {specialAnime.length > 0 ? (
              <SpecialContentSection
                title="Movies & specials"
                subtitle={`${specialAnime.length} releases this season`}
                icon="movie-creation"
                anime={specialAnime}
              />
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>
      <BangumiActionSnackbar
        key={snackbar?.key ?? 'none'}
        visible={!!snackbar}
        message={snackbar?.message ?? ''}
        icon={snackbar?.icon}
        actionLabel={snackbar?.actionLabel}
        onAction={snackbar?.onAction}
        onDismiss={dismissSnackbar}
      />
      {pendingShare ? (
        <View pointerEvents="none" style={styles.shareCardWrapper}>
          <ShareScheduleCard
            ref={shareCardRef}
            seasonLabel={seasonDisplayName}
            groupedAnime={groupedAnime}
            totalCount={totalCount}
          />
        </View>
      ) : null}
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
  headerWrap: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    ...Platform.select({
      android: { elevation: 0 },
    }),
    borderRadius: Radius.card,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  errorText: {
    ...Typography.bodySmall,
    flex: 1,
  },
  retryButton: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xxs + 2,
    borderRadius: Radius.chip,
  },
  retryText: {
    ...Typography.captionSmall,
    fontWeight: '700',
    color: '#0E0A06',
  },
  shareCardWrapper: {
    position: 'absolute',
    top: -10000,
    left: -10000,
  },
});
