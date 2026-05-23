import { describe, it, expect } from 'bun:test';

import { BackupService } from '../../../libs/services/backup/backup-service';
import { createEmptyBackup, type BackupEnvelopeV1 } from '../../../libs/services/backup/schema';

import { makeFakeDb, makeFakeStorage } from './fakes';

describe('backup/backup-service · dryRunRestore', () => {
  it('DIFF-001 reports per-table added counts when local is empty', async () => {
    const db = makeFakeDb();
    const storage = makeFakeStorage();
    const svc = new BackupService({
      getDb: async () => db.handle(),
      getStorage: () => storage.handle,
    });

    const env: BackupEnvelopeV1 = {
      ...createEmptyBackup(),
      db: {
        favorites: [
          { id: '1', title: 'a', image: null, addedAt: 1 },
          { id: '2', title: 'b', image: null, addedAt: 2 },
        ],
        ratings: [{ id: '1', rating: 'like', timestamp: 1 }],
        userAnime: [
          {
            anime_id: '1',
            title: 'a',
            image_url: null,
            status: 'watching',
            score: null,
            progress: 0,
            total_episodes: null,
            started_at: null,
            completed_at: null,
            notes: null,
            rewatch_count: 0,
            updated_at: 1,
          },
        ],
        collectionFolders: [
          { id: 'f1', name: 'A', icon: null, type: 'custom', is_shared: 0, is_r18: 0, created_at: 1 },
        ],
        collectionFolderItems: [{ folder_id: 'f1', anime_id: '1', added_at: 1 }],
      },
    };

    const diff = await svc.dryRunRestore(env);
    expect(diff.favorites).toEqual({ added: 2, changed: 0, identical: 0 });
    expect(diff.ratings).toEqual({ added: 1, changed: 0, identical: 0 });
    expect(diff.userAnime).toEqual({ added: 1, changed: 0, identical: 0 });
    expect(diff.collectionFolders).toEqual({ added: 1, changed: 0, identical: 0 });
    expect(diff.collectionFolderItems).toEqual({ added: 1, changed: 0, identical: 0 });
    expect(diff.hasChanges).toBe(true);
  });

  it('DIFF-002 reports `identical` when local already matches the envelope row-for-row', async () => {
    const db = makeFakeDb();
    db.tables.favorites.set('1', { id: '1', title: 'same', image: null, addedAt: 5 });
    db.tables.user_anime.set('1', {
      anime_id: '1',
      title: 'same',
      image_url: null,
      status: 'watching',
      score: null,
      progress: 0,
      total_episodes: null,
      started_at: null,
      completed_at: null,
      notes: null,
      rewatch_count: 0,
      updated_at: 5,
    });
    const storage = makeFakeStorage();
    const svc = new BackupService({
      getDb: async () => db.handle(),
      getStorage: () => storage.handle,
    });

    const env: BackupEnvelopeV1 = {
      ...createEmptyBackup(),
      db: {
        favorites: [{ id: '1', title: 'same', image: null, addedAt: 5 }],
        ratings: [],
        userAnime: [
          {
            anime_id: '1',
            title: 'same',
            image_url: null,
            status: 'watching',
            score: null,
            progress: 0,
            total_episodes: null,
            started_at: null,
            completed_at: null,
            notes: null,
            rewatch_count: 0,
            updated_at: 5,
          },
        ],
        collectionFolders: [],
        collectionFolderItems: [],
      },
    };

    const diff = await svc.dryRunRestore(env);
    expect(diff.favorites).toEqual({ added: 0, changed: 0, identical: 1 });
    expect(diff.userAnime).toEqual({ added: 0, changed: 0, identical: 1 });
    expect(diff.hasChanges).toBe(false);
  });

  it('DIFF-003 reports `changed` when a local row exists but differs from the envelope row', async () => {
    const db = makeFakeDb();
    db.tables.user_anime.set('1', {
      anime_id: '1',
      title: 'old',
      image_url: null,
      status: 'planned',
      score: null,
      progress: 0,
      total_episodes: null,
      started_at: null,
      completed_at: null,
      notes: null,
      rewatch_count: 0,
      updated_at: 1,
    });
    const storage = makeFakeStorage();
    const svc = new BackupService({
      getDb: async () => db.handle(),
      getStorage: () => storage.handle,
    });

    const env: BackupEnvelopeV1 = {
      ...createEmptyBackup(),
      db: {
        favorites: [],
        ratings: [],
        userAnime: [
          {
            anime_id: '1',
            title: 'new',
            image_url: 'updated',
            status: 'completed',
            score: 9,
            progress: 12,
            total_episodes: 12,
            started_at: null,
            completed_at: 2,
            notes: null,
            rewatch_count: 0,
            updated_at: 2,
          },
        ],
        collectionFolders: [],
        collectionFolderItems: [],
      },
    };

    const diff = await svc.dryRunRestore(env);
    expect(diff.userAnime).toEqual({ added: 0, changed: 1, identical: 0 });
    expect(diff.hasChanges).toBe(true);
  });

  it('DIFF-004 prefsChanges reports which AsyncStorage keys will be overwritten', async () => {
    const db = makeFakeDb();
    const storage = makeFakeStorage();
    await storage.handle.setItem('aniseekr.user.prefs.v1', '{"cardHeightPercent":85}');
    const svc = new BackupService({
      getDb: async () => db.handle(),
      getStorage: () => storage.handle,
    });

    const env: BackupEnvelopeV1 = {
      ...createEmptyBackup(),
      prefs: {
        user: '{"cardHeightPercent":75}', // different
        collectionSortMode: 'newest', // new key
        bangumi: null, // unchanged (no overwrite)
      },
    };

    const diff = await svc.dryRunRestore(env);
    expect(diff.prefsChanges.changed.sort()).toEqual(['aniseekr.user.prefs.v1']);
    expect(diff.prefsChanges.added.sort()).toEqual(['aniseekr.collection.sortMode.v1']);
    expect(diff.prefsChanges.skipped.sort()).toEqual(['aniseekr.bangumi.prefs.v1']);
  });
});
