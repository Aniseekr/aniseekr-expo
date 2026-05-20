/**
 * Authentication Types for Multi-Platform Anime Sync
 * Mirrors iOS implementation: Services/Authentication/
 */

export type PlatformType =
  | 'anilist'
  | 'myanimelist'
  | 'bangumi'
  | 'kitsu'
  | 'shikimori'
  | 'simkl'
  | 'annict'
  | 'kavita';

export interface OAuthConfig {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scopes?: string[];
  usePKCE?: boolean;
}

export interface TokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  tokenType: string;
  scope?: string;
}

export interface PlatformCredentials {
  platform: PlatformType;
  token: TokenData;
  userId?: string;
  username?: string;
  avatarUrl?: string;
  serverUrl?: string;
  connectedAt: Date;
  lastSyncAt?: Date;
}

export interface User {
  id: string;
  name: string;
  email: string;
  profileImageURL?: string;
  gender?: 'male' | 'female' | 'other' | 'unspecified';
  onboardedAt?: Date;
  connectedPlatforms: PlatformCredentials[];
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface PlatformAuthConfig {
  platform: PlatformType;
  displayName: string;
  icon: string;
  color: string;
  oauth: OAuthConfig;
  apiBaseUrl: string;
  supportsWrite: boolean;
  authType: 'oauth2' | 'pkce' | 'password' | 'apikey';
}

// Platform configurations - mirrors iOS OAuthManager.swift
export const PLATFORM_CONFIGS: Record<PlatformType, PlatformAuthConfig> = {
  anilist: {
    platform: 'anilist',
    displayName: 'AniList',
    icon: 'list-alt',
    color: '#02A9FF',
    oauth: {
      clientId: process.env.EXPO_PUBLIC_ANILIST_CLIENT_ID || '',
      redirectUri: 'aniseekr://oauth/anilist',
      authorizationEndpoint: 'https://anilist.co/api/v2/oauth/authorize',
      tokenEndpoint: 'https://anilist.co/api/v2/oauth/token',
      scopes: [],
    },
    apiBaseUrl: 'https://graphql.anilist.co',
    supportsWrite: true,
    authType: 'oauth2',
  },
  myanimelist: {
    platform: 'myanimelist',
    displayName: 'MyAnimeList',
    icon: 'database',
    color: '#2E51A2',
    oauth: {
      clientId: process.env.EXPO_PUBLIC_MAL_CLIENT_ID || '',
      redirectUri: 'aniseekr://oauth/mal',
      authorizationEndpoint: 'https://myanimelist.net/v1/oauth2/authorize',
      tokenEndpoint: 'https://myanimelist.net/v1/oauth2/token',
      scopes: [],
      usePKCE: true,
    },
    apiBaseUrl: 'https://api.myanimelist.net/v2',
    supportsWrite: true,
    authType: 'pkce',
  },
  bangumi: {
    platform: 'bangumi',
    displayName: 'Bangumi',
    icon: 'tv',
    color: '#F09199',
    oauth: {
      clientId: process.env.EXPO_PUBLIC_BGM_CLIENT_ID || '',
      // clientSecret must NOT live in the mobile bundle - exchange the code
      // through a backend proxy that holds BGM_CLIENT_SECRET server-side.
      redirectUri: 'aniseekr://oauth/bangumi',
      authorizationEndpoint: 'https://bgm.tv/oauth/authorize',
      tokenEndpoint: 'https://bgm.tv/oauth/access_token',
      scopes: [],
    },
    apiBaseUrl: 'https://api.bgm.tv',
    supportsWrite: true,
    authType: 'oauth2',
  },
  kitsu: {
    platform: 'kitsu',
    displayName: 'Kitsu',
    icon: 'paw',
    color: '#F75239',
    oauth: {
      // Kitsu has not implemented per-app registration; their docs publish a
      // shared placeholder client_id/secret that every client uses (or empty
      // strings also work). Read from env so we can swap in real values once
      // Kitsu ships app registration.
      clientId: process.env.EXPO_PUBLIC_KITSU_CLIENT_ID || '',
      redirectUri: '',
      authorizationEndpoint: '',
      tokenEndpoint: 'https://kitsu.io/api/oauth/token',
      scopes: [],
    },
    apiBaseUrl: 'https://kitsu.io/api/edge',
    supportsWrite: true,
    authType: 'password',
  },
  shikimori: {
    platform: 'shikimori',
    displayName: 'Shikimori',
    icon: 'film',
    color: '#343434',
    oauth: {
      clientId: process.env.EXPO_PUBLIC_SHIKIMORI_CLIENT_ID || '',
      // clientSecret must NOT live in the mobile bundle - proxy the token
      // exchange through a backend that holds SHIKIMORI_CLIENT_SECRET.
      redirectUri: 'aniseekr://oauth/shikimori',
      authorizationEndpoint: 'https://shikimori.one/oauth/authorize',
      tokenEndpoint: 'https://shikimori.one/oauth/token',
      scopes: ['user_rates'],
    },
    apiBaseUrl: 'https://shikimori.one/api',
    supportsWrite: true,
    authType: 'oauth2',
  },
  simkl: {
    platform: 'simkl',
    displayName: 'Simkl',
    icon: 'play-circle',
    color: '#0B0F1A',
    oauth: {
      clientId: process.env.EXPO_PUBLIC_SIMKL_CLIENT_ID || '',
      redirectUri: 'aniseekr://oauth/simkl',
      authorizationEndpoint: 'https://simkl.com/oauth/authorize',
      tokenEndpoint: 'https://api.simkl.com/oauth/token',
      scopes: [],
    },
    apiBaseUrl: 'https://api.simkl.com',
    supportsWrite: true,
    authType: 'oauth2',
  },
  annict: {
    platform: 'annict',
    displayName: 'Annict',
    icon: 'calendar',
    color: '#F85B73',
    oauth: {
      clientId: process.env.EXPO_PUBLIC_ANNICT_CLIENT_ID || '',
      // clientSecret must NOT live in the mobile bundle - proxy the token
      // exchange through a backend that holds ANNICT_CLIENT_SECRET.
      redirectUri: 'aniseekr://oauth/annict',
      authorizationEndpoint: 'https://annict.com/oauth/authorize',
      tokenEndpoint: 'https://annict.com/oauth/token',
      scopes: ['read', 'write'],
    },
    apiBaseUrl: 'https://api.annict.com',
    supportsWrite: true,
    authType: 'oauth2',
  },
  kavita: {
    platform: 'kavita',
    displayName: 'Kavita',
    icon: 'book',
    color: '#4A8B3C',
    oauth: {
      clientId: '',
      redirectUri: '',
      authorizationEndpoint: '',
      tokenEndpoint: '',
      scopes: [],
    },
    apiBaseUrl: '', // User-configured server URL
    supportsWrite: true,
    authType: 'apikey',
  },
};

// Anime status types - shared across all platforms
export type AnimeStatus = 'watching' | 'completed' | 'on_hold' | 'dropped' | 'planned';

// Universal anime item for cross-platform sync
export interface UniversalAnimeItem {
  id: string;
  platformIds: Partial<Record<PlatformType, string>>;
  title: string;
  titleEnglish?: string;
  titleJapanese?: string;
  titleRomaji?: string;
  imageUrl: string;
  status: AnimeStatus;
  progress: number;
  totalEpisodes?: number;
  score?: number;
  startDate?: Date;
  endDate?: Date;
  notes?: string;
  rewatchCount?: number;
  updatedAt: Date;
  source: PlatformType;
}

// Sync result types
export interface SyncResult {
  platform: PlatformType;
  success: boolean;
  itemsAdded: number;
  itemsUpdated: number;
  itemsRemoved: number;
  errors: string[];
  syncedAt: Date;
}
