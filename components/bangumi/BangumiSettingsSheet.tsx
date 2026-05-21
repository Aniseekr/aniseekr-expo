import { memo, useCallback } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, { FadeIn, FadeInUp, FadeOut } from 'react-native-reanimated';
import { router } from 'expo-router';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { BrowseSourceChip } from '../common/BrowseSourceChip';

export type BangumiViewMode = 'calendar' | 'list' | 'cards';
export type BangumiBaseViewMode = 'calendar' | 'list';
export type BangumiFilterMode = 'all' | 'tracking';
export type BangumiTypeFilter = 'all' | 'tv' | 'movie' | 'ova' | 'special';

export interface BangumiPreferences {
  viewMode: BangumiViewMode;
  /**
   * Most recently chosen non-swipe (calendar | list) view. The header swipe
   * toggle restores this when the user taps X to leave cards mode.
   */
  baseViewMode: BangumiBaseViewMode;
  filterMode: BangumiFilterMode;
  typeFilter: BangumiTypeFilter;
  showUnknownDays: boolean;
  notificationsEnabled: boolean;
  hideSwipeHint?: boolean;
}

interface BangumiSettingsSheetProps {
  visible: boolean;
  preferences: BangumiPreferences;
  pendingNotifications?: number;
  adultContent: boolean;
  onAdultContentChange: (value: boolean) => void;
  onClose: () => void;
  onChange: (next: BangumiPreferences) => void;
  onOpenNotifications?: () => void;
  onShare?: () => void;
}

function BangumiSettingsSheetComponent({
  visible,
  preferences,
  pendingNotifications = 0,
  adultContent,
  onAdultContentChange,
  onClose,
  onChange,
  onOpenNotifications,
  onShare,
}: BangumiSettingsSheetProps) {
  const { theme } = useTheme();

  const update = useCallback(
    <K extends keyof BangumiPreferences>(key: K, value: BangumiPreferences[K]) => {
      hapticsBridge.selection();
      onChange({ ...preferences, [key]: value });
    },
    [preferences, onChange]
  );

  const setBaseViewMode = useCallback(
    (mode: BangumiBaseViewMode) => {
      hapticsBridge.selection();
      onChange({
        ...preferences,
        baseViewMode: mode,
        // Stay in cards if currently swiping; otherwise apply immediately.
        viewMode: preferences.viewMode === 'cards' ? 'cards' : mode,
      });
    },
    [preferences, onChange]
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(160)}
        style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          entering={FadeInUp.duration(220)}
          style={[
            styles.sheet,
            {
              backgroundColor: theme.background.secondary,
              borderColor: theme.glassBorder,
            },
          ]}>
          <SafeAreaView edges={['bottom']}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <Text style={[styles.title, { color: theme.text.primary }]}>Bangumi options</Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <MaterialIcons name="close" size={22} color={theme.text.secondary} />
              </Pressable>
            </View>

            <Text style={[styles.sectionLabel, { color: theme.text.secondary }]}>Data source</Text>
            <View style={styles.sourceRow}>
              <BrowseSourceChip
                onPress={() => {
                  hapticsBridge.tap();
                  onClose();
                  router.push('/(setting)/data-source');
                }}
              />
            </View>

            <Text style={[styles.sectionLabel, { color: theme.text.secondary }]}>View mode</Text>
            <View style={styles.segmented}>
              {(['calendar', 'list'] as BangumiBaseViewMode[]).map((mode) => {
                // Swipe-mode (cards) lives on the header toggle; settings only
                // picks the base view that swipe falls back to when exited.
                const active = preferences.baseViewMode === mode;
                return (
                  <Pressable
                    key={mode}
                    onPress={() => setBaseViewMode(mode)}
                    style={({ pressed }) => [
                      styles.segmentItem,
                      {
                        backgroundColor: active ? theme.accent : theme.background.tertiary,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}>
                    <MaterialIcons
                      name={mode === 'calendar' ? 'calendar-today' : 'view-list'}
                      size={18}
                      color={active ? '#0E0A06' : theme.text.primary}
                    />
                    <Text
                      style={[
                        styles.segmentLabel,
                        { color: active ? '#0E0A06' : theme.text.primary },
                      ]}>
                      {mode === 'calendar' ? 'Calendar' : 'List'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.sectionLabel, { color: theme.text.secondary }]}>Filter</Text>
            <View style={styles.segmented}>
              {(['tracking', 'all'] as BangumiFilterMode[]).map((mode) => {
                const active = preferences.filterMode === mode;
                return (
                  <Pressable
                    key={mode}
                    onPress={() => update('filterMode', mode)}
                    style={({ pressed }) => [
                      styles.segmentItem,
                      {
                        backgroundColor: active ? theme.accent : theme.background.tertiary,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.segmentLabel,
                        { color: active ? '#0E0A06' : theme.text.primary },
                      ]}>
                      {mode === 'tracking' ? 'Tracking' : 'All series'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.sectionLabel, { color: theme.text.secondary }]}>Type</Text>
            <View style={styles.segmented}>
              {(
                [
                  { key: 'all', icon: 'apps', label: 'All' },
                  { key: 'tv', icon: 'tv', label: 'TV' },
                  { key: 'movie', icon: 'movie', label: 'Movie' },
                  { key: 'ova', icon: 'videocam', label: 'OVA' },
                  { key: 'special', icon: 'star', label: 'Special' },
                ] as {
                  key: BangumiTypeFilter;
                  icon: React.ComponentProps<typeof MaterialIcons>['name'];
                  label: string;
                }[]
              ).map((item) => {
                const active = preferences.typeFilter === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => update('typeFilter', item.key)}
                    style={({ pressed }) => [
                      styles.typeSegmentItem,
                      {
                        backgroundColor: active ? theme.accent : theme.background.tertiary,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}>
                    <MaterialIcons
                      name={item.icon}
                      size={16}
                      color={active ? '#0E0A06' : theme.text.primary}
                    />
                    <Text
                      style={[
                        styles.typeSegmentLabel,
                        { color: active ? '#0E0A06' : theme.text.primary },
                      ]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <ToggleRow
              icon="visibility"
              label="Show undated entries"
              description="Display series with unknown air days"
              value={preferences.showUnknownDays}
              onChange={(v) => update('showUnknownDays', v)}
            />
            <ToggleRow
              icon="notifications-active"
              label="Episode reminders"
              description="Get notified before each episode"
              value={preferences.notificationsEnabled}
              onChange={(v) => update('notificationsEnabled', v)}
            />
            <ToggleRow
              icon="explicit"
              label="Show adult content"
              description="Reveal R18 series in seasonal lists"
              value={adultContent}
              onChange={onAdultContentChange}
            />

            <View style={styles.actionRow}>
              {onOpenNotifications ? (
                <Pressable
                  onPress={() => {
                    hapticsBridge.tap();
                    onOpenNotifications();
                  }}
                  style={({ pressed }) => [
                    styles.actionButton,
                    {
                      borderColor: theme.glassBorder,
                      backgroundColor: theme.background.tertiary,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}>
                  <MaterialIcons name="notifications" size={18} color={theme.text.primary} />
                  <Text style={[styles.actionLabel, { color: theme.text.primary }]}>
                    Manage reminders
                  </Text>
                  {pendingNotifications > 0 ? (
                    <View style={[styles.badge, { backgroundColor: theme.accent }]}>
                      <Text style={styles.badgeText}>{pendingNotifications}</Text>
                    </View>
                  ) : null}
                </Pressable>
              ) : null}
              {onShare ? (
                <Pressable
                  onPress={() => {
                    hapticsBridge.tap();
                    onShare();
                  }}
                  style={({ pressed }) => [
                    styles.actionButton,
                    {
                      borderColor: theme.glassBorder,
                      backgroundColor: theme.background.tertiary,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}>
                  <MaterialIcons name="ios-share" size={18} color={theme.text.primary} />
                  <Text style={[styles.actionLabel, { color: theme.text.primary }]}>
                    Share schedule
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </SafeAreaView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
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
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.toggleRow,
        { borderColor: theme.glassBorder, backgroundColor: theme.background.tertiary },
      ]}>
      <MaterialIcons name={icon} size={22} color={theme.accent} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.toggleLabel, { color: theme.text.primary }]}>{label}</Text>
        <Text style={[styles.toggleDescription, { color: theme.text.secondary }]}>
          {description}
        </Text>
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

export const DEFAULT_BANGUMI_PREFS: BangumiPreferences = {
  viewMode: 'calendar',
  baseViewMode: 'calendar',
  filterMode: 'tracking',
  typeFilter: 'all',
  showUnknownDays: true,
  notificationsEnabled: true,
  hideSwipeHint: false,
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: 8,
    paddingBottom: Spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    ...Typography.headlineSmall,
  },
  sectionLabel: {
    ...Typography.captionSmall,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  segmented: {
    flexDirection: 'row',
    gap: 6,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    borderRadius: 12,
  },
  segmentLabel: {
    ...Typography.titleSmall,
    fontWeight: '600',
  },
  typeSegmentItem: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  typeSegmentLabel: {
    ...Typography.captionSmall,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
  toggleLabel: {
    ...Typography.titleMedium,
  },
  toggleDescription: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    minWidth: 160,
  },
  actionLabel: {
    ...Typography.titleSmall,
    fontWeight: '600',
    flex: 1,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0E0A06',
  },
});

export const BangumiSettingsSheet = memo(BangumiSettingsSheetComponent);
