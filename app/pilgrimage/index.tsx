// Pilgrimage hub. Mirrors japanwalker.pen Screen 1 (Pilgrimage Explore).
// Header → Plan your day intro → Nearby card → Popular Animes carousel →
// Featured Spots list. Data fetching stays as before; UI was rewritten to
// match the design.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { pilgrimageRepository } from '../../libs/services/pilgrimage/pilgrimage-repository';
import { FEATURED_PILGRIMAGE_ANIME } from '../../libs/services/pilgrimage/featured-anime';
import { locationService, type LatLng } from '../../libs/services/pilgrimage/location-service';
import { loadVisitedSpots, type VisitedMap } from '../../libs/services/pilgrimage/visited-prefs';
import { ThemedText, readableTextOn } from '../../components/themed';
import type { AnitabiBangumi, AnitabiPoint } from '../../libs/services/pilgrimage/types';

interface FeaturedSpot {
  spot: AnitabiPoint;
  anime: AnitabiBangumi;
  distanceKm?: number;
}

function isValidGeo(
  geo: readonly [number, number] | null | undefined
): geo is readonly [number, number] {
  if (!geo || geo.length < 2) return false;
  const [lat, lng] = geo;
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export default function PilgrimageHubScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const accentFg = readableTextOn(theme.accent);

  const [animes, setAnimes] = useState<AnitabiBangumi[]>([]);
  const [visited, setVisited] = useState<VisitedMap>({});
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
          .filter((v): v is AnitabiBangumi => v !== null)
          .sort((a, b) => (b.pointsLength ?? 0) - (a.pointsLength ?? 0));
        setAnimes(fulfilled);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadVisitedSpots().then((m) => {
      if (!cancelled) setVisited(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
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
  }, []);

  const allSpots = useMemo<FeaturedSpot[]>(() => {
    const list: FeaturedSpot[] = [];
    for (const anime of animes) {
      if (!anime.litePoints) continue;
      for (const spot of anime.litePoints) {
        if (!isValidGeo(spot.geo)) continue;
        let distanceKm: number | undefined;
        if (userLocation) {
          const d = locationService.getDistanceKm(userLocation, {
            latitude: spot.geo[0],
            longitude: spot.geo[1],
          });
          if (Number.isFinite(d)) distanceKm = d;
        }
        list.push({ spot, anime, distanceKm });
      }
    }
    return list;
  }, [animes, userLocation]);

  const nearest = useMemo<FeaturedSpot | null>(() => {
    const sorted = allSpots
      .filter((x) => x.distanceKm !== undefined)
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    return sorted[0] ?? null;
  }, [allSpots]);

  const featuredSpots = useMemo<FeaturedSpot[]>(() => {
    if (allSpots.length === 0) return [];
    const withDistance = allSpots
      .filter((x) => x.distanceKm !== undefined)
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
      .slice(0, 6);
    if (withDistance.length >= 4) return withDistance;
    // fall back to popularity-ordered spots
    return allSpots.slice(0, 6);
  }, [allSpots]);

  const handleAnimePress = useCallback(
    (anime: AnitabiBangumi) => {
      Haptics.selectionAsync().catch(() => undefined);
      router.push(`/pilgrimage/${anime.id}`);
    },
    [router]
  );

  const handleOpenMap = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    // For now the map is part of each anime detail page. A standalone region
    // map (Screen 4) is a follow-up.
    if (animes.length > 0) {
      router.push(`/pilgrimage/${animes[0].id}`);
    }
  }, [animes, router]);

  const handleSearch = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.push('/search');
  }, [router]);

  const handleOpenPlan = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.push('/pilgrimage/plan');
  }, [router]);

  const handleOpenAlbum = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.push('/pilgrimage/album');
  }, [router]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.headerBar}>
          <ThemedText variant="titleLarge" weight="700" style={styles.headerTitle}>
            聖地巡禮
          </ThemedText>
          <Pressable
            onPress={handleSearch}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Search"
            style={({ pressed }) => [styles.headerIcon, pressed && { opacity: 0.6 }]}>
            <Ionicons name="search" size={20} color={theme.text.primary} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <ThemedText variant="titleLarge" weight="700" style={{ color: theme.accent }}>
              Plan your day
            </ThemedText>
            <ThemedText variant="bodyMedium" tone="secondary" style={styles.introBody}>
              Choose an anime and find walkable spots near you.
            </ThemedText>
          </View>

          <NearbyCard
            theme={theme}
            nearest={nearest}
            hasLocation={!!userLocation}
            onPress={handleOpenMap}
          />

          <View style={styles.quickRow}>
            <QuickAction
              icon="calendar-outline"
              label="Plan trip"
              tone={theme.accent}
              onPress={handleOpenPlan}
              theme={theme}
            />
            <QuickAction
              icon="images-outline"
              label="Album"
              tone={theme.secondary}
              onPress={handleOpenAlbum}
              theme={theme}
            />
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={theme.accent} />
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="warning-outline" size={20} color={theme.status.warning} />
              <ThemedText variant="bodySmall" tone="secondary" align="center">
                {error}
              </ThemedText>
            </View>
          ) : null}

          {animes.length > 0 ? (
            <View style={styles.section}>
              <SectionHeader
                title="Popular Animes"
                cta="See all"
                onCta={handleOpenMap}
                theme={theme}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.popularRow}>
                {animes.slice(0, 12).map((anime) => (
                  <PopularCard
                    key={anime.id}
                    anime={anime}
                    visited={visited}
                    accent={theme.accent}
                    accentFg={accentFg}
                    theme={theme}
                    onPress={() => handleAnimePress(anime)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {featuredSpots.length > 0 ? (
            <View style={styles.section}>
              <SectionHeader
                title="Featured Spots"
                cta="View map"
                onCta={handleOpenMap}
                theme={theme}
              />
              <View style={styles.spotList}>
                {featuredSpots.map(({ spot, anime, distanceKm }) => (
                  <FeaturedSpotRow
                    key={spot.id}
                    spot={spot}
                    anime={anime}
                    distanceKm={distanceKm}
                    theme={theme}
                    onPress={() => handleAnimePress(anime)}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function NearbyCard({
  theme,
  nearest,
  hasLocation,
  onPress,
}: {
  theme: ThemePalette;
  nearest: FeaturedSpot | null;
  hasLocation: boolean;
  onPress: () => void;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Nearby pilgrimage spots"
      style={({ pressed }) => [styles.nearbyCard, pressed && { opacity: 0.92 }]}>
      <View style={[styles.nearbyMapPreview, { backgroundColor: theme.background.tertiary }]}>
        <LinearGradient
          colors={[
            `${theme.accent}26`,
            'rgba(0,0,0,0.45)',
            `${theme.secondary}22`,
          ]}
          style={StyleSheet.absoluteFill}
        />
        {/* decorative pin cluster */}
        <View style={[styles.nearbyPinSm, { top: 14, left: 30, backgroundColor: theme.accent }]} />
        <View style={[styles.nearbyPinSm, { top: 38, left: 110, backgroundColor: theme.secondary }]} />
        <View
          style={[
            styles.nearbyPinLg,
            { backgroundColor: theme.accent, borderColor: theme.background.primary },
          ]}>
          <Ionicons name="location" size={14} color={readableTextOn(theme.accent)} />
        </View>
        <View
          style={[styles.nearbyPinSm, { bottom: 18, right: 56, backgroundColor: theme.accent }]}
        />
        <View
          style={[styles.nearbyPinSm, { bottom: 36, left: 70, backgroundColor: theme.secondary }]}
        />
      </View>
      <View style={styles.nearbyBody}>
        <ThemedText variant="titleMedium" weight="700">
          Nearby Pilgrimage Spots
        </ThemedText>
        <ThemedText variant="bodySmall" tone="secondary" style={{ marginTop: 4 }}>
          {hasLocation
            ? nearest
              ? `Nearest: ${formatKm(nearest.distanceKm!)} · ${nearest.spot.cn || nearest.spot.name}`
              : 'No mapped spots within range yet'
            : 'Enable location to surface walking-distance spots'}
        </ThemedText>
        <View style={styles.nearbyMeta}>
          <Ionicons name="navigate" size={11} color={theme.accent} />
          <ThemedText
            variant="captionSmall"
            weight="600"
            style={{ color: theme.accent }}>
            Open map
          </ThemedText>
          <Ionicons name="chevron-forward" size={12} color={theme.text.tertiary} />
        </View>
      </View>
    </Pressable>
  );
}

function QuickAction({
  icon,
  label,
  tone,
  onPress,
  theme,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  tone: string;
  onPress: () => void;
  theme: ThemePalette;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.quickAction,
        {
          backgroundColor: theme.background.secondary,
          borderColor: theme.glassBorder,
        },
        pressed && { opacity: 0.85 },
      ]}>
      <View
        style={[
          styles.quickIcon,
          {
            backgroundColor: `${tone}24`,
            borderColor: `${tone}66`,
          },
        ]}>
        <Ionicons name={icon} size={18} color={tone} />
      </View>
      <ThemedText variant="bodyMedium" weight="600">
        {label}
      </ThemedText>
      <Ionicons name="chevron-forward" size={14} color={theme.text.tertiary} />
    </Pressable>
  );
}

function SectionHeader({
  title,
  cta,
  onCta,
  theme,
}: {
  title: string;
  cta?: string;
  onCta?: () => void;
  theme: ThemePalette;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.sectionHeader}>
      <ThemedText variant="titleLarge" weight="700">
        {title}
      </ThemedText>
      {cta && onCta ? (
        <Pressable
          onPress={onCta}
          hitSlop={10}
          style={({ pressed }) => [styles.sectionCta, pressed && { opacity: 0.6 }]}>
          <ThemedText variant="bodySmall" weight="600" style={{ color: theme.accent }}>
            {cta}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

function PopularCard({
  anime,
  visited,
  accent,
  accentFg,
  theme,
  onPress,
}: {
  anime: AnitabiBangumi;
  visited: VisitedMap;
  accent: string;
  accentFg: string;
  theme: ThemePalette;
  onPress: () => void;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const total = anime.pointsLength ?? 0;
  const visitedCount = (anime.litePoints ?? []).filter((p) => visited[p.id]).length;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${anime.cn || anime.title} pilgrimage`}
      style={({ pressed }) => [styles.popularCard, pressed && { opacity: 0.9 }]}>
      <Image
        source={{ uri: anime.cover }}
        style={styles.popularCover}
        contentFit="cover"
        transition={180}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.78)']}
        style={styles.popularGradient}
      />
      <View style={[styles.popularBadge, { backgroundColor: `${accent}E6` }]}>
        <ThemedText variant="captionSmall" weight="700" style={{ color: accentFg }}>
          {total} spots
        </ThemedText>
      </View>
      {visitedCount > 0 ? (
        <View style={styles.popularVisitedBadge}>
          <Ionicons name="checkmark-circle" size={12} color={theme.status.success} />
          <ThemedText
            variant="captionSmall"
            weight="700"
            style={{ color: theme.status.success }}>
            {visitedCount}
          </ThemedText>
        </View>
      ) : null}
      <View style={styles.popularBody}>
        <ThemedText
          variant="titleSmall"
          weight="700"
          numberOfLines={1}
          style={{ color: '#fff' }}>
          {anime.cn || anime.title}
        </ThemedText>
        <ThemedText
          variant="captionSmall"
          numberOfLines={1}
          style={{ color: 'rgba(255,255,255,0.78)' }}>
          {anime.city || '—'}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function FeaturedSpotRow({
  spot,
  anime,
  distanceKm,
  theme,
  onPress,
}: {
  spot: AnitabiPoint;
  anime: AnitabiBangumi;
  distanceKm?: number;
  theme: ThemePalette;
  onPress: () => void;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${spot.cn || spot.name} from ${anime.cn || anime.title}`}
      style={({ pressed }) => [styles.spotRow, pressed && { opacity: 0.9 }]}>
      <Image
        source={{ uri: spot.image }}
        style={styles.spotThumb}
        contentFit="cover"
        transition={150}
      />
      <View style={styles.spotBody}>
        <ThemedText variant="bodyMedium" weight="700" numberOfLines={1}>
          {spot.cn || spot.name}
        </ThemedText>
        <View style={styles.spotMetaRow}>
          <Ionicons name="film" size={11} color={theme.text.tertiary} />
          <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
            {anime.cn || anime.title}
          </ThemedText>
          {distanceKm !== undefined ? (
            <>
              <View style={[styles.spotMetaDot, { backgroundColor: theme.text.tertiary }]} />
              <ThemedText variant="captionSmall" weight="600" style={{ color: theme.accent }}>
                {formatKm(distanceKm)}
              </ThemedText>
            </>
          ) : null}
        </View>
      </View>
      <View style={[styles.spotChevron, { backgroundColor: theme.background.tertiary }]}>
        <Ionicons name="chevron-forward" size={14} color={theme.text.secondary} />
      </View>
    </Pressable>
  );
}

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background.primary },
    headerBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    headerTitle: { letterSpacing: 1 },
    headerIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    scrollContent: {
      paddingHorizontal: 20,
      gap: 18,
    },
    intro: {
      gap: 6,
    },
    introBody: {
      lineHeight: 20,
    },
    nearbyCard: {
      borderRadius: 20,
      overflow: 'hidden',
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    nearbyMapPreview: {
      height: 130,
      position: 'relative',
      overflow: 'hidden',
    },
    nearbyPinSm: {
      position: 'absolute',
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    nearbyPinLg: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      marginLeft: -16,
      marginTop: -16,
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
    },
    nearbyBody: {
      padding: Spacing.md,
      gap: 2,
    },
    nearbyMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 10,
    },
    quickRow: {
      flexDirection: 'row',
      gap: 10,
    },
    quickAction: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: Radius.card,
      borderWidth: 1,
    },
    quickIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    loadingBox: {
      alignItems: 'center',
      paddingVertical: 32,
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: Spacing.md,
      backgroundColor: `${theme.status.warning}14`,
      borderColor: `${theme.status.warning}55`,
      borderWidth: 1,
      borderRadius: Radius.card,
    },
    section: {
      gap: 12,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    popularRow: {
      gap: 12,
      paddingRight: 4,
    },
    popularCard: {
      width: 160,
      height: 200,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: theme.background.secondary,
    },
    popularCover: {
      ...StyleSheet.absoluteFillObject,
    },
    popularGradient: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '60%',
    },
    popularBadge: {
      position: 'absolute',
      top: 10,
      left: 10,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    popularVisitedBadge: {
      position: 'absolute',
      top: 10,
      right: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderWidth: 1,
      borderColor: `${theme.status.success}66`,
    },
    popularBody: {
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: 12,
      gap: 2,
    },
    spotList: {
      gap: 10,
    },
    spotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 10,
      borderRadius: Radius.card,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    spotThumb: {
      width: 64,
      height: 64,
      borderRadius: 12,
      backgroundColor: theme.background.tertiary,
    },
    spotBody: {
      flex: 1,
      gap: 4,
    },
    spotMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    spotMetaDot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      opacity: 0.6,
    },
    spotChevron: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
