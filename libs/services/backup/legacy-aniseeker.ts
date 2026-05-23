// Adapter from legacy SwiftUI aniseeker exports → current BackupEnvelopeV1.
//
// The old aniseeker (SwiftUI/SwiftData) shipped two shapes that we treat as
// "legacy backups":
//
// 1. `RatingMigrationData[]` — the V1→V2 migration intermediate format.
//    Encoded by JSONEncoder().encode(dataToMigrate) into UserDefaults under
//    `migration_v1_v2_data`. This is the canonical legacy export.
//
// 2. A V2-style snapshot bundling UserRating / TrackingAnime / WatchedAnime /
//    WishlistItem / CollectionFolder. The old app never exposed an "Export"
//    button publicly, but the persistence layer holds these exact entities and
//    users may have hand-rolled an export. We tolerate both shapes.
//
// The output is a standard BackupEnvelopeV1 — the same shape produced by the
// current app — so the same restore path can ingest it.

import {
  BACKUP_APP_ID,
  BACKUP_SCHEMA_VERSION,
  createEmptyBackup,
  type BackupCollectionFolderItemRow,
  type BackupCollectionFolderRow,
  type BackupEnvelopeV1,
  type BackupFavoriteRow,
  type BackupRatingRow,
  type BackupUserAnimeRow,
} from './schema';

export type LegacyRatingType = 'liked' | 'neutral' | 'dislike' | 'tracking' | (string & {});

// A legacy timestamp may arrive as:
//   - an ISO 8601 string (Swift JSONEncoder with .iso8601 strategy)
//   - a Swift reference-date Double (DEFAULT strategy — seconds since
//     2001-01-01T00:00:00Z, range ~0…1e9 for plausible years)
//   - a s-epoch Number (seconds since 1970, ≥1e9 for plausible years)
//   - a ms-epoch Number (milliseconds since 1970, ≥1e11)
// We disambiguate by magnitude in `parseAnyLegacyDate`. Anything else → null.
export type LegacyTimestamp = string | number | null | undefined;

// Mirrors SwiftUI `RatingMigrationData` (Persistence/MigrationPlan.swift).
// We use loose null|undefined types because Swift `encodeIfPresent` OMITS keys
// when the Optional property is nil — they don't show up as `null`.
export interface LegacyRatingMigrationData {
  animeId: number;
  title: string;
  imageUrl?: string | null;
  ratingType: LegacyRatingType;
  watchedEpisodes: number;
  totalEpisodes?: number | null;
  syncSource?: string | null;
  createdAt?: LegacyTimestamp;
}

// Mirrors SchemaV2.UserRating (scoring only).
export interface LegacyUserRatingV2 {
  animeId: number;
  title: string;
  imageUrl: string | null;
  ratingType: LegacyRatingType;
  myScore?: number | null;
  createdAt?: string;
  syncSource?: string | null;
}

// Mirrors SchemaV2.TrackingAnime.
export interface LegacyTrackingItemV2 {
  animeId: number;
  title: string;
  imageUrl: string | null;
  currentEpisode?: number;
  totalEpisodes?: number | null;
  trackingStatus?: string;
  syncSource?: string | null;
}

// Mirrors SchemaV2.WatchedAnime.
export interface LegacyWatchedItemV2 {
  animeId: number;
  title: string;
  imageUrl: string | null;
  watchedEpisodes?: number;
  totalEpisodes?: number | null;
  isCompleted?: boolean;
  startedDate?: string | null;
  completedDate?: string | null;
  syncSource?: string | null;
}

// Mirrors SchemaV2.WishlistItem.
export interface LegacyWishlistItemV2 {
  animeId: number;
  title: string;
  imageUrl: string | null;
  priority?: number;
  notes?: string | null;
  addedDate?: string | null;
  syncSource?: string | null;
}

// Mirrors SchemaV2.CollectionFolder, plus a denormalised list of contained
// anime ids (the SwiftData relationships).
export interface LegacyFolderV2 {
  id: string;
  name: string;
  icon?: string;
  isSystemFolder?: boolean;
  folderType?: string | null;
  isShared?: boolean;
  isR18?: boolean;
  createdAt?: string;
  itemAnimeIds?: number[];
}

export interface LegacyAniseekerExport {
  version?: string; // free-form, just for human inspection
  exportedAt?: string;
  // V1→V2 migration format.
  ratings?: LegacyRatingMigrationData[];
  // V2-style snapshot.
  userRatings?: LegacyUserRatingV2[];
  trackingItems?: LegacyTrackingItemV2[];
  watchedItems?: LegacyWatchedItemV2[];
  wishlistItems?: LegacyWishlistItemV2[];
  folders?: LegacyFolderV2[];
}

const LEGACY_SOURCE_APP = 'aniseeker-swiftui';

export function isLegacyAniseekerExport(input: unknown): boolean {
  if (Array.isArray(input)) {
    // Bare RatingMigrationData array.
    return input.length === 0 || isLegacyRatingMigrationData(input[0]);
  }
  if (!input || typeof input !== 'object') return false;
  const obj = input as Record<string, unknown>;
  // Current envelope — explicitly NOT legacy.
  if (typeof obj.version === 'number' && obj.app === BACKUP_APP_ID) return false;
  return (
    Array.isArray(obj.ratings) ||
    Array.isArray(obj.userRatings) ||
    Array.isArray(obj.trackingItems) ||
    Array.isArray(obj.watchedItems) ||
    Array.isArray(obj.wishlistItems) ||
    Array.isArray(obj.folders)
  );
}

function isLegacyRatingMigrationData(v: unknown): v is LegacyRatingMigrationData {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.animeId === 'number' &&
    typeof o.title === 'string' &&
    typeof o.ratingType === 'string'
  );
}

export function importLegacyAniseekerExport(
  input: LegacyAniseekerExport | LegacyRatingMigrationData[] | unknown
): BackupEnvelopeV1 {
  const exp: LegacyAniseekerExport = Array.isArray(input) ? { ratings: input } : (input as LegacyAniseekerExport);

  const userAnimeById = new Map<string, BackupUserAnimeRow>();
  const favorites: BackupFavoriteRow[] = [];
  const ratings: BackupRatingRow[] = [];

  // 1) V1→V2 migration array — the canonical legacy shape.
  for (const r of exp.ratings ?? []) {
    const animeId = String(r.animeId);
    const createdAtMs = parseIsoOrNull(r.createdAt) ?? Date.now();
    const completed =
      r.ratingType !== 'tracking' &&
      r.watchedEpisodes > 0 &&
      typeof r.totalEpisodes === 'number' &&
      r.watchedEpisodes >= r.totalEpisodes;
    const status: BackupUserAnimeRow['status'] = decideStatus({
      ratingType: r.ratingType,
      watchedEpisodes: r.watchedEpisodes,
      totalEpisodes: r.totalEpisodes ?? null,
    });

    mergeUserAnime(userAnimeById, {
      anime_id: animeId,
      title: r.title,
      image_url: r.imageUrl ?? null,
      status,
      score: scoreFromRatingType(r.ratingType),
      progress: r.watchedEpisodes ?? 0,
      total_episodes: r.totalEpisodes ?? null,
      started_at: null,
      completed_at: completed ? createdAtMs : null,
      notes: null,
      rewatch_count: 0,
      updated_at: createdAtMs,
    });

    if (r.ratingType === 'liked') {
      favorites.push({
        id: animeId,
        title: r.title,
        image: r.imageUrl ?? null,
        addedAt: createdAtMs,
      });
      ratings.push({ id: animeId, rating: 'like', timestamp: createdAtMs });
    } else if (r.ratingType === 'dislike') {
      ratings.push({ id: animeId, rating: 'pass', timestamp: createdAtMs });
    }
  }

  // 2) V2-style snapshot — independent of the migration array.
  for (const u of exp.userRatings ?? []) {
    const animeId = String(u.animeId);
    const createdAtMs = parseIsoOrNull(u.createdAt ?? null) ?? Date.now();
    const score =
      typeof u.myScore === 'number' && Number.isFinite(u.myScore)
        ? u.myScore
        : scoreFromRatingType(u.ratingType);
    const status: BackupUserAnimeRow['status'] =
      typeof u.myScore === 'number' ? 'completed' : 'planned';

    mergeUserAnime(userAnimeById, {
      anime_id: animeId,
      title: u.title,
      image_url: u.imageUrl ?? null,
      status,
      score,
      progress: 0,
      total_episodes: null,
      started_at: null,
      completed_at: status === 'completed' ? createdAtMs : null,
      notes: null,
      rewatch_count: 0,
      updated_at: createdAtMs,
    });
    if (u.ratingType === 'liked') {
      favorites.push({ id: animeId, title: u.title, image: u.imageUrl ?? null, addedAt: createdAtMs });
      ratings.push({ id: animeId, rating: 'like', timestamp: createdAtMs });
    } else if (u.ratingType === 'dislike') {
      ratings.push({ id: animeId, rating: 'pass', timestamp: createdAtMs });
    }
  }

  for (const t of exp.trackingItems ?? []) {
    const animeId = String(t.animeId);
    mergeUserAnime(userAnimeById, {
      anime_id: animeId,
      title: t.title,
      image_url: t.imageUrl ?? null,
      status: 'watching',
      score: null,
      progress: t.currentEpisode ?? 0,
      total_episodes: t.totalEpisodes ?? null,
      started_at: null,
      completed_at: null,
      notes: null,
      rewatch_count: 0,
      updated_at: Date.now(),
    });
  }

  for (const w of exp.watchedItems ?? []) {
    const animeId = String(w.animeId);
    const completedAt = parseIsoOrNull(w.completedDate ?? null);
    const startedAt = parseIsoOrNull(w.startedDate ?? null);
    mergeUserAnime(userAnimeById, {
      anime_id: animeId,
      title: w.title,
      image_url: w.imageUrl ?? null,
      status: w.isCompleted ? 'completed' : 'watching',
      score: null,
      progress: w.watchedEpisodes ?? 0,
      total_episodes: w.totalEpisodes ?? null,
      started_at: startedAt,
      completed_at: completedAt,
      notes: null,
      rewatch_count: 0,
      updated_at: completedAt ?? startedAt ?? Date.now(),
    });
  }

  for (const p of exp.wishlistItems ?? []) {
    const animeId = String(p.animeId);
    const addedAt = parseIsoOrNull(p.addedDate ?? null) ?? Date.now();
    mergeUserAnime(userAnimeById, {
      anime_id: animeId,
      title: p.title,
      image_url: p.imageUrl ?? null,
      status: 'planned',
      score: null,
      progress: 0,
      total_episodes: null,
      started_at: null,
      completed_at: null,
      notes: null,
      rewatch_count: 0,
      updated_at: addedAt,
    });
  }

  const collectionFolders: BackupCollectionFolderRow[] = [];
  const collectionFolderItems: BackupCollectionFolderItemRow[] = [];

  for (const f of exp.folders ?? []) {
    if (f.isSystemFolder) continue; // system folders are auto-managed in the new app.
    const createdAt = parseIsoOrNull(f.createdAt ?? null) ?? Date.now();
    collectionFolders.push({
      id: f.id,
      name: f.name,
      icon: f.icon ?? null,
      type: f.folderType ?? 'custom',
      is_shared: f.isShared ? 1 : 0,
      is_r18: f.isR18 ? 1 : 0,
      created_at: createdAt,
    });
    for (const animeId of f.itemAnimeIds ?? []) {
      collectionFolderItems.push({
        folder_id: f.id,
        anime_id: String(animeId),
        added_at: createdAt,
      });
    }
  }

  const envelope = createEmptyBackup();
  envelope.app = BACKUP_APP_ID;
  envelope.version = BACKUP_SCHEMA_VERSION;
  envelope.db = {
    favorites: dedupeFavorites(favorites),
    ratings: dedupeRatings(ratings),
    userAnime: [...userAnimeById.values()],
    collectionFolders,
    collectionFolderItems,
  };
  envelope.legacy = { sourceApp: LEGACY_SOURCE_APP };
  return envelope;
}

function decideStatus(input: {
  ratingType: LegacyRatingType;
  watchedEpisodes: number;
  totalEpisodes: number | null;
}): BackupUserAnimeRow['status'] {
  if (input.ratingType === 'tracking') return 'watching';
  if (
    input.watchedEpisodes > 0 &&
    typeof input.totalEpisodes === 'number' &&
    input.totalEpisodes > 0 &&
    input.watchedEpisodes >= input.totalEpisodes
  ) {
    return 'completed';
  }
  if (input.watchedEpisodes > 0) return 'watching';
  return 'planned';
}

function scoreFromRatingType(rt: LegacyRatingType): number | null {
  if (rt === 'liked') return 10;
  if (rt === 'neutral') return 5;
  if (rt === 'dislike') return 1;
  return null;
}

function mergeUserAnime(
  by: Map<string, BackupUserAnimeRow>,
  row: BackupUserAnimeRow
): void {
  // If a richer record already exists for this animeId, keep the one that's
  // furthest along (completed > watching > planned). This lets a "tracking"
  // entry win over a stale "planned" wishlist entry without us having to
  // think about input order.
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
  // Preserve a previously-known score / total_episodes if the winner doesn't
  // have them.
  by.set(row.anime_id, {
    ...winner,
    score: winner.score ?? prev.score ?? row.score,
    total_episodes: winner.total_episodes ?? prev.total_episodes ?? row.total_episodes,
  });
}

function dedupeFavorites(list: BackupFavoriteRow[]): BackupFavoriteRow[] {
  const out = new Map<string, BackupFavoriteRow>();
  for (const row of list) out.set(row.id, row);
  return [...out.values()];
}

function dedupeRatings(list: BackupRatingRow[]): BackupRatingRow[] {
  const out = new Map<string, BackupRatingRow>();
  for (const row of list) out.set(row.id, row);
  return [...out.values()];
}

// 2001-01-01T00:00:00Z in seconds since the 1970 Unix epoch — the offset
// Swift's `Date` reference uses internally. `Date.timeIntervalSinceReferenceDate`
// returns seconds RELATIVE to this anchor.
const SWIFT_REFERENCE_EPOCH_SECONDS = 978307200;

// Magnitude-based disambiguation of legacy timestamps.
//   - >= 1e11   → ms-epoch (any year ≥ ~1973)
//   - >= 1e9    → s-epoch (any year ≥ 2001)
//   - >= 0      → Swift reference-date Double (year 2001 + n seconds)
// Years before 2001 aren't expected — no aniseeker user predates Apple's
// reference epoch — so the lower band is dedicated to the Swift shape.
export function parseAnyLegacyDate(value: LegacyTimestamp): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value >= 1e11) return Math.floor(value); // already ms
  if (value >= 1e9) return Math.floor(value * 1000); // s-epoch
  if (value >= 0) return Math.floor((value + SWIFT_REFERENCE_EPOCH_SECONDS) * 1000);
  return null;
}

function parseIsoOrNull(value: LegacyTimestamp): number | null {
  return parseAnyLegacyDate(value);
}
