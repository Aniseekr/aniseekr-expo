import { Platform } from 'react-native';

export const Colors = {
  primary: '#FF9F0A',
  primaryDark: '#E08E09',
  primaryLight: '#FFB340',

  secondary: '#BF5AF2',
  secondaryDark: '#A045D4',
  secondaryLight: '#D68AFF',

  accent: '#0A84FF',
  accentGlow: '#0070E0',

  background: {
    primary: '#080808',
    secondary: '#1C1C1E',
    tertiary: '#2C2C2E',
  },

  text: {
    primary: '#FFFFFF',
    secondary: 'rgba(235, 235, 245, 0.6)',
    tertiary: 'rgba(235, 235, 245, 0.3)',
    disabled: 'rgba(255, 255, 255, 0.3)',
    placeholder: 'rgba(255, 255, 255, 0.4)',
  },

  success: '#30D158',
  warning: '#FF9F0A',
  error: '#FF453A',
  info: '#0A84FF',

  gradients: {
    primary: ['#FF9F0A', '#E08E09'] as [string, string, ...string[]],
    secondary: ['#BF5AF2', '#A045D4'] as [string, string, ...string[]],
    sunset: ['#FF9F0A', '#FFD60A', '#FFE066'] as [string, string, ...string[]],
    aurora: ['#BF5AF2', '#D68AFF', '#64D2FF'] as [string, string, ...string[]],
    neon: ['#FF9F0A', '#BF5AF2', '#0A84FF'] as [string, string, ...string[]],
    background: ['#0F0F10', '#1C1C1E', '#0F0F10'] as [string, string, ...string[]],
    cardShadow: ['transparent', 'rgba(0,0,0,0.3)'] as [string, string, ...string[]],
  },

  glass: {
    light: 'rgba(255, 255, 255, 0.08)',
    medium: 'rgba(255, 255, 255, 0.13)',
    dark: 'rgba(255, 255, 255, 0.05)',
    heavy: 'rgba(255, 255, 255, 0.16)',
    border: 'rgba(255, 255, 255, 0.10)',
    borderHeavy: 'rgba(255, 255, 255, 0.16)',
  },

  rating: {
    s: '#FFD700',
    a: '#4CAF50',
    b: '#2196F3',
    c: '#FFC107',
    d: '#FF9800',
    e: '#F44336',
  },
};

export const Spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  screenPadding: 16,
  cardPadding: 16,
  sectionSpacing: 24,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  chip: 14,
  chipLg: 16,
  lg: 16,
  card: 20,
  cardLg: 22,
  xl: 24,
  tabActive: 26,
  xxl: 32,
  tabBar: 36,
  full: 9999,
} as const;

export const IconSize = {
  sm: 16,
  md: 24,
  lg: 32,
  xl: 48,
} as const;

export const Size = {
  minTouchTarget: 44,
  recommendedTouchTarget: 48,
  minBottomClearance: 20,
  cardSmall: 80,
  cardMedium: 120,
  cardLarge: 180,
  avatarSmall: 32,
  avatarMedium: 48,
  avatarLarge: 80,
  avatarXLarge: 120,
} as const;

/**
 * Compute bottom padding that clears the system navigation / home indicator zone.
 *
 * Adds `Size.minBottomClearance` on top of the safe-area inset so touch targets
 * never sit inside the iOS home indicator or Android gesture bar. On iPhone SE
 * (inset.bottom = 0) this yields 20pt, on devices with a home indicator
 * (inset.bottom ~34) this yields 54pt.
 *
 * Add visual air on top of this floor if needed, e.g. `bottomPad(insets) + 4`.
 */
export function bottomPad(insets: { bottom: number }): number {
  return Math.max(insets.bottom, 0) + Size.minBottomClearance;
}

export const TabBar = {
  height: 62,
  iconSize: 20,
  labelSize: 10,
  itemGap: 4,
} as const;

export const FontFamily = {
  rounded: Platform.select({
    ios: 'SF Pro Rounded',
    android: 'sans-serif-medium',
    default: undefined,
  }),
  display: Platform.select({
    ios: 'SF Pro Display',
    android: 'sans-serif',
    default: undefined,
  }),
  text: Platform.select({
    ios: 'SF Pro Text',
    android: 'sans-serif',
    default: undefined,
  }),
} as const;

export const Typography = {
  displayLarge: {
    fontSize: 34,
    fontWeight: '800' as const,
    lineHeight: 41,
    fontFamily: FontFamily.rounded,
    letterSpacing: 0.37,
  },
  displayMedium: {
    fontSize: 30,
    fontWeight: '700' as const,
    lineHeight: 36,
    fontFamily: FontFamily.rounded,
    letterSpacing: 0.34,
  },
  headlineLarge: {
    fontSize: 28,
    fontWeight: '700' as const,
    lineHeight: 34,
    fontFamily: FontFamily.rounded,
    letterSpacing: 0.36,
  },
  headlineMedium: {
    fontSize: 22,
    fontWeight: '600' as const,
    lineHeight: 28,
    fontFamily: FontFamily.rounded,
    letterSpacing: 0.35,
  },
  headlineSmall: {
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 25,
    fontFamily: FontFamily.rounded,
    letterSpacing: 0.38,
  },
  titleLarge: {
    fontSize: 17,
    fontWeight: '600' as const,
    lineHeight: 22,
    fontFamily: FontFamily.text,
    letterSpacing: -0.43,
  },
  titleMedium: {
    fontSize: 15,
    fontWeight: '600' as const,
    lineHeight: 20,
    fontFamily: FontFamily.text,
    letterSpacing: -0.24,
  },
  titleSmall: {
    fontSize: 13,
    fontWeight: '600' as const,
    lineHeight: 18,
    fontFamily: FontFamily.text,
    letterSpacing: -0.08,
  },
  bodyLarge: {
    fontSize: 17,
    fontWeight: '400' as const,
    lineHeight: 22,
    fontFamily: FontFamily.text,
    letterSpacing: -0.43,
  },
  bodyMedium: {
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 20,
    fontFamily: FontFamily.text,
    letterSpacing: -0.24,
  },
  bodySmall: {
    fontSize: 13,
    fontWeight: '400' as const,
    lineHeight: 18,
    fontFamily: FontFamily.text,
    letterSpacing: -0.08,
  },
  caption: {
    fontSize: 12,
    fontWeight: '500' as const,
    lineHeight: 16,
    fontFamily: FontFamily.text,
    letterSpacing: 0,
  },
  captionSmall: {
    fontSize: 11,
    fontWeight: '500' as const,
    lineHeight: 13,
    fontFamily: FontFamily.text,
    letterSpacing: 0.07,
  },
  monospace: {
    fontSize: 14,
    fontWeight: '500' as const,
    lineHeight: 18,
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: undefined,
    }),
  },
} as const;

export const Shadow = {
  subtle: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
    },
    android: { elevation: 4 },
    default: {},
  }),
  medium: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.2,
      shadowRadius: 10,
    },
    android: { elevation: 8 },
    default: {},
  }),
  heavy: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 16,
    },
    android: { elevation: 12 },
    default: {},
  }),
  glow: (color: string) =>
    Platform.select({
      ios: {
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 12,
      },
      android: { elevation: 10 },
      default: {},
    }),
} as const;
