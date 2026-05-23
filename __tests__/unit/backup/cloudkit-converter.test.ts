import { describe, it, expect } from 'bun:test';

import {
  cloudKitRecordsToEnvelope,
  envelopeToCloudKitRecords,
  CLOUDKIT_RECORD_TYPES,
  type CloudKitRecord,
} from '../../../libs/services/backup/cloudkit-converter';
import { createEmptyBackup, type BackupEnvelopeV1 } from '../../../libs/services/backup/schema';

// Reference fixture: what the native CloudKit bridge would hand us after
// fetching from CKContainer.privateCloudDatabase. recordType names mirror the
// SwiftData @Model class names from Schema+V2.swift exactly.
const SAMPLE_FETCH: CloudKitRecord[] = [
  {
    recordType: 'CollectionFolder',
    recordName: 'F1F1F1F1-AAAA-BBBB-CCCC-000000000001',
    fields: {
      name: 'Favorites mirror',
      icon: 'star',
      isSystemFolder: 0,
      folderType: 'custom',
      isShared: 0,
      isR18: 0,
      sortOrder: 1,
      createdAt: 740102400, // Swift reference-date Double (2024-06-15Z)
    },
  },
  {
    recordType: 'UserRating',
    recordName: 'R1R1R1R1-AAAA-BBBB-CCCC-000000000010',
    fields: {
      animeId: 1,
      title: 'Cowboy Bebop',
      imageUrl: 'https://cdn/bebop.jpg',
      ratingType: 'liked',
      myScore: 9.5,
      createdAt: 740102400,
      syncSource: 'mal,anilist',
      folderRecordName: 'F1F1F1F1-AAAA-BBBB-CCCC-000000000001',
    },
  },
  {
    recordType: 'TrackingAnime',
    recordName: 'T1T1T1T1-AAAA-BBBB-CCCC-000000000020',
    fields: {
      animeId: 2,
      title: 'Frieren',
      imageUrl: 'https://cdn/frieren.jpg',
      currentEpisode: 14,
      totalEpisodes: 28,
      trackingStatus: 'active',
      syncSource: 'anilist',
    },
  },
  {
    recordType: 'WatchedAnime',
    recordName: 'W1W1W1W1-AAAA-BBBB-CCCC-000000000030',
    fields: {
      animeId: 3,
      title: 'Steins;Gate',
      watchedEpisodes: 24,
      totalEpisodes: 24,
      isCompleted: 1,
      completedDate: 757036800, // 2024-12-29Z
      syncSource: 'mal',
    },
  },
  {
    recordType: 'WishlistItem',
    recordName: 'P1P1P1P1-AAAA-BBBB-CCCC-000000000040',
    fields: {
      animeId: 4,
      title: 'Future show',
      priority: 2,
      addedDate: 791510400,
    },
  },
];

describe('backup/cloudkit-converter · import (CloudKit → envelope)', () => {
  it('CK-001 maps a full fetch into the v1 envelope with sourceApp=aniseeker-cloudkit', () => {
    const env = cloudKitRecordsToEnvelope(SAMPLE_FETCH);
    expect(env.version).toBe(1);
    expect(env.legacy?.sourceApp).toBe('aniseeker-cloudkit');
    expect(env.db.userAnime).toHaveLength(4); // rating + tracking + watched + wishlist
    expect(env.db.collectionFolders).toHaveLength(1);
  });

  it('CK-002 UserRating with high score → status=completed, score preserved', () => {
    const env = cloudKitRecordsToEnvelope(SAMPLE_FETCH);
    const r1 = env.db.userAnime.find((r) => r.anime_id === '1');
    expect(r1?.status).toBe('completed');
    expect(r1?.score).toBe(9.5);
    expect(r1?.title).toBe('Cowboy Bebop');
  });

  it('CK-003 TrackingAnime → status=watching, progress preserved', () => {
    const env = cloudKitRecordsToEnvelope(SAMPLE_FETCH);
    const t = env.db.userAnime.find((r) => r.anime_id === '2');
    expect(t?.status).toBe('watching');
    expect(t?.progress).toBe(14);
    expect(t?.total_episodes).toBe(28);
  });

  it('CK-004 WatchedAnime with isCompleted=1 → status=completed, completed_at set', () => {
    const env = cloudKitRecordsToEnvelope(SAMPLE_FETCH);
    const w = env.db.userAnime.find((r) => r.anime_id === '3');
    expect(w?.status).toBe('completed');
    expect(w?.progress).toBe(24);
    expect(typeof w?.completed_at).toBe('number');
  });

  it('CK-005 WishlistItem → status=planned', () => {
    const env = cloudKitRecordsToEnvelope(SAMPLE_FETCH);
    const p = env.db.userAnime.find((r) => r.anime_id === '4');
    expect(p?.status).toBe('planned');
  });

  it('CK-006 CollectionFolder with skipSystemFolders option excludes system folders', () => {
    const fetch: CloudKitRecord[] = [
      ...SAMPLE_FETCH,
      {
        recordType: 'CollectionFolder',
        recordName: 'SYS-ALL',
        fields: { name: 'All', isSystemFolder: 1, folderType: 'all' },
      },
    ];
    const env = cloudKitRecordsToEnvelope(fetch);
    expect(env.db.collectionFolders).toHaveLength(1);
    expect(env.db.collectionFolders[0]?.id).toBe('F1F1F1F1-AAAA-BBBB-CCCC-000000000001');
  });

  it('CK-007 folder relationship (folderRecordName) populates collectionFolderItems', () => {
    const env = cloudKitRecordsToEnvelope(SAMPLE_FETCH);
    const item = env.db.collectionFolderItems.find(
      (i) => i.folder_id === 'F1F1F1F1-AAAA-BBBB-CCCC-000000000001'
    );
    expect(item?.anime_id).toBe('1');
  });

  it('CK-008 deduplicates animeId across multiple recordTypes (tracking > planned)', () => {
    const fetch: CloudKitRecord[] = [
      {
        recordType: 'WishlistItem',
        recordName: 'P-X',
        fields: { animeId: 99, title: 'Same anime' },
      },
      {
        recordType: 'TrackingAnime',
        recordName: 'T-X',
        fields: { animeId: 99, title: 'Same anime', currentEpisode: 3 },
      },
    ];
    const env = cloudKitRecordsToEnvelope(fetch);
    expect(env.db.userAnime).toHaveLength(1);
    expect(env.db.userAnime[0]?.status).toBe('watching');
    expect(env.db.userAnime[0]?.progress).toBe(3);
  });

  it('CK-009 ignores records with unknown recordType', () => {
    const fetch: CloudKitRecord[] = [
      ...SAMPLE_FETCH,
      { recordType: 'UnknownGarbage', recordName: 'x', fields: { foo: 'bar' } },
    ];
    const env = cloudKitRecordsToEnvelope(fetch);
    expect(env.db.userAnime).toHaveLength(4); // no garbage row
  });
});

describe('backup/cloudkit-converter · export (envelope → CloudKit)', () => {
  function makeEnv(): BackupEnvelopeV1 {
    return {
      ...createEmptyBackup(),
      db: {
        favorites: [{ id: '1', title: 'Bebop', image: null, addedAt: 1 }],
        ratings: [{ id: '1', rating: 'like', timestamp: 1 }],
        userAnime: [
          {
            anime_id: '1',
            title: 'Bebop',
            image_url: 'img',
            status: 'completed',
            score: 10,
            progress: 26,
            total_episodes: 26,
            started_at: 1,
            completed_at: 100,
            notes: null,
            rewatch_count: 0,
            updated_at: 100,
          },
          {
            anime_id: '2',
            title: 'Frieren',
            image_url: null,
            status: 'watching',
            score: null,
            progress: 14,
            total_episodes: 28,
            started_at: null,
            completed_at: null,
            notes: null,
            rewatch_count: 0,
            updated_at: 200,
          },
          {
            anime_id: '3',
            title: 'Planning',
            image_url: null,
            status: 'planned',
            score: null,
            progress: 0,
            total_episodes: null,
            started_at: null,
            completed_at: null,
            notes: null,
            rewatch_count: 0,
            updated_at: 300,
          },
        ],
        collectionFolders: [
          {
            id: 'F1',
            name: 'Mine',
            icon: 'star',
            type: 'custom',
            is_shared: 0,
            is_r18: 0,
            created_at: 5,
          },
        ],
        collectionFolderItems: [{ folder_id: 'F1', anime_id: '1', added_at: 10 }],
      },
    };
  }

  it('CK-100 produces a record for every userAnime, plus folders', () => {
    const records = envelopeToCloudKitRecords(makeEnv());
    const types = records.map((r) => r.recordType);
    expect(types.filter((t) => t === 'CollectionFolder')).toHaveLength(1);
    expect(types.filter((t) => t === 'WatchedAnime')).toHaveLength(1); // status=completed → watched
    expect(types.filter((t) => t === 'TrackingAnime')).toHaveLength(1); // status=watching
    expect(types.filter((t) => t === 'WishlistItem')).toHaveLength(1); // status=planned
  });

  it('CK-101 export → import is a round-trip on userAnime status mapping', () => {
    const original = makeEnv();
    const records = envelopeToCloudKitRecords(original);
    const reimported = cloudKitRecordsToEnvelope(records);

    const animeIds = reimported.db.userAnime.map((r) => r.anime_id).sort();
    expect(animeIds).toEqual(['1', '2', '3']);

    const statusOf = (id: string) =>
      reimported.db.userAnime.find((r) => r.anime_id === id)?.status;
    expect(statusOf('1')).toBe('completed');
    expect(statusOf('2')).toBe('watching');
    expect(statusOf('3')).toBe('planned');
  });

  it('CK-102 export records carry folderRecordName pointing back at the folder', () => {
    const records = envelopeToCloudKitRecords(makeEnv());
    // The watched record for anime_id=1 should reference folder F1.
    const watched = records.find(
      (r) => r.recordType === 'WatchedAnime' && r.fields.animeId === 1
    );
    expect(watched?.fields.folderRecordName).toBe('F1');
  });

  it('CK-103 exposes the canonical recordType list', () => {
    expect(CLOUDKIT_RECORD_TYPES).toContain('UserRating');
    expect(CLOUDKIT_RECORD_TYPES).toContain('TrackingAnime');
    expect(CLOUDKIT_RECORD_TYPES).toContain('WatchedAnime');
    expect(CLOUDKIT_RECORD_TYPES).toContain('WishlistItem');
    expect(CLOUDKIT_RECORD_TYPES).toContain('CollectionFolder');
  });
});
