import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

let AsyncStorage: AsyncStorageLike;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  const memory = new Map<string, string>();
  AsyncStorage = {
    async getItem(key: string) {
      return memory.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      memory.set(key, value);
    },
  };
}

const STORAGE_KEY = '@aniseekr/theme';
const CUSTOM_ACCENT_KEY = '@aniseekr/customAccent';
const RECENT_ACCENTS_KEY = '@aniseekr/recentAccents';
const MAX_RECENT_ACCENTS = 5;

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
}

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
  },
};

export const THEME_LIST: ThemePalette[] = Object.values(THEMES);

interface ThemeContextValue {
  theme: ThemePalette;
  themeId: ThemeId;
  setTheme: (id: ThemeId) => Promise<void>;
  hydrated: boolean;
  themes: ThemePalette[];
  customAccent: string | null;
  setCustomAccent: (hex: string | null) => Promise<void>;
  recentAccents: string[];
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>('aniseeker');
  const [customAccent, setCustomAccentState] = useState<string | null>(null);
  const [recentAccents, setRecentAccentsState] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(CUSTOM_ACCENT_KEY),
      AsyncStorage.getItem(RECENT_ACCENTS_KEY),
    ])
      .then(([storedTheme, storedAccent, storedRecent]) => {
        if (!mounted) return;
        if (storedTheme && storedTheme in THEMES) setThemeId(storedTheme as ThemeId);
        if (storedAccent) {
          const norm = normalizeHex(storedAccent);
          if (norm) setCustomAccentState(norm);
        }
        if (storedRecent) {
          try {
            const parsed = JSON.parse(storedRecent) as unknown;
            if (Array.isArray(parsed)) {
              const cleaned = parsed
                .map((v) => (typeof v === 'string' ? normalizeHex(v) : null))
                .filter((v): v is string => !!v)
                .slice(0, MAX_RECENT_ACCENTS);
              setRecentAccentsState(cleaned);
            }
          } catch {
            // ignore corrupt JSON
          }
        }
      })
      .catch(() => {
        // ignore — fall back to default
      })
      .finally(() => {
        if (mounted) setHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const setTheme = useCallback(async (id: ThemeId) => {
    if (!(id in THEMES)) return;
    setThemeId(id);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, id);
    } catch {
      // best-effort persistence; in-memory fallback already updated
    }
  }, []);

  const setCustomAccent = useCallback(async (hex: string | null) => {
    if (hex === null) {
      setCustomAccentState(null);
      try {
        await AsyncStorage.setItem(CUSTOM_ACCENT_KEY, '');
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
      await AsyncStorage.setItem(CUSTOM_ACCENT_KEY, normalized);
      await AsyncStorage.setItem(RECENT_ACCENTS_KEY, JSON.stringify(nextRecent));
    } catch {
      // best-effort
    }
  }, []);

  const resolvedTheme = useMemo<ThemePalette>(() => {
    const base = THEMES[themeId];
    if (!customAccent) return base;
    return {
      ...base,
      accent: customAccent,
      accentLight: adjustHex(customAccent, 25),
      accentDark: adjustHex(customAccent, -25),
    };
  }, [themeId, customAccent]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: resolvedTheme,
      themeId,
      setTheme,
      hydrated,
      themes: THEME_LIST,
      customAccent,
      setCustomAccent,
      recentAccents,
    }),
    [resolvedTheme, themeId, setTheme, hydrated, customAccent, setCustomAccent, recentAccents]
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
