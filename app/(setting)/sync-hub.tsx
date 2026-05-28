import { useState } from 'react';
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
import { useT } from '../../libs/i18n';

import { kvGet, kvSet } from '../../libs/services/storage/app-storage';
import { SYNC_LAST_RUN_KEY, SYNC_PREFS_KEY } from '../../libs/services/storage/keys';

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

/** Sync MMKV seed so the toggles + "Last sync …" line render on frame 1. */
function readSyncPrefsSync(): SyncPrefs {
  const raw = kvGet(SYNC_PREFS_KEY);
  if (!raw) return DEFAULTS;
  try {
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function readLastSyncSync(): Date | null {
  const raw = kvGet(SYNC_LAST_RUN_KEY);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export default function SyncHubScreen() {
  const { theme } = useTheme();
  const t = useT();
  const [prefs, setPrefs] = useState<SyncPrefs>(readSyncPrefsSync);
  const [lastSync, setLastSync] = useState<Date | null>(readLastSyncSync);

  const persist = (next: SyncPrefs) => {
    hapticsBridge.selection();
    setPrefs(next);
    kvSet(SYNC_PREFS_KEY, JSON.stringify(next));
  };

  const runNow = () => {
    hapticsBridge.tap();
    const now = new Date();
    setLastSync(now);
    kvSet(SYNC_LAST_RUN_KEY, now.toISOString());
    setTimeout(() => hapticsBridge.success(), 800);
  };

  return (
    <SettingsScreenLayout title={t('settings.syncHub')} subtitle={t('settings.syncHubScreen.subtitle')}>
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
              {lastSync ? t('settings.syncHubScreen.lastSync', { when: formatRelative(lastSync, t) }) : t('settings.syncHubScreen.noSync')}
            </Text>
            <View style={[styles.betaPill, { backgroundColor: theme.accent }]}>
              <ThemedText
                variant="captionSmall"
                weight="800"
                style={[styles.betaPillText, { color: readableTextOn(theme.accent) }]}>
                {t('settings.syncHubScreen.beta')}
              </ThemedText>
            </View>
          </View>
          <Text style={[styles.statusBody, { color: theme.text.secondary }]}>
            {t('settings.syncHubScreen.statusBody')}
          </Text>
        </View>
        <Pressable
          onPress={runNow}
          accessibilityRole="button"
          accessibilityLabel={t('settings.syncHubScreen.syncNow')}
          style={({ pressed }) => [
            styles.syncButton,
            { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
          ]}>
          <Text style={[styles.syncLabel, { color: readableTextOn(theme.accent) }]}>{t('settings.syncHubScreen.syncNow')}</Text>
        </Pressable>
      </View>

      <SettingsSection title={t('settings.syncHubScreen.section.behaviour')}>
        <ToggleRow
          icon="wifi"
          label={t('settings.syncHubScreen.wifiOnly')}
          description={t('settings.syncHubScreen.wifiOnlyDesc')}
          value={prefs.wifiOnly}
          onChange={(v) => persist({ ...prefs, wifiOnly: v })}
        />
        <Divider />
        <ToggleRow
          icon="autorenew"
          label={t('settings.syncHubScreen.backgroundSync')}
          description={t('settings.syncHubScreen.backgroundSyncDesc')}
          value={prefs.autoSync}
          onChange={(v) => persist({ ...prefs, autoSync: v })}
        />
      </SettingsSection>

      <SettingsSection title={t('settings.syncHubScreen.section.conflict')}>
        {(
          [
            ['newest', t('settings.syncHubScreen.conflict.newest.label'), t('settings.syncHubScreen.conflict.newest.desc')],
            ['local', t('settings.syncHubScreen.conflict.local.label'), t('settings.syncHubScreen.conflict.local.desc')],
            ['remote', t('settings.syncHubScreen.conflict.remote.label'), t('settings.syncHubScreen.conflict.remote.desc')],
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

      <SettingsSection title={t('settings.syncHubScreen.section.linked')}>
        <SettingsRow
          icon="manage-accounts"
          label={t('settings.connectedPlatforms')}
          onPress={() => router.push('/(setting)/account')}
          value={t('settings.syncHubScreen.manageInAccount')}
        />
        <Divider />
        <SettingsRow
          icon="cloud"
          label={t('settings.syncHubScreen.cloudBackup')}
          description={t('settings.syncHubScreen.cloudBackupDesc')}
          onPress={() => router.push('/(setting)/backup')}
        />
        <Divider />
        <SettingsRow
          icon="restore"
          label={t('settings.syncHubScreen.forceResync')}
          description={t('settings.syncHubScreen.forceResyncDesc')}
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

function formatRelative(date: Date, t: (k: string, v?: Record<string, string | number>) => string): string {
  const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return t('settings.syncHubScreen.relative.justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('settings.syncHubScreen.relative.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('settings.syncHubScreen.relative.hours', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('settings.syncHubScreen.relative.days', { count: days });
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
