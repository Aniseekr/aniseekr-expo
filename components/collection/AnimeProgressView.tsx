import { memo, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, { FadeIn, FadeInUp, FadeOut } from 'react-native-reanimated';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { RatingSlider } from '../common/RatingSlider';
import { AnimeStatus, AnimeStatusBadge } from '../common/AnimeStatusBadge';

export interface AnimeProgress {
  status: AnimeStatus;
  score: number;
  episodesWatched: number;
  totalEpisodes?: number;
  rewatchCount: number;
  notes: string;
  startDate?: string;
  endDate?: string;
}

export const DEFAULT_PROGRESS: AnimeProgress = {
  status: 'planning',
  score: 0,
  episodesWatched: 0,
  rewatchCount: 0,
  notes: '',
};

const STATUS_OPTIONS: {
  key: AnimeStatus;
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
}[] = [
  { key: 'watching', label: 'Watching', icon: 'play-circle-filled' },
  { key: 'completed', label: 'Completed', icon: 'check-circle' },
  { key: 'on_hold', label: 'On hold', icon: 'pause-circle-filled' },
  { key: 'dropped', label: 'Dropped', icon: 'cancel' },
  { key: 'planning', label: 'Plan to watch', icon: 'bookmark' },
  { key: 'rewatching', label: 'Rewatching', icon: 'replay' },
];

interface AnimeProgressViewProps {
  visible: boolean;
  animeTitle: string;
  totalEpisodes?: number;
  progress?: AnimeProgress;
  onClose: () => void;
  onSave: (progress: AnimeProgress) => void;
}

function AnimeProgressViewComponent({
  visible,
  animeTitle,
  totalEpisodes,
  progress,
  onClose,
  onSave,
}: AnimeProgressViewProps) {
  const { theme } = useTheme();
  const [draft, setDraft] = useState<AnimeProgress>(progress ?? DEFAULT_PROGRESS);

  useEffect(() => {
    if (visible) setDraft({ ...DEFAULT_PROGRESS, ...progress, totalEpisodes });
  }, [visible, progress, totalEpisodes]);

  const update = <K extends keyof AnimeProgress>(key: K, value: AnimeProgress[K]) => {
    hapticsBridge.selection();
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    hapticsBridge.success();
    onSave(draft);
    onClose();
  };

  const handleEpisodesDelta = (delta: number) => {
    const next = Math.max(0, Math.min(totalEpisodes ?? 9999, (draft.episodesWatched ?? 0) + delta));
    update('episodesWatched', next);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
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
            <SafeAreaView edges={['bottom']} style={{ maxHeight: '92%' }}>
              <View style={styles.handle} />
              <View style={styles.headerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: theme.text.primary }]}>Track progress</Text>
                  <Text
                    style={[styles.subtitle, { color: theme.text.secondary }]}
                    numberOfLines={1}>
                    {animeTitle}
                  </Text>
                </View>
                <AnimeStatusBadge status={draft.status} />
              </View>

              <KeyboardAwareScrollView
                showsVerticalScrollIndicator={false}
                bottomOffset={20}
                keyboardShouldPersistTaps="handled">
                <Text style={[styles.sectionLabel, { color: theme.text.secondary }]}>Status</Text>
                <View style={styles.statusGrid}>
                  {STATUS_OPTIONS.map((opt) => {
                    const active = draft.status === opt.key;
                    return (
                      <Pressable
                        key={opt.key}
                        onPress={() => update('status', opt.key)}
                        style={({ pressed }) => [
                          styles.statusItem,
                          {
                            backgroundColor: active ? theme.accent : theme.background.tertiary,
                            borderColor: active ? theme.accent : theme.glassBorder,
                            opacity: pressed ? 0.85 : 1,
                          },
                        ]}>
                        <MaterialIcons
                          name={opt.icon}
                          size={18}
                          color={active ? '#0E0A06' : theme.text.primary}
                        />
                        <Text
                          style={[
                            styles.statusLabel,
                            { color: active ? '#0E0A06' : theme.text.primary },
                          ]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={[styles.sectionLabel, { color: theme.text.secondary }]}>Episodes</Text>
                <View
                  style={[
                    styles.counterRow,
                    {
                      backgroundColor: theme.background.tertiary,
                      borderColor: theme.glassBorder,
                    },
                  ]}>
                  <Pressable
                    onPress={() => handleEpisodesDelta(-1)}
                    style={[styles.counterButton, { borderColor: theme.glassBorder }]}>
                    <MaterialIcons name="remove" size={20} color={theme.text.primary} />
                  </Pressable>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={[styles.counterValue, { color: theme.text.primary }]}>
                      {draft.episodesWatched}
                      {totalEpisodes ? (
                        <Text style={[styles.counterTotal, { color: theme.text.tertiary }]}>
                          {' '}
                          / {totalEpisodes}
                        </Text>
                      ) : null}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleEpisodesDelta(1)}
                    style={[styles.counterButton, { borderColor: theme.glassBorder }]}>
                    <MaterialIcons name="add" size={20} color={theme.text.primary} />
                  </Pressable>
                </View>

                <Text style={[styles.sectionLabel, { color: theme.text.secondary }]}>Score</Text>
                <View style={styles.scoreRow}>
                  <Text style={[styles.scoreValue, { color: theme.accent }]}>
                    {draft.score.toFixed(1)}
                  </Text>
                  <Text style={[styles.scoreMax, { color: theme.text.tertiary }]}>/ 10</Text>
                </View>
                <RatingSlider
                  value={draft.score}
                  onChange={(v) => update('score', v)}
                  width={300}
                  step={0.5}
                />

                <Text style={[styles.sectionLabel, { color: theme.text.secondary }]}>Notes</Text>
                <TextInput
                  value={draft.notes}
                  onChangeText={(v) => setDraft((p) => ({ ...p, notes: v }))}
                  placeholder="Personal notes..."
                  placeholderTextColor={theme.text.tertiary}
                  multiline
                  style={[
                    styles.notesInput,
                    {
                      backgroundColor: theme.background.tertiary,
                      borderColor: theme.glassBorder,
                      color: theme.text.primary,
                    },
                  ]}
                />
              </KeyboardAwareScrollView>

              <View style={styles.footerRow}>
                <Pressable
                  onPress={onClose}
                  style={({ pressed }) => [
                    styles.footerButton,
                    styles.cancelButton,
                    { borderColor: theme.glassBorder, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <Text style={[styles.cancelLabel, { color: theme.text.secondary }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  style={({ pressed }) => [
                    styles.footerButton,
                    { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
                  ]}>
                  <Text style={styles.confirmLabel}>Save progress</Text>
                </Pressable>
              </View>
            </SafeAreaView>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
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
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  title: {
    ...Typography.headlineSmall,
  },
  subtitle: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
  sectionLabel: {
    ...Typography.captionSmall,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  statusLabel: {
    ...Typography.titleSmall,
    fontWeight: '600',
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  counterButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterValue: {
    ...Typography.headlineSmall,
  },
  counterTotal: {
    ...Typography.bodyMedium,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.xs,
  },
  scoreValue: {
    fontSize: 38,
    fontWeight: '800',
  },
  scoreMax: {
    fontSize: 18,
    fontWeight: '600',
  },
  notesInput: {
    minHeight: 80,
    borderRadius: 14,
    borderWidth: 1,
    padding: Spacing.sm + 2,
    ...Typography.bodyMedium,
    textAlignVertical: 'top',
  },
  footerRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  footerButton: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  cancelLabel: {
    ...Typography.titleMedium,
  },
  confirmLabel: {
    ...Typography.titleMedium,
    color: '#0E0A06',
    fontWeight: '700',
  },
});

export const AnimeProgressView = memo(AnimeProgressViewComponent);
