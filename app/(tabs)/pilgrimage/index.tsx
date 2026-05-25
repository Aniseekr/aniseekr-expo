// Pilgrimage hub. Matches japanwalker.pen Screen 1 (q3N3pG):
// Header (聖地巡禮 + album + search) → Plan your day intro →
// Nearby hero (170h with grid + scatter pins; opens the See All map) →
// Popular Animes rail (128x200) → Featured Spots list (72 photo + info +
// 56 mini map).
//
// The hub is list-only. Map view lives on the See All screen
// (app/(tabs)/pilgrimage/map.tsx) so users land on a navigable card list
// first and tap into the map deliberately — see Issue: "see all 應該優先是
// list 才讓人點進 map".
//
// Data priority (matches "collection 優先, 不夠再補 featured" requirement):
//   1. The user's collection (user_anime + favorites) joined to Anitabi via
//      collectionPilgrimageService — these are the anime the user actually
//      cares about and should anchor every rail/list.
//   2. FEATURED_PILGRIMAGE_ANIME backfills until the rails feel populated.
//
// Featured Spots rank real distance first. Planned landmarks and collection
// entries get bounded boosts so intent matters without burying nearby spots.

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { pilgrimageRepository } from '../../../libs/services/pilgrimage/pilgrimage-repository';
import { FEATURED_PILGRIMAGE_ANIME } from '../../../libs/services/pilgrimage/featured-anime';
import { collectionPilgrimageService } from '../../../libs/services/pilgrimage/collection-pilgrimage-service';
import { locationService, type LatLng } from '../../../libs/services/pilgrimage/location-service';
import {
  loadVisitedSpotsSync,
  type VisitedMap,
} from '../../../libs/services/pilgrimage/visited-prefs';
import {
  loadSpotIntentsSync,
  type SpotIntentMap,
} from '../../../libs/services/pilgrimage/spot-intents';
import { rankFeaturedSpotsByPriority } from '../../../libs/services/pilgrimage/featured-spots';
import {
  getPilgrimageHubSnapshot,
  updatePilgrimageHubSnapshot,
  type PilgrimageHubSnapshot,
} from '../../../libs/services/pilgrimage/pilgrimage-hub-cache';
import { Skeleton, ThemedText, readableTextOn } from '../../../components/themed';
import { Tourism88Rail } from '../../../components/pilgrimage/Tourism88Rail';
import { AnitabiAttributionFooter } from '../../../components/pilgrimage/common/AnitabiAttributionFooter';
import { getUnique88AnimeByPopularity } from '../../../libs/services/pilgrimage/anime88-repository';
import {
  getAllIndexed,
  getIndexVersion,
  subscribeAnitabiIndex,
} from '../../../libs/services/pilgrimage/anitabi-index';
import { buildSeededPilgrimageAnimes } from '../../../libs/services/pilgrimage/pilgrimage-screen-state';
import {
  formatPilgrimageSubtitle,
  getPilgrimageAnimeTitles,
  getPilgrimageSpotTitles,
} from '../../../libs/services/pilgrimage/pilgrimage-localization';
import { buildPilgrimageDetailRoute } from '../../../libs/services/pilgrimage/pilgrimage-navigation';
import type { AnitabiBangumi, AnitabiPoint } from '../../../libs/services/pilgrimage/types';

interface FeaturedSpot {
  spot: AnitabiPoint;
  anime: AnitabiBangumi;
  distanceKm?: number;
  fromCollection: boolean;
  planned: boolean;
}

interface AnimeCard {
  anime: AnitabiBangumi;
  fromCollection: boolean;
  distanceKm?: number;
}

// Tiered radii — most users are not standing in Japan, so a hard 50km cap
// makes the "nearby" hero permanently empty. We fan out and label each tier
// honestly instead of pretending everything is "near".
const NEARBY_TIERS_KM: readonly { km: number; label: string }[] = [
  { km: 30, label: 'walking · 30 km' },
  { km: 100, label: 'day trip · 100 km' },
  { km: 500, label: 'in region · 500 km' },
  { km: 5000, label: 'in Japan' },
];
const FEATURED_SPOT_LIMIT = 6;
const POPULAR_LIMIT = 14;
const COLLECTION_BACKFILL_TARGET = 16;

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

function hasSnapshotSlice<K extends keyof PilgrimageHubSnapshot>(
  snapshot: PilgrimageHubSnapshot | null,
  key: K
): boolean {
  return !!snapshot && Object.prototype.hasOwnProperty.call(snapshot, key);
}

function buildSeededFeatured(): AnitabiBangumi[] {
  return buildSeededPilgrimageAnimes(
    FEATURED_PILGRIMAGE_ANIME.map(({ bangumiId }) => bangumiId)
  );
}

export default function PilgrimageHubScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const accentFg = readableTextOn(theme.accent);
  const [initialSnapshot] = useState(() => getPilgrimageHubSnapshot());
  const hasInitialCollection = hasSnapshotSlice(initialSnapshot, 'collectionAnimes');
  const hasInitialFeatured = hasSnapshotSlice(initialSnapshot, 'featuredAnimes');

  const [collectionAnimes, setCollectionAnimes] = useState<AnitabiBangumi[]>(
    () => initialSnapshot?.collectionAnimes ?? []
  );
  // Seed featured from the bundled offline index so the rail renders on frame
  // 1 even on a fresh install (no SQLite cache yet). The HTTP fill-in below
  // upgrades each entry with `litePoints` as responses stream in. This is
  // what kills the 30s+ skeleton — first paint now happens in <100ms.
  const [featuredAnimes, setFeaturedAnimes] = useState<AnitabiBangumi[]>(() => {
    const cached = initialSnapshot?.featuredAnimes;
    if (cached && cached.length > 0) return cached;
    return buildSeededFeatured();
  });
  const [collectionLoading, setCollectionLoading] = useState(!hasInitialCollection);
  // `featuredLoading` now means "still filling in litePoints", not "no cards
  // at all" — the seed gives us cards from the start. The skeleton below
  // gates on `animeCards.length === 0`, so it only shows when we genuinely
  // have nothing to render.
  const [featuredLoading, setFeaturedLoading] = useState(!hasInitialFeatured);
  const [visited, setVisited] = useState<VisitedMap>(
    () => initialSnapshot?.visited ?? loadVisitedSpotsSync()
  );
  const [spotIntents, setSpotIntents] = useState<SpotIntentMap>(loadSpotIntentsSync);
  const [userLocation, setUserLocation] = useState<LatLng | null>(
    () => initialSnapshot?.userLocation ?? null
  );
  const [error, setError] = useState<string | null>(null);

  const loading = collectionLoading || featuredLoading;

  useEffect(() => {
    let cancelled = false;
    setCollectionLoading(!hasInitialCollection);
    collectionPilgrimageService
      .getEntries()
      .then((entries) => {
        if (cancelled) return;
        const animes = entries
          .map((e) => e.anime)
          .filter((a): a is AnitabiBangumi => !!a)
          .sort((a, b) => (b.pointsLength ?? 0) - (a.pointsLength ?? 0));
        setCollectionAnimes(animes);
        updatePilgrimageHubSnapshot({ collectionAnimes: animes });
        setCollectionLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Collection failures shouldn't block the hub — featured backfill is
        // enough to render something useful.
        console.warn('[PilgrimageHub] collection load failed:', err);
        if (!hasInitialCollection) setCollectionAnimes([]);
        setCollectionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasInitialCollection]);

  useEffect(() => {
    let cancelled = false;
    setFeaturedLoading(!hasInitialFeatured);

    // Stream the per-anime `/lite` responses in instead of waiting for all
    // ~30 to settle. The seeded list is rendered first; each successful HTTP
    // response merges its richer payload (mainly `litePoints`) into state.
    // setState calls are coalesced via a 200ms batch window so we don't
    // re-run `allSpots` 30 times in a row on a cold install.
    const ids = FEATURED_PILGRIMAGE_ANIME.map(({ bangumiId }) => bangumiId);
    const pending: AnitabiBangumi[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const commit = () => {
      flushTimer = null;
      if (cancelled || pending.length === 0) return;
      const batch = pending.splice(0);
      setFeaturedAnimes((current) => {
        const byId = new Map(current.map((a) => [a.id, a] as const));
        for (const fresh of batch) byId.set(fresh.id, fresh);
        const merged = Array.from(byId.values()).sort(
          (a, b) => (b.pointsLength ?? 0) - (a.pointsLength ?? 0)
        );
        updatePilgrimageHubSnapshot({ featuredAnimes: merged });
        return merged;
      });
    };

    const scheduleCommit = () => {
      if (flushTimer != null) return;
      flushTimer = setTimeout(commit, 200);
    };

    let remaining = ids.length;
    let anySuccess = false;
    for (const id of ids) {
      pilgrimageRepository
        .getSpotsByBangumiId(id)
        .then((anime) => {
          if (cancelled) return;
          if (anime) {
            anySuccess = true;
            pending.push(anime);
            scheduleCommit();
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          // Per-anime failures are common (404, transient network) — don't
          // surface them, just leave the seeded card alone.
          console.warn('[PilgrimageHub] featured fetch failed:', id, err);
        })
        .finally(() => {
          if (cancelled) return;
          remaining -= 1;
          if (remaining === 0) {
            if (flushTimer != null) {
              clearTimeout(flushTimer);
              flushTimer = null;
            }
            commit();
            // Only show the network error when we had no seeded fallback AND
            // every request failed; otherwise the user already sees cards.
            if (!anySuccess && !hasInitialFeatured && featuredAnimes.length === 0) {
              setError('Failed to load');
            } else {
              setError(null);
            }
            setFeaturedLoading(false);
          }
        });
    }

    return () => {
      cancelled = true;
      if (flushTimer != null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
    };
    // featuredAnimes intentionally excluded — only read at error time and the
    // value at effect-mount is what we want there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInitialFeatured]);

  // Visited / spot-intents are seeded synchronously above from MMKV; no
  // async reconcile needed. The snapshot is also primed from those seeds.
  useEffect(() => {
    updatePilgrimageHubSnapshot({ visited });
    // Only fires once on first mount — `visited` is the seed value and
    // doesn't change here. Per-spot toggles flow through their own writers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    locationService
      .getCurrentLocation()
      .then((loc) => {
        if (!cancelled) {
          setUserLocation(loc ?? null);
          updatePilgrimageHubSnapshot({ userLocation: loc ?? null });
        }
      })
      .catch(() => {
        if (!cancelled) updatePilgrimageHubSnapshot({ userLocation: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Merge: collection first, then backfill from featured (deduped by id).
  const animeCards = useMemo<AnimeCard[]>(() => {
    const seen = new Set<number>();
    const out: AnimeCard[] = [];
    for (const anime of collectionAnimes) {
      if (seen.has(anime.id)) continue;
      seen.add(anime.id);
      out.push({ anime, fromCollection: true });
    }
    if (out.length < COLLECTION_BACKFILL_TARGET) {
      for (const anime of featuredAnimes) {
        if (seen.has(anime.id)) continue;
        seen.add(anime.id);
        out.push({ anime, fromCollection: false });
        if (out.length >= COLLECTION_BACKFILL_TARGET) break;
      }
    }
    if (userLocation) {
      for (const card of out) {
        if (!isValidGeo(card.anime.geo)) continue;
        const d = locationService.getDistanceKm(userLocation, {
          latitude: card.anime.geo[0],
          longitude: card.anime.geo[1],
        });
        if (Number.isFinite(d)) card.distanceKm = d;
      }
    }
    return out;
  }, [collectionAnimes, featuredAnimes, userLocation]);

  const allSpots = useMemo<FeaturedSpot[]>(() => {
    const list: FeaturedSpot[] = [];
    for (const card of animeCards) {
      const points = card.anime.litePoints ?? [];
      for (const spot of points) {
        if (!isValidGeo(spot.geo)) continue;
        let distanceKm: number | undefined;
        if (userLocation) {
          const d = locationService.getDistanceKm(userLocation, {
            latitude: spot.geo[0],
            longitude: spot.geo[1],
          });
          if (Number.isFinite(d)) distanceKm = d;
        }
        list.push({
          spot,
          anime: card.anime,
          distanceKm,
          fromCollection: card.fromCollection,
          planned: spotIntents[spot.id]?.planned === true,
        });
      }
    }
    return list;
  }, [animeCards, userLocation, spotIntents]);

  // Walk through tiers until we find a non-empty one, so users outside Japan
  // still see something meaningful (even if it just says "in Japan" with the
  // closest hub).
  const nearby = useMemo<{ tierLabel: string | null; list: AnimeCard[] }>(() => {
    if (!userLocation) return { tierLabel: null, list: [] };
    const sorted = animeCards
      .filter((c) => c.distanceKm !== undefined)
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    if (sorted.length === 0) return { tierLabel: null, list: [] };
    for (const tier of NEARBY_TIERS_KM) {
      const within = sorted.filter((c) => (c.distanceKm ?? Infinity) <= tier.km);
      if (within.length > 0) return { tierLabel: tier.label, list: within };
    }
    return { tierLabel: 'closest', list: sorted.slice(0, 5) };
  }, [animeCards, userLocation]);

  const nearbyAnime = nearby.list;
  const nearestAnime = nearbyAnime[0] ?? null;

  const featuredSpots = useMemo<FeaturedSpot[]>(() => {
    return rankFeaturedSpotsByPriority(allSpots).slice(0, FEATURED_SPOT_LIMIT);
  }, [allSpots]);

  const handleAnimePress = useCallback(
    (anime: AnitabiBangumi) => {
      Haptics.selectionAsync().catch(() => undefined);
      router.push(
        buildPilgrimageDetailRoute(anime.id, {
          returnTo: 'hub',
          title: anime.title || anime.cn,
          titleSecondary: anime.cn && anime.cn !== anime.title ? anime.cn : null,
          poster: anime.cover,
          themeColor: anime.color,
        })
      );
    },
    [router]
  );

  const handleSearch = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    // context=pilgrimage tells /search to route picked results to
    // /pilgrimage/[bangumiId] instead of /anime/[id] so the user stays
    // inside the pilgrimage flow.
    router.push({ pathname: '/search', params: { context: 'pilgrimage' } });
  }, [router]);

  const handleOpenAlbum = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.push('/pilgrimage/album');
  }, [router]);

  // "See all" next to the Popular Animes rail keeps the user's list-scanning
  // intent even though the See All route is now map-first by default.
  const handleSeeAllAnimes = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.push({ pathname: '/pilgrimage/map', params: { mode: 'list' } });
  }, [router]);

  // True fullscreen has to leave the Tabs container — pushing to a sibling
  // route registered with `tabBarStyle: { display: 'none' }` is the only way
  // to actually hide the bottom dock. Back from there returns to the hub.
  // The hero card is the sole map entry point on the hub now; it opens the
  // See All screen directly in map mode and centres on the nearest anime.
  const handleHeroPress = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    const focus = nearestAnime?.anime.id ?? null;
    router.push({
      pathname: '/pilgrimage/map',
      params: {
        mode: 'map',
        ...(focus ? { focus: String(focus) } : {}),
      },
    });
  }, [nearestAnime, router]);

  const popularList = useMemo(() => animeCards.slice(0, POPULAR_LIMIT), [animeCards]);

  // Anime Tourism 88 rail. Sorted once at module import; the cover map is
  // rebuilt from anitabi-index (drops to placeholder when an entry isn't in
  // the offline Anitabi cache yet).
  const tourism88Entries = useMemo(() => getUnique88AnimeByPopularity(), []);
  const anitabiIndexVersion = useSyncExternalStore(
    subscribeAnitabiIndex,
    getIndexVersion,
    getIndexVersion
  );
  const tourism88Covers = useMemo(() => {
    void anitabiIndexVersion;
    const m = new Map<number, string>();
    for (const e of getAllIndexed()) {
      if (e.cover) m.set(e.id, e.cover);
    }
    return m;
  }, [anitabiIndexVersion]);
  const collectionBangumiIds = useMemo(
    () => new Set(collectionAnimes.map((a) => a.id)),
    [collectionAnimes]
  );
  const handle88EntryPress = useCallback(
    (entry: (typeof tourism88Entries)[number]) => {
      Haptics.selectionAsync().catch(() => undefined);
      router.push(
        buildPilgrimageDetailRoute(entry.bangumiId, {
          returnTo: 'hub',
          title: entry.titleJa || entry.titleEn,
          titleSecondary:
            entry.titleEn && entry.titleEn !== entry.titleJa ? entry.titleEn : null,
          poster: tourism88Covers.get(entry.bangumiId) ?? null,
        })
      );
    },
    [router, tourism88Covers]
  );
  const handleSee88All = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.push({ pathname: '/pilgrimage/map', params: { mode: 'map' } });
  }, [router]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.headerBar}>
          <ThemedText variant="titleLarge" weight="700" style={styles.headerTitle}>
            Pilgrimage
          </ThemedText>
          <View style={styles.headerRight}>
            <Pressable
              onPress={handleOpenAlbum}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="My pilgrimage album"
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}>
              <Ionicons name="albums-outline" size={18} color={theme.text.primary} />
            </Pressable>
            <Pressable
              onPress={handleSearch}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Search"
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}>
              <Ionicons name="search" size={18} color={theme.text.primary} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={[styles.introCaps, { color: theme.accent }]}>
              PLAN YOUR DAY
            </ThemedText>
            <ThemedText variant="bodySmall" style={styles.introBody}>
              {collectionAnimes.length > 0
                ? 'Anime from your collection, plus picks near you.'
                : 'Choose an anime and find walkable spots near you.'}
            </ThemedText>
          </View>

          <NearbyHero
            theme={theme}
            nearestAnime={nearestAnime}
            nearbyCount={nearbyAnime.length}
            tierLabel={nearby.tierLabel}
            hasLocation={!!userLocation}
            onPress={handleHeroPress}
          />

          {/*
            Only show the placeholder rail when we genuinely have nothing.
            With the offline-index seed, `animeCards` is populated on frame 1
            for the featured set, so the skeleton only appears for users with
            an empty collection AND an offline index that didn't cover any of
            the featured anime — vanishingly rare.
          */}
          {loading && animeCards.length === 0 ? (
            <Skeleton.AnimeCardList count={6} paddingHorizontal={0} />
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="warning-outline" size={20} color={theme.status.warning} />
              <ThemedText variant="bodySmall" tone="secondary" align="center">
                {error}
              </ThemedText>
            </View>
          ) : null}

          <Tourism88Rail
            entries={tourism88Entries}
            collectionBangumiIds={collectionBangumiIds}
            coversById={tourism88Covers}
            onPressEntry={handle88EntryPress}
            onSeeAll={handleSee88All}
          />

          {popularList.length > 0 ? (
            <View style={styles.section}>
              <SectionHeader
                title={collectionAnimes.length > 0 ? 'Your Animes & More' : 'Popular Animes'}
                cta="See all"
                onCta={handleSeeAllAnimes}
                theme={theme}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.popularRow}>
                {popularList.map((card) => (
                  <PopularCard
                    key={card.anime.id}
                    anime={card.anime}
                    visited={visited}
                    accent={theme.accent}
                    accentFg={accentFg}
                    theme={theme}
                    fromCollection={card.fromCollection}
                    distanceKm={card.distanceKm}
                    onPress={() => handleAnimePress(card.anime)}
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
                onCta={handleHeroPress}
                theme={theme}
              />
              <View style={styles.spotList}>
                {featuredSpots.map(({ spot, anime, distanceKm, fromCollection }) => (
                  <FeaturedSpotRow
                    key={`${anime.id}:${spot.id}`}
                    spot={spot}
                    anime={anime}
                    distanceKm={distanceKm}
                    fromCollection={fromCollection}
                    theme={theme}
                    onPress={() => handleAnimePress(anime)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <AnitabiAttributionFooter bangumiId={null} variant="footer" />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function NearbyHero({
  theme,
  nearestAnime,
  nearbyCount,
  tierLabel,
  hasLocation,
  onPress,
}: {
  theme: ThemePalette;
  nearestAnime: AnimeCard | null;
  nearbyCount: number;
  tierLabel: string | null;
  hasLocation: boolean;
  onPress: () => void;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const fgPin = readableTextOn(theme.accent);
  const nearestTitles = nearestAnime ? getPilgrimageAnimeTitles(nearestAnime.anime) : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open pilgrimage map"
      style={({ pressed }) => [styles.heroCard, pressed && { opacity: 0.92 }]}>
      <View style={styles.heroGrid} pointerEvents="none">
        {[60, 130, 200, 270, 330].map((x) => (
          <View
            key={`v${x}`}
            style={[styles.gridLineV, { left: x, backgroundColor: theme.glassBorder }]}
          />
        ))}
        {[34, 68, 102, 136].map((y) => (
          <View
            key={`h${y}`}
            style={[styles.gridLineH, { top: y, backgroundColor: theme.glassBorder }]}
          />
        ))}
        <View style={[styles.roadPath, { backgroundColor: theme.glassBorder, opacity: 0.55 }]} />
      </View>

      {nearestAnime?.anime.cover ? (
        <Image
          source={{ uri: nearestAnime.anime.cover }}
          style={styles.heroCoverArt}
          contentFit="cover"
          transition={200}
        />
      ) : null}

      <View
        style={[styles.satPin, { left: 78, top: 48, backgroundColor: theme.background.tertiary }]}
      />
      <View
        style={[
          styles.satPin,
          {
            left: 266,
            top: 34,
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: theme.background.tertiary,
          },
        ]}
      />
      <View
        style={[
          styles.satPin,
          {
            left: 118,
            top: 118,
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: theme.background.tertiary,
          },
        ]}
      />

      <View
        style={[
          styles.primaryPin,
          {
            backgroundColor: theme.accent,
            borderColor: theme.background.primary,
            shadowColor: theme.accent,
          },
        ]}>
        <Ionicons name="location" size={12} color={fgPin} />
      </View>

      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.92)']}
        style={styles.heroOverlay}
        pointerEvents="none"
      />
      <View style={styles.heroBody}>
        <View style={styles.heroLabelRow}>
          <View style={[styles.heroPinBadge, { backgroundColor: theme.background.tertiary }]}>
            <Ionicons name="location" size={11} color={theme.text.primary} />
          </View>
          <ThemedText variant="bodySmall" weight="700">
            {hasLocation && nearbyCount > 0 && tierLabel
              ? `${nearbyCount} ${nearbyCount === 1 ? 'anime' : 'animes'} · ${tierLabel}`
              : 'Pilgrimage Map'}
          </ThemedText>
        </View>
        <ThemedText variant="captionSmall" tone="secondary" style={{ marginTop: 4 }}>
          {hasLocation
            ? nearestAnime
              ? `Closest: ${nearestTitles?.primary ?? 'Unknown Title'}${
                  nearestAnime.distanceKm !== undefined
                    ? ` · ${formatKm(nearestAnime.distanceKm)} away`
                    : ''
                }`
              : 'No mapped anime yet — tap to open the map'
            : 'Tap to browse pilgrimage spots across Japan'}
        </ThemedText>
      </View>
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
      <ThemedText variant="titleMedium" weight="700">
        {title}
      </ThemedText>
      {cta && onCta ? (
        <Pressable
          onPress={onCta}
          hitSlop={10}
          style={({ pressed }) => [styles.sectionCta, pressed && { opacity: 0.6 }]}>
          <ThemedText variant="captionSmall" weight="500" tone="secondary">
            {cta}
          </ThemedText>
          <Ionicons name="chevron-forward" size={12} color={theme.text.tertiary} />
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
  fromCollection,
  distanceKm,
  onPress,
}: {
  anime: AnitabiBangumi;
  visited: VisitedMap;
  accent: string;
  accentFg: string;
  theme: ThemePalette;
  fromCollection: boolean;
  distanceKm?: number;
  onPress: () => void;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const total = anime.pointsLength ?? 0;
  const visitedCount = (anime.litePoints ?? []).filter((p) => visited[p.id]).length;
  const titles = getPilgrimageAnimeTitles(anime);
  const subtitle = formatPilgrimageSubtitle(titles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${titles.primary} pilgrimage`}
      style={({ pressed }) => [styles.popularCard, pressed && { opacity: 0.9 }]}>
      <View style={styles.popularPosterWrap}>
        <Image
          source={{ uri: anime.cover }}
          style={styles.popularPoster}
          contentFit="cover"
          transition={180}
        />
        <View style={[styles.popularBadge, { backgroundColor: `${accent}E6` }]}>
          <ThemedText variant="captionSmall" weight="700" style={{ color: accentFg, fontSize: 10 }}>
            {total} spots
          </ThemedText>
        </View>
        {fromCollection ? (
          <View style={[styles.collectionBadge, { backgroundColor: `${theme.status.info}D9` }]}>
            <Ionicons name="bookmark" size={9} color={readableTextOn(theme.status.info)} />
          </View>
        ) : null}
        {visitedCount > 0 ? (
          <View style={styles.popularVisited}>
            <Ionicons name="checkmark" size={10} color={theme.status.success} />
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: theme.status.success, fontSize: 9 }}>
              {visitedCount}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <View style={styles.popularMeta}>
        <ThemedText variant="captionSmall" weight="700" numberOfLines={1} style={{ fontSize: 12 }}>
          {titles.primary}
        </ThemedText>
        {subtitle ? (
          <ThemedText
            variant="captionSmall"
            tone="secondary"
            numberOfLines={1}
            style={{ fontSize: 10 }}>
            {subtitle}
          </ThemedText>
        ) : null}
        <ThemedText
          variant="captionSmall"
          tone="tertiary"
          numberOfLines={1}
          style={{ fontSize: 10 }}>
          {distanceKm !== undefined
            ? `${formatKm(distanceKm)} · ${anime.city || '—'}`
            : anime.city || '—'}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function FeaturedSpotRow({
  spot,
  anime,
  distanceKm,
  fromCollection,
  theme,
  onPress,
}: {
  spot: AnitabiPoint;
  anime: AnitabiBangumi;
  distanceKm?: number;
  fromCollection: boolean;
  theme: ThemePalette;
  onPress: () => void;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const spotTitles = getPilgrimageSpotTitles(spot);
  const animeTitles = getPilgrimageAnimeTitles(anime);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${spotTitles.primary} from ${animeTitles.primary}`}
      style={({ pressed }) => [styles.spotRow, pressed && { opacity: 0.92 }]}>
      <Image
        source={{ uri: spot.image }}
        style={styles.spotThumb}
        contentFit="cover"
        transition={150}
      />
      <View style={styles.spotBody}>
        <View style={styles.spotTitleRow}>
          <ThemedText variant="bodySmall" weight="700" numberOfLines={1} style={{ flex: 1 }}>
            {spotTitles.primary}
          </ThemedText>
          {fromCollection ? (
            <View
              style={[
                styles.collectionPill,
                {
                  backgroundColor: `${theme.status.info}1A`,
                  borderColor: `${theme.status.info}66`,
                },
              ]}>
              <Ionicons name="bookmark" size={9} color={theme.status.info} />
            </View>
          ) : null}
        </View>
        <View style={styles.spotMetaRow}>
          <Ionicons name="film-outline" size={10} color={theme.text.tertiary} />
          <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
            {animeTitles.primary}
            {anime.city ? ` · ${anime.city}` : ''}
          </ThemedText>
        </View>
        {distanceKm !== undefined ? (
          <View style={styles.spotDistRow}>
            <Ionicons name="navigate" size={10} color={theme.accent} />
            <ThemedText variant="captionSmall" weight="600" style={{ color: theme.accent }}>
              {formatKm(distanceKm)}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <View style={[styles.miniMap, { backgroundColor: theme.background.tertiary }]}>
        <LinearGradient
          colors={[`${theme.accent}1F`, 'rgba(0,0,0,0.0)']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[styles.miniMapPin, { backgroundColor: theme.accent }]} />
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
      paddingHorizontal: 24,
      paddingTop: 8,
      paddingBottom: 4,
      gap: 12,
    },
    headerTitle: { fontSize: 22 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    scrollContent: { paddingHorizontal: 20, paddingTop: 20, gap: 22 },
    intro: { gap: 4 },
    introCaps: { letterSpacing: 1.2, fontSize: 12 },
    introBody: { lineHeight: 18 },
    heroCard: {
      height: 170,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    heroGrid: { ...StyleSheet.absoluteFillObject },
    heroCoverArt: {
      ...StyleSheet.absoluteFillObject,
      opacity: 0.18,
    },
    gridLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, opacity: 0.5 },
    gridLineH: { position: 'absolute', left: 0, right: 0, height: 1, opacity: 0.5 },
    roadPath: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 90,
      height: 2,
      transform: [{ rotate: '-4deg' }],
    },
    satPin: {
      position: 'absolute',
      width: 18,
      height: 18,
      borderRadius: 9,
      opacity: 0.85,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    primaryPin: {
      position: 'absolute',
      left: '50%',
      top: '40%',
      marginLeft: -14,
      marginTop: -14,
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.5,
      shadowRadius: 10,
      elevation: 6,
    },
    heroOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 78,
    },
    heroBody: { position: 'absolute', left: 16, right: 16, bottom: 14 },
    heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    heroPinBadge: {
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      backgroundColor: `${theme.status.warning}14`,
      borderColor: `${theme.status.warning}55`,
      borderWidth: 1,
      borderRadius: 14,
    },
    section: { gap: 12 },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionCta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    popularRow: { gap: 12, paddingRight: 4 },
    popularCard: {
      width: 128,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    popularPosterWrap: {
      height: 148,
      width: '100%',
      backgroundColor: theme.background.tertiary,
    },
    popularPoster: { width: '100%', height: '100%' },
    popularBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
    },
    collectionBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    popularVisited: {
      position: 'absolute',
      bottom: 8,
      right: 8,
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
    popularMeta: { padding: 8, paddingHorizontal: 10, gap: 2 },
    spotList: { gap: 10 },
    spotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 10,
      borderRadius: 14,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    spotThumb: {
      width: 72,
      height: 72,
      borderRadius: 10,
      backgroundColor: theme.background.tertiary,
    },
    spotBody: { flex: 1, gap: 3 },
    spotTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    collectionPill: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    spotMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    spotDistRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    miniMap: {
      width: 56,
      height: 56,
      borderRadius: 10,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    miniMapPin: { width: 10, height: 10, borderRadius: 5 },
  });
}
