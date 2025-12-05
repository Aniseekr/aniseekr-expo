import { useCallback, useEffect, useMemo, useState } from "react";
import { AIRecommendation, Anime, Genre, Recommendation, ViewMode } from "./types";
import { JikanClient, JikanAnime, JikanGenre } from "../../lib/api/jikan";

type DiscoveryMode = "genres" | "mood" | "duration";

// Map Jikan anime to our Anime type
function mapJikanAnime(jikanAnime: JikanAnime, rank?: number): Anime {
  return {
    id: jikanAnime.mal_id.toString(),
    title: jikanAnime.title_english || jikanAnime.title,
    image: jikanAnime.images.jpg.large_image_url || jikanAnime.images.jpg.image_url,
    tags: jikanAnime.genres.slice(0, 3).map((g) => g.name),
    rank,
  };
}

// Map Jikan genre to our Genre type
function mapJikanGenre(jikanGenre: JikanGenre): Genre {
  // Use a placeholder image for genres - in production, you might want to fetch genre-specific images
  const genreImages: Record<string, string> = {
    Action: "https://images.unsplash.com/photo-1523475472560-d2df97ec485c?q=80&w=800",
    Romance: "https://images.unsplash.com/photo-1505761671935-60b3a7427bad?q=80&w=800",
    "Sci-Fi": "https://images.unsplash.com/photo-1526657782461-9fe13402a841?q=80&w=800",
    Fantasy: "https://images.unsplash.com/photo-1509474520651-53cf6a805b02?q=80&w=800",
    Drama: "https://images.unsplash.com/photo-1500534623283-312aade485b7?q=80&w=800",
  };

  return {
    id: jikanGenre.mal_id.toString(),
    displayName: jikanGenre.name,
    image: genreImages[jikanGenre.name] || "https://images.unsplash.com/photo-1509474520651-53cf6a805b02?q=80&w=800",
  };
}

export function useRateData() {
  const [viewMode, setViewMode] = useState<ViewMode>("discovery");
  const [discoveryMode, setDiscoveryMode] = useState<DiscoveryMode>("genres");
  const [availableGenres, setAvailableGenres] = useState<Genre[]>([]);
  const [trendAnime, setTrendAnime] = useState<Anime[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [aiRecommendation, setAIRecommendation] = useState<AIRecommendation>({ anime: null, loading: false });
  const [queueSize, setQueueSize] = useState(0);
  const [nextAvailableAt, setNextAvailableAt] = useState<Date | null>(null);

  const loadGenres = useCallback(async () => {
    try {
      setAvailableGenres([]);
      const response = await JikanClient.getAnimeGenres();
      const genres = response.data.slice(0, 20).map(mapJikanGenre); // Limit to top 20 genres
      setAvailableGenres(genres);
    } catch (error) {
      console.error("Failed to load genres:", error);
      // Fallback to empty array on error
      setAvailableGenres([]);
    }
  }, []);

  const loadTrend = useCallback(async () => {
    if (trendAnime.length > 0) return;
    try {
      setQueueSize((q) => q + 1);
      const response = await JikanClient.getTopAnime({ limit: 25 });
      const anime = response.data.map((a, idx) => mapJikanAnime(a, idx + 1));
      setTrendAnime(anime);
      setQueueSize((q) => Math.max(0, q - 1));
      setNextAvailableAt(new Date(Date.now() + 4000));
    } catch (error) {
      console.error("Failed to load trending anime:", error);
      setQueueSize((q) => Math.max(0, q - 1));
    }
  }, [trendAnime.length]);

  const loadRecommendations = useCallback(async () => {
    if (recommendations.length > 0) return;
    try {
      setQueueSize((q) => q + 1);
      // Use top anime as recommendations for now
      const response = await JikanClient.getTopAnime({ limit: 5 });
      const recs: Recommendation[] = response.data.map((a, index) => ({
        id: `rec-${a.mal_id}`,
        anime: mapJikanAnime(a),
        reason: "Popular on MyAnimeList",
      }));
      setRecommendations(recs);
      setQueueSize((q) => Math.max(0, q - 1));
      setNextAvailableAt(new Date(Date.now() + 2500));
    } catch (error) {
      console.error("Failed to load recommendations:", error);
      setQueueSize((q) => Math.max(0, q - 1));
    }
  }, [recommendations.length]);

  const loadAIRecommendation = useCallback(async () => {
    setAIRecommendation({ anime: null, loading: true });
    try {
      // Get a random top anime as AI recommendation
      const response = await JikanClient.getTopAnime({ limit: 10 });
      const randomAnime = response.data[Math.floor(Math.random() * response.data.length)];
      setAIRecommendation({
        loading: false,
        anime: mapJikanAnime(randomAnime),
      });
    } catch (error) {
      console.error("Failed to load AI recommendation:", error);
      setAIRecommendation({ anime: null, loading: false });
    }
  }, []);

  useEffect(() => {
    loadGenres();
  }, [loadGenres]);

  useEffect(() => {
    if (viewMode === "trend") {
      loadTrend();
    }
    if (viewMode === "tracking") {
      loadRecommendations();
    }
  }, [loadTrend, loadRecommendations, viewMode]);

  const state = useMemo(
    () => ({
      viewMode,
      discoveryMode,
      availableGenres,
      trendAnime,
      recommendations,
      aiRecommendation,
      queueSize,
      nextAvailableAt,
    }),
    [aiRecommendation, availableGenres, discoveryMode, nextAvailableAt, queueSize, recommendations, trendAnime, viewMode]
  );

  const actions = useMemo(
    () => ({
      setViewMode,
      setDiscoveryMode,
      loadGenres,
      loadTrend,
      loadRecommendations,
      loadAIRecommendation,
    }),
    [loadAIRecommendation, loadGenres, loadRecommendations, loadTrend]
  );

  return { state, actions };
}

