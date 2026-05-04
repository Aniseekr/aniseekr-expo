import { useCallback, useEffect, useMemo, useState } from 'react';
import { AIRecommendation, Anime, Genre, Recommendation, ViewMode } from './types';
import { AnimeRepository } from '../../libs/repositories/anime-repository';

type DiscoveryMode = 'genres' | 'mood' | 'duration';

export function useRateData() {
  const [viewMode, setViewMode] = useState<ViewMode>('discovery');
  const [discoveryMode, setDiscoveryMode] = useState<DiscoveryMode>('genres');
  const [availableGenres, setAvailableGenres] = useState<Genre[]>([]);
  const [trendAnime, setTrendAnime] = useState<Anime[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [seasonalAnime, setSeasonalAnime] = useState<Anime[]>([]); // [NEW]
  const [aiRecommendation, setAIRecommendation] = useState<AIRecommendation>({
    anime: null,
    loading: false,
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

  const loadAIRecommendation = useCallback(async () => {
    setAIRecommendation({ anime: null, loading: true });
    try {
      const animeList = await AnimeRepository.getTopAnime(Math.floor(Math.random() * 3) + 1);
      const randomAnime = animeList[Math.floor(Math.random() * animeList.length)];
      setAIRecommendation({
        loading: false,
        anime: randomAnime,
      });
    } catch (error) {
      console.error('Failed to load AI recommendation:', error);
      setAIRecommendation({ anime: null, loading: false });
    }
  }, []);

  useEffect(() => {
    loadGenres();
  }, [loadGenres]);

  useEffect(() => {
    if (viewMode === 'trend') {
      loadTrend();
    }
    if (viewMode === 'tracking') {
      loadRecommendations();
    }
    // Always load seasonal for dashboard
    loadSeasonal();
  }, [loadTrend, loadRecommendations, loadSeasonal, viewMode]);

  const state = useMemo(
    () => ({
      viewMode,
      discoveryMode,
      availableGenres,
      trendAnime,
      recommendations,
      seasonalAnime,
      aiRecommendation,
      queueSize,
      nextAvailableAt,
    }),
    [
      aiRecommendation,
      availableGenres,
      discoveryMode,
      nextAvailableAt,
      queueSize,
      recommendations,
      seasonalAnime,
      trendAnime,
      viewMode,
    ]
  );

  const actions = useMemo(
    () => ({
      setViewMode,
      setDiscoveryMode,
      loadGenres,
      loadTrend,
      loadRecommendations,
      loadSeasonal,
      loadAIRecommendation,
    }),
    [loadAIRecommendation, loadGenres, loadRecommendations, loadSeasonal, loadTrend]
  );

  return { state, actions };
}
