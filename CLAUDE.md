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

## Anti-patterns I've seen — don't repeat these

- **`color: '#FFFFFF'` on `backgroundColor: theme.accent`** → invisible on light accents. Use `ThemedButton` or `readableTextOn()`.
- **`flex: 1` on a button inside a column-direction parent** → button stretches to fill the whole remaining height. Use `fullWidth` (which uses `alignSelf: 'stretch'`).
- **Per-screen `const BG = '#0A0A0A'; const SURFACE = '#1A1A1A'`** → screen ignores the theme. Use `theme.background.primary` / `theme.background.secondary`.
- **Reinventing `PrimaryButton` / `SecondaryButton` per file** → drifting padding/radius/contrast. Use `ThemedButton`.
- **Inline `<Text style={{ fontSize: 17, fontWeight: '600' }}>`** → off our Typography scale. Use `<ThemedText variant="titleLarge">` or spread `Typography.titleLarge`.
- **`shadowColor: '#000'` written in 14 places** → use `Shadow.subtle / .medium / .heavy` from `DesignSystem`, or `Shadow.glow(theme.accent)` for branded glow.

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

## When in doubt

Open `app/onboarding.tsx`. It's the canonical example of theme-correct buttons (single hero CTA, two-button row, loading state, secondary action). Mirror its shape.
