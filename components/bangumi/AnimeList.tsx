import { useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import ReanimatedSwipeable, {
  SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  Extrapolation,
  SharedValue,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Anime } from '../rate/types';
import { animeNotificationService } from '../../modules/notifications/animeNotificationService';
import { NearbyPilgrimageBadge } from '../pilgrimage/NearbyPilgrimageBadge';
import { Colors, FontFamily, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

interface AnimeListProps {
  listViewData: { day: string; anime: Anime[] }[];
  renderAnimeCard: (anime: Anime) => React.ReactNode;
}

export function AnimeList({ listViewData, renderAnimeCard }: AnimeListProps) {
  return (
    <View className="px-5">
      {listViewData.map((group) => (
        <View key={group.day} className="mb-8">
          <Text style={styles.sectionTitle}>{group.day}</Text>
          {group.anime.map((anime) => renderAnimeCard(anime))}
        </View>
      ))}
    </View>
  );
}

const SWIPE_ACTION_WIDTH = 96;

export function AnimeRowCard({
  anime,
  bangumiId,
  sourcePlatform,
  isTracked = false,
  onAddTracking,
  onQuickWishlist,
  onToggleReminder,
}: {
  anime: Anime;
  bangumiId?: number;
  sourcePlatform?: string;
  isTracked?: boolean;
  /** Long-press / "+ Track" — opens the full tracking sheet. */
  onAddTracking?: (anime: Anime) => void;
  /** Right-swipe quick action — instantly mark as Wishlist. */
  onQuickWishlist?: (anime: Anime) => void;
  /** Left-swipe quick action — toggle the reminder notification. */
  onToggleReminder?: (anime: Anime, currentlyScheduled: boolean) => void;
}) {
  const router = useRouter();
  const [isScheduled, setIsScheduled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const swipeRef = useRef<SwipeableMethods>(null);

  const handleRemindMe = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      if (isScheduled) {
        await animeNotificationService.cancelAnimeNotification(anime.id);
        setIsScheduled(false);
      } else {
        const notificationId = await animeNotificationService.scheduleAnimeNotification(anime);
        if (notificationId) setIsScheduled(true);
      }
    } catch (error) {
      console.error('Error toggling notification:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsScheduled(animeNotificationService.isAnimeScheduled(anime.id));
  }, [anime.id]);

  const hasReminderSlot = !!anime.nextAiringEpisode && !!onToggleReminder;
  const hasWishlistSlot = !!onQuickWishlist;

  // Left side of the row reveals as user drags right. We pass the parent
  // progress so the action only "appears" once the user actually pulled.
  const renderLeftActions = hasWishlistSlot
    ? (_progress: SharedValue<number>, dragX: SharedValue<number>) => (
        <SwipeActionPanel
          side="left"
          dragX={dragX}
          icon={isTracked ? 'check-circle' : 'bookmark-add'}
          label={isTracked ? 'Tracking' : 'Wishlist'}
          tint={Colors.primary}
        />
      )
    : undefined;

  const renderRightActions = hasReminderSlot
    ? (_progress: SharedValue<number>, dragX: SharedValue<number>) => (
        <SwipeActionPanel
          side="right"
          dragX={dragX}
          icon={isScheduled ? 'notifications-off' : 'notifications-active'}
          label={isScheduled ? 'Cancel' : 'Remind'}
          tint={isScheduled ? Colors.warning : Colors.info ?? Colors.primary}
        />
      )
    : undefined;

  const handleSwipeOpen = (direction: 'left' | 'right') => {
    swipeRef.current?.close();
    if (direction === 'left' && onQuickWishlist) {
      hapticsBridge.success();
      onQuickWishlist(anime);
    } else if (direction === 'right' && hasReminderSlot) {
      hapticsBridge.selection();
      const wasScheduled = isScheduled;
      // Optimistic flip — the service stub returns immediately anyway.
      setIsScheduled((prev) => !prev);
      onToggleReminder!(anime, wasScheduled);
      void handleRemindMe();
    }
  };

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={2}
      leftThreshold={SWIPE_ACTION_WIDTH * 0.6}
      rightThreshold={SWIPE_ACTION_WIDTH * 0.6}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      onSwipeableOpen={handleSwipeOpen}
      containerStyle={styles.cardPressable}>
      <Pressable
        onPress={() => router.push(`/anime/${anime.id}`)}
        onLongPress={
          onAddTracking
            ? () => {
                hapticsBridge.longPress();
                onAddTracking(anime);
              }
            : undefined
        }
        delayLongPress={280}>
        <View style={styles.cardContainer}>
          <Image source={{ uri: anime.image }} style={styles.cardImage} resizeMode="cover" />
          <View className="ml-4 flex-1 justify-center">
            <Text style={styles.cardTitle} numberOfLines={2}>
              {anime.title}
            </Text>

            {bangumiId !== undefined ? (
              <View style={{ marginTop: 4, marginBottom: 4 }}>
                <NearbyPilgrimageBadge bangumiId={bangumiId} variant="pill" />
              </View>
            ) : sourcePlatform ? (
              <View style={{ marginTop: 4, marginBottom: 4 }}>
                <NearbyPilgrimageBadge
                  sourcePlatform={sourcePlatform}
                  id={anime.id}
                  variant="pill"
                />
              </View>
            ) : null}

            {anime.tags && anime.tags.length > 0 && (
              <View className="mt-2 mb-4 flex-row flex-wrap gap-2">
                {anime.tags.slice(0, 3).map((tag, idx) => (
                  <View key={idx} style={styles.tagContainer}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.actionRow}>
              {anime.nextAiringEpisode && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    handleRemindMe();
                  }}
                  style={[styles.remindButton, isScheduled && styles.remindButtonActive]}
                  disabled={isLoading}>
                  <MaterialIcons
                    name={isScheduled ? 'notifications-active' : 'notifications-none'}
                    size={16}
                    color={isScheduled ? Colors.primary : Colors.text.primary}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[styles.remindButtonText, isScheduled && styles.remindButtonTextActive]}>
                    {isScheduled ? 'Scheduled' : 'Remind Me'}
                  </Text>
                </Pressable>
              )}
              {onAddTracking && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    onAddTracking(anime);
                  }}
                  style={[styles.addButton, isTracked && styles.addButtonActive]}
                  hitSlop={8}>
                  <MaterialIcons
                    name={isTracked ? 'check' : 'add'}
                    size={16}
                    color={isTracked ? Colors.primary : Colors.text.primary}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[styles.addButtonText, isTracked && styles.addButtonTextActive]}>
                    {isTracked ? 'Tracking' : 'Track'}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Pressable>
    </ReanimatedSwipeable>
  );
}

interface SwipeActionPanelProps {
  side: 'left' | 'right';
  dragX: SharedValue<number>;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  tint: string;
}

function SwipeActionPanel({ side, dragX, icon, label, tint }: SwipeActionPanelProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const raw = dragX.value;
    const distance = side === 'left' ? raw : -raw;
    const scale = interpolate(
      distance,
      [0, SWIPE_ACTION_WIDTH * 0.5, SWIPE_ACTION_WIDTH],
      [0.6, 0.9, 1],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(
      distance,
      [0, SWIPE_ACTION_WIDTH * 0.4],
      [0, 1],
      Extrapolation.CLAMP
    );
    return {
      transform: [{ scale }],
      opacity,
    };
  });

  return (
    <View
      style={[
        styles.actionPanel,
        side === 'left' ? styles.actionPanelLeft : styles.actionPanelRight,
        { backgroundColor: tint + '24', borderColor: tint },
      ]}>
      <Animated.View style={[styles.actionPanelInner, animatedStyle]}>
        <MaterialIcons name={icon} size={22} color={tint} />
        <Text style={[styles.actionPanelLabel, { color: tint }]}>{label}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    ...Typography.headlineSmall,
    color: Colors.text.primary,
    fontFamily: FontFamily.rounded,
    marginBottom: Spacing.md,
    paddingLeft: Spacing.xs,
  },
  cardPressable: {
    marginBottom: Spacing.md,
    borderRadius: Radius.card,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  cardContainer: {
    backgroundColor: Colors.glass.dark,
    borderRadius: Radius.card,
    padding: Spacing.md,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  cardImage: {
    width: 96,
    height: 144,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  cardTitle: {
    ...Typography.headlineSmall,
    color: Colors.text.primary,
    fontFamily: FontFamily.rounded,
    marginBottom: Spacing.xs,
  },
  tagContainer: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    backgroundColor: Colors.glass.medium,
    borderRadius: Radius.chip,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  tagText: {
    ...Typography.captionSmall,
    color: Colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  remindButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    backgroundColor: Colors.glass.medium,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    backgroundColor: Colors.glass.dark,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  addButtonActive: {
    backgroundColor: 'rgba(255, 159, 10, 0.18)',
    borderColor: Colors.primary,
  },
  addButtonText: {
    ...Typography.captionSmall,
    color: Colors.text.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addButtonTextActive: {
    color: Colors.primary,
  },
  remindButtonActive: {
    backgroundColor: 'rgba(255, 159, 10, 0.18)',
    borderColor: Colors.primary,
  },
  remindButtonText: {
    ...Typography.captionSmall,
    color: Colors.text.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  remindButtonTextActive: {
    color: Colors.primary,
  },
  actionPanel: {
    width: SWIPE_ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Radius.card,
  },
  actionPanelLeft: {
    marginRight: -Spacing.sm,
  },
  actionPanelRight: {
    marginLeft: -Spacing.sm,
  },
  actionPanelInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionPanelLabel: {
    ...Typography.captionSmall,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
