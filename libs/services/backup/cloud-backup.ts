// Thin adapter wrapping `react-native-cloud-storage` so the rest of the app
// talks to one surface for iCloud / Google Drive and unit tests can swap in a
// fake without dragging the native module into the bundle.
//
// The native module is loaded lazily — calling `CloudBackup.fromNativeModule()`
// only requires it at runtime, so unit tests that construct a CloudBackup with
// an explicit `storage` argument never trigger the import.
//
// Scope policy (industry convention — LINE/WhatsApp do the same split):
//   - iCloud (iOS):    Documents scope. Backup is visible in Files.app under
//                      "iCloud Drive / Aniseekr", restorable across devices,
//                      shareable. The plugin already grants CloudDocuments.
//   - Google Drive:    AppData scope. Hidden in Drive UI; lives in the special
//                      `appDataFolder` that's per-app and per-user, so the
//                      backup doesn't clutter the user's main Drive.
// Callers can override either side via the `config` constructor argument.

import { Logger } from '../../utils/logger';

import { BackupEncryption, isEncryptedPayload } from './encryption';
import {
  BACKUP_FILE_PATH,
  parseBackupEnvelope,
  serializeBackupEnvelope,
  type BackupEnvelopeV1,
} from './schema';

export type CloudProviderId = 'icloud' | 'googledrive';

// Mirrors the library's `CloudStorageScope` enum without dragging it in at
// import time (the native module isn't available in unit tests).
export const CloudScopes = {
  Documents: 'documents',
  AppData: 'app_data',
} as const;
export type CloudScope = (typeof CloudScopes)[keyof typeof CloudScopes];

export type ICloudDocumentsMode = 'icloud' | 'legacy_sandbox';

export interface ICloudConfig {
  scope: CloudScope;
  documentsMode?: ICloudDocumentsMode;
}

export interface GoogleDriveConfig {
  scope: CloudScope;
}

export interface CloudBackupConfig {
  iCloud: ICloudConfig;
  googleDrive: GoogleDriveConfig;
}

export const DEFAULT_CLOUD_BACKUP_CONFIG: CloudBackupConfig = {
  iCloud: { scope: CloudScopes.Documents, documentsMode: 'icloud' },
  googleDrive: { scope: CloudScopes.AppData },
};

export interface CloudStorageLike {
  isCloudAvailable(): Promise<boolean>;
  exists(path: string, scope?: CloudScope): Promise<boolean>;
  readFile(path: string, scope?: CloudScope): Promise<string>;
  writeFile(path: string, data: string, scope?: CloudScope): Promise<void>;
  unlink(path: string, scope?: CloudScope): Promise<void>;
  stat(
    path: string,
    scope?: CloudScope
  ): Promise<{ size: number; mtimeMs: number; mtime: Date }>;
  getProvider(): CloudProviderId | string;
  setProviderOptions(options: Record<string, unknown>): void;
  /** Switch the active provider. Optional — not every backend supports it. */
  setProvider?(provider: CloudProviderId): void;
}

export interface CloudBackupOptions {
  storage: CloudStorageLike;
  filePath?: string;
  /** Override iCloud / Google Drive scope policy. Defaults to {@link DEFAULT_CLOUD_BACKUP_CONFIG}. */
  config?: Partial<CloudBackupConfig>;
  /**
   * If provided, the envelope is AES-256-GCM encrypted before upload and
   * auto-decrypted on download. Backwards-compatible: a plain envelope on
   * the cloud is still parsed correctly when this key is absent.
   */
  encryptionKey?: Uint8Array;
}

export interface CloudBackupMeta {
  exists: boolean;
  sizeBytes?: number;
  mtimeMs?: number;
}

export class CloudBackup {
  private readonly storage: CloudStorageLike;
  private readonly filePath: string;
  private readonly config: CloudBackupConfig;
  private readonly encryption: BackupEncryption;
  private encryptionKey: Uint8Array | null;
  private googleAccessToken: string | null = null;

  constructor(opts: CloudBackupOptions) {
    this.storage = opts.storage;
    this.filePath = opts.filePath ?? BACKUP_FILE_PATH;
    this.config = mergeConfig(opts.config);
    this.encryption = new BackupEncryption();
    this.encryptionKey = opts.encryptionKey ?? null;
    this.applyProviderOptions();
  }

  static fromNativeModule(opts?: {
    config?: Partial<CloudBackupConfig>;
    encryptionKey?: Uint8Array;
  }): CloudBackup {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-cloud-storage');
    const CloudStorage = mod.CloudStorage ?? mod.default;
    return new CloudBackup({
      storage: CloudStorage as CloudStorageLike,
      config: opts?.config,
      encryptionKey: opts?.encryptionKey,
    });
  }

  /**
   * Set/replace the encryption key at runtime. Pass `null` to disable
   * encryption (subsequent uploads are written in plain text).
   */
  setEncryptionKey(key: Uint8Array | null): void {
    this.encryptionKey = key;
  }

  /** Whether uploads will be encrypted. */
  isEncryptionEnabled(): boolean {
    return this.encryptionKey !== null;
  }

  getProvider(): CloudProviderId | string {
    return this.storage.getProvider();
  }

  /** The scope (Documents / AppData) the current provider will write into. */
  getActiveScope(): CloudScope {
    return this.resolveScopeForProvider(this.storage.getProvider());
  }

  async isAvailable(): Promise<boolean> {
    try {
      return await this.storage.isCloudAvailable();
    } catch (err) {
      Logger.warn('[CloudBackup] isCloudAvailable threw, treating as unavailable', err);
      return false;
    }
  }

  /**
   * Set the Google Drive access token. No-op on iCloud builds, but safe to
   * call regardless — the underlying provider ignores irrelevant options.
   */
  setGoogleAccessToken(token: string | null): void {
    this.googleAccessToken = token;
    try {
      this.storage.setProviderOptions({ accessToken: token });
    } catch (err) {
      Logger.warn('[CloudBackup] setProviderOptions threw', err);
    }
  }

  /**
   * Switch the active cloud provider at runtime (e.g. iCloud → Google Drive).
   * The underlying library resets provider options on switch, so re-apply the
   * per-provider scope and any Google access token set earlier.
   */
  setProvider(provider: CloudProviderId): void {
    if (typeof this.storage.setProvider !== 'function') {
      throw new Error('The active cloud storage backend cannot switch providers');
    }
    this.storage.setProvider(provider);
    this.applyProviderOptions();
    if (this.googleAccessToken !== null) {
      try {
        this.storage.setProviderOptions({ accessToken: this.googleAccessToken });
      } catch (err) {
        Logger.warn('[CloudBackup] re-applying Google token after switch failed', err);
      }
    }
  }

  async upload(env: BackupEnvelopeV1): Promise<void> {
    const data = this.encryptionKey
      ? this.encryption.encrypt(env, this.encryptionKey)
      : serializeBackupEnvelope(env);
    await this.storage.writeFile(this.filePath, data, this.getActiveScope());
  }

  async download(): Promise<BackupEnvelopeV1 | null> {
    const scope = this.getActiveScope();
    const exists = await this.storage.exists(this.filePath, scope);
    if (!exists) return null;
    const raw = await this.storage.readFile(this.filePath, scope);
    if (isEncryptedPayload(raw)) {
      if (!this.encryptionKey) {
        throw new Error(
          'Cloud backup is encrypted but no decryption key is set. Enable encryption and restore the same device key to read it.'
        );
      }
      return this.encryption.decrypt(raw, this.encryptionKey);
    }
    return parseBackupEnvelope(raw);
  }

  async stat(): Promise<CloudBackupMeta> {
    const scope = this.getActiveScope();
    const exists = await this.storage.exists(this.filePath, scope);
    if (!exists) return { exists: false };
    try {
      const s = await this.storage.stat(this.filePath, scope);
      return { exists: true, sizeBytes: s.size, mtimeMs: s.mtimeMs };
    } catch {
      return { exists: true };
    }
  }

  async deleteBackup(): Promise<void> {
    await this.storage.unlink(this.filePath, this.getActiveScope());
  }

  private resolveScopeForProvider(provider: string): CloudScope {
    if (provider === 'icloud') return this.config.iCloud.scope;
    if (provider === 'googledrive') return this.config.googleDrive.scope;
    // Unknown provider: prefer the safer hidden scope.
    return CloudScopes.AppData;
  }

  private applyProviderOptions(): void {
    try {
      const provider = this.storage.getProvider();
      if (provider === 'icloud') {
        const opts: Record<string, unknown> = { scope: this.config.iCloud.scope };
        if (this.config.iCloud.documentsMode) {
          opts.documentsMode = this.config.iCloud.documentsMode;
        }
        this.storage.setProviderOptions(opts);
      } else if (provider === 'googledrive') {
        this.storage.setProviderOptions({ scope: this.config.googleDrive.scope });
      }
    } catch (err) {
      Logger.warn('[CloudBackup] applyProviderOptions threw', err);
    }
  }
}

function mergeConfig(input: Partial<CloudBackupConfig> | undefined): CloudBackupConfig {
  if (!input) return cloneDefaultConfig();
  return {
    iCloud: { ...DEFAULT_CLOUD_BACKUP_CONFIG.iCloud, ...(input.iCloud ?? {}) },
    googleDrive: { ...DEFAULT_CLOUD_BACKUP_CONFIG.googleDrive, ...(input.googleDrive ?? {}) },
  };
}

function cloneDefaultConfig(): CloudBackupConfig {
  return {
    iCloud: { ...DEFAULT_CLOUD_BACKUP_CONFIG.iCloud },
    googleDrive: { ...DEFAULT_CLOUD_BACKUP_CONFIG.googleDrive },
  };
}
