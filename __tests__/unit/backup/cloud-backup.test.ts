import { describe, it, expect, beforeEach } from 'bun:test';

import {
  CloudBackup,
  type CloudStorageLike,
} from '../../../libs/services/backup/cloud-backup';
import { createEmptyBackup } from '../../../libs/services/backup/schema';

interface FakeCloud extends CloudStorageLike {
  _files: Map<string, string>;
  _lastOptions?: { accessToken?: string | null };
  _provider: 'icloud' | 'googledrive';
}

function makeFakeCloud(): FakeCloud {
  const files = new Map<string, string>();
  const fake: FakeCloud = {
    _files: files,
    _provider: 'icloud',
    async exists(path: string) {
      return files.has(path);
    },
    async readFile(path: string) {
      const v = files.get(path);
      if (!v) throw new Error('not found: ' + path);
      return v;
    },
    async writeFile(path: string, data: string) {
      files.set(path, data);
    },
    async unlink(path: string) {
      files.delete(path);
    },
    async stat(path: string) {
      const v = files.get(path);
      if (!v) throw new Error('not found');
      return { size: v.length, mtimeMs: 1234, mtime: new Date(1234) };
    },
    async isCloudAvailable() {
      return true;
    },
    getProvider() {
      return fake._provider;
    },
    setProviderOptions(opts: { accessToken?: string | null }) {
      fake._lastOptions = opts;
    },
    setProvider(provider) {
      fake._provider = provider;
    },
  };
  return fake;
}

describe('backup/cloud-backup', () => {
  let cloud: ReturnType<typeof makeFakeCloud>;
  let svc: CloudBackup;

  beforeEach(() => {
    cloud = makeFakeCloud();
    svc = new CloudBackup({ storage: cloud });
  });

  it('CLOUD-001 isAvailable mirrors the underlying provider', async () => {
    expect(await svc.isAvailable()).toBe(true);
    cloud.isCloudAvailable = async () => false;
    expect(await svc.isAvailable()).toBe(false);
  });

  it('CLOUD-002 upload writes serialized envelope to /aniseekr-backup.json', async () => {
    const env = createEmptyBackup();
    await svc.upload(env);
    expect(cloud._files.has('/aniseekr-backup.json')).toBe(true);
    const stored = cloud._files.get('/aniseekr-backup.json')!;
    expect(JSON.parse(stored).version).toBe(1);
  });

  it('CLOUD-003 download reads + parses the envelope, returns null when missing', async () => {
    expect(await svc.download()).toBeNull();
    await svc.upload(createEmptyBackup());
    const env = await svc.download();
    expect(env).not.toBeNull();
    expect(env?.version).toBe(1);
  });

  it('CLOUD-004 setGoogleAccessToken forwards to the underlying provider', () => {
    svc.setGoogleAccessToken('test-token');
    expect(cloud._lastOptions).toEqual({ accessToken: 'test-token' });
  });

  it('CLOUD-005 delete unlinks the backup file', async () => {
    await svc.upload(createEmptyBackup());
    expect(cloud._files.has('/aniseekr-backup.json')).toBe(true);
    await svc.deleteBackup();
    expect(cloud._files.has('/aniseekr-backup.json')).toBe(false);
  });

  it('CLOUD-006 encrypts uploads when a key is set, and auto-decrypts downloads', async () => {
    const { generateBackupKey, isEncryptedPayload } = await import(
      '../../../libs/services/backup/encryption'
    );
    const key = generateBackupKey();
    const cipherCloud = makeFakeCloud();
    const cipherSvc = new CloudBackup({ storage: cipherCloud, encryptionKey: key });

    await cipherSvc.upload(createEmptyBackup());
    const raw = cipherCloud._files.values().next().value as string;
    expect(isEncryptedPayload(raw)).toBe(true);

    const env = await cipherSvc.download();
    expect(env?.version).toBe(1);
  });

  it('CLOUD-007 throws helpful error when downloading an encrypted file without a key', async () => {
    const { generateBackupKey } = await import('../../../libs/services/backup/encryption');
    const key = generateBackupKey();
    const cipherCloud = makeFakeCloud();
    const cipherSvc = new CloudBackup({ storage: cipherCloud, encryptionKey: key });
    await cipherSvc.upload(createEmptyBackup());

    const unkeyedSvc = new CloudBackup({ storage: cipherCloud });
    await expect(unkeyedSvc.download()).rejects.toThrow(/encrypted/);
  });

  it('CLOUD-008 setProvider switches provider and re-applies scope + Google token', () => {
    svc.setGoogleAccessToken('tok-1');
    svc.setProvider('googledrive');

    expect(cloud._provider).toBe('googledrive');
    expect(svc.getActiveScope()).toBe('app_data');
    // The library resets provider options on switch — the token must survive.
    expect(cloud._lastOptions).toEqual({ accessToken: 'tok-1' });
  });
});
