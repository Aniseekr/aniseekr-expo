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
  isObject(value) && isPlatformType(value.platform) && typeof value.connectedAt === 'string';

const isPersistedCredentialList = (value: unknown): value is PersistedCredentialEntry[] =>
  Array.isArray(value) && value.every(isPersistedCredentialEntry);

const isUser = (value: unknown): value is User =>
  isObject(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.email === 'string' &&
  Array.isArray(value.connectedPlatforms);

const isTokenData = (value: unknown): value is TokenData =>
  isObject(value) && typeof value.accessToken === 'string' && typeof value.tokenType === 'string';

const REFRESH_SKEW_MS = 60_000;

const USER_KEY = 'aniseekr_user';
const TOKEN_PREFIX = 'aniseekr_token_';
const CREDENTIALS_KEY = 'aniseekr_credentials';

// Mirror the redirect paths the iOS app registered with each OAuth provider
// (scheme `aniseeker://`, see Info.plist). The OAuth servers reject anything
// else with invalid_client because the client_id is bound to these callbacks.
const REDIRECT_PATHS: Partial<Record<PlatformType, string>> = {
  anilist: 'anilist-auth',
  myanimelist: 'mal-auth',
  bangumi: 'bangumi-auth',
  shikimori: 'shikimori-auth',
  simkl: 'simkl-auth',
  annict: 'annict-auth',
};

// MAL is the only provider that demands PKCE with `code_challenge_method=plain`
// (S256 returns 400). expo-auth-session's AuthRequest hard-rejects Plain via
// an invariant, so we bypass its PKCE generator and hand-roll the verifier.
const PKCE_VERIFIER_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generatePlainPkceVerifier(length = 64): string {
  const bytes = Crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (let i = 0; i < length; i++) {
    out += PKCE_VERIFIER_CHARSET[bytes[i] % PKCE_VERIFIER_CHARSET.length];
  }
  return out;
}

class AuthService {
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
    const tag = `[sync-hub:${platform}]`;
    const config = PLATFORM_CONFIGS[platform];
    if (config.authType !== 'password') {
      throw new Error(`Platform ${platform} does not support password auth`);
    }

    const bodyObject: Record<string, string> = {
      grant_type: 'password',
      username,
      password,
    };
    // Kitsu (Doorkeeper) treats password grant as a public-client flow; if we
    // pass the docs-published placeholder client_id it rejects with the
    // "issued to another client" boilerplate (the app row no longer exists in
    // Kitsu's DB). Tachiyomi proves the bare-minimum body works. iOS sent the
    // placeholder but was likely never actually tested end-to-end.
    const includeClientCreds = platform !== 'kitsu';
    if (includeClientCreds && config.oauth.clientId) {
      bodyObject.client_id = config.oauth.clientId;
    }
    if (includeClientCreds && config.oauth.clientSecret) {
      bodyObject.client_secret = config.oauth.clientSecret;
    }

    const body = new URLSearchParams(bodyObject).toString();

    console.log(`${tag} password grant`, {
      tokenEndpoint: config.oauth.tokenEndpoint,
      includeClientCreds,
      hasClientId: !!bodyObject.client_id,
      hasClientSecret: !!bodyObject.client_secret,
      usernameLen: username.length,
      usernameLooksLikeEmail: username.includes('@'),
    });

    const response = await fetch(config.oauth.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`${tag} password grant failed`, {
        status: response.status,
        body: body.slice(0, 500),
      });
      throw new Error(
        `Authentication failed (${response.status}): ${body.slice(0, 200) || 'no body'}`
      );
    }

    const data = await response.json();
    console.log(`${tag} password grant success`, {
      hasAccessToken: !!data.access_token,
      tokenType: data.token_type,
      expiresIn: data.expires_in,
    });
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
    const tag = `[sync-hub:${platform}]`;
    const config = PLATFORM_CONFIGS[platform];

    const discovery = {
      authorizationEndpoint: config.oauth.authorizationEndpoint,
      tokenEndpoint: config.oauth.tokenEndpoint,
    };

    const clientId = config.oauth.clientId;
    const redirectUri = AuthSession.makeRedirectUri({
      scheme: 'aniseeker',
      path: REDIRECT_PATHS[platform] ?? `${platform}-auth`,
    });

    const usePlainPkce = platform === 'myanimelist' && usePKCE;
    const plainVerifier = usePlainPkce ? generatePlainPkceVerifier() : undefined;

    console.log(`${tag} start`, {
      authType: config.authType,
      usePKCE,
      usePlainPkce,
      clientIdLen: clientId.length,
      clientIdTail: clientId ? clientId.slice(-6) : '(empty)',
      redirectUri,
      scopes: config.oauth.scopes,
      authorizationEndpoint: discovery.authorizationEndpoint,
      tokenEndpoint: discovery.tokenEndpoint,
    });

    if (!clientId) {
      console.error(
        `${tag} clientId is EMPTY — env var EXPO_PUBLIC_${platform.toUpperCase()}_CLIENT_ID not set or not bundled`
      );
    }

    const request = new AuthSession.AuthRequest({
      clientId,
      redirectUri,
      scopes: config.oauth.scopes,
      usePKCE: usePlainPkce ? false : usePKCE,
      extraParams: usePlainPkce
        ? { code_challenge: plainVerifier!, code_challenge_method: 'plain' }
        : undefined,
    });

    try {
      const authUrl = await request.makeAuthUrlAsync(discovery);
      console.log(`${tag} authorize URL`, authUrl);
    } catch (e) {
      console.error(`${tag} failed to build authorize URL`, e);
    }

    const promptStart = Date.now();
    console.log(`${tag} opening browser (ASWebAuthenticationSession)...`);
    const result = await request.promptAsync(discovery);
    const promptMs = Date.now() - promptStart;
    console.log(`${tag} promptAsync result (after ${promptMs}ms)`, {
      type: result.type,
      params: result.type === 'success' ? result.params : undefined,
      error:
        result.type === 'error'
          ? { msg: result.error?.message, code: result.errorCode, desc: result.error?.description }
          : undefined,
      url: 'url' in result ? result.url : undefined,
    });
    if (result.type === 'dismiss' && promptMs < 1500) {
      console.warn(
        `${tag} dismissed in <1.5s — likely scheme not registered or no Activity/Intent handles redirectUri. Check AndroidManifest.xml intent-filter or iOS Info.plist CFBundleURLSchemes for: ${redirectUri.split('://')[0]}.`
      );
    }

    if (result.type !== 'success' || !result.params.code) {
      if (result.type === 'success') {
        console.warn(`${tag} success but no code in params`, result.params);
      }
      return null;
    }

    const tokenExtraParams: Record<string, string> = {};
    if (usePlainPkce) {
      tokenExtraParams.code_verifier = plainVerifier!;
    } else if (usePKCE && request.codeVerifier) {
      tokenExtraParams.code_verifier = request.codeVerifier;
    }

    console.log(`${tag} exchanging code`, {
      codeLen: result.params.code.length,
      hasVerifier: !!tokenExtraParams.code_verifier,
      verifierLen: tokenExtraParams.code_verifier?.length,
    });

    let tokenResult;
    try {
      tokenResult = await AuthSession.exchangeCodeAsync(
        {
          clientId,
          clientSecret: config.oauth.clientSecret || undefined,
          code: result.params.code,
          redirectUri,
          extraParams: tokenExtraParams,
        },
        discovery
      );
    } catch (e) {
      const err = e as { message?: string; code?: string; description?: string };
      console.error(`${tag} token exchange failed`, {
        message: err?.message,
        code: err?.code,
        description: err?.description,
      });
      throw e;
    }

    console.log(`${tag} token exchange success`, {
      hasAccessToken: !!tokenResult.accessToken,
      accessTokenLen: tokenResult.accessToken?.length,
      hasRefreshToken: !!tokenResult.refreshToken,
      tokenType: tokenResult.tokenType,
      expiresIn: tokenResult.expiresIn,
      scope: tokenResult.scope,
    });

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
