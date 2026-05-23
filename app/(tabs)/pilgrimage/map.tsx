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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { Radius, Spacing, Typography } from '../../../constants/DesignSystem';
import { ThemedText, Skeleton, readableTextOn } from '../../../components/themed';
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
  TILE_STYLES,
  buildMapThemeVars,
  resolveTileStyle,
  type MapThemeVars,
  type TileStyleId,
} from '../../../libs/services/pilgrimage/leaflet-map';
import { resolveMapMode } from '../../../libs/services/pilgrimage/map-theme-prefs';
import { useMapThemePref } from '../../../hooks/useMapThemePref';
import { getNumberParam } from '../../../libs/utils/route-params';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';
import {
  getAnimeInBounds,
  type AnitabiIndexEntry,
  type BoundingBox,
} from '../../../libs/services/pilgrimage/anitabi-index';
import { getNearbyMapEntries, MAP_LOCATE_ZOOM } from '../../../libs/services/pilgrimage/map-nearby';
import { getPilgrimageAnimeTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import { buildPilgrimageDetailRoute } from '../../../libs/services/pilgrimage/pilgrimage-navigation';
import {
  loadVisitedSpotsSync,
  type VisitedMap,
} from '../../../libs/services/pilgrimage/visited-prefs';
import { loadCapturesSync } from '../../../libs/services/pilgrimage/captures';
import {
  appendIndexedEntries,
  buildKnownAnimeIdSet,
  sameLatLng,
} from '../../../libs/services/pilgrimage/pilgrimage-screen-state';
import { shouldLoadPilgrimageMapBounds } from '../../../libs/services/pilgrimage/pilgrimage-design-flow';
import {
  PilgrimageHubSheet,
  type HubAnimeEntry,
  type HubStats,
} from '../../../components/pilgrimage/PilgrimageHubSheet';
import { RoundHeaderButton } from '../../../components/pilgrimage/detail/RoundHeaderButton';
import { FilterPill } from '../../../components/pilgrimage/detail/FilterPill';

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
  tileStyle: TileStyleId;
  themeVars: MapThemeVars;
}): string {
  const initialJson = JSON.stringify(initial).replace(/</g, '\\u003c');
  const tile = TILE_STYLES[initial.tileStyle];
  const themeVarsCss = Object.entries(initial.themeVars)
    .map(([k, v]) => `${k}: ${v};`)
    .join(' ');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>${LEAFLET_CSS}</style>
<style>${LEAFLET_MARKERCLUSTER_CSS}</style>
<style>${MAP_BASE_CSS}</style>
<style>
  :root { ${themeVarsCss} }
  /* Google-Maps-style balloon marker. See PilgrimageMapView for the
     full design rationale — same shape language across all 3 maps. */
  .anime-marker {
    position: relative;
    width: 48px; height: 48px; border-radius: 50%;
    border: 3px solid #ffffff;
    background: var(--map-chrome);
    overflow: visible;
    box-shadow: 0 1px 3px 0 rgba(0,0,0,0.30),
                0 4px 8px 3px rgba(0,0,0,0.15);
  }
  .anime-marker .photo {
    width: 100%; height: 100%; border-radius: 50%; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
  }
  .anime-marker .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .anime-marker::after {
    content: ''; position: absolute;
    bottom: -8px; left: 50%; transform: translateX(-50%);
    width: 0; height: 0;
    border-left: 7px solid transparent;
    border-right: 7px solid transparent;
    border-top: 9px solid #ffffff;
    filter: drop-shadow(0 2px 1px rgba(0,0,0,0.18));
  }
  .anime-marker .region-dot {
    position: absolute; right: -2px; bottom: 2px;
    width: 14px; height: 14px; border-radius: 50%;
    background: var(--ring, #4285F4);
    border: 2px solid #ffffff;
    box-shadow: 0 1px 2px rgba(0,0,0,0.25);
  }
  .anime-marker .pts {
    position: absolute; left: -4px; top: -4px;
    min-width: 18px; height: 18px; padding: 0 4px;
    background: #ffffff; color: #1F1F1F;
    border-radius: 9px;
    font: 700 10px 'Google Sans Text', Roboto, system-ui, sans-serif;
    line-height: 18px; text-align: center;
    box-shadow: 0 1px 2px rgba(0,0,0,0.25);
  }
  /* Tourism 88 official-selection pins: gold disc + star, slightly smaller
     to read as "stamps of approval" against the regular photo balloons. */
  .anime-marker.eighty-eight {
    width: 36px; height: 36px;
    background: ${OFFICIAL_88_GOLD};
    color: #1F1F1F;
    font: 800 18px 'Google Sans Text', Roboto, system-ui, sans-serif;
    display: flex; align-items: center; justify-content: center;
  }
  .anime-marker.eighty-eight::after { border-top-color: #ffffff; }
  .anime-marker.eighty-eight .star { line-height: 1; }
  .anime-marker.eighty-eight .pts { display: none; }
  .anime-marker.eighty-eight .region-dot { display: none; }
  .anime-marker.eighty-eight .eighty-id {
    position: absolute; right: -6px; bottom: 0;
    min-width: 18px; height: 16px; padding: 0 4px;
    background: #ffffff; color: ${OFFICIAL_88_GOLD};
    border-radius: 8px;
    font: 800 9px 'Google Sans Text', Roboto, system-ui, sans-serif;
    line-height: 16px; text-align: center;
    box-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }

  /* Individual nearby scene points — a smaller photo balloon than the anime
     centroid markers, so they read as finer-grained "scenes around you". */
  .spot-pin {
    position: relative;
    width: 38px; height: 38px; border-radius: 50%;
    border: 2.5px solid #ffffff;
    background: var(--map-chrome);
    overflow: visible;
    box-shadow: 0 1px 3px 0 rgba(0,0,0,0.30), 0 4px 8px 3px rgba(0,0,0,0.15);
  }
  .spot-pin .photo {
    width: 100%; height: 100%; border-radius: 50%; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
  }
  .spot-pin .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .spot-pin::after {
    content: ''; position: absolute;
    bottom: -7px; left: 50%; transform: translateX(-50%);
    width: 0; height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 8px solid #ffffff;
    filter: drop-shadow(0 2px 1px rgba(0,0,0,0.18));
  }
  .spot-pin .ring {
    position: absolute; right: -3px; bottom: 0;
    width: 13px; height: 13px; border-radius: 50%;
    border: 2px solid #ffffff;
    box-shadow: 0 1px 2px rgba(0,0,0,0.25);
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
  new window.CachedTileLayer(${JSON.stringify(tile.url)}, {
    maxZoom: ${tile.maxZoom}, minZoom: 3,
    subdomains: ${JSON.stringify(tile.subdomains)},
    attribution: ${JSON.stringify(tile.attribution)},
    keepBuffer: 4, updateWhenIdle: false
  }).addTo(map);

  // See index.tsx for the rationale behind the post-mount user pin update.
  var userMarker = null;
  var didSnapToUser = false;
  // Last compass heading (deg) pushed from native; re-applied whenever the
  // user marker is rebuilt so a location update never drops the cone.
  var lastHeading = null;
  function applyUserHeading() {
    if (!userMarker || lastHeading == null) return;
    var el = userMarker.getElement();
    var cone = el && el.querySelector ? el.querySelector('.user-heading') : null;
    if (!cone) return;
    cone.style.transform = 'rotate(' + lastHeading + 'deg)';
    cone.classList.add('active');
  }
  function applyUser(user) {
    if (userMarker) { try { map.removeLayer(userMarker); } catch (e) {} userMarker = null; }
    if (user && typeof user.lat === 'number' && typeof user.lng === 'number') {
      var userIcon = L.divIcon({ className: '', html: '<div class="user-loc"><div class="user-heading"></div><div class="user-pulse"></div></div>', iconSize: [16,16], iconAnchor: [8,8] });
      userMarker = L.marker([user.lat, user.lng], { icon: userIcon, interactive: false, keyboard: false }).addTo(map);
      applyUserHeading();
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

  // Native pushes the device compass heading here; rotate the cone in place.
  // A null/non-finite value clears the cone — never show a fake direction.
  window.__updateHeading = function(deg) {
    lastHeading = typeof deg === 'number' && isFinite(deg) ? deg : null;
    if (lastHeading == null) {
      if (userMarker) {
        var el = userMarker.getElement();
        var cone = el && el.querySelector ? el.querySelector('.user-heading') : null;
        if (cone) cone.classList.remove('active');
      }
      return;
    }
    applyUserHeading();
  };

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
          var photoInner = m.cover
            ? '<img src="' + m.cover + '" loading="lazy" />'
            : '';
          inner = '<div class="photo">' + photoInner + '</div>' +
            '<span class="region-dot" style="background:' + m.ringColor + '"></span>' +
            '<span class="pts">' + m.pointsLength + '</span>';
        }
        // Bounding box: bubble + 9px tail. Anchor at tail tip so the geo
        // coordinate sits *under* the marker (Google Maps convention).
        var w = m.is88 ? 36 : 48;
        var h = w + 9;
        var html = '<div class="' + cls + '">' + inner + '</div>';
        var icon = L.divIcon({ className: '', html: html, iconSize: [w, h], iconAnchor: [w/2, h] });
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

  // Individual nearby scene points live in their own cluster layer above the
  // anime centroids. They cluster until zoom 15, so panning out shows a count
  // bubble and zooming in reveals each real-world location.
  var spotLayer = window.__makeClusterGroup({ ringColor: initial.ringColor, disableAt: 15 });
  spotLayer.addTo(map);

  window.__updateSpots = function(spots) {
    try { spotLayer.clearLayers(); } catch (e) {}
    if (!spots || !spots.length) return;
    var batch = [];
    for (var i = 0; i < spots.length; i++) {
      (function(s){
        var ring = s.ringColor || initial.ringColor;
        var photoInner = s.image ? '<img src="' + s.image + '" loading="lazy" />' : '';
        var html = '<div class="spot-pin">' +
          '<div class="photo">' + photoInner + '</div>' +
          '<span class="ring" style="background:' + ring + '"></span>' +
        '</div>';
        var icon = L.divIcon({ className: '', html: html, iconSize: [38, 46], iconAnchor: [19, 46] });
        var marker = L.marker([s.lat, s.lng], { icon: icon, regionColor: ring });
        marker.on('click', function() {
          try { map.flyTo([s.lat, s.lng], Math.max(map.getZoom(), 16), { duration: 0.4 }); } catch (e) {}
        });
        batch.push(marker);
      })(spots[i]);
    }
    if (typeof spotLayer.addLayers === 'function') spotLayer.addLayers(batch);
    else for (var k = 0; k < batch.length; k++) spotLayer.addLayer(batch[k]);
  };

  // React side asks the map to fly to a spot tapped in the Nearby panel.
  window.__focusSpot = function(t) {
    if (!t || typeof t.lat !== 'number' || typeof t.lng !== 'number') return;
    try { map.flyTo([t.lat, t.lng], Math.max(map.getZoom(), 16), { duration: 0.5 }); } catch (e) {}
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

// Sheet snap peek fraction — kept in lockstep with PilgrimageHubSheet's snap
// array. Used as a fallback chrome offset if the sheet's animatedPosition
// hasn't been written yet.
const SHEET_PEEK_FRACTION = 0.16;
const VIEW_MODE_TOGGLE_HEIGHT = 52;

type HubFilter = 'all' | 'collection' | 'official88';

export default function PilgrimageMapScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const focusBangumiIdParam = getNumberParam(params, 'focus');
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme, insets.top), [theme, insets.top]);
  const themeColor = theme.accent;
  const themeColorFg = readableTextOn(themeColor);

  // ─── Data state ─────────────────────────────────────────────────────────
  // Collection + featured-backfilled animes are the canonical "known" set.
  // Bounds-driven lazy loading appends entries from the offline anitabi index
  // as the user pans, so the on-map markers + sheet list grow with the view.
  const [animes, setAnimes] = useState<AnitabiBangumi[]>([]);
  const [collectionIds, setCollectionIds] = useState<Set<number>>(() => new Set());
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const userLocationRef = useRef<LatLng | null>(null);
  const [userHeading, setUserHeading] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  // Seed synchronously from MMKV so visited markers + the capture count are
  // correct on the first frame; the effects below still reconcile after the
  // one-time migration.
  const [visited, setVisited] = useState<VisitedMap>(loadVisitedSpotsSync);
  const [captureCount, setCaptureCount] = useState(
    () => Object.keys(loadCapturesSync()).length
  );

  // Lazy-loaded entries from the offline index, keyed by bangumi id and
  // additive only (we never remove — the WebView dedups by id so duplicates
  // are cheap, and pan-back-and-forth wants the markers to stay put).
  const [extraIndexed, setExtraIndexed] = useState<Map<number, AnitabiIndexEntry>>(() => new Map());
  const extraIndexedRef = useRef(extraIndexed);

  // ─── View state (parent-owned) ──────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [hubFilter, setHubFilter] = useState<HubFilter>('all');
  const [listLayout, setListLayout] = useState<'grid' | 'rows'>('rows');
  const [focusedRegion, setFocusedRegion] = useState<AnimeTourism88Region | null>(null);
  const [flyTick, setFlyTick] = useState(0);

  // Track which anime should be in the swap-able focused card. We persist the
  // bangumi id (not the index) so the swap behaviour survives list re-sorts.
  const [focusedAnimeId, setFocusedAnimeId] = useState<number | null>(focusBangumiIdParam);

  // ─── Data loading ───────────────────────────────────────────────────────
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

  // `visited` and `captureCount` are seeded synchronously from MMKV in the
  // useState initializers above. The previous async reconcile was a no-op on
  // the render path now that reads are sync — drop it to avoid an extra
  // re-render that re-rendered the WebView marker layer for no reason.

  const updateUserLocation = useCallback((loc: LatLng) => {
    if (sameLatLng(userLocationRef.current, loc)) return false;
    userLocationRef.current = loc;
    setUserLocation(loc);
    return true;
  }, []);

  const appendExtraIndexed = useCallback((entries: readonly AnitabiIndexEntry[]) => {
    if (entries.length === 0) return;
    const next = appendIndexedEntries(extraIndexedRef.current, entries);
    if (next === extraIndexedRef.current) return;
    extraIndexedRef.current = next;
    setExtraIndexed(next);
  }, []);

  const mergeNearbyIndexed = useCallback(
    (loc: LatLng) => {
      const seen = buildKnownAnimeIdSet([], extraIndexedRef.current);
      appendExtraIndexed(getNearbyMapEntries(loc, { exclude: seen }));
    },
    [appendExtraIndexed]
  );

  useEffect(() => {
    let cancelled = false;
    locationService
      .getCurrentLocation()
      .then((loc) => {
        if (!cancelled && loc) {
          updateUserLocation(loc);
          mergeNearbyIndexed(loc);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [mergeNearbyIndexed, updateUserLocation]);

  // Compass heading for the user-location cone. Always-on while this screen
  // is mounted; rounded + thresholded so small wrist movements don't spam
  // the WebView bridge with sub-degree jitter.
  useEffect(() => {
    let last = Number.NaN;
    const unsubscribe = locationService.subscribeToHeading((deg) => {
      const rounded = Math.round(deg);
      if (Number.isFinite(last) && Math.abs(rounded - last) < 3) return;
      last = rounded;
      setUserHeading((prev) => (prev === rounded ? prev : rounded));
    });
    return unsubscribe;
  }, []);

  const handleBoundsChange = useCallback(
    (bounds: BoundingBox) => {
      if (!shouldLoadPilgrimageMapBounds(bounds)) return;
      const seen = buildKnownAnimeIdSet([], extraIndexedRef.current);
      appendExtraIndexed(getAnimeInBounds(bounds, { exclude: seen, limit: 40 }));
    },
    [appendExtraIndexed]
  );

  // ─── Derived: full list of known anime (collection + featured + lazy) ──
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

  const knownAnimes = useMemo<AnitabiBangumi[]>(() => {
    const merged = new Map<number, AnitabiBangumi>();
    for (const a of animes) merged.set(a.id, a);
    // Index-derived entries lack litePoints, but carry enough to render on
    // the map + a placeholder row. We synthesise a minimal AnitabiBangumi.
    for (const entry of extraIndexed.values()) {
      if (merged.has(entry.id)) continue;
      const titles = getPilgrimageAnimeTitles({
        id: entry.id,
        title: entry.title,
        cn: entry.cn,
      });
      merged.set(entry.id, {
        id: entry.id,
        cn: entry.cn,
        title: titles.original ?? entry.title ?? titles.primary,
        city: entry.city,
        cover: entry.cover,
        color: entry.color || theme.accent,
        geo: [entry.lat, entry.lng],
        zoom: 12,
        modified: 0,
        litePoints: [],
        pointsLength: entry.pointsLength,
        imagesLength: 0,
      });
    }
    return [...merged.values()];
  }, [animes, extraIndexed, theme.accent]);

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
    const query = searchQuery.trim().toLowerCase();
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
  }, [hubEntries, hubFilter, searchQuery]);

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
    () => `${hubFilter}:${focusedRegion ?? 'any'}:${searchQuery.trim().toLowerCase()}`,
    [hubFilter, focusedRegion, searchQuery]
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

  const handleLocatePress = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    locationService
      .getCurrentLocation()
      .then((loc) => {
        if (!loc) return;
        updateUserLocation(loc);
        mergeNearbyIndexed(loc);
      })
      .catch(() => undefined);
  }, [mergeNearbyIndexed, updateUserLocation]);

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
          <HubMapBackground
            markers={markers}
            replaceKey={refitNonce}
            userLocation={userLocation}
            userHeading={userHeading}
            ringColor={themeColor}
            theme={theme}
            focusBangumiId={focusBangumiId}
            flyBoundsRequest={flyBoundsRequest}
            onAnimePress={handleMarkerPress}
            onBoundsChange={handleBoundsChange}
            onLocatePress={handleLocatePress}
          />

          {/* Layer 2 — floating top overlay (back / album + search + region chips). */}
          <View style={styles.topOverlay} pointerEvents="box-none">
            <View style={styles.headerActions}>
              <RoundHeaderButton
                icon="chevron-back"
                onPress={handleBack}
                accessibilityLabel="Back"
                tint={theme.text.primary}
                theme={theme}
              />
              <View style={styles.headerRightGroup}>
                <RoundHeaderButton
                  icon="albums-outline"
                  onPress={handleOpenAlbum}
                  accessibilityLabel="Open pilgrimage album"
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
                placeholder="Search anime or city"
                placeholderTextColor={theme.text.tertiary}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
                selectionColor={themeColor}
                clearButtonMode="never"
                accessibilityLabel="Search anime"
                style={[styles.searchInput, { color: theme.text.primary }]}
              />
              {searchQuery.length > 0 ? (
                <Pressable
                  onPress={handleSearchClear}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
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
                label="All"
                active={hubFilter === 'all'}
                badge={filterCounts.all}
                themeColor={themeColor}
                themeColorFg={themeColorFg}
                theme={theme}
                onPress={() => handlePickFilter('all')}
              />
              <FilterPill
                label="In collection"
                active={hubFilter === 'collection'}
                badge={filterCounts.collection}
                themeColor={themeColor}
                themeColorFg={themeColorFg}
                theme={theme}
                icon="bookmark"
                onPress={() => handlePickFilter('collection')}
              />
              <FilterPill
                label="★ 88"
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
                  label="Rows"
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
                  label="Grid"
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
            animatedPosition={sheetPosition}
            onSheetIndexChange={handleSheetIndexChange}
            onAnimePress={handleSheetAnimePress}
            onSwapFocused={handleSwapFocused}
          />
        </>
      )}
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

interface HubMapBackgroundProps {
  markers: readonly HubMapMarker[];
  /** Bump when the marker set transitions to a different filter view; triggers a clear+rebuild. */
  replaceKey: string;
  userLocation: LatLng | null;
  /** Device compass heading in degrees (0 = north, clockwise), or null when unknown. */
  userHeading: number | null;
  ringColor: string;
  theme: ThemePalette;
  focusBangumiId: number | null;
  /** When set, fly the camera to this bounding box. The key changes each time so re-tapping the same region re-flies. */
  flyBoundsRequest: { key: string; bounds: RegionBounds } | null;
  onAnimePress: (bangumiId: number) => void;
  onBoundsChange: (bounds: BoundingBox) => void;
  onLocatePress: () => void;
}

function HubMapBackground({
  markers,
  replaceKey,
  userLocation,
  userHeading,
  ringColor,
  theme,
  focusBangumiId,
  flyBoundsRequest,
  onAnimePress,
  onBoundsChange,
  onLocatePress,
}: HubMapBackgroundProps) {
  const { effectiveMode } = useTheme();
  const { pref: mapThemePref } = useMapThemePref();
  const mapMode = resolveMapMode(mapThemePref, effectiveMode);
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
    const tileStyle: TileStyleId = resolveTileStyle(mapMode);
    const themeVars: MapThemeVars = buildMapThemeVars({
      effectiveMode: mapMode,
      accent: theme.accent,
      tileStyle,
    });
    return buildHubMapHtml({ center, user, ringColor, tileStyle, themeVars });
    // First-paint values captured once. Live theme updates pushed via the
    // bridge effect below — re-rendering would wipe tile cache + camera state.
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

  // Live tile + chrome theme push so toggling light/dark or changing accent
  // repaints in place — no WebView remount, no tile cache loss.
  useEffect(() => {
    if (!ready || !webviewRef.current) return;
    const tileStyle: TileStyleId = resolveTileStyle(mapMode);
    const tile = TILE_STYLES[tileStyle];
    const themeVars = buildMapThemeVars({
      effectiveMode: mapMode,
      accent: theme.accent,
      tileStyle,
    });
    webviewRef.current.injectJavaScript(`
      try { window.__setMapTheme && window.__setMapTheme(${JSON.stringify(themeVars)}); } catch(e) {}
      try { window.__setTileStyle && window.__setTileStyle(${JSON.stringify({
        url: tile.url,
        subdomains: tile.subdomains,
        attribution: tile.attribution,
        maxZoom: tile.maxZoom,
      })}); } catch(e) {}
      true;
    `);
  }, [mapMode, theme.accent, ready]);

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

  // Push compass heading so the user dot can show a Google-Maps-style cone.
  useEffect(() => {
    if (!ready || !webviewRef.current) return;
    const payload = userHeading === null ? 'null' : String(userHeading);
    webviewRef.current.injectJavaScript(`
      try { window.__updateHeading && window.__updateHeading(${payload}); } catch(e) {}
      true;
    `);
  }, [userHeading, ready]);

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
