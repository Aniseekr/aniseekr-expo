import * as SecureStore from 'expo-secure-store';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import { PLATFORM_CONFIGS, PlatformType, TokenData, User, PlatformCredentials } from './types';
import { AuthRequiresFormError } from './auth-errors';
import { isObject, safeJsonParse } from '../../utils/safe-json';

interface PersistedCredentialEntry {
  platform: PlatformType;
  userId?: string;
  username?: string;
  avatarUrl?: string;
  serverUrl?: string;
  connectedAt: string;
  lastSyncAt?: string;
}

const PLATFORM_KEYS = Object.keys(PLATFORM_CONFIGS) as PlatformType[];

const isPlatformType = (value: unknown): value is PlatformType =>
  typeof value === 'string' && (PLATFORM_KEYS as string[]).includes(value);

const isPersistedCredentialEntry = (value: unknown): value is PersistedCredentialEntry =>
  isObject(value) &&
  isPlatformType(value.platform) &&
  typeof value.connectedAt === 'string';

const isPersistedCredentialList = (value: unknown): value is PersistedCredentialEntry[] =>
  Array.isArray(value) && value.every(isPersistedCredentialEntry);

const isUser = (value: unknown): value is User =>
  isObject(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.email === 'string' &&
  Array.isArray(value.connectedPlatforms);

const isTokenData = (value: unknown): value is TokenData =>
  isObject(value) &&
  typeof value.accessToken === 'string' &&
  typeof value.tokenType === 'string';

const REFRESH_SKEW_MS = 60_000;

const USER_KEY = 'aniseekr_user';
const TOKEN_PREFIX = 'aniseekr_token_';
const CREDENTIALS_KEY = 'aniseekr_credentials';

export class AuthService {
  private static instance: AuthService;
  private currentUser: User | null = null;
  private credentials: Map<PlatformType, PlatformCredentials> = new Map();
  private initialized = false;

  private constructor() {}

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.loadStoredUser();
    await this.loadStoredCredentials();
    this.initialized = true;
  }

  async signInAsGuest(): Promise<User> {
    const deviceId = await this.getOrCreateDeviceId();
    const guestUser: User = {
      id: `guest_${deviceId}`,
      name: `Guest_${deviceId.slice(-8)}`,
      email: `guest${deviceId.slice(-8)}@guest.local`,
      connectedPlatforms: [],
    };

    this.currentUser = guestUser;
    await this.saveUser(guestUser);
    return guestUser;
  }

  async connectPlatform(platform: PlatformType): Promise<PlatformCredentials | null> {
    const config = PLATFORM_CONFIGS[platform];
    if (!config) throw new Error(`Unknown platform: ${platform}`);

    let tokenData: TokenData | null = null;

    switch (config.authType) {
      case 'oauth2':
      case 'pkce':
        tokenData = await this.performOAuth(platform, config.authType === 'pkce');
        break;
      case 'password':
        throw new Error('Password auth requires username/password - use connectWithPassword');
      case 'apikey':
        throw new Error('API key auth requires key - use connectWithApiKey');
    }

    if (!tokenData) return null;

    const credentials: PlatformCredentials = {
      platform,
      token: tokenData,
      connectedAt: new Date(),
    };

    await this.saveCredentials(platform, credentials);
    return credentials;
  }

  async connectWithPassword(
    platform: PlatformType,
    username: string,
    password: string
  ): Promise<PlatformCredentials | null> {
    const config = PLATFORM_CONFIGS[platform];
    if (config.authType !== 'password') {
      throw new Error(`Platform ${platform} does not support password auth`);
    }

    const params = new URLSearchParams({
      grant_type: 'password',
      username,
      password,
    });

    if (config.oauth.clientId) {
      params.append('client_id', config.oauth.clientId);
    }
    if (config.oauth.clientSecret) {
      params.append('client_secret', config.oauth.clientSecret);
    }

    const response = await fetch(config.oauth.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) throw new Error('Authentication failed');

    const data = await response.json();
    const tokenData: TokenData = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenType: data.token_type || 'Bearer',
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
    };

    const credentials: PlatformCredentials = {
      platform,
      token: tokenData,
      connectedAt: new Date(),
    };

    await this.saveCredentials(platform, credentials);
    return credentials;
  }

  async connectWithApiKey(
    platform: PlatformType,
    apiKey: string,
    serverUrl?: string
  ): Promise<PlatformCredentials> {
    const tokenData: TokenData = {
      accessToken: apiKey,
      tokenType: 'ApiKey',
    };

    const credentials: PlatformCredentials = {
      platform,
      token: tokenData,
      connectedAt: new Date(),
      serverUrl,
    };

    await this.saveCredentials(platform, credentials);
    return credentials;
  }

  async disconnectPlatform(platform: PlatformType): Promise<void> {
    this.credentials.delete(platform);
    await SecureStore.deleteItemAsync(`${TOKEN_PREFIX}${platform}`);
    await this.persistCredentials();
  }

  async signIn(platform: PlatformType): Promise<PlatformCredentials | null> {
    await this.initialize();
    const config = PLATFORM_CONFIGS[platform];
    if (!config) throw new Error(`Unknown platform: ${platform}`);

    if (config.authType === 'password') {
      throw new AuthRequiresFormError(platform, 'password', platform === 'kavita');
    }
    if (config.authType === 'apikey') {
      throw new AuthRequiresFormError(platform, 'apikey', platform === 'kavita');
    }
    return this.connectPlatform(platform);
  }

  async signOut(platform?: PlatformType): Promise<void> {
    if (!platform) {
      await this.signOutAll();
      return;
    }
    await this.disconnectPlatform(platform);
  }

  async getToken(platform: PlatformType): Promise<string | null> {
    await this.initialize();
    const refreshed = await this.refreshTokenIfNeeded(platform);
    const creds = refreshed ?? this.credentials.get(platform);
    return creds?.token.accessToken ?? null;
  }

  async getValidCredentials(platform: PlatformType): Promise<PlatformCredentials | null> {
    await this.initialize();
    const refreshed = await this.refreshTokenIfNeeded(platform);
    return refreshed ?? this.credentials.get(platform) ?? null;
  }

  isPlatformAuthenticated(platform: PlatformType): boolean {
    return this.credentials.has(platform);
  }

  async refreshTokenIfNeeded(platform: PlatformType): Promise<PlatformCredentials | null> {
    const creds = this.credentials.get(platform);
    if (!creds) return null;
    const expiresAt = creds.token.expiresAt;
    if (!expiresAt) return creds;

    const expiry = new Date(expiresAt).getTime();
    if (expiry - Date.now() > REFRESH_SKEW_MS) return creds;

    const refreshToken = creds.token.refreshToken;
    if (!refreshToken) return creds;

    const config = PLATFORM_CONFIGS[platform];
    if (!config?.oauth.tokenEndpoint) return creds;

    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });
      if (config.oauth.clientId) params.append('client_id', config.oauth.clientId);
      if (config.oauth.clientSecret) params.append('client_secret', config.oauth.clientSecret);

      const response = await fetch(config.oauth.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      if (!response.ok) return creds;

      const data = await response.json();
      const next: PlatformCredentials = {
        ...creds,
        token: {
          accessToken: data.access_token,
          refreshToken: data.refresh_token ?? refreshToken,
          tokenType: data.token_type || creds.token.tokenType,
          expiresAt: data.expires_in
            ? new Date(Date.now() + data.expires_in * 1000)
            : creds.token.expiresAt,
          scope: data.scope ?? creds.token.scope,
        },
      };
      await this.saveCredentials(platform, next);
      return next;
    } catch (error) {
      console.error(`[auth] refresh failed for ${platform}`, error);
      return creds;
    }
  }

  private async signOutAll(): Promise<void> {
    this.currentUser = null;
    this.credentials.clear();
    await SecureStore.deleteItemAsync(USER_KEY);
    await SecureStore.deleteItemAsync(CREDENTIALS_KEY);

    for (const platform of Object.keys(PLATFORM_CONFIGS)) {
      await SecureStore.deleteItemAsync(`${TOKEN_PREFIX}${platform}`);
    }
  }

  getCredentials(platform: PlatformType): PlatformCredentials | undefined {
    return this.credentials.get(platform);
  }

  getAllCredentials(): PlatformCredentials[] {
    return Array.from(this.credentials.values());
  }

  getConnectedPlatforms(): PlatformType[] {
    return Array.from(this.credentials.keys());
  }

  isConnected(platform: PlatformType): boolean {
    return this.credentials.has(platform);
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  private async performOAuth(platform: PlatformType, usePKCE: boolean): Promise<TokenData | null> {
    const config = PLATFORM_CONFIGS[platform];

    const discovery = {
      authorizationEndpoint: config.oauth.authorizationEndpoint,
      tokenEndpoint: config.oauth.tokenEndpoint,
    };

    const clientId = config.oauth.clientId;
    const redirectUri = AuthSession.makeRedirectUri({
      scheme: 'aniseekr',
      path: `oauth/${platform}`,
    });

    const request = new AuthSession.AuthRequest({
      clientId,
      redirectUri,
      scopes: config.oauth.scopes,
      usePKCE,
    });

    const result = await request.promptAsync(discovery);

    if (result.type !== 'success' || !result.params.code) {
      return null;
    }

    const tokenResult = await AuthSession.exchangeCodeAsync(
      {
        clientId,
        code: result.params.code,
        redirectUri,
        extraParams: usePKCE ? { code_verifier: request.codeVerifier! } : {},
      },
      discovery
    );

    return {
      accessToken: tokenResult.accessToken,
      refreshToken: tokenResult.refreshToken ?? undefined,
      tokenType: tokenResult.tokenType ?? 'Bearer',
      expiresAt: tokenResult.expiresIn
        ? new Date(Date.now() + tokenResult.expiresIn * 1000)
        : undefined,
      scope: tokenResult.scope ?? undefined,
    };
  }

  private async getOrCreateDeviceId(): Promise<string> {
    const key = 'aniseekr_device_id';
    let deviceId = await SecureStore.getItemAsync(key);
    if (!deviceId) {
      deviceId = Crypto.randomUUID();
      await SecureStore.setItemAsync(key, deviceId);
    }
    return deviceId;
  }

  private async saveUser(user: User): Promise<void> {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  }

  private async loadStoredUser(): Promise<void> {
    const userData = await SecureStore.getItemAsync(USER_KEY);
    if (!userData) return;
    const parsed = safeJsonParse(userData, isUser);
    if (parsed) {
      this.currentUser = parsed;
    } else {
      console.error('Failed to parse stored user data; clearing');
      await SecureStore.deleteItemAsync(USER_KEY);
    }
  }

  private async saveCredentials(platform: PlatformType, creds: PlatformCredentials): Promise<void> {
    const isNew = !this.credentials.has(platform);
    this.credentials.set(platform, creds);
    await SecureStore.setItemAsync(`${TOKEN_PREFIX}${platform}`, JSON.stringify(creds.token));
    await this.persistCredentials();
    if (isNew) {
      void this.notifyPlatformConnected();
    }
  }

  private async notifyPlatformConnected(): Promise<void> {
    try {
      const { achievementService } = await import('../achievements/achievement-service');
      await achievementService.track('sync.platforms', 0, this.credentials.size);
    } catch (error) {
      console.error('[auth] failed to track sync.platforms achievement', error);
    }
  }

  private async persistCredentials(): Promise<void> {
    const credsList = Array.from(this.credentials.entries()).map(([p, c]) => ({
      platform: p,
      userId: c.userId,
      username: c.username,
      avatarUrl: c.avatarUrl,
      serverUrl: c.serverUrl,
      connectedAt: c.connectedAt.toISOString(),
      lastSyncAt: c.lastSyncAt?.toISOString(),
    }));
    await SecureStore.setItemAsync(CREDENTIALS_KEY, JSON.stringify(credsList));
  }

  private async loadStoredCredentials(): Promise<void> {
    const credsData = await SecureStore.getItemAsync(CREDENTIALS_KEY);
    if (!credsData) return;

    const credsList = safeJsonParse(credsData, isPersistedCredentialList);
    if (!credsList) {
      console.error('Failed to parse credentials list; clearing');
      await SecureStore.deleteItemAsync(CREDENTIALS_KEY);
      return;
    }

    for (const item of credsList) {
      const tokenRaw = await SecureStore.getItemAsync(`${TOKEN_PREFIX}${item.platform}`);
      const token = safeJsonParse(tokenRaw, isTokenData);
      if (!token) {
        if (tokenRaw) console.error(`Failed to parse token for ${item.platform}`);
        continue;
      }
      this.credentials.set(item.platform, {
        platform: item.platform,
        token,
        userId: item.userId,
        username: item.username,
        avatarUrl: item.avatarUrl,
        serverUrl: item.serverUrl,
        connectedAt: new Date(item.connectedAt),
        lastSyncAt: item.lastSyncAt ? new Date(item.lastSyncAt) : undefined,
      });
    }
  }
}

export const authService = AuthService.getInstance();
