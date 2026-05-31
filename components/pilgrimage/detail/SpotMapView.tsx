// SpotMapView — the Leaflet WebView used in pilgrimage detail's map mode.
// Memo'd so a chip-strip selection (which is a root state change) doesn't
// trigger a webview re-mount. Phase 4 splits the marker bridge so visited
// flips can be sent as `__updateVisited(ids)` instead of re-serializing the
// full marker payload.

import React, {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { ThemedText } from '../../themed';
import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { useMapThemePref } from '../../../hooks/useMapThemePref';
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
  TOKYO_STATION,
  buildMapThemeVars,
  resolveTileStyle,
  type MapThemeVars,
  type TileStyleId,
} from '../../../libs/services/pilgrimage/leaflet-map';
import { resolveMapMode } from '../../../libs/services/pilgrimage/map-theme-prefs';
import { getPilgrimageSpotTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import type { LatLng } from '../../../libs/services/pilgrimage/location-service';
import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';
import type { VisitedMap } from '../../../libs/services/pilgrimage/visited-prefs';
import type { MapMarkerMode } from '../../../hooks/usePilgrimageDetailView';
import { hasValidGeo } from './_helpers';
import { MapSurface, type MapMarker, type MapSurfaceHandle } from '../map';
import { sceneMarkerToMapMarker } from '../../../libs/services/pilgrimage/map-engine/normalize';
import { CLUSTER_DISABLE_AT } from '../../../libs/services/pilgrimage/map-engine/cluster-style';
import {
  loadMapStyleOverrideSync,
  resolveMapStyleUrl,
} from '../../../libs/services/pilgrimage/map-source-prefs';
import {
  loadMapEngineSync,
  subscribeMapEngine,
} from '../../../libs/services/pilgrimage/map-engine-prefs';

interface MapMarkerPayload {
  id: string;
  lat: number;
  lng: number;
  title: string;
  image: string;
  ep: number;
  ringColor: string;
  visited: boolean;
  markerMode: MapMarkerMode;
}

export interface SpotMapViewHandle {
  /** Pan the camera to a target location (used by the locate FAB). */
  recenter: (lat: number, lng: number, zoom?: number, opts?: { animate?: boolean }) => void;
  /** Push device heading (or null to clear) into the WebView's user marker. */
  setHeading: (deg: number | null) => void;
}

export interface SpotMapViewProps {
  spots: readonly AnitabiPoint[];
  visited: VisitedMap;
  ringColor: string;
  userLocation: LatLng | null;
  centerGeo: readonly [number, number] | null;
  centerZoom: number;
  markerMode: MapMarkerMode;
  offlineOnly: boolean;
  /**
   * Id of the spot currently selected in the chip strip above the map. When
   * this changes, the WebView pans/zooms to that spot so the chip strip
   * doubles as a quick spot picker without forcing the modal sheet open.
   */
  focusSpotId?: string | null;
  /**
   * Pixels to lift the in-WebView FABs (zoom + recenter) and the Leaflet
   * attribution off the bottom edge so they clear whatever floating UI sits
   * on top of the map (bottom sheet peek, tab bar, etc.). Defaults to 16
   * (true-fullscreen maps). The detail screen passes the sheet peek height
   * + a small margin so the buttons stay tappable while the sheet is at peek.
   */
  controlsBottomOffset?: number;
  onSpotPress: (spot: AnitabiPoint) => void;
  onClusterPick: (spots: readonly AnitabiPoint[]) => void;
  /** Notified the moment the user drags the map (drops follow/compass). */
  onUserPan?: () => void;
  theme: ThemePalette;
  style?: StyleProp<ViewStyle>;
}

function buildSpotMapHtml(initial: {
  center: { lat: number; lng: number; zoom: number };
  user: { lat: number; lng: number } | null;
  ringColor: string;
  hasCenter: boolean;
  tileStyle: TileStyleId;
  themeVars: MapThemeVars;
  /** Pixels to lift the FABs + attribution off the WebView bottom. */
  controlsBottom: number;
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
  :root {
    --mc-bottom: ${initial.controlsBottom}px;
    --attr-bottom: ${Math.max(0, initial.controlsBottom - 32)}px;
    ${themeVarsCss}
  }
  .map-btn.disabled { opacity: 0.4; pointer-events: none; }
  .spot-marker {
    position: relative;
    width: 48px; height: 48px; border-radius: 50%;
    border: 3px solid #ffffff;
    background: var(--map-chrome);
    overflow: visible;
    box-shadow: 0 1px 3px 0 rgba(0,0,0,0.30),
                0 4px 8px 3px rgba(0,0,0,0.15);
  }
  .spot-marker .photo {
    width: 100%; height: 100%; border-radius: 50%; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    background: var(--ring, var(--map-chrome));
  }
  .spot-marker .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .spot-marker::after {
    content: ''; position: absolute;
    bottom: -8px; left: 50%; transform: translateX(-50%);
    width: 0; height: 0;
    border-left: 7px solid transparent;
    border-right: 7px solid transparent;
    border-top: 9px solid #ffffff;
    filter: drop-shadow(0 2px 1px rgba(0,0,0,0.18));
  }
  .spot-marker .region-dot {
    position: absolute; right: -2px; bottom: 2px;
    width: 14px; height: 14px; border-radius: 50%;
    background: var(--ring, #4285F4);
    border: 2px solid #ffffff;
    box-shadow: 0 1px 2px rgba(0,0,0,0.25);
  }
  .spot-marker.visited { border-color: #34A853; }
  .spot-marker.visited::after { border-top-color: #34A853; }
  .spot-marker .ep {
    position: absolute; left: -4px; top: -4px;
    min-width: 18px; height: 18px; padding: 0 5px;
    background: #ffffff; color: #1F1F1F;
    border-radius: 9px;
    font: 700 9px 'Google Sans Text', Roboto, system-ui, sans-serif;
    line-height: 18px; text-align: center;
    box-shadow: 0 1px 2px rgba(0,0,0,0.25);
  }
  .spot-marker.visited .ep { background: #34A853; color: #ffffff; }
  .spot-dot {
    width: 18px; height: 18px; border-radius: 50%;
    background: var(--ring, #4285F4);
    border: 3px solid #ffffff;
    box-shadow: 0 1px 3px 0 rgba(0,0,0,0.30),
                0 3px 6px 2px rgba(0,0,0,0.18);
  }
  .spot-dot.visited {
    background: #34A853;
  }
</style>
</head>
<body>
${MAP_BASE_BODY}
<script>${LEAFLET_JS}</script>
<script>${LEAFLET_MARKERCLUSTER_JS}</script>
<script>${MAP_BASE_JS}</script>
<script>
(function() {
  var initial = ${initialJson};
  var map = L.map('map', { zoomControl: false, attributionControl: true, fadeAnimation: true })
    .setView([initial.center.lat, initial.center.lng], initial.center.zoom);
  new window.CachedTileLayer(${JSON.stringify(tile.url)}, {
    maxZoom: ${tile.maxZoom},
    minZoom: 3,
    subdomains: ${JSON.stringify(tile.subdomains)},
    attribution: ${JSON.stringify(tile.attribution)},
    keepBuffer: 4,
    updateWhenIdle: false
  }).addTo(map);

  // Google-Maps-style "you are here" marker. The icon ships an empty
  // .user-heading cone that __updateHeading rotates + activates when the
  // device compass produces a real reading. Position + cone are managed
  // outside the heavy __updateMarkers payload so location ticks don't
  // re-render the spot pins.
  var userMarker = null;
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
      var userIcon = L.divIcon({
        className: '',
        html: '<div class="user-loc"><div class="user-heading"></div><div class="user-pulse"></div></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
      userMarker = L.marker([user.lat, user.lng], { icon: userIcon, interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
      applyUserHeading();
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

  var initialCenter = L.latLng(initial.center.lat, initial.center.lng);
  var initialZoom = initial.center.zoom;
  var lastBounds = null;

  // Native LocateFab drives recentre via window.__recenter; passing only the
  // map installs the shared userPanned dragstart listener from MAP_BASE_JS.
  window.__bindMap(map);
  // initialCenter/initialZoom/lastBounds remain for potential later imperative
  // handlers; voided here so the JS shape stays stable without unused-var
  // warnings.
  void initialCenter; void initialZoom; void lastBounds;

  (function() {
    var controls = document.getElementById('map-controls');
    if (!controls) return;
    var recenter = controls.querySelector('[data-act="re"]');
    function makeZoomBtn(act, label, iconPath) {
      var btn = document.createElement('div');
      btn.className = 'map-btn';
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', label);
      btn.setAttribute('data-act', act);
      btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + iconPath + '"/></svg>';
      btn.addEventListener('click', function() {
        if (act === 'zoom-in') map.zoomIn();
        else map.zoomOut();
      });
      return btn;
    }
    var zoomIn = makeZoomBtn('zoom-in', 'Zoom in', 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z');
    var zoomOut = makeZoomBtn('zoom-out', 'Zoom out', 'M19 13H5v-2h14v2z');
    if (recenter) {
      controls.insertBefore(zoomIn, recenter);
      controls.insertBefore(zoomOut, recenter);
    } else {
      controls.appendChild(zoomIn);
      controls.appendChild(zoomOut);
    }
    function syncZoomLimits() {
      zoomIn.classList.toggle('disabled', map.getZoom() >= map.getMaxZoom());
      zoomOut.classList.toggle('disabled', map.getZoom() <= map.getMinZoom());
    }
    map.on('zoomend', syncZoomLimits);
    syncZoomLimits();
  })();

  var markerLayer = window.__makeClusterGroup({ ringColor: initial.ringColor, disableAt: 16 });
  markerLayer.addTo(map);
  var didFit = false;
  var markerById = {};

  window.__updateMarkers = function(markers) {
    markerLayer.clearLayers();
    markerById = {};
    var batch = [];
    var bounds = [];
    for (var i = 0; i < markers.length; i++) {
      (function(m){
        var icon;
        if (m.markerMode === 'dot') {
          var dotCls = 'spot-dot' + (m.visited ? ' visited' : '');
          icon = L.divIcon({
            className: '',
            html: '<div class="' + dotCls + '" style="--ring:' + m.ringColor + '"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });
        } else {
          var cls = 'spot-marker' + (m.visited ? ' visited' : '');
          var imgTag = m.image
            ? '<img src="' + m.image + '" loading="lazy" alt="" onerror="this.style.display=\\'none\\'" />'
            : '';
          var html = '<div class="' + cls + '" style="--ring:' + m.ringColor + '">' +
            '<div class="photo">' + imgTag + '</div>' +
            '<span class="region-dot" style="background:' + m.ringColor + '"></span>' +
            '<span class="ep">EP ' + m.ep + '</span>' +
          '</div>';
          icon = L.divIcon({ className: '', html: html, iconSize: [48, 57], iconAnchor: [24, 57] });
        }
        var marker = L.marker([m.lat, m.lng], { icon: icon, regionColor: m.ringColor });
        marker.__appId = m.id;
        marker.__markerMode = m.markerMode;
        marker.__visited = !!m.visited;
        marker.__image = m.image || '';
        marker.__ep = m.ep;
        marker.__ringColor = m.ringColor;
        markerById[m.id] = marker;
        marker.on('click', function() { window.__post({ type: 'spotPress', id: m.id }); });
        batch.push(marker);
        bounds.push([m.lat, m.lng]);
      })(markers[i]);
    }
    if (typeof markerLayer.addLayers === 'function') markerLayer.addLayers(batch);
    else for (var k = 0; k < batch.length; k++) markerLayer.addLayer(batch[k]);

    if (bounds.length > 0) {
      try { lastBounds = L.latLngBounds(bounds); } catch (e) { lastBounds = null; }
    }
    if (!didFit && bounds.length > 0 && !initial.hasCenter) {
      try { map.setView(bounds[0], 13, { animate: false }); didFit = true; } catch (e) {}
    }
  };

  // Phase 4 helper: flip just the visited state of N markers without rebuilding
  // the full payload. Called when the user toggles visited from outside the map.
  window.__updateVisited = function(ids) {
    if (!ids || ids.length === 0) return;
    var visitedSet = {};
    for (var i = 0; i < ids.length; i++) visitedSet[ids[i]] = true;
    for (var id in markerById) {
      if (!Object.prototype.hasOwnProperty.call(markerById, id)) continue;
      var marker = markerById[id];
      var nextVisited = visitedSet[id] === true;
      if (marker.__visited === nextVisited) continue;
      marker.__visited = nextVisited;
      var icon;
      if (marker.__markerMode === 'dot') {
        var dotCls = 'spot-dot' + (nextVisited ? ' visited' : '');
        icon = L.divIcon({
          className: '',
          html: '<div class="' + dotCls + '" style="--ring:' + marker.__ringColor + '"></div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
      } else {
        var cls = 'spot-marker' + (nextVisited ? ' visited' : '');
        var imgTag = marker.__image
          ? '<img src="' + marker.__image + '" loading="lazy" alt="" onerror="this.style.display=\\'none\\'" />'
          : '';
        var html = '<div class="' + cls + '" style="--ring:' + marker.__ringColor + '">' +
          '<div class="photo">' + imgTag + '</div>' +
          '<span class="region-dot" style="background:' + marker.__ringColor + '"></span>' +
          '<span class="ep">EP ' + marker.__ep + '</span>' +
        '</div>';
        icon = L.divIcon({ className: '', html: html, iconSize: [48, 57], iconAnchor: [24, 57] });
      }
      try { marker.setIcon(icon); } catch (e) {}
    }
  };

  window.__focusSpot = function(target) {
    if (!target || typeof target.lat !== 'number' || typeof target.lng !== 'number') return;
    try { map.flyTo([target.lat, target.lng], 16, { duration: 0.45 }); } catch (e) {}
  };

  window.__post({ type: 'ready' });
})();
</script>
</body>
</html>`;
}

const SpotMapViewImpl = forwardRef<SpotMapViewHandle, SpotMapViewProps>(function SpotMapViewImpl(
  {
    spots,
    visited,
    ringColor,
    userLocation,
    centerGeo,
    centerZoom,
    markerMode,
    offlineOnly,
    focusSpotId,
    controlsBottomOffset = 16,
    onSpotPress,
    onClusterPick,
    onUserPan,
    theme,
    style,
  }: SpotMapViewProps,
  ref
) {
  const { effectiveMode } = useTheme();
  const { pref: mapThemePref } = useMapThemePref();
  const mapMode = resolveMapMode(mapThemePref, effectiveMode);
  // Rollout flag (defaults to 'leaflet' via loadMapEngineSync). When it is
  // 'leaflet' every path below is byte-identical to the shipping Leaflet
  // surface; the MapLibre branch is purely additive. Subscribe so a flip
  // repaints in place.
  const [engine, setEngine] = useState(loadMapEngineSync);
  useEffect(() => subscribeMapEngine(setEngine), []);
  // Drives recenter/setHeading when engine === 'maplibre' (delegates through
  // MapSurface to the live MapLibre camera handle).
  const maplibreRef = useRef<MapSurfaceHandle>(null);
  const webviewRef = useRef<WebView>(null);
  const spotsById = useRef(new Map<string, AnitabiPoint>());
  const previousMarkerSignatureRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const styles = useMemo(() => makeMapStyles(theme), [theme]);

  // First-paint HTML for the WebView. The center / theme vars are baked into
  // the initial JSON because re-rendering would wipe Leaflet's tile cache and
  // camera. Live changes are pushed via the bridge effects below.
  const html = useMemo(() => {
    const desiredZoom = Math.max(12, Math.min(15, centerZoom || 13));
    const hasCenter = !!(centerGeo && hasValidGeo(centerGeo));
    const fallback = hasCenter
      ? { lat: centerGeo![0], lng: centerGeo![1], zoom: desiredZoom }
      : { lat: TOKYO_STATION.lat, lng: TOKYO_STATION.lng, zoom: 13 };
    const user = userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : null;
    const tileStyle: TileStyleId = resolveTileStyle(mapMode);
    const themeVars: MapThemeVars = buildMapThemeVars({
      effectiveMode: mapMode,
      accent: theme.accent,
      tileStyle,
    });
    return buildSpotMapHtml({
      center: fallback,
      user,
      ringColor,
      hasCenter,
      tileStyle,
      themeVars,
      controlsBottom: controlsBottomOffset,
    });
    // First-paint values captured once. Live theme updates pushed via the
    // bridge effect below — re-rendering would wipe tile cache + camera state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live tile + chrome theme push.
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

  // Phase 4: split the marker push into two paths.
  // - `markerStructural` excludes visited — rebuilds only when ids / images /
  //   ep / markerMode / ringColor actually change.
  // - `visitedIdsKey` captures the visited delta separately.
  // - The bridge effect sends a heavy `__updateMarkers` payload only when the
  //   structural signature changes; visited-only flips send `__updateVisited`,
  //   a separate JS hook in the leaflet HTML that swaps icons in place.
  const markerStructural = useMemo(() => {
    const out: Omit<MapMarkerPayload, 'visited'>[] = [];
    spotsById.current.clear();
    for (const spot of spots) {
      if (!hasValidGeo(spot.geo)) continue;
      const titles = getPilgrimageSpotTitles(spot);
      spotsById.current.set(spot.id, spot);
      out.push({
        id: spot.id,
        lat: spot.geo[0],
        lng: spot.geo[1],
        title: titles.primary,
        image: spot.image ?? '',
        ep: spot.ep,
        ringColor,
        markerMode,
      });
    }
    return out;
  }, [spots, ringColor, markerMode]);

  const markerSignature = useMemo(() => {
    let sig = '';
    for (const m of markerStructural) {
      sig += `${m.id}|${m.ep}|${m.image}|${m.markerMode}|${m.ringColor};`;
    }
    return sig;
  }, [markerStructural]);

  const visitedIdsKey = useMemo(() => {
    const ids: string[] = [];
    for (const m of markerStructural) if (visited[m.id] === true) ids.push(m.id);
    ids.sort();
    return ids.join(',');
  }, [markerStructural, visited]);

  // MapLibre-only: convert the SAME markerStructural + visited map the leaflet
  // bridge uses into engine-neutral markers via sceneMarkerToMapMarker. Returns
  // [] while engine !== 'maplibre' so it adds zero work to the leaflet path.
  // (`spotsById` is populated by the markerStructural memo above and is reused
  // here for the onMarkerPress / onClusterPress lookups.)
  const maplibreMarkers = useMemo<MapMarker[]>(() => {
    if (engine !== 'maplibre') return [];
    return markerStructural.map((m) =>
      sceneMarkerToMapMarker({
        id: m.id,
        lat: m.lat,
        lng: m.lng,
        title: m.title,
        image: m.image,
        ep: m.ep,
        ringColor: m.ringColor,
        visited: visited[m.id] === true,
        markerMode: m.markerMode === 'dot' ? 'dot' : 'bubble',
      })
    );
  }, [engine, markerStructural, visited]);

  useEffect(() => {
    if (!ready || !webviewRef.current) return;
    const structuralChanged = previousMarkerSignatureRef.current !== markerSignature;
    if (structuralChanged) {
      previousMarkerSignatureRef.current = markerSignature;
      // Bake current visited bits into the payload exactly once per structural
      // change. After this, visited deltas go through the lighter __updateVisited.
      const payload: MapMarkerPayload[] = markerStructural.map((m) => ({
        ...m,
        visited: visited[m.id] === true,
      }));
      const json = JSON.stringify(payload).replace(/</g, '\\u003c');
      webviewRef.current.injectJavaScript(`
        try { window.__updateMarkers && window.__updateMarkers(${json}); } catch(e) {}
        true;
      `);
      return;
    }
    // Visited-only change: send the much smaller id-list payload.
    const visitedIds = visitedIdsKey ? visitedIdsKey.split(',') : [];
    const json = JSON.stringify(visitedIds).replace(/</g, '\\u003c');
    webviewRef.current.injectJavaScript(`
      try { window.__updateVisited && window.__updateVisited(${json}); } catch(e) {}
      true;
    `);
  }, [markerSignature, visitedIdsKey, ready, markerStructural, visited]);

  useEffect(() => {
    if (!ready || !webviewRef.current) return;
    webviewRef.current.injectJavaScript(`
      try { window.__setOfflineOnly && window.__setOfflineOnly(${offlineOnly ? 'true' : 'false'}); } catch(e) {}
      true;
    `);
  }, [offlineOnly, ready]);

  useEffect(() => {
    if (!ready || !webviewRef.current || !focusSpotId) return;
    const spot = spotsById.current.get(focusSpotId);
    if (!spot || !hasValidGeo(spot.geo)) return;
    const payload = JSON.stringify({ lat: spot.geo[0], lng: spot.geo[1] });
    webviewRef.current.injectJavaScript(`
      try { window.__focusSpot && window.__focusSpot(${payload}); } catch(e) {}
      true;
    `);
  }, [focusSpotId, ready]);

  // MapLibre: chip-strip selection pans to the focused spot — parity with the
  // leaflet __focusSpot inject above, via the native flyTo handle (zoom 16).
  useEffect(() => {
    if (engine !== 'maplibre' || !focusSpotId) return;
    const spot = spotsById.current.get(focusSpotId);
    if (!spot || !hasValidGeo(spot.geo)) return;
    maplibreRef.current?.focus?.({ lat: spot.geo[0], lng: spot.geo[1], zoom: 16 });
  }, [engine, focusSpotId]);

  // Push the user-location dot. Sent separately from the spot markers so
  // location ticks don't re-render hundreds of pins. `null` removes the dot.
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

  // Re-push the FAB / attribution bottom offset whenever it changes (e.g. the
  // bottom sheet's peek height shifts on rotation or inset change). The
  // initial value is baked into the first-paint HTML, but the prop can change
  // later — without this, the buttons would stay at their original height.
  useEffect(() => {
    if (!ready || !webviewRef.current) return;
    const mc = controlsBottomOffset;
    const attr = Math.max(0, controlsBottomOffset - 32);
    webviewRef.current.injectJavaScript(`
      try {
        document.documentElement.style.setProperty('--mc-bottom', '${mc}px');
        document.documentElement.style.setProperty('--attr-bottom', '${attr}px');
      } catch(e) {}
      true;
    `);
  }, [controlsBottomOffset, ready]);

  // Imperative recentre / heading API. Driven by the locate-FAB hook so
  // location ticks + 60 Hz magnetometer ticks bypass React state entirely
  // (CLAUDE.md Rule 9). The handle is a no-op while the WebView hasn't
  // reported `ready` — early calls are dropped rather than queued.
  useImperativeHandle(
    ref,
    () => ({
      recenter: (lat, lng, zoom, opts) => {
        if (engine === 'maplibre') {
          maplibreRef.current?.recenter(lat, lng, zoom, opts);
          return;
        }
        if (!ready || !webviewRef.current) return;
        const z = typeof zoom === 'number' ? zoom : 'undefined';
        const animate = opts?.animate === false ? 'false' : 'true';
        webviewRef.current.injectJavaScript(`
          try { window.__recenter && window.__recenter(${lat}, ${lng}, ${z}, { animate: ${animate} }); } catch(e) {}
          true;
        `);
      },
      setHeading: (deg) => {
        if (engine === 'maplibre') {
          maplibreRef.current?.setHeading(deg);
          return;
        }
        if (!ready || !webviewRef.current) return;
        const payload = deg === null || !Number.isFinite(deg) ? 'null' : String(deg);
        webviewRef.current.injectJavaScript(`
          try { window.__updateHeading && window.__updateHeading(${payload}); } catch(e) {}
          true;
        `);
      },
    }),
    [ready, engine]
  );

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as {
        type: string;
        id?: string;
        ids?: unknown[];
      };
      if (data.type === 'ready') {
        setReady(true);
        return;
      }
      if (data.type === 'spotPress' && data.id) {
        const spot = spotsById.current.get(data.id);
        if (spot) onSpotPress(spot);
        return;
      }
      if (data.type === 'userPanned') {
        onUserPan?.();
        return;
      }
      if (data.type === 'clusterPress' && Array.isArray(data.ids)) {
        const picked: AnitabiPoint[] = [];
        for (const raw of data.ids) {
          const s = spotsById.current.get(String(raw));
          if (s) picked.push(s);
        }
        if (picked.length > 0) onClusterPick(picked);
      }
    } catch {
      // ignore
    }
  };

  // MapLibre branch — purely additive, reached only when the rollout flag is
  // flipped to 'maplibre'. The leaflet `return` below is left byte-identical.
  if (engine === 'maplibre') {
    const styleUrl = resolveMapStyleUrl(mapMode, loadMapStyleOverrideSync());
    // Mirror the leaflet first-paint `html` memo: user dot from userLocation
    // (no geo guard there), center only when centerGeo is valid.
    const user = userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : null;
    const center =
      centerGeo && hasValidGeo(centerGeo) ? { lat: centerGeo[0], lng: centerGeo[1] } : undefined;
    return (
      <View style={[styles.container, style]} testID="pilgrimage-spot-map">
        <MapSurface
          engine="maplibre"
          ref={maplibreRef}
          markers={maplibreMarkers}
          styleUrl={styleUrl}
          user={user}
          center={center}
          zoom={centerZoom}
          markerMode={markerMode === 'dot' ? 'dot' : 'bubble'}
          clusterDisableAtZoom={CLUSTER_DISABLE_AT.spot}
          offlineOnly={offlineOnly}
          controlsBottomOffset={controlsBottomOffset}
          onMarkerPress={(m) => {
            const spot = spotsById.current.get(m.id);
            if (spot) onSpotPress(spot);
          }}
          onClusterPress={(markers) => {
            const picked: AnitabiPoint[] = [];
            for (const m of markers) {
              const s = spotsById.current.get(m.id);
              if (s) picked.push(s);
            }
            if (picked.length > 0) onClusterPick(picked);
          }}
          onPanned={onUserPan}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, style]} testID="pilgrimage-spot-map">
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
        style={styles.webview}
        renderError={() => (
          <View style={styles.fallback}>
            <Ionicons name="map-outline" size={32} color={theme.text.secondary} />
            <ThemedText variant="titleMedium" weight="600" style={styles.fallbackTitle}>
              Map unavailable
            </ThemedText>
            <ThemedText variant="bodySmall" tone="secondary" align="center">
              Couldn&apos;t load the map. Check your connection and try again.
            </ThemedText>
          </View>
        )}
        startInLoadingState
      />
    </View>
  );
});

function areEqual(prev: SpotMapViewProps, next: SpotMapViewProps): boolean {
  return (
    prev.spots === next.spots &&
    prev.visited === next.visited &&
    prev.ringColor === next.ringColor &&
    prev.userLocation === next.userLocation &&
    prev.centerGeo === next.centerGeo &&
    prev.centerZoom === next.centerZoom &&
    prev.markerMode === next.markerMode &&
    prev.offlineOnly === next.offlineOnly &&
    prev.focusSpotId === next.focusSpotId &&
    prev.controlsBottomOffset === next.controlsBottomOffset &&
    prev.onSpotPress === next.onSpotPress &&
    prev.onClusterPick === next.onClusterPick &&
    prev.onUserPan === next.onUserPan &&
    prev.theme === next.theme &&
    prev.style === next.style
  );
}

export const SpotMapView = memo(SpotMapViewImpl, areEqual);

function makeMapStyles(theme: ThemePalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      overflow: 'hidden',
      backgroundColor: theme.background.secondary,
    },
    webview: {
      flex: 1,
      backgroundColor: theme.background.secondary,
    },
    fallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      backgroundColor: theme.background.secondary,
      gap: 8,
    },
    fallbackTitle: {
      marginTop: 8,
    },
  });
}
