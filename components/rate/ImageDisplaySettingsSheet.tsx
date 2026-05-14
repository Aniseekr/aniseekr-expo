import { memo, useCallback } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { router } from 'expo-router';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { sheetEnter } from '../../libs/animations/presets';
import { BrowseSourceChip } from '../common/BrowseSourceChip';
import type {
  SwipeContentMode,
  SwipePrefs,
  SwipeRatingButtons,
} from '../../libs/services/user-prefs';

// Re-export aliases for any legacy importers (kept stable across the swipe-prefs migration).
export type ImageContentMode = SwipeContentMode;
export type RatingButtonsMode = SwipeRatingButtons;
export type RatingPreferences = SwipePrefs;

interface ImageDisplaySettingsSheetProps {
  visible: boolean;
  preferences: SwipePrefs;
  onClose: () => void;
  onChange: (next: SwipePrefs) => void;
  restartGenreName?: string;
  onRestartGenre?: () => void;
}

function ImageDisplaySettingsSheetComponent({
  visible,
  preferences,
  onClose,
  onChange,
  restartGenreName,
  onRestartGenre,
}: ImageDisplaySettingsSheetProps) {
  const { theme } = useTheme();

  const update = useCallback(
    <K extends keyof SwipePrefs>(key: K, value: SwipePrefs[K]) => {
      hapticsBridge.selection();
      onChange({ ...preferences, [key]: value });
    },
    [preferences, onChange]
  );

  const handleRestartGenre = useCallback(() => {
    if (!onRestartGenre) return;
    hapticsBridge.warning();
    onClose();
    setTimeout(onRestartGenre, 0);
  }, [onClose, onRestartGenre]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(160)}
        style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          entering={sheetEnter()}
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
              <Text style={[styles.title, { color: theme.text.primary }]}>Display Settings</Text>
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

            <Text style={[styles.sectionLabel, { color: theme.text.secondary }]}>Image fit</Text>
            <View style={styles.segmented}>
              {(['fill', 'fit'] as SwipeContentMode[]).map((mode) => {
                const active = preferences.contentMode === mode;
                return (
                  <Pressable
                    key={mode}
                    onPress={() => update('contentMode', mode)}
                    style={({ pressed }) => [
                      styles.segmentItem,
                      {
                        backgroundColor: active ? theme.accent : theme.background.tertiary,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}>
                    <MaterialIcons
                      name={mode === 'fill' ? 'crop-square' : 'crop-original'}
                      size={18}
                      color={active ? '#0E0A06' : theme.text.primary}
                    />
                    <Text
                      style={[
                        styles.segmentLabel,
                        { color: active ? '#0E0A06' : theme.text.primary },
                      ]}>
                      {mode === 'fill' ? 'Fill' : 'Fit'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.sectionLabel, { color: theme.text.secondary }]}>
              Rating buttons (Like mode)
            </Text>
            <View style={styles.segmented}>
              {(['three', 'five'] as SwipeRatingButtons[]).map((mode) => {
                const active = preferences.ratingButtons === mode;
                return (
                  <Pressable
                    key={mode}
                    onPress={() => update('ratingButtons', mode)}
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
                      {mode === 'three' ? '3 buttons' : '5 buttons'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <ToggleRow
              icon="auto-awesome"
              label="AI Insights"
              description="Show AI-generated recommendations on each card"
              value={preferences.showAIInsights}
              onChange={(v) => update('showAIInsights', v)}
            />
            <ToggleRow
              icon="bookmark"
              label="Tracking shortcut"
              description="Add anime to lists directly from the swipe deck"
              value={preferences.trackingShortcut}
              onChange={(v) => update('trackingShortcut', v)}
            />
            <ToggleRow
              icon="translate"
              label="Original titles"
              description="Show romaji or Japanese titles instead of English"
              value={preferences.showOriginalTitle}
              onChange={(v) => update('showOriginalTitle', v)}
            />

            {onRestartGenre ? (
              <>
                <Text style={[styles.sectionLabel, { color: theme.text.secondary }]}>Deck</Text>
                <ActionRow
                  icon="refresh"
                  label="Restart this genre"
                  description={
                    restartGenreName
                      ? `Start ${restartGenreName} from the first card again`
                      : 'Start this genre from the first card again'
                  }
                  onPress={handleRestartGenre}
                  destructive
                />
              </>
            ) : null}
          </SafeAreaView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function ActionRow({
  icon,
  label,
  description,
  onPress,
  destructive = false,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  description: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const { theme } = useTheme();
  const tint = destructive ? theme.status.error : theme.accent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.actionRow,
        {
          borderColor: theme.glassBorder,
          backgroundColor: theme.background.tertiary,
          opacity: pressed ? 0.82 : 1,
        },
      ]}>
      <MaterialIcons name={icon} size={22} color={tint} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.actionLabel, { color: tint }]}>{label}</Text>
        <Text style={[styles.toggleDescription, { color: theme.text.secondary }]}>
          {description}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={theme.text.tertiary} />
    </Pressable>
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
    marginBottom: Spacing.md,
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
  actionRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
  actionLabel: {
    ...Typography.titleMedium,
    fontWeight: '700',
  },
  toggleDescription: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
});

export const ImageDisplaySettingsSheet = memo(ImageDisplaySettingsSheetComponent);
