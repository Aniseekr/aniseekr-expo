import { View, ScrollView, RefreshControl, Dimensions, Text, Platform, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { SeasonHeader } from '../components/bangumi/SeasonHeader';
import { WeeklyCalendar } from '../components/bangumi/WeeklyCalendar';
import { Anime } from '../components/rate/types';
import { AnimeList, AnimeRowCard } from '../components/bangumi/AnimeList';
import { LinearGradient } from 'expo-linear-gradient';
import { AnimeRepository } from '../libs/anime-repository';
import { animeNotificationService } from '../modules/notifications/animeNotificationService';

type ViewMode = 'calendar' | 'list';
type FilterMode = 'all' | 'tracking';
type Season = 'winter' | 'spring' | 'summer' | 'fall';

interface DailyAnime {
  day: string;
  anime: Anime[];
}

const weekDays = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];

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

function dayShortName(day: string): string {
  const mapping: { [key: string]: string } = {
    Mondays: 'Mon',
    Tuesdays: 'Tue',
    Wednesdays: 'Wed',
    Thursdays: 'Thu',
    Fridays: 'Fri',
    Saturdays: 'Sat',
    Sundays: 'Sun',
  };
  return mapping[day] || day;
}

export default function BangumiScreen() {
  const { top } = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [filterMode, setFilterMode] = useState<FilterMode>('tracking');
  const [showUnknownDays, setShowUnknownDays] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const { season: currentSeason, year: currentYear } = getCurrentSeason();
  const [selectedSeason, setSelectedSeason] = useState<Season>(currentSeason);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [groupedAnime, setGroupedAnime] = useState<DailyAnime[]>([]);

  useEffect(() => {
    onRefresh();
  }, [selectedSeason, selectedYear]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setIsLoading(true);
    try {
        const rawAnime = await AnimeRepository.getSeasonalAnime(selectedSeason.toUpperCase(), selectedYear);
        
        console.log(`Fetched ${rawAnime.length} anime for ${selectedSeason} ${selectedYear}`);
        
        // Group by Day
        const days = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
        const grouped: { [key: string]: Anime[] } = {};
        days.forEach(d => grouped[d] = []);
        grouped['Unknown'] = [];

        rawAnime.forEach((anime: Anime) => {
            // Check nextAiringEpisode
            if (anime.nextAiringEpisode && anime.nextAiringEpisode.airingAt) {
                const date = new Date(anime.nextAiringEpisode.airingAt * 1000);
                const dayIndex = date.getDay();
                const dayName = days[dayIndex];
                grouped[dayName].push(anime);
            } else {
                // Put in Unknown if no airing schedule
                grouped['Unknown'].push(anime);
            }
        });

        const dailyAnimeList: DailyAnime[] = [
             ...days.map(day => ({ day, anime: grouped[day] })),
             { day: 'Unknown', anime: grouped['Unknown'] }
        ];

        console.log('Grouped anime:', dailyAnimeList.map(d => ({ day: d.day, count: d.anime.length })));
        setGroupedAnime(dailyAnimeList);

    } catch (e) {
        console.error("Failed to fetch bangumi", e);
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
    onRefresh();
  }, [selectedSeason, onRefresh]);

  const switchToNextSeason = useCallback(() => {
    const seasonOrder: Season[] = ['winter', 'spring', 'summer', 'fall'];
    const currentIndex = seasonOrder.indexOf(selectedSeason);
    if (currentIndex === seasonOrder.length - 1) {
      setSelectedYear((prev) => prev + 1);
      setSelectedSeason('winter');
    } else {
      setSelectedSeason(seasonOrder[currentIndex + 1]);
    }
    onRefresh();
  }, [selectedSeason, onRefresh]);

  const seasonDisplayName = useMemo(() => {
    return `${selectedYear} ${selectedSeason.charAt(0).toUpperCase() + selectedSeason.slice(1)}`;
  }, [selectedSeason, selectedYear]);

  const listViewData = groupedAnime.filter((g) => g.anime.length > 0 || (g.day === 'Unknown' && showUnknownDays));

  // Request notification permissions on mount
  useEffect(() => {
    animeNotificationService.requestPermissions();
  }, []);

  if (isLoading && !refreshing) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#121212', '#1E1E1E', '#121212']}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={{ paddingTop: top }} className="flex-1 items-center justify-center">
          <Text style={styles.loadingText}>Loading...</Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#121212', '#1E1E1E', '#121212']}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={{ paddingTop: top }} className="flex-1">
        <View className="px-5 pt-5">
          <SeasonHeader 
            seasonDisplayName={seasonDisplayName}
            onPrevSeason={switchToPreviousSeason}
            onNextSeason={switchToNextSeason}
            filterMode={filterMode}
            onFilterChange={setFilterMode}
            viewMode={viewMode}
            onViewModeToggle={toggleViewMode}
          />
        </View>

        {viewMode === 'calendar' ? (
          <View style={styles.calendarContainer}>
            <WeeklyCalendar 
              weekDays={weekDays}
              groupedAnime={groupedAnime}
              isCurrentDay={(day) => day === getTodayDayString()}
              dayShortName={dayShortName}
            />
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingBottom: 100 }}
            refreshControl={
              <RefreshControl 
                tintColor="#fff" 
                refreshing={refreshing} 
                onRefresh={onRefresh}
                colors={['#6200EE']}
                progressBackgroundColor="#1E1E1E"
              />
            }
          >
            <AnimeList listViewData={listViewData} renderAnimeCard={(anime) => <AnimeRowCard key={anime.id} anime={anime} />} />
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  loadingText: {
    color: 'rgba(255, 255, 255, 0.87)',
    fontSize: 16,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  calendarContainer: {
    flex: 1,
    minHeight: 400,
  },
});
