// Google Drive OAuth scope used by the backup feature.
//
// `drive.appdata` limits access to the per-app, per-user appDataFolder — the
// backup envelope is hidden from the user's main Drive. Sign-in itself runs
// through the native Google Sign-In SDK (see app/(setting)/backup.tsx).
export const GOOGLE_DRIVE_APP_DATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
