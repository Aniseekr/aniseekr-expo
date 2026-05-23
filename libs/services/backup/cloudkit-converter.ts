// Bidirectional CloudKit ↔ BackupEnvelopeV1 converter.
//
// The new Expo app and the legacy SwiftUI aniseeker can share a single
// CloudKit container (iCloud.kidneyweakx.aniseeker, private DB). This module
// owns the JSON-shape contract that the native iOS bridge exchanges with JS:
//
//   - cloudKitRecordsToEnvelope(records)  -- IMPORT: SwiftUI app's data → new app
//   - envelopeToCloudKitRecords(env)      -- EXPORT: new app's data → SwiftUI app
//
// Both directions preserve the recordName so re-running the converter is
// idempotent: a UserRating that was already in CloudKit keeps its identity.
//
// The native bridge (modules/cloudkit-bridge) is responsible for actually
// fetching/writing the records. This file is pure JS so it's unit-testable
// without the native module.

import {
  BACKUP_APP_ID,
  BACKUP_SCHEMA_VERSION,
  createEmptyBackup,
  type BackupCollectionFolderItemRow,
  type BackupCollectionFolderRow,
  type BackupEnvelopeV1,
  type BackupUserAnimeRow,
} from './schema';

export const CLOUDKIT_RECORD_TYPES = [
  'UserRating',
  'TrackingAnime',
  'WatchedAnime',
  'WishlistItem',
  'CollectionFolder',
] as const;
export type CloudKitRecordType = (typeof CLOUDKIT_RECORD_TYPES)[number];

const LEGACY_SOURCE_APP = 'aniseeker-cloudkit';
const SWIFT_REFERENCE_EPOCH_SECONDS = 978307200;

// The exchange shape between the iOS native bridge and JS. recordName uniquely
// identifies the record inside the user's CloudKit zone. `fields` is a flat
// dictionary; we keep it loose so the native side can pass through whatever
// the underlying SwiftData @Model class declared without us having to keep two
// schemas in sync at the type level.
export interface CloudKitRecord {
  recordType: string;
  recordName: string;
  fields: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// IMPORT: CloudKit → BackupEnvelopeV1
// ---------------------------------------------------------------------------

export function cloudKitRecordsToEnvelope(records: CloudKitRecord[]): BackupEnvelopeV1 {
  const byAnimeId = new Map<string, BackupUserAnimeRow>();
  const collectionFolders: BackupCollectionFolderRow[] = [];
  const folderItems: BackupCollectionFolderItemRow[] = [];

  for (const rec of records) {
    if (!isKnownRecordType(rec.recordType)) continue;

    if (rec.recordType === 'CollectionFolder') {
      const folder = folderFromRecord(rec);
      if (folder) collectionFolders.push(folder);
      continue;
    }

    const row = animeRowFromRecord(rec);
    if (!row) continue;
    mergeUserAnime(byAnimeId, row);

    const folderRefRaw = rec.fields.folderRecordName;
    if (typeof folderRefRaw === 'string' && folderRefRaw.length > 0) {
      folderItems.push({
        folder_id: folderRefRaw,
        anime_id: row.anime_id,
        added_at: row.updated_at,
      });
    }
  }

  const env = createEmptyBackup();
  env.version = BACKUP_SCHEMA_VERSION;
  env.app = BACKUP_APP_ID;
  env.db.userAnime = [...byAnimeId.values()];
  env.db.collectionFolders = collectionFolders;
  env.db.collectionFolderItems = folderItems;
  env.legacy = { sourceApp: LEGACY_SOURCE_APP };
  return env;
}

function isKnownRecordType(t: string): t is CloudKitRecordType {
  return (CLOUDKIT_RECORD_TYPES as readonly string[]).includes(t);
}

function animeRowFromRecord(rec: CloudKitRecord): BackupUserAnimeRow | null {
  const f = rec.fields;
  const animeIdRaw = f.animeId;
  if (typeof animeIdRaw !== 'number' && typeof animeIdRaw !== 'string') return null;
  const anime_id = String(animeIdRaw);
  const title = typeof f.title === 'string' ? f.title : '';
  const image_url = typeof f.imageUrl === 'string' ? f.imageUrl : null;

  if (rec.recordType === 'UserRating') {
    const ratingType = typeof f.ratingType === 'string' ? f.ratingType : '';
    const myScore = numberOrNull(f.myScore);
    const score = myScore ?? scoreFromRatingType(ratingType);
    const createdAt = parseAnyDate(f.createdAt);
    return {
      anime_id,
      title,
      image_url,
      status: myScore !== null || ratingType === 'liked' ? 'completed' : 'planned',
      score,
      progress: 0,
      total_episodes: null,
      started_at: null,
      completed_at: createdAt,
      notes: null,
      rewatch_count: 0,
      updated_at: createdAt ?? Date.now(),
    };
  }

  if (rec.recordType === 'TrackingAnime') {
    return {
      anime_id,
      title,
      image_url,
      status: 'watching',
      score: null,
      progress: numberOrNull(f.currentEpisode) ?? 0,
      total_episodes: numberOrNull(f.totalEpisodes),
      started_at: null,
      completed_at: null,
      notes: null,
      rewatch_count: 0,
      updated_at: parseAnyDate(f.updatedAt) ?? Date.now(),
    };
  }

  if (rec.recordType === 'WatchedAnime') {
    const isCompleted = !!f.isCompleted;
    const completedAt = parseAnyDate(f.completedDate);
    const startedAt = parseAnyDate(f.startedDate);
    return {
      anime_id,
      title,
      image_url,
      status: isCompleted ? 'completed' : 'watching',
      score: null,
      progress: numberOrNull(f.watchedEpisodes) ?? 0,
      total_episodes: numberOrNull(f.totalEpisodes),
      started_at: startedAt,
      completed_at: completedAt,
      notes: null,
      rewatch_count: 0,
      updated_at: completedAt ?? startedAt ?? Date.now(),
    };
  }

  if (rec.recordType === 'WishlistItem') {
    const addedAt = parseAnyDate(f.addedDate);
    return {
      anime_id,
      title,
      image_url,
      status: 'planned',
      score: null,
      progress: 0,
      total_episodes: null,
      started_at: null,
      completed_at: null,
      notes: null,
      rewatch_count: 0,
      updated_at: addedAt ?? Date.now(),
    };
  }

  return null;
}

function folderFromRecord(rec: CloudKitRecord): BackupCollectionFolderRow | null {
  const f = rec.fields;
  if (truthy(f.isSystemFolder)) return null; // system folders are auto-managed locally
  const name = typeof f.name === 'string' ? f.name : '';
  if (!name) return null;
  return {
    id: rec.recordName,
    name,
    icon: typeof f.icon === 'string' ? f.icon : null,
    type: typeof f.folderType === 'string' ? f.folderType : 'custom',
    is_shared: truthy(f.isShared) ? 1 : 0,
    is_r18: truthy(f.isR18) ? 1 : 0,
    created_at: parseAnyDate(f.createdAt),
  };
}

function mergeUserAnime(
  by: Map<string, BackupUserAnimeRow>,
  row: BackupUserAnimeRow
): void {
  const prev = by.get(row.anime_id);
  if (!prev) {
    by.set(row.anime_id, row);
    return;
  }
  const score = (r: BackupUserAnimeRow): number => {
    if (r.status === 'completed') return 3;
    if (r.status === 'watching') return 2;
    return 1;
  };
  const winner = score(row) >= score(prev) ? row : prev;
  by.set(row.anime_id, {
    ...winner,
    score: winner.score ?? prev.score ?? row.score,
    total_episodes: winner.total_episodes ?? prev.total_episodes ?? row.total_episodes,
  });
}

// ---------------------------------------------------------------------------
// EXPORT: BackupEnvelopeV1 → CloudKit
// ---------------------------------------------------------------------------

export function envelopeToCloudKitRecords(env: BackupEnvelopeV1): CloudKitRecord[] {
  const records: CloudKitRecord[] = [];
  const folderByAnimeId = new Map<string, string>();
  for (const item of env.db.collectionFolderItems) {
    folderByAnimeId.set(item.anime_id, item.folder_id);
  }

  for (const folder of env.db.collectionFolders) {
    records.push({
      recordType: 'CollectionFolder',
      recordName: folder.id,
      fields: {
        name: folder.name,
        icon: folder.icon,
        folderType: folder.type,
        isSystemFolder: 0,
        isShared: folder.is_shared,
        isR18: folder.is_r18,
        createdAt: folder.created_at ?? null,
      },
    });
  }

  for (const a of env.db.userAnime) {
    const folderRef = folderByAnimeId.get(a.anime_id) ?? null;
    if (a.status === 'completed') {
      records.push({
        recordType: 'WatchedAnime',
        recordName: animeRecordName('WatchedAnime', a.anime_id),
        fields: {
          animeId: parseAnimeId(a.anime_id),
          title: a.title,
          imageUrl: a.image_url,
          watchedEpisodes: a.progress ?? 0,
          totalEpisodes: a.total_episodes,
          isCompleted: 1,
          startedDate: a.started_at,
          completedDate: a.completed_at,
          syncSource: null,
          folderRecordName: folderRef,
        },
      });
    } else if (a.status === 'watching') {
      records.push({
        recordType: 'TrackingAnime',
        recordName: animeRecordName('TrackingAnime', a.anime_id),
        fields: {
          animeId: parseAnimeId(a.anime_id),
          title: a.title,
          imageUrl: a.image_url,
          currentEpisode: a.progress ?? 0,
          totalEpisodes: a.total_episodes,
          trackingStatus: 'active',
          syncSource: null,
          folderRecordName: folderRef,
        },
      });
    } else {
      records.push({
        recordType: 'WishlistItem',
        recordName: animeRecordName('WishlistItem', a.anime_id),
        fields: {
          animeId: parseAnimeId(a.anime_id),
          title: a.title,
          imageUrl: a.image_url,
          priority: 0,
          addedDate: a.updated_at,
          folderRecordName: folderRef,
        },
      });
    }

    // For items that have a numeric score, also write a UserRating so the
    // SwiftUI app's "Score" UI lights up.
    if (typeof a.score === 'number') {
      records.push({
        recordType: 'UserRating',
        recordName: animeRecordName('UserRating', a.anime_id),
        fields: {
          animeId: parseAnimeId(a.anime_id),
          title: a.title,
          imageUrl: a.image_url,
          ratingType: a.score >= 8 ? 'liked' : a.score >= 4 ? 'neutral' : 'dislike',
          myScore: a.score,
          createdAt: a.updated_at,
          folderRecordName: folderRef,
        },
      });
    }
  }

  return records;
}

function animeRecordName(type: CloudKitRecordType, animeId: string): string {
  return `${type}-${animeId}`;
}

function parseAnimeId(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreFromRatingType(rt: string): number | null {
  if (rt === 'liked') return 10;
  if (rt === 'neutral') return 5;
  if (rt === 'dislike') return 1;
  return null;
}

function numberOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function truthy(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v === 'true' || v === '1';
  return false;
}

function parseAnyDate(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (v >= 1e11) return Math.floor(v);
  if (v >= 1e9) return Math.floor(v * 1000);
  if (v >= 0) return Math.floor((v + SWIFT_REFERENCE_EPOCH_SECONDS) * 1000);
  return null;
}
