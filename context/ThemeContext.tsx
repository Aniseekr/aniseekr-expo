import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { kvGet, kvSet } from '../libs/services/storage/app-storage';
import {
  THEME_CUSTOM_ACCENT_KEY,
  THEME_ID_KEY,
  THEME_INCREASE_CONTRAST_KEY,
  THEME_MODE_KEY,
  THEME_RECENT_ACCENTS_KEY,
  THEME_TINT_INTENSITY_KEY,
} from '../libs/services/storage/keys';

const MAX_RECENT_ACCENTS = 6;

export type ThemeMode = 'light' | 'dark' | 'auto';
export type TintIntensity = 'subtle' | 'balanced' | 'vivid';
export const TINT_INTENSITY_VALUES: Record<TintIntensity, number> = {
  subtle: 0.25,
  balanced: 0.5,
  vivid: 0.85,
};

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

export function normalizeHex(input: string): string | null {
  if (!input) return null;
  let s = input.trim();
  if (!s.startsWith('#')) s = `#${s}`;
  if (s.length === 4) {
    // expand #abc -> #aabbcc
    s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  return HEX_RE.test(s) ? s.toUpperCase() : null;
}

function adjustHex(hex: string, percent: number): string {
  const m = HEX_RE.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 0xff;
  const g = (v >> 8) & 0xff;
  const b = v & 0xff;
  const f = percent / 100;
  const adj = (c: number) => (f >= 0 ? c + (255 - c) * f : c + c * f);
  const toHex = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0');
  return `#${toHex(adj(r))}${toHex(adj(g))}${toHex(adj(b))}`.toUpperCase();
}

export interface AccentPreset {
  name: string;
  hex: string;
}
export const ACCENT_PRESETS: AccentPreset[] = [
  { name: 'Orange', hex: '#FF9900' },
  { name: 'Red', hex: '#FF3B30' },
  { name: 'Gold', hex: '#FFD700' },
  { name: 'Green', hex: '#32D74B' },
  { name: 'Cyan', hex: '#00BCD4' },
  { name: 'Blue', hex: '#007AFF' },
  { name: 'Purple', hex: '#AF52DE' },
  { name: 'Pink', hex: '#E8A0BF' },
];

export interface AccentGradient {
  id: 'sunset' | 'ocean' | 'bloom';
  name: string;
  subtitle: string;
  colors: [string, string];
}
export const ACCENT_GRADIENTS: AccentGradient[] = [
  { id: 'sunset', name: 'Sunset', subtitle: 'Orange → Red', colors: ['#FF9900', '#FF3B30'] },
  { id: 'ocean', name: 'Ocean', subtitle: 'Cyan → Blue', colors: ['#00BCD4', '#007AFF'] },
  { id: 'bloom', name: 'Bloom', subtitle: 'Purple → Pink', colors: ['#AF52DE', '#E8A0BF'] },
];

export type ThemeId =
  | 'aniseeker'
  | 'cyberpunk'
  | 'midnight'
  | 'forest'
  | 'ocean'
  | 'attackOnTitan'
  | 'sunset'
  | 'candy';

export interface ThemeStatus {
  success: string;
  warning: string;
  error: string;
  info: string;
}

export interface ThemePalette {
  id: ThemeId;
  name: string;
  isPremium?: boolean;
  accent: string;
  accentLight: string;
  accentDark: string;
  secondary: string;
  background: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  glassBorder: string;
  gradient: [string, string, ...string[]];
  status: ThemeStatus;
}

// System-level semantic colors. Themes inherit these unless they override —
// shipped as a single source so ThemedText/Button can read theme.status.error
// instead of hardcoding hex per call site.
const DEFAULT_STATUS: ThemeStatus = {
  success: '#30D158',
  warning: '#FF9F0A',
  error: '#FF453A',
  info: '#0A84FF',
};

export const THEMES: Record<ThemeId, ThemePalette> = {
  aniseeker: {
    id: 'aniseeker',
    name: 'Aniseekr',
    accent: '#FF9F0A',
    accentLight: '#FFB340',
    accentDark: '#E08E09',
    secondary: '#BF5AF2',
    background: {
      primary: '#080808',
      secondary: '#1C1C1E',
      tertiary: '#2C2C2E',
    },
    text: {
      primary: '#FFFFFF',
      secondary: 'rgba(235, 235, 245, 0.6)',
      tertiary: 'rgba(235, 235, 245, 0.3)',
    },
    glassBorder: 'rgba(255, 255, 255, 0.10)',
    gradient: ['#0F0F10', '#1C1C1E', '#0F0F10'],
    status: DEFAULT_STATUS,
  },
  cyberpunk: {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    isPremium: true,
    accent: '#FF2A6D',
    accentLight: '#FF6BA0',
    accentDark: '#D81E5B',
    secondary: '#05D9E8',
    background: {
      primary: '#0A0014',
      secondary: '#150024',
      tertiary: '#1F0033',
    },
    text: {
      primary: '#FFFFFF',
      secondary: 'rgba(231, 198, 255, 0.7)',
      tertiary: 'rgba(231, 198, 255, 0.4)',
    },
    glassBorder: 'rgba(255, 42, 109, 0.18)',
    gradient: ['#0A0014', '#150024', '#0A0014'],
    status: { ...DEFAULT_STATUS, info: '#05D9E8' },
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    accent: '#5E5CE6',
    accentLight: '#7D7CFF',
    accentDark: '#4845B3',
    secondary: '#64D2FF',
    background: {
      primary: '#070712',
      secondary: '#101025',
      tertiary: '#1A1A33',
    },
    text: {
      primary: '#FFFFFF',
      secondary: 'rgba(220, 220, 240, 0.65)',
      tertiary: 'rgba(220, 220, 240, 0.35)',
    },
    glassBorder: 'rgba(94, 92, 230, 0.18)',
    gradient: ['#070712', '#101025', '#070712'],
    status: { ...DEFAULT_STATUS, info: '#64D2FF' },
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    accent: '#10B981',
    accentLight: '#34D399',
    accentDark: '#059669',
    secondary: '#A3E635',
    background: {
      primary: '#06120A',
      secondary: '#0E2018',
      tertiary: '#143025',
    },
    text: {
      primary: '#FFFFFF',
      secondary: 'rgba(220, 245, 230, 0.65)',
      tertiary: 'rgba(220, 245, 230, 0.35)',
    },
    glassBorder: 'rgba(16, 185, 129, 0.18)',
    gradient: ['#06120A', '#0E2018', '#06120A'],
    status: DEFAULT_STATUS,
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    accent: '#06B6D4',
    accentLight: '#67E8F9',
    accentDark: '#0891B2',
    secondary: '#8B5CF6',
    background: {
      primary: '#04101A',
      secondary: '#0A1F30',
      tertiary: '#0F2D44',
    },
    text: {
      primary: '#FFFFFF',
      secondary: 'rgba(220, 240, 255, 0.65)',
      tertiary: 'rgba(220, 240, 255, 0.35)',
    },
    glassBorder: 'rgba(6, 182, 212, 0.18)',
    gradient: ['#04101A', '#0A1F30', '#04101A'],
    status: DEFAULT_STATUS,
  },
  attackOnTitan: {
    id: 'attackOnTitan',
    name: 'Survey Corps',
    isPremium: true,
    accent: '#8B4513',
    accentLight: '#C68642',
    accentDark: '#5D2E0E',
    secondary: '#A8B5A0',
    background: {
      primary: '#0E0A06',
      secondary: '#1A130C',
      tertiary: '#241B11',
    },
    text: {
      primary: '#F5E6D3',
      secondary: 'rgba(245, 230, 211, 0.65)',
      tertiary: 'rgba(245, 230, 211, 0.35)',
    },
    glassBorder: 'rgba(198, 134, 66, 0.20)',
    gradient: ['#0E0A06', '#1A130C', '#0E0A06'],
    status: DEFAULT_STATUS,
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    accent: '#FB923C',
    accentLight: '#FDBA74',
    accentDark: '#EA580C',
    secondary: '#EC4899',
    background: {
      primary: '#180A06',
      secondary: '#28140C',
      tertiary: '#3A1D11',
    },
    text: {
      primary: '#FFFFFF',
      secondary: 'rgba(255, 230, 215, 0.65)',
      tertiary: 'rgba(255, 230, 215, 0.35)',
    },
    glassBorder: 'rgba(251, 146, 60, 0.20)',
    gradient: ['#180A06', '#28140C', '#180A06'],
    status: DEFAULT_STATUS,
  },
  candy: {
    id: 'candy',
    name: 'Candy',
    accent: '#F472B6',
    accentLight: '#F9A8D4',
    accentDark: '#DB2777',
    secondary: '#A78BFA',
    background: {
      primary: '#180614',
      secondary: '#26092A',
      tertiary: '#36103D',
    },
    text: {
      primary: '#FFFFFF',
      secondary: 'rgba(255, 220, 240, 0.65)',
      tertiary: 'rgba(255, 220, 240, 0.35)',
    },
    glassBorder: 'rgba(244, 114, 182, 0.20)',
    gradient: ['#180614', '#26092A', '#180614'],
    status: DEFAULT_STATUS,
  },
};

export const THEME_LIST: ThemePalette[] = Object.values(THEMES);

// Light-mode surfaces per theme — accent / accentLight / accentDark / secondary
// / status stay shared with the dark palette, so the theme still has a single
// identity. Only background / text / glassBorder / gradient swap.
interface SurfacePalette {
  background: ThemePalette['background'];
  text: ThemePalette['text'];
  glassBorder: string;
  gradient: ThemePalette['gradient'];
}

const LIGHT_TEXT_NEUTRAL = {
  primary: '#0E0E12',
  secondary: 'rgba(15,15,22,0.62)',
  tertiary: 'rgba(15,15,22,0.40)',
};

const THEME_LIGHT_SURFACES: Record<ThemeId, SurfacePalette> = {
  aniseeker: {
    background: { primary: '#FFFBF3', secondary: '#FFF3DF', tertiary: '#FFE9C7' },
    text: LIGHT_TEXT_NEUTRAL,
    glassBorder: 'rgba(15,15,22,0.10)',
    gradient: ['#FFFEFA', '#FFF5E4', '#FFFEFA'],
  },
  cyberpunk: {
    background: { primary: '#FFF5F8', secondary: '#FCE5EE', tertiary: '#F9D2DF' },
    text: LIGHT_TEXT_NEUTRAL,
    glassBorder: 'rgba(255, 42, 109, 0.20)',
    gradient: ['#FFF9FB', '#FCE7EF', '#FFF9FB'],
  },
  midnight: {
    background: { primary: '#F5F5FE', secondary: '#E7E7FB', tertiary: '#D8D8F6' },
    text: LIGHT_TEXT_NEUTRAL,
    glassBorder: 'rgba(94, 92, 230, 0.20)',
    gradient: ['#F9F9FF', '#E8E8FB', '#F9F9FF'],
  },
  forest: {
    background: { primary: '#F1FAF6', secondary: '#DFF4EA', tertiary: '#C8ECD9' },
    text: LIGHT_TEXT_NEUTRAL,
    glassBorder: 'rgba(16, 185, 129, 0.20)',
    gradient: ['#F6FBF8', '#E1F5EC', '#F6FBF8'],
  },
  ocean: {
    background: { primary: '#F0FAFD', secondary: '#DBF3FA', tertiary: '#BFE9F4' },
    text: LIGHT_TEXT_NEUTRAL,
    glassBorder: 'rgba(6, 182, 212, 0.20)',
    gradient: ['#F4FBFE', '#DEF4FA', '#F4FBFE'],
  },
  attackOnTitan: {
    background: { primary: '#FBF5EC', secondary: '#F2E6CF', tertiary: '#E8D5B0' },
    text: {
      primary: '#26190A',
      secondary: 'rgba(38,25,10,0.62)',
      tertiary: 'rgba(38,25,10,0.40)',
    },
    glassBorder: 'rgba(139, 69, 19, 0.22)',
    gradient: ['#FDFAF3', '#F1E5CD', '#FDFAF3'],
  },
  sunset: {
    background: { primary: '#FFF6EE', secondary: '#FFE7D2', tertiary: '#FFD4B0' },
    text: LIGHT_TEXT_NEUTRAL,
    glassBorder: 'rgba(251, 146, 60, 0.22)',
    gradient: ['#FFFAF4', '#FFE9D3', '#FFFAF4'],
  },
  candy: {
    background: { primary: '#FFF3F9', secondary: '#FDE2F0', tertiary: '#FACEE2' },
    text: LIGHT_TEXT_NEUTRAL,
    glassBorder: 'rgba(244, 114, 182, 0.22)',
    gradient: ['#FFF8FB', '#FEE5F2', '#FFF8FB'],
  },
};

interface ThemeContextValue {
  theme: ThemePalette;
  themeId: ThemeId;
  setTheme: (id: ThemeId) => Promise<void>;
  hydrated: boolean;
  themes: ThemePalette[];
  customAccent: string | null;
  setCustomAccent: (hex: string | null) => Promise<void>;
  recentAccents: string[];
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  /**
   * Resolved mode after auto → OS scheme. Consumers that need to pick e.g. a
   * BlurView tint should read this, not {@link themeMode}.
   */
  effectiveMode: 'light' | 'dark';
  tintIntensity: TintIntensity;
  setTintIntensity: (t: TintIntensity) => Promise<void>;
  increaseContrast: boolean;
  setIncreaseContrast: (v: boolean) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface StoredTheme {
  themeId: ThemeId;
  customAccent: string | null;
  recentAccents: string[];
  themeMode: ThemeMode;
  tintIntensity: TintIntensity;
  increaseContrast: boolean;
}

/**
 * Synchronously read the persisted theme from MMKV. Used to seed the provider
 * state on the first frame so the app paints in the user's theme immediately —
 * no flash of the default palette while an async read resolves.
 */
function readStoredTheme(): StoredTheme {
  const result: StoredTheme = {
    themeId: 'aniseeker',
    customAccent: null,
    recentAccents: [],
    themeMode: 'dark',
    tintIntensity: 'balanced',
    increaseContrast: false,
  };
  try {
    const storedTheme = kvGet(THEME_ID_KEY);
    if (storedTheme && storedTheme in THEMES) result.themeId = storedTheme as ThemeId;

    const storedAccent = kvGet(THEME_CUSTOM_ACCENT_KEY);
    if (storedAccent) {
      const norm = normalizeHex(storedAccent);
      if (norm) result.customAccent = norm;
    }

    const storedRecent = kvGet(THEME_RECENT_ACCENTS_KEY);
    if (storedRecent) {
      try {
        const parsed = JSON.parse(storedRecent) as unknown;
        if (Array.isArray(parsed)) {
          result.recentAccents = parsed
            .map((v) => (typeof v === 'string' ? normalizeHex(v) : null))
            .filter((v): v is string => !!v)
            .slice(0, MAX_RECENT_ACCENTS);
        }
      } catch {
        // ignore corrupt JSON
      }
    }

    const storedMode = kvGet(THEME_MODE_KEY);
    if (storedMode === 'light' || storedMode === 'dark' || storedMode === 'auto') {
      result.themeMode = storedMode;
    }

    const storedTint = kvGet(THEME_TINT_INTENSITY_KEY);
    if (storedTint === 'subtle' || storedTint === 'balanced' || storedTint === 'vivid') {
      result.tintIntensity = storedTint;
    }

    const storedContrast = kvGet(THEME_INCREASE_CONTRAST_KEY);
    if (storedContrast === 'true' || storedContrast === 'false') {
      result.increaseContrast = storedContrast === 'true';
    }
  } catch {
    // ignore — fall back to defaults
  }
  return result;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Seed synchronously from MMKV so the very first paint is in the user's
  // theme. MMKV is memory-mapped so this is essentially free — the read
  // happens during `useState`'s lazy initialiser and never flips on the user.
  const [bootstrap] = useState(() => readStoredTheme());
  const [themeId, setThemeId] = useState<ThemeId>(bootstrap.themeId);
  const [customAccent, setCustomAccentState] = useState<string | null>(bootstrap.customAccent);
  const [recentAccents, setRecentAccentsState] = useState<string[]>(bootstrap.recentAccents);
  const [themeMode, setThemeModeState] = useState<ThemeMode>(bootstrap.themeMode);
  const [tintIntensity, setTintIntensityState] = useState<TintIntensity>(bootstrap.tintIntensity);
  const [increaseContrast, setIncreaseContrastState] = useState<boolean>(
    bootstrap.increaseContrast
  );
  const systemScheme = useColorScheme();

  const setTheme = useCallback(async (id: ThemeId) => {
    if (!(id in THEMES)) return;
    setThemeId(id);
    // Switching theme means "use this palette's accent". Drop any previously
    // chosen custom accent so the new palette's accent actually takes effect —
    // otherwise the theme card swatch and the live accent get out of sync.
    setCustomAccentState(null);
    try {
      kvSet(THEME_ID_KEY, id);
      kvSet(THEME_CUSTOM_ACCENT_KEY, '');
    } catch {
      // best-effort persistence; in-memory fallback already updated
    }
  }, []);

  const setCustomAccent = useCallback(async (hex: string | null) => {
    if (hex === null) {
      setCustomAccentState(null);
      try {
        kvSet(THEME_CUSTOM_ACCENT_KEY, '');
      } catch {
        // best-effort
      }
      return;
    }
    const normalized = normalizeHex(hex);
    if (!normalized) return;
    setCustomAccentState(normalized);
    let nextRecent: string[] = [];
    setRecentAccentsState((prev) => {
      nextRecent = [normalized, ...prev.filter((c) => c !== normalized)].slice(
        0,
        MAX_RECENT_ACCENTS
      );
      return nextRecent;
    });
    try {
      kvSet(THEME_CUSTOM_ACCENT_KEY, normalized);
      kvSet(THEME_RECENT_ACCENTS_KEY, JSON.stringify(nextRecent));
    } catch {
      // best-effort
    }
  }, []);

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      kvSet(THEME_MODE_KEY, mode);
    } catch {
      // best-effort
    }
  }, []);

  const setTintIntensity = useCallback(async (t: TintIntensity) => {
    setTintIntensityState(t);
    try {
      kvSet(THEME_TINT_INTENSITY_KEY, t);
    } catch {
      // best-effort
    }
  }, []);

  const setIncreaseContrast = useCallback(async (v: boolean) => {
    setIncreaseContrastState(v);
    try {
      kvSet(THEME_INCREASE_CONTRAST_KEY, v ? 'true' : 'false');
    } catch {
      // best-effort
    }
  }, []);

  const effectiveMode: 'light' | 'dark' =
    themeMode === 'auto' ? (systemScheme === 'light' ? 'light' : 'dark') : themeMode;

  const resolvedTheme = useMemo<ThemePalette>(() => {
    const base = THEMES[themeId];
    const tint = TINT_INTENSITY_VALUES[tintIntensity];
    // Start from the dark palette, then swap surfaces for light mode.
    let next: ThemePalette = customAccent
      ? {
          ...base,
          accent: customAccent,
          accentLight: adjustHex(customAccent, 25),
          accentDark: adjustHex(customAccent, -25),
        }
      : base;
    if (effectiveMode === 'light') {
      const lightSurfaces = THEME_LIGHT_SURFACES[themeId];
      next = {
        ...next,
        background: lightSurfaces.background,
        text: lightSurfaces.text,
        glassBorder: lightSurfaces.glassBorder,
        gradient: lightSurfaces.gradient,
      };
    }
    if (!increaseContrast && tintIntensity === 'balanced') return next;
    // High-contrast border has to flip with mode — bright white doesn't read
    // against a pale background, and near-black doesn't read against a dark one.
    const highContrastBorder =
      effectiveMode === 'light' ? 'rgba(15,15,22,0.32)' : 'rgba(255,255,255,0.22)';
    return {
      ...next,
      accentLight: adjustHex(next.accent, 10 + tint * 30),
      glassBorder: increaseContrast ? highContrastBorder : next.glassBorder,
      text: increaseContrast
        ? {
            ...next.text,
            secondary: next.text.primary,
          }
        : next.text,
    };
  }, [themeId, customAccent, tintIntensity, increaseContrast, effectiveMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: resolvedTheme,
      themeId,
      setTheme,
      hydrated: true,
      themes: THEME_LIST,
      customAccent,
      setCustomAccent,
      recentAccents,
      themeMode,
      setThemeMode,
      effectiveMode,
      tintIntensity,
      setTintIntensity,
      increaseContrast,
      setIncreaseContrast,
    }),
    [
      resolvedTheme,
      themeId,
      setTheme,
      customAccent,
      setCustomAccent,
      recentAccents,
      themeMode,
      setThemeMode,
      effectiveMode,
      tintIntensity,
      setTintIntensity,
      increaseContrast,
      setIncreaseContrast,
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Safe default for components rendered outside provider (e.g., tests)
    return {
      theme: THEMES.aniseeker,
      themeId: 'aniseeker',
      setTheme: async () => {},
      hydrated: true,
      themes: THEME_LIST,
      customAccent: null,
      setCustomAccent: async () => {},
      recentAccents: [],
      themeMode: 'dark',
      setThemeMode: async () => {},
      effectiveMode: 'dark',
      tintIntensity: 'balanced',
      setTintIntensity: async () => {},
      increaseContrast: false,
      setIncreaseContrast: async () => {},
    };
  }
  return ctx;
}

// Helper for styles created at module scope where context isn't accessible
export const defaultPalette = THEMES.aniseeker;

// Optional platform-aware shadow helper bound to current accent
export function accentGlow(color: string) {
  return Platform.select({
    ios: {
      shadowColor: color,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 12,
    },
    android: { elevation: 10 },
    default: {},
  });
}
