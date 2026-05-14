import { useCallback, useEffect, useMemo, useState } from 'react';
import { Anime, Genre, PersonalizedPickState, Recommendation, ViewMode } from './types';
import { AnimeRepository } from '../../libs/repositories/anime-repository';
import { pickPersonalized } from '../../libs/services/recommendation/personalized-pick';

type DiscoveryMode = 'genres' | 'mood' | 'duration';

export function useRateData() {
  const [viewMode, setViewMode] = useState<ViewMode>('discovery');
  const [discoveryMode, setDiscoveryMode] = useState<DiscoveryMode>('genres');
  const [availableGenres, setAvailableGenres] = useState<Genre[]>([]);
  const [trendAnime, setTrendAnime] = useState<Anime[]>([]);
  const [weeklyTrendAnime, setWeeklyTrendAnime] = useState<Anime[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [seasonalAnime, setSeasonalAnime] = useState<Anime[]>([]); // [NEW]
  const [personalizedPick, setPersonalizedPick] = useState<PersonalizedPickState>({
    anime: null,
    loading: false,
    reason: null,
    sourceTitles: [],
    matchedTags: [],
    coldStart: false,
  });

  // These were for direct API rate limiting visibility,
  // but JikanClient now handles it internally.
  // We can keep them if we want to expose client state later,
  // but for now let's simplify or mock them if the UI depends on them.
  const [queueSize, setQueueSize] = useState(0);
  const [nextAvailableAt, setNextAvailableAt] = useState<Date | null>(null);

  const loadGenres = useCallback(async () => {
    try {
      const genres = await AnimeRepository.getGenres();
      setAvailableGenres(genres);
    } catch (error) {
      console.error('Failed to load genres:', error);
    }
  }, []);

  const loadTrend = useCallback(async () => {
    if (trendAnime.length > 0) return;
    try {
      const anime = await AnimeRepository.getTopAnime();
      setTrendAnime(anime);
    } catch (error) {
      console.error('Failed to load trending anime:', error);
    }
  }, [trendAnime.length]);

  const loadWeeklyTrend = useCallback(async () => {
    if (weeklyTrendAnime.length > 0) return;
    try {
      const anime = await AnimeRepository.getTrendingAnime();
      setWeeklyTrendAnime(anime);
    } catch (error) {
      console.error('Failed to load weekly trending anime:', error);
    }
  }, [weeklyTrendAnime.length]);

  const loadRecommendations = useCallback(async () => {
    if (recommendations.length > 0) return;
    try {
      // Improve logic later to be "Personalized"
      const anime = await AnimeRepository.getSeasonalAnime();
      const recs: Recommendation[] = anime.slice(0, 5).map((a) => ({
        id: `rec-${a.id}`,
        anime: a,
        reason: 'Trending this season',
      }));
      setRecommendations(recs);
    } catch (error) {
      console.error('Failed to load recommendations:', error);
    }
  }, [recommendations.length]);

  const loadSeasonal = useCallback(async () => {
    if (seasonalAnime.length > 0) return;
    try {
      const anime = await AnimeRepository.getSeasonalAnime();
      setSeasonalAnime(anime);
    } catch (error) {
      console.error('Failed to load seasonal anime:', error);
    }
  }, [seasonalAnime.length]);

  const loadPersonalizedPick = useCallback(async () => {
    setPersonalizedPick((prev) => ({ ...prev, loading: true }));
    try {
      const result = await pickPersonalized();
      if (!result) {
        setPersonalizedPick({
          anime: null,
          loading: false,
          reason: null,
          sourceTitles: [],
          matchedTags: [],
          coldStart: true,
        });
        return;
      }
      setPersonalizedPick({
        anime: result.anime,
        loading: false,
        reason: result.reason,
        sourceTitles: result.sourceTitles,
        matchedTags: result.matchedTags,
        coldStart: false,
      });
    } catch (error) {
      console.error('Failed to load personalized pick:', error);
      setPersonalizedPick({
        anime: null,
        loading: false,
        reason: null,
        sourceTitles: [],
        matchedTags: [],
        coldStart: false,
      });
    }
  }, []);

  useEffect(() => {
    loadGenres();
  }, [loadGenres]);

  useEffect(() => {
    if (viewMode === 'trend') {
      loadTrend();
      loadWeeklyTrend();
    }
    if (viewMode === 'tracking') {
      loadRecommendations();
    }
    // Always load seasonal for dashboard
    loadSeasonal();
  }, [loadTrend, loadWeeklyTrend, loadRecommendations, loadSeasonal, viewMode]);

  const state = useMemo(
    () => ({
      viewMode,
      discoveryMode,
      availableGenres,
      trendAnime,
      weeklyTrendAnime,
      recommendations,
      seasonalAnime,
      personalizedPick,
      queueSize,
      nextAvailableAt,
    }),
    [
      personalizedPick,
      availableGenres,
      discoveryMode,
      nextAvailableAt,
      queueSize,
      recommendations,
      seasonalAnime,
      trendAnime,
      weeklyTrendAnime,
      viewMode,
    ]
  );

  const actions = useMemo(
    () => ({
      setViewMode,
      setDiscoveryMode,
      loadGenres,
      loadTrend,
      loadWeeklyTrend,
      loadRecommendations,
      loadSeasonal,
      loadPersonalizedPick,
    }),
    [
      loadPersonalizedPick,
      loadGenres,
      loadRecommendations,
      loadSeasonal,
      loadTrend,
      loadWeeklyTrend,
    ]
  );

  return { state, actions };
}
