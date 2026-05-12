import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Notifications from 'expo-notifications';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { readableTextOn } from '../../components/themed';
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
import { isObject, safeJsonParse } from '../../libs/utils/safe-json';

function pickValidPreferences(value: unknown): Partial<NotificationPreferences> | null {
  if (!isObject(value)) return null;
  const out: Partial<NotificationPreferences> = {};
  if (typeof value.episodeReminders === 'boolean') out.episodeReminders = value.episodeReminders;
  if (typeof value.weeklyDigest === 'boolean') out.weeklyDigest = value.weeklyDigest;
  if (typeof value.movieDrops === 'boolean') out.movieDrops = value.movieDrops;
  if (typeof value.achievementAlerts === 'boolean') out.achievementAlerts = value.achievementAlerts;
  if (typeof value.leadTimeMinutes === 'number' && Number.isFinite(value.leadTimeMinutes)) {
    out.leadTimeMinutes = value.leadTimeMinutes;
  }
  return out;
}

const isObjectGuard = (value: unknown): value is Record<string, unknown> => isObject(value);

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

interface PendingNotification {
  identifier: string;
  title: string;
  body: string;
  scheduledFor?: Date;
  animeTitle?: string;
}

type GroupKey = 'today' | 'tomorrow' | 'thisWeek' | 'later';

const GROUP_LABELS: Record<GroupKey, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  thisWeek: 'Later this week',
  later: 'Later',
};

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function bucketize(date?: Date): GroupKey {
  if (!date) return 'later';
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = Math.round((target.getTime() - today.getTime()) / dayMs);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff < 7) return 'thisWeek';
  return 'later';
}

function formatScheduled(date?: Date): string {
  if (!date) return 'Pending';
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return formatter.format(date).replace(',', ' ·');
}

function extractScheduled(n: Notifications.NotificationRequest): Date | undefined {
  const trigger = n.trigger as {
    type?: string;
    date?: string | number;
    seconds?: number;
    value?: number;
  } | null;
  if (!trigger) return undefined;
  if (trigger.date) {
    const d = new Date(trigger.date);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof trigger.seconds === 'number') {
    return new Date(Date.now() + trigger.seconds * 1000);
  }
  if (typeof trigger.value === 'number') {
    return new Date(trigger.value);
  }
  return undefined;
}

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const { permission, scheduled, requestPermission, cancelAll, refreshSchedule } =
    useNotifications();
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [pending, setPending] = useState<PendingNotification[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPending = useCallback(async () => {
    try {
      const items = await Notifications.getAllScheduledNotificationsAsync();
      const mapped: PendingNotification[] = items
        .map((n) => {
          const scheduledFor = extractScheduled(n);
          const data = n.content.data as { animeTitle?: string } | undefined;
          return {
            identifier: n.identifier,
            title: n.content.title ?? 'Reminder',
            body: n.content.body ?? '',
            scheduledFor,
            animeTitle: data?.animeTitle,
          };
        })
        .sort(
          (a, b) =>
            (a.scheduledFor?.getTime() ?? Infinity) - (b.scheduledFor?.getTime() ?? Infinity)
        );
      setPending(mapped);
    } catch (e) {
      console.warn('[Notifications] fetch scheduled failed:', e);
      setPending([]);
    }
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY).then((raw) => {
      const parsed = safeJsonParse(raw, isObjectGuard);
      const valid = parsed ? pickValidPreferences(parsed) : null;
      if (valid) setPrefs({ ...DEFAULT_PREFERENCES, ...valid });
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    setPendingLoading(true);
    fetchPending().finally(() => {
      if (mounted) setPendingLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [fetchPending, scheduled.length]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshSchedule(), fetchPending()]);
    setRefreshing(false);
  }, [fetchPending, refreshSchedule]);

  const handleDeleteOne = useCallback(
    async (id: string) => {
      hapticsBridge.warning();
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
        setPending((prev) => prev.filter((p) => p.identifier !== id));
        await refreshSchedule();
      } catch (e) {
        console.warn('[Notifications] cancel one failed:', e);
        hapticsBridge.error();
      }
    },
    [refreshSchedule]
  );

  const groupedPending = useMemo(() => {
    if (pending.length <= 5) {
      return [{ key: 'all' as const, label: '', items: pending }];
    }
    const buckets: Record<GroupKey, PendingNotification[]> = {
      today: [],
      tomorrow: [],
      thisWeek: [],
      later: [],
    };
    for (const item of pending) {
      buckets[bucketize(item.scheduledFor)].push(item);
    }
    return (Object.keys(buckets) as GroupKey[])
      .filter((k) => buckets[k].length > 0)
      .map((k) => ({ key: k, label: GROUP_LABELS[k], items: buckets[k] }));
  }, [pending]);

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
            await Notifications.cancelAllScheduledNotificationsAsync();
            await cancelAll();
            setPending([]);
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
      subtitle={`${pending.length} scheduled · ${permissionLabel}`}
      refreshing={refreshing}
      onRefresh={onRefresh}>
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
            accessibilityRole="button"
            accessibilityLabel="Allow notifications"
            style={({ pressed }) => [
              styles.bannerAction,
              { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Text style={[styles.bannerActionLabel, { color: readableTextOn(theme.accent) }]}>
              Allow
            </Text>
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

      <SettingsSection
        title={
          pending.length > 0 ? `Scheduled reminders (${pending.length})` : 'Scheduled reminders'
        }>
        {pendingLoading && pending.length === 0 ? (
          <View style={styles.pendingLoader}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : pending.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="notifications-none" size={28} color={theme.text.tertiary} />
            <Text style={[styles.emptyLabel, { color: theme.text.secondary }]}>
              No scheduled reminders
            </Text>
          </View>
        ) : (
          groupedPending.map((group, gIdx) => (
            <View key={group.key}>
              {group.label ? (
                <Text style={[styles.groupHeader, { color: theme.text.secondary }]}>
                  {group.label}
                </Text>
              ) : null}
              {group.items.map((item, idx) => (
                <View key={item.identifier}>
                  <ScheduledRow item={item} onDelete={() => handleDeleteOne(item.identifier)} />
                  {idx < group.items.length - 1 ? <Divider /> : null}
                </View>
              ))}
              {gIdx < groupedPending.length - 1 ? <Divider /> : null}
            </View>
          ))
        )}
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

function ScheduledRow({ item, onDelete }: { item: PendingNotification; onDelete: () => void }) {
  const { theme } = useTheme();
  const display = item.animeTitle ?? item.title;
  return (
    <View style={styles.scheduledRow}>
      <View style={[styles.scheduledIcon, { backgroundColor: theme.background.tertiary }]}>
        <MaterialIcons name="notifications-active" size={18} color={theme.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.scheduledTitle, { color: theme.text.primary }]} numberOfLines={1}>
          {display}
        </Text>
        <Text style={[styles.scheduledTime, { color: theme.text.secondary }]} numberOfLines={1}>
          {formatScheduled(item.scheduledFor)}
        </Text>
      </View>
      <Pressable
        onPress={onDelete}
        hitSlop={10}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 4 })}>
        <MaterialIcons name="close" size={20} color={theme.text.tertiary} />
      </Pressable>
    </View>
  );
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
  pendingLoader: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  emptyState: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  emptyLabel: {
    ...Typography.bodyMedium,
  },
  scheduledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm + 2,
  },
  scheduledIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduledTitle: {
    ...Typography.titleSmall,
    fontWeight: '600',
  },
  scheduledTime: {
    ...Typography.captionSmall,
    marginTop: 2,
  },
  groupHeader: {
    ...Typography.captionSmall,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: Spacing.sm + 2,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
});
