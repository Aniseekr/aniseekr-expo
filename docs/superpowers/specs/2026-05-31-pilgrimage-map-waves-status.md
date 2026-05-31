# Pilgrimage Map Perf — Waves Status & Remaining Work

> ✅ **Superseded & resolved 2026-06-01.** The MapLibre migration this doc anticipated is **done**: Leaflet (the WebView + ~200 KB inlined JS that this whole doc was about) is **deleted**, replaced by a single native MapLibre engine with full feature parity, landed in 17 staged commits (`tsc`/`bun test` green). The WebView-host cold-open waves (W5-B keep-alive, Device-verify B, pre-warm C) are **moot** — there's no WebView parse left to amortize; `MapHost` now keeps a native map warm instead. Only on-device visual validation remains. See [`../plans/2026-06-01-pilgrimage-maplibre-parity-and-leaflet-removal.md`](../plans/2026-06-01-pilgrimage-maplibre-parity-and-leaflet-removal.md).

- **Date:** 2026-05-31
- **Status:** ✅ **Resolved by the 2026-06-01 MapLibre migration** (was: in progress on `perf/pilgrimage-map-cold-open`)
- **Goal:** faster pilgrimage map, primarily **cold-open** (`libs/services/pilgrimage/*`, `app/(tabs)/pilgrimage/*`)
- **Related:** [`2026-05-30-pilgrimage-map-maplibre-migration-design.md`](./2026-05-30-pilgrimage-map-maplibre-migration-design.md) — the **MapLibre migration** design (decision made 2026-05-31: replace Leaflet with a single MapLibre engine; offline via MapLibre-native pointed at OpenFreeMap → our R2). Supersedes this WebView-host direction.

> Root cause recap: each of the 3 map surfaces mounts its **own** WebView and cold-parses **~200 KB** of inlined Leaflet JS on every open (the stable origin caches *tiles*, not the inline script). Secondary: ~160 KB `*.data.json` eager-parsed at import; `map.tsx` 11-`useState` root (Rule 9); hub does full marker `replace` per filter/search.

---

## ✅ Done (on `perf/pilgrimage-map-cold-open`)

| Wave | Commit | What it did | Improved |
|------|--------|-------------|----------|
| **W1** | `7358bbe` | 4 bundled `*.data.json` (~160 KB) → lazy + memoized (parse on first use, not at module-eval). Runtime hydration still wins; APIs unchanged & sync. | App-startup JS-thread (~50 ms off the import path) |
| **W4** | `f445288` | Extracted `hooks/usePilgrimageHubData` (collection/featured/lazy-index/visited/captures) out of `map.tsx` (Rule 9). Capped cold-start featured `/lite` fetches to 6 concurrent. | `map.tsx` root state; cold-start request storm 29→6 |
| **W5-A** | `458d47f` | Extracted hub Leaflet WebView (`buildHubMapHtml` + component) → `components/pilgrimage/HubMapWebView.tsx`. Behavior byte-identical. | Reusable unit; `map.tsx` 1818→974 LOC (incl. W4) |
| **W5-B** | `cd307b5` | `MapHostProvider` keeps **one** `HubMapWebView` alive in `pilgrimage/_layout`; hub screen claims on focus / releases on blur (WebView not destroyed). Root transparent + `box-none`. | Cold-open: ~200 KB Leaflet parse paid **once per session**, not per navigation (online/Leaflet path) |
| **fix** | `5ff7bbc` | Memoize WebView `source` on `[html]` so `host.update` doesn't re-send `{html,baseUrl}` → Android `loadDataWithBaseURL` reload (which would defeat keep-alive). +regression test. | Keep-alive correctness on Android |

All commits passed `tsc --noEmit` + relevant `__tests__/unit/pilgrimage/*` suites. `map.tsx`: **1818 → 974 LOC**.

Note: W5-B's win is **amortize** (pay parse once at idle), not **eliminate**. Going native (the pivot spec) would eliminate it for the *online* path.

---

## ⏳ Remaining / unfinished

| Item | Status | Notes |
|------|--------|-------|
| **Device-verify B** | 🔴 **Gating** | Transparency / z-order / touch passthrough can't be unit-tested. 6-point on-device checklist below. **Most likely failure: `react-native-screens` opaque screen container hides the map.** |
| **C — pre-warm timing** | ⏳ blocked on B | Polish: warm the host on pilgrimage tab focus so the first open is also hot. Build on verified B. |
| **W3 — hub marker signature-diff** | ⏳ optional | Port `SpotMapView`'s diff so filter/search does additive/diff updates instead of full `replace` (kills marker flash). Not a user-stated pain. |
| **W6 — press-in thumbnail prefetch** | ⏳ low-risk | `Image.prefetch` initial-viewport marker thumbnails on list press-in (Rule 10 #6). Independent of the host. |

### B on-device checklist (run `bun start` / `bun run ios`; B is JS-only, no prebuild)
1. **Map visible** through the hub screen? (blank/black ⇒ transparency chain / `react-native-screens`)
2. **Pan/zoom on empty area** works? (no ⇒ `box-none`/z-order touch passthrough)
3. **Markers + filter + search** render/update?
4. **Cold-open win:** hub→detail→back ×N and tab-switch back ⇒ **instant, no skeleton/reload**? (core goal)
5. **Other routes** (index/album/plan/detail) stay opaque, no map bleed-through?
6. Locate FAB idle→following→compass; drag drops to idle.

---

## 🔀 Decision made (2026-05-31) — MapLibre migration (switchable dropped)

The companion spec's *switchable two-engine* proposal was **dropped**. Decision: **replace Leaflet with a single MapLibre Native engine**; **offline = MapLibre-native** (ambient cache + `createPack`) pointed at a **multi-source chain (OpenFreeMap now → our Worker+R2 read-through cache later)**; Leaflet is **deleted** after migration. Rationale: MapLibre v11 *does* have native offline — the old "MapLibre is online-only, keep Leaflet for offline" premise was false, so two engines forever was needless. See the migration design doc.

**How it reframes the work above:**
- W1 / W4 are engine-agnostic → stay.
- W5-A (`HubMapWebView`) → can seed a temporary `LeafletEngine` adapter for per-surface rollout safety, then is deleted.
- W5-B keep-alive + the reload fix were justified by "MapLibre is online-only, so the offline/Leaflet path still needs WebView keep-alive" — **that justification no longer holds** (MapLibre offlines natively; Leaflet is being removed).

> **🟡 Open question for the user:** does the `perf/pilgrimage-map-cold-open` keep-alive work (W5-B, Device-verify B, pre-warm C) still earn its place as an **interim** cold-open win *before* MapLibre lands, or is it superseded by the migration? Decide this before investing more in Device-verify B / pre-warm C.

**Gating risk for the migration:** `@maplibre/maplibre-react-native` v11 on **Expo 54 / RN 0.81 / New Arch** — confirmed compatible (v11 is New-Arch-only; needs config plugin + dev-client/prebuild, already satisfied via AdMob). Still prove it renders + acceptable binary size with a minimal spike on the smallest surface (`SpotMapView`) **before** building the abstraction around it.

---

## ✅ Implementation progress (2026-05-31, branch `feat/pilgrimage-maplibre-migration`)

Verifiable foundation landed via TDD — every commit is `tsc --noEmit` + lint + `bun test` green:

| Commit | What |
|---|---|
| `chore(pilgrimage)` | removed orphan `react-native-maps` (0 imports) |
| `feat(pilgrimage)` | remote-configurable tile source URL, default OpenFreeMap (spec D7 seam) — `map-source-prefs.ts`, 9 tests |
| `feat(pilgrimage)` | engine-neutral data model `map-engine/types.ts` + marker normalization `normalize.ts` — 5 tests |
| `chore(pilgrimage)` | installed `@maplibre/maplibre-react-native@11.3.0` + config plugin in `app.json` |
| `feat(pilgrimage)` | MapLibre engine + `MapSurface` dispatcher + **leaflet-default** rollout flag (D11) — `map-engine-prefs.ts`, 4 tests |

**State:** the MapLibre engine (`components/pilgrimage/map/engines/MapLibreEngine.tsx`) is **type-correct against the real installed v11 API** (`Map`/`Camera`/`GeoJSONSource`+`Layer`/`UserLocation`, `data` prop, `nativeEvent.features`, `[lng,lat]` order) and **flag-gated OFF** (`loadMapEngineSync()` defaults to `'leaflet'`). The shipping app, `MapHost.tsx`, and the Leaflet WebView path are **untouched**. `OfflineManager` is confirmed present in v11 (validates the "MapLibre offlines natively" premise).

**Device-gated remainder** (cannot be verified headlessly — this is the P1 spike):
1. Prebuild a dev client; flip the flag to `'maplibre'` on `SpotMapView` and confirm it renders (OpenFreeMap style, markers, user puck, camera) + acceptable binary-size delta.
2. Confirm/fix the OpenFreeMap style slugs in `map-source-prefs.ts` (`positron`/`dark`) against OFM's live catalog — the D7 override means this needs no app release.
2b. **Privacy posture:** with MapLibre enabled, every device fetches tiles directly from the 3rd-party OpenFreeMap endpoint (viewport coordinates → their servers, no API key/PII, but real IP + areas browsed). Document this in the privacy policy before flipping the flag; the Phase-2 self-hosted R2 Worker removes the 3rd-party hop entirely.
3. Wire the 3 surfaces onto `<MapSurface engine={flag} leafletFallback={…existing…} markers={…via normalize.ts…}>` (smallest-first), per the per-surface plan from the constraints workflow.
4. Post-validation: port full per-kind marker rendering (anime balloons, gold 88 pins, spot bubble/dot, visited flips, cluster picker) from the placeholder circles; then delete the Leaflet path (spec P4).

### Per-surface wiring plan (from constraints workflow `w722ikyal`)

`MapSurface` ref-delegation fix already landed (`b7ba8f5`), so the parent's ref works in both modes. Sequence smallest/safest first.

**Shared (all surfaces) — resolve `styleUrl`, don't drop dark/auto + the override.** The engine's internal fallback is hardcoded light; each surface MUST pass a resolved `styleUrl` or MapLibre silently ignores the user's map-theme (dark/auto) and the D7 source override (the Leaflet path honours both today). Each surface already has `mapThemePref` + `effectiveMode` in scope:
```ts
const styleUrl = resolveMapStyleUrl(resolveMapMode(mapThemePref, effectiveMode), loadMapStyleOverrideSync());
```
and subscribe to `subscribeMapThemePref` + `subscribeMapStyleOverride` so the style repaints in place on change.

1. **SpotMapView** — the one live ref consumer (`app/(tabs)/pilgrimage/[animeId].tsx:570` via `spotMapRef`).
   - markers: `sceneMarkerToMapMarker` (its `SceneMarkerInput` == the existing `MapMarkerPayload`).
   - flag: `const [engine,setEngine]=useState(loadMapEngineSync); useEffect(()=>subscribeMapEngine(setEngine),[])`. Pass `engine` + `markers` + `leafletFallback={<existing WebView>}` + `leafletRef`.
   - ref: move today's Leaflet `recenter/setHeading` onto an internal `leafletHandleRef`, pass as `leafletRef`; `spotMapRef.*` then works in both modes.
   - riskiest on device: visited flips + bubble/dot — the engine currently renders identical circles (ignores `visited`/`episode`/`markerMode`); wire `updateVisited` + per-kind icons before flipping.
2. **PilgrimageMapView** — lowest risk: **no live mount** (only its `cityToColor` export is used by `plan.tsx`; exposes no ref).
   - markers: build `HubMapMarker`-shaped objects → `hubMarkerToMapMarker` (`inCollection` has no `MapMarker` field — accept loss for the spike or add a field later).
   - riskiest: cluster tap → `ClusterPickerSheet` — the engine doesn't yet emit multi-id `onClusterPress`.
3. **Hub** — `MapHost.tsx` owns the kept-alive WebView; `map.tsx` drives it via `useMapHost()` context.
   - Route the flag **inside `MapHost`**: render `<MapSurface … leafletFallback={<HubMapWebView ref={leafletHandleRef}/>}>` and point `hostRef` at `MapSurface`. **`map.tsx` needs ZERO changes** (keeps calling `host.claim/update/recenter`).
   - markers: `config.markers.map(hubMarkerToMapMarker)` (1:1).
   - riskiest: (a) the native view must receive pinch/pan/tap in the portal-above-navigator layer (the touch issue that bit the shared host before); (b) the engine doesn't yet emit `onBoundsChange`, so the bounds-driven lazy anime loader stops — wire both before flipping the hub.

### Wiring status (2026-05-31)

Done under a strict "leaflet path byte-verbatim under an `engine` guard, MapLibre purely additive" contract, multi-agent + per-surface leaflet-preservation verification:

| Surface | Status | Notes |
|---|---|---|
| **SpotMapView** | ✅ **wired** (`e0a5244`) | Live spot-detail map. Early-return MapLibre branch; existing Leaflet `return` + handle bodies byte-identical (only the handle's `if (engine==='maplibre') …else…` guard + a behavior-neutral `[ready]→[ready,engine]` dep). Verified `leafletPreserved=true` (high). |
| **PilgrimageMapView** | 🗑️ **deleted** (2026-06-01) | Was dead on render (only `cityToColor` used → repointed to `region-color`); removed entirely. |
| **Hub (MapHost)** | ✅ **done** (2026-06-01) | Engine flag routed **inside `MapHost`** → `MapSurface`; `map.tsx` unchanged (still `host.claim/update/recenter/setHeading`). Leaflet branch then deleted; `MapHost` retained as the warm native keep-alive wrapper. `onBoundsChange`→lazy loader, region `fitBounds`, `focusAnime`→`focus`, multi-id cluster press all wired. |

**Final state (2026-06-01):** the engine flag, the Leaflet branch, `HubMapWebView`, `leaflet-map.ts`/`leaflet-assets.ts`, `delegating-handle`, `map-engine-prefs`, the bundle script, and the `leaflet`/`leaflet.markercluster`/`react-native-webview` deps are all **deleted**. `MapLibreEngine` does full per-kind rendering + supercluster clustering + `onBoundsChange`/multi-id `onClusterPress`/`fitBounds`/`updateVisited`/heading. The `@maplibre/maplibre-react-native` mock in `test-setup.ts` keeps `bun test` green. **One human gate left: on-device visual validation** (marker fidelity, heading cone, cluster tap, hub gestures + bounds-lazy-load, binary size).
