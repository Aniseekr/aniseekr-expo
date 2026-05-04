// Home / Rate screen — three modes (Discovery / Tracking / Trend) styled to match
// the iOS HomeRateView. Uses ModeSelector for the pill segmented control,
// GenreCarousel for the 9:16 cards, and AniCard glass surfaces for sections.

import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GenreCarousel } from '../../components/rate/GenreCarousel';
import { SimpleAnimeCard } from '../../components/rate/SimpleAnimeCard';
import { TrendCard } from '../../components/rate/TrendCard';
import { AIRecommendationSheet } from '../../components/rate/AIRecommendationSheet';
import { ModeSelector } from '../../components/rate/ModeSelector';
import {
  ImageDisplaySettingsSheet,
  DEFAULT_RATING_PREFS,
  RatingPreferences,
} from '../../components/rate/ImageDisplaySettingsSheet';
import { useRateData } from '../../components/rate/useRateData';
import { Anime, Genre, ViewMode } from '../../components/rate/types';
import { BrowseSourceChip } from '../../components/common/BrowseSourceChip';
import { AniCard } from '../../components/common/AniCard';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { Colors, FontFamily, Spacing, Typography } from '../../constants/DesignSystem';

const MODE_OPTIONS: readonly { value: ViewMode; label: string }[] = [
  { value: 'discovery', label: 'Discovery' },
  { value: 'tracking', label: 'Seasonal' },
  { value: 'trend', label: 'Trend' },
];

export default function HomeRateScreen() {
  const { top } = useSafeAreaInsets();
  const { state, actions } = useRateData();
  const router = useRouter();
  const [showAI, setShowAI] = useState(false);
  const [showDisplaySettings, setShowDisplaySettings] = useState(false);
  const [ratingPrefs, setRatingPrefs] = useState<RatingPreferences>(DEFAULT_RATING_PREFS);

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
      router.push({ pathname: `/(rate)/anime/${anime.id}` });
    },
    [router]
  );

  const handlePullAI = useCallback(async () => {
    setShowAI(true);
    await actions.loadAIRecommendation();
  }, [actions]);

  const onRefresh = useCallback(() => {
    if (state.viewMode === 'discovery') actions.loadGenres();
    if (state.viewMode === 'tracking') {
      actions.loadSeasonal();
      actions.loadRecommendations();
    }
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

      <View style={styles.sourceChipRow}>
        <BrowseSourceChip />
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
          preferences={ratingPrefs}
          onClose={() => setShowDisplaySettings(false)}
          onChange={setRatingPrefs}
        />

        <AIRecommendationSheet
          visible={showAI}
          data={state.aiRecommendation}
          onClose={() => setShowAI(false)}
          onSelect={() => setShowAI(false)}
        />

        {state.viewMode === 'trend' ? (
          <FlatList
            data={state.trendAnime}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <View style={{ paddingHorizontal: Spacing.md }}>
                <TrendCard anime={item} rank={index + 1} onPress={() => handleAnimeSelect(item)} />
              </View>
            )}
            contentContainerStyle={{
              paddingTop: Spacing.md,
              paddingBottom: 140,
            }}
            ListHeaderComponent={headerBlock}
            refreshControl={
              <RefreshControl
                tintColor={Colors.text.primary}
                refreshing={false}
                onRefresh={onRefresh}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Loading trends...</Text>
              </View>
            }
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
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Browse by Genre</Text>
                  <Text style={styles.sectionSubtitle}>Swipe to explore</Text>
                </View>
                <GenreCarousel data={state.availableGenres} onSelect={handleGenreSelect} />
              </View>
            ) : null}

            {state.viewMode === 'tracking' ? (
              <View style={styles.trackingWrap}>
                <AniCard variant="glass" intensity={20} style={styles.trackingCard}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Latest Season</Text>
                    <Pressable onPress={() => actions.loadSeasonal()}>
                      <Text style={styles.linkText}>Refresh</Text>
                    </Pressable>
                  </View>
                  <FlatList
                    horizontal
                    data={state.seasonalAnime}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                      <SimpleAnimeCard anime={item} onPress={() => handleAnimeSelect(item)} />
                    )}
                    contentContainerStyle={{
                      paddingHorizontal: Spacing.md,
                      paddingBottom: Spacing.sm,
                    }}
                    showsHorizontalScrollIndicator={false}
                    ListEmptyComponent={
                      <View style={styles.emptyHorizontal}>
                        <Text style={styles.emptyText}>Loading season...</Text>
                      </View>
                    }
                  />
                </AniCard>

                <AniCard variant="glass" intensity={20} style={styles.trackingCard}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>For You</Text>
                    <Pressable onPress={() => actions.loadRecommendations()} hitSlop={8}>
                      <Ionicons name="refresh" size={18} color={Colors.text.secondary} />
                    </Pressable>
                  </View>
                  <FlatList
                    horizontal
                    data={state.recommendations.map((r) => r.anime)}
                    keyExtractor={(item) => `rec-${item.id}`}
                    renderItem={({ item }) => (
                      <SimpleAnimeCard anime={item} onPress={() => handleAnimeSelect(item)} />
                    )}
                    contentContainerStyle={{
                      paddingHorizontal: Spacing.md,
                      paddingBottom: Spacing.sm,
                    }}
                    showsHorizontalScrollIndicator={false}
                    ListEmptyComponent={
                      <View style={styles.emptyHorizontal}>
                        <Text style={styles.emptyText}>
                          Interact with anime to get recommendations.
                        </Text>
                      </View>
                    }
                  />
                </AniCard>
              </View>
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
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
  sourceChipRow: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  modeSelectorRow: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  discoveryWrap: {
    minHeight: 480,
    paddingTop: Spacing.xs,
  },
  trackingWrap: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  trackingCard: {
    paddingTop: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.headlineSmall,
    color: Colors.text.primary,
    fontFamily: FontFamily.rounded,
  },
  sectionSubtitle: {
    ...Typography.bodySmall,
    color: Colors.text.tertiary,
  },
  linkText: {
    ...Typography.titleSmall,
    color: Colors.primary,
  },
  emptyContainer: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  emptyHorizontal: {
    width: 280,
    paddingLeft: Spacing.md,
    paddingVertical: Spacing.md,
  },
  emptyText: {
    ...Typography.bodyMedium,
    color: Colors.text.secondary,
  },
});
