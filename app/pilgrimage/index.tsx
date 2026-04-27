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
import { PilgrimageMapView } from '../../components/pilgrimage/PilgrimageMapView';
import { Colors, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { pilgrimageRepository } from '../../libs/services/pilgrimage/pilgrimage-repository';
import { FEATURED_PILGRIMAGE_ANIME } from '../../libs/services/pilgrimage/featured-anime';
import { locationService, type LatLng } from '../../libs/services/pilgrimage/location-service';
import type { AnitabiBangumi } from '../../libs/services/pilgrimage/types';

type ViewMode = 'list' | 'map';

export default function PilgrimageHubScreen() {
  const { top } = useSafeAreaInsets();
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [anime, setAnime] = useState<AnitabiBangumi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
            (r): r is PromiseFulfilledResult<AnitabiBangumi | null> =>
              r.status === 'fulfilled'
          )
          .map((r) => r.value)
          .filter((value): value is AnitabiBangumi => value !== null)
          .sort((a, b) => (b.pointsLength ?? 0) - (a.pointsLength ?? 0));

        setAnime(fulfilled);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : 'Failed to load pilgrimage data';
        setError(message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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

  const mapEntries = useMemo(
    () =>
      anime.map((item) => ({
        anime: item,
        distanceKm: userLocation
          ? locationService.getDistanceKm(userLocation, {
              latitude: item.geo?.[0] ?? 0,
              longitude: item.geo?.[1] ?? 0,
            })
          : undefined,
      })),
    [anime, userLocation]
  );

  const handleAnimePress = useCallback(
    (item: AnitabiBangumi) => {
      router.push(`/pilgrimage/${item.id}`);
    },
    [router]
  );

  const handleToggle = useCallback((mode: ViewMode) => {
    Haptics.selectionAsync().catch(() => undefined);
    setViewMode(mode);
  }, []);

  const popular = useMemo(() => anime.slice(0, 5), [anime]);

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

        <View style={styles.toggleWrap}>
          <ViewModeToggle value={viewMode} onChange={handleToggle} />
        </View>

        {viewMode === 'map' ? (
          <View style={styles.mapWrap}>
            <PilgrimageMapView
              animeList={mapEntries}
              userLocation={userLocation}
              onMarkerPress={handleAnimePress}
              style={styles.mapView}
            />
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
          {loading ? (
            <View style={styles.stateContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.stateText}>Loading pilgrimage spots…</Text>
            </View>
          ) : error ? (
            <AniCard variant="bordered" padding={Spacing.cardPadding} style={styles.errorCard}>
              <MaterialIcons name="error-outline" size={32} color={Colors.error} />
              <Text style={styles.errorTitle}>Couldn’t load locations</Text>
              <Text style={styles.errorBody}>{error}</Text>
            </AniCard>
          ) : anime.length === 0 ? (
            <AniCard variant="bordered" padding={Spacing.cardPadding} style={styles.errorCard}>
              <MaterialIcons name="explore-off" size={32} color={Colors.text.tertiary} />
              <Text style={styles.errorTitle}>No pilgrimage data yet</Text>
              <Text style={styles.errorBody}>
                Curated anime locations will appear here once available.
              </Text>
            </AniCard>
          ) : (
            <>
              {popular.length > 0 ? (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Popular Spots</Text>
                    <Text style={styles.sectionCount}>{anime.length}</Text>
                  </View>
                  <FlatList
                    horizontal
                    data={popular}
                    keyExtractor={(item) => `popular-${item.id}`}
                    renderItem={({ item }) => (
                      <View style={styles.popularItem}>
                        <AnimePilgrimageCard anime={item} onPress={handleAnimePress} />
                      </View>
                    )}
                    contentContainerStyle={styles.popularList}
                    showsHorizontalScrollIndicator={false}
                  />
                </View>
              ) : null}

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>All Anime</Text>
                </View>
                <View style={styles.listColumn}>
                  {anime.map((item) => (
                    <AnimePilgrimageCard
                      key={item.id}
                      anime={item}
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
      accessibilityState={{ selected: active }}
    >
      {active ? (
        <LinearGradient
          colors={Colors.gradients.primary as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View style={toggleStyles.segmentContent}>
        <MaterialIcons
          name={icon}
          size={16}
          color={active ? '#000000' : Colors.text.secondary}
        />
        <Text
          style={[
            toggleStyles.segmentLabel,
            { color: active ? '#000000' : Colors.text.secondary },
          ]}
        >
          {label}
        </Text>
      </View>
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
  toggleWrap: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: Spacing.md,
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
  },
  mapView: {
    flex: 1,
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
