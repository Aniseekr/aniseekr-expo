import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import {
  SettingsScreenLayout,
  SettingsRow,
  SettingsSection,
} from '../../components/setting/SettingsScreenLayout';
import { ThemedText, readableTextOn } from '../../components/themed';

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
let AsyncStorage: AsyncStorageLike;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  const memory = new Map<string, string>();
  AsyncStorage = {
    async getItem(k) {
      return memory.get(k) ?? null;
    },
    async setItem(k, v) {
      memory.set(k, v);
    },
  };
}

const PREFS_KEY = '@aniseekr/sync/prefs';

interface SyncPrefs {
  wifiOnly: boolean;
  autoSync: boolean;
  conflictStrategy: 'newest' | 'local' | 'remote';
}

const DEFAULTS: SyncPrefs = {
  wifiOnly: true,
  autoSync: true,
  conflictStrategy: 'newest',
};

export default function SyncHubScreen() {
  const { theme } = useTheme();
  const [prefs, setPrefs] = useState<SyncPrefs>(DEFAULTS);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY).then((raw) => {
      if (raw) {
        try {
          setPrefs({ ...DEFAULTS, ...JSON.parse(raw) });
        } catch {}
      }
    });
    AsyncStorage.getItem('@aniseekr/sync/lastRun').then((raw) => {
      if (raw) setLastSync(new Date(raw));
    });
  }, []);

  const persist = async (next: SyncPrefs) => {
    hapticsBridge.selection();
    setPrefs(next);
    try {
      await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {}
  };

  const runNow = async () => {
    hapticsBridge.tap();
    const now = new Date();
    setLastSync(now);
    try {
      await AsyncStorage.setItem('@aniseekr/sync/lastRun', now.toISOString());
    } catch {}
    setTimeout(() => hapticsBridge.success(), 800);
  };

  return (
    <SettingsScreenLayout title="Sync hub" subtitle="Cross-platform syncing">
      <View
        style={[
          styles.statusCard,
          {
            backgroundColor: theme.background.secondary,
            borderColor: theme.glassBorder,
          },
        ]}>
        <MaterialIcons name="sync" size={24} color={theme.accent} />
        <View style={{ flex: 1 }}>
          <View style={styles.statusTitleRow}>
            <Text style={[styles.statusTitle, { color: theme.text.primary }]}>
              {lastSync ? `Last sync ${formatRelative(lastSync)}` : 'No sync yet'}
            </Text>
            <View style={[styles.betaPill, { backgroundColor: theme.accent }]}>
              <ThemedText
                variant="captionSmall"
                weight="800"
                style={[styles.betaPillText, { color: readableTextOn(theme.accent) }]}>
                BETA
              </ThemedText>
            </View>
          </View>
          <Text style={[styles.statusBody, { color: theme.text.secondary }]}>
            Sync runs in the background when your library changes.
          </Text>
        </View>
        <Pressable
          onPress={runNow}
          accessibilityRole="button"
          accessibilityLabel="Sync now"
          style={({ pressed }) => [
            styles.syncButton,
            { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
          ]}>
          <Text style={[styles.syncLabel, { color: readableTextOn(theme.accent) }]}>Sync now</Text>
        </Pressable>
      </View>

      <SettingsSection title="Behaviour">
        <ToggleRow
          icon="wifi"
          label="Wi-Fi only"
          description="Pause syncing on cellular networks"
          value={prefs.wifiOnly}
          onChange={(v) => persist({ ...prefs, wifiOnly: v })}
        />
        <Divider />
        <ToggleRow
          icon="autorenew"
          label="Background sync"
          description="Periodic updates when the app is open"
          value={prefs.autoSync}
          onChange={(v) => persist({ ...prefs, autoSync: v })}
        />
      </SettingsSection>

      <SettingsSection title="Conflict resolution">
        {(
          [
            ['newest', 'Newest wins', 'Pick whichever side has the latest update timestamp'],
            ['local', 'Prefer this device', 'Local edits always overwrite remote'],
            ['remote', 'Prefer remote', 'Remote always overwrites local'],
          ] as const
        ).map(([key, label, desc], idx, arr) => {
          const active = prefs.conflictStrategy === key;
          return (
            <View key={key}>
              <Pressable
                onPress={() => persist({ ...prefs, conflictStrategy: key })}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: Spacing.sm + 2,
                  paddingVertical: Spacing.sm + 2,
                  opacity: pressed ? 0.7 : 1,
                })}>
                <View
                  style={[
                    styles.radio,
                    { borderColor: active ? theme.accent : theme.glassBorder },
                  ]}>
                  {active ? (
                    <View style={[styles.radioInner, { backgroundColor: theme.accent }]} />
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionLabel, { color: theme.text.primary }]}>{label}</Text>
                  <Text style={[styles.optionDesc, { color: theme.text.secondary }]}>{desc}</Text>
                </View>
              </Pressable>
              {idx < arr.length - 1 ? <Divider /> : null}
            </View>
          );
        })}
      </SettingsSection>

      <SettingsSection title="Linked services">
        <SettingsRow
          icon="manage-accounts"
          label="Connected platforms"
          onPress={() => router.push('/(setting)/account')}
          value="Manage in Account"
        />
        <Divider />
        <SettingsRow
          icon="cloud"
          label="Cloud backup"
          description="iCloud · Google Drive — full library snapshot"
          onPress={() => router.push('/(setting)/backup')}
        />
        <Divider />
        <SettingsRow
          icon="restore"
          label="Force resync from remote"
          description="Wipes local cache and re-pulls everything"
          destructive
          onPress={runNow}
        />
      </SettingsSection>
    </SettingsScreenLayout>
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
        <Text style={[styles.toggleLabel, { color: theme.text.primary }]}>{label}</Text>
        {description ? (
          <Text style={[styles.toggleDescription, { color: theme.text.secondary }]}>
            {description}
          </Text>
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
  statusTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statusTitle: {
    ...Typography.titleMedium,
    flexShrink: 1,
  },
  betaPill: {
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  betaPillText: {
    letterSpacing: 1,
  },
  statusBody: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
  syncButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: 16,
  },
  syncLabel: {
    ...Typography.titleSmall,
    fontWeight: '700',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  optionLabel: {
    ...Typography.titleMedium,
  },
  optionDesc: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm + 2,
  },
  toggleIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: {
    ...Typography.titleMedium,
  },
  toggleDescription: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
});
