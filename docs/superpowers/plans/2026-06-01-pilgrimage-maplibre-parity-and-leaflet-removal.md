# Pilgrimage Map — MapLibre Parity + Leaflet Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is executed **inline by the orchestrator with TDD** (tightly-coupled refactor; parallel subagents would conflict on shared files), so per-task test bodies are written red-first during execution rather than pre-written here.

**Goal:** Make MapLibre fully replace Leaflet across the live pilgrimage map surfaces with feature parity, then delete all Leaflet code — keeping every commit `bunx tsc --noEmit` + `bun test` green, landed in staged `feat/refactor/chore(pilgrimage):` commits under 100 chars.

**Architecture:** A single MapLibre Native engine renders all surfaces through the existing engine-neutral `MapSurface`/`MapSurfaceHandle` contract. Rich per-kind markers (anime balloons, gold Tourism-88 pins, spot bubble/dot, visited flips, in-collection checks, heading cone) render as view-based `<Marker>` children. Clustering is done in JS with **supercluster** (GL clustering can't host view markers), bounding on-screen view count; cluster bubbles match Leaflet's dot-vs-numbered visuals. The neutral data model is enriched so the engine renders entirely from `MapMarker` properties. Leaflet (WebView + `leaflet-map.ts` + 198 KB inlined `leaflet-assets.ts` + `MapHost` keep-alive portal) is deleted once the flag defaults to `maplibre`.

**Tech Stack:** Expo SDK 54 · RN 0.81 · React 19 (New Arch) · `@maplibre/maplibre-react-native@11.3.0` (`Map`/`Camera`/`Marker`/`UserLocation`) · `supercluster` (to add) · bun test · MMKV prefs.

---

## Scope

**In scope (= parity with *today's Leaflet*, then deletion):**
- Per-kind native markers + clustering UX + cluster picker.
- `onBoundsChange`, multi-id `onClusterPress`, `fitBounds`, `updateVisited`, real `setHeading` cone, `offlineOnly`, `controlsBottomOffset`, mode-aware style fallback.
- Wire the **hub** (currently 100% Leaflet, not on `MapSurface`) + finish `SpotMapView`.
- Flip default engine → `maplibre`; delete all Leaflet code/deps/scripts; collapse `MapEngineId`.

**Out of scope (reserved, net-new beyond Leaflet — do NOT build here):**
- **GPX** (spec P5) and **導覽 / tour-guide** (spec P6) — new features, no Leaflet equivalent.
- **`OfflineManager.createPack()` "download this area" UX** (spec P3) — net-new; parity only needs MapLibre's *automatic ambient cache* + keeping the `offlineOnly` toggle functional. `OfflineManager` plumbing is left for a follow-up.
- **Phase-2 Cloudflare Worker + R2** (spec P7) — already a config flip via the D7 seam; no code here.

**Device-gated (cannot be verified headlessly — flagged for the user, not skipped):** actual on-device rendering/feel of the native map (binary size, marker fidelity, heading-cone smoothness, cluster tap, touch in any portal layer). Every task here is verified by `tsc` + `bun test` + (Stage 5) `expo prebuild` config validation; the visual pass is the one remaining human gate.

---

## Decisions

| # | Decision | Why |
|---|---|---|
| E1 | **JS clustering via `supercluster`**, render clusters + leaves as `<Marker>` views | GL clustering (`GeoJSONSource cluster`) renders via GL layers and **cannot host view-based rich markers**; photo-balloon-at-scale in GL needs per-marker dynamic images (intractable). supercluster bounds on-screen markers to viewport clusters+leaves. `markersToFeatureCollection` (enriched) is supercluster's input. |
| E2 | **Rich markers = `<Marker>` children** (RN views mirroring the divIcon HTML) | True visual parity (cover photo, EP/pts/88 badges, tails, region dots, visited green, ✓ check, gold pin). |
| E3 | **Cluster aggregation via supercluster `map`/`reduce`** to carry a color tally | Lets a cluster bubble pick its dominant region color without an O(n) `getLeaves` per render. |
| E4 | **Custom user puck + heading cone Marker** driven by the `user` prop + `setHeading` state (delta-gated input) | Matches Leaflet's Google-blue pulse + 80px fan cone; avoids a second native GPS owner; `setHeading` becomes real (was a no-op). |
| E5 | **Viewport state (zoom+bbox) updated on `onRegionDidChange`, debounced 300ms** drives both clustering recompute and `onBoundsChange` | Clustering needs zoom; debounce keeps it off the per-frame path (Rule 9) and matches the hub's existing 300 ms bounds debounce. |
| E6 | **Hub keeps `map.tsx` unchanged**: route the engine flag *inside* `MapHost`, point `hostRef` at `<MapSurface>` with `<HubMapWebView>` as `leafletFallback` | `map.tsx` keeps calling `host.claim/update/recenter`; the leaflet path stays byte-verbatim until the flag flips (per the status doc's per-surface contract). |
| E7 | **`PilgrimageMapView` is deleted, not migrated** | Dead on render — only its `cityToColor` re-export is used (`plan.tsx`); repoint to `libs/services/pilgrimage/region-color`. |

---

## File Structure

**New (engine-neutral, tested):**
- `libs/services/pilgrimage/map-engine/hub-marker.ts` — re-homed `HubMapMarker` + `RegionBounds` types (out of `HubMapWebView`).
- `libs/services/pilgrimage/map-engine/marker-style.ts` — pure per-kind marker visual resolver (size/anchor/badge/visited/gold-88/dot-bubble).
- `libs/services/pilgrimage/map-engine/cluster-style.ts` — pure cluster visuals (radius curve, dot-vs-bubble, size buckets, "1.2k" label, dominant color).
- `libs/services/pilgrimage/map-engine/viewport.ts` — `regionToBBox`, `boundsToBBox`, cluster-leaves→BBox helpers.
- `libs/services/pilgrimage/map-engine/use-clustered-markers.ts` — supercluster hook: `(features, viewport) → { clusters, leaves }` + cluster expansion/leaves.

**New (engine render, smoke-tested):**
- `components/pilgrimage/map/engines/markers/NativeMapMarker.tsx` — per-kind rich `<Marker>` child view.
- `components/pilgrimage/map/engines/markers/ClusterBubble.tsx` — cluster dot/numbered bubble view.
- `components/pilgrimage/map/engines/markers/UserPuck.tsx` — pulse dot + heading cone.

**Modified:** `map-engine/types.ts` (+`inCollection`), `map-engine/normalize.ts` (import re-home + inCollection), `map-engine/feature-collection.ts` (enriched properties), `engines/MapLibreEngine.tsx` (full rewrite), `detail/SpotMapView.tsx` (forward focusSpot/offline, then collapse), `MapHost.tsx`→ wire then delete, `app/(tabs)/pilgrimage/map.tsx` (unchanged ideally), `app/(tabs)/pilgrimage/_layout.tsx`, `[animeId].tsx`, `plan.tsx`, `map-engine-prefs.ts`/`types.ts` (collapse `MapEngineId`), `MapSurface.tsx` (drop leaflet branch), `test-setup.ts` (if needed), `package.json`, `app.json`.

**Deleted:** `libs/services/pilgrimage/leaflet-map.ts`, `libs/services/pilgrimage/leaflet-assets.ts`, `components/pilgrimage/HubMapWebView.tsx`, `components/pilgrimage/MapHost.tsx`, `components/pilgrimage/PilgrimageMapView.tsx`, `scripts/bundle-leaflet.mjs`, tests `leaflet-map-theme.test.ts` + `hub-map-webview-source.test.ts`.

---

## Tasks (staged; each ends green + one commit)

### Stage 0 — Enrich the engine-neutral data model
- **T0.1** Re-home `HubMapMarker` (+ `RegionBounds`) into `map-engine/hub-marker.ts`; re-export from `HubMapWebView` for now; update `normalize.ts` import. Verify: `bun test __tests__/unit/pilgrimage/map-engine-normalize.test.ts` + `tsc`. Commit: `refactor(pilgrimage): re-home HubMapMarker + RegionBounds into map-engine types`
- **T0.2** Add `inCollection?: boolean` to `MapMarker`; thread through `hubMarkerToMapMarker`/`mapMarkerToHubMarker`; red-first test. Commit: `feat(pilgrimage): add inCollection to MapMarker and thread through normalize`
- **T0.3** Enrich `markersToFeatureCollection` properties → `{id,kind,color,visited,image,title,episode,pointsLength,eightyEightId,markerMode,inCollection,city}`; update `map-feature-collection.test.ts`. Commit: `feat(pilgrimage): enrich markersToFeatureCollection with render properties`

### Stage 1 — Pure marker/cluster/bounds helpers (ported from Leaflet, fully tested)
- **T1.1** `marker-style.ts`: `resolveMarkerVisual(marker, defaultMode)` → `{ shape:'balloon'|'dot'|'gold88', size:[w,h], anchor:[x,y], ringColor, badge?, visited, showCheck }`. Mirrors `SpotMapView`/`HubMapWebView` icon HTML (48×57 balloon, 18 dot, 36×45 gold). Commit: `feat(pilgrimage): pure marker-style helpers for native map rendering`
- **T1.2** `cluster-style.ts`: `clusterRadiusForZoom(z)` (65/50/38/28/22), `isDotCluster(z,n)` (`z<=8||n<10`), `clusterDotSize(n)` (12/16/20/24), `clusterBubbleSize(n)` (34/42/50), `formatClusterCount(n)` ("1.2k"), `dominantColor(tally)`. Commit: `feat(pilgrimage): pure cluster-style helpers (radius, size, label, color)`
- **T1.3** `viewport.ts`: `boundsToBBox([[w,s],[e,n]])`, `regionToBBox`, `leavesToBBox(features)`; reuse `shouldLoadPilgrimageMapBounds`. Commit: `feat(pilgrimage): viewport-to-bbox and cluster-bounds helpers`

### Stage 2 — MapLibreEngine feature parity
- **T2.1** `NativeMapMarker.tsx` + `ClusterBubble.tsx` + `UserPuck.tsx` from the pure helpers (themed colors). Smoke test: render tree shape per kind/visited/88/dot. Commit: `feat(pilgrimage): NativeMapMarker view for per-kind native markers`
- **T2.2** Add `supercluster` dep; `use-clustered-markers.ts` with `map`/`reduce` color tally + expansion/leaves. Tests on the hook's pure cluster math via the mock-free helpers. Commit: `feat(pilgrimage): supercluster hook for maplibre clusters and leaves`
- **T2.3** Rewrite `MapLibreEngine`: viewport state (debounced `onRegionDidChange`), render `<Marker>` clusters+leaves, `onMarkerPress` (leaf), `onPanned`. Smoke test it renders + emits. Commit: `feat(pilgrimage): per-kind markers and clustering in MapLibreEngine`
- **T2.4** `onBoundsChange` (debounced from viewport), multi-id `onClusterPress` (≤12 → resolve leaves→`MapMarker[]`; >12 → `fitBounds` to expansion), `fitBounds` handle. Commit: `feat(pilgrimage): bounds, multi-id cluster press, fitBounds in engine`
- **T2.5** Real `setHeading` cone (UserPuck rotation), `updateVisited` (state set), `offlineOnly` empty-state hook, `controlsBottomOffset` (attribution/logo offset), mode-aware style fallback. Commit: `feat(pilgrimage): heading cone, updateVisited, offlineOnly in engine`

### Stage 3 — Surface wiring (leaflet path stays byte-verbatim under `engine` guard)
- **T3.1** `SpotMapView` maplibre branch: forward `focusSpotId`→`focus`, keep offline/markerMode/cluster wired; verify leaflet branch unchanged. Commit: `feat(pilgrimage): forward focusSpot and offline state to SpotMapView engine`
- **T3.2** Route the engine flag **inside `MapHost`**: `<MapSurface engine leafletFallback={<HubMapWebView/>} leafletRef={…}>`, `hostRef`→MapSurface, `markers={config.markers.map(hubMarkerToMapMarker)}`; `map.tsx` untouched. Verify `host.claim/update/recenter` still drive both modes. Commit: `feat(pilgrimage): route engine flag inside MapHost onto MapSurface`
- **T3.3** Hub maplibre parity wiring: `onBoundsChange`→lazy loader, region `fitBounds`, `focusAnime`→`focus`, additive markers + replace, one-time user snap, locate FAB. Commit: `feat(pilgrimage): hub bounds lazy-load, region fly, focusAnime on maplibre`

### Stage 4 — Flip default + delete Leaflet
- **T4.1** `DEFAULT_MAP_ENGINE='maplibre'`; update `map-engine-prefs.test.ts`. Commit: `feat(pilgrimage): default map engine to maplibre`
- **T4.2** Delete `PilgrimageMapView.tsx`; repoint `plan.tsx` `cityToColor`→`region-color`. Commit: `refactor(pilgrimage): delete dead PilgrimageMapView, repoint cityToColor`
- **T4.3** Collapse `SpotMapView` to maplibre-only (drop WebView/`buildSpotMapHtml`/injects/leaflet imports). Commit: `refactor(pilgrimage): collapse SpotMapView to maplibre-only`
- **T4.4** Delete `MapHost.tsx` + `HubMapWebView.tsx`; unwrap `MapHostProvider` in `_layout.tsx`; hub renders `<MapSurface>` directly. Move re-homed types fully. Commit: `refactor(pilgrimage): remove leaflet hub (MapHost, HubMapWebView)`
- **T4.5** Delete `leaflet-map.ts` + `leaflet-assets.ts` + `scripts/bundle-leaflet.mjs`; drop `postinstall` leaflet cmd + `bundle:leaflet`; delete `leaflet-map-theme.test.ts` + `hub-map-webview-source.test.ts`. Commit: `chore(pilgrimage): delete leaflet-map, leaflet-assets, bundle script`
- **T4.6** Remove `leaflet`/`leaflet.markercluster` deps (+ `react-native-webview` iff no other consumer); collapse `MapEngineId`→`'maplibre'` (drop leaflet branch in `MapSurface`, `leafletFallback`/`leafletRef`, `isMapEngineId` leaflet); update prefs + tests. Commit: `chore(pilgrimage): drop leaflet deps and collapse MapEngineId`

### Stage 5 — Validate build + update specs
- **T5.1** `bunx tsc --noEmit`, `bun test`, lint; `grep -ri leaflet app components libs __tests__ scripts` → only intentional history. `npx expo prebuild --platform ios --no-install` to validate the MapLibre config plugin resolves (don't commit `ios/`). 
- **T5.2** Update both spec docs: mark migration complete, record the device-gated visual checklist. Commit: `docs(pilgrimage): mark maplibre migration complete, note device gate`

---

## Parity Coverage (every Leaflet feature → where reproduced)

| # | Leaflet feature | Reproduced by |
|---|---|---|
| Shared | ambient tile cache (cache-as-you-browse) | MapLibre **ambient cache** (automatic, source-agnostic) — spec D3 |
| Shared | offline banner / loading dismiss | engine offline empty-state (T2.5); ambient cache serves cached |
| Shared | OSM/CARTO→OFM attribution | MapLibre style's built-in attribution (OFM/OpenMapTiles) |
| Shared | light/dark tile swap in place | `styleUrl` prop + `resolveMapStyleUrl(mode)`; repaint on subscribe |
| Shared | cluster dot vs numbered bubble + sizes + radius curve + "1.2k" + dominant color | `cluster-style.ts` (T1.2) + `ClusterBubble` (T2.1) + supercluster (T2.2) |
| Shared | cluster tap: large→zoom, small→picker | T2.4 (`onClusterPress`/`fitBounds`) |
| Shared | userPanned on genuine drag only | `onRegionWillChange` userInteraction (kept) |
| Shared | recenter(animate) | handle `recenter` (kept, `easeTo`) |
| Shared | setHeading cone | **real** UserPuck cone (T2.5/E4) |
| Shared | user pulse dot | `UserPuck` (T2.1) |
| Shared | default centers/zooms | `center`/`zoom` props (kept) |
| Shared | controlsBottomOffset | T2.5 |
| Spot | bubble (photo+ring+tail+EP+region-dot) | `marker-style` + `NativeMapMarker` (T1.1/T2.1) |
| Spot | dot mode | same, `shape:'dot'` |
| Spot | visited green flip | `marker-style.visited` + `updateVisited` (T2.5) |
| Spot | light visited-only update | `updateVisited` sets a visited Set, no source rebuild (T2.5) |
| Spot | heading cone (compass) | T2.5 |
| Spot | offlineOnly | T2.5 (ambient + empty state) |
| Spot | in-WebView zoom +/- buttons | **native pinch** (MapLibre default) — buttons were a WebView affordance; parity via gesture |
| Spot | focusSpot pan | `focus` handle + forward `focusSpotId` (T3.1) |
| Spot | cluster→onClusterPick sheet | T2.4 + existing sheet |
| Hub | anime balloon + pts badge | `NativeMapMarker` kind `anime` (T2.1) |
| Hub | gold 88 pin + star + #id | `NativeMapMarker` kind `city88` (T2.1) |
| Hub | additive dedup + replace | engine renders from `markers` prop; hub passes merged list (T3.3) |
| Hub | no auto fit-all | engine never auto-fits; only via `fitBounds`/`focus` |
| Hub | one-time user snap | T3.3 |
| Hub | region flyToBounds (7 regions) | `fitBounds` (T3.3) |
| Hub | focusAnime | `focus` (T3.3) |
| Hub | bounds emit→lazy loader (gated) | `onBoundsChange` (T2.4) + existing `shouldLoadPilgrimageMapBounds` |
| Hub | animePress {id,is88,eightyEightId} | `onMarkerPress(marker)` → resolve via id (T3.3) |
| Hub | MapHost keep-alive | `MapHost` wraps `<MapSurface>` (T3.2); native view gets touches directly |
| Hub | locate FAB 3-state | unchanged hook → `host.recenter`/`host.setHeading` (T3.3) |
| Surface 2 | anime balloon / inCollection ✓ / popup / picker | **deleted** (dead on render, E7) — `inCollection` field still added for completeness |

---

## Verification
- Per task: red-first test → `bun test <file>` → `bunx tsc --noEmit`.
- Per stage: full `bun test` + `tsc --noEmit` green before commit.
- Stage 5: lint, repo-wide leaflet grep clean, `expo prebuild --no-install` config-plugin check.
- **Remaining human gate (device):** prebuild a dev client, run the app, confirm each surface renders + the 6-point feel checklist (markers/visited/heading/cluster tap/bounds-lazy-load/touch). Reverting the Stage-4 deletion commits restores Leaflet if the device pass fails.

---

## Outcome (2026-06-01) — DONE

**Leaflet is fully removed; MapLibre is the single engine.** Landed in 17 staged commits (`5ea4fb1..HEAD`), each `bunx tsc --noEmit` + `bun test` green. The migration adds **zero** new test failures across the full 1210-test suite (the only 4 failures — `AnitabiService` PILG-005..008 — are **pre-existing on the baseline `5ea4fb1`**, unrelated to maps).

### What landed
- **Engine:** `MapLibreEngine` rewritten from placeholder circles to full parity — per-kind `<Marker>` views (`NativeMapMarker`: anime balloon + pts badge, gold Tourism-88 pin + star + #id, spot bubble/dot + EP badge + visited green), JS clustering via **supercluster** (`ClusterBubble` dot/numbered, dominant-colour, "1.2k"), `UserPuck` pulse + heading cone, `onBoundsChange` (debounced 300 ms), multi-id `onClusterPress` (small→picker, large→fit), `fitBounds`, `updateVisited`, real `setHeading`, `controlsBottomOffset`. Parity *logic* extracted into unit-tested pure modules (`marker-style`, `cluster-style`, `viewport`, `use-clustered-markers`) — 35 new map tests.
- **Surfaces:** `SpotMapView` collapsed to maplibre-only (750→~230 LOC). Hub wired via `MapHost` → `MapSurface` with `map.tsx` **unchanged** (still drives `host.claim/update/recenter/setHeading`); `MapHost` retained as the warm keep-alive wrapper (now holds a native map, not a WebView).
- **Deletions:** `leaflet-map.ts`, `leaflet-assets.ts` (198 KB generated), `HubMapWebView.tsx`, `PilgrimageMapView.tsx` (dead), `MapHost` leaflet path, `delegating-handle.ts`, `map-engine-prefs.ts`, `scripts/bundle-leaflet.mjs` + postinstall/`bundle:leaflet` entries, `MapEngineId`/engine flag, and the `leaflet`/`leaflet.markercluster`/`react-native-webview` deps. `MapSurface` collapsed to a thin pass-through.

### Scope refinements made during execution (vs the plan above)
- **T0.2/T0.3 dropped:** the data model + `byId` leaf-resolution were already sufficient — no `inCollection` field, no enriched GeoJSON properties needed.
- **`MapHost` kept** (collapsed to maplibre-only) instead of deleted, so `map.tsx`/`_layout.tsx` stay unchanged and warm re-entry is preserved.
- **`offlineOnly`** is accepted but documents-only (ambient cache covers cache-as-you-browse parity; explicit cache-only / `createPack` is the reserved P3 work).

### Device-gated remainder (the one human step — cannot be verified headlessly)
Prebuild a dev client and eyeball each surface: marker fidelity, visited flips, heading-cone feel, cluster dot↔numbered + tap, hub bounds-lazy-load + region fly + touch in the portal layer, binary-size delta. `git revert` of the Stage-4 deletion commits restores Leaflet if the device pass regresses. Also confirm the OFM style slugs (`positron`/`dark`) against OFM's live catalog (D7 override needs no release).

### Known minor gaps / notes
- **Hub one-time auto-snap-to-user** on first GPS fix (old WebView behaviour) not replicated — the locate FAB covers user-centring; left out to avoid an untestable camera-moving effect.
- **Clustering** uses one supercluster pixel radius (≈ Leaflet's mid-zoom 38–50 band) rather than Leaflet's per-zoom curve — dot/numbered visuals + tap behaviour match; clustering geometry is approximate (supercluster builds all zooms from one radius).
- **Repo-wide `bun run lint` fails on pre-existing issues** (the gitignored generated `ios/` dir is linted + widespread pre-existing prettier dirt in app files) — *unrelated to this migration*. The migration's own files are `tsc`-clean, `bun test`-green, eslint-error-free, and prettier-clean.
- A few **explanatory comments** still say "Leaflet"/"WebView": provenance comments ("ported from the Leaflet `__makeClusterGroup`") are accurate and kept; a handful of stale terminology comments in pre-existing prettier-dirty files (`map.tsx`, `_layout.tsx`, `MapHost` type docs) were left to avoid reformatting those whole files.
- **GPX (P5), 導覽 (P6), `createPack` offline UX (P3), Phase-2 Worker+R2 (P7)** remain reserved (net-new, not Leaflet parity).
