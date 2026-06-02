export {
  BACKUP_APP_ID,
  BACKUP_FILE_PATH,
  BACKUP_SCHEMA_VERSION,
  createEmptyBackup,
  parseBackupEnvelope,
  serializeBackupEnvelope,
  type BackupCollectionFolderItemRow,
  type BackupCollectionFolderRow,
  type BackupDbV1,
  type BackupEnvelopeV1,
  type BackupFavoriteRow,
  type BackupPrefsV1,
  type BackupRatingRow,
  type BackupUserAnimeRow,
} from './schema';

export {
  BackupService,
  createDefaultBackupService,
  type BackupAsyncStorage,
  type BackupServiceDeps,
  type PrefsDiff,
  type RestoreDiff,
  type RestoreSummary,
  type RowDiff,
} from './backup-service';

export {
  importLegacyAniseekerExport,
  isLegacyAniseekerExport,
  parseAnyLegacyDate,
  type LegacyAniseekerExport,
  type LegacyFolderV2,
  type LegacyRatingMigrationData,
  type LegacyRatingType,
  type LegacyTimestamp,
  type LegacyTrackingItemV2,
  type LegacyUserRatingV2,
  type LegacyWatchedItemV2,
  type LegacyWishlistItemV2,
} from './legacy-aniseeker';

export {
  CloudBackup,
  CloudScopes,
  DEFAULT_CLOUD_BACKUP_CONFIG,
  type CloudBackupConfig,
  type CloudBackupMeta,
  type CloudProviderId,
  type CloudScope,
  type GoogleDriveConfig,
  type ICloudConfig,
  type ICloudDocumentsMode,
} from './cloud-backup';

export { GOOGLE_DRIVE_APP_DATA_SCOPE } from './google-auth';

export {
  BackupEncryption,
  BackupKeyStore,
  ENCRYPTED_ENVELOPE_VERSION,
  createBackupKeyStore,
  decodeBase64,
  encodeBase64,
  generateBackupKey,
  isEncryptedPayload,
} from './encryption';

export { AutoBackupScheduler, type AutoBackupPrefs } from './auto-backup';

export {
  CLOUDKIT_RECORD_TYPES,
  cloudKitRecordsToEnvelope,
  envelopeToCloudKitRecords,
  type CloudKitRecord,
  type CloudKitRecordType,
} from './cloudkit-converter';

export {
  CloudKitLiveSync,
  type CloudKitAvailability,
  type CloudKitBridgeLike,
} from './cloudkit-live-sync';

export {
  countLegacySwiftDataSnapshot,
  hasLegacyContent,
  swiftDataSnapshotToEnvelope,
  type LegacySwiftDataCounts,
  type LegacySwiftDataSnapshot,
} from './legacy-swiftdata';
