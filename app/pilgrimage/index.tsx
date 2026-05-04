import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { AniCard } from '../../components/common/AniCard';
import { AnimePilgrimageCard } from '../../components/pilgrimage/AnimePilgrimageCard';
import {
  PilgrimageMapView,
  type PilgrimageMapAnime,
} from '../../components/pilgrimage/PilgrimageMapView';
import { Colors, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { pilgrimageRepository } from '../../libs/services/pilgrimage/pilgrimage-repository';
import { FEATURED_PILGRIMAGE_ANIME } from '../../libs/services/pilgrimage/featured-anime';
import { locationService, type LatLng } from '../../libs/services/pilgrimage/location-service';
import {
  collectionPilgrimageService,
  type CollectionPilgrimageEntry,
  type CollectionStatus,
} from '../../libs/services/pilgrimage/collection-pilgrimage-service';
import type { AnitabiBangumi } from '../../libs/services/pilgrimage/types';

type ViewMode = 'list' | 'map';
type SourceMode = 'mine' | 'all';

interface DisplayItem {
  anime: AnitabiBangumi;
  inCollection: boolean;
  status?: CollectionStatus;
  isFavorite?: boolean;
}

const STATUS_LABELS: Record<CollectionStatus, string> = {
  watching: 'Watching',
  completed: 'Completed',
  on_hold: 'On Hold',
  dropped: 'Dropped',
  plan_to_watch: 'Plan to Watch',
};

export default function PilgrimageHubScreen() {
  const { top } = useSafeAreaInsets();
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sourceMode, setSourceMode] = useState<SourceMode>('mine');
  const [featured, setFeatured] = useState<AnitabiBangumi[]>([]);
  const [collected, setCollected] = useState<CollectionPilgrimageEntry[]>([]);
  const [collectionTotal, setCollectionTotal] = useState(0);
  const [loadingFeatured, setLoadingFeatured] = useState(true);
  const [loadingMine, setLoadingMine] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);

  // Load featured anime once.
  useEffect(() => {
    let cancelled = false;
    setLoadingFeatured(true);
    setError(null);

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
          .filter((value): value is AnitabiBangumi => value !== null)
          .sort((a, b) => (b.pointsLength ?? 0) - (a.pointsLength ?? 0));

        setFeatured(fulfilled);
        setLoadingFeatured(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load pilgrimage data';
        setError(message);
        setLoadingFeatured(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Load collected anime once. Re-fetched on focus would be nicer but the
  // collection screen only writes via this app session, and a manual refresh
  // can be wired up later.
  useEffect(() => {
    let cancelled = false;
    setLoadingMine(true);

    Promise.all([collectionPilgrimageService.getEntries(), collectionPilgrimageService.getStats()])
      .then(([entries, stats]) => {
        if (cancelled) return;
        setCollected(entries);
        setCollectionTotal(stats.total);
        setLoadingMine(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCollected([]);
        setCollectionTotal(0);
        setLoadingMine(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Lazy-fetch user location only when the map is visible.
  useEffect(() => {
    if (viewMode !== 'map' || userLocation) return;
    let cancelled = false;
    locationService
      .getCurrentLocation()
      .then((loc) => {
        if (!cancelled && loc) setUserLocation(loc);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [viewMode, userLocation]);

  // Build the display list based on the current source filter.
  const displayItems = useMemo<DisplayItem[]>(() => {
    if (sourceMode === 'mine') {
      return collected.map((entry) => ({
        anime: entry.anime,
        inCollection: true,
        status: entry.status,
        isFavorite: entry.isFavorite,
      }));
    }
    const collectedIds = new Set(collected.map((e) => e.bangumiId));
    const collectedById = new Map(collected.map((e) => [e.bangumiId, e]));
    return featured.map((anime) => {
      const match = collectedById.get(anime.id);
      return {
        anime,
        inCollection: collectedIds.has(anime.id),
        status: match?.status,
        isFavorite: match?.isFavorite,
      };
    });
  }, [sourceMode, collected, featured]);

  const mapEntries = useMemo<PilgrimageMapAnime[]>(
    () =>
      displayItems.map((item) => {
        const [latitude, longitude] = item.anime.geo ?? [];
        const hasValidGeo =
          typeof latitude === 'number' &&
          typeof longitude === 'number' &&
          Number.isFinite(latitude) &&
          Number.isFinite(longitude) &&
          (latitude !== 0 || longitude !== 0);

        return {
          anime: item.anime,
          inCollection: item.inCollection,
          distanceKm:
            userLocation && hasValidGeo
              ? locationService.getDistanceKm(userLocation, { latitude, longitude })
              : undefined,
        };
      }),
    [displayItems, userLocation]
  );

  const handleAnimePress = useCallback(
    (item: AnitabiBangumi) => {
      router.push(`/pilgrimage/${item.id}`);
    },
    [router]
  );

  const handleViewToggle = useCallback((mode: ViewMode) => {
    Haptics.selectionAsync().catch(() => undefined);
    setViewMode(mode);
  }, []);

  const handleSourceToggle = useCallback((mode: SourceMode) => {
    Haptics.selectionAsync().catch(() => undefined);
    setSourceMode(mode);
  }, []);

  const popular = useMemo(() => displayItems.slice(0, 5), [displayItems]);
  const collectionMatched = collected.length;
  const isLoading = sourceMode === 'mine' ? loadingMine : loadingFeatured;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={Colors.gradients.background as unknown as [string, string, ...string[]]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.bgGlowPrimary} pointerEvents="none" />
      <View style={styles.bgGlowSecondary} pointerEvents="none" />

      <SafeAreaView style={[styles.safeArea, { paddingTop: top }]}>
        <View style={styles.headerContainer}>
          <Text style={styles.title}>聖地巡礼</Text>
          <Text style={styles.subtitle}>Real-world anime locations</Text>
        </View>

        <View style={styles.controlsWrap}>
          <SourceToggle value={sourceMode} onChange={handleSourceToggle} />
          <CollectionStatChip
            matched={collectionMatched}
            total={collectionTotal}
            loading={loadingMine}
            active={sourceMode === 'mine'}
            onPress={() => handleSourceToggle(sourceMode === 'mine' ? 'all' : 'mine')}
          />
          <ViewModeToggle value={viewMode} onChange={handleViewToggle} />
        </View>

        {viewMode === 'map' ? (
          <View style={styles.mapWrap}>
            {isLoading && mapEntries.length === 0 ? (
              <View style={styles.mapLoading}>
                <ActivityIndicator size="large" color={Colors.primary} />
              </View>
            ) : mapEntries.length === 0 ? (
              renderEmpty(sourceMode, error)
            ) : (
              <PilgrimageMapView
                animeList={mapEntries}
                userLocation={userLocation}
                onMarkerPress={handleAnimePress}
                style={styles.mapView}
              />
            )}
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}>
            {isLoading ? (
              <View style={styles.stateContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.stateText}>
                  {sourceMode === 'mine'
                    ? 'Scanning your collection…'
                    : 'Loading pilgrimage spots…'}
                </Text>
              </View>
            ) : error && sourceMode === 'all' ? (
              <AniCard variant="bordered" padding={Spacing.cardPadding} style={styles.errorCard}>
                <MaterialIcons name="error-outline" size={32} color={Colors.error} />
                <Text style={styles.errorTitle}>Couldn’t load locations</Text>
                <Text style={styles.errorBody}>{error}</Text>
              </AniCard>
            ) : displayItems.length === 0 ? (
              renderEmpty(sourceMode, null)
            ) : (
              <>
                {popular.length > 0 ? (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>
                        {sourceMode === 'mine' ? 'Top in your collection' : 'Popular Spots'}
                      </Text>
                      <Text style={styles.sectionCount}>{displayItems.length}</Text>
                    </View>
                    <FlatList
                      horizontal
                      data={popular}
                      keyExtractor={(item) => `popular-${item.anime.id}`}
                      renderItem={({ item }) => (
                        <View style={styles.popularItem}>
                          <AnimePilgrimageCard
                            anime={item.anime}
                            inCollection={item.inCollection}
                            collectionLabel={collectionLabel(item)}
                            onPress={handleAnimePress}
                          />
                        </View>
                      )}
                      contentContainerStyle={styles.popularList}
                      showsHorizontalScrollIndicator={false}
                    />
                  </View>
                ) : null}

                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>
                      {sourceMode === 'mine' ? 'All your spots' : 'All Anime'}
                    </Text>
                  </View>
                  <View style={styles.listColumn}>
                    {displayItems.map((item) => (
                      <AnimePilgrimageCard
                        key={item.anime.id}
                        anime={item.anime}
                        inCollection={item.inCollection}
                        collectionLabel={collectionLabel(item)}
                        onPress={handleAnimePress}
                      />
                    ))}
                  </View>
                </View>
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

function collectionLabel(item: DisplayItem): string | undefined {
  if (!item.inCollection) return undefined;
  if (item.status) return STATUS_LABELS[item.status];
  if (item.isFavorite) return 'Favorite';
  return 'In Collection';
}

function renderEmpty(sourceMode: SourceMode, error: string | null) {
  if (error) {
    return (
      <AniCard variant="bordered" padding={Spacing.cardPadding} style={styles.errorCard}>
        <MaterialIcons name="error-outline" size={32} color={Colors.error} />
        <Text style={styles.errorTitle}>Couldn’t load locations</Text>
        <Text style={styles.errorBody}>{error}</Text>
      </AniCard>
    );
  }

  if (sourceMode === 'mine') {
    return (
      <AniCard variant="bordered" padding={Spacing.cardPadding} style={styles.errorCard}>
        <MaterialIcons name="explore" size={32} color={Colors.text.tertiary} />
        <Text style={styles.errorTitle}>No pilgrimage spots from your collection yet</Text>
        <Text style={styles.errorBody}>
          Add anime set in Japan to your collection — we’ll match them against the Anitabi location
          database. Tap “All” above to explore curated picks.
        </Text>
      </AniCard>
    );
  }

  return (
    <AniCard variant="bordered" padding={Spacing.cardPadding} style={styles.errorCard}>
      <MaterialIcons name="explore-off" size={32} color={Colors.text.tertiary} />
      <Text style={styles.errorTitle}>No pilgrimage data yet</Text>
      <Text style={styles.errorBody}>Curated anime locations will appear here once available.</Text>
    </AniCard>
  );
}

interface SourceToggleProps {
  value: SourceMode;
  onChange: (mode: SourceMode) => void;
}

function SourceToggle({ value, onChange }: SourceToggleProps) {
  return (
    <View style={toggleStyles.outer}>
      <ToggleSegment
        active={value === 'mine'}
        label="Mine"
        icon="favorite"
        onPress={() => onChange('mine')}
      />
      <ToggleSegment
        active={value === 'all'}
        label="All"
        icon="public"
        onPress={() => onChange('all')}
      />
    </View>
  );
}

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  return (
    <View style={toggleStyles.outer}>
      <ToggleSegment
        active={value === 'list'}
        label="List"
        icon="view-list"
        onPress={() => onChange('list')}
      />
      <ToggleSegment
        active={value === 'map'}
        label="Map"
        icon="map"
        onPress={() => onChange('map')}
      />
    </View>
  );
}

interface ToggleSegmentProps {
  active: boolean;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
}

function ToggleSegment({ active, label, icon, onPress }: ToggleSegmentProps) {
  return (
    <Pressable
      onPress={onPress}
      style={toggleStyles.segment}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}>
      {active ? (
        <LinearGradient
          colors={Colors.gradients.primary as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View style={toggleStyles.segmentContent}>
        <MaterialIcons name={icon} size={16} color={active ? '#000000' : Colors.text.secondary} />
        <Text
          style={[
            toggleStyles.segmentLabel,
            { color: active ? '#000000' : Colors.text.secondary },
          ]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

interface CollectionStatChipProps {
  matched: number;
  total: number;
  loading: boolean;
  active: boolean;
  onPress: () => void;
}

function CollectionStatChip({ matched, total, loading, active, onPress }: CollectionStatChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        chipStyles.chip,
        active ? chipStyles.chipActive : null,
        pressed ? chipStyles.chipPressed : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${matched} of ${total} collected anime have pilgrimage spots`}>
      <MaterialIcons name="place" size={14} color={active ? '#000' : Colors.primary} />
      <Text style={[chipStyles.chipText, active ? chipStyles.chipTextActive : null]}>
        {loading ? '…' : `${matched} / ${total}`}
      </Text>
      <Text style={[chipStyles.chipSubText, active ? chipStyles.chipTextActive : null]}>
        spots in collection
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  safeArea: {
    flex: 1,
  },
  bgGlowPrimary: {
    position: 'absolute',
    top: -100,
    right: -80,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: 'rgba(255, 159, 10, 0.10)',
    opacity: 0.7,
  },
  bgGlowSecondary: {
    position: 'absolute',
    bottom: -120,
    left: -60,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(191, 90, 242, 0.10)',
    opacity: 0.6,
  },
  headerContainer: {
    paddingHorizontal: Spacing.screenPadding,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  title: {
    color: Colors.text.primary,
    ...Typography.headlineLarge,
  },
  subtitle: {
    color: Colors.text.secondary,
    marginTop: 4,
    ...Typography.bodyMedium,
  },
  controlsWrap: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 140,
  },
  stateContainer: {
    paddingTop: 80,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stateText: {
    color: Colors.text.secondary,
    ...Typography.bodyMedium,
  },
  errorCard: {
    marginHorizontal: Spacing.screenPadding,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  errorTitle: {
    color: Colors.text.primary,
    marginTop: Spacing.xs,
    textAlign: 'center',
    ...Typography.titleMedium,
  },
  errorBody: {
    color: Colors.text.secondary,
    textAlign: 'center',
    ...Typography.bodySmall,
  },
  section: {
    marginBottom: Spacing.sectionSpacing,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.screenPadding,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    color: Colors.text.primary,
    ...Typography.titleMedium,
    fontSize: 18,
    fontWeight: '700',
  },
  sectionCount: {
    color: Colors.primary,
    ...Typography.titleSmall,
  },
  popularList: {
    paddingHorizontal: Spacing.screenPadding,
    gap: Spacing.sm,
  },
  popularItem: {
    width: 260,
    marginRight: Spacing.sm,
  },
  listColumn: {
    paddingHorizontal: Spacing.screenPadding,
    gap: Spacing.sm,
  },
  mapWrap: {
    flex: 1,
    marginHorizontal: Spacing.screenPadding,
    marginBottom: 110,
    borderRadius: Radius.cardLg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.background.secondary,
  },
  mapView: {
    flex: 1,
  },
  mapLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const toggleStyles = StyleSheet.create({
  outer: {
    flexDirection: 'row',
    backgroundColor: Colors.glass.dark,
    borderRadius: Radius.full,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  segment: {
    flex: 1,
    height: 40,
    borderRadius: Radius.full,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  segmentLabel: {
    ...Typography.titleSmall,
    fontSize: 14,
    fontWeight: '600',
  },
});

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: Colors.glass.medium,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipPressed: {
    opacity: 0.85,
  },
  chipText: {
    color: Colors.text.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  chipSubText: {
    color: Colors.text.secondary,
    fontSize: 12,
  },
  chipTextActive: {
    color: '#000',
  },
});
