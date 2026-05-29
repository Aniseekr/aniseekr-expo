// Pilgrimage hub map. Map-first design mirroring the per-anime detail screen
// (app/(tabs)/pilgrimage/[animeId].tsx) so the user perceives the hub → detail
// transition as a continuous focus shift instead of a hard page change:
//
//   • Full-bleed Leaflet WebView is the primary surface.
//   • A floating top overlay carries back + album + an in-page search field,
//     plus a region chip strip for the Anime Tourism 88 selection.
//   • A persistent pull-up bottom sheet (PilgrimageHubSheet) hosts the
//     focused-anime card, hub stats, and the nearby anime list.
//   • A floating bottom chrome (filter chips + Grid/Rows toggle) is anchored
//     to the sheet's top edge via a shared value so it hugs the handle as the
//     user drags.
//
// Tapping an anime — on the map, on the focused card, or on a list row —
// pushes to `/pilgrimage/[animeId]`, which is the same map+sheet shell zoomed
// to one anime. The swap arrow on the focused card cycles the nearest list
// without leaving this screen.
//
// Lives outside the Tabs UI so the bottom dock + hub top-bar both disappear.
//
// Route params:
//   - focus?: number — bangumi id to focus the map on (initial centre)

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { Radius, Spacing, Typography } from '../../../constants/DesignSystem';
import { ThemedText, Skeleton, readableTextOn } from '../../../components/themed';
import { locationService, type LatLng } from '../../../libs/services/pilgrimage/location-service';
import {
  LOCATE_FAB_COMPASS_ZOOM,
  LOCATE_FAB_ZOOM,
  useUserLocationTracking,
} from '../../../libs/services/pilgrimage/use-user-location-tracking';
import { LocateFab } from '../../../components/pilgrimage/LocateFab';
import { LocationPermissionSheet } from '../../../components/pilgrimage/LocationPermissionSheet';
import {
  ANIME_TOURISM_88_REGIONS,
  get88EntriesWithCoords,
  type AnimeTourism88Region,
  type AnimeTourism88EntryWithCoords,
} from '../../../libs/services/pilgrimage/anime88-repository';
import { getNumberParam } from '../../../libs/utils/route-params';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';
import {
  HubMapWebView,
  OFFICIAL_88_GOLD,
  type HubMapMarker,
  type HubMapWebViewHandle,
  type RegionBounds,
} from '../../../components/pilgrimage/HubMapWebView';
import { getPilgrimageAnimeTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import { buildPilgrimageDetailRoute } from '../../../libs/services/pilgrimage/pilgrimage-navigation';
import { getPilgrimageHubSnapshot } from '../../../libs/services/pilgrimage/pilgrimage-hub-cache';
import { resolvePilgrimageMapInitialMode } from '../../../libs/services/pilgrimage/pilgrimage-design-flow';
import { usePilgrimageHubData } from '../../../hooks/usePilgrimageHubData';
import {
  PilgrimageHubSheet,
  type HubAnimeEntry,
  type HubStats,
} from '../../../components/pilgrimage/PilgrimageHubSheet';
import { RoundHeaderButton } from '../../../components/pilgrimage/detail/RoundHeaderButton';
import { FilterPill } from '../../../components/pilgrimage/detail/FilterPill';
import { useT } from '../../../libs/i18n';

// 7-region taxonomy from animetourism88.com — Tokyo is split from Kanto.
const REGION_88_LABELS: Record<AnimeTourism88Region, string> = {
  hokkaido_tohoku: 'Hokkaido / Tohoku',
  kanto: 'Kanto',
  tokyo: 'Tokyo',
  chubu: 'Chubu',
  kinki: 'Kinki',
  chugoku_shikoku: 'Chugoku / Shikoku',
  kyushu_okinawa: 'Kyushu / Okinawa',
};

// Geographic bounding boxes for each region. Hand-tuned to feel like a
// regional view (not a city zoom): a region tap should let the user see "the
// whole Kanto / whole Kyushu" before they drill into a specific anime.
// Tokyo Metro is the 23-ward area so it stays distinct from the wider Kanto.
// RegionBounds is exported from HubMapWebView (the WebView's __flyToBounds payload shape).
const REGION_BOUNDS: Record<AnimeTourism88Region, RegionBounds> = {
  hokkaido_tohoku: { south: 37.0, west: 139.4, north: 45.6, east: 146.0 },
  kanto: { south: 35.0, west: 138.7, north: 37.0, east: 141.0 },
  tokyo: { south: 35.5, west: 139.3, north: 35.9, east: 140.0 },
  chubu: { south: 34.6, west: 136.0, north: 38.0, east: 139.5 },
  kinki: { south: 33.5, west: 134.2, north: 35.8, east: 136.5 },
  chugoku_shikoku: { south: 32.5, west: 130.7, north: 35.7, east: 134.5 },
  kyushu_okinawa: { south: 24.0, west: 122.9, north: 34.5, east: 132.0 },
};

// Whole-Japan bounding box — south of Yonaguni to north of Hokkaido.
// Used when the user taps the "全日本" reset chip.
const JAPAN_BOUNDS: RegionBounds = {
  south: 24.0,
  west: 122.9,
  north: 45.6,
  east: 146.0,
};

// OFFICIAL_88_GOLD (the 88-selection mark colour) is imported from
// HubMapWebView — shared between build88Markers here and the WebView's pin CSS.

function build88Markers(entries: readonly AnimeTourism88EntryWithCoords[]): HubMapMarker[] {
  const out: HubMapMarker[] = [];
  for (const e of entries) {
    const bangumi = e.externalIds.bangumi;
    if (typeof bangumi !== 'number') continue;
    out.push({
      markerId: `88:${e.id}`,
      bangumiId: bangumi,
      lat: e.lat,
      lng: e.lng,
      cover: '',
      title: e.titleEn || e.titleJa,
      city: `${e.prefecture ?? ''}${e.city}`,
      pointsLength: 0,
      ringColor: OFFICIAL_88_GOLD,
      is88: true,
      eightyEightId: e.id,
    });
  }
  return out;
}

function isValidGeo(geo: readonly [number, number] | null | undefined): boolean {
  if (!geo || geo.length < 2) return false;
  const [lat, lng] = geo;
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

// Sheet snap peek fraction — kept in lockstep with PilgrimageHubSheet's snap
// array. Used as a fallback chrome offset if the sheet's animatedPosition
// hasn't been written yet.
const SHEET_PEEK_FRACTION = 0.16;
const VIEW_MODE_TOGGLE_HEIGHT = 52;

type HubFilter = 'all' | 'collection' | 'official88';

export default function PilgrimageMapScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const params = useLocalSearchParams();
  const initialMode = useMemo(
    () => resolvePilgrimageMapInitialMode(params.mode),
    [params.mode]
  );
  const focusBangumiIdParam = getNumberParam(params, 'focus');
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme, insets.top), [theme, insets.top]);
  const themeColor = theme.accent;
  const themeColorFg = readableTextOn(themeColor);

  // The locate FAB and the WebView's user-marker share a single hook so the
  // dot, the cone, the recentre, and the permission sheet all stay in sync.
  // Snapshot-seeded `initialLocation` keeps the dot visible on warm starts.
  // Read once at mount — the data hook reads the same module snapshot for its
  // own seed; this narrow read just feeds the tracking dot.
  const mapHandleRef = useRef<HubMapWebViewHandle>(null);
  const [initialUserLocation] = useState<LatLng | null>(
    () => getPilgrimageHubSnapshot()?.userLocation ?? null
  );
  const tracking = useUserLocationTracking({
    initialLocation: initialUserLocation,
    onFollowLocation: (loc, fs) => {
      mapHandleRef.current?.recenter(
        loc.latitude,
        loc.longitude,
        fs === 'compass' ? LOCATE_FAB_COMPASS_ZOOM : LOCATE_FAB_ZOOM,
        { animate: true }
      );
    },
    onHeadingChange: (deg) => {
      mapHandleRef.current?.setHeading(deg);
    },
  });
  const userLocation = tracking.location;

  // ─── Data cluster (collection + featured + lazy index, MMKV-seeded) ──────
  // Lifted into usePilgrimageHubData so this screen stays a view orchestrator
  // (CLAUDE.md Rule 9). The hook owns the snapshot/index seed, the loading
  // transitions, the bounds-/location-driven lazy loading, and the synchronous
  // visited/capture seeding; it consumes the live userLocation we feed in.
  const {
    knownAnimes,
    collectionIds,
    loading,
    visited,
    captureCount,
    handleBoundsChange,
  } = usePilgrimageHubData({ focusBangumiId: focusBangumiIdParam, userLocation });

  // ─── View state (parent-owned) ──────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [hubFilter, setHubFilter] = useState<HubFilter>('all');
  const [listLayout, setListLayout] = useState<'grid' | 'rows'>('rows');
  const [focusedRegion, setFocusedRegion] = useState<AnimeTourism88Region | null>(null);
  const [flyTick, setFlyTick] = useState(0);

  // Track which anime should be in the swap-able focused card. We persist the
  // bangumi id (not the index) so the swap behaviour survives list re-sorts.
  const [focusedAnimeId, setFocusedAnimeId] = useState<number | null>(focusBangumiIdParam);

  // ─── Derived: 88-selection lookup ──────────────────────────────────────
  const all88WithCoords = useMemo(() => get88EntriesWithCoords(), []);

  // Map from 88-entry bangumi id → eightyEightId so we can flag 88-selected
  // anime in the hub list and on the focused card.
  const eightyEightIdByBangumiId = useMemo(() => {
    const map = new Map<number, number>();
    for (const e of all88WithCoords) {
      const bid = e.externalIds.bangumi;
      if (typeof bid === 'number') map.set(bid, e.id);
    }
    return map;
  }, [all88WithCoords]);

  // Build hub entries: collection / 88 / distance / visited counts.
  // The list is sorted by:
  //   1. distance from user (when location is known)
  //   2. otherwise by pointsLength desc — matches the old "popular" ordering.
  const hubEntries = useMemo<HubAnimeEntry[]>(() => {
    const out: HubAnimeEntry[] = [];
    for (const anime of knownAnimes) {
      if (!isValidGeo(anime.geo)) continue;
      let distanceKm: number | undefined;
      if (userLocation) {
        const d = locationService.getDistanceKm(userLocation, {
          latitude: anime.geo[0],
          longitude: anime.geo[1],
        });
        if (Number.isFinite(d)) distanceKm = d;
      }
      // Use the visited map intersected with litePoints to give a per-anime
      // visited count. This is approximate (litePoints is a sample) — it's
      // visible enough to motivate the user but cheap to compute.
      let visitedCount = 0;
      for (const p of anime.litePoints ?? []) {
        if (visited[p.id]) visitedCount += 1;
      }
      out.push({
        anime,
        distanceKm,
        fromCollection: collectionIds.has(anime.id),
        visitedCount,
        photoCount: 0,
        is88: eightyEightIdByBangumiId.has(anime.id),
      });
    }
    out.sort((a, b) => {
      if (a.distanceKm !== undefined && b.distanceKm !== undefined) {
        return a.distanceKm - b.distanceKm;
      }
      if (a.distanceKm !== undefined) return -1;
      if (b.distanceKm !== undefined) return 1;
      return (b.anime.pointsLength ?? 0) - (a.anime.pointsLength ?? 0);
    });
    return out;
  }, [knownAnimes, userLocation, collectionIds, visited, eightyEightIdByBangumiId]);

  // Apply hub filter + search query.
  const filteredEntries = useMemo<HubAnimeEntry[]>(() => {
    const query = deferredSearchQuery.trim().toLowerCase();
    return hubEntries.filter((entry) => {
      if (hubFilter === 'collection' && !entry.fromCollection) return false;
      if (hubFilter === 'official88' && !entry.is88) return false;
      if (query) {
        const titles = getPilgrimageAnimeTitles(entry.anime);
        const haystack = [
          titles.primary,
          titles.original,
          titles.chinese,
          titles.english,
          titles.romaji,
          entry.anime.city,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [hubEntries, hubFilter, deferredSearchQuery]);

  const filterCounts = useMemo(() => {
    let all = 0;
    let collection = 0;
    let official88 = 0;
    for (const e of hubEntries) {
      all += 1;
      if (e.fromCollection) collection += 1;
      if (e.is88) official88 += 1;
    }
    return { all, collection, official88 };
  }, [hubEntries]);

  // Focused anime (the swap-able card on the sheet). Falls back to the first
  // entry in the filtered list when the previous focus has been filtered out.
  const focusedAnime = useMemo<HubAnimeEntry | null>(() => {
    if (filteredEntries.length === 0) return null;
    if (focusedAnimeId !== null) {
      const found = filteredEntries.find((e) => e.anime.id === focusedAnimeId);
      if (found) return found;
    }
    return filteredEntries[0];
  }, [filteredEntries, focusedAnimeId]);

  // Reset focused id if it falls out of the filtered set (so the next swap
  // starts cycling from the new top of list).
  useEffect(() => {
    if (filteredEntries.length === 0) return;
    if (focusedAnimeId === null) return;
    const inList = filteredEntries.some((e) => e.anime.id === focusedAnimeId);
    if (!inList) setFocusedAnimeId(null);
  }, [filteredEntries, focusedAnimeId]);

  const handleSwapFocused = useCallback(() => {
    if (filteredEntries.length < 2) return;
    Haptics.selectionAsync().catch(() => undefined);
    setFocusedAnimeId((current) => {
      const ids = filteredEntries.map((e) => e.anime.id);
      const idx = current === null ? 0 : ids.indexOf(current);
      const next = idx < 0 ? 1 : (idx + 1) % ids.length;
      return ids[next] ?? null;
    });
  }, [filteredEntries]);

  // ─── Marker building ───────────────────────────────────────────────────
  // Hub map shows centroids for filteredEntries (so the user's filter and
  // search apply to what's visible on the map too). The Official 88 chip on
  // the *top* region row swaps the underlying marker set to the gold 88 city
  // pins — that filter is on top of the hub filter (it's about which entries
  // we visualise on the map, while the hub filter is about which animes are
  // in the sheet list).
  const official88Mode = hubFilter === 'official88';

  const baseAnitabiMarkers = useMemo<HubMapMarker[]>(() => {
    const out: HubMapMarker[] = [];
    for (const entry of filteredEntries) {
      const anime = entry.anime;
      if (!isValidGeo(anime.geo)) continue;
      const titles = getPilgrimageAnimeTitles(anime);
      out.push({
        markerId: `bgm:${anime.id}`,
        bangumiId: anime.id,
        lat: anime.geo[0],
        lng: anime.geo[1],
        cover: anime.cover ?? '',
        title: titles.primary,
        city: anime.city ?? '',
        pointsLength: anime.pointsLength ?? 0,
        ringColor: anime.color || theme.accent,
      });
    }
    return out;
  }, [filteredEntries, theme.accent]);

  const markers = useMemo<HubMapMarker[]>(() => {
    if (!official88Mode) return baseAnitabiMarkers;
    const filtered = focusedRegion
      ? all88WithCoords.filter((e) => e.region === focusedRegion)
      : all88WithCoords;
    return build88Markers(filtered);
  }, [official88Mode, focusedRegion, all88WithCoords, baseAnitabiMarkers]);

  // Bumped whenever the marker set fundamentally changes so the WebView
  // clears stale markers instead of additively merging: gold 88 city pins ↔
  // anitabi centroids, and search-filtered subsets.
  const refitNonce = useMemo(
    () => `${hubFilter}:${focusedRegion ?? 'any'}:${deferredSearchQuery.trim().toLowerCase()}`,
    [hubFilter, focusedRegion, deferredSearchQuery]
  );

  // Camera-fly request derived from focusedRegion + flyTick. Whole-Japan
  // when no region is focused; the region's bounds otherwise. flyTick
  // guarantees a new identity per tap so the map effect re-runs on re-taps.
  const flyBoundsRequest = useMemo(() => {
    if (flyTick === 0) return null; // initial render: map opens at Japan overview
    const bounds = focusedRegion ? REGION_BOUNDS[focusedRegion] : JAPAN_BOUNDS;
    return { key: `${focusedRegion ?? 'jp'}#${flyTick}`, bounds };
  }, [focusedRegion, flyTick]);

  // When the focused anime changes (via swap or sheet row preview), fly the
  // map to it so the sheet + map track together — that's the "silky" feel.
  const focusBangumiId = focusedAnime?.anime.id ?? null;

  // ─── Hub stats (top of sheet) ──────────────────────────────────────────
  const stats = useMemo<HubStats>(() => {
    let totalScenes = 0;
    let visitedCount = 0;
    for (const e of filteredEntries) {
      totalScenes += e.anime.pointsLength ?? 0;
      visitedCount += e.visitedCount;
    }
    return {
      nearbyCount: filteredEntries.length,
      totalScenes,
      visitedCount,
      photoCount: captureCount,
    };
  }, [filteredEntries, captureCount]);

  // ─── Handlers ──────────────────────────────────────────────────────────
  const handlePickRegion = useCallback((region: AnimeTourism88Region) => {
    Haptics.selectionAsync().catch(() => undefined);
    setFocusedRegion((cur) => (cur === region ? null : region));
    setFlyTick((t) => t + 1);
  }, []);

  const handleResetToJapan = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    setFocusedRegion(null);
    setFlyTick((t) => t + 1);
  }, []);

  // The actual drill-down. Same handler whether the user tapped a marker, the
  // focused card, or a list row. returnTo=map so the detail screen's back
  // button returns to *this* hub map view rather than the tab root.
  // Accepts an optional chrome seed so the detail screen can paint hero +
  // title + accent on frame 1 instead of flashing a skeleton (CLAUDE.md Rule 10).
  const navigateToDetail = useCallback(
    (bangumiId: number, anime?: AnitabiBangumi | null) => {
      Haptics.selectionAsync().catch(() => undefined);
      router.push(
        buildPilgrimageDetailRoute(bangumiId, {
          returnTo: 'map',
          title: anime?.title || anime?.cn || null,
          titleSecondary:
            anime?.cn && anime.cn !== anime.title ? anime.cn : null,
          poster: anime?.cover ?? null,
          themeColor: anime?.color ?? null,
        })
      );
    },
    [router]
  );

  const handleMarkerPress = useCallback(
    (bangumiId: number) => {
      // Tapping a marker focuses the card AND drills in. This is the fastest
      // path to detail for users who already know which marker they want.
      setFocusedAnimeId(bangumiId);
      const anime = knownAnimes.find((a) => a.id === bangumiId) ?? null;
      navigateToDetail(bangumiId, anime);
    },
    [knownAnimes, navigateToDetail]
  );

  const handleSheetAnimePress = useCallback(
    (anime: AnitabiBangumi) => navigateToDetail(anime.id, anime),
    [navigateToDetail]
  );

  const handleBack = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.back();
  }, [router]);

  const handleOpenAlbum = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.push('/pilgrimage/album');
  }, [router]);

  const handleSearchChange = useCallback((text: string) => setSearchQuery(text), []);
  const handleSearchClear = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    setSearchQuery('');
  }, []);

  const handlePickFilter = useCallback((next: HubFilter) => {
    Haptics.selectionAsync().catch(() => undefined);
    setHubFilter(next);
  }, []);

  const handlePickLayout = useCallback((next: 'grid' | 'rows') => {
    Haptics.selectionAsync().catch(() => undefined);
    setListLayout(next);
  }, []);

  // ─── Bottom-sheet anchor plumbing ──────────────────────────────────────
  const screenHeight = Dimensions.get('window').height;
  const sheetPosition = useSharedValue(screenHeight);
  const [sheetIndex, setSheetIndex] = useState<number>(1);

  const sheetPeekOffset = useMemo(() => {
    return Math.max(
      VIEW_MODE_TOGGLE_HEIGHT + insets.bottom + 12,
      Math.round(SHEET_PEEK_FRACTION * screenHeight) + 12
    );
  }, [insets.bottom, screenHeight]);

  const handleSheetIndexChange = useCallback((idx: number) => setSheetIndex(idx), []);
  const initialSheetIndex = initialMode === 'list' ? 2 : 1;

  // Anchor floating bottom chrome to the sheet's top edge so it slides with
  // the sheet rather than getting buried at mid snap. Hidden once the sheet
  // covers the top half of the screen (full snap) so it doesn't float over
  // the anime list scroll area.
  const chromeAnimatedStyle = useAnimatedStyle(() => {
    const bottom = Math.max(screenHeight - sheetPosition.value + 6, sheetPeekOffset);
    const hidden = sheetPosition.value < screenHeight * 0.18;
    return {
      bottom,
      opacity: hidden ? 0 : 1,
    };
  });

  // Cycle the focused id when a row tap should preview-without-drilling.
  // (Currently unused — kept for an eventual "long-press = preview" path.)
  void sheetIndex;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      {loading ? (
        <View style={styles.loadingBox}>
          <Skeleton.MapList mapHeight={400} listCount={4} />
        </View>
      ) : (
        <>
          {/* Layer 1 — full-bleed Leaflet map. */}
          <HubMapWebView
            ref={mapHandleRef}
            markers={markers}
            replaceKey={refitNonce}
            userLocation={userLocation}
            ringColor={themeColor}
            theme={theme}
            focusBangumiId={focusBangumiId}
            flyBoundsRequest={flyBoundsRequest}
            onAnimePress={handleMarkerPress}
            onBoundsChange={handleBoundsChange}
            onUserPan={tracking.onUserPan}
          />

          {/* Layer 2 — floating top overlay (back / album + search + region chips). */}
          <View style={styles.topOverlay} pointerEvents="box-none">
            <View style={styles.headerActions}>
              <RoundHeaderButton
                icon="chevron-back"
                onPress={handleBack}
                accessibilityLabel={t('common.back')}
                tint={theme.text.primary}
                theme={theme}
              />
              <View style={styles.headerRightGroup}>
                <RoundHeaderButton
                  icon="albums-outline"
                  onPress={handleOpenAlbum}
                  accessibilityLabel={t('pilgrimage.map.openAlbumA11y')}
                  tint={themeColor}
                  theme={theme}
                />
              </View>
            </View>

            <View style={styles.searchPill}>
              <Ionicons name="search" size={16} color={theme.text.tertiary} />
              <TextInput
                value={searchQuery}
                onChangeText={handleSearchChange}
                placeholder={t('pilgrimage.map.searchPlaceholder')}
                placeholderTextColor={theme.text.tertiary}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
                selectionColor={themeColor}
                clearButtonMode="never"
                accessibilityLabel={t('pilgrimage.map.searchA11y')}
                style={[styles.searchInput, { color: theme.text.primary }]}
              />
              {searchQuery.length > 0 ? (
                <Pressable
                  onPress={handleSearchClear}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('pilgrimage.map.clearSearchA11y')}
                  style={({ pressed }) => [styles.searchClearBtn, pressed && { opacity: 0.7 }]}>
                  <Ionicons name="close-circle" size={18} color={theme.text.tertiary} />
                </Pressable>
              ) : null}
            </View>

            <RegionChipStrip
              theme={theme}
              focusedRegion={focusedRegion}
              onPickRegion={handlePickRegion}
              onResetToJapan={handleResetToJapan}
            />
          </View>

          {/* Layer 3+4 — floating bottom chrome anchored to the sheet's top
              edge. Filter chips + layout toggle in a single Animated.View. */}
          <Animated.View
            style={[styles.bottomChromeWrap, chromeAnimatedStyle]}
            pointerEvents="box-none">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}>
              <FilterPill
                label={t('pilgrimage.map.filter.all')}
                active={hubFilter === 'all'}
                badge={filterCounts.all}
                themeColor={themeColor}
                themeColorFg={themeColorFg}
                theme={theme}
                onPress={() => handlePickFilter('all')}
              />
              <FilterPill
                label={t('pilgrimage.map.filter.collection')}
                active={hubFilter === 'collection'}
                badge={filterCounts.collection}
                themeColor={themeColor}
                themeColorFg={themeColorFg}
                theme={theme}
                icon="bookmark"
                onPress={() => handlePickFilter('collection')}
              />
              <FilterPill
                label={t('pilgrimage.map.filter.official88')}
                active={hubFilter === 'official88'}
                badge={filterCounts.official88}
                themeColor={themeColor}
                themeColorFg={themeColorFg}
                theme={theme}
                onPress={() => handlePickFilter('official88')}
              />
            </ScrollView>
            <View style={styles.viewModeWrapInner}>
              <View style={styles.viewModeBar}>
                <LayoutToggleSegment
                  icon="reorder-three"
                  label={t('pilgrimage.map.layout.rows')}
                  count={filteredEntries.length}
                  active={listLayout === 'rows'}
                  themeColor={themeColor}
                  themeColorFg={themeColorFg}
                  theme={theme}
                  styles={styles}
                  onPress={() => handlePickLayout('rows')}
                />
                <LayoutToggleSegment
                  icon="apps"
                  label={t('pilgrimage.map.layout.grid')}
                  count={filteredEntries.length}
                  active={listLayout === 'grid'}
                  themeColor={themeColor}
                  themeColorFg={themeColorFg}
                  theme={theme}
                  styles={styles}
                  onPress={() => handlePickLayout('grid')}
                />
              </View>
            </View>
          </Animated.View>

          {/* Locate FAB — anchors to the sheet so it never sits behind the
              handle, and drives idle / following / compass via the hook. */}
          <LocateFab
            state={tracking.state}
            onPress={tracking.cycleState}
            sheetAnimatedPosition={sheetPosition}
            screenHeight={screenHeight}
            bottomInset={sheetPeekOffset}
            loading={tracking.isRequestingPermission}
          />

          {/* Layer 5 — persistent pull-up sheet with focused-anime card,
              hub stats and the nearby anime list. */}
          <PilgrimageHubSheet
            nearbyAnimes={filteredEntries}
            focusedAnime={focusedAnime}
            canSwap={filteredEntries.length > 1}
            stats={stats}
            listLayout={listLayout}
            themeColor={themeColor}
            themeColorFg={themeColorFg}
            theme={theme}
            searchQuery={searchQuery}
            initialIndex={initialSheetIndex}
            animatedPosition={sheetPosition}
            onSheetIndexChange={handleSheetIndexChange}
            onAnimePress={handleSheetAnimePress}
            onSwapFocused={handleSwapFocused}
          />
        </>
      )}

      {/* Permanently-denied permission sheet. Lives outside the loading
          branch so dismissing it during a re-render doesn't unmount it
          mid-animation. */}
      <LocationPermissionSheet
        visible={tracking.permissionSheetVisible}
        onDismiss={tracking.dismissPermissionSheet}
      />
    </View>
  );
}

// Small segmented button used in the floating Grid/Rows toggle. Inlined
// because it's specific to this route's chrome — a separate file would be
// more import noise than the local component is worth.
interface LayoutToggleSegmentProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  count: number;
  active: boolean;
  themeColor: string;
  themeColorFg: string;
  theme: ThemePalette;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
}

function LayoutToggleSegment({
  icon,
  label,
  count,
  active,
  themeColor,
  themeColorFg,
  theme,
  styles,
  onPress,
}: LayoutToggleSegmentProps) {
  const fg = active ? themeColorFg : theme.text.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.viewModeSegment,
        active ? { backgroundColor: themeColor } : { backgroundColor: 'transparent' },
        pressed && { opacity: 0.86 },
      ]}>
      <Ionicons name={icon} size={14} color={fg} />
      <ThemedText variant="bodySmall" weight="700" style={{ color: fg }}>
        {label}
      </ThemedText>
      <View
        style={[
          styles.viewModeSegmentBadge,
          active
            ? { backgroundColor: `${themeColorFg}22` }
            : { backgroundColor: theme.background.tertiary },
        ]}>
        <ThemedText variant="captionSmall" weight="700" style={{ color: fg }}>
          {count}
        </ThemedText>
      </View>
    </Pressable>
  );
}
// Region chip strip — embedded inside the floating top overlay (so it sits
// just under the search pill). Camera-only: tapping a region flies the map.
// The "what to show" filter (collection / 88) is owned by the bottom chrome.
interface RegionChipStripProps {
  theme: ThemePalette;
  focusedRegion: AnimeTourism88Region | null;
  onPickRegion: (region: AnimeTourism88Region) => void;
  onResetToJapan: () => void;
}

function RegionChipStrip({
  theme,
  focusedRegion,
  onPickRegion,
  onResetToJapan,
}: RegionChipStripProps) {
  const t = useT();
  const chipStyles = useMemo(() => makeChipStyles(theme), [theme]);
  const wholeJapanActive = focusedRegion === null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={chipStyles.scroll}>
      <Pressable
        onPress={onResetToJapan}
        accessibilityRole="button"
        accessibilityLabel={t('pilgrimage.map.wholeJapanA11y')}
        accessibilityState={{ selected: wholeJapanActive }}
        style={({ pressed }) => [
          chipStyles.chip,
          wholeJapanActive ? { backgroundColor: theme.accent, borderColor: theme.accent } : null,
          pressed && { opacity: 0.85 },
        ]}>
        <ThemedText
          variant="captionSmall"
          weight="700"
          style={[
            chipStyles.chipLabel,
            wholeJapanActive ? { color: theme.background.primary } : null,
          ]}>
          {t('pilgrimage.map.allJapan')}
        </ThemedText>
      </Pressable>
      {ANIME_TOURISM_88_REGIONS.map((r) => {
        const active = focusedRegion === r;
        return (
          <Pressable
            key={r}
            onPress={() => onPickRegion(r)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              chipStyles.chip,
              active ? { backgroundColor: theme.accent, borderColor: theme.accent } : null,
              pressed && { opacity: 0.85 },
            ]}>
            <ThemedText
              variant="captionSmall"
              weight="600"
              style={[chipStyles.chipLabel, active ? { color: theme.background.primary } : null]}>
              {REGION_88_LABELS[r]}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function makeChipStyles(theme: ThemePalette) {
  return StyleSheet.create({
    scroll: {
      gap: 8,
      paddingVertical: 2,
      paddingRight: Spacing.xs,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      backgroundColor: `${theme.background.primary}E6`,
    },
    chipLabel: {
      ...Typography.captionSmall,
      color: theme.text.primary,
    },
  });
}

function makeStyles(theme: ThemePalette, topInset: number) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background.primary },
    loadingBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 20,
    },

    // Floating top overlay (back/album row + search + region chips).
    // Mirrors the detail screen's topOverlay style for shell continuity.
    topOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      paddingTop: topInset + Spacing.xs,
      paddingHorizontal: Spacing.screenPadding,
      gap: Spacing.sm,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerRightGroup: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },

    // In-page search field — sized so the clear-X has comfortable hit area.
    searchPill: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingLeft: 14,
      paddingRight: 6,
      borderRadius: Radius.full,
      backgroundColor: `${theme.background.secondary}E6`,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.glassBorder,
    },
    searchInput: {
      flex: 1,
      minHeight: 42,
      paddingVertical: 0,
      ...Typography.bodyMedium,
      letterSpacing: 0,
    },
    searchClearBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Floating bottom chrome — anchored to the sheet's top edge.
    bottomChromeWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      paddingHorizontal: Spacing.screenPadding,
      gap: Spacing.xs,
    },
    chipRow: {
      gap: Spacing.xs,
      paddingRight: Spacing.xs,
    },
    viewModeWrapInner: {
      alignItems: 'center',
    },
    viewModeBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 4,
      paddingVertical: 4,
      borderRadius: Radius.full,
      backgroundColor: `${theme.background.primary}E0`,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.glassBorder,
    },
    viewModeSegment: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      height: 36,
      borderRadius: Radius.full,
    },
    viewModeSegmentBadge: {
      minWidth: 24,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
