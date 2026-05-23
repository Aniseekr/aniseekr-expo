import { describe, it, expect, beforeEach } from 'bun:test';

import {
  BackupService,
  type BackupServiceDeps,
} from '../../../libs/services/backup/backup-service';
import {
  BACKUP_SCHEMA_VERSION,
  createEmptyBackup,
  type BackupEnvelopeV1,
} from '../../../libs/services/backup/schema';

import { makeFakeDb, makeFakeStorage, type FakeDb } from './fakes';

describe('backup/backup-service', () => {
  let db: FakeDb;
  let storage: ReturnType<typeof makeFakeStorage>;
  let svc: BackupService;
  let deps: BackupServiceDeps;

  beforeEach(() => {
    db = makeFakeDb();
    storage = makeFakeStorage();
    deps = {
      getDb: async () => db.handle(),
      getStorage: () => storage.handle,
    };
    svc = new BackupService(deps);
  });

  it('BACKUP-100 createSnapshot reads each table into the envelope', async () => {
    db.tables.favorites.set('1', { id: '1', title: 'Bebop', image: 'img', addedAt: 10 });
    db.tables.favorites.set('2', { id: '2', title: 'Frieren', image: 'img2', addedAt: 20 });
    db.tables.ratings.set('1', { id: '1', rating: 'like', timestamp: 11 });
    db.tables.user_anime.set('1', {
      anime_id: '1',
      title: 'Bebop',
      image_url: 'img',
      status: 'completed',
      score: 9,
      progress: 26,
      total_episodes: 26,
      started_at: 100,
      completed_at: 200,
      updated_at: 200,
    });
    db.tables.collection_folders.set('f1', {
      id: 'f1',
      name: 'Custom',
      icon: 'folder',
      type: 'custom',
      is_shared: 0,
      is_r18: 0,
      created_at: 5,
    });
    db.tables.collection_folder_items.set('f1#1', { folder_id: 'f1', anime_id: '1', added_at: 30 });

    const env = await svc.createSnapshot();

    expect(env.version).toBe(BACKUP_SCHEMA_VERSION);
    expect(env.app).toBe('aniseekr-expo');
    expect(env.db.favorites).toHaveLength(2);
    expect(env.db.favorites[0]?.id).toBe('1');
    expect(env.db.ratings).toHaveLength(1);
    expect(env.db.userAnime).toHaveLength(1);
    expect(env.db.userAnime[0]?.score).toBe(9);
    expect(env.db.collectionFolders).toHaveLength(1);
    expect(env.db.collectionFolderItems).toHaveLength(1);
  });

  it('BACKUP-101 createSnapshot pulls prefs from AsyncStorage when present', async () => {
    await storage.handle.setItem('aniseekr.user.prefs.v1', '{"cardHeightPercent":90}');
    await storage.handle.setItem('aniseekr.collection.sortMode.v1', 'newest');
    await storage.handle.setItem('aniseekr.bangumi.prefs.v1', '{"showAdult":true}');

    const env = await svc.createSnapshot();

    expect(env.prefs.user).toBe('{"cardHeightPercent":90}');
    expect(env.prefs.collectionSortMode).toBe('newest');
    expect(env.prefs.bangumi).toBe('{"showAdult":true}');
  });

  it('BACKUP-102 restoreSnapshot writes rows back via INSERT OR REPLACE (round-trip)', async () => {
    const env: BackupEnvelopeV1 = {
      ...createEmptyBackup(),
      db: {
        favorites: [{ id: '7', title: 'X', image: '', addedAt: 1 }],
        ratings: [{ id: '7', rating: 'like', timestamp: 2 }],
        userAnime: [
          {
            anime_id: '7',
            title: 'X',
            image_url: '',
            status: 'watching',
            score: null,
            progress: 1,
            total_episodes: null,
            started_at: null,
            completed_at: null,
            notes: null,
            rewatch_count: 0,
            updated_at: 3,
          },
        ],
        collectionFolders: [
          {
            id: 'fA',
            name: 'A',
            icon: null,
            type: 'custom',
            is_shared: 0,
            is_r18: 0,
            created_at: 4,
          },
        ],
        collectionFolderItems: [{ folder_id: 'fA', anime_id: '7', added_at: 5 }],
      },
      prefs: { user: null, collectionSortMode: null, bangumi: null },
    };

    const summary = await svc.restoreSnapshot(env);

    expect(summary.favorites).toBe(1);
    expect(summary.ratings).toBe(1);
    expect(summary.userAnime).toBe(1);
    expect(summary.collectionFolders).toBe(1);
    expect(summary.collectionFolderItems).toBe(1);

    expect(db.tables.favorites.get('7')?.title).toBe('X');
    expect(db.tables.ratings.get('7')?.rating).toBe('like');
    expect(db.tables.user_anime.get('7')?.status).toBe('watching');
    expect(db.tables.collection_folders.get('fA')?.name).toBe('A');
    expect(db.tables.collection_folder_items.get('fA#7')?.added_at).toBe(5);
  });

  it('BACKUP-103 restoreSnapshot is idempotent — restoring the same envelope twice leaves the same rows', async () => {
    db.tables.favorites.set('1', { id: '1', title: 'pre-existing', image: '', addedAt: 1 });

    const env: BackupEnvelopeV1 = {
      ...createEmptyBackup(),
      db: {
        favorites: [{ id: '1', title: 'new', image: '', addedAt: 2 }],
        ratings: [],
        userAnime: [],
        collectionFolders: [],
        collectionFolderItems: [],
      },
      prefs: { user: null, collectionSortMode: null, bangumi: null },
    };

    await svc.restoreSnapshot(env);
    await svc.restoreSnapshot(env);

    expect(db.tables.favorites.size).toBe(1);
    expect(db.tables.favorites.get('1')?.title).toBe('new');
  });

  it('BACKUP-104 restoreSnapshot writes prefs back to AsyncStorage', async () => {
    const env: BackupEnvelopeV1 = {
      ...createEmptyBackup(),
      prefs: {
        user: '{"cardHeightPercent":75}',
        collectionSortMode: 'oldest',
        bangumi: '{"showAdult":false}',
      },
    };

    const summary = await svc.restoreSnapshot(env);

    expect(summary.prefsRestored.sort()).toEqual(
      ['aniseekr.bangumi.prefs.v1', 'aniseekr.collection.sortMode.v1', 'aniseekr.user.prefs.v1'].sort()
    );
    expect(await storage.handle.getItem('aniseekr.user.prefs.v1')).toBe('{"cardHeightPercent":75}');
    expect(await storage.handle.getItem('aniseekr.collection.sortMode.v1')).toBe('oldest');
    expect(await storage.handle.getItem('aniseekr.bangumi.prefs.v1')).toBe('{"showAdult":false}');
  });

  it('BACKUP-105 round-trips: snapshot → serialize → parse → restore reproduces the original tables', async () => {
    db.tables.favorites.set('a', { id: 'a', title: 'A', image: 'i', addedAt: 100 });
    db.tables.user_anime.set('a', {
      anime_id: 'a',
      title: 'A',
      image_url: 'i',
      status: 'planned',
      score: null,
      progress: 0,
      total_episodes: 12,
      started_at: null,
      completed_at: null,
      updated_at: 200,
    });
    await storage.handle.setItem('aniseekr.user.prefs.v1', '{"allowAdultContent":true}');

    const env = await svc.createSnapshot();
    const json = JSON.stringify(env);

    // New empty target.
    const db2 = makeFakeDb();
    const storage2 = makeFakeStorage();
    const svc2 = new BackupService({
      getDb: async () => db2.handle(),
      getStorage: () => storage2.handle,
    });

    await svc2.restoreSnapshot(env);
    await svc2.restoreSnapshot(JSON.parse(json) as BackupEnvelopeV1);

    expect(db2.tables.favorites.size).toBe(1);
    expect(db2.tables.favorites.get('a')?.title).toBe('A');
    expect(db2.tables.user_anime.get('a')?.total_episodes).toBe(12);
    expect(await storage2.handle.getItem('aniseekr.user.prefs.v1')).toBe(
      '{"allowAdultContent":true}'
    );
  });
});
