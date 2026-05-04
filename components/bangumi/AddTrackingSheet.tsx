import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, { FadeIn, FadeInUp, FadeOut } from 'react-native-reanimated';
import { Anime } from '../rate/types';
import { RatingSlider } from '../common/RatingSlider';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { trackingService } from '../../libs/services/tracking/tracking-service';
import { collectionService } from '../../libs/services/collection/collection-service';
import type { AnimeStatus } from '../../libs/services/auth/types';
import type { CollectionFolder } from '../../types';

type UiStatus = 'watching' | 'wishlist' | 'completed' | 'paused' | 'dropped';

const STATUS_OPTIONS: {
  key: UiStatus;
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
}[] = [
  { key: 'watching', label: 'Watching', icon: 'play-circle-outline' },
  { key: 'wishlist', label: 'Wishlist', icon: 'bookmark-outline' },
  { key: 'completed', label: 'Completed', icon: 'check-circle-outline' },
  { key: 'paused', label: 'Paused', icon: 'pause-circle-outline' },
  { key: 'dropped', label: 'Dropped', icon: 'cancel' },
];

const UI_STATUS_TO_DB: Record<UiStatus, AnimeStatus> = {
  watching: 'watching',
  wishlist: 'planned',
  completed: 'completed',
  paused: 'on_hold',
  dropped: 'dropped',
};

interface AddTrackingSheetProps {
  visible: boolean;
  anime: Anime | null;
  onClose: () => void;
  onSaved?: () => void;
}

function AddTrackingSheetComponent({ visible, anime, onClose, onSaved }: AddTrackingSheetProps) {
  const { theme } = useTheme();
  const [status, setStatus] = useState<UiStatus>('watching');
  const [score, setScore] = useState(7);
  const [progress, setProgress] = useState(0);
  const [folders, setFolders] = useState<CollectionFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const totalEpisodes = anime?.episodes;
  const seasonLabel = useMemo(() => {
    if (!anime?.startDate?.year) return null;
    return `${anime.startDate.year}`;
  }, [anime]);

  useEffect(() => {
    if (!visible) return;
    setStatus('watching');
    setScore(7);
    setProgress(0);
    setSelectedFolderId(null);
    let cancelled = false;
    void (async () => {
      try {
        const list = await collectionService.getFolders();
        if (cancelled) return;
        const customOnly = list.filter((f) => !f.isSystemFolder);
        setFolders(customOnly);
      } catch {
        if (!cancelled) setFolders([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, anime?.id]);

  const handleSave = useCallback(async () => {
    if (!anime || saving) return;
    setSaving(true);
    try {
      await trackingService.upsertTracking({
        animeId: anime.id,
        status: UI_STATUS_TO_DB[status],
        score,
        progress,
        totalEpisodes,
        title: anime.title,
        imageUrl: anime.image,
        folderId: selectedFolderId ?? undefined,
      });
      hapticsBridge.success();
      onSaved?.();
      onClose();
    } catch {
      hapticsBridge.tap();
    } finally {
      setSaving(false);
    }
  }, [anime, saving, status, score, progress, totalEpisodes, selectedFolderId, onSaved, onClose]);

  const decrementProgress = useCallback(() => {
    hapticsBridge.selection();
    setProgress((p) => Math.max(0, p - 1));
  }, []);

  const incrementProgress = useCallback(() => {
    hapticsBridge.selection();
    setProgress((p) => (totalEpisodes ? Math.min(totalEpisodes, p + 1) : p + 1));
  }, [totalEpisodes]);

  if (!anime) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(160)}
        style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          entering={FadeInUp.springify().damping(18)}
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
              <View style={styles.headerInfo}>
                <Image source={{ uri: anime.image }} style={styles.cover} />
                <View style={styles.headerText}>
                  <Text style={[styles.title, { color: theme.text.primary }]} numberOfLines={2}>
                    {anime.title}
                  </Text>
                  {anime.studios?.[0] || seasonLabel ? (
                    <Text
                      style={[styles.subtitle, { color: theme.text.secondary }]}
                      numberOfLines={1}>
                      {[anime.studios?.[0], seasonLabel].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Pressable onPress={onClose} hitSlop={12}>
                <MaterialIcons name="close" size={22} color={theme.text.secondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
              <Text style={[styles.sectionLabel, { color: theme.text.secondary }]}>Status</Text>
              <View style={styles.statusRow}>
                {STATUS_OPTIONS.map((opt) => {
                  const active = status === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => {
                        hapticsBridge.selection();
                        setStatus(opt.key);
                      }}
                      style={({ pressed }) => [
                        styles.statusChip,
                        {
                          backgroundColor: active ? theme.accent : theme.background.tertiary,
                          borderColor: active ? theme.accent : theme.glassBorder,
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}>
                      <MaterialIcons
                        name={opt.icon}
                        size={16}
                        color={active ? '#0E0A06' : theme.text.primary}
                      />
                      <Text
                        style={[
                          styles.statusChipLabel,
                          { color: active ? '#0E0A06' : theme.text.primary },
                        ]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.sectionLabel, { color: theme.text.secondary }]}>Score</Text>
              <View style={styles.scoreRow}>
                <Text style={[styles.scoreValue, { color: theme.accent }]}>{score.toFixed(1)}</Text>
                <Text style={[styles.scoreMax, { color: theme.text.tertiary }]}>/ 10</Text>
              </View>
              <RatingSlider value={score} onChange={setScore} width={320} step={0.5} />

              <Text style={[styles.sectionLabel, { color: theme.text.secondary }]}>Episodes</Text>
              <View style={styles.stepperRow}>
                <Pressable
                  onPress={decrementProgress}
                  style={({ pressed }) => [
                    styles.stepperButton,
                    {
                      backgroundColor: theme.background.tertiary,
                      borderColor: theme.glassBorder,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}>
                  <MaterialIcons name="remove" size={20} color={theme.text.primary} />
                </Pressable>
                <View
                  style={[
                    styles.stepperValue,
                    {
                      borderColor: theme.glassBorder,
                      backgroundColor: theme.background.tertiary,
                    },
                  ]}>
                  <Text style={[styles.stepperText, { color: theme.text.primary }]}>
                    {progress}
                    {totalEpisodes ? ` / ${totalEpisodes}` : ''}
                  </Text>
                </View>
                <Pressable
                  onPress={incrementProgress}
                  style={({ pressed }) => [
                    styles.stepperButton,
                    {
                      backgroundColor: theme.background.tertiary,
                      borderColor: theme.glassBorder,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}>
                  <MaterialIcons name="add" size={20} color={theme.text.primary} />
                </Pressable>
              </View>

              <Text style={[styles.sectionLabel, { color: theme.text.secondary }]}>Folder</Text>
              <View style={styles.folderRow}>
                <Pressable
                  onPress={() => {
                    hapticsBridge.selection();
                    setSelectedFolderId(null);
                  }}
                  style={({ pressed }) => [
                    styles.folderChip,
                    {
                      backgroundColor:
                        selectedFolderId === null ? theme.accent : theme.background.tertiary,
                      borderColor: selectedFolderId === null ? theme.accent : theme.glassBorder,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.folderChipLabel,
                      {
                        color: selectedFolderId === null ? '#0E0A06' : theme.text.primary,
                      },
                    ]}>
                    Default folder
                  </Text>
                </Pressable>
                {folders.map((f) => {
                  const active = selectedFolderId === f.id;
                  return (
                    <Pressable
                      key={f.id}
                      onPress={() => {
                        hapticsBridge.selection();
                        setSelectedFolderId(f.id);
                      }}
                      style={({ pressed }) => [
                        styles.folderChip,
                        {
                          backgroundColor: active ? theme.accent : theme.background.tertiary,
                          borderColor: active ? theme.accent : theme.glassBorder,
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}>
                      <Text
                        style={[
                          styles.folderChipLabel,
                          { color: active ? '#0E0A06' : theme.text.primary },
                        ]}>
                        {f.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.buttonRow}>
              <Pressable
                onPress={() => {
                  hapticsBridge.tap();
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.button,
                  {
                    borderColor: theme.glassBorder,
                    backgroundColor: theme.background.tertiary,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}>
                <Text style={[styles.buttonLabel, { color: theme.text.primary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={saving}
                onPress={handleSave}
                style={({ pressed }) => [
                  styles.button,
                  styles.saveButton,
                  {
                    backgroundColor: theme.accent,
                    opacity: pressed || saving ? 0.85 : 1,
                  },
                ]}>
                <Text style={styles.saveLabel}>{saving ? 'Saving…' : 'Save'}</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </Animated.View>
      </Animated.View>
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
    paddingBottom: Spacing.md,
    maxHeight: '90%',
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
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  cover: {
    width: 56,
    height: 80,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  title: {
    ...Typography.titleLarge,
  },
  subtitle: {
    ...Typography.bodySmall,
  },
  content: {
    paddingBottom: Spacing.sm,
  },
  sectionLabel: {
    ...Typography.captionSmall,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
    borderRadius: 14,
    borderWidth: 1,
  },
  statusChipLabel: {
    ...Typography.titleSmall,
    fontWeight: '600',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 4,
    marginVertical: Spacing.xs,
  },
  scoreValue: {
    fontSize: 36,
    fontWeight: '800',
  },
  scoreMax: {
    fontSize: 16,
    fontWeight: '600',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  stepperButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperText: {
    ...Typography.titleMedium,
    fontWeight: '600',
  },
  folderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  folderChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
    borderRadius: 14,
    borderWidth: 1,
  },
  folderChipLabel: {
    ...Typography.titleSmall,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  button: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  saveButton: {
    borderColor: 'transparent',
  },
  buttonLabel: {
    ...Typography.titleMedium,
  },
  saveLabel: {
    ...Typography.titleMedium,
    color: '#0E0A06',
    fontWeight: '700',
  },
});

export const AddTrackingSheet = memo(AddTrackingSheetComponent);
