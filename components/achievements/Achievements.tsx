import { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Colors, Radius, Shadow, Spacing, Typography } from '../../constants/DesignSystem';
import { GlassCard } from '../common/GlassCard';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import {
  AchievementCategory,
  AchievementDefinition,
} from '../../libs/services/achievements/definitions';
import { AchievementWithProgress } from '../../libs/services/achievements/achievement-service';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

type FilterValue = 'all' | AchievementCategory;

interface FilterChip {
  value: FilterValue;
  label: string;
}

const FILTER_LABELS: Record<AchievementCategory, string> = {
  rating: 'Rating',
  collection: 'Collection',
  sync: 'Sync',
  pilgrimage: 'Pilgrimage',
  social: 'Social',
};

const REWARD_LABEL: Record<AchievementDefinition['reward']['currency'], string> = {
  coins: 'coins',
  shards: 'shards',
};

function clampPercent(value: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)));
}

function formatUnlockDate(timestamp: number | undefined): string | null {
  if (!timestamp) return null;
  try {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return null;
  }
}

function sortAchievements(items: AchievementWithProgress[]): AchievementWithProgress[] {
  const unlocked = items
    .filter((a) => a.unlocked)
    .sort((a, b) => (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0));
  const locked = items
    .filter((a) => !a.unlocked)
    .sort((a, b) => clampPercent(b.progress, b.target) - clampPercent(a.progress, a.target));
  return [...unlocked, ...locked];
}

interface AchievementsGalleryProps {
  achievements: AchievementWithProgress[];
  onResetEmptyHint?: () => void;
}

export function AchievementsGallery({ achievements }: AchievementsGalleryProps) {
  const [filter, setFilter] = useState<FilterValue>('all');
  const [selected, setSelected] = useState<AchievementWithProgress | null>(null);

  const categories = useMemo<FilterChip[]>(() => {
    const present = new Set<AchievementCategory>();
    achievements.forEach((a) => present.add(a.category));
    const ordered: AchievementCategory[] = ['rating', 'collection', 'sync', 'pilgrimage', 'social'];
    const chips: FilterChip[] = [{ value: 'all', label: 'All' }];
    ordered.forEach((cat) => {
      if (present.has(cat)) chips.push({ value: cat, label: FILTER_LABELS[cat] });
    });
    return chips;
  }, [achievements]);

  const filtered = useMemo(() => {
    const list =
      filter === 'all' ? achievements : achievements.filter((a) => a.category === filter);
    return sortAchievements(list);
  }, [achievements, filter]);

  const totalUnlocked = achievements.filter((a) => a.unlocked).length;
  const totalCount = achievements.length;
  const totalCoins = achievements
    .filter((a) => a.unlocked && a.reward.currency === 'coins')
    .reduce((sum, a) => sum + a.reward.amount, 0);
  const totalShards = achievements
    .filter((a) => a.unlocked && a.reward.currency === 'shards')
    .reduce((sum, a) => sum + a.reward.amount, 0);
  const overviewPct = totalCount === 0 ? 0 : Math.round((totalUnlocked / totalCount) * 100);

  const handleOpen = (item: AchievementWithProgress) => {
    hapticsBridge.tap();
    if (item.unlocked) hapticsBridge.success();
    setSelected(item);
  };

  return (
    <View style={styles.galleryRoot}>
      <ProgressOverviewCard
        unlocked={totalUnlocked}
        total={totalCount}
        percent={overviewPct}
        coins={totalCoins}
        shards={totalShards}
      />

      {categories.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}>
          {categories.map((chip) => {
            const active = filter === chip.value;
            return (
              <Pressable
                key={chip.value}
                onPress={() => {
                  hapticsBridge.tap();
                  setFilter(chip.value);
                }}
                style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {totalUnlocked === 0 ? <EmptyHintCard /> : null}

      <View style={styles.grid}>
        {filtered.map((item, index) => (
          <Animated.View
            key={item.id}
            entering={FadeInUp.delay(index * 30)
              .springify()
              .damping(18)}
            style={styles.gridItem}>
            <BadgeTile item={item} onPress={() => handleOpen(item)} />
          </Animated.View>
        ))}
      </View>

      <AchievementDetailSheet
        item={selected}
        visible={!!selected}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}

interface BadgeTileProps {
  item: AchievementWithProgress;
  onPress: () => void;
}

function BadgeTile({ item, onPress }: BadgeTileProps) {
  const percent = clampPercent(item.progress, item.target);
  const unlockDate = formatUnlockDate(item.unlockedAt);

  return (
    <Pressable onPress={onPress} style={styles.tilePressable}>
      <GlassCard variant="frosted" style={styles.tileCard}>
        <View style={[styles.tileInner, !item.unlocked && styles.tileInnerLocked]}>
          {item.unlocked ? (
            <View style={styles.glowWrap}>
              <View style={styles.glowHalo} pointerEvents="none" />
              <LinearGradient
                colors={Colors.gradients.aurora as [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.badgeCircle}>
                <MaterialIcons name={item.icon as IconName} size={32} color="#fff" />
              </LinearGradient>
            </View>
          ) : (
            <View style={[styles.badgeCircle, styles.badgeCircleLocked]}>
              <MaterialIcons name={item.icon as IconName} size={28} color={Colors.text.tertiary} />
            </View>
          )}

          <Text
            style={[styles.tileTitle, !item.unlocked && styles.tileTitleLocked]}
            numberOfLines={1}>
            {item.title}
          </Text>

          {item.unlocked ? (
            unlockDate ? (
              <View style={styles.dateBadge}>
                <MaterialIcons name="check-circle" size={11} color={Colors.primary} />
                <Text style={styles.dateBadgeText}>Unlocked {unlockDate}</Text>
              </View>
            ) : null
          ) : (
            <View style={styles.progressBlock}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${percent}%` }]} />
              </View>
              <Text style={styles.progressLabel}>
                {item.progress} / {item.target}
              </Text>
            </View>
          )}
        </View>
      </GlassCard>
    </Pressable>
  );
}

interface ProgressOverviewCardProps {
  unlocked: number;
  total: number;
  percent: number;
  coins: number;
  shards: number;
}

function ProgressOverviewCard({
  unlocked,
  total,
  percent,
  coins,
  shards,
}: ProgressOverviewCardProps) {
  return (
    <GlassCard variant="frosted" style={styles.overviewCard}>
      <View style={styles.overviewBody}>
        <View style={styles.overviewHeader}>
          <View style={styles.overviewIconWrap}>
            <LinearGradient
              colors={Colors.gradients.sunset as [string, string, ...string[]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <MaterialIcons name="emoji-events" size={22} color="#fff" />
          </View>
          <View style={styles.overviewHeaderText}>
            <Text style={styles.overviewTitle}>Achievements</Text>
            <Text style={styles.overviewSubtitle}>
              {unlocked} of {total} unlocked
            </Text>
          </View>
          <Text style={styles.overviewPercent}>{percent}%</Text>
        </View>

        <View style={styles.overviewProgressTrack}>
          <LinearGradient
            colors={Colors.gradients.primary as [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.overviewProgressFill, { width: `${percent}%` }]}
          />
        </View>

        {coins + shards > 0 ? (
          <View style={styles.rewardRow}>
            {coins > 0 ? <RewardPill icon="paid" label={`${coins} coins`} /> : null}
            {shards > 0 ? <RewardPill icon="diamond" label={`${shards} shards`} /> : null}
          </View>
        ) : null}
      </View>
    </GlassCard>
  );
}

function RewardPill({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={styles.rewardPill}>
      <MaterialIcons name={icon} size={14} color={Colors.primary} />
      <Text style={styles.rewardPillText}>{label}</Text>
    </View>
  );
}

function EmptyHintCard() {
  return (
    <GlassCard variant="frosted" style={styles.emptyCard}>
      <View style={styles.emptyIconWrap}>
        <MaterialIcons name="auto-awesome" size={20} color={Colors.primary} />
      </View>
      <View style={styles.emptyTextWrap}>
        <Text style={styles.emptyTitle}>No badges yet</Text>
        <Text style={styles.emptyBody}>Start rating anime to unlock your first badge.</Text>
      </View>
    </GlassCard>
  );
}

interface DetailSheetProps {
  item: AchievementWithProgress | null;
  visible: boolean;
  onClose: () => void;
}

function AchievementDetailSheet({ item, visible, onClose }: DetailSheetProps) {
  const handleClose = () => {
    hapticsBridge.tap();
    onClose();
  };

  if (!item) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.sheetOverlay} />
      </Modal>
    );
  }

  const percent = clampPercent(item.progress, item.target);
  const unlockDate = formatUnlockDate(item.unlockedAt);
  const rewardText = `+${item.reward.amount} ${REWARD_LABEL[item.reward.currency]}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.sheetOverlay} onPress={handleClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[styles.sheetCard, styles.sheetShadow]}>
          <LinearGradient
            colors={Colors.gradients.background as [string, string, ...string[]]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.sheetGrabber} />

          <View style={styles.sheetBadgeWrap}>
            {item.unlocked ? (
              <View>
                <View style={styles.sheetGlowHalo} pointerEvents="none" />
                <LinearGradient
                  colors={Colors.gradients.aurora as [string, string, ...string[]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.sheetBadgeCircle}>
                  <MaterialIcons name={item.icon as IconName} size={56} color="#fff" />
                </LinearGradient>
              </View>
            ) : (
              <View style={[styles.sheetBadgeCircle, styles.sheetBadgeCircleLocked]}>
                <MaterialIcons
                  name={item.icon as IconName}
                  size={48}
                  color={Colors.text.tertiary}
                />
              </View>
            )}
          </View>

          <Text style={styles.sheetTitle}>{item.title}</Text>
          <Text style={styles.sheetDescription}>{item.description}</Text>

          {item.unlocked ? (
            unlockDate ? (
              <View style={styles.sheetMetaRow}>
                <MaterialIcons name="check-circle" size={14} color={Colors.success} />
                <Text style={styles.sheetMetaText}>Unlocked {unlockDate}</Text>
              </View>
            ) : null
          ) : (
            <View style={styles.sheetProgressBlock}>
              <View style={styles.sheetProgressTrack}>
                <LinearGradient
                  colors={Colors.gradients.primary as [string, string, ...string[]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.sheetProgressFill, { width: `${percent}%` }]}
                />
              </View>
              <Text style={styles.sheetProgressLabel}>
                {item.progress} / {item.target} ({percent}%)
              </Text>
            </View>
          )}

          <View style={styles.rewardCard}>
            <View style={styles.rewardCardIcon}>
              <MaterialIcons
                name={item.reward.currency === 'shards' ? 'diamond' : 'paid'}
                size={18}
                color="#000"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rewardCardLabel}>Reward</Text>
              <Text style={styles.rewardCardValue}>{rewardText}</Text>
            </View>
          </View>

          <Pressable onPress={handleClose} style={styles.sheetCloseButton}>
            <Text style={styles.sheetCloseText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const TILE_GAP = Spacing.sm;
const TILE_BASE_RADIUS = Radius.card;

const overviewIcon: ViewStyle = {
  width: 40,
  height: 40,
  borderRadius: 20,
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  borderWidth: 1,
  borderColor: Colors.glass.border,
};

const styles = StyleSheet.create({
  galleryRoot: {
    paddingHorizontal: Spacing.screenPadding,
    paddingTop: Spacing.sm,
    gap: Spacing.md,
  },

  overviewCard: {
    borderRadius: TILE_BASE_RADIUS,
  },
  overviewBody: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  overviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  overviewIconWrap: overviewIcon,
  overviewHeaderText: {
    flex: 1,
  },
  overviewTitle: {
    ...Typography.titleLarge,
    color: Colors.text.primary,
  },
  overviewSubtitle: {
    ...Typography.bodySmall,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  overviewPercent: {
    ...Typography.headlineSmall,
    color: Colors.primary,
    fontWeight: '800',
  },
  overviewProgressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.glass.dark,
    overflow: 'hidden',
  },
  overviewProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  rewardRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: 2,
  },
  rewardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.glass.medium,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  rewardPillText: {
    ...Typography.captionSmall,
    color: Colors.text.primary,
    fontWeight: '600',
  },

  chipRow: {
    paddingVertical: Spacing.xxs,
    gap: Spacing.xs,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.chipLg,
    backgroundColor: Colors.glass.light,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    ...Typography.titleSmall,
    color: Colors.text.secondary,
  },
  chipTextActive: {
    color: '#000',
    fontWeight: '700',
  },

  emptyCard: {
    borderRadius: TILE_BASE_RADIUS,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${Colors.primary}22`,
    borderWidth: 1,
    borderColor: `${Colors.primary}55`,
  },
  emptyTextWrap: {
    flex: 1,
  },
  emptyTitle: {
    ...Typography.titleMedium,
    color: Colors.text.primary,
  },
  emptyBody: {
    ...Typography.bodySmall,
    color: Colors.text.secondary,
    marginTop: 2,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -TILE_GAP / 2,
  },
  gridItem: {
    width: '50%',
    paddingHorizontal: TILE_GAP / 2,
    marginBottom: TILE_GAP,
  },
  tilePressable: {
    flex: 1,
  },
  tileCard: {
    borderRadius: TILE_BASE_RADIUS,
  },
  tileInner: {
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  tileInnerLocked: {
    opacity: 0.55,
  },
  glowWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'ios' ? Shadow.glow(Colors.primary) : { elevation: 8 }),
  },
  glowHalo: {
    position: 'absolute',
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: `${Colors.primary}33`,
  },
  badgeCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  badgeCircleLocked: {
    backgroundColor: Colors.glass.dark,
    borderColor: Colors.glass.border,
  },
  tileTitle: {
    ...Typography.titleSmall,
    color: Colors.text.primary,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  tileTitleLocked: {
    color: Colors.text.secondary,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: `${Colors.primary}1F`,
    borderWidth: 1,
    borderColor: `${Colors.primary}55`,
    marginTop: 2,
  },
  dateBadgeText: {
    ...Typography.captionSmall,
    color: Colors.primary,
    fontWeight: '600',
  },
  progressBlock: {
    width: '100%',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.glass.dark,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: Colors.text.secondary,
  },
  progressLabel: {
    ...Typography.captionSmall,
    color: Colors.text.tertiary,
  },

  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  sheetCard: {
    borderRadius: Radius.cardLg,
    padding: Spacing.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glass.borderHeavy,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  sheetShadow: {
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.4,
          shadowRadius: 24,
        }
      : { elevation: 12 }),
  },
  sheetGrabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.glass.borderHeavy,
    marginBottom: Spacing.xs,
  },
  sheetBadgeWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 130,
  },
  sheetGlowHalo: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 70,
    backgroundColor: `${Colors.primary}40`,
  },
  sheetBadgeCircle: {
    width: 116,
    height: 116,
    borderRadius: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  sheetBadgeCircleLocked: {
    backgroundColor: Colors.glass.dark,
    borderColor: Colors.glass.border,
    opacity: 0.7,
  },
  sheetTitle: {
    ...Typography.headlineSmall,
    color: Colors.text.primary,
    textAlign: 'center',
  },
  sheetDescription: {
    ...Typography.bodyMedium,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  sheetMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: `${Colors.success}1F`,
    borderWidth: 1,
    borderColor: `${Colors.success}55`,
    marginTop: 2,
  },
  sheetMetaText: {
    ...Typography.titleSmall,
    color: Colors.success,
    fontWeight: '600',
  },
  sheetProgressBlock: {
    width: '100%',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.xs,
  },
  sheetProgressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.glass.dark,
    overflow: 'hidden',
  },
  sheetProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  sheetProgressLabel: {
    ...Typography.captionSmall,
    color: Colors.text.secondary,
  },
  rewardCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm + 2,
    borderRadius: Radius.lg,
    backgroundColor: Colors.glass.medium,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    marginTop: Spacing.xs,
  },
  rewardCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  rewardCardLabel: {
    ...Typography.captionSmall,
    color: Colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  rewardCardValue: {
    ...Typography.titleMedium,
    color: Colors.text.primary,
    fontWeight: '700',
  },
  sheetCloseButton: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.glass.heavy,
    borderWidth: 1,
    borderColor: Colors.glass.borderHeavy,
  },
  sheetCloseText: {
    ...Typography.titleMedium,
    color: Colors.text.primary,
    fontWeight: '600',
  },
});
