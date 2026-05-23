import { describe, it, expect } from 'bun:test';

import {
  BACKUP_FILE_PATH,
  BACKUP_SCHEMA_VERSION,
  createEmptyBackup,
  parseBackupEnvelope,
  serializeBackupEnvelope,
  type BackupEnvelopeV1,
} from '../../../libs/services/backup/schema';

describe('backup/schema', () => {
  it('BACKUP-001 exposes the current schema version (1) and a stable file path', () => {
    expect(BACKUP_SCHEMA_VERSION).toBe(1);
    expect(BACKUP_FILE_PATH).toBe('/aniseekr-backup.json');
  });

  it('BACKUP-002 createEmptyBackup returns a valid v1 envelope with empty arrays and current timestamp', () => {
    const before = Date.now();
    const env = createEmptyBackup();
    const after = Date.now();

    expect(env.version).toBe(1);
    expect(env.app).toBe('aniseekr-expo');
    expect(env.createdAt).toBeGreaterThanOrEqual(before);
    expect(env.createdAt).toBeLessThanOrEqual(after);
    expect(env.db.favorites).toEqual([]);
    expect(env.db.ratings).toEqual([]);
    expect(env.db.userAnime).toEqual([]);
    expect(env.db.collectionFolders).toEqual([]);
    expect(env.db.collectionFolderItems).toEqual([]);
    expect(env.prefs).toEqual({ user: null, collectionSortMode: null, bangumi: null });
  });

  it('BACKUP-003 round-trips through serializeBackupEnvelope / parseBackupEnvelope', () => {
    const env: BackupEnvelopeV1 = {
      ...createEmptyBackup(),
      createdAt: 1700000000000,
      db: {
        favorites: [{ id: '42', title: 'A', image: 'img', addedAt: 1 }],
        ratings: [{ id: '42', rating: 'like', timestamp: 2 }],
        userAnime: [
          {
            anime_id: '42',
            title: 'A',
            image_url: 'img',
            status: 'watching',
            score: 8,
            progress: 3,
            total_episodes: 12,
            started_at: 3,
            completed_at: null,
            notes: null,
            rewatch_count: 0,
            updated_at: 4,
          },
        ],
        collectionFolders: [
          {
            id: 'f1',
            name: 'Custom',
            icon: 'folder',
            type: 'custom',
            is_shared: 0,
            is_r18: 0,
            created_at: 5,
          },
        ],
        collectionFolderItems: [{ folder_id: 'f1', anime_id: '42', added_at: 6 }],
      },
      prefs: { user: null, collectionSortMode: 'newest', bangumi: null },
    };

    const serialized = serializeBackupEnvelope(env);
    expect(serialized).toContain('"version":1');
    const parsed = parseBackupEnvelope(serialized);
    expect(parsed).toEqual(env);
  });

  it('BACKUP-004 parseBackupEnvelope rejects unknown / future versions explicitly', () => {
    const future = JSON.stringify({ version: 99, app: 'aniseekr-expo', createdAt: 0, db: {} });
    expect(() => parseBackupEnvelope(future)).toThrow(/unsupported.*version/i);
  });

  it('BACKUP-005 parseBackupEnvelope rejects malformed payloads (missing version / non-object db)', () => {
    expect(() => parseBackupEnvelope('{}')).toThrow();
    expect(() => parseBackupEnvelope('null')).toThrow();
    expect(() => parseBackupEnvelope('not json at all')).toThrow();
    expect(() =>
      parseBackupEnvelope(JSON.stringify({ version: 1, app: 'x', createdAt: 0, db: 'oops' }))
    ).toThrow();
  });

  it('BACKUP-006 parseBackupEnvelope tolerates extra unknown fields (forward-compat)', () => {
    const raw = JSON.stringify({
      version: 1,
      app: 'aniseekr-expo',
      createdAt: 1,
      db: {
        favorites: [],
        ratings: [],
        userAnime: [],
        collectionFolders: [],
        collectionFolderItems: [],
        somethingNew: [{ x: 1 }],
      },
      prefs: { user: null, collectionSortMode: null, bangumi: null },
      futureField: 'ok',
    });
    const env = parseBackupEnvelope(raw);
    expect(env.version).toBe(1);
    expect(env.db.favorites).toEqual([]);
  });

  it('BACKUP-007 parseBackupEnvelope defaults missing optional sections to empty', () => {
    const raw = JSON.stringify({
      version: 1,
      app: 'aniseekr-expo',
      createdAt: 1,
      db: { favorites: [{ id: '1', title: 't', image: '', addedAt: 1 }] },
    });
    const env = parseBackupEnvelope(raw);
    expect(env.db.favorites).toHaveLength(1);
    expect(env.db.ratings).toEqual([]);
    expect(env.db.userAnime).toEqual([]);
    expect(env.db.collectionFolders).toEqual([]);
    expect(env.db.collectionFolderItems).toEqual([]);
    expect(env.prefs).toEqual({ user: null, collectionSortMode: null, bangumi: null });
  });
});
