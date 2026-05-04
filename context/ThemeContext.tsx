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
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>('aniseeker');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!mounted) return;
        if (stored && stored in THEMES) {
          setThemeId(stored as ThemeId);
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

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: THEMES[themeId],
      themeId,
      setTheme,
      hydrated,
      themes: THEME_LIST,
    }),
    [themeId, setTheme, hydrated]
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
