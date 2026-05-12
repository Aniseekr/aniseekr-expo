// Home / Rate screen — three modes (Discovery / Seasonal / Trend).
// Uses ModeSelector for the pill control, GenreCarousel for Discovery,
// SeasonalCarousel for Seasonal (matches "03 — Home Carousel (Seasonal)"
// in japanwalker.pen), and a hero + ranked-list layout for Trend.

import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GenreCarousel } from '../../../components/rate/GenreCarousel';
import { SeasonalView } from '../../../components/rate/seasonal/SeasonalView';
import { AIRecommendationSheet } from '../../../components/rate/AIRecommendationSheet';
import { ModeSelector } from '../../../components/rate/ModeSelector';
import { ImageDisplaySettingsSheet } from '../../../components/rate/ImageDisplaySettingsSheet';
import { useRateData } from '../../../components/rate/useRateData';
import { Anime, Genre, ViewMode } from '../../../components/rate/types';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { Colors, FontFamily, Radius, Spacing, Typography } from '../../../constants/DesignSystem';
import { pilgrimageRepository } from '../../../libs/services/pilgrimage/pilgrimage-repository';
import { FEATURED_PILGRIMAGE_ANIME } from '../../../libs/services/pilgrimage/featured-anime';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';
import {
  DEFAULT_SWIPE_PREFS,
  DEFAULT_USER_PREFS,
  loadUserPrefs,
  patchSwipePrefs,
  patchUserPrefs,
  type SeasonalLayout,
  type SwipePrefs,
} from '../../../libs/services/user-prefs';

const MODE_OPTIONS: readonly { value: ViewMode; label: string }[] = [
  { value: 'discovery', label: 'Discovery' },
  { value: 'tracking', label: 'Seasonal' },
  { value: 'trend', label: 'Trend' },
];

const TREND_PILGRIMAGE_LIMIT = 6;

export default function HomeRateScreen() {
  const { top } = useSafeAreaInsets();
  const { state, actions } = useRateData();
  const router = useRouter();
  const [showAI, setShowAI] = useState(false);
  const [showDisplaySettings, setShowDisplaySettings] = useState(false);
  const [swipePrefs, setSwipePrefs] = useState<SwipePrefs>(DEFAULT_SWIPE_PREFS);
  const [seasonalLayout, setSeasonalLayout] = useState<SeasonalLayout>(
    DEFAULT_USER_PREFS.seasonalLayout,
  );
  const [trendPilgrimages, setTrendPilgrimages] = useState<AnitabiBangumi[]>([]);
  const [loadingTrendPilgrimages, setLoadingTrendPilgrimages] = useState(false);

  // Hydrate swipe prefs once; the settings sheet writes back via patchSwipePrefs.
  useEffect(() => {
    let cancelled = false;
    void loadUserPrefs().then((p) => {
      if (cancelled) return;
      setSwipePrefs(p.swipe);
      setSeasonalLayout(p.seasonalLayout);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSwipePrefsChange = useCallback((next: SwipePrefs) => {
    setSwipePrefs(next);
    void patchSwipePrefs(next);
  }, []);

  const handleSeasonalLayoutChange = useCallback((next: SeasonalLayout) => {
    setSeasonalLayout(next);
    void patchUserPrefs({ seasonalLayout: next });
  }, []);

  // Lazy-load trending pilgrimages once when the user first opens Trend mode.
  // Reuses the curated list from the pilgrimage hub, sorted by spot count so
  // the most-documented locations float to the top.
  useEffect(() => {
    if (state.viewMode !== 'trend') return;
    if (trendPilgrimages.length > 0 || loadingTrendPilgrimages) return;
    let cancelled = false;
    setLoadingTrendPilgrimages(true);
    Promise.allSettled(
      FEATURED_PILGRIMAGE_ANIME.map(({ bangumiId }) =>
        pilgrimageRepository.getSpotsByBangumiId(bangumiId)
      )
    )
      .then((results) => {
        if (cancelled) return;
        const fulfilled = results
          .filter(
            (r): r is PromiseFulfilledResult<AnitabiBangumi | null> => r.status === 'fulfilled'
          )
          .map((r) => r.value)
          .filter((v): v is AnitabiBangumi => v !== null)
          .sort((a, b) => (b.pointsLength ?? 0) - (a.pointsLength ?? 0))
          .slice(0, TREND_PILGRIMAGE_LIMIT);
        setTrendPilgrimages(fulfilled);
        setLoadingTrendPilgrimages(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadingTrendPilgrimages(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.viewMode, trendPilgrimages.length, loadingTrendPilgrimages]);

  const handleGenreSelect = useCallback(
    (genre: Genre) => {
      router.push({
        pathname: '/(rate)/rating',
        params: { genreId: genre.id, genreName: genre.displayName },
      });
    },
    [router]
  );

  const handleAnimeSelect = useCallback(
    (anime: Anime) => {
      router.push({ pathname: `/anime/${anime.id}` });
    },
    [router]
  );

  const handlePilgrimageSelect = useCallback(
    (pilgrim: AnitabiBangumi) => {
      hapticsBridge.tap();
      router.push(`/pilgrimage/${pilgrim.id}`);
    },
    [router]
  );

  const handlePullAI = useCallback(async () => {
    setShowAI(true);
    await actions.loadAIRecommendation();
  }, [actions]);

  const onRefresh = useCallback(() => {
    if (state.viewMode === 'discovery') actions.loadGenres();
    if (state.viewMode === 'tracking') actions.loadSeasonal();
    if (state.viewMode === 'trend') actions.loadTrend();
  }, [actions, state.viewMode]);

  const subtitle =
    state.viewMode === 'discovery'
      ? 'Explore Genres'
      : state.viewMode === 'tracking'
        ? 'My Feed'
        : 'Top Charts';

  const headerBlock = (
    <View>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.appTitle}>AniSeekr</Text>
          <Text style={styles.appSubtitle}>{subtitle}</Text>
        </View>
        <View style={styles.headerIcons}>
          <Pressable
            onPress={() => {
              hapticsBridge.tap();
              router.push('/search');
            }}
            style={styles.iconButton}
            hitSlop={8}>
            <Ionicons name="search" size={20} color={Colors.text.secondary} />
          </Pressable>
          <Pressable onPress={handlePullAI} style={styles.iconButton} hitSlop={8}>
            <MaterialIcons name="auto-awesome" size={22} color={Colors.primary} />
          </Pressable>
          <Pressable
            onPress={() => {
              hapticsBridge.tap();
              setShowDisplaySettings(true);
            }}
            style={styles.iconButton}
            hitSlop={8}>
            <Ionicons name="settings-outline" size={20} color={Colors.text.secondary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.modeSelectorRow}>
        <ModeSelector
          options={MODE_OPTIONS}
          value={state.viewMode}
          onChange={actions.setViewMode}
        />
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={Colors.gradients.background as [string, string, ...string[]]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={[styles.safe, { paddingTop: top > 0 ? 0 : Spacing.xs }]}>
        <ImageDisplaySettingsSheet
          visible={showDisplaySettings}
          preferences={swipePrefs}
          onClose={() => setShowDisplaySettings(false)}
          onChange={handleSwipePrefsChange}
        />

        <AIRecommendationSheet
          visible={showAI}
          data={state.aiRecommendation}
          onClose={() => setShowAI(false)}
          onSelect={() => setShowAI(false)}
        />

        {state.viewMode === 'trend' ? (
          <TrendView
            anime={state.trendAnime}
            pilgrimages={trendPilgrimages}
            loadingPilgrimages={loadingTrendPilgrimages}
            headerBlock={headerBlock}
            onAnimePress={handleAnimeSelect}
            onPilgrimagePress={handlePilgrimageSelect}
            onRefresh={onRefresh}
          />
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingTop: Spacing.md,
              paddingBottom: 140,
            }}
            refreshControl={
              <RefreshControl
                tintColor={Colors.text.primary}
                refreshing={false}
                onRefresh={onRefresh}
              />
            }>
            {headerBlock}

            {state.viewMode === 'discovery' ? (
              <View style={styles.discoveryWrap}>
                <GenreCarousel data={state.availableGenres} onSelect={handleGenreSelect} />
              </View>
            ) : null}

            {state.viewMode === 'tracking' ? (
              <View style={styles.trackingWrap}>
                <SeasonalView
                  data={state.seasonalAnime}
                  layout={seasonalLayout}
                  onSelect={handleAnimeSelect}
                  onLayoutChange={handleSeasonalLayoutChange}
                />
              </View>
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

interface TrendViewProps {
  anime: Anime[];
  pilgrimages: AnitabiBangumi[];
  loadingPilgrimages: boolean;
  headerBlock: React.ReactNode;
  onAnimePress: (anime: Anime) => void;
  onPilgrimagePress: (pilgrim: AnitabiBangumi) => void;
  onRefresh: () => void;
}

function TrendView({
  anime,
  pilgrimages,
  loadingPilgrimages,
  headerBlock,
  onAnimePress,
  onPilgrimagePress,
  onRefresh,
}: TrendViewProps) {
  const hero = anime[0];
  const rest = anime.slice(1, 10);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: Spacing.md, paddingBottom: 140 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          tintColor={Colors.text.primary}
          refreshing={false}
          onRefresh={onRefresh}
        />
      }>
      {headerBlock}

      {hero ? (
        <View style={trendStyles.heroWrap}>
          <TrendingHeroCard anime={hero} onPress={() => onAnimePress(hero)} />
        </View>
      ) : (
        <View style={[trendStyles.heroWrap, trendStyles.heroPlaceholder]}>
          <Text style={trendStyles.placeholderText}>Loading trends…</Text>
        </View>
      )}

      {rest.length > 0 ? (
        <View style={trendStyles.section}>
          <View style={trendStyles.sectionHead}>
            <View>
              <Text style={trendStyles.sectionTitle}>Top {Math.min(10, anime.length)} This Week</Text>
              <Text style={trendStyles.sectionSubtitle}>Most viewed across the community</Text>
            </View>
            <Text style={trendStyles.sectionLink}>See all</Text>
          </View>
          <View style={trendStyles.list}>
            {rest.map((item, idx) => (
              <CompactRankRow
                key={`compact-${item.id}`}
                anime={item}
                rank={idx + 2}
                onPress={() => onAnimePress(item)}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={trendStyles.section}>
        <View style={trendStyles.sectionHead}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={trendStyles.titleRow}>
              <Text style={trendStyles.sectionTitle}>Trending Pilgrimages</Text>
              <View style={trendStyles.trendBadge}>
                <Ionicons name="trending-up" size={10} color={Colors.primary} />
                <Text style={trendStyles.trendBadgeText}>HOT</Text>
              </View>
            </View>
            <Text style={trendStyles.sectionSubtitle}>Real-world anime locations to visit</Text>
          </View>
          <Text style={trendStyles.sectionLink}>See all</Text>
        </View>
        {loadingPilgrimages && pilgrimages.length === 0 ? (
          <View style={trendStyles.pilgrimageEmpty}>
            <Text style={trendStyles.placeholderText}>Loading pilgrimages…</Text>
          </View>
        ) : pilgrimages.length === 0 ? (
          <View style={trendStyles.pilgrimageEmpty}>
            <Text style={trendStyles.placeholderText}>No pilgrimages available yet.</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={trendStyles.pilgrimageList}>
            {pilgrimages.map((p, idx) => (
              <TrendingPilgrimageCard
                key={`pilg-${p.id}`}
                pilgrim={p}
                rank={idx + 1}
                onPress={() => onPilgrimagePress(p)}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </ScrollView>
  );
}

interface TrendingHeroCardProps {
  anime: Anime;
  onPress: () => void;
}

function TrendingHeroCard({ anime, onPress }: TrendingHeroCardProps) {
  const score = anime.score != null ? formatScore(anime.score) : null;
  const description = anime.description?.replace(/<[^>]+>/g, '').trim();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [trendStyles.heroCard, pressed && { opacity: 0.92 }]}
      accessibilityRole="button"
      accessibilityLabel={anime.title}>
      <Image
        source={{ uri: anime.bannerImage ?? anime.image }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={250}
      />
      <LinearGradient
        colors={['rgba(8,8,8,0)', 'rgba(8,8,8,0.78)', 'rgba(8,8,8,0.96)']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={trendStyles.heroContent}>
        <View style={trendStyles.heroBadgeRow}>
          <View style={trendStyles.trendBadge}>
            <Ionicons name="trending-up" size={11} color={Colors.primary} />
            <Text style={trendStyles.trendBadgeText}>TRENDING #1</Text>
          </View>
          {anime.episodes ? (
            <Text style={trendStyles.heroMeta}>EP {anime.episodes}</Text>
          ) : null}
          {anime.status ? <Text style={trendStyles.heroMeta}>· {anime.status}</Text> : null}
          {score ? (
            <View style={trendStyles.heroScore}>
              <Ionicons name="star" size={11} color={Colors.primary} />
              <Text style={trendStyles.heroScoreText}>{score}</Text>
            </View>
          ) : null}
        </View>
        <Text style={trendStyles.heroTitle} numberOfLines={2}>
          {anime.title}
        </Text>
        {description ? (
          <Text style={trendStyles.heroDescription} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
        <View style={trendStyles.heroActions}>
          <Pressable
            onPress={onPress}
            style={({ pressed }) => [trendStyles.heroPrimaryBtn, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel="Open detail">
            <Ionicons name="play" size={14} color="#000" />
            <Text style={trendStyles.heroPrimaryText}>Open</Text>
          </Pressable>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              hapticsBridge.tap();
            }}
            style={({ pressed }) => [trendStyles.heroIconBtn, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel="Bookmark">
            <Ionicons name="bookmark-outline" size={18} color={Colors.text.primary} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

interface CompactRankRowProps {
  anime: Anime;
  rank: number;
  onPress: () => void;
}

function CompactRankRow({ anime, rank, onPress }: CompactRankRowProps) {
  const score = anime.score != null ? formatScore(anime.score) : null;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [trendStyles.rankRow, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={`Rank ${rank}, ${anime.title}`}>
      <Text style={trendStyles.rankNumber}>{String(rank).padStart(2, '0')}</Text>
      <Image
        source={{ uri: anime.image }}
        style={trendStyles.rankThumb}
        contentFit="cover"
        transition={150}
      />
      <View style={trendStyles.rankBody}>
        <Text style={trendStyles.rankTitle} numberOfLines={2}>
          {anime.title}
        </Text>
        <View style={trendStyles.rankMetaRow}>
          {anime.tags?.[0] ? (
            <Text style={trendStyles.rankTag}>{anime.tags[0]}</Text>
          ) : anime.type ? (
            <Text style={trendStyles.rankTag}>{anime.type}</Text>
          ) : null}
          {score ? (
            <View style={trendStyles.rankScore}>
              <Ionicons name="star" size={10} color={Colors.primary} />
              <Text style={trendStyles.rankScoreText}>{score}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.text.tertiary} />
    </Pressable>
  );
}

interface TrendingPilgrimageCardProps {
  pilgrim: AnitabiBangumi;
  rank: number;
  onPress: () => void;
}

function TrendingPilgrimageCard({ pilgrim, rank, onPress }: TrendingPilgrimageCardProps) {
  const themeColor = pilgrim.color || Colors.primary;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [trendStyles.pilgrimageCard, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={`Trending pilgrimage ${rank}: ${pilgrim.title}`}>
      {pilgrim.cover ? (
        <Image
          source={{ uri: pilgrim.cover.replace('?plan=h160', '?plan=h720') }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.background.secondary }]} />
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.92)']}
        locations={[0.3, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[trendStyles.pilgrimageRankPill, { borderColor: `${themeColor}88` }]}>
        <Text style={[trendStyles.pilgrimageRankText, { color: themeColor }]}>#{rank}</Text>
      </View>
      <View style={[trendStyles.pilgrimageSpotPill, { backgroundColor: `${themeColor}E6` }]}>
        <Ionicons name="location" size={10} color="#000" />
        <Text style={trendStyles.pilgrimageSpotText}>{pilgrim.pointsLength} spots</Text>
      </View>
      <View style={trendStyles.pilgrimageInfo}>
        <Text style={trendStyles.pilgrimageTitle} numberOfLines={1}>
          {pilgrim.title}
        </Text>
        {pilgrim.city ? (
          <View style={trendStyles.pilgrimageCityRow}>
            <Ionicons name="map" size={10} color={Colors.text.secondary} />
            <Text style={trendStyles.pilgrimageCity} numberOfLines={1}>
              {pilgrim.city}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function formatScore(score: number): string {
  if (score > 10) return (score / 10).toFixed(1);
  return score.toFixed(1);
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  safe: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flex: 1,
  },
  appTitle: {
    ...Typography.headlineLarge,
    fontFamily: FontFamily.rounded,
    color: Colors.text.primary,
  },
  appSubtitle: {
    ...Typography.bodySmall,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 10,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.glass.medium,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeSelectorRow: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  discoveryWrap: {
    paddingTop: 0,
  },
  trackingWrap: {
    paddingTop: Spacing.xs,
    minHeight: 500,
  },
});

const trendStyles = StyleSheet.create({
  heroWrap: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  heroPlaceholder: {
    height: 220,
    borderRadius: Radius.cardLg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.glass.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: Colors.text.secondary,
    ...Typography.bodyMedium,
  },
  heroCard: {
    height: 380,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.background.secondary,
    justifyContent: 'flex-end',
  },
  heroContent: {
    padding: 18,
    gap: 10,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 159, 10, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 159, 10, 0.65)',
  },
  trendBadgeText: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  heroMeta: {
    color: Colors.text.secondary,
    fontSize: 11,
    fontWeight: '600',
  },
  heroScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  heroScoreText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  heroTitle: {
    color: Colors.text.primary,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 32,
    letterSpacing: 0.2,
  },
  heroDescription: {
    color: Colors.text.secondary,
    fontSize: 12,
    lineHeight: 18,
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  heroPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: Colors.primary,
  },
  heroPrimaryText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
  heroIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(40, 40, 44, 0.78)',
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  section: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  sectionTitle: {
    color: Colors.text.primary,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  sectionSubtitle: {
    color: Colors.text.tertiary,
    fontSize: 12,
    marginTop: 2,
  },
  sectionLink: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
    paddingTop: 2,
  },
  list: {
    paddingHorizontal: Spacing.md,
    gap: 10,
  },

  // Compact rank row
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radius.lg,
    backgroundColor: Colors.glass.medium,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  rankNumber: {
    color: Colors.text.tertiary,
    fontSize: 22,
    fontWeight: '800',
    fontFamily: FontFamily.rounded,
    minWidth: 28,
  },
  rankThumb: {
    width: 48,
    height: 64,
    borderRadius: 8,
    backgroundColor: Colors.background.tertiary,
  },
  rankBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  rankTitle: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  rankMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  rankTag: {
    color: Colors.text.secondary,
    fontSize: 11,
    fontWeight: '500',
  },
  rankScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  rankScoreText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },

  // Pilgrimage card
  pilgrimageList: {
    paddingHorizontal: Spacing.md,
    gap: 12,
  },
  pilgrimageEmpty: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  pilgrimageCard: {
    width: 230,
    height: 200,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.background.secondary,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    justifyContent: 'flex-end',
  },
  pilgrimageRankPill: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
  },
  pilgrimageRankText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  pilgrimageSpotPill: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  pilgrimageSpotText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '700',
  },
  pilgrimageInfo: {
    padding: 12,
    gap: 4,
  },
  pilgrimageTitle: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  pilgrimageCityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pilgrimageCity: {
    color: Colors.text.secondary,
    fontSize: 11,
    fontWeight: '500',
  },
});
