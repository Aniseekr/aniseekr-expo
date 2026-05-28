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
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
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
import { SwipeHintChip } from '../../components/bangumi/SwipeHintChip';
import { BangumiCardDeck } from '../../components/bangumi/BangumiCardDeck';
import { AnimeRepository, unifiedToLegacyAnime } from '../../libs/repositories/anime-repository';
import { dataSourceConfig } from '../../libs/services/data-source-config';
import { animeNotificationService } from '../../modules/notifications/animeNotificationService';
import {
  loadBangumiPrefs,
  loadBangumiPrefsSync,
  saveBangumiPrefs,
} from '../../libs/services/bangumi-prefs';
import {
  loadUserPrefs,
  loadUserPrefsSync,
  patchUserPrefs,
} from '../../libs/services/user-prefs';
import { trackingService } from '../../libs/services/tracking/tracking-service';
import { FontFamily, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { readableTextOn } from '../../components/themed';
import { ShimmerEffect } from '../../components/common/ShimmerEffect';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { setFloatingTabBarHidden } from '../../libs/navigation/floating-tab-bar-visibility';
import { sameArrayBy } from '../../libs/utils/state-array';
import { useT } from '../../libs/i18n';

// Module-level snapshot of the most-recent successful fetch per season key.
// Survives screen unmount/remount (tab switch), so re-entering the page (or
// switching back to a previously-viewed season) skips the skeleton entirely
// and only triggers a silent SWR refresh underneath.
type SeasonSnapshot = {
  rawAnime: Anime[];
  sourcePlatform: string;
};
const seasonSnapshots = new Map<string, SeasonSnapshot>();
const snapshotKey = (season: string, year: number, source: string) => `${season}_${year}_${source}`;
const BANGUMI_CARDS_TAB_BAR_REASON = 'bangumi-cards-mode';

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

function sameAnimeList(current: Anime[], next: Anime[]): boolean {
  return sameArrayBy(current, next, (anime) => [
    anime.id,
    anime.title,
    anime.titleEnglish,
    anime.image,
    anime.bannerImage,
    anime.rank,
    anime.format,
    anime.type,
    anime.status,
    anime.episodes,
    anime.durationMinutes,
    anime.score,
    anime.startDate?.year,
    anime.startDate?.month,
    anime.startDate?.day,
    anime.nextAiringEpisode?.airingAt,
    anime.nextAiringEpisode?.episode,
  ]);
}

function sameStringSet(current: Set<string>, next: Set<string>): boolean {
  if (current === next) return true;
  if (current.size !== next.size) return false;
  for (const id of current) {
    if (!next.has(id)) return false;
  }
  return true;
}

export default function BangumiScreen() {
  const { top } = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const retryFg = useMemo(() => readableTextOn(theme.accent), [theme.accent]);
  const t = useT();
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { season: currentSeason, year: currentYear } = getCurrentSeason();
  const [selectedSeason, setSelectedSeason] = useState<Season>(currentSeason);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  // Lazy initial state — pull the most-recent snapshot for the current season so
  // re-entering the screen rehydrates instantly, no skeleton flash.
  const [rawAnime, setRawAnime] = useState<Anime[]>(() => {
    const key = snapshotKey(currentSeason, currentYear, dataSourceConfig.browseSource);
    return seasonSnapshots.get(key)?.rawAnime ?? [];
  });
  const [sourcePlatform, setSourcePlatform] = useState<string>(() => {
    const key = snapshotKey(currentSeason, currentYear, dataSourceConfig.browseSource);
    return seasonSnapshots.get(key)?.sourcePlatform ?? dataSourceConfig.browseSource;
  });
  // Seed prefs synchronously from MMKV so the calendar/list view renders in
  // the user's chosen mode on frame 1. Without this, the screen used to
  // briefly render in the default mode before the async load flipped it —
  // visible as a layout shift on a cold open.
  const [prefs, setPrefsState] = useState<BangumiPreferences>(loadBangumiPrefsSync);
  const [hydrated, setHydrated] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNotifManager, setShowNotifManager] = useState(false);
  const [pendingShare, setPendingShare] = useState(false);
  const [trackingTarget, setTrackingTarget] = useState<Anime | null>(null);
  const [adultContent, setAdultContent] = useState(() => loadUserPrefsSync().allowAdultContent);
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
    // Prefs are already seeded synchronously above. The async loaders here
    // only exist to (1) fire the legacy `showAdult` → `allowAdultContent`
    // promotion side effect inside `loadBangumiPrefs`, (2) reconcile if the
    // bangumi blob was rewritten by another mounted screen, and (3) wait for
    // the SQLite-backed tracked-ids set (no sync equivalent exists).
    hydratedRef.current = true;
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
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return trackingService.onTrackedIdsChange((ids) => {
      const next = new Set(ids);
      setTrackedIds((prev) => (sameStringSet(prev, next) ? prev : next));
    });
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
        message: t('tabs.bangumiScreen.snackbar.addedToWishlist', { title: anime.title }),
        icon: 'bookmark-added',
        actionLabel: t('tabs.bangumiScreen.snackbar.undo'),
        onAction: () => {
          void trackingService.removeTracking(anime.id);
        },
      });
    } catch (e) {
      console.warn('[bangumi] quick wishlist failed', e);
      hapticsBridge.warning();
      setSnackbar({
        key: Date.now(),
        message: t('tabs.bangumiScreen.snackbar.couldntAddToWishlist'),
        icon: 'error-outline',
      });
    }
  }, [t]);

  const handleToggleReminder = useCallback(async (anime: Anime, currentlyScheduled: boolean) => {
    try {
      if (currentlyScheduled) {
        await animeNotificationService.cancelAnimeNotification(anime.id);
        setSnackbar({
          key: Date.now(),
          message: t('tabs.bangumiScreen.snackbar.reminderCancelled'),
          icon: 'notifications-off',
        });
      } else {
        const id = await animeNotificationService.scheduleAnimeNotification(anime);
        setSnackbar({
          key: Date.now(),
          message: id
            ? t('tabs.bangumiScreen.snackbar.reminderSet', { title: anime.title })
            : t('tabs.bangumiScreen.snackbar.noUpcomingEpisode', { title: anime.title }),
          icon: id ? 'notifications-active' : 'info',
        });
      }
      hapticsBridge.selection();
    } catch (e) {
      console.warn('[bangumi] reminder toggle failed', e);
      hapticsBridge.warning();
    }
  }, [t]);

  const dismissSnackbar = useCallback(() => setSnackbar(null), []);
  const openYearPicker = useCallback(() => setShowYearPicker(true), []);
  const openSettings = useCallback(() => setShowSettings(true), []);

  const viewMode = prefs.viewMode;
  const filterMode = prefs.filterMode;
  const showUnknownDays = prefs.showUnknownDays;
  const typeFilter = prefs.typeFilter;
  const hideSwipeHint = prefs.hideSwipeHint ?? false;
  const focusedRef = useRef(false);
  const viewModeRef = useRef(viewMode);

  // Cards mode = full-screen swipe deck; the floating tab bar would overlap the
  // card footer / action buttons. Hide it while focused, restore on blur so the
  // bangumi pill stays visible from other tabs.
  useEffect(() => {
    viewModeRef.current = viewMode;
    if (focusedRef.current) {
      setFloatingTabBarHidden(BANGUMI_CARDS_TAB_BAR_REASON, viewMode === 'cards');
    }
  }, [viewMode]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      setFloatingTabBarHidden(BANGUMI_CARDS_TAB_BAR_REASON, viewModeRef.current === 'cards');
      return () => {
        focusedRef.current = false;
        setFloatingTabBarHidden(BANGUMI_CARDS_TAB_BAR_REASON, false);
      };
    }, [])
  );
  const setFilterMode = useCallback(
    (mode: FilterMode) => setPrefs((p) => ({ ...p, filterMode: mode })),
    [setPrefs]
  );
  const dismissSwipeHint = useCallback(
    () => setPrefs((p) => ({ ...p, hideSwipeHint: true })),
    [setPrefs]
  );

  const fetchVersionRef = useRef(0);
  const fetchSeason = useCallback(
    async (forceRefresh: boolean) => {
      const myVersion = ++fetchVersionRef.current;
      const key = snapshotKey(selectedSeason, selectedYear, dataSourceConfig.browseSource);
      const snapshot = seasonSnapshots.get(key);

      if (!forceRefresh) {
        // Re-hydrate instantly from snapshot if we have one for this season.
        // Otherwise blank out so the skeleton shows during the cold fetch.
        if (snapshot) {
          setRawAnime((prev) =>
            sameAnimeList(prev, snapshot.rawAnime) ? prev : snapshot.rawAnime
          );
          setSourcePlatform((prev) =>
            prev === snapshot.sourcePlatform ? prev : snapshot.sourcePlatform
          );
          setIsLoading((prev) => (prev ? false : prev));
        } else {
          setRawAnime((prev) => (prev.length === 0 ? prev : []));
          setIsLoading((prev) => (prev ? prev : true));
        }
      } else {
        // Pull-to-refresh keeps the visible list; the RefreshControl spinner
        // is the affordance, not the skeleton.
        setIsLoading((prev) => (prev ? prev : true));
      }

      // Local accumulator so each onPageReceived call replaces with the
      // accumulated list — overwrites any stale snapshot data on the first
      // fresh page rather than appending on top of it.
      let acc: Anime[] = [];
      // With a snapshot already visible (or during pull-to-refresh), partial
      // SWR pages would shrink the list and grow it back — a visible jitter.
      // Only render pages progressively on a true cold load.
      const renderPagesProgressively = !forceRefresh && !snapshot;
      try {
        // Dynamic loading contract:
        // - This screen must use the batched repository API, not a single-page
        //   seasonal fetch, so later pages keep loading past the first 20 items.
        // - `perPage` must be forwarded through Bangumi -> AniList. If that
        //   chain breaks, the list can shrink to the first filtered page only.
        const fetched = await AnimeRepository.defaultInstance().fetchSeasonalAnimeBatched(
          selectedSeason.toUpperCase(),
          selectedYear,
          {
            perPage: 50,
            maxItems: 200,
            forceRefresh,
            onPageReceived: renderPagesProgressively
              ? (pageItems) => {
                  if (myVersion !== fetchVersionRef.current) return;
                  const mapped = pageItems.map(unifiedToLegacyAnime);
                  acc = [...acc, ...mapped];
                  setRawAnime((prev) => (sameAnimeList(prev, acc) ? prev : acc));
                  setIsLoading((prev) => (prev ? false : prev));
                }
              : undefined,
          }
        );
        if (myVersion !== fetchVersionRef.current) return;
        const finalSource = dataSourceConfig.browseSource;
        const finalList = fetched.map(unifiedToLegacyAnime);
        // Swap to fresh data silently — but skip the state update when the
        // server result is identical to what we already have on screen, so
        // useMemo deps (and downstream list renders) don't churn.
        setRawAnime((prev) => (sameAnimeList(prev, finalList) ? prev : finalList));
        setSourcePlatform((prev) => (prev === finalSource ? prev : finalSource));
        seasonSnapshots.set(snapshotKey(selectedSeason, selectedYear, finalSource), {
          rawAnime: finalList,
          sourcePlatform: finalSource,
        });
        setError((prev) => (prev === null ? prev : null));
      } catch (e) {
        if (myVersion !== fetchVersionRef.current) return;
        console.error('Failed to fetch bangumi', e);
        const errMsg = t('tabs.bangumiScreen.errorLoadFailed');
        setError((prev) => (prev === errMsg ? prev : errMsg));
      } finally {
        if (myVersion === fetchVersionRef.current) {
          setIsLoading((prev) => (prev ? false : prev));
        }
      }
    },
    [selectedSeason, selectedYear, t]
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

  const toggleSwipe = useCallback(() => {
    hapticsBridge.selection();
    setPrefs((p) => {
      if (p.viewMode === 'cards') {
        // Exit swipe — restore the last base view (calendar | list).
        const next = p.baseViewMode ?? 'calendar';
        setFloatingTabBarHidden(BANGUMI_CARDS_TAB_BAR_REASON, false);
        return { ...p, viewMode: next };
      }
      // Enter swipe — remember the current base view so X restores it.
      setFloatingTabBarHidden(BANGUMI_CARDS_TAB_BAR_REASON, true);
      const base = p.viewMode === 'list' ? 'list' : 'calendar';
      return { ...p, viewMode: 'cards', baseViewMode: base };
    });
  }, [setPrefs]);

  const handleSettingsChange = useCallback(
    (next: BangumiPreferences) => {
      setFloatingTabBarHidden(BANGUMI_CARDS_TAB_BAR_REASON, next.viewMode === 'cards');
      setPrefs(next);
    },
    [setPrefs]
  );

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

  const listViewData = useMemo(
    () =>
      groupedAnime.filter((g) => g.anime.length > 0 || (g.day === 'Unknown' && showUnknownDays)),
    [groupedAnime, showUnknownDays]
  );

  const renderListRowCard = useCallback(
    (anime: Anime) => (
      <AnimeRowCard
        anime={anime}
        sourcePlatform={sourcePlatform}
        isTracked={trackedIds.has(anime.id)}
        onAddTracking={setTrackingTarget}
        onQuickWishlist={handleQuickAddWishlist}
        onToggleReminder={handleToggleReminder}
      />
    ),
    [sourcePlatform, trackedIds, handleQuickAddWishlist, handleToggleReminder]
  );

  const listHeader = useMemo(() => {
    const showHint = !hideSwipeHint;
    const showToday = todayAnime.length > 0;
    if (!showHint && !showToday) return null;
    return (
      <>
        {showHint ? <SwipeHintChip onDismiss={dismissSwipeHint} /> : null}
        {showToday ? (
          <TodayUpdatesSection
            todayAnime={todayAnime}
            onLongPressAnime={setTrackingTarget}
            trackedIds={trackedIds}
          />
        ) : null}
      </>
    );
  }, [hideSwipeHint, todayAnime, trackedIds, dismissSwipeHint]);

  const listFooter = useMemo(() => {
    if (specialAnime.length === 0) return null;
    return (
      <SpecialContentSection
        title={t('tabs.bangumiScreen.movieAndSpecialsTitle')}
        subtitle={t('tabs.bangumiScreen.movieAndSpecialsSubtitle', { count: String(specialAnime.length) })}
        icon="movie-creation"
        anime={specialAnime}
      />
    );
  }, [specialAnime, t]);

  const scrollToTodayKey = `${selectedSeason}-${selectedYear}-${typeFilter ?? 'all'}`;

  // Request notification permissions on mount
  useEffect(() => {
    animeNotificationService.requestPermissions();
  }, []);

  // Cold-load placeholder: header stays interactive, calendar area shimmers
  // in the actual focus-day shape so the swap to data has no layout jump.
  const showSkeleton = isLoading && !refreshing && rawAnime.length === 0;

  return (
    <View style={styles.container}>
      <LinearGradient colors={theme.gradient} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={[styles.safe, { paddingTop: top > 0 ? 0 : Spacing.xs }]}>
        <View style={styles.headerWrap}>
          <SeasonHeader
            seasonDisplayName={seasonDisplayName}
            onPrevSeason={switchToPreviousSeason}
            onNextSeason={switchToNextSeason}
            filterMode={filterMode}
            onFilterChange={setFilterMode}
            viewMode={viewMode}
            onToggleSwipe={toggleSwipe}
            totalCount={totalCount}
            onLabelTap={openYearPicker}
            onOpenSettings={openSettings}
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
              <Text style={[styles.retryText, { color: retryFg }]}>{t('tabs.bangumiScreen.retry')}</Text>
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
          onChange={handleSettingsChange}
          onOpenNotifications={() => {
            setShowSettings(false);
            // Wait for the settings Modal to fully dismiss before presenting the
            // notification manager — iOS only allows one Modal on-screen at a time.
            setTimeout(() => setShowNotifManager(true), 280);
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
                tintColor={theme.text.primary}
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[theme.accent]}
                progressBackgroundColor={theme.background.secondary}
              />
            }>
            {showSkeleton ? (
              <BangumiCalendarSkeleton theme={theme} />
            ) : (
              <>
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
                    onToggleReminder={handleToggleReminder}
                    trackedIds={trackedIds}
                  />
                </View>
                {specialAnime.length > 0 ? (
                  <SpecialContentSection
                    title={t('tabs.bangumiScreen.movieAndSpecialsTitle')}
                    subtitle={t('tabs.bangumiScreen.movieAndSpecialsSubtitle', { count: String(specialAnime.length) })}
                    icon="movie-creation"
                    anime={specialAnime}
                  />
                ) : null}
              </>
            )}
          </ScrollView>
        ) : viewMode === 'cards' ? (
          <View style={styles.cardsContainer}>
            {showSkeleton ? (
              <BangumiCardDeckSkeleton />
            ) : (
              <BangumiCardDeck
                anime={filteredAnime}
                resetKey={`${selectedSeason}-${selectedYear}-${filterMode}-${typeFilter}`}
                onSwipeRemind={(a) =>
                  handleToggleReminder(a, animeNotificationService.isAnimeScheduled(a.id))
                }
                onSwipePlan={handleQuickAddWishlist}
              />
            )}
          </View>
        ) : showSkeleton ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 140 }}
            refreshControl={
              <RefreshControl
                tintColor={theme.text.primary}
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[theme.accent]}
                progressBackgroundColor={theme.background.secondary}
              />
            }>
            <BangumiListSkeleton theme={theme} />
          </ScrollView>
        ) : (
          <AnimeList
            listViewData={listViewData}
            renderAnimeCard={renderListRowCard}
            refreshControl={
              <RefreshControl
                tintColor={theme.text.primary}
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[theme.accent]}
                progressBackgroundColor={theme.background.secondary}
              />
            }
            ListHeaderComponent={listHeader}
            ListFooterComponent={listFooter}
          />
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

// Calendar-shaped skeleton — mirrors the actual TodayUpdates strip + the
// focus-day card so the swap to real data has zero layout jump. All shimmers
// share the global driver in ShimmerEffect, so cost is flat regardless of
// instance count.
function BangumiCalendarSkeleton({ theme }: { theme: ThemePalette }) {
  const { width } = useWindowDimensions();
  const cardWidth = width * 0.88;
  const sidePadding = (width - cardWidth) / 2;
  return (
    <View>
      {/* Today strip skeleton — mirrors TodayUpdatesSection: clipped container
          + horizontal row of 168px cards that visually run off the right edge
          (the real version uses a horizontal ScrollView with overflow:'hidden'
          on the wrapper). */}
      <View
        style={{
          overflow: 'hidden',
          marginHorizontal: Spacing.md,
          marginBottom: Spacing.sm,
          borderRadius: Radius.card,
          padding: Spacing.md,
          backgroundColor: theme.background.secondary,
          borderWidth: 1,
          borderColor: theme.glassBorder,
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ShimmerEffect width={16} height={16} borderRadius={4} />
          <ShimmerEffect width={64} height={14} />
          <ShimmerEffect width={28} height={11} style={{ marginLeft: 4 }} />
        </View>
        <View
          style={{
            flexDirection: 'row',
            gap: Spacing.xs,
            marginTop: Spacing.sm,
          }}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={{
                width: 168,
                padding: 6,
                gap: 8,
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: theme.background.tertiary,
                borderRadius: Radius.md,
                borderWidth: 1,
                borderColor: theme.glassBorder,
              }}>
              <ShimmerEffect width={40} height={56} borderRadius={Radius.sm} />
              <View style={{ flex: 1, gap: 4 }}>
                <ShimmerEffect width="80%" height={11} />
                <ShimmerEffect width="40%" height={10} />
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Focus-day card skeleton */}
      <View
        style={{
          paddingHorizontal: sidePadding,
          paddingVertical: Spacing.md,
          minHeight: 460,
        }}>
        <View
          style={{
            width: cardWidth,
            height: 440,
            borderRadius: Radius.xxl,
            overflow: 'hidden',
            borderWidth: 1.5,
            borderColor: theme.glassBorder,
            backgroundColor: theme.background.secondary,
          }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: Spacing.lg,
              paddingTop: Spacing.lg,
              paddingBottom: Spacing.md,
            }}>
            <ShimmerEffect width={140} height={28} />
            <ShimmerEffect width={64} height={20} borderRadius={Radius.chip} />
          </View>
          <View
            style={{
              paddingHorizontal: Spacing.md,
              gap: Spacing.xs,
            }}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: Spacing.sm,
                  paddingHorizontal: Spacing.xs,
                  paddingVertical: Spacing.xs,
                }}>
                <ShimmerEffect width={52} height={74} borderRadius={Radius.sm} />
                <View style={{ flex: 1, gap: 6 }}>
                  <ShimmerEffect width="78%" height={16} />
                  <ShimmerEffect width="38%" height={11} />
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

// Card-deck skeleton — single centered card-shaped shimmer that matches the
// real deck dimensions so the swap to data has no layout shift.
function BangumiCardDeckSkeleton() {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - Spacing.lg * 2, 360);
  const cardHeight = Math.round(cardWidth * 1.4);
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: Spacing.xl,
        gap: Spacing.lg,
      }}>
      <ShimmerEffect width={64} height={14} />
      <ShimmerEffect width={cardWidth} height={cardHeight} borderRadius={Radius.xxl} />
      <View style={{ flexDirection: 'row', gap: Spacing.md, width: cardWidth }}>
        <View style={{ flex: 1 }}>
          <ShimmerEffect width="100%" height={44} borderRadius={Radius.full} />
        </View>
        <View style={{ flex: 1 }}>
          <ShimmerEffect width="100%" height={44} borderRadius={Radius.full} />
        </View>
      </View>
    </View>
  );
}

// List-mode skeleton — mirrors AnimeRowCard layout (poster + 2 lines + meta).
function BangumiListSkeleton({ theme }: { theme: ThemePalette }) {
  return (
    <View style={{ paddingHorizontal: Spacing.md, gap: Spacing.md, paddingTop: Spacing.sm }}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.md,
            padding: Spacing.sm,
            borderRadius: Radius.md,
            backgroundColor: theme.background.secondary,
            borderWidth: 1,
            borderColor: theme.glassBorder,
          }}>
          <ShimmerEffect width={64} height={88} borderRadius={Radius.md} />
          <View style={{ flex: 1, gap: 8 }}>
            <ShimmerEffect width="78%" height={16} />
            <ShimmerEffect width="48%" height={12} />
            <ShimmerEffect width="32%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (theme: ThemePalette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background.primary,
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
      color: theme.text.primary,
      fontFamily: FontFamily.text,
    },
    calendarContainer: {
      flex: 1,
      minHeight: 400,
      paddingTop: Spacing.xs,
    },
    cardsContainer: {
      flex: 1,
      paddingBottom: 120,
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
    },
    shareCardWrapper: {
      position: 'absolute',
      top: -10000,
      left: -10000,
    },
  });
