// Aniseekr cloud-backup envelope format.
//
// The envelope is JSON, written to a single file (/aniseekr-backup.json) in the
// user's cloud (iCloud on iOS, Google Drive on Android). Every backup is
// versioned so we can evolve the shape without breaking older clients.
//
// Restore is *idempotent* — the v1 restore path uses INSERT OR REPLACE on each
// row, so re-running it never duplicates data. Anything not present in the
// envelope is left alone (we never wipe the device on restore).

export const BACKUP_SCHEMA_VERSION = 1 as const;
export const BACKUP_FILE_PATH = '/aniseekr-backup.json';
export const BACKUP_APP_ID = 'aniseekr-expo';

export interface BackupFavoriteRow {
  id: string;
  title: string | null;
  image: string | null;
  addedAt: number | null;
}

export interface BackupRatingRow {
  id: string;
  rating: string | null;
  timestamp: number | null;
}

export interface BackupUserAnimeRow {
  anime_id: string;
  title: string | null;
  image_url: string | null;
  status: string;
  score: number | null;
  progress: number | null;
  total_episodes: number | null;
  started_at: number | null;
  completed_at: number | null;
  notes: string | null;
  rewatch_count: number | null;
  updated_at: number | null;
}

export interface BackupCollectionFolderRow {
  id: string;
  name: string;
  icon: string | null;
  type: string;
  is_shared: number;
  is_r18: number;
  created_at: number | null;
}

export interface BackupCollectionFolderItemRow {
  folder_id: string;
  anime_id: string;
  added_at: number | null;
}

export interface BackupDbV1 {
  favorites: BackupFavoriteRow[];
  ratings: BackupRatingRow[];
  userAnime: BackupUserAnimeRow[];
  collectionFolders: BackupCollectionFolderRow[];
  collectionFolderItems: BackupCollectionFolderItemRow[];
}

export interface BackupPrefsV1 {
  // Raw JSON-serialised preference values, restored back into MMKV as-is.
  user: string | null; // aniseekr.user.prefs.v1
  collectionSortMode: string | null; // aniseekr.collection.sortMode.v1
  bangumi: string | null; // aniseekr.bangumi.prefs.v1
}

export interface BackupLegacyMeta {
  sourceApp: string; // e.g. 'aniseeker-swiftui'
  notes?: string;
}

export interface BackupEnvelopeV1 {
  version: 1;
  app: typeof BACKUP_APP_ID | string;
  createdAt: number;
  db: BackupDbV1;
  prefs: BackupPrefsV1;
  legacy?: BackupLegacyMeta;
}

export function createEmptyBackup(): BackupEnvelopeV1 {
  return {
    version: BACKUP_SCHEMA_VERSION,
    app: BACKUP_APP_ID,
    createdAt: Date.now(),
    db: {
      favorites: [],
      ratings: [],
      userAnime: [],
      collectionFolders: [],
      collectionFolderItems: [],
    },
    prefs: { user: null, collectionSortMode: null, bangumi: null },
  };
}

export function serializeBackupEnvelope(env: BackupEnvelopeV1): string {
  return JSON.stringify(env);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function asArray<T>(v: unknown, normalize: (raw: Record<string, unknown>) => T): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const item of v) {
    if (isPlainObject(item)) out.push(normalize(item));
  }
  return out;
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asNullableString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asNullableNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asNumberFlag(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v ? 1 : 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return 0;
}

function normalizeFavorite(raw: Record<string, unknown>): BackupFavoriteRow {
  return {
    id: asString(raw.id),
    title: asNullableString(raw.title),
    image: asNullableString(raw.image),
    addedAt: asNullableNumber(raw.addedAt),
  };
}

function normalizeRating(raw: Record<string, unknown>): BackupRatingRow {
  return {
    id: asString(raw.id),
    rating: asNullableString(raw.rating),
    timestamp: asNullableNumber(raw.timestamp),
  };
}

function normalizeUserAnime(raw: Record<string, unknown>): BackupUserAnimeRow {
  return {
    anime_id: asString(raw.anime_id),
    title: asNullableString(raw.title),
    image_url: asNullableString(raw.image_url),
    status: asString(raw.status, 'planned'),
    score: asNullableNumber(raw.score),
    progress: asNullableNumber(raw.progress),
    total_episodes: asNullableNumber(raw.total_episodes),
    started_at: asNullableNumber(raw.started_at),
    completed_at: asNullableNumber(raw.completed_at),
    notes: asNullableString(raw.notes),
    rewatch_count: asNullableNumber(raw.rewatch_count),
    updated_at: asNullableNumber(raw.updated_at),
  };
}

function normalizeFolder(raw: Record<string, unknown>): BackupCollectionFolderRow {
  return {
    id: asString(raw.id),
    name: asString(raw.name),
    icon: asNullableString(raw.icon),
    type: asString(raw.type, 'custom'),
    is_shared: asNumberFlag(raw.is_shared),
    is_r18: asNumberFlag(raw.is_r18),
    created_at: asNullableNumber(raw.created_at),
  };
}

function normalizeFolderItem(raw: Record<string, unknown>): BackupCollectionFolderItemRow {
  return {
    folder_id: asString(raw.folder_id),
    anime_id: asString(raw.anime_id),
    added_at: asNullableNumber(raw.added_at),
  };
}

function normalizeDb(raw: unknown): BackupDbV1 {
  if (!isPlainObject(raw)) {
    throw new Error('Invalid backup envelope: "db" must be an object');
  }
  return {
    favorites: asArray(raw.favorites, normalizeFavorite).filter((r) => !!r.id),
    ratings: asArray(raw.ratings, normalizeRating).filter((r) => !!r.id),
    userAnime: asArray(raw.userAnime, normalizeUserAnime).filter((r) => !!r.anime_id),
    collectionFolders: asArray(raw.collectionFolders, normalizeFolder).filter((r) => !!r.id),
    collectionFolderItems: asArray(raw.collectionFolderItems, normalizeFolderItem).filter(
      (r) => !!r.folder_id && !!r.anime_id
    ),
  };
}

function normalizePrefs(raw: unknown): BackupPrefsV1 {
  if (!isPlainObject(raw)) {
    return { user: null, collectionSortMode: null, bangumi: null };
  }
  return {
    user: asNullableString(raw.user),
    collectionSortMode: asNullableString(raw.collectionSortMode),
    bangumi: asNullableString(raw.bangumi),
  };
}

function normalizeLegacyMeta(raw: unknown): BackupLegacyMeta | undefined {
  if (!isPlainObject(raw)) return undefined;
  const sourceApp = asString(raw.sourceApp);
  if (!sourceApp) return undefined;
  const out: BackupLegacyMeta = { sourceApp };
  if (typeof raw.notes === 'string') out.notes = raw.notes;
  return out;
}

export function parseBackupEnvelope(input: string | unknown): BackupEnvelopeV1 {
  const raw = typeof input === 'string' ? safeJsonParse(input) : input;
  if (!isPlainObject(raw)) {
    throw new Error('Invalid backup envelope: not a JSON object');
  }

  const version = raw.version;
  if (version !== BACKUP_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported backup version: got ${JSON.stringify(version)}, expected ${BACKUP_SCHEMA_VERSION}`
    );
  }

  const createdAt =
    typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : 0;
  const app = asString(raw.app, BACKUP_APP_ID);

  const envelope: BackupEnvelopeV1 = {
    version: BACKUP_SCHEMA_VERSION,
    app,
    createdAt,
    db: normalizeDb(raw.db ?? {}),
    prefs: normalizePrefs(raw.prefs),
  };

  const legacy = normalizeLegacyMeta(raw.legacy);
  if (legacy) envelope.legacy = legacy;

  return envelope;
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch (err) {
    throw new Error(`Invalid backup envelope: malformed JSON (${(err as Error).message})`);
  }
}
