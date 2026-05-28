# Aniseekr (Expo) — Repository Guide for Claude

Anime tracking app built with Expo Router + React Native. Local-first storage, multi-source data (AniList / MyAnimeList / Bangumi / Kitsu), pilgrimage map, rating UX.

## Project layout

| Path | Purpose |
|------|---------|
| `app/` | Screens (Expo Router file-based routing). `(rate)`, `(setting)` are stacks. |
| `components/themed/` | **Theme-aware primitives. Default to these for new UI.** |
| `components/common/` | Older shared components (`GlassButton`, `EmptyStateView`, `AniCard`, …) — kept for backwards compat, prefer `themed/` for new work. |
| `components/<feature>/` | Feature-scoped components (`bangumi/`, `collection/`, `pilgrimage/`, `rate/`, `settings/`). |
| `context/ThemeContext.tsx` | Single source of truth for theme palette, mode, custom accent, tint intensity, contrast. |
| `constants/DesignSystem.ts` | `Colors`, `Spacing`, `Radius`, `Typography`, `IconSize`, `Size`, `Shadow`. Static tokens. |
| `libs/services/` | Data layer (data sources, cache, user prefs, onboarding). |
| `libs/i18n/` | JSON catalogs (`locales/*.json`) + curated dictionaries (`data/genres.json`). `useT()` → fixed UI strings. `useTranslatedGenre()` / `<TranslatedText>` → anime data. See `libs/i18n/README.md`. |
| `modules/haptics/hapticsBridge.ts` | Haptic feedback bridge. |
| `__tests__/unit/` | Bun unit tests. Run with `bun test`. |

## Theme system — how it works

`useTheme()` returns:

```ts
{
  theme: ThemePalette   // accent, accentLight, accentDark, secondary,
                        // background.{primary,secondary,tertiary},
                        // text.{primary,secondary,tertiary},
                        // glassBorder, gradient
  themeId: ThemeId      // 'aniseeker' | 'cyberpunk' | 'midnight' | 'forest' |
                        //  'ocean' | 'attackOnTitan' | 'sunset' | 'candy'
  themeMode: 'light' | 'dark' | 'auto'
  tintIntensity: 'subtle' | 'balanced' | 'vivid'
  increaseContrast: boolean
  customAccent: string | null     // user-picked override
  setTheme / setThemeMode / setCustomAccent / setTintIntensity / setIncreaseContrast
  recentAccents, hydrated, themes
}
```

The resolved `theme.accent` already accounts for `customAccent` and `tintIntensity`. Never re-implement that logic.

## Mandatory rules — read before writing UI code

These rules exist because we had real bugs (invisible button labels on light accents, button-size whiplash between onboarding steps, four reinvented `PrimaryButton`s drifting apart). Skip them and you reintroduce those bugs.

### 1. Buttons → `ThemedButton` / `ThemedIconButton`

```tsx
import { ThemedButton, ThemedIconButton } from '@/components/themed';
// (or relative path: '../components/themed')

<ThemedButton label="Continue" onPress={next} size="lg" fullWidth />
<ThemedButton variant="secondary" label="Maybe later" onPress={skip} />
<ThemedButton variant="destructive" label="Delete" onPress={remove} />
<ThemedButton variant="ghost" label="Skip" onPress={skipAll} />

<ThemedIconButton
  accessibilityLabel="Close"
  icon={(c) => <Ionicons name="close" size={18} color={c} />}
  onPress={close}
/>
```

**Do not write a new `PrimaryButton` / `CtaButton` / `ActionButton` per screen.** Extend `ThemedButton` if you genuinely need a new variant — but talk that through before adding it.

#### Sizing

- `sm` (36 min-height) — chips, inline actions.
- `md` (44 min-height, default) — meets iOS HIG / Material touch target.
- `lg` (52 min-height) — hero CTAs, onboarding "Continue", paywall.

#### Stretching

- `fullWidth` uses `alignSelf: 'stretch'` so the button takes width but **never grows in height**. That is the fix for the onboarding bug where `flex: 1` on a single button made it fill the screen.
- For two side-by-side buttons in a row, wrap each in `<View style={{ flex: 1 }}>` and pass `fullWidth` on the inner `ThemedButton`. See `app/onboarding.tsx` `NotificationsStep` for the canonical example.

#### Text color on accent backgrounds — **never hardcode**

`ThemedButton` calls `readableTextOn(accent)` to pick white vs. near-black. When the user sets a light accent (gold, pale cyan), white text would be invisible (contrast as low as 1.07:1). The helper enforces WCAG AA-large (3:1) and flips to dark text when white falls below.

If you really need to label something on top of an accent fill yourself (e.g. badge, chip):

```ts
import { readableTextOn } from '@/components/themed';
const fg = readableTextOn(theme.accent);
```

### 2. Text → `ThemedText` (or Typography tokens)

```tsx
<ThemedText variant="headlineLarge">Discover</ThemedText>
<ThemedText variant="bodyMedium" tone="secondary">Local-first.</ThemedText>
<ThemedText variant="caption" tone="error">Failed to sync.</ThemedText>
```

If `ThemedText` is overkill (you're already inside a styled component), import `Typography` from `constants/DesignSystem` and spread it. **Never** use raw `fontSize: 14, fontWeight: '600'` — that bypasses our scale and breaks future Dynamic Type support.

### 3. Surfaces / cards → `ThemedSurface` (or theme tokens)

```tsx
<ThemedSurface variant="card" padded>
  <ThemedText>…</ThemedText>
</ThemedSurface>

<ThemedSurface variant="elevated" /> // sheets / modals
<ThemedSurface variant="outlined" />  // empty borders
```

If you must inline: `{ backgroundColor: theme.background.secondary, borderColor: theme.glassBorder, borderWidth: 1 }`.

### 4. Colors come from `useTheme()`, never hardcoded hex

| ❌ Don't | ✅ Do |
|---------|------|
| `color: '#FFFFFF'` | `color: theme.text.primary` (or `<ThemedText />`) |
| `backgroundColor: '#1A1A1A'` | `backgroundColor: theme.background.secondary` |
| `borderColor: '#2A2A2A'` | `borderColor: theme.glassBorder` |
| `backgroundColor: '#FF9F0A'` | `backgroundColor: theme.accent` |

Hex literals are allowed only for:
- Brand source colors that ship with our `THEMES` constants in `ThemeContext.tsx`.
- Third-party platform brand colors (e.g. `PLATFORM_CONFIGS[p].color`).
- The two universal text colors in `components/themed/contrast.ts` (`ON_DARK`, `ON_LIGHT`).

Adding a new screen-local `const BG = '#0A0A0A'` is the anti-pattern. Use the theme instead — your screen needs to react when the user changes accent / mode.

### 5. Don't break `themeMode` / `tintIntensity` / `increaseContrast`

`ThemeContext` already wires these three knobs into `resolvedTheme`. If you derive colors yourself, derive them from `theme.*` so the user's choice propagates. Don't bypass with `THEMES.aniseeker.text.primary` etc.

### 6. Touch targets

Minimum `44 × 44` (iOS HIG / WCAG 2.5.5). `ThemedButton size="md"` already meets this; if you build a custom hit area, use `Size.minTouchTarget = 44` from `DesignSystem`.

### 7. Haptics

Use `hapticsBridge` (`selection` for choices, `tap` for navigation, `success` for finalizing, `warning` for risky). `ThemedButton` calls the right one by default — only override `haptic="…"` when you have a specific reason.

### 8. No fake data — ever

Anything that looks like real, computed, scene-specific, user-specific, or source-of-truth data **must come from a real source**. If the real source isn't available, the UI shows a real loading or error state — never a plausible-looking placeholder.

This rule exists because we shipped (and then ripped out) `fallbackAnalysisFromUrl()` — a function that hashed an image URL into "plausible" RGB averages so the tiles always rendered something. The tiles looked correct and were completely meaningless. We also hardcoded `K-On! S2 EP{ep}` and `修学院駅の夕暮れ — 唯と憂が電車を待つ印象的なシーン` into a generic pilgrimage tips screen, so every spot in every anime claimed to be K-On Episode 2. Both are the same bug: **content that pretends to know something it doesn't**.

Specifically forbidden:

- ❌ **Hash/seed/random → plausible-looking numbers** (`fallbackAnalysisFromUrl` style). If analysis fails, return `null` and render an error tile (`'無法分析'` / `'Image unavailable'`).
- ❌ **Hardcoded scene-specific strings** in screens that render for any scene (e.g. anime title, episode caption, station name, character dialogue) unless they come from the route params or a real data source. If you only have a fallback, make it generic ("原作場景", not "K-On! EP2").
- ❌ **Mock arrays committed to production code paths** (`const SAMPLE_SPOTS = [...]`). Mocks live in `__tests__/` or behind a dev flag, never on the render path.
- ❌ **Lorem ipsum / placeholder copy** shipped in production screens. Either pass the real string via props or render an empty state.
- ❌ **Fake counters, stats, ratings, distances, dates** computed from anything other than the actual data (`Math.random()`, `Date.now() % 5`, "popular" rankings with no source).
- ❌ **Screen-specific "data" hidden in JSX** (e.g. `Avoid weekends 14:00–16:00` written inline as if we know peak hours for this spot — we don't). Either drive it from real data or make it generic guidance.

The three real states for any data-driven component:

| State | What to render |
|-------|----------------|
| `loading` | Skeleton / "分析中…" / spinner — clearly transient |
| `ready` | The real computed value |
| `error` / `null` | "無法分析" / "Unavailable" — clearly *no data*, not a guess |

When in doubt, ask: "would a screenshot of this screen mislead the user about what we actually know?" If yes, it's fake data.

Generic guidance is fine (rule of thirds, "use eye-level for portraits", "avoid flash indoors") — that's photography knowledge, not pretending to be scene-specific data. The line is: **does it claim to know something specific about this scene/user/spot?** If yes, it must be real.

### 9. State ownership → keep render state small and local

React state is for values that must change rendered JSX. Do **not** put every interaction, sensor tick, gesture value, cache snapshot, and async phase into the screen root. Large screens with many independent `useState` / `useEffect` calls become hard to reason about and can re-render expensive children unnecessarily.

Use the narrowest owner for each kind of state:

| State kind | Default owner |
|------------|---------------|
| Gesture / animation / sensor ticks | Reanimated `SharedValue` or a ref-backed subscription, with throttled React mirrors only when text/chips must update |
| Imperative handles, in-flight flags not rendered, cancellation tokens | `useRef` |
| Derived values from props/state | `useMemo` or plain local constants, not mirrored `useState` |
| Persisted preferences / cross-screen data | Feature service/store hook with a small public API |
| Modal, selected tab, current filter | Local state in the smallest component that renders that control |
| Large async resource (`data/loading/error`) | One reducer or feature hook, not three unrelated setters spread through the screen |

For camera and map screens specifically:

- High-frequency values (`zoom`, `tilt`, heading, pan/drag, WebView marker updates) must stay off the React render path unless the UI needs a coarse display value.
- The route screen should orchestrate navigation and feature hooks; it should not own every HUD toggle, capture phase, settings sheet, spot switcher, and sensor state directly.
- If adding a new camera control requires another top-level `useState` in `compare/[spotId].tsx`, first ask whether it belongs in `useCameraSettings`, a camera HUD hook, a child component, a `SharedValue`, or a reducer.
- Avoid effects whose only job is to reconcile state that could have been derived. If reconciliation is necessary, keep it close to the state it fixes and guard against redundant setter calls.
- Before optimizing, profile or at least count render-triggering state changes. Fix the state with the largest render fan-out, not the state that is merely visually nearby.

### 10. Navigation feel → never `await` on the first-paint path

Skeletons are for **cold** loads only. If a skeleton flashes when the data is already local, that's a bug. Background: detail screens used `setLoading(true)` + `await CacheService.get()` on mount, so even 5-second-old cache hits showed a skeleton for ~200ms. Discord's "Supercharging Discord Mobile" is the reference.

**Budget**: tap → first frame must do <16ms of JS and show real chrome (header, poster, title), not a skeleton.

**Rules**:

1. **Sync cache on the render path.** `CacheService.getSync<T>(key)` returns the in-memory mirror or `null` — call it inside `useState(() => …)` so initial state is non-null on warm hits. `await CacheService.get()` belongs only in background revalidation. Render shape: `data ?? <Skeleton/>`, not `loading ? <Skeleton/> : data`.
2. **Route params carry chrome.** List → detail must pass `{ id, title, poster, format?, year? }` via `router.push({ pathname, params })`. The detail screen reads them from `useLocalSearchParams()` and paints the hero on frame 1, before any I/O resolves.
3. **`useFocusEffect` is a refresh trigger, not a load trigger.** Guard with `lastLoadedKey === currentKey` and skip; if you must revalidate, do it silently — never clear state and re-show a skeleton.
4. **Don't wrap I/O in `InteractionManager.runAfterInteractions`.** That defers the network call itself, so cache hits also wait for the push animation. Defer the *expensive child state setter* via `requestAnimationFrame`, never the fetch.
5. **Stale-while-revalidate via `getWithMeta(key, graceMs)`** — render stale, refresh silently. Only surface a "refreshing…" affordance after ~500ms.
6. **Prefetch on press-in or onViewableItemsChanged**, not on mount of the next screen. Kick off `AnimeRepository.getAnimeDetails(id)` + `Image.prefetch(poster)` from the list.
7. **Don't add `unmountOnBlur` / new top-level Context providers.** Tabs staying mounted is the feature, not the bug. New cross-screen state goes in a feature store with selector subscription.

**Checklist for any new/touched screen**:

- [ ] Cache hit → frame 1 shows real chrome, not skeleton
- [ ] Tab re-focus with snapshot → no visible reload
- [ ] Zero `await`s between mount and first paint
- [ ] `loading` initial value derives from sync cache miss, not `true`
- [ ] List that links here calls prefetch on press-in

### 11. UI strings → `useT()`. Anime data → `<TranslatedText>` / `translateGenre` / etc. No raw English in JSX.

User-facing strings come from `libs/i18n`. Two distinct surfaces:

**(a) Fixed UI chrome** — `useT()` returns `t(key)` against the JSON catalog:

```tsx
import { useT } from '@/libs/i18n';

function Screen() {
  const t = useT();
  return <Text>{t('settings.title')}</Text>;
}
```

- **Add new keys to `libs/i18n/locales/en.json` first.** TypeScript infers `TranslationKey` from `typeof en.json` automatically — no codegen, no `postinstall`. `t('typo')` is a compile error.
- Translate in `zh-Hant.json` (primary Chinese). `zh-Hans.json` auto-falls-back via OpenCC, only override there when vocabulary actually differs (影片 vs 视频).
- `ja.json` / `ko.json` are partial — missing keys fall back to English with a dev warning.
- For tab / stack titles, call `useT()` inside the layout component and pass `t('...')` into `options.title`.

**(b) Anime data** (titles, genres, tags, synopsis) — value comes from an API at runtime, not a fixed catalog. Use the runtime translator + `<TranslatedText>`:

```tsx
import { TranslatedText } from '@/components/themed';
import { useTranslatedGenre } from '@/libs/i18n/data-translator';

function GenreChip({ genre }: { genre: string }) {
  const { value, source } = useTranslatedGenre(genre);  // 'Action' → '動作'
  return <TranslatedText original={genre} translated={value} source={source} variant="caption" />;
}
```

`<TranslatedText>` renders the translation, optionally renders the original underneath (long-press to toggle, or always-on via Settings → Language), and shows a `machine-translated` badge when `source === 'mt'`. The four sources are `'native' | 'curated' | 'mt' | 'original'` — never lie about which is which.

**Don't**:
- Write `<Text>Continue</Text>` in a new screen, or pass an English literal into `ThemedButton label="…"`. Route through `t()`.
- Translate brand names (`Aniseekr`, `AniList`, `Bangumi`, `MAL`) or anime titles.
- Render a translated value without `<TranslatedText>` when the user might want to verify the original (anything from `data-translator`).
- Add a new locale's `.json` file without registering it in `engine.ts`'s `LANGUAGES` map.

The parity test (`__tests__/unit/i18n.test.ts`) fails the build when a locale has stale or mis-shaped keys.

## Anti-patterns I've seen — don't repeat these

- **`color: '#FFFFFF'` on `backgroundColor: theme.accent`** → invisible on light accents. Use `ThemedButton` or `readableTextOn()`.
- **`flex: 1` on a button inside a column-direction parent** → button stretches to fill the whole remaining height. Use `fullWidth` (which uses `alignSelf: 'stretch'`).
- **Per-screen `const BG = '#0A0A0A'; const SURFACE = '#1A1A1A'`** → screen ignores the theme. Use `theme.background.primary` / `theme.background.secondary`.
- **Reinventing `PrimaryButton` / `SecondaryButton` per file** → drifting padding/radius/contrast. Use `ThemedButton`.
- **Inline `<Text style={{ fontSize: 17, fontWeight: '600' }}>`** → off our Typography scale. Use `<ThemedText variant="titleLarge">` or spread `Typography.titleLarge`.
- **`shadowColor: '#000'` written in 14 places** → use `Shadow.subtle / .medium / .heavy` from `DesignSystem`, or `Shadow.glow(theme.accent)` for branded glow.
- **Hash-seeded "plausible" placeholders** (`fallbackAnalysisFromUrl` style) → returns numbers that look computed but aren't. See Rule 8. Return `null` and render an error state.
- **Hardcoded scene/anime captions in generic screens** (`K-On! S2 EP{ep}` in `compare/tips.tsx`) → every spot ends up labelled with the same anime. See Rule 8.
- **Top-level screen as a state dumping ground** (`20+ useState` plus many effects in one route file) → every small UI change risks re-rendering the whole screen. Split feature hooks/components or use a reducer/store.
- **Mirroring derived data into state** (`filtered`, `selected`, `ready` values that can be computed from existing inputs) → extra effects, stale closures, and redundant renders. Derive it unless an async boundary truly owns it.
- **Sensor/gesture/WebView updates through React state at live frequency** → JS-thread churn and jank. Use `SharedValue`, refs, throttling, or bridge commands.
- **Raw English in `label="…"` / `<Text>...</Text>`** → screen never gets localized; the user's App language pick has no effect. Use `t('key')` from `useT()`. See Rule 11.
- **`setLoading(true)` + `await CacheService.get()` on mount** → skeleton flashes on warm hits. Use `CacheService.getSync()` to seed `useState`. See Rule 10.
- **`useFocusEffect` that unconditionally refetches** → tab switch feels cold. Guard with `lastLoadedKey`. See Rule 10.
- **`InteractionManager.runAfterInteractions` around a fetch** → cache hits wait for the push animation. Defer the state setter, not the I/O. See Rule 10.
- **Detail screen that ignores route params** → list already has `title`/`poster`; pass them via params so frame 1 isn't blank. See Rule 10.
- **New top-level Context for two-screen state** → re-renders the whole tree. Use a feature store + selector. See Rule 10.

## Workflow

```bash
bun install                       # install deps
bun test                          # run unit tests
bun test __tests__/unit/foo.test.ts  # single file
bunx tsc --noEmit                 # type check (no emit)
```

When changing `components/themed/*`, add or update tests under `__tests__/unit/themed-*.test.ts`. The contrast math has tests pinned to specific hex values — update both if you change the algorithm.

## Where to look when something feels off

| Symptom | First place to check |
|---------|---------------------|
| Button label invisible | `readableTextOn` in `components/themed/contrast.ts`; verify ThemedButton is used |
| Button size differs between screens | Caller is probably using raw `Pressable` instead of `ThemedButton`, or wrapping with `flex: 1` instead of `fullWidth` |
| Color doesn't update when theme changes | Hardcoded hex somewhere; switch to `useTheme()` |
| Accent picker has no effect on a screen | Screen used a hardcoded color instead of `theme.accent` |
| Theme mode toggle doesn't change a screen | `resolvedTheme` in `ThemeContext.tsx` currently doesn't switch surface palette for light mode — that work is open. Don't fake light mode with hardcoded hex; extend `resolvedTheme` instead. |
| Screen feels janky after a small control changes | Count top-level `useState` / `useEffect`; move hot state into a child hook, reducer, ref, or `SharedValue` |
| Camera/map gestures feel delayed | Check that zoom, tilt, heading, pan, and marker updates are not flowing through root React state every tick |
| Skeleton flashes on a warm screen | Seed `useState` with `CacheService.getSync()`. See Rule 10. |
| ~200ms blank between list tap and detail | Pass `{ id, title, poster }` via route params; prefetch on press-in. See Rule 10. |
| Tab switch re-runs the skeleton dance | `useFocusEffect` needs a `lastLoadedKey` guard. See Rule 10. |

## When in doubt

Open `app/onboarding.tsx`. It's the canonical example of theme-correct buttons (single hero CTA, two-button row, loading state, secondary action). Mirror its shape.
