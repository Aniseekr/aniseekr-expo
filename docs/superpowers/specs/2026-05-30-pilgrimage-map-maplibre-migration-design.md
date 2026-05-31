# Pilgrimage Map — MapLibre Migration + Multi-Source Offline (Design)

- **Date:** 2026-05-30, **revised 2026-05-31**
- **Status:** Draft — direction agreed; full migration pending on-device validation (binary size, marker fidelity, transition feel)
- **Owner:** kidneyweakx
- **Scope:** `app/(tabs)/pilgrimage/*`, `components/pilgrimage/*`, `libs/services/pilgrimage/*`
- **Supersedes:**
  - the 2026-05-29 "stay on Leaflet + shared pre-warmed WebView host" direction (memory `pilgrimage-map-perf-direction`).
  - **this doc's own original 2026-05-30 "Native + Switchable (two engines forever, Auto by connectivity)" thesis** — overturned 2026-05-31. See the Revision note below.

---

## Revision note (2026-05-31) — why "switchable two-engine" was dropped

The original 2026-05-30 design kept **two engines permanently**: MapLibre online, Leaflet for offline, switched by connectivity. That whole structure rested on one load-bearing premise:

> "MapLibre is online-only; offline must stay on Leaflet."

**That premise is false.** `@maplibre/maplibre-react-native` **v11** has native offline:

- **Ambient cache** — tiles fetched while browsing are cached automatically (source-agnostic). This *reproduces today's Leaflet "cache-as-you-browse" behavior* with zero extra work.
- **`OfflineManager.createPack()`** — explicit per-region download (complete, reliable coverage) that Leaflet never had.

Once MapLibre can offline, maintaining two map engines forever — for a single tab — is the highest-cost option for no benefit. So the direction changed to:

1. **Replace Leaflet with MapLibre (single runtime engine).**
2. **Offline = MapLibre-native** (ambient + packs), pointed at a **multi-source tile chain**.
3. **Tile source: OpenFreeMap now; our Cloudflare Worker + R2 as a read-through cache later.**

Two further findings sealed it:

- **Leaflet held no real "offline crown jewel."** Today's Leaflet+CARTO already (a) depends on someone else's online service (CARTO CDN), (b) caches CARTO raster tiles, which **most raster-CDN ToS prohibit**, and (c) has the *same* cold-zone gap (un-browsed area + outage → blank). So moving to OpenFreeMap is a **strict improvement on external-dependency, ToS, and coverage** — not a new risk. The "must keep Leaflet for offline" argument is dead.
- **The three user-stated pains are about WebView itself, not Leaflet-the-library:** (1) cold-start hard to optimize, (2) ~200 KB inlined Leaflet re-parsed per WebView mount, (3) WebView is a black box that's hard to profile/reason about (this is what broke the pre-warm + portal experiments). Going native removes all three.

What survives from v1 unchanged: the engine-neutral **handle** abstraction (now a migration aid, not a two-engine runtime resolver), and the **GPX** + **導覽** app-layer designs.

---

## 1. Context & problem

The pilgrimage map is **Leaflet-in-WebView, hardcoded across three surfaces**, with **zero provider abstraction**:

| Surface | File | Role |
|---|---|---|
| Hub map | `app/(tabs)/pilgrimage/map.tsx` (~974 LOC, post-refactor) | Full-screen browse: anime balloons, Tourism-88 pins, region filters, search, sheet, locate FAB |
| Reusable map | `components/pilgrimage/PilgrimageMapView.tsx` (~694 LOC) | Detail/album/plan: anime markers, cluster picker, popups |
| Spot detail | `components/pilgrimage/detail/SpotMapView.tsx` (~740 LOC) + `SpotMapViewHandle` | On-location scene map: bubble/dot markers, visited flips, heading cone, offline-only mode |
| Hub WebView | `components/pilgrimage/HubMapWebView.tsx` | Extracted hub WebView + bridge (rendered inline after the shared-host revert) |

Shared infra: `libs/services/pilgrimage/leaflet-map.ts` builds the HTML and exposes the bridge (`__updateMarkers`, `__updateVisited`, `__updateUser`, `__updateHeading`, `__recenter`, `__focusSpot`, `__focusAnime`, `__updateSpots`, `__setMapTheme`, `__setTileStyle`, `__setOfflineOnly`, plus `animePress`/`markerPress`/`spotPress`/`clusterPress`/`userPanned`/`bounds` messages) and the offline tile cache (`CachedTileLayer` → Cache API `osm-tiles-v2` + IndexedDB `osm-tile-index`, LRU ~1000 tiles / ~25 MB, stable origin `https://aniseekr.local/`, CARTO Voyager/Dark-Matter tiles, ~179 LOC). `leaflet-assets.ts` is a **202,843-byte** auto-generated inline of Leaflet + markercluster.

### Root cause of the pains

- **Cold-start:** each surface mounts its **own** WebView and **cold-parses ~200 KB of inlined Leaflet** on every cold open (the stable origin caches *tiles*, not the inline script; the HTML is memoized so it is *not* re-parsed on filter/theme changes within a mounted screen). The 2026-05-31 shared/pre-warmed-host attempts to amortize this kept breaking touch (WebView behind the navigator) and were reverted / reworked via `@gorhom/portal`.
- **Black box:** WebView gesture/touch interplay is hard to profile and predict — the direct cause of the failed pre-warm experiments.
- Secondary: `map.tsx` still holds ~8 `useState` at root (Rule 9 pressure); the hub redraws markers broadly on filter/search.

### Why "go native Apple/Google Maps" alone still doesn't work

- **No in-app offline** for third-party apps (MapKit / Google SDK).
- **No custom tile style** on the Apple provider; `UrlTile` is Google-only.
- iOS-only / weak custom-polyline — bad fit for cross-platform GPX + 導覽.

`react-native-maps@1.20.1` is in `package.json` but **imported nowhere** (orphan — remove). `expo-maps` not installed. Stack: **Expo SDK 54, RN 0.81, React 19, New Architecture**.

---

## 2. Goals & non-goals

### Goals

1. **Leave the WebView black box** — kill the per-surface ~200 KB parse and get native-grade, profileable pan/zoom.
2. **Keep offline working on-location** — via **MapLibre-native** offline (ambient cache + region packs), no bespoke cache to maintain.
3. **Resilient tile sourcing** — a **multi-source fallback chain (a "multiple-choice", not "pick the single best")**, because any single free source will eventually 503.
4. **Cheapest-that-hits-quality** — **no per-user billing**; free tile/style source; flat cost.
5. **Global coverage** — pilgrimage is **not Japan-only**; sourcing + offline must scale worldwide.
6. **GPX** — import, view, export tracks/routes.
7. **導覽** — Phase A (free, follow an existing route) now; Phase B (turn-by-turn) reserved.

### Non-goals (YAGNI)

- **A permanent two-engine switchable design** (the dropped v1 thesis) — and no user-facing "Auto / MapLibre / Leaflet" setting.
- **Keeping Leaflet long-term** — it becomes temporary rollout-safety scaffolding only, deleted once all three surfaces are validated on MapLibre.
- **Mapbox** — per-MAU billing + offline tiles billed separately on top; scales against us (see §4).
- **Pre-seeded self-hosted planet as the *primary* runtime source** — explicitly rejected (see D6); R2 enters later as a *cache in front of* OpenFreeMap, not as the critical primary.
- **Apple/Google native engines** as primaries.
- Turn-by-turn routing implementation this milestone (interface only).
- Rewriting warm-start (snapshot seed / MMKV sync / SQLite TTL) — already tuned; keep.

---

## 3. Decisions

| # | Decision | Rationale |
|---|---|---|
| **D1** | **Single runtime engine = MapLibre Native** (`@maplibre/maplibre-react-native` v11) | Native speed; kills the WebView parse + black box; free OSS, no token, no per-user fee; native offline (ambient + packs); GL clustering; best line rendering for GPX/導覽; one codebase. |
| **D2** | **Replace Leaflet entirely — NOT a permanent two-engine switchable design** | The switchable design existed *only* because we believed MapLibre couldn't offline. It can. Two engines forever = max maintenance for one tab, for no benefit. |
| **D3** | **Offline = MapLibre-native: ambient cache + `OfflineManager.createPack()`** — delete the Leaflet Cache-API/IndexedDB hack | Ambient cache == today's cache-as-you-browse; `createPack` adds explicit per-region coverage Leaflet never had. No bespoke offline system to maintain. |
| **D4** | **Tile/style source = a multi-source fallback chain, standardized on the OpenMapTiles schema** | One MapLibre style works across interchangeable sources; resilience beats single-source. (Schema choice = OFM's, so sources are swappable under one style.) |
| **D5** | **Phase 1 source = OpenFreeMap, app connects directly (no self-host yet)** | OFM: free, no API key, **explicitly no request limits, commercial-OK, caching-OK**, weekly full-planet dumps, OpenMapTiles schema. A proven, already-running service. |
| **D6** | **Phase 2 source = our Cloudflare Worker + R2 as a *read-through cache in front of* OpenFreeMap (OFM stays the origin) — NOT a pre-seeded-planet primary** | User rejects making *unproven, self-operated* infra the critical primary: a service you stand up but don't actively run is *less* trustworthy than one already running. R2 augments OFM (fills on demand, friendlier under load),穿透 back to OFM on miss. |
| **D7** | **Leave a seam now: the tile base URL is a single remote-configurable value, never hardcoded in the style** | (a) OFM-sunset/limit escape hatch — flip to a backup source without an app release; (b) makes the Phase 1→2 source swap (OFM → our Worker) a config flip, so R2 "introduced later" stays cheap. |
| **D8** | **Mapbox ruled out** | Mobile billed per-MAU **and** offline tiles billed separately as tile requests on top — double-metered, scales with success; violates "no per-user billing". |
| **D9** | **Cold-zone (never-browsed area during a source outage) = accepted, bounded risk** | Bounded by ambient cache (browsed areas) + `createPack` (chosen regions). The *same-or-worse* risk already exists in today's Leaflet+CARTO; not a regression. |
| **D10** | **Coverage = global**, not Japan-only | Multi-source chain + per-region `createPack` scale worldwide; we never bundle a giant planet file in-app. |
| **D11** | **Keep a thin engine-neutral `MapSurface` handle; Leaflet adapter is temporary rollout-safety only, deleted when all three surfaces validate** | Rule 9 hygiene + per-surface feature-flag to de-risk rollout. Not a permanent two-engine abstraction. |
| **D12** | **GPX + 導覽 stay app-layer, engine-agnostic** | Unchanged from v1; render through the handle's route API. |

---

## 4. Engine & provider evaluation (price / features / display)

**Key mental model:** MapLibre is just the **renderer** (free, OSS). Mapbox bundles renderer + tile service. So "MapLibre vs Mapbox" is really *which tile/style source you plug in* — and the source is where ~all the cost and offline behavior live.

### 4.1 Price (MapLibre = renderer; rows are tile sources)

| Source | Monthly | Billing model | Offline | Commercial | Note |
|---|---|---|---|---|---|
| **Leaflet + CARTO (current)** | $0 | no key, not per-user | ✅ self-built cache (browse-cache) | ⚠️ | caching CARTO raster tiles **likely breaches CARTO ToS**; same cold-zone gap |
| **OpenFreeMap (Phase 1)** | **$0** | no key, **no limits**, not per-user | ✅ via MapLibre ambient + packs | ✅ | better-than-CARTO drop-in; only caveat = single free service, no SLA |
| **Self-host PMTiles on R2 (Phase 2)** | **~$0–3** | **flat, not per-user** | ✅✅ | ✅ (OSM ODbL attribution) | we own it; R2 egress $0; uses OFM's own planet dump → no pipeline |
| Stadia Maps | $20+ (Starter) | per-credit (not per-user) | ✅ ToS allows ~≤ "Long Island"/device | $20+ only | managed; per-device offline area limited |
| MapTiler Cloud | $25+ (Flex) | per-session/request | ✅ buy data package / self-host | $25+ only | polished styles + satellite + terrain |
| **Mapbox** | per-MAU **+ offline tiles extra** | **per-user, double-metered** | ✅ (billed) | paid | **ruled out (D8)** |
| HERE / TomTom | enterprise | per-transaction | ✅ strong | enterprise | overkill |
| Google / Apple | — | — | ❌ no 3rd-party offline | — | excluded |

### 4.2 Features

| Feature | Leaflet (now) | MapLibre + vector source |
|---|---|---|
| Offline model | browse-cache only (covers only browsed area/zoom) | ambient cache (same) **+** region packs (complete) = **superset** |
| Clustering | markercluster (DOM, finely tuned) | GL expression-based (native; re-do DOM polish) |
| Custom style | ❌ raster: only swap tile URL + CSS filter | ✅ full data-driven restyle |
| Rotate / pitch / 3D | ❌ | ✅ |
| GPX / route lines | ✅ polyline | ✅✅ GL line layer (width-by-zoom, arrows) |
| JA labels | ✅ (baked into tiles) | ✅ (`name:ja`) |

### 4.3 What can be displayed

Today's Leaflet is **raster** (image tiles): no restyle, no rotation, labels baked in — this is the ceiling that forces "theme switch = swap tile URL". Moving to **any vector source** unlocks custom palette, rotate/pitch/3D, crisp vectors, and line layers. Differences *between* vector sources are small; the only real one is **satellite** (MapTiler/Mapbox have it; OFM/Protomaps don't) — which this use case (scene-screenshot matching) doesn't need.

### 4.4 Compatibility (was v1's #1 risk — now resolved)

- MapLibre RN **v11 is New-Architecture-only**; Expo SDK 53/54 default to New Arch, RN 0.81 is compatible → **v11.x works**.
- Requires the `@maplibre/maplibre-react-native` config plugin + **prebuild / custom dev client (not Expo Go)** — **already satisfied** (the app ships AdMob native modules, so it's already on dev-client/prebuild). Not a new burden.
- Binary: native SDK adds a few MB — **validate as acceptable on device (P1).**

---

## 5. Architecture

### 5.1 Single engine + a thin neutral handle

```
components/pilgrimage/map/
  MapSurface.tsx          # <MapSurface {…props} ref={handle}/> — wraps MapLibre
  engines/
    maplibre/MapLibreEngine.tsx   # the only real engine
    leaflet/LeafletEngine.tsx     # TEMPORARY rollout-safety; deleted at end of migration
  index.ts
```

**`MapSurfaceProps` (engine-neutral):** `markers`, `routes?`, `waypoints?`, `user?`, `center?`, `zoom?`, `markerMode?: 'bubble'|'dot'`, `visitedIds?`, `onMarkerPress?`, `onClusterPress?`, `onPanned?`, `onBoundsChange?`, `controlsBottomOffset?`.

**`MapSurfaceHandle`:** `recenter(lat,lng,zoom?,opts?)`, `setHeading(deg|null)`, `focus(target)`, `fitBounds(box)`, `updateVisited(ids)`. (1:1 with the methods the three screens already call imperatively — keeps GPS/gesture ticks off React state, Rule 9.)

The handle exists for **hygiene + per-surface migration**, not to support two engines forever. The Leaflet adapter behind it is a feature-flagged fallback during rollout only.

### 5.2 Source resolution (the multi-source chain)

The app **only ever knows one tile URL**, supplied by remote config (D7):

```
App (MapLibre, single style, single configured URL)
   │  tiles base URL  ← remote-configurable (D7 seam)
   ▼
Phase 1:  → OpenFreeMap (direct)            # zero self-host
Phase 2:  → our Cloudflare Worker
              ├─ R2 hit            → serve   # read-through cache, fills on demand
              ├─ miss → OpenFreeMap → store R2 → serve
              ├─ OFM 503 → next same-schema free source (if any)
              └─ all down → R2 stale / optional raster last-resort
```

- Fallback logic lives **server-side in the Worker**, not the client: MapLibre's `tiles:[urlA,urlB]` is **round-robin sharding, not failover**, so client-side multi-source is not real fallback.
- The Worker reads byte-ranges from a PMTiles in R2 and serves standard `{z}/{x}/{y}` — so we **don't depend on client-side PMTiles support**, and adding sources later never needs an app release.

### 5.3 Offline (MapLibre-native)

- **Ambient cache** (automatic, size-capped) → reproduces today's cache-as-you-browse, now pointed at the configured stable URL (no ToS/503 exposure once Phase 2 lands).
- **`createPack(region, minZoom, maxZoom)`** → explicit "download Kyoto before I go"; global, per-region; we never bundle the planet in-app.
- Pre-downloads pull from the configured URL (Phase 1 = OFM directly; Phase 2 = our Worker, which is friendlier to OFM under load — see the §6 trigger).

---

## 6. Offline — multi-source phasing

| Phase | What | Self-host level |
|---|---|---|
| **Phase 1 (now)** | App **connects to OpenFreeMap directly**. Offline = MapLibre **ambient cache + `createPack`**. Cold-zone accepted (D9). | **zero** |
| **Phase 2 (later)** | Introduce **Cloudflare Worker + R2 as a read-through cache in front of OFM**; OFM remains origin. Flip the configured URL (ideally remote config → **no app release**). | low (pure proxy+cache) |
| **Phase 3 (likely never)** | Only if we ever want full OFM-independence: pre-seed the planet (OFM's weekly dump → R2). | high |

- **Ordering rationale (D5/D6):** OFM-primary is the only coherent choice while R2 doesn't exist yet, **and** a just-built self-hosted service isn't more trustworthy than a running one. R2 enters as augmentation, not as the critical primary.
- **Trigger for Phase 2 — watch load, not a date:** when `createPack` volume makes us an unfriendly neighbor to OFM's free server, or OFM starts rate-limiting us, that's when the R2 read-through cache earns its place.
- **Schema constraint (honest limits, Rule 8):** seamless multi-source needs a *shared schema*. **OFM (OpenMapTiles) is essentially the only commercial-OK, no-limit, same-schema free public source.** MapTiler/Stadia free tiers are key-gated/non-commercial; Versatiles uses the **Shortbread** schema (different — needs its own style). A **raster** source can be a *universal last-resort* fallback (no schema constraint) at the cost of a visually degraded frame. Don't promise arbitrary free-source stacking.

---

## 7. GPX

`libs/services/pilgrimage/gpx.ts` — engine-agnostic (unchanged from v1):

- **Parse** GPX XML → `{ tracks, routes, waypoints }` → `MapRoute` + `MapWaypoint`.
- **Serialize** spots / a tour → GPX for export.
- **Import** via `expo-document-picker` / share sheet; **export** via share sheet.
- Render through the handle's `routes`/`waypoints` props (MapLibre GL line layer).
- Errors are real (Rule 8): malformed GPX → error toast, no fake track.

---

## 8. 導覽 (navigation / guided tour)

**Phase A — follow an existing route (free, this milestone):** `libs/services/pilgrimage/tour-guide.ts`

- Order spots (reuse `rankFeaturedSpotsByPriority` + nearest-neighbor / imported GPX order / manual).
- Draw connecting route as a `MapRoute` (straight legs or snapped to imported GPX).
- Per-leg distance + ETA (haversine × walking speed) — real numbers only.
- Live "you are here · next point Xm · N stops left" using existing `useUserLocationTracking` (no extra GPS owner).

**Phase B — turn-by-turn (later, optional):** `RoutingProvider` interface `getWalkingRoute(from,to)` — `AppleDirectionsProvider` (iOS, free) / `OpenRouteServiceProvider` (free tier) / `Osrm·Valhalla` (self-host). On failure → fall back to Phase A straight-line. Interface reserved; **not implemented**.

---

## 9. Cost model

| Item | Phase 1 | Phase 2 |
|---|---|---|
| Renderer (MapLibre) | $0 | $0 |
| Tiles | OpenFreeMap $0 | OFM dump → R2 (read-through, fills on demand) |
| Storage / egress | — | R2 ~$0 (cache-aside, free tier) → ~$3/mo (if planet); **egress $0** |
| Compute | — | CF Worker free 100k req/day → ~$5/mo if exceeded |
| **Per-user billing** | **none** | **none** |

Net target: **$0 to start, ~$3–5/mo at most, flat.** Mapbox (per-MAU + offline extra) is the model we explicitly avoid.

---

## 10. Performance rationale

- **Cold-start:** native MapLibre has **no 200 KB JS parse per surface** — the root cause is removed, not amortized; the WebView black box (and its touch/pre-warm fragility) is gone.
- **Runtime:** native GL pan/zoom (60–120 fps); marker/cluster updates via GL source `setData` diff, not full re-inject.
- **Shared config:** one engine + one style across all three surfaces (no 3× HTML builders).
- **Render path stays clean (Rule 9):** imperative handle keeps GPS/gesture ticks off React state; warm-start seed (snapshot, MMKV sync, Rule 10) feeds the engine the same way.
- Opportunistically reduce `map.tsx` root `useState` as screens move to `MapSurface`.

---

## 11. Migration plan (design-level; detailed plan via writing-plans)

| Phase | Deliverable | Risk |
|---|---|---|
| P0 | Remove orphan `react-native-maps`; delete dead `MapHost.tsx` (pre-warm leftover); install MapLibre v11 + config plugin; prebuild dev client; add the **remote-configurable tile URL** (D7 seam) | Low |
| P1 | **`MapLibreEngine` + `MapSurface` on the smallest surface first (`SpotMapView`)**: markers, native clustering, user puck + heading, recenter/focus/bounds; OpenFreeMap style tuned toward Voyager/Dark-Matter; **validate on device**: binary size, marker fidelity, heading-cone feel, ambient-offline | Med |
| P2 | Migrate `PilgrimageMapView` + hub `map.tsx` (HubMapWebView) to `MapSurface`; behind a per-surface flag for safe rollout | Med |
| P3 | `createPack` per-region offline UX ("download this area"); delete the Leaflet Cache-API hack | Low |
| P4 | **Delete Leaflet adapter + `leaflet-map.ts` + `leaflet-assets.ts` + bundle script** once all 3 surfaces validated | Low |
| P5 | GPX import/export/render | Low |
| P6 | 導覽 Phase A (follow route) | Low |
| P7 | *(later)* Phase 2 source: Cloudflare Worker + R2 read-through cache; flip URL via config | Low |
| P8 | *(later/optional)* 導覽 Phase B behind `RoutingProvider` | — |

---

## 12. Error handling & empty states (Rule 8)

- Engine init failure → log; (during rollout) fall back to the flagged Leaflet adapter; map still renders.
- Source 503 / offline → ambient-cached + packed areas render; un-cached area → real "離線：此區域尚未下載" empty state; **never fake tiles**.
- GPX parse failure → real error toast; no placeholder track.
- Routing failure (Phase B) → Phase A straight-line; no fabricated path/ETA.
- All distances/ETAs from real coords (haversine), never seeded/hashed.

---

## 13. Testing

- **Unit:** data normalization → `MapMarker[]`; GPX parse/serialize round-trip; tour leg distance/ETA; existing locate-fab state machine.
- **Contract:** `MapLibreEngine` (and the temporary `LeafletEngine`, while it exists) satisfy `MapSurfaceHandle` with identical semantics.
- **Source/offline:** ambient-cache hit renders offline; `createPack` region downloads + renders offline; configured-URL swap (OFM → Worker) is transparent to the app.
- **Existing:** contrast (`themed-*`) + i18n parity tests stay green.

---

## 14. CLAUDE.md compliance

- **Rule 8 (no fake data):** offline/empty/error states real; ETAs/distances from real coords.
- **Rule 9 (state ownership):** imperative handle keeps sensor/gesture ticks off React state; reduce `map.tsx` `useState` as we migrate.
- **Rule 10 (nav feel):** tile-URL config + engine state read via sync MMKV; warm-start seed preserved; no `await` on first paint.
- **Rule 11 (i18n):** new strings (`離線：此區域尚未下載`, 導覽 labels, GPX import/export, "download this area") via `useT()`; keys added to `en.json` first.
- **Themed primitives:** new controls (GPX buttons, 導覽 HUD, offline-download) use `ThemedButton` / `ThemedText` / `ThemedSurface`, colors from `useTheme()`.

---

## 15. Risks & validations (resolve during implementation)

1. **On-device feel & size (P1):** confirm binary-size delta acceptable; marker/cluster styling fidelity vs today's DOM polish; heading-cone smoothness; theme live-swap without flicker.
2. **Anime-balloon markers at scale:** symbol-layer images vs view-annotations with hundreds of markers; lean on native clustering. *(P1)*
3. **Single-source reliance in Phase 1:** OFM has no SLA. Mitigated by the D7 config seam (flip source without a release) + ambient/pack offline. Trigger Phase 2 on sustained load/limits.
4. **Schema lock-in:** the chain only blends *same-schema* (OpenMapTiles) sources; document raster as the only universal last-resort.
5. **Style parity:** tune the MapLibre/OpenFreeMap style toward Voyager/Dark-Matter so the look doesn't jump from today's CARTO. *(P1)*

---

## 16. Resolved decisions (from review, 2026-05-31)

- **Engine:** single MapLibre (v11). Drop the permanent two-engine switchable design and the Auto/MapLibre/Leaflet user setting.
- **Offline:** MapLibre-native (ambient + `createPack`); delete the Leaflet Cache-API hack. Cold-zone accepted as a bounded risk (no worse than today).
- **Source ordering:** **OpenFreeMap primary now**; **R2 read-through cache in front of OFM later** (not a pre-seeded primary; self-host-as-primary explicitly rejected).
- **Seam:** tile base URL is a single remote-configurable value (escape hatch + cheap Phase 2 swap).
- **Coverage:** global, not Japan-only.
- **Mapbox:** out (per-MAU + offline double-metered).
- **Leaflet end-state:** **deleted** after migration (kept only as temporary rollout-safety) — its "offline crown jewel" status was overrated (ToS-questionable CARTO cache with the same cold-zone gap).
