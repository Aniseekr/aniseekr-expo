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

/** Standard OSM tile endpoint. CORS-enabled so `fetch` + Cache API works. */
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Center used when no anime/user location is known — middle of Honshu. */
export const JAPAN_CENTER = { lat: 36.2048, lng: 138.2529, zoom: 5 } as const;

/** Bumped when the cache schema changes so old entries are dropped. */
export const TILE_CACHE_NAME = 'osm-tiles-v1';

/**
 * Shared CSS — tile attribution, custom zoom/recenter buttons, loading
 * spinner, offline banner, and the pulsing user marker. Marker-specific CSS
 * (anime cards, spot cards) is appended by each consumer.
 */
export const MAP_BASE_CSS = `
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #1c1c1e; }
  #map { outline: none; }
  .map-loading {
    position: absolute; inset: 0; z-index: 1100;
    display: flex; align-items: center; justify-content: center;
    background: #1c1c1e;
    transition: opacity .35s ease;
  }
  .map-loading.hidden { opacity: 0; pointer-events: none; }
  .map-loading .spinner {
    width: 30px; height: 30px; border-radius: 50%;
    border: 3px solid rgba(255,255,255,0.12);
    border-top-color: #FF9F0A;
    animation: ms-spin 1s linear infinite;
  }
  @keyframes ms-spin { to { transform: rotate(360deg); } }

  .map-banner {
    position: absolute; left: 12px; right: 12px; top: 12px;
    z-index: 1100;
    display: none; gap: 8px; align-items: center;
    background: rgba(28,28,30,0.94); color: #fff;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 10px;
    padding: 8px 12px;
    font: 600 12px -apple-system, system-ui, sans-serif;
    box-shadow: 0 6px 16px rgba(0,0,0,0.35);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }
  .map-banner.visible { display: flex; }
  .map-banner .dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: #FF9F0A;
    box-shadow: 0 0 0 0 rgba(255,159,10,0.6);
    animation: ms-dot 1.6s infinite;
  }
  .map-banner.offline .dot { background: #FF453A; }
  @keyframes ms-dot {
    0% { box-shadow: 0 0 0 0 rgba(255,159,10,0.6); }
    70% { box-shadow: 0 0 0 6px rgba(255,159,10,0); }
    100% { box-shadow: 0 0 0 0 rgba(255,159,10,0); }
  }

  .map-controls {
    position: absolute; right: 12px; bottom: 12px; z-index: 1000;
    display: flex; flex-direction: column; gap: 8px;
  }
  .map-btn {
    width: 40px; height: 40px; border-radius: 12px;
    background: rgba(28,28,30,0.92); color: #fff;
    border: 1px solid rgba(255,255,255,0.12);
    display: flex; align-items: center; justify-content: center;
    font: 700 20px -apple-system, system-ui, sans-serif;
    cursor: pointer; user-select: none;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    -webkit-tap-highlight-color: transparent;
    transition: transform .12s ease, background .12s ease;
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
  }
  .map-btn:active { background: rgba(60,60,62,0.95); transform: scale(0.94); }
  .map-btn svg { width: 18px; height: 18px; fill: currentColor; }

  .leaflet-control-attribution {
    font-size: 9px;
    background: rgba(28,28,30,0.7) !important;
    color: rgba(235,235,245,0.6) !important;
    padding: 1px 6px !important;
    border-radius: 4px;
  }
  .leaflet-control-attribution a {
    color: rgba(235,235,245,0.85) !important;
  }

  .user-pulse {
    width: 16px; height: 16px; border-radius: 50%;
    background: #0A84FF;
    border: 2px solid #fff;
    box-shadow: 0 0 0 0 rgba(10,132,255,0.55), 0 1px 4px rgba(0,0,0,0.4);
    animation: ms-pulse 1.8s infinite;
  }
  @keyframes ms-pulse {
    0%   { box-shadow: 0 0 0 0 rgba(10,132,255,0.55), 0 1px 4px rgba(0,0,0,0.4); }
    70%  { box-shadow: 0 0 0 14px rgba(10,132,255,0),  0 1px 4px rgba(0,0,0,0.4); }
    100% { box-shadow: 0 0 0 0 rgba(10,132,255,0),     0 1px 4px rgba(0,0,0,0.4); }
  }

  /* Branded cluster bubble — overrides leaflet.markercluster's defaults so
     the look matches the rest of the app instead of the lime-green stock theme. */
  .marker-cluster {
    background: transparent !important;
    border: none !important;
  }
  .marker-cluster div {
    background: transparent !important;
    margin: 0 !important;
    width: 100% !important;
    height: 100% !important;
  }
  .marker-cluster span { display: none; }
  .ms-cluster {
    width: 100%; height: 100%;
    border-radius: 50%;
    background: rgba(28,28,30,0.94);
    border: 2px solid var(--ring, #FF9F0A);
    color: #fff;
    display: flex; align-items: center; justify-content: center;
    font: 800 15px -apple-system, system-ui, sans-serif;
    letter-spacing: -0.2px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5),
                0 0 0 5px var(--halo, rgba(255,159,10,0.22));
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    transition: transform .12s cubic-bezier(.2,.6,.2,1);
    cursor: pointer;
    position: relative;
  }
  .ms-cluster .ms-cluster-count { line-height: 1; }
  .ms-cluster::after {
    /* "more" affordance — three dots in the corner so users learn the bubble
       opens a list rather than zooming. */
    content: '⋯';
    position: absolute;
    right: -2px; top: -10px;
    width: 18px; height: 18px;
    border-radius: 50%;
    background: var(--ring, #FF9F0A);
    color: #1c1c1e;
    font: 800 13px -apple-system, system-ui, sans-serif;
    line-height: 16px; text-align: center;
    box-shadow: 0 2px 6px rgba(0,0,0,0.35);
    border: 2px solid #1c1c1e;
  }
  .ms-cluster:active { transform: scale(0.92); }
  .ms-cluster.sm { font-size: 14px; }
  .ms-cluster.lg { font-size: 17px; }
  .ms-cluster.xl { font-size: 19px; }
  /* Animations are off for snappier feel; keep transition only for fades. */
  .leaflet-cluster-anim .leaflet-marker-icon,
  .leaflet-cluster-anim .leaflet-marker-shadow {
    transition: opacity 0.2s ease-in;
  }
`;

/**
 * Returns the static body markup that wraps every map. Call this inside
 * `<body>` before injecting any consumer scripts.
 */
export const MAP_BASE_BODY = `
<div id="map"></div>
<div id="map-loading" class="map-loading"><div class="spinner"></div></div>
<div id="map-banner" class="map-banner"><span class="dot"></span><span id="map-banner-label">Connecting…</span></div>
<div class="map-controls" id="map-controls">
  <div class="map-btn" data-act="in" role="button" aria-label="Zoom in">+</div>
  <div class="map-btn" data-act="out" role="button" aria-label="Zoom out">&#8722;</div>
  <div class="map-btn" data-act="re" role="button" aria-label="Recenter">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8a4 4 0 1 0 .001 8.001A4 4 0 0 0 12 8zm9 3h-2.07A7.001 7.001 0 0 0 13 5.07V3h-2v2.07A7.001 7.001 0 0 0 5.07 11H3v2h2.07A7.001 7.001 0 0 0 11 18.93V21h2v-2.07A7.001 7.001 0 0 0 18.93 13H21v-2zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/></svg>
  </div>
</div>
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
  var loadingEl = null, bannerEl = null, bannerLabel = null;
  var bannerTimer = null;

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

      getCachedBlob(url).then(function(blob){
        if (blob) { apply(URL.createObjectURL(blob), true, true); return; }
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

  window.__post = function(payload){
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
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
        // Sizes lifted to comfortably exceed the iOS 44pt tap target.
        var size, sizeClass;
        if (n < 10)        { size = 48; sizeClass = ' sm'; }
        else if (n < 50)   { size = 56; sizeClass = ''; }
        else if (n < 200)  { size = 64; sizeClass = ' lg'; }
        else               { size = 72; sizeClass = ' xl'; }
        var label = n >= 1000 ? (Math.floor(n / 100) / 10).toFixed(1) + 'k' : String(n);
        var html = '<div class="ms-cluster' + sizeClass + '" style="--ring:' + ring + ';--halo:' + halo + '">' +
          '<span class="ms-cluster-count">' + label + '</span>' +
        '</div>';
        return L.divIcon({
          html: html,
          className: 'marker-cluster',
          iconSize: L.point(size, size)
        });
      }
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

  /**
   * Wire shared chrome to a freshly-built map.
   * @param {L.Map} map
   * @param {Function} recenterFn  Called when the user taps the recenter button.
   */
  window.__bindMap = function(map, recenterFn) {
    loadingEl = document.getElementById('map-loading');
    bannerEl = document.getElementById('map-banner');
    bannerLabel = document.getElementById('map-banner-label');

    var ctrl = document.getElementById('map-controls');
    if (ctrl) {
      L.DomEvent.disableClickPropagation(ctrl);
      L.DomEvent.disableScrollPropagation(ctrl);
      ctrl.addEventListener('click', function(e){
        var node = e.target;
        while (node && node !== ctrl && !node.getAttribute('data-act')) node = node.parentNode;
        var act = node && node.getAttribute ? node.getAttribute('data-act') : null;
        if (act === 'in') map.zoomIn();
        else if (act === 'out') map.zoomOut();
        else if (act === 're' && typeof recenterFn === 'function') recenterFn();
      });
    }

    // Online/offline browser events fire inside WebViews on most platforms.
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('online', function(){ setBanner('Back online', 'warn'); });
      window.addEventListener('offline', function(){ setBanner('Offline — showing cached tiles', 'offline'); });
    }
  };
})();
`;
