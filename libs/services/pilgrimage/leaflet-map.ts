// Shared Leaflet WebView scaffolding for the pilgrimage map views.
//
// Why this exists:
//   The map shell loads from a stable origin (`MAP_BASE_URL`) so the WebView's
//   Cache API and IndexedDB persist across launches. OSM tiles are then cached
//   to disk via Cache API on first paint and re-served instantly on revisits —
//   including offline at the spot, which is the whole point of pilgrimage.
//
// Each map view contributes its own marker CSS/JS; everything else (tile
// cache, zoom/recenter controls, loading + offline overlays, user pulse) lives
// here so polish stays consistent.

/**
 * Stable, opaque-but-secure baseUrl for the map HTML. WKWebView/Android
 * WebView treat this as the page origin, which gives Cache API + IndexedDB
 * persistent storage. Must match exactly across mounts so the cache hits.
 */
export const MAP_BASE_URL = 'https://aniseekr.local/';

/**
 * Raster tile providers we support. All are CORS-enabled and key-free so the
 * in-WebView Cache API path works without auth. Voyager (light) and Dark
 * Matter (dark) are the closest free analogues to Google Maps Light / Dark.
 */
// Required by OpenStreetMap Tile Usage Policy and CARTO Basemaps terms:
// the attribution must name "OpenStreetMap contributors" and link to the
// copyright page, and CARTO basemaps must credit CARTO with a link to its
// attribution page. Leaflet renders the anchors in the bottom-right control.
const OSM_CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';

const OSM_ONLY_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

export const TILE_STYLES = {
  voyager: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    subdomains: 'abcd',
    attribution: OSM_CARTO_ATTRIBUTION,
    maxZoom: 19,
    /** Body background to match the tile while loading — picked from the
     * tile's dominant land color so the WebView doesn't flash a different
     * shade before tiles paint. */
    bodyBg: '#F5F1E8',
  },
  positron: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png',
    subdomains: 'abcd',
    attribution: OSM_CARTO_ATTRIBUTION,
    maxZoom: 19,
    bodyBg: '#F2F2F2',
  },
  darkMatter: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png',
    subdomains: 'abcd',
    attribution: OSM_CARTO_ATTRIBUTION,
    maxZoom: 19,
    // Dark Matter ships near-black (#0E0E0E land); we lift via --tile-filter
    // at runtime to approach Google Maps Dark's slate (#262A35). Body bg
    // matches the *lifted* color so the loading shell doesn't flash black.
    bodyBg: '#262A35',
  },
  osmStandard: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    attribution: OSM_ONLY_ATTRIBUTION,
    maxZoom: 18,
    bodyBg: '#E8E4DA',
  },
} as const;

export type TileStyleId = keyof typeof TILE_STYLES;

/**
 * Pick a tile style for the user's resolved theme mode. Light themes get the
 * warm CARTO Voyager palette (closest free analogue to Google Maps Light);
 * dark themes get Dark Matter (closest to Google Maps Dark).
 *
 * Kept as a pure function so it's trivially testable and can be reused on
 * native + inside the WebView build path.
 */
export function resolveTileStyle(effectiveMode: 'light' | 'dark'): TileStyleId {
  return effectiveMode === 'light' ? 'voyager' : 'darkMatter';
}

/** Active style — switching this once propagates to every map mount. */
export const DEFAULT_TILE_STYLE_ID: TileStyleId = 'darkMatter';

const DEFAULT_TILE = TILE_STYLES[DEFAULT_TILE_STYLE_ID];

/** Default raster tile URL. Consumers pass this to `CachedTileLayer`. */
export const TILE_URL = DEFAULT_TILE.url;

/** Subdomain pool for the `{s}` placeholder in `TILE_URL`. */
export const TILE_SUBDOMAINS = DEFAULT_TILE.subdomains;

/** Attribution string for the active tile provider. */
export const TILE_ATTRIBUTION = DEFAULT_TILE.attribution;

/** Tile provider's maximum zoom. */
export const TILE_MAX_ZOOM = DEFAULT_TILE.maxZoom;

/**
 * Build the CSS variable payload that drives map chrome (body bg, FAB tonal,
 * spinner, attribution chip). Pushed to the WebView via `__setMapTheme()`.
 *
 * Tonal scale follows Material 3:
 *   surface              → body bg (matches the tile so loading doesn't flash)
 *   surface-container    → FAB resting (lighter than surface in dark mode)
 *   surface-container-hi → FAB pressed
 * In dark mode every surface gets a slight primary tint by mixing in 4–8% of
 * the accent — that's what makes Material elevation feel "lit from within"
 * instead of just "darker / lighter shades of grey".
 */
export interface MapThemeVars {
  '--map-bg': string;
  '--map-chrome': string;
  '--map-chrome-press': string;
  '--map-on-chrome': string;
  '--map-spinner': string;
  '--map-spinner-track': string;
  '--map-attr-bg': string;
  '--map-attr-fg': string;
  '--map-attr-link': string;
  '--map-banner-bg': string;
  '--map-banner-fg': string;
  '--map-banner-border': string;
  /** CSS filter applied to .leaflet-tile. Lifts CARTO Dark Matter's near-black
   * toward a Google-Maps-Dark slate; `none` for light tiles. */
  '--tile-filter': string;
}

export function buildMapThemeVars(opts: {
  effectiveMode: 'light' | 'dark';
  accent: string;
  tileStyle: TileStyleId;
}): MapThemeVars {
  const isDark = opts.effectiveMode === 'dark';
  const tileBg = TILE_STYLES[opts.tileStyle].bodyBg;
  if (isDark) {
    return {
      '--map-bg': tileBg,
      '--map-chrome': '#2A2A2C',
      '--map-chrome-press': '#3A3A3C',
      '--map-on-chrome': '#E6E1E5',
      '--map-spinner': opts.accent,
      '--map-spinner-track': 'rgba(255,255,255,0.12)',
      '--map-attr-bg': 'rgba(28,28,30,0.7)',
      '--map-attr-fg': 'rgba(235,235,245,0.6)',
      '--map-attr-link': 'rgba(235,235,245,0.85)',
      '--map-banner-bg': 'rgba(28,28,30,0.94)',
      '--map-banner-fg': '#ffffff',
      '--map-banner-border': 'rgba(255,255,255,0.12)',
      '--tile-filter': 'brightness(1.35) contrast(0.92) saturate(1.1)',
    };
  }
  return {
    '--map-bg': tileBg,
    '--map-chrome': '#ffffff',
    '--map-chrome-press': '#F1F3F4',
    '--map-on-chrome': '#1F1F1F',
    '--map-spinner': opts.accent,
    '--map-spinner-track': 'rgba(0,0,0,0.10)',
    '--map-attr-bg': 'rgba(255,255,255,0.85)',
    '--map-attr-fg': 'rgba(0,0,0,0.55)',
    '--map-attr-link': 'rgba(0,0,0,0.78)',
    '--map-banner-bg': 'rgba(255,255,255,0.96)',
    '--map-banner-fg': '#1F1F1F',
    '--map-banner-border': 'rgba(0,0,0,0.08)',
    '--tile-filter': 'none',
  };
}

/**
 * Default map center when nothing more specific is known.
 * Tokyo Station — densest pilgrimage region in Japan, much more useful than
 * the previous middle-of-Honshu/zoom-5 view that just showed open water.
 */
export const TOKYO_STATION = { lat: 35.6812, lng: 139.7671, zoom: 11 } as const;

/**
 * Kept under the old name so existing imports keep compiling. Renaming the
 * symbol is a follow-up — for now we just want every map that used to land in
 * the Sea of Japan to land on Tokyo Station instead.
 */
export const JAPAN_CENTER = TOKYO_STATION;

/** Bumped when the cache schema changes so old entries are dropped. */
export const TILE_CACHE_NAME = 'osm-tiles-v2';

/**
 * Shared CSS — tile attribution, recentre FAB, loading spinner, offline
 * banner, pulsing user marker, branded cluster bubble. Marker-specific CSS
 * (anime cards, spot cards) is appended by each consumer.
 *
 * Design language: Google Maps mobile (Material 3).
 * - Single circular FAB bottom-right (zoom +/- removed; pinch handles it).
 * - State layer (::before opacity overlay) for press feedback, not scale.
 * - Tonal surfaces driven by --map-* CSS variables — caller injects
 *   light/dark values via `__setMapTheme()` so a theme switch repaints
 *   without re-rendering the WebView.
 * - User pulse uses Google's location blue (#4285F4), not iOS blue.
 */
export const MAP_BASE_CSS = `
  :root {
    /* Defaults match dark mode; overridden by __setMapTheme() / inline style. */
    --map-bg: #262A35;
    --map-chrome: #2A2A2C;
    --map-chrome-press: #3A3A3C;
    --map-on-chrome: #E6E1E5;
    --map-spinner: #4285F4;
    --map-spinner-track: rgba(255,255,255,0.12);
    --map-attr-bg: rgba(28,28,30,0.7);
    --map-attr-fg: rgba(235,235,245,0.6);
    --map-attr-link: rgba(235,235,245,0.85);
    --map-banner-bg: rgba(28,28,30,0.94);
    --map-banner-fg: #ffffff;
    --map-banner-border: rgba(255,255,255,0.12);
    /* Lift CARTO Dark Matter near-black toward a Google-Maps-Dark slate.
       CSS filter applies per-tile so labels brighten with land — keeps
       legibility while killing the black-hole feel. Light tiles set this
       to none via __setMapTheme. */
    --tile-filter: brightness(1.35) contrast(0.92) saturate(1.1);
  }
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: var(--map-bg); }
  #map { outline: none; }
  .leaflet-tile { filter: var(--tile-filter, none); }
  .map-loading {
    position: absolute; inset: 0; z-index: 1100;
    display: flex; align-items: center; justify-content: center;
    background: var(--map-bg);
    transition: opacity .35s ease, background .25s ease;
  }
  .map-loading.hidden { opacity: 0; pointer-events: none; }
  .map-loading .spinner {
    width: 30px; height: 30px; border-radius: 50%;
    border: 3px solid var(--map-spinner-track);
    border-top-color: var(--map-spinner);
    animation: ms-spin 1s linear infinite;
  }
  @keyframes ms-spin { to { transform: rotate(360deg); } }

  .map-banner {
    position: absolute; left: 12px; right: 12px; top: 12px;
    z-index: 1100;
    display: none; gap: 8px; align-items: center;
    background: var(--map-banner-bg); color: var(--map-banner-fg);
    border: 1px solid var(--map-banner-border);
    border-radius: 10px;
    padding: 8px 12px;
    font: 600 12px 'Google Sans Text', Roboto, system-ui, -apple-system, sans-serif;
    box-shadow: 0 1px 3px rgba(0,0,0,0.30), 0 4px 8px 3px rgba(0,0,0,0.15);
  }
  .map-banner.visible { display: flex; }
  .map-banner .dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--map-spinner);
    box-shadow: 0 0 0 0 currentColor;
    animation: ms-dot 1.6s infinite;
  }
  .map-banner.offline .dot { background: #EA4335; }
  @keyframes ms-dot {
    0% { box-shadow: 0 0 0 0 rgba(66,133,244,0.55); }
    70% { box-shadow: 0 0 0 6px rgba(66,133,244,0); }
    100% { box-shadow: 0 0 0 0 rgba(66,133,244,0); }
  }

  /*
   * --mc-bottom is set per-mount via an inline CSS variable on :root. Defaults
   * to 16px (true-fullscreen maps). Hub-inline maps override so the FAB
   * clears the floating tab bar.
   *
   * Google Maps mobile uses a single right-bottom FAB column (no zoom +/- on
   * touch — pinch handles it). Each FAB is its own pill so users read them
   * as independent actions, not a grouped widget.
   */
  .map-controls {
    position: absolute; right: 16px; bottom: var(--mc-bottom, 16px); z-index: 1000;
    display: flex; flex-direction: column; gap: 12px;
    transition: bottom 0.2s ease;
  }
  /* Lift leaflet attribution above the floating tab bar in the same way. */
  .leaflet-bottom.leaflet-right { bottom: var(--attr-bottom, 0px); }

  /*
   * Material 3 small FAB — circular, surface-container-high tonal, layered
   * elevation shadow. The ::before pseudo is the state layer (8% on-surface
   * overlay on press) — Material's standard alternative to scale transforms.
   */
  .map-btn {
    position: relative;
    width: 48px; height: 48px; border-radius: 50%;
    background: var(--map-chrome); color: var(--map-on-chrome);
    border: none;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; user-select: none;
    /* MD3 elevation level 3 — two shadows: tight key + soft ambient. */
    box-shadow: 0 1px 3px 0 rgba(0,0,0,0.30),
                0 4px 8px 3px rgba(0,0,0,0.15);
    -webkit-tap-highlight-color: transparent;
    transition: background .12s ease;
    overflow: hidden;
  }
  .map-btn::before {
    content: ''; position: absolute; inset: 0; border-radius: inherit;
    background: currentColor; opacity: 0; transition: opacity .12s ease;
    pointer-events: none;
  }
  .map-btn:active { background: var(--map-chrome-press); }
  .map-btn:active::before { opacity: 0.12; }
  .map-btn svg { width: 22px; height: 22px; fill: currentColor; display: block; }

  .leaflet-control-attribution {
    font-size: 9px;
    background: var(--map-attr-bg) !important;
    color: var(--map-attr-fg) !important;
    padding: 1px 6px !important;
    border-radius: 4px;
  }
  .leaflet-control-attribution a { color: var(--map-attr-link) !important; }

  /* Google Maps "you are here" — solid blue dot, white ring, soft ripple. */
  .user-pulse {
    width: 16px; height: 16px; border-radius: 50%;
    background: #4285F4;
    border: 2px solid #fff;
    box-shadow: 0 0 0 0 rgba(66,133,244,0.55), 0 1px 4px rgba(0,0,0,0.4);
    animation: ms-pulse 2s infinite;
  }
  @keyframes ms-pulse {
    0%   { box-shadow: 0 0 0 0 rgba(66,133,244,0.55), 0 1px 4px rgba(0,0,0,0.4); }
    70%  { box-shadow: 0 0 0 18px rgba(66,133,244,0),  0 1px 4px rgba(0,0,0,0.4); }
    100% { box-shadow: 0 0 0 0 rgba(66,133,244,0),     0 1px 4px rgba(0,0,0,0.4); }
  }

  /* Heading beam — a translucent Google-Maps-style cone fanning out from the
     user dot in the direction the device faces. Sits behind the dot, hidden
     until a real compass reading arrives (.active); rotated by __updateHeading. */
  .user-loc { position: relative; width: 16px; height: 16px; }
  .user-loc .user-pulse { position: absolute; left: 0; top: 0; }
  .user-heading {
    position: absolute; left: 50%; top: 50%;
    width: 80px; height: 80px;
    margin: -40px 0 0 -40px;
    pointer-events: none;
    background: conic-gradient(from -32deg at 50% 50%,
      rgba(66,133,244,0) 0deg,
      rgba(66,133,244,0.5) 32deg,
      rgba(66,133,244,0) 64deg);
    -webkit-mask-image: radial-gradient(circle at 50% 50%, #000 12%, rgba(0,0,0,0) 64%);
    mask-image: radial-gradient(circle at 50% 50%, #000 12%, rgba(0,0,0,0) 64%);
    transform: rotate(0deg);
    transform-origin: 50% 50%;
    transition: transform 0.18s ease-out;
    opacity: 0;
  }
  .user-heading.active { opacity: 1; }

  /* Branded cluster bubble — flat Material disc, no inset shadows or text
     reflections (those were skeuomorphic and clashed with Material 3).
     The bundled leaflet.markercluster CSS sets a 20px border-radius on the
     outer .marker-cluster and forces .marker-cluster div to 30x30 with
     5px margins. Those defaults make our custom .ms-cluster render as a
     tiny dot offset inside a rounded-rect outline (empty box on the map).
     We reset the outer container and override layout on .ms-cluster with
     !important so the plugin's selector specificity does not win. */
  .marker-cluster {
    background: transparent !important;
    border: none !important;
    border-radius: 0 !important;
  }
  .ms-cluster {
    width: 100% !important; height: 100% !important;
    margin: 0 !important;
    border-radius: 50%;
    background: var(--ring, #4285F4);
    border: 2px solid #ffffff;
    color: #ffffff;
    display: flex; align-items: center; justify-content: center;
    font: 700 12px 'Google Sans Text', Roboto, system-ui, -apple-system, sans-serif;
    letter-spacing: -0.2px;
    box-shadow: 0 1px 2px 0 rgba(0,0,0,0.28),
                0 3px 6px 1px rgba(0,0,0,0.14);
    transition: transform .12s ease;
    cursor: pointer;
    position: relative;
  }
  .ms-cluster .ms-cluster-count { line-height: 1; font-weight: 700; }
  .ms-cluster:active { transform: scale(0.94); }
  .ms-cluster.sm { font-size: 10px; }
  .ms-cluster.lg { font-size: 14px; }
  .ms-cluster.xl { font-size: 16px; }
  /* Compact "dot" cluster — used when zoomed out so far that a numbered
     bubble would be unreadable, or when the cluster is small enough that
     the count is not worth the chrome. The soft halo (box-shadow ring)
     reads as "this area has scenes" without intruding on the map. */
  .ms-dot {
    width: 100% !important; height: 100% !important;
    margin: 0 !important;
    border-radius: 50%;
    background: var(--ring, #4285F4);
    border: 2px solid #ffffff;
    box-shadow: 0 0 0 4px var(--halo, rgba(66,133,244,0.22)),
                0 1px 2px 0 rgba(0,0,0,0.30);
    transition: transform .12s ease;
    cursor: pointer;
  }
  .ms-dot:active { transform: scale(0.92); }
  /* Animations are off for snappier feel; keep transition only for fades. */
  .leaflet-cluster-anim .leaflet-marker-icon,
  .leaflet-cluster-anim .leaflet-marker-shadow {
    transition: opacity 0.2s ease-in;
  }
`;

/**
 * Returns the static body markup that wraps every map. Call this inside
 * `<body>` before injecting any consumer scripts.
 *
 * The previous in-WebView "recenter" FAB lived here. It has been replaced by a
 * native `<LocateFab />` so the button can use theme tokens, haptics, and the
 * idle/following/compass state machine. The `#map-controls` container stays
 * because spot detail still hangs zoom +/- buttons off it.
 */
export const MAP_BASE_BODY = `
<div id="map"></div>
<div id="map-loading" class="map-loading"><div class="spinner"></div></div>
<div id="map-banner" class="map-banner"><span class="dot"></span><span id="map-banner-label">Connecting…</span></div>
<div class="map-controls" id="map-controls"></div>
`;

/**
 * Shared JS shim — injected once after the Leaflet bundle. Sets up:
 *   - `CachedTileLayer`: a TileLayer that reads/writes the Cache API so tiles
 *     persist between launches and work offline.
 *   - `__bindMap(map, recenterFn)`: wires up zoom buttons, recenter button,
 *     loading overlay dismissal, and offline banner toggling.
 *   - `__post(payload)`: postMessage helper for sending events to native.
 *
 * Cache eviction: Cache API doesn't auto-prune. We keep a parallel index in
 * IndexedDB so we can cap entries at MAX_TILES (drops oldest 25% on overflow).
 * That's coarse, but tiles are small (~10–25 KB) and the cap keeps total disk
 * usage under ~25 MB.
 */
export const MAP_BASE_JS = `
(function(){
  var TILE_CACHE = ${JSON.stringify(TILE_CACHE_NAME)};
  var MAX_TILES = 1000;
  var DB_NAME = 'osm-tile-index';
  var STORE = 'tiles';

  var hasCacheAPI = typeof caches !== 'undefined' && !!caches.open;
  var cachePromise = hasCacheAPI ? caches.open(TILE_CACHE).catch(function(){ return null; }) : Promise.resolve(null);

  // IndexedDB for the LRU index (the Cache API itself can't enumerate cheaply).
  var dbPromise = new Promise(function(resolve){
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    var req;
    try { req = indexedDB.open(DB_NAME, 1); } catch (e) { resolve(null); return; }
    req.onupgradeneeded = function(){ try { req.result.createObjectStore(STORE, { keyPath: 'url' }); } catch(e){} };
    req.onsuccess = function(){ resolve(req.result); };
    req.onerror = function(){ resolve(null); };
  });

  function indexPut(url) {
    dbPromise.then(function(db){
      if (!db) return;
      try {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ url: url, t: Date.now() });
      } catch (e) {}
    });
  }
  function maybeEvict() {
    dbPromise.then(function(db){
      if (!db) return;
      try {
        var tx = db.transaction(STORE, 'readwrite');
        var store = tx.objectStore(STORE);
        var countReq = store.count();
        countReq.onsuccess = function(){
          if (countReq.result < MAX_TILES) return;
          // Oldest 25% — open a cursor sorted by t (we don't have that index;
          // walk the store and collect, then sort). At 1000 entries this is fine.
          var rows = [];
          var cReq = store.openCursor();
          cReq.onsuccess = function(ev){
            var cur = ev.target.result;
            if (cur) { rows.push(cur.value); cur.continue(); return; }
            rows.sort(function(a,b){ return a.t - b.t; });
            var drop = rows.slice(0, Math.floor(MAX_TILES * 0.25));
            cachePromise.then(function(cache){
              if (!cache) return;
              for (var i = 0; i < drop.length; i++) {
                cache.delete(drop[i].url).catch(function(){});
                store.delete(drop[i].url);
              }
            });
          };
        };
      } catch (e) {}
    });
  }

  function getCachedBlob(url) {
    return cachePromise.then(function(cache){
      if (!cache) return null;
      return cache.match(url).then(function(resp){ return resp ? resp.blob() : null; });
    }).catch(function(){ return null; });
  }
  function putCached(url, blob) {
    cachePromise.then(function(cache){
      if (!cache) return;
      try {
        cache.put(url, new Response(blob, { headers: { 'Content-Type': 'image/png' } }));
        indexPut(url);
        if (Math.random() < 0.02) maybeEvict();
      } catch (e) {}
    }).catch(function(){});
  }

  var stats = { ok: 0, err: 0, cached: 0 };
  var offlineOnly = false;
  var loadingEl = null, bannerEl = null, bannerLabel = null;
  var bannerTimer = null;
  var transparentTile = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

  function setBanner(text, kind) {
    if (!bannerEl) return;
    if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
    if (!text) { bannerEl.classList.remove('visible'); return; }
    bannerEl.classList.toggle('offline', kind === 'offline');
    if (bannerLabel) bannerLabel.textContent = text;
    bannerEl.classList.add('visible');
    if (kind !== 'offline') {
      bannerTimer = setTimeout(function(){ bannerEl.classList.remove('visible'); }, 2400);
    }
  }
  function refreshLoadingState() {
    if (loadingEl && (stats.ok + stats.cached > 0)) loadingEl.classList.add('hidden');
    if (loadingEl && offlineOnly && (stats.ok + stats.cached + stats.err > 0)) loadingEl.classList.add('hidden');
    if (stats.err >= 4 && stats.ok === 0) {
      setBanner(stats.cached > 0 ? 'Offline — showing cached tiles' : 'Offline — no cached tiles for this area', 'offline');
    } else if (stats.err > 0 && stats.ok > 0 && !bannerTimer) {
      setBanner('Some tiles unavailable', 'warn');
    }
  }

  window.CachedTileLayer = L.TileLayer.extend({
    createTile: function(coords, done) {
      var tile = document.createElement('img');
      tile.alt = '';
      tile.setAttribute('role', 'presentation');
      tile.crossOrigin = 'anonymous';
      var url = this.getTileUrl(coords);

      var apply = function(src, isBlob, fromCache) {
        tile.onload = function(){
          if (isBlob) { try { URL.revokeObjectURL(src); } catch(e){} }
          if (fromCache) stats.cached++; else stats.ok++;
          refreshLoadingState();
          done(null, tile);
        };
        tile.onerror = function(){
          if (isBlob) { try { URL.revokeObjectURL(src); } catch(e){} }
          stats.err++;
          refreshLoadingState();
          done(new Error('tile load error'), tile);
        };
        tile.src = src;
      };
      var applyBlank = function() {
        tile.onload = function(){
          stats.err++;
          refreshLoadingState();
          done(null, tile);
        };
        tile.onerror = function(){
          stats.err++;
          refreshLoadingState();
          done(new Error('offline tile unavailable'), tile);
        };
        tile.src = transparentTile;
      };

      getCachedBlob(url).then(function(blob){
        if (blob) { apply(URL.createObjectURL(blob), true, true); return; }
        if (offlineOnly) {
          applyBlank();
          return;
        }
        fetch(url, { mode: 'cors', credentials: 'omit' })
          .then(function(resp){
            if (!resp.ok) throw new Error('http ' + resp.status);
            return resp.blob();
          })
          .then(function(b){ putCached(url, b); apply(URL.createObjectURL(b), true, false); })
          .catch(function(){
            // Network or CORS denied — last-ditch direct <img src> so the WebView
            // HTTP cache (cacheEnabled prop) can still serve a stale copy.
            apply(url, false, false);
          });
      });

      return tile;
    }
  });

  window.__setOfflineOnly = function(enabled) {
    offlineOnly = !!enabled;
    stats = { ok: 0, err: 0, cached: 0 };
    var loading = document.getElementById('map-loading');
    if (loading) loading.classList.remove('hidden');
    if (offlineOnly) setBanner('Offline cache mode — cached tiles only', 'offline');
    else setBanner('', '');
    if (window.__activeMap) {
      try {
        window.__activeMap.eachLayer(function(layer){
          if (layer && typeof layer.redraw === 'function' && typeof layer.getTileUrl === 'function') layer.redraw();
        });
      } catch (e) {}
    }
  };

  window.__post = function(payload){
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  };

  /**
   * Live-swap the tile layer without re-rendering the WebView. Native pushes
   * this when the user toggles theme mode (light↔dark) so the camera, marker
   * state, and tile cache all survive.
   *
   * The current layer is tracked on the map so we can remove it; the stub
   * reference is set later by __bindMap once we have a map instance.
   */
  var __activeTileLayer = null;
  window.__setTileStyle = function(opts) {
    if (!opts || !opts.url || !window.__activeMap) return;
    var map = window.__activeMap;
    if (__activeTileLayer) { try { map.removeLayer(__activeTileLayer); } catch (e) {} }
    __activeTileLayer = new window.CachedTileLayer(opts.url, {
      maxZoom: opts.maxZoom || 19,
      minZoom: 3,
      subdomains: opts.subdomains || 'abc',
      attribution: opts.attribution || '',
      keepBuffer: 4,
      updateWhenIdle: false
    }).addTo(map);
    // Reset the loading overlay so the new tile fetch can dismiss it again.
    var loading = document.getElementById('map-loading');
    if (loading) loading.classList.remove('hidden');
  };

  /**
   * Update the map's CSS variable palette in place — body bg, FAB tonal,
   * spinner, attribution chip — so a theme change repaints without remount.
   */
  window.__setMapTheme = function(vars) {
    if (!vars || typeof vars !== 'object') return;
    var root = document.documentElement;
    for (var key in vars) {
      if (Object.prototype.hasOwnProperty.call(vars, key) && typeof vars[key] === 'string') {
        root.style.setProperty(key, vars[key]);
      }
    }
  };

  /**
   * Fly to the user's pin at a tight, walking-scale zoom so the recentre
   * button answers "where am I, what's right around me?" — not "show me
   * every anime point on the planet". Any marker that happens to sit inside
   * the resulting viewport renders naturally; nothing is dragged in from
   * far away.
   *
   * The \`coords\` argument is kept for back-compat but no longer used: an
   * earlier version bounds-fit user + closest k markers, which pulled the
   * camera all the way out to include a marker in Tokyo when the user was
   * standing in Taipei. Users (correctly) hated that.
   *
   * Inputs:
   *   map          — leaflet map instance
   *   user         — { lat, lng } | null
   *   _coords      — kept for back-compat, ignored
   *   opts         — { zoom?: number, home?: {lat,lng,zoom}, duration?: number }
   *                  Default zoom is 14 which shows roughly a 2 km wide patch
   *                  on a phone (~3 km diagonal); plenty of context without
   *                  losing the "I'm right here" framing.
   *
   * Returns true if it moved the camera anywhere meaningful, false if both
   * user and home were missing.
   */
  window.__fitNearby = function(map, user, _coords, opts) {
    opts = opts || {};
    var zoom = typeof opts.zoom === 'number' ? opts.zoom : 14;
    var duration = typeof opts.duration === 'number' ? opts.duration : 0.45;
    var home = opts.home || null;

    if (user && typeof user.lat === 'number' && typeof user.lng === 'number') {
      try { map.flyTo([user.lat, user.lng], zoom, { duration: duration }); return true; } catch (e) {}
    }
    if (home && typeof home.lat === 'number' && typeof home.lng === 'number') {
      try { map.flyTo([home.lat, home.lng], home.zoom || zoom, { duration: duration }); return true; } catch (e) {}
    }
    return false;
  };

  /**
   * Build a leaflet.markercluster group with our branded bubble icons.
   * Behavior trade-offs picked for touch UX:
   *   - zoomToBoundsOnClick=false: tapping a cluster never zooms by itself;
   *     the parent picks based on count (see clusterclick handler below).
   *   - spiderfyOnMaxZoom=false: spiderfy looks bad on dark UI and at our
   *     marker sizes (44px) it does not actually de-overlap the items.
   *   - chunkedLoading=true: large lists (200+ markers) do not freeze the
   *     UI thread when added.
   *   - animate=false: cluster recompute on zoom feels snappier without
   *     the cross-fade, which was the main laggy complaint.
   * Options: { ringColor, haloColor, disableAt=14, pickerThreshold=12 }.
   */
  window.__makeClusterGroup = function(opts) {
    opts = opts || {};
    var ring = opts.ringColor || '#FF9F0A';
    var halo = opts.haloColor || hexToRgba(ring, 0.22);
    var pickerThreshold = opts.pickerThreshold == null ? 12 : opts.pickerThreshold;

    if (typeof L.markerClusterGroup !== 'function') {
      // Plugin unavailable — return a plain layer group so callers still work.
      return L.layerGroup();
    }

    var group = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: false,
      zoomToBoundsOnClick: false,
      animate: false,
      animateAddingMarkers: false,
      chunkedLoading: true,
      removeOutsideVisibleBounds: true,
      disableClusteringAtZoom: opts.disableAt || 14,
      maxClusterRadius: function(zoom) {
        // Tighter than the plugin defaults (80) so we don't scoop up markers
        // that were already visually distinguishable.
        if (zoom <= 5) return 65;
        if (zoom <= 8) return 50;
        if (zoom <= 11) return 38;
        if (zoom <= 13) return 28;
        return 22;
      },
      iconCreateFunction: function(cluster) {
        var n = cluster.getChildCount();
        var clusterMap = cluster._group && cluster._group._map;
        var zoom = clusterMap ? clusterMap.getZoom() : 12;

        // Color the bubble after the dominant region color present in the
        // cluster. Each marker is expected to carry its color via
        // options.regionColor; older callers without that fall back to the
        // group's ring color.
        var children = cluster.getAllChildMarkers();
        var counts = {};
        for (var i = 0; i < children.length; i++) {
          var c = (children[i].options && children[i].options.regionColor) || ring;
          counts[c] = (counts[c] || 0) + 1;
        }
        var pick = ring, pickN = 0;
        for (var key in counts) {
          if (counts[key] > pickN) { pick = key; pickN = counts[key]; }
        }
        var pickHalo = hexToRgba(pick, 0.22);

        // Dot mode: zoomed out so far that numbered text would be unreadable,
        // or the cluster is small enough that the count is not informative.
        // The dot scales with member count so dense regions still read as
        // "more" even without a label. Stops looking blocky in dense areas.
        if (zoom <= 8 || n < 10) {
          var dotSize;
          if (n < 5)        dotSize = 12;
          else if (n < 25)  dotSize = 16;
          else if (n < 100) dotSize = 20;
          else              dotSize = 24;
          var dotHtml = '<div class="ms-dot" style="--ring:' + pick + ';--halo:' + pickHalo + '"></div>';
          return L.divIcon({
            html: dotHtml,
            className: 'marker-cluster',
            iconSize: L.point(dotSize, dotSize)
          });
        }

        // Numbered bubble — zoomed in enough that the text reads, and the
        // count is high enough to be worth showing.
        var size, sizeClass;
        if (n < 50)        { size = 34; sizeClass = ' sm'; }
        else if (n < 200)  { size = 42; sizeClass = ''; }
        else               { size = 50; sizeClass = ' lg'; }
        var label = n >= 1000 ? (Math.floor(n / 100) / 10).toFixed(1) + 'k' : String(n);

        var html = '<div class="ms-cluster' + sizeClass + '" style="--ring:' + pick + ';--halo:' + pickHalo + '">' +
          '<span class="ms-cluster-count">' + label + '</span>' +
        '</div>';
        return L.divIcon({
          html: html,
          className: 'marker-cluster',
          iconSize: L.point(size, size)
        });
      }
    });

    // Crossing the dot/bubble zoom boundary (8 ↔ 9) only changes the cluster
    // radius from 50 to 38 — clusters that stay together keep their cached
    // icon and look stale. Force a refresh so the bubble/dot swap happens
    // exactly when the user expects it. Only fires on threshold crossings to
    // avoid recomputing on every pinch.
    var lastDotZoom = null;
    group.on('add', function() {
      var attachedMap = group._map;
      if (!attachedMap) return;
      attachedMap.on('zoomend', function() {
        var z = attachedMap.getZoom();
        var isDot = z <= 8;
        if (lastDotZoom !== null && lastDotZoom !== isDot) {
          if (typeof group.refreshClusters === 'function') {
            try { group.refreshClusters(); } catch (e) {}
          }
        }
        lastDotZoom = isDot;
      });
    });

    // Always-attached click handler. Native side gets clusterPress for
    // small clusters; large ones get a smooth flyToBounds in-WebView so we
    // don't bother native with a giant picker.
    group.on('clusterclick', function(ev) {
      var children = ev.layer.getAllChildMarkers();
      var n = children.length;
      var map = ev.target._map;
      if (n > pickerThreshold) {
        try { map.flyToBounds(ev.layer.getBounds(), { padding: [50, 50], maxZoom: 14, duration: 0.35 }); } catch (e) {}
        return;
      }
      var ids = [];
      for (var i = 0; i < n; i++) {
        var id = children[i].__appId;
        if (id != null) ids.push(id);
      }
      if (ids.length > 0) window.__post({ type: 'clusterPress', ids: ids });
    });

    return group;
  };

  function hexToRgba(hex, alpha) {
    if (!hex || hex.charAt(0) !== '#') return 'rgba(255,159,10,' + alpha + ')';
    var h = hex.slice(1);
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var r = parseInt(h.substr(0,2), 16);
    var g = parseInt(h.substr(2,2), 16);
    var b = parseInt(h.substr(4,2), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return 'rgba(255,159,10,' + alpha + ')';
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  // Wire shared chrome to a freshly-built map.
  //
  //   @param {L.Map} map
  //
  //   The recenter button has moved off the WebView; recentre is now a native
  //   FAB that calls window.__recenter(...). __bindMap therefore takes only
  //   the map. Older callsites passed a recenterFn as the second arg — it is
  //   silently ignored to keep them compiling during the migration.
  //
  //   userPanned postMessage:
  //   Emitted on Leaflet dragstart (which covers user drag + pinch-zoom
  //   translation but NEVER fires for programmatic setView/flyTo). Native
  //   uses this signal to break out of follow / compass mode the moment the
  //   user takes manual control of the camera.
  window.__bindMap = function(map /*, recenterFn (deprecated) */) {
    loadingEl = document.getElementById('map-loading');
    bannerEl = document.getElementById('map-banner');
    bannerLabel = document.getElementById('map-banner-label');
    // Expose for live tile swaps from native (__setTileStyle) + __recenter.
    window.__activeMap = map;

    var ctrl = document.getElementById('map-controls');
    if (ctrl) {
      L.DomEvent.disableClickPropagation(ctrl);
      L.DomEvent.disableScrollPropagation(ctrl);
    }

    map.on('dragstart', function(){
      window.__post({ type: 'userPanned' });
    });

    // Online/offline browser events fire inside WebViews on most platforms.
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('online', function(){ offlineOnly ? setBanner('Offline cache mode — cached tiles only', 'offline') : setBanner('Back online', 'warn'); });
      window.addEventListener('offline', function(){ setBanner('Offline — showing cached tiles', 'offline'); });
    }
  };

  // Pan/zoom the map to a target location. Used by the native locate FAB to
  // drive the map from outside the WebView. zoom defaults to a walking-scale
  // framing so "where am I?" answers without zooming back out to the whole
  // prefecture. animate=false is honoured for the silent recentres a
  // following state machine fires on each GPS update.
  window.__recenter = function(lat, lng, zoom, opts) {
    if (!window.__activeMap) return;
    if (typeof lat !== 'number' || typeof lng !== 'number') return;
    var targetZoom = typeof zoom === 'number' ? zoom : 15;
    var animate = !opts || opts.animate !== false;
    try {
      if (animate) {
        window.__activeMap.flyTo([lat, lng], targetZoom, { duration: 0.4 });
      } else {
        window.__activeMap.setView([lat, lng], targetZoom, { animate: false });
      }
    } catch (e) {}
  };
})();
`;
