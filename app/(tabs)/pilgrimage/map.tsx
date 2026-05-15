// "See all" pilgrimage screen. Default mode is list — users land on a
// browsable card list of every pilgrimage anime (collection-first + featured
// backfill) and tap the Map toggle to switch into the fullscreen map. This
// matches the requested flow: "see all 應該優先是 list 才讓人點進 map".
//
// Lives outside the Tabs UI (registered with tabBarStyle: display 'none' in
// app/_layout.tsx) so the bottom dock and the hub's top bar both disappear.
// Pushed from the hub, so back goes back to the hub instead of falling out
// to the previously-selected tab.
//
// Route params:
//   - mode?: 'list' | 'map'  — initial mode (default 'list')
//   - focus?: number          — bangumi id to centre the map on (map mode only)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { Spacing, Typography } from '../../../constants/DesignSystem';
import { ThemedText, Skeleton } from '../../../components/themed';
import { pilgrimageRepository } from '../../../libs/services/pilgrimage/pilgrimage-repository';
import { FEATURED_PILGRIMAGE_ANIME } from '../../../libs/services/pilgrimage/featured-anime';
import { collectionPilgrimageService } from '../../../libs/services/pilgrimage/collection-pilgrimage-service';
import { locationService, type LatLng } from '../../../libs/services/pilgrimage/location-service';
import {
  ANIME_TOURISM_88_REGIONS,
  get88EntriesWithCoords,
  type AnimeTourism88Region,
  type AnimeTourism88EntryWithCoords,
} from '../../../libs/services/pilgrimage/anime88-repository';
import {
  LEAFLET_CSS,
  LEAFLET_JS,
  LEAFLET_MARKERCLUSTER_CSS,
  LEAFLET_MARKERCLUSTER_JS,
} from '../../../libs/services/pilgrimage/leaflet-assets';
import {
  MAP_BASE_BODY,
  MAP_BASE_CSS,
  MAP_BASE_JS,
  MAP_BASE_URL,
  TILE_ATTRIBUTION,
  TILE_MAX_ZOOM,
  TILE_SUBDOMAINS,
  TILE_URL,
} from '../../../libs/services/pilgrimage/leaflet-map';
import { getNumberParam, getStringParam } from '../../../libs/utils/route-params';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';
import {
  getAnimeInBounds,
  type AnitabiIndexEntry,
  type BoundingBox,
} from '../../../libs/services/pilgrimage/anitabi-index';
import { getNearbyMapEntries, MAP_LOCATE_ZOOM } from '../../../libs/services/pilgrimage/map-nearby';
import {
  formatPilgrimageSubtitle,
  getPilgrimageAnimeTitles,
} from '../../../libs/services/pilgrimage/pilgrimage-localization';
import { buildPilgrimageDetailRoute } from '../../../libs/services/pilgrimage/pilgrimage-navigation';

interface HubMapMarker {
  /** Unique within a marker set: "bgm:<id>" for Anitabi-centroid markers, "88:<entryId>" for Tourism 88 city pins. */
  markerId: string;
  bangumiId: number;
  lat: number;
  lng: number;
  cover: string;
  title: string;
  city: string;
  pointsLength: number;
  ringColor: string;
  /** Set when this marker is a Tourism 88 city pin; renders gold with a star overlay. */
  is88?: boolean;
  /** Sequential 88 list id (1..N). Surfaced in the popup. */
  eightyEightId?: number;
}

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
interface RegionBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}
const REGION_BOUNDS: Record<AnimeTourism88Region, RegionBounds> = {
  hokkaido_tohoku: { south: 37.0, west: 139.4, north: 45.6, east: 146.0 },
  kanto: { south: 35.0, west: 138.7, north: 37.0, east: 141.0 },
  tokyo: { south: 35.5, west: 139.3, north: 35.9, east: 140.0 },
  chubu: { south: 34.6, west: 136.0, north: 38.0, east: 139.5 },
  kinki: { south: 33.5, west: 134.2, north: 35.8, east: 136.5 },
  chugoku_shikoku: { south: 32.5, west: 130.7, north: 35.7, east: 134.5 },
  kyushu_okinawa: { south: 24.0, west: 122.9, north: 34.5, east: 132.0 },
};

// Whole-archipelago framing: centre on the Sea of Japan side of central
// Honshu so Hokkaido and Okinawa both stay on-screen at zoom 5.
const JAPAN_OVERVIEW = { lat: 36.5, lng: 138.0, zoom: 5 } as const;

// Whole-Japan bounding box — south of Yonaguni to north of Hokkaido.
// Used when the user taps the "全日本" reset chip.
const JAPAN_BOUNDS: RegionBounds = {
  south: 24.0,
  west: 122.9,
  north: 45.6,
  east: 146.0,
};

// Eighty-eight selection mark colour — picked for "official certification"
// connotation (vs. theme.accent which can drift between user themes).
const OFFICIAL_88_GOLD = '#D4AF37';

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

function buildHubMapHtml(initial: {
  center: { lat: number; lng: number; zoom: number };
  user: { lat: number; lng: number } | null;
  ringColor: string;
}): string {
  const initialJson = JSON.stringify(initial).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>${LEAFLET_CSS}</style>
<style>${LEAFLET_MARKERCLUSTER_CSS}</style>
<style>${MAP_BASE_CSS}</style>
<style>
  .anime-marker {
    width: 44px; height: 44px; border-radius: 12px;
    border: 2px solid var(--ring, #FF9F0A);
    background: #1c1c1e; overflow: hidden; position: relative;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 6px 14px rgba(0,0,0,0.45);
    transition: transform .15s ease;
  }
  .anime-marker:active { transform: scale(0.92); }
  .anime-marker img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .anime-marker .pts {
    position: absolute; bottom: -6px; right: -8px;
    background: #1c1c1e; color: #fff;
    border: 2px solid var(--ring, #FF9F0A);
    border-radius: 8px; padding: 1px 5px;
    font: 700 9px -apple-system, system-ui, sans-serif;
    line-height: 1.2;
  }
  /* Tourism 88 official-selection pins: smaller, gold, with a star plate. */
  .anime-marker.eighty-eight {
    width: 32px; height: 32px; border-radius: 16px;
    border-width: 3px;
    background: ${OFFICIAL_88_GOLD};
    color: #1c1c1e;
    font: 800 16px -apple-system, system-ui, sans-serif;
  }
  .anime-marker.eighty-eight .star { line-height: 1; }
  .anime-marker.eighty-eight .pts { display: none; }
  .anime-marker.eighty-eight .eighty-id {
    position: absolute; bottom: -7px; right: -10px;
    background: #1c1c1e; color: ${OFFICIAL_88_GOLD};
    border: 1.5px solid ${OFFICIAL_88_GOLD};
    border-radius: 7px; padding: 1px 4px;
    font: 700 9px -apple-system, system-ui, sans-serif;
    line-height: 1.2;
  }
</style>
</head>
<body>
${MAP_BASE_BODY}
<script>${LEAFLET_JS}</script>
<script>${LEAFLET_MARKERCLUSTER_JS}</script>
<script>${MAP_BASE_JS}</script>
<script>
(function(){
  var initial = ${initialJson};
  var map = L.map('map', { zoomControl: false, attributionControl: true, fadeAnimation: true })
    .setView([initial.center.lat, initial.center.lng], initial.center.zoom);
  new window.CachedTileLayer(${JSON.stringify(TILE_URL)}, {
    maxZoom: ${TILE_MAX_ZOOM}, minZoom: 3,
    subdomains: ${JSON.stringify(TILE_SUBDOMAINS)},
    attribution: ${JSON.stringify(TILE_ATTRIBUTION)},
    keepBuffer: 4, updateWhenIdle: false
  }).addTo(map);

  // See index.tsx for the rationale behind the post-mount user pin update.
  var userMarker = null;
  var didSnapToUser = false;
  function applyUser(user) {
    if (userMarker) { try { map.removeLayer(userMarker); } catch (e) {} userMarker = null; }
    if (user && typeof user.lat === 'number' && typeof user.lng === 'number') {
      var userIcon = L.divIcon({ className: '', html: '<div class="user-pulse"></div>', iconSize: [16,16], iconAnchor: [8,8] });
      userMarker = L.marker([user.lat, user.lng], { icon: userIcon, interactive: false, keyboard: false }).addTo(map);
      // First time we get a real location fix, snap the camera to a local
      // ~10-30 km framing around the user. Permission usually resolves
      // after the WebView is up, so we can't just rely on the initial
      // setView. We don't repeat this on subsequent updates — the user is
      // already framed; rough GPS noise shouldn't yank the map around.
      if (!didSnapToUser) {
        didSnapToUser = true;
        try { map.flyTo([user.lat, user.lng], ${MAP_LOCATE_ZOOM}, { duration: 0.4 }); } catch (e) {}
      }
    }
    initial.user = user;
  }
  applyUser(initial.user);
  window.__updateUser = applyUser;

  window.__bindMap(map, function recenter() {
    window.__post({ type: 'locatePress' });
    if (initial.user) {
      var did = window.__fitNearby(map, initial.user, null, {
        zoom: ${MAP_LOCATE_ZOOM},
        home: { lat: initial.center.lat, lng: initial.center.lng, zoom: initial.center.zoom },
      });
      if (did) return;
    }
  });

  var clusterLayer = window.__makeClusterGroup({ ringColor: initial.ringColor, disableAt: 12 });
  clusterLayer.addTo(map);

  // Dedup so we can call __updateMarkers(union) repeatedly without
  // re-rendering existing markers. The map-bounds lazy loader appends new
  // entries to the same state and re-injects the full union every change;
  // additive handling here avoids flicker and unnecessary DOM churn.
  //
  // markerId is "bgm:<bangumi>" for Anitabi-centroid pins and "88:<entryId>"
  // for Tourism 88 city pins — that lets one anime carry multiple 88 markers
  // (e.g. ゆるキャン△ has 6 cities) without collapsing.
  var loadedIds = new Set();

  // When the React side toggles a filter (Official 88 / region) it injects
  // with replace=true so we wipe and rebuild instead of accumulating stale
  // markers from the previous filter set.
  window.__updateMarkers = function(markers, replace) {
    if (replace) {
      try { clusterLayer.clearLayers(); } catch (e) {}
      loadedIds = new Set();
    }
    var batch = [];
    for (var i = 0; i < markers.length; i++) {
      var m = markers[i];
      var mid = m.markerId || ('bgm:' + m.bangumiId);
      if (loadedIds.has(mid)) continue;
      loadedIds.add(mid);
      (function(m, mid){
        var cls = 'anime-marker' + (m.is88 ? ' eighty-eight' : '');
        var inner;
        if (m.is88) {
          inner = '<span class="star">★</span>' +
            '<span class="eighty-id">#' + (m.eightyEightId || '?') + '</span>';
        } else {
          inner = (m.cover ? '<img src="' + m.cover + '" loading="lazy" />' : '') +
            '<span class="pts">' + m.pointsLength + '</span>';
        }
        var size = m.is88 ? 32 : 44;
        var html = '<div class="' + cls + '" style="--ring:' + m.ringColor + '">' + inner + '</div>';
        var icon = L.divIcon({ className: '', html: html, iconSize: [size, size], iconAnchor: [size/2, size/2] });
        var marker = L.marker([m.lat, m.lng], { icon: icon, regionColor: m.ringColor });
        marker.__appId = m.bangumiId;
        marker.on('click', function() {
          window.__post({ type: 'animePress', id: m.bangumiId, is88: !!m.is88, eightyEightId: m.eightyEightId || null });
        });
        batch.push(marker);
      })(m, mid);
    }
    if (batch.length === 0 && !replace) return;
    if (typeof clusterLayer.addLayers === 'function') clusterLayer.addLayers(batch);
    else for (var k = 0; k < batch.length; k++) clusterLayer.addLayer(batch[k]);

    // Do NOT auto fit-to-all-markers. Pilgrimage points span the whole
    // archipelago — fitting them all dropped the camera to ~zoom 6 (a
    // country map), which made the screen feel like an atlas instead of
    // "what's around me". We keep the initial setView and let the locate
    // button ask native for a real GPS fix instead of treating all loaded
    // markers as a fallback.
  };

  window.__focusAnime = function(target) {
    if (!target || typeof target.lat !== 'number') return;
    try { map.flyTo([target.lat, target.lng], 11, { duration: 0.6 }); } catch (e) {}
  };

  // Fly the camera to a region (or whole Japan). Pure navigation — does NOT
  // change which markers are visible. The bounds-based lazy loader picks up
  // the markers that fall into the new viewport on its own.
  window.__flyToBounds = function(b) {
    if (!b || typeof b.south !== 'number') return;
    try {
      map.flyToBounds(
        [[b.south, b.west], [b.north, b.east]],
        { padding: [40, 40], maxZoom: 10, duration: 0.6 }
      );
    } catch (e) {}
  };

  // Emit current bounds to RN so it can lazy-load more anime from the
  // offline index. Debounced inside the WebView (300 ms) — Leaflet's
  // moveend fires once per gesture, but pinch-zoom on iOS can chain a
  // few in quick succession.
  var boundsTimer = null;
  function emitBounds() {
    if (boundsTimer) { clearTimeout(boundsTimer); }
    boundsTimer = setTimeout(function() {
      try {
        var b = map.getBounds();
        window.__post({
          type: 'bounds',
          n: b.getNorth(), s: b.getSouth(),
          e: b.getEast(), w: b.getWest(),
        });
      } catch (e) { /* noop */ }
    }, 300);
  }
  map.on('moveend', emitBounds);

  window.__post({ type: 'ready' });
  emitBounds();
})();
</script>
</body>
</html>`;
}

const COLLECTION_BACKFILL_TARGET = 16;

export default function PilgrimageMapScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const focusBangumiId = getNumberParam(params, 'focus');
  const initialMode = getStringParam(params, 'mode') === 'map' ? 'map' : 'list';
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [mode, setMode] = useState<'list' | 'map'>(initialMode);
  const [animes, setAnimes] = useState<AnitabiBangumi[]>([]);
  const [collectionIds, setCollectionIds] = useState<Set<number>>(() => new Set());
  const animesRef = useRef<AnitabiBangumi[]>([]);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [loading, setLoading] = useState(true);

  // Same priority as the hub: collection first, featured backfills.
  // anitabiService memoises every fetch, so re-loading here costs ~nothing
  // when the user just came from the hub. We also record which ids came from
  // the user's collection so the list view can flag those rows.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      const merged = new Map<number, AnitabiBangumi>();
      const collected = new Set<number>();
      try {
        const entries = await collectionPilgrimageService.getEntries();
        for (const e of entries) {
          if (e.anime && !merged.has(e.anime.id)) {
            merged.set(e.anime.id, e.anime);
            collected.add(e.anime.id);
          }
        }
      } catch (err) {
        console.warn('[PilgrimageMap] collection load failed:', err);
      }

      if (merged.size < COLLECTION_BACKFILL_TARGET) {
        const results = await Promise.allSettled(
          FEATURED_PILGRIMAGE_ANIME.map(({ bangumiId }) =>
            pilgrimageRepository.getSpotsByBangumiId(bangumiId)
          )
        );
        for (const r of results) {
          if (r.status !== 'fulfilled' || !r.value) continue;
          if (!merged.has(r.value.id)) merged.set(r.value.id, r.value);
        }
      }

      if (cancelled) return;
      const list = [...merged.values()].sort(
        (a, b) => (b.pointsLength ?? 0) - (a.pointsLength ?? 0)
      );
      setAnimes(list);
      setCollectionIds(collected);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    animesRef.current = animes;
  }, [animes]);

  // Lazy-loaded entries from the offline index, keyed by bangumi id and
  // additive only (we never remove — the WebView dedups by id so duplicates
  // are cheap, and pan-back-and-forth wants the markers to stay put).
  const [extraIndexed, setExtraIndexed] = useState<Map<number, AnitabiIndexEntry>>(() => new Map());

  const mergeNearbyIndexed = useCallback((loc: LatLng) => {
    setExtraIndexed((prev) => {
      const seen = new Set<number>();
      for (const anime of animesRef.current) seen.add(anime.id);
      for (const id of prev.keys()) seen.add(id);
      const nearby = getNearbyMapEntries(loc, { exclude: seen });
      if (nearby.length === 0) return prev;

      const merged = new Map(prev);
      let changed = false;
      for (const entry of nearby) {
        if (merged.has(entry.id)) continue;
        merged.set(entry.id, entry);
        changed = true;
      }
      return changed ? merged : prev;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    locationService
      .getCurrentLocation()
      .then((loc) => {
        if (!cancelled && loc) {
          setUserLocation(loc);
          mergeNearbyIndexed(loc);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [mergeNearbyIndexed]);

  const handleBoundsChange = useCallback(
    (bounds: BoundingBox) => {
      const seen = new Set<number>();
      for (const a of animes) seen.add(a.id);
      for (const id of extraIndexed.keys()) seen.add(id);
      const next = getAnimeInBounds(bounds, { exclude: seen, limit: 40 });
      if (next.length === 0) return;
      setExtraIndexed((prev) => {
        const merged = new Map(prev);
        for (const entry of next) merged.set(entry.id, entry);
        return merged;
      });
    },
    [animes, extraIndexed]
  );

  // Filter state for the chip row above the map. `null` region == all 7 groups.
  // - `official88Mode`: filter markers to the Anime Tourism 88 selection.
  // - `focusedRegion`: which region's camera framing is active. Tapping a region
  //   ALWAYS flies the camera; if 88 mode is on, it also narrows the filter.
  // - `flyTick`: increments on every region tap so the camera re-flies even
  //   when the user re-taps the chip they're already focused on.
  const [official88Mode, setOfficial88Mode] = useState(false);
  const [focusedRegion, setFocusedRegion] = useState<AnimeTourism88Region | null>(null);
  const [flyTick, setFlyTick] = useState(0);

  const all88WithCoords = useMemo(() => get88EntriesWithCoords(), []);

  const baseAnitabiMarkers = useMemo<HubMapMarker[]>(() => {
    const out: HubMapMarker[] = [];
    const seen = new Set<number>();
    for (const anime of animes) {
      if (!isValidGeo(anime.geo)) continue;
      const titles = getPilgrimageAnimeTitles(anime);
      seen.add(anime.id);
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
    for (const entry of extraIndexed.values()) {
      if (seen.has(entry.id)) continue;
      const titles = getPilgrimageAnimeTitles({
        id: entry.id,
        title: entry.title,
        cn: entry.cn,
      });
      out.push({
        markerId: `bgm:${entry.id}`,
        bangumiId: entry.id,
        lat: entry.lat,
        lng: entry.lng,
        cover: entry.cover,
        title: titles.primary,
        city: entry.city,
        pointsLength: entry.pointsLength,
        ringColor: entry.color || theme.accent,
      });
    }
    return out;
  }, [animes, extraIndexed, theme.accent]);

  const markers = useMemo<HubMapMarker[]>(() => {
    if (!official88Mode) return baseAnitabiMarkers;
    const filtered = focusedRegion
      ? all88WithCoords.filter((e) => e.region === focusedRegion)
      : all88WithCoords;
    return build88Markers(filtered);
  }, [official88Mode, focusedRegion, all88WithCoords, baseAnitabiMarkers]);

  // Bumped whenever the filter set fundamentally changes so the WebView can
  // clear stale markers (we re-render gold city pins ↔ anitabi anime centroids).
  const refitNonce = useMemo(
    () => `${official88Mode ? '88' : 'all'}:${focusedRegion ?? 'any'}`,
    [official88Mode, focusedRegion]
  );

  // Camera-fly request derived from focusedRegion + flyTick. Whole-Japan when
  // no region is focused; the region's bounds otherwise. flyTick guarantees a
  // new identity per tap so the FullscreenMapView effect re-runs.
  const flyBoundsRequest = useMemo(() => {
    if (flyTick === 0) return null; // skip initial render — the map already opens at Japan overview
    const bounds = focusedRegion ? REGION_BOUNDS[focusedRegion] : JAPAN_BOUNDS;
    return { key: `${focusedRegion ?? 'jp'}#${flyTick}`, bounds };
  }, [focusedRegion, flyTick]);

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

  const handleToggleOfficial88 = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    setOfficial88Mode((v) => !v);
  }, []);

  const handleLocatePress = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    locationService
      .getCurrentLocation()
      .then((loc) => {
        if (!loc) return;
        setUserLocation(loc);
        mergeNearbyIndexed(loc);
      })
      .catch(() => undefined);
  }, [mergeNearbyIndexed]);

  const handleAnimePress = useCallback(
    (bangumiId: number) => {
      Haptics.selectionAsync().catch(() => undefined);
      router.push(buildPilgrimageDetailRoute(bangumiId, { returnTo: 'map' }));
    },
    [router]
  );

  const handleBack = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.back();
  }, [router]);

  const handleSearch = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.push({ pathname: '/search', params: { context: 'pilgrimage' } });
  }, [router]);

  const handleSetMode = useCallback((next: 'list' | 'map') => {
    Haptics.selectionAsync().catch(() => undefined);
    setMode(next);
  }, []);

  const listRows = useMemo<PilgrimageListRow[]>(() => {
    const rows: PilgrimageListRow[] = animes.map((anime) => {
      const titles = getPilgrimageAnimeTitles(anime);
      let distanceKm: number | undefined;
      if (userLocation && Array.isArray(anime.geo) && anime.geo.length >= 2) {
        const [lat, lng] = anime.geo;
        if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
          const d = locationService.getDistanceKm(userLocation, {
            latitude: lat,
            longitude: lng,
          });
          if (Number.isFinite(d)) distanceKm = d;
        }
      }
      return {
        id: anime.id,
        cover: anime.cover ?? '',
        primaryTitle: titles.primary,
        secondaryTitle: formatPilgrimageSubtitle(titles),
        city: anime.city ?? '',
        pointsLength: anime.pointsLength ?? 0,
        distanceKm,
        fromCollection: collectionIds.has(anime.id),
      };
    });
    return rows;
  }, [animes, userLocation, collectionIds]);

  const isMap = mode === 'map';
  // The list mode has no concept of "no markers"; the empty/loading shells
  // only gate the map. Map mode also keeps the filter chips beneath the header.
  const mapEmpty = !loading && markers.length === 0;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Body */}
      {isMap ? (
        loading ? (
          <View style={styles.loadingBox}>
            <Skeleton.MapList mapHeight={400} listCount={4} />
          </View>
        ) : mapEmpty ? (
          <View style={styles.emptyBox}>
            <Ionicons name="map-outline" size={32} color={theme.text.tertiary} />
            <ThemedText variant="bodyMedium" tone="secondary" align="center">
              No anime with mapped pilgrimage locations yet.
            </ThemedText>
          </View>
        ) : (
          <>
            <FullscreenMapView
              markers={markers}
              replaceKey={refitNonce}
              userLocation={userLocation}
              ringColor={theme.accent}
              theme={theme}
              focusBangumiId={focusBangumiId}
              flyBoundsRequest={flyBoundsRequest}
              onAnimePress={handleAnimePress}
              onBoundsChange={handleBoundsChange}
              onLocatePress={handleLocatePress}
            />
            <FilterChipRow
              theme={theme}
              insetTop={insets.top + HEADER_BAR_HEIGHT + 4}
              official88Mode={official88Mode}
              focusedRegion={focusedRegion}
              onToggleOfficial88={handleToggleOfficial88}
              onPickRegion={handlePickRegion}
              onResetToJapan={handleResetToJapan}
            />
          </>
        )
      ) : loading ? (
        <View style={[styles.listLoading, { paddingTop: insets.top + HEADER_BAR_HEIGHT + 8 }]}>
          <Skeleton.AnimeCardList count={6} paddingHorizontal={Spacing.md} />
        </View>
      ) : listRows.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="albums-outline" size={32} color={theme.text.tertiary} />
          <ThemedText variant="bodyMedium" tone="secondary" align="center">
            Nothing here yet. Add anime to your collection or browse featured pilgrimages.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={listRows}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <PilgrimageListCard
              row={item}
              theme={theme}
              onPress={() => handleAnimePress(item.id)}
            />
          )}
          contentContainerStyle={{
            paddingTop: insets.top + HEADER_BAR_HEIGHT + Spacing.md,
            paddingHorizontal: Spacing.md,
            paddingBottom: insets.bottom + Spacing.xl,
            gap: 10,
          }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Header — sits above body for both modes */}
      <SeeAllHeader
        theme={theme}
        insetTop={insets.top}
        mode={mode}
        onBack={handleBack}
        onSearch={handleSearch}
        onSetMode={handleSetMode}
      />
    </View>
  );
}

const HEADER_BAR_HEIGHT = 52;

interface PilgrimageListRow {
  id: number;
  cover: string;
  primaryTitle: string;
  secondaryTitle?: string;
  city: string;
  pointsLength: number;
  distanceKm?: number;
  fromCollection: boolean;
}

function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

interface PilgrimageListCardProps {
  row: PilgrimageListRow;
  theme: ThemePalette;
  onPress: () => void;
}

function PilgrimageListCard({ row, theme, onPress }: PilgrimageListCardProps) {
  const styles = useMemo(() => makeRowStyles(theme), [theme]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={row.primaryTitle}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
      <Image source={{ uri: row.cover }} style={styles.cover} contentFit="cover" transition={150} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <ThemedText variant="bodyMedium" weight="700" numberOfLines={1} style={{ flex: 1 }}>
            {row.primaryTitle}
          </ThemedText>
          {row.fromCollection ? (
            <View
              style={[
                styles.collectionPill,
                { backgroundColor: `${theme.status.info}1A`, borderColor: `${theme.status.info}66` },
              ]}>
              <Ionicons name="bookmark" size={10} color={theme.status.info} />
            </View>
          ) : null}
        </View>
        {row.secondaryTitle ? (
          <ThemedText
            variant="captionSmall"
            tone="tertiary"
            numberOfLines={1}
            style={{ fontSize: 11 }}>
            {row.secondaryTitle}
          </ThemedText>
        ) : null}
        <View style={styles.metaRow}>
          {row.city ? (
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={11} color={theme.text.tertiary} />
              <ThemedText variant="captionSmall" tone="tertiary">
                {row.city}
              </ThemedText>
            </View>
          ) : null}
          {row.pointsLength > 0 ? (
            <View style={styles.metaItem}>
              <Ionicons name="pin" size={11} color={theme.text.tertiary} />
              <ThemedText variant="captionSmall" tone="tertiary">
                {row.pointsLength} {row.pointsLength === 1 ? 'spot' : 'spots'}
              </ThemedText>
            </View>
          ) : null}
          {row.distanceKm !== undefined ? (
            <View style={styles.metaItem}>
              <Ionicons name="navigate" size={11} color={theme.accent} />
              <ThemedText variant="captionSmall" weight="600" style={{ color: theme.accent }}>
                {formatKm(row.distanceKm)}
              </ThemedText>
            </View>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.text.tertiary} />
    </Pressable>
  );
}

interface SeeAllHeaderProps {
  theme: ThemePalette;
  insetTop: number;
  mode: 'list' | 'map';
  onBack: () => void;
  onSearch: () => void;
  onSetMode: (next: 'list' | 'map') => void;
}

function SeeAllHeader({ theme, insetTop, mode, onBack, onSearch, onSetMode }: SeeAllHeaderProps) {
  const styles = useMemo(() => makeHeaderStyles(theme), [theme]);
  const segmentActive = (key: 'list' | 'map') => mode === key;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insetTop + 6 }]}>
      <View style={styles.bar}>
        <Pressable
          onPress={onBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}>
          <Ionicons name="chevron-back" size={20} color={theme.text.primary} />
        </Pressable>

        <View style={styles.segment}>
          <Pressable
            onPress={() => onSetMode('list')}
            accessibilityRole="button"
            accessibilityLabel="List view"
            accessibilityState={{ selected: segmentActive('list') }}
            style={[
              styles.segmentBtn,
              segmentActive('list') && { backgroundColor: theme.background.tertiary },
            ]}>
            <Ionicons
              name="list"
              size={13}
              color={segmentActive('list') ? theme.text.primary : theme.text.tertiary}
            />
            <ThemedText
              variant="captionSmall"
              weight="600"
              style={{
                color: segmentActive('list') ? theme.text.primary : theme.text.tertiary,
              }}>
              List
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => onSetMode('map')}
            accessibilityRole="button"
            accessibilityLabel="Map view"
            accessibilityState={{ selected: segmentActive('map') }}
            style={[
              styles.segmentBtn,
              segmentActive('map') && { backgroundColor: theme.background.tertiary },
            ]}>
            <Ionicons
              name="map"
              size={13}
              color={segmentActive('map') ? theme.text.primary : theme.text.tertiary}
            />
            <ThemedText
              variant="captionSmall"
              weight="600"
              style={{
                color: segmentActive('map') ? theme.text.primary : theme.text.tertiary,
              }}>
              Map
            </ThemedText>
          </Pressable>
        </View>

        <Pressable
          onPress={onSearch}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Search pilgrimage"
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}>
          <Ionicons name="search" size={18} color={theme.text.primary} />
        </Pressable>
      </View>
    </View>
  );
}

function makeHeaderStyles(theme: ThemePalette) {
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      paddingHorizontal: Spacing.md,
      zIndex: 10,
    },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: HEADER_BAR_HEIGHT - 8,
      paddingHorizontal: 8,
      borderRadius: 22,
      backgroundColor: `${theme.background.primary}E6`,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      gap: 8,
    },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segment: {
      flexDirection: 'row',
      borderRadius: 14,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      padding: 3,
      gap: 2,
    },
    segmentBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 11,
      minHeight: 28,
    },
  });
}

function makeRowStyles(theme: ThemePalette) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 10,
      borderRadius: 14,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    cover: {
      width: 64,
      height: 88,
      borderRadius: 10,
      backgroundColor: theme.background.tertiary,
    },
    body: {
      flex: 1,
      gap: 4,
      minWidth: 0,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    collectionPill: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap',
      marginTop: 2,
    },
    metaItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
  });
}

interface FullscreenMapViewProps {
  markers: readonly HubMapMarker[];
  /** Bump when the marker set transitions to a different filter view; triggers a clear+rebuild. */
  replaceKey: string;
  userLocation: LatLng | null;
  ringColor: string;
  theme: ThemePalette;
  focusBangumiId: number | null;
  /** When set, fly the camera to this bounding box. The key changes each time so re-tapping the same region re-flies. */
  flyBoundsRequest: { key: string; bounds: RegionBounds } | null;
  onAnimePress: (bangumiId: number) => void;
  onBoundsChange: (bounds: BoundingBox) => void;
  onLocatePress: () => void;
}

function FullscreenMapView({
  markers,
  replaceKey,
  userLocation,
  ringColor,
  theme,
  focusBangumiId,
  flyBoundsRequest,
  onAnimePress,
  onBoundsChange,
  onLocatePress,
}: FullscreenMapViewProps) {
  const webviewRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const lastReplaceKey = useRef(replaceKey);

  const html = useMemo(() => {
    // Default to a whole-Japan framing so the user can pick a region before
    // drilling into a city. applyUser() still snaps to the user's location
    // at a local zoom the first time GPS resolves — so locals don't have to
    // pan back. The region chips fly the camera into specific regions on demand.
    const center = { lat: JAPAN_OVERVIEW.lat, lng: JAPAN_OVERVIEW.lng, zoom: JAPAN_OVERVIEW.zoom };
    const user = userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : null;
    return buildHubMapHtml({ center, user, ringColor });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !webviewRef.current) return;
    const replace = lastReplaceKey.current !== replaceKey;
    lastReplaceKey.current = replaceKey;
    const json = JSON.stringify(markers).replace(/</g, '\\u003c');
    webviewRef.current.injectJavaScript(`
      try { window.__updateMarkers && window.__updateMarkers(${json}, ${replace ? 'true' : 'false'}); } catch(e) {}
      true;
    `);
  }, [markers, replaceKey, ready]);

  // Push user-location updates so the locate-me bounds-fit works for users
  // who only grant permission after mount.
  useEffect(() => {
    if (!ready || !webviewRef.current) return;
    const payload = userLocation
      ? JSON.stringify({ lat: userLocation.latitude, lng: userLocation.longitude })
      : 'null';
    webviewRef.current.injectJavaScript(`
      try { window.__updateUser && window.__updateUser(${payload}); } catch(e) {}
      true;
    `);
  }, [userLocation, ready]);

  useEffect(() => {
    if (!ready || !webviewRef.current || focusBangumiId === null) return;
    const target = markers.find((m) => m.bangumiId === focusBangumiId);
    if (!target) return;
    const payload = JSON.stringify({ lat: target.lat, lng: target.lng });
    webviewRef.current.injectJavaScript(`
      try { window.__focusAnime && window.__focusAnime(${payload}); } catch(e) {}
      true;
    `);
  }, [focusBangumiId, ready, markers]);

  // Region/Japan camera fly. Re-running on `key` lets the user re-tap the
  // same region chip and have the camera re-frame (useful after pan/zoom).
  useEffect(() => {
    if (!ready || !webviewRef.current || !flyBoundsRequest) return;
    const payload = JSON.stringify(flyBoundsRequest.bounds);
    webviewRef.current.injectJavaScript(`
      try { window.__flyToBounds && window.__flyToBounds(${payload}); } catch(e) {}
      true;
    `);
  }, [flyBoundsRequest, ready]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as {
        type: string;
        id?: number;
        n?: number;
        s?: number;
        e?: number;
        w?: number;
      };
      if (data.type === 'ready') {
        setReady(true);
        return;
      }
      if (data.type === 'animePress' && typeof data.id === 'number') {
        onAnimePress(data.id);
        return;
      }
      if (data.type === 'locatePress') {
        onLocatePress();
        return;
      }
      if (
        data.type === 'bounds' &&
        typeof data.n === 'number' &&
        typeof data.s === 'number' &&
        typeof data.e === 'number' &&
        typeof data.w === 'number'
      ) {
        onBoundsChange({ north: data.n, south: data.s, east: data.e, west: data.w });
      }
    } catch {
      // ignore
    }
  };

  return (
    <WebView
      ref={webviewRef}
      originWhitelist={['*']}
      source={{ html, baseUrl: MAP_BASE_URL }}
      javaScriptEnabled
      domStorageEnabled
      cacheEnabled
      cacheMode={Platform.OS === 'android' ? 'LOAD_DEFAULT' : undefined}
      allowsInlineMediaPlayback
      androidLayerType="hardware"
      onMessage={handleMessage}
      style={[StyleSheet.absoluteFill, { backgroundColor: theme.background.primary }]}
      renderError={() => (
        <View style={[StyleSheet.absoluteFill, styles.loadingBox]}>
          <Ionicons name="map-outline" size={32} color={theme.text.secondary} />
          <ThemedText variant="bodyMedium" tone="secondary" align="center">
            Couldn&apos;t load the map.
          </ThemedText>
        </View>
      )}
      startInLoadingState
    />
  );
}

interface FilterChipRowProps {
  theme: ThemePalette;
  insetTop: number;
  /** Whether the Anime Tourism 88 marker filter is enabled. */
  official88Mode: boolean;
  /** Region the camera is focused on (null = whole Japan). */
  focusedRegion: AnimeTourism88Region | null;
  onToggleOfficial88: () => void;
  onPickRegion: (region: AnimeTourism88Region) => void;
  onResetToJapan: () => void;
}

function FilterChipRow({
  theme,
  insetTop,
  official88Mode,
  focusedRegion,
  onToggleOfficial88,
  onPickRegion,
  onResetToJapan,
}: FilterChipRowProps) {
  const chipStyles = useMemo(() => makeChipStyles(theme), [theme]);
  const wholeJapanActive = focusedRegion === null;
  return (
    <View pointerEvents="box-none" style={[chipStyles.bar, { top: insetTop + 12 }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={chipStyles.scroll}>
        <Pressable
          onPress={onResetToJapan}
          accessibilityRole="button"
          accessibilityLabel="View whole Japan"
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
            All Japan
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={onToggleOfficial88}
          accessibilityRole="button"
          accessibilityState={{ selected: official88Mode }}
          style={({ pressed }) => [
            chipStyles.chip,
            official88Mode
              ? { backgroundColor: OFFICIAL_88_GOLD, borderColor: OFFICIAL_88_GOLD }
              : null,
            pressed && { opacity: 0.85 },
          ]}>
          <ThemedText
            variant="captionSmall"
            weight="700"
            style={[chipStyles.chipLabel, official88Mode ? { color: '#1c1c1e' } : null]}>
            ★ Official 88
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
    </View>
  );
}

function makeChipStyles(theme: ThemePalette) {
  return StyleSheet.create({
    bar: {
      position: 'absolute',
      left: 0,
      right: 0,
      paddingLeft: 64,
      paddingRight: Spacing.screenPadding,
    },
    scroll: {
      gap: 8,
      paddingVertical: 4,
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

// Module-scoped styles for the fallback inside FullscreenMapView so the
// component doesn't recompute them on every render.
const styles = StyleSheet.create({
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 20,
  },
});

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background.primary },
    loadingBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 20,
    },
    emptyBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      padding: 32,
    },
    listLoading: {
      flex: 1,
    },
  });
}
