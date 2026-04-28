import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import {
  SettingsScreenLayout,
  SettingsRow,
  SettingsSection,
} from '../../components/setting/SettingsScreenLayout';
import { useNotifications } from '../../hooks/useNotifications';
import {
  notificationService,
  DEFAULT_PREFERENCES,
  NotificationPreferences,
} from '../../libs/services/notifications/notification-service';

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

const PREFS_KEY = '@aniseekr/notifications/prefs';

const LEAD_OPTIONS = [5, 15, 30, 60];

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const { permission, scheduled, requestPermission, cancelAll, refreshSchedule } =
    useNotifications();
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY).then((raw) => {
      if (raw) {
        try {
          setPrefs({ ...DEFAULT_PREFERENCES, ...JSON.parse(raw) });
        } catch {
          // ignore — fall back to defaults
        }
      }
    });
  }, []);

  const update = async (next: NotificationPreferences) => {
    hapticsBridge.selection();
    setPrefs(next);
    try {
      await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      // best-effort persistence
    }
    if (!next.weeklyDigest) {
      await notificationService.cancelByKind('daily_digest');
    }
    await refreshSchedule();
  };

  const handleRequestPermission = async () => {
    const status = await requestPermission();
    if (status.granted) {
      hapticsBridge.success();
    } else {
      hapticsBridge.error();
      Alert.alert(
        'Permission required',
        'Open system settings to enable notifications for Aniseekr.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open settings',
            onPress: () => Linking.openSettings(),
          },
        ]
      );
    }
  };

  const handleCancelAll = () => {
    Alert.alert(
      'Cancel all reminders?',
      'You can re-enable individual reminders by tapping the bell on an episode.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Cancel all',
          style: 'destructive',
          onPress: async () => {
            await cancelAll();
            hapticsBridge.warning();
          },
        },
      ]
    );
  };

  const permissionLabel = permission.granted
    ? 'granted'
    : permission.canAskAgain
      ? 'undetermined'
      : 'denied';

  return (
    <SettingsScreenLayout
      title="Notifications"
      subtitle={`${scheduled.length} scheduled · ${permissionLabel}`}>
      {!permission.granted ? (
        <View
          style={[
            styles.banner,
            {
              backgroundColor: theme.accent + '12',
              borderColor: theme.accent + '40',
            },
          ]}>
          <MaterialIcons name="notifications-off" size={22} color={theme.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: theme.text.primary }]}>
              Notifications are off
            </Text>
            <Text style={[styles.bannerBody, { color: theme.text.secondary }]}>
              Allow notifications so we can remind you when episodes drop.
            </Text>
          </View>
          <Pressable
            onPress={handleRequestPermission}
            style={({ pressed }) => [
              styles.bannerAction,
              { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Text style={styles.bannerActionLabel}>Allow</Text>
          </Pressable>
        </View>
      ) : null}

      <SettingsSection title="What to send">
        <ToggleSwitchRow
          label="Episode reminders"
          description="Notify me before each new episode"
          value={prefs.episodeReminders}
          onChange={(v) => update({ ...prefs, episodeReminders: v })}
          icon="notifications-active"
        />
        <Divider />
        <ToggleSwitchRow
          label="Weekly digest"
          description="Sunday recap of upcoming episodes"
          value={prefs.weeklyDigest}
          onChange={(v) => update({ ...prefs, weeklyDigest: v })}
          icon="event-note"
        />
        <Divider />
        <ToggleSwitchRow
          label="Movie & special drops"
          description="Alerts for new theatrical releases"
          value={prefs.movieDrops}
          onChange={(v) => update({ ...prefs, movieDrops: v })}
          icon="movie-creation"
        />
        <Divider />
        <ToggleSwitchRow
          label="Achievement unlocks"
          description="Local pings when you earn a badge"
          value={prefs.achievementAlerts}
          onChange={(v) => update({ ...prefs, achievementAlerts: v })}
          icon="emoji-events"
        />
      </SettingsSection>

      <SettingsSection title="Reminder lead time">
        {LEAD_OPTIONS.map((mins, idx) => (
          <View key={mins}>
            <Pressable
              onPress={() => update({ ...prefs, leadTimeMinutes: mins })}
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
                  {
                    borderColor: prefs.leadTimeMinutes === mins ? theme.accent : theme.glassBorder,
                  },
                ]}>
                {prefs.leadTimeMinutes === mins ? (
                  <View style={[styles.radioInner, { backgroundColor: theme.accent }]} />
                ) : null}
              </View>
              <Text style={[styles.leadLabel, { color: theme.text.primary }]}>
                {mins} minutes before
              </Text>
            </Pressable>
            {idx < LEAD_OPTIONS.length - 1 ? <Divider /> : null}
          </View>
        ))}
      </SettingsSection>

      <SettingsSection title="Manage">
        <SettingsRow
          icon="settings"
          label="Open system settings"
          onPress={() => Linking.openSettings()}
        />
        <Divider />
        <SettingsRow
          icon="delete-sweep"
          label="Cancel all reminders"
          destructive
          onPress={handleCancelAll}
        />
      </SettingsSection>

      {Platform.OS === 'android' ? (
        <Text style={[styles.footnote, { color: theme.text.tertiary }]}>
          Android schedules reminders via the local AlarmManager. They run even if the app is
          closed, but battery optimisations may delay them by a few minutes on some devices.
        </Text>
      ) : null}
    </SettingsScreenLayout>
  );
}

function Divider() {
  const { theme } = useTheme();
  return <View style={{ height: 1, marginLeft: 56, backgroundColor: theme.glassBorder }} />;
}

function ToggleSwitchRow({
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

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: 16,
    borderWidth: 1,
  },
  bannerTitle: {
    ...Typography.titleMedium,
  },
  bannerBody: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
  bannerAction: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: 18,
  },
  bannerActionLabel: {
    ...Typography.titleSmall,
    color: '#0E0A06',
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
  leadLabel: {
    ...Typography.titleMedium,
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
  footnote: {
    ...Typography.captionSmall,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
});
