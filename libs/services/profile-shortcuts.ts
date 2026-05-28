import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type ShortcutId =
  | 'notifications'
  | 'appearance'
  | 'language'
  | 'privacy'
  | 'cache'
  | 'sync-hub'
  | 'data-source'
  | 'otaku-dna'
  | 'account'
  | 'achievements'
  | 'import'
  | 'attribution'
  | 'terms'
  | 'theme-preview'
  | 'design-tokens';

export interface ShortcutSpec {
  id: ShortcutId;
  label: string;
  icon: IoniconName;
  // Per-category brand tint used as the icon's circle background.
  // Treated like PLATFORM_CONFIGS brand colors — semantic identifiers,
  // not theme-derived, so quick recognition is consistent across themes.
  tint: string;
  route: string;
}

export const SHORTCUT_CATALOG: Record<ShortcutId, ShortcutSpec> = {
  notifications: {
    id: 'notifications',
    label: 'Notifications',
    icon: 'notifications-outline',
    tint: '#FF9F0A',
    route: '/(setting)/notifications',
  },
  appearance: {
    id: 'appearance',
    label: 'Appearance',
    icon: 'color-palette-outline',
    tint: '#E8A0BF',
    route: '/(setting)/appearance',
  },
  language: {
    id: 'language',
    label: 'Language',
    icon: 'language-outline',
    tint: '#0A84FF',
    route: '/(setting)/language',
  },
  privacy: {
    id: 'privacy',
    label: 'Privacy',
    icon: 'shield-checkmark-outline',
    tint: '#30D158',
    route: '/(setting)/privacy',
  },
  cache: {
    id: 'cache',
    label: 'Cache',
    icon: 'cloud-download-outline',
    tint: '#BF5AF2',
    route: '/(setting)/cache',
  },
  'sync-hub': {
    id: 'sync-hub',
    label: 'Sync hub',
    icon: 'sync-outline',
    tint: '#FFD60A',
    route: '/(setting)/sync-hub',
  },
  'data-source': {
    id: 'data-source',
    label: 'Sources',
    icon: 'cloud-outline',
    tint: '#22D3EE',
    route: '/(setting)/data-source',
  },
  'otaku-dna': {
    id: 'otaku-dna',
    label: 'Otaku DNA',
    icon: 'finger-print-outline',
    tint: '#5E5CE6',
    route: '/(setting)/otaku-dna',
  },
  account: {
    id: 'account',
    label: 'Accounts',
    icon: 'people-circle-outline',
    tint: '#FF453A',
    route: '/(setting)/account',
  },
  achievements: {
    id: 'achievements',
    label: 'Trophies',
    icon: 'trophy-outline',
    tint: '#FFD700',
    route: '/(setting)/achievements',
  },
  import: {
    id: 'import',
    label: 'Import',
    icon: 'cloud-upload-outline',
    tint: '#06B6D4',
    route: '/(setting)/import-wizard',
  },
  attribution: {
    id: 'attribution',
    label: 'Credits',
    icon: 'ribbon-outline',
    tint: '#FF9F0A',
    route: '/(setting)/attribution',
  },
  terms: {
    id: 'terms',
    label: 'Terms',
    icon: 'document-text-outline',
    tint: '#787878',
    route: '/(setting)/terms',
  },
  'theme-preview': {
    id: 'theme-preview',
    label: 'Preview',
    icon: 'eye-outline',
    tint: '#10B981',
    route: '/(setting)/theme-preview',
  },
  'design-tokens': {
    id: 'design-tokens',
    label: 'Tokens',
    icon: 'cube-outline',
    tint: '#A78BFA',
    route: '/(setting)/design-tokens',
  },
};

export const PROFILE_SHORTCUT_COUNT = 8;

export const DEFAULT_PROFILE_SHORTCUTS: ShortcutId[] = [
  'notifications',
  'language',
  'privacy',
  'cache',
  'appearance',
  'sync-hub',
  'data-source',
  'otaku-dna',
];

export function getShortcutSpec(id: string): ShortcutSpec | null {
  return SHORTCUT_CATALOG[id as ShortcutId] ?? null;
}

export function listShortcuts(): ShortcutSpec[] {
  return Object.values(SHORTCUT_CATALOG);
}

export function normalizeProfileShortcuts(input?: readonly string[] | null): ShortcutId[] {
  const seen = new Set<ShortcutId>();
  const out: ShortcutId[] = [];
  const push = (id: ShortcutId) => {
    if (seen.has(id) || out.length >= PROFILE_SHORTCUT_COUNT) return;
    seen.add(id);
    out.push(id);
  };
  for (const raw of input ?? []) {
    const spec = getShortcutSpec(raw);
    if (spec) push(spec.id);
  }
  for (const id of DEFAULT_PROFILE_SHORTCUTS) push(id);
  for (const id of Object.keys(SHORTCUT_CATALOG) as ShortcutId[]) push(id);
  return out;
}
