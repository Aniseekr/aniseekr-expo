import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  Platform,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import {
  SettingsRow,
  SettingsScreenLayout,
  SettingsSection,
} from '../../components/setting/SettingsScreenLayout';
import { ThemedButton, ThemedText, readableTextOn } from '../../components/themed';
import { Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { cloudKitBridge } from '../../modules/cloudkit-bridge/cloudKitBridge';
import {
  AutoBackupScheduler,
  BackupKeyStore,
  CloudBackup,
  CloudKitLiveSync,
  GOOGLE_DRIVE_APP_DATA_SCOPE,
  createDefaultBackupService,
  generateBackupKey,
  importLegacyAniseekerExport,
  isLegacyAniseekerExport,
  parseBackupEnvelope,
  type BackupEnvelopeV1,
  type CloudProviderId,
  type CloudScope,
  type RestoreDiff,
  type RestoreSummary,
} from '../../libs/services/backup';
import { Logger } from '../../libs/utils/logger';

import { kvGet, kvSet } from '../../libs/services/storage/app-storage';
import {
  BACKUP_ENCRYPTION_TOGGLE_KEY,
  BACKUP_LAST_RUN_KEY,
  BACKUP_PROVIDER_KEY,
} from '../../libs/services/storage/keys';

let SecureStore: {
  getItemAsync(k: string): Promise<string | null>;
  setItemAsync(k: string, v: string): Promise<void>;
  deleteItemAsync(k: string): Promise<void>;
};
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SecureStore = require('expo-secure-store');
} catch {
  const memory = new Map<string, string>();
  SecureStore = {
    async getItemAsync(k) {
      return memory.get(k) ?? null;
    },
    async setItemAsync(k, v) {
      memory.set(k, v);
    },
    async deleteItemAsync(k) {
      memory.delete(k);
    },
  };
}

// @react-native-google-signin/google-signin runs TurboModuleRegistry
// .getEnforcing('RNGoogleSignin') at module-eval time, which throws on a build
// that doesn't link the native module. A static import would let that throw
// crash the Backup screen the moment Expo Router loads this route — so load it
// lazily in a try/catch. A build missing the module just disables Drive backup.
type GoogleSigninModule = typeof import('@react-native-google-signin/google-signin');
let GoogleSigninLib: GoogleSigninModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  GoogleSigninLib = require('@react-native-google-signin/google-signin');
} catch (err) {
  Logger.warn('[Backup] @react-native-google-signin/google-signin unavailable', err);
}

const LAST_BACKUP_KEY = BACKUP_LAST_RUN_KEY;
const ENCRYPTION_TOGGLE_KEY = BACKUP_ENCRYPTION_TOGGLE_KEY;
const PROVIDER_KEY = BACKUP_PROVIDER_KEY;

/** Sync MMKV seed for the persisted `lastBackupAt` timestamp. */
function readLastBackupAtSync(): Date | null {
  const raw = kvGet(LAST_BACKUP_KEY);
  if (!raw) return null;
  const ms = Number(raw);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

type Phase = 'idle' | 'checking' | 'uploading' | 'downloading' | 'restoring' | 'syncing';

// The Web OAuth client ID configures the native Google Sign-In SDK; iOS also
// needs its own iOS client ID. EXPO_PUBLIC_* is inlined into the JS bundle at
// build time; OAuth client IDs are public by design, so shipping them is fine.
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_DRIVE_WEB_CLIENT_ID || undefined;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_DRIVE_IOS_CLIENT_ID || undefined;

export default function BackupScreen() {
  const { theme } = useTheme();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [provider, setProvider] = useState<string>(Platform.OS === 'ios' ? 'icloud' : 'googledrive');
  const [scope, setScope] = useState<CloudScope | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  // Seed sync from MMKV so the "Last backup …" line renders on frame 1
  // instead of momentarily showing "Never" before the async read resolves.
  const [lastBackupAt, setLastBackupAt] = useState<Date | null>(readLastBackupAtSync);
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [autoBackupHours, setAutoBackupHours] = useState(24);
  const [hasGoogleToken, setHasGoogleToken] = useState(false);
  const [cloudkitAvailable, setCloudkitAvailable] = useState(false);
  const [showLegacyPaste, setShowLegacyPaste] = useState(false);
  const [legacyText, setLegacyText] = useState('');

  const cloud = useMemo(() => safeMakeCloudBackup(), []);
  const backupService = useMemo(() => createDefaultBackupService(), []);
  const keyStore = useMemo(() => new BackupKeyStore({ storage: SecureStore }), []);
  const autoBackup = useMemo(
    () =>
      new AutoBackupScheduler({
        // Default storage is MMKV-backed; explicit injection only used in tests.
        onBackup: async () => {
          if (!cloud) throw new Error('Cloud module not available');
          const snapshot = await backupService.createSnapshot();
          await cloud.upload(snapshot);
          kvSet(LAST_BACKUP_KEY, String(Date.now()));
          setLastBackupAt(new Date());
        },
      }),
    [backupService, cloud]
  );

  const googleConfigured = !!GOOGLE_WEB_CLIENT_ID;

  // Hydrate persisted state once. `lastBackupAt` is already seeded sync above;
  // the rest needs encryption key resolution + cloud availability probes that
  // are inherently async.
  useEffect(() => {
    if (kvGet(ENCRYPTION_TOGGLE_KEY) === 'true') {
      void keyStore.getKey().then((key) => {
        if (key && cloud) {
          cloud.setEncryptionKey(key);
          setEncryptionEnabled(true);
        }
      });
    }
    void autoBackup.loadPrefs().then((prefs) => {
      setAutoBackupEnabled(prefs.enabled);
      setAutoBackupHours(prefs.intervalHours);
    });
    void cloudKitBridge.getAvailability().then((status) => {
      setCloudkitAvailable(status === 'ready');
    });

    if (!cloud) {
      setAvailable(false);
      return;
    }
    setPhase('checking');
    const saved = kvGet(PROVIDER_KEY);
    if ((saved === 'icloud' || saved === 'googledrive') && saved !== cloud.getProvider()) {
      try {
        cloud.setProvider(saved);
      } catch (err) {
        Logger.warn('[Backup] could not restore saved provider', err);
      }
    }
    setProvider(cloud.getProvider());
    setScope(cloud.getActiveScope());
    void (async () => {
      try {
        setAvailable(await cloud.isAvailable());
      } catch {
        setAvailable(false);
      } finally {
        setPhase('idle');
      }
    })();
  }, [cloud, keyStore, autoBackup]);

  // Called by <GoogleDriveAuth> when a Google sign-in (or silent restore) yields
  // a fresh Drive access token. The native SDK owns session persistence.
  const onGoogleAuthenticated = useCallback(
    async (accessToken: string) => {
      if (cloud) {
        cloud.setGoogleAccessToken(accessToken);
        setAvailable(await cloud.isAvailable());
      }
      setHasGoogleToken(true);
    },
    [cloud]
  );

  // iOS lets the user choose iCloud or Google Drive; Android is always Drive.
  const selectProvider = useCallback(
    async (next: CloudProviderId) => {
      if (!cloud || next === provider) return;
      try {
        cloud.setProvider(next);
      } catch (err) {
        Logger.warn('[Backup] setProvider failed', err);
        Alert.alert('Unavailable', `${providerLabel(next)} is not available on this device.`);
        return;
      }
      setProvider(next);
      setScope(cloud.getActiveScope());
      kvSet(PROVIDER_KEY, next);
      setHasGoogleToken(false);
      setPhase('checking');
      try {
        setAvailable(await cloud.isAvailable());
      } catch {
        setAvailable(false);
      } finally {
        setPhase('idle');
      }
    },
    [cloud, provider]
  );

  // AppState fallback for auto-backup: every time the app goes background +
  // enough time has elapsed, fire a backup.
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev === 'active' && next !== 'active') {
        void autoBackup.maybeRun();
      }
    });
    return () => sub.remove();
  }, [autoBackup]);

  // ---------- Action handlers ----------

  const onBackupNow = useCallback(async () => {
    if (!cloud) {
      Alert.alert('Cloud module not available', 'Rebuild the development client to enable cloud backup.');
      return;
    }
    try {
      hapticsBridge.tap();
      setPhase('uploading');
      const snapshot = await backupService.createSnapshot();
      await cloud.upload(snapshot);
      const stamp = Date.now();
      kvSet(LAST_BACKUP_KEY, String(stamp));
      setLastBackupAt(new Date(stamp));
      hapticsBridge.success();
      Alert.alert('Backup uploaded', describeSnapshot(snapshot));
    } catch (err) {
      Logger.error('[Backup] upload failed', err);
      Alert.alert('Backup failed', errorMessage(err));
    } finally {
      setPhase('idle');
    }
  }, [backupService, cloud]);

  const onRestoreFromCloud = useCallback(async () => {
    if (!cloud) {
      Alert.alert('Cloud module not available', 'Rebuild the development client to enable cloud backup.');
      return;
    }
    try {
      setPhase('downloading');
      const env = await cloud.download();
      if (!env) {
        Alert.alert('No cloud backup found', 'Tap "Backup now" first to create one.');
        return;
      }
      setPhase('restoring');
      const diff = await backupService.dryRunRestore(env);
      const summary = formatDiff(diff);

      Alert.alert(
        diff.hasChanges ? 'Confirm restore' : 'Nothing to restore',
        diff.hasChanges
          ? `This restore will affect:\n${summary}\n\nLocal rows with the same id will be overwritten. Continue?`
          : 'Cloud data already matches this device.',
        diff.hasChanges
          ? [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Restore',
                style: 'default',
                onPress: async () => {
                  try {
                    setPhase('restoring');
                    const restoreSummary = await backupService.restoreSnapshot(env);
                    hapticsBridge.success();
                    Alert.alert('Restore complete', describeRestore(restoreSummary));
                  } catch (err) {
                    Logger.error('[Backup] restore failed', err);
                    Alert.alert('Restore failed', errorMessage(err));
                  } finally {
                    setPhase('idle');
                  }
                },
              },
            ]
          : [{ text: 'OK' }]
      );
    } catch (err) {
      Logger.error('[Backup] dry-run failed', err);
      Alert.alert('Could not read cloud backup', errorMessage(err));
    } finally {
      if (phase === 'downloading') setPhase('idle');
    }
  }, [backupService, cloud, phase]);

  const onRestoreLegacy = useCallback(async () => {
    const raw = legacyText.trim();
    if (!raw) {
      Alert.alert('Paste your aniseeker backup JSON above first.');
      return;
    }
    try {
      setPhase('restoring');
      let env: BackupEnvelopeV1;
      try {
        env = parseBackupEnvelope(raw);
      } catch {
        const legacyParsed = JSON.parse(raw);
        if (!isLegacyAniseekerExport(legacyParsed)) {
          throw new Error('Not a recognized aniseeker backup format');
        }
        env = importLegacyAniseekerExport(legacyParsed);
      }
      const summary = await backupService.restoreSnapshot(env);
      hapticsBridge.success();
      Alert.alert('Legacy restore complete', describeRestore(summary));
      setShowLegacyPaste(false);
      setLegacyText('');
    } catch (err) {
      Logger.error('[Backup] legacy restore failed', err);
      Alert.alert('Restore failed', errorMessage(err));
    } finally {
      setPhase('idle');
    }
  }, [backupService, legacyText]);

  const onToggleEncryption = useCallback(
    async (value: boolean) => {
      try {
        if (value) {
          const key = await keyStore.ensureKey();
          if (cloud) cloud.setEncryptionKey(key);
          kvSet(ENCRYPTION_TOGGLE_KEY, 'true');
          setEncryptionEnabled(true);
        } else {
          if (cloud) cloud.setEncryptionKey(null);
          kvSet(ENCRYPTION_TOGGLE_KEY, 'false');
          setEncryptionEnabled(false);
        }
      } catch (err) {
        Alert.alert('Encryption toggle failed', errorMessage(err));
      }
    },
    [cloud, keyStore]
  );

  const onToggleAutoBackup = useCallback(
    async (value: boolean) => {
      setAutoBackupEnabled(value);
      await autoBackup.savePrefs({ enabled: value, intervalHours: autoBackupHours });
    },
    [autoBackup, autoBackupHours]
  );

  const onImportFromCloudKit = useCallback(async () => {
    try {
      setPhase('downloading');
      const live = new CloudKitLiveSync({ bridge: cloudKitBridge, backupService });
      if (!(await live.isAvailable())) {
        Alert.alert('CloudKit unavailable', 'Make sure you are signed into iCloud on this device.');
        return;
      }
      const summary = await live.pull();
      hapticsBridge.success();
      Alert.alert('CloudKit import complete', describeRestore(summary));
    } catch (err) {
      Logger.error('[Backup] CloudKit import failed', err);
      Alert.alert('Import failed', errorMessage(err));
    } finally {
      setPhase('idle');
    }
  }, [backupService]);

  const onPushToCloudKit = useCallback(async () => {
    try {
      setPhase('syncing');
      const live = new CloudKitLiveSync({ bridge: cloudKitBridge, backupService });
      if (!(await live.isAvailable())) {
        Alert.alert('CloudKit unavailable', 'Make sure you are signed into iCloud on this device.');
        return;
      }
      const res = await live.push();
      hapticsBridge.success();
      Alert.alert('Pushed to CloudKit', `Wrote ${res.written} records (failed ${res.failed})`);
    } catch (err) {
      Logger.error('[Backup] CloudKit push failed', err);
      Alert.alert('Push failed', errorMessage(err));
    } finally {
      setPhase('idle');
    }
  }, [backupService]);

  const onGoogleSignedOut = useCallback(() => {
    if (cloud) cloud.setGoogleAccessToken(null);
    setHasGoogleToken(false);
    setAvailable(false);
  }, [cloud]);

  const busy = phase !== 'idle' && phase !== 'checking';

  // ---------- Render ----------

  return (
    <SettingsScreenLayout title="Backup & Restore" subtitle="iCloud · Google Drive · CloudKit">
      <View
        style={[
          styles.statusCard,
          { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
        ]}>
        <View style={[styles.statusIcon, { backgroundColor: theme.accent }]}>
          <MaterialIcons name="cloud" size={20} color={readableTextOn(theme.accent)} />
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText variant="titleLarge">{providerLabel(provider)}</ThemedText>
          <ThemedText variant="bodySmall" tone="secondary">
            {available === null
              ? 'Checking…'
              : available
                ? lastBackupAt
                  ? `Last backup ${formatRelative(lastBackupAt)}`
                  : 'No backup yet'
                : provider === 'googledrive'
                  ? 'Sign in with Google below'
                  : 'iCloud not available — check Settings → Apple ID'}
          </ThemedText>
          <ThemedText variant="caption" tone="tertiary">
            {scopeHint(provider, scope)}
            {encryptionEnabled ? ' · 🔒 encrypted (AES-256-GCM)' : ''}
          </ThemedText>
        </View>
        {phase === 'checking' ? <ActivityIndicator color={theme.text.secondary} /> : null}
      </View>

      {Platform.OS === 'ios' ? (
        <SettingsSection title="Backup destination">
          <SettingsRow
            icon="cloud"
            label="iCloud Drive"
            description="Native to iPhone — no sign-in needed"
            onPress={busy ? undefined : () => selectProvider('icloud')}
            rightSlot={
              provider === 'icloud' ? (
                <MaterialIcons name="check-circle" size={20} color={theme.accent} />
              ) : undefined
            }
          />
          <Divider />
          <SettingsRow
            icon="add-to-drive"
            label="Google Drive"
            description="Cross-platform — restorable on Android too"
            onPress={busy ? undefined : () => selectProvider('googledrive')}
            rightSlot={
              provider === 'googledrive' ? (
                <MaterialIcons name="check-circle" size={20} color={theme.accent} />
              ) : undefined
            }
          />
        </SettingsSection>
      ) : null}

      <SettingsSection title="Backup">
        <View style={{ padding: Spacing.sm + 2, gap: Spacing.sm }}>
          <ThemedButton
            label={phase === 'uploading' ? 'Uploading…' : 'Backup now'}
            onPress={onBackupNow}
            size="lg"
            fullWidth
            disabled={!available || busy}
            haptic="success"
          />
          <ToggleRow
            icon="lock"
            label="Encrypt backup file"
            description="AES-256-GCM with a device key. Required to restore on the same device."
            value={encryptionEnabled}
            onChange={onToggleEncryption}
          />
          <ToggleRow
            icon="autorenew"
            label="Auto-backup"
            description={`Run automatically every ${autoBackupHours}h when the app goes to background`}
            value={autoBackupEnabled}
            onChange={onToggleAutoBackup}
          />
        </View>
      </SettingsSection>

      <SettingsSection title="Restore">
        <SettingsRow
          icon="cloud-download"
          label="Restore from cloud"
          description="Preview changes before applying"
          onPress={onRestoreFromCloud}
        />
        <Divider />
        <SettingsRow
          icon="archive"
          label="Restore from legacy aniseeker backup"
          description="Paste exported JSON from the old SwiftUI app"
          onPress={() => setShowLegacyPaste((v) => !v)}
          rightSlot={
            <MaterialIcons
              name={showLegacyPaste ? 'expand-less' : 'expand-more'}
              size={20}
              color={theme.text.tertiary}
            />
          }
        />
        {showLegacyPaste ? (
          <View style={{ padding: Spacing.sm + 2, gap: Spacing.sm }}>
            <TextInput
              value={legacyText}
              onChangeText={setLegacyText}
              multiline
              placeholder='{"version":"v1-v2-migration","ratings":[…]} or [RatingMigrationData…]'
              placeholderTextColor={theme.text.tertiary}
              style={[
                styles.textArea,
                {
                  color: theme.text.primary,
                  backgroundColor: theme.background.tertiary,
                  borderColor: theme.glassBorder,
                },
              ]}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />
            <ThemedButton
              label={phase === 'restoring' ? 'Restoring…' : 'Restore legacy backup'}
              onPress={onRestoreLegacy}
              size="md"
              fullWidth
              disabled={!legacyText.trim() || busy}
            />
          </View>
        ) : null}
      </SettingsSection>

      {Platform.OS === 'ios' ? (
        <SettingsSection title="CloudKit (legacy aniseeker bridge)">
          <SettingsRow
            icon="sync-alt"
            label="Import from CloudKit"
            description={
              cloudkitAvailable
                ? 'Pull old aniseeker data from your private iCloud container'
                : 'Not available — rebuild dev client with the bridge'
            }
            onPress={cloudkitAvailable ? onImportFromCloudKit : undefined}
          />
          <Divider />
          <SettingsRow
            icon="cloud-upload"
            label="Push current data to CloudKit"
            description="So the old SwiftUI app on another device sees the same data"
            onPress={cloudkitAvailable ? onPushToCloudKit : undefined}
          />
        </SettingsSection>
      ) : null}

      {provider === 'googledrive' ? (
        <SettingsSection title="Google Drive">
          {googleConfigured ? (
            <GoogleDriveAuth
              webClientId={GOOGLE_WEB_CLIENT_ID}
              iosClientId={GOOGLE_IOS_CLIENT_ID}
              hasToken={hasGoogleToken}
              busy={busy}
              onAuthenticated={onGoogleAuthenticated}
              onSignedOut={onGoogleSignedOut}
            />
          ) : (
            <View style={{ padding: Spacing.sm + 2 }}>
              <ThemedText variant="bodySmall" tone="secondary">
                Set EXPO_PUBLIC_GOOGLE_DRIVE_WEB_CLIENT_ID in .env to enable
                Google Drive backup.
              </ThemedText>
            </View>
          )}
        </SettingsSection>
      ) : null}
    </SettingsScreenLayout>
  );
}

// Google Drive sign-in via the native Google Sign-In SDK. Mounted whenever
// Google Drive is the active provider (Android always, iOS opt-in). Replaces
// the old expo-auth-session browser flow, which Google rejects (400
// invalid_request) for native OAuth clients — those authenticate via the
// package name + SHA-1 (Android) or bundle ID (iOS), which this SDK uses.
function GoogleDriveAuth({
  webClientId,
  iosClientId,
  hasToken,
  busy,
  onAuthenticated,
  onSignedOut,
}: {
  webClientId?: string;
  iosClientId?: string;
  hasToken: boolean;
  busy: boolean;
  onAuthenticated: (accessToken: string) => void | Promise<void>;
  onSignedOut: () => void;
}) {
  const [working, setWorking] = useState(false);

  // Configure the SDK once, then restore any prior session without UI.
  useEffect(() => {
    const lib = GoogleSigninLib;
    if (!lib) return;
    let active = true;
    try {
      lib.GoogleSignin.configure({
        webClientId,
        iosClientId,
        scopes: [GOOGLE_DRIVE_APP_DATA_SCOPE],
      });
    } catch (err) {
      Logger.warn('[Backup] GoogleSignin.configure failed', err);
      return;
    }
    void (async () => {
      try {
        const res = await lib.GoogleSignin.signInSilently();
        if (!active || lib.isNoSavedCredentialFoundResponse(res)) return;
        const { accessToken } = await lib.GoogleSignin.getTokens();
        if (active && accessToken) await onAuthenticated(accessToken);
      } catch (err) {
        Logger.warn('[Backup] Google silent restore failed', err);
      }
    })();
    return () => {
      active = false;
    };
  }, [webClientId, iosClientId, onAuthenticated]);

  const signIn = useCallback(async () => {
    const lib = GoogleSigninLib;
    if (!lib) return;
    try {
      setWorking(true);
      hapticsBridge.tap();
      await lib.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const res = await lib.GoogleSignin.signIn();
      if (!lib.isSuccessResponse(res)) return; // user cancelled the picker
      const { accessToken } = await lib.GoogleSignin.getTokens();
      await onAuthenticated(accessToken);
      hapticsBridge.success();
    } catch (err) {
      Logger.error('[Backup] Google sign-in failed', err);
      Alert.alert('Google sign-in failed', errorMessage(err));
    } finally {
      setWorking(false);
    }
  }, [onAuthenticated]);

  const signOut = useCallback(async () => {
    try {
      setWorking(true);
      await GoogleSigninLib?.GoogleSignin.signOut();
    } catch (err) {
      Logger.warn('[Backup] Google sign-out failed', err);
    } finally {
      setWorking(false);
      onSignedOut();
    }
  }, [onSignedOut]);

  return (
    <View style={{ padding: Spacing.sm + 2, gap: Spacing.sm }}>
      <ThemedText variant="bodySmall" tone="secondary">
        {hasToken
          ? 'Signed in. Backup file lives in the hidden app-data folder of your Google Drive.'
          : 'Sign in to enable Google Drive backup.'}
      </ThemedText>
      {hasToken ? (
        <ThemedButton
          label="Sign out of Google"
          onPress={signOut}
          size="md"
          variant="secondary"
          fullWidth
          disabled={busy || working}
        />
      ) : (
        <ThemedButton
          label={working ? 'Signing in…' : 'Sign in with Google'}
          onPress={signIn}
          size="md"
          fullWidth
          disabled={busy || working}
        />
      )}
    </View>
  );
}

function Divider() {
  const { theme } = useTheme();
  return <View style={{ height: 1, marginLeft: 56, backgroundColor: theme.glassBorder }} />;
}

function ToggleRow({
  icon,
  label,
  description,
  value,
  onChange,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.toggleRow}>
      <View style={[styles.toggleIcon, { backgroundColor: theme.background.tertiary }]}>
        <MaterialIcons name={icon} size={18} color={theme.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText variant="titleMedium">{label}</ThemedText>
        {description ? (
          <ThemedText variant="bodySmall" tone="secondary">
            {description}
          </ThemedText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          hapticsBridge.selection();
          onChange(v);
        }}
        trackColor={{ false: theme.background.primary, true: theme.accent }}
        thumbColor={value ? '#fff' : '#ddd'}
      />
    </View>
  );
}

function safeMakeCloudBackup(): CloudBackup | null {
  try {
    return CloudBackup.fromNativeModule();
  } catch (err) {
    Logger.warn('[Backup] react-native-cloud-storage not available in this build', err);
    return null;
  }
}

function providerLabel(provider: string): string {
  if (provider === 'icloud') return 'iCloud Drive';
  if (provider === 'googledrive') return 'Google Drive';
  return provider;
}

function scopeHint(provider: string, scope: CloudScope | null): string {
  if (!scope) return '';
  if (provider === 'icloud') {
    return scope === 'documents'
      ? 'Stored in iCloud Drive · Aniseekr (visible in Files.app)'
      : 'Stored in the app-private iCloud container (hidden)';
  }
  if (provider === 'googledrive') {
    return scope === 'app_data'
      ? "Stored in Drive's app-data folder (hidden, app-private)"
      : 'Stored in your Drive root (visible in drive.google.com)';
  }
  return `Scope: ${scope}`;
}

function describeSnapshot(env: BackupEnvelopeV1): string {
  return [
    `${env.db.userAnime.length} anime`,
    `${env.db.favorites.length} favorites`,
    `${env.db.ratings.length} ratings`,
    `${env.db.collectionFolders.length} folders`,
  ].join(' · ');
}

function describeRestore(summary: RestoreSummary): string {
  return [
    `${summary.userAnime} anime`,
    `${summary.favorites} favorites`,
    `${summary.ratings} ratings`,
    `${summary.collectionFolders} folders`,
    `${summary.prefsRestored.length} preference groups`,
  ].join(' · ');
}

function formatDiff(diff: RestoreDiff): string {
  const lines: string[] = [];
  const block = (label: string, d: { added: number; changed: number; identical: number }) => {
    if (d.added + d.changed === 0) return;
    lines.push(`• ${label}: +${d.added} new, ~${d.changed} changed`);
  };
  block('Anime', diff.userAnime);
  block('Favorites', diff.favorites);
  block('Ratings', diff.ratings);
  block('Folders', diff.collectionFolders);
  block('Folder items', diff.collectionFolderItems);
  if (diff.prefsChanges.added.length + diff.prefsChanges.changed.length > 0) {
    lines.push(
      `• Prefs: ${diff.prefsChanges.added.length} new, ${diff.prefsChanges.changed.length} changed`
    );
  }
  return lines.join('\n') || 'No differences detected.';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function formatRelative(date: Date): string {
  const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

const styles = StyleSheet.create({
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: 18,
    borderWidth: 1,
  },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  toggleIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textArea: {
    minHeight: 120,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.sm,
    ...Typography.bodySmall,
  },
});
