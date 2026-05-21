import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  RefreshControlProps,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
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
import { pushAnimeDetail, prefetchAnimeDetail } from '../../libs/utils/navigate-to-anime';
import {
  animeNotificationService,
  useIsAnimeScheduled,
} from '../../modules/notifications/animeNotificationService';
import { NearbyPilgrimageBadge } from '../pilgrimage/NearbyPilgrimageBadge';
import { FontFamily, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

interface AnimeListGroup {
  day: string;
  anime: Anime[];
}

type FlashRow =
  | { kind: 'header'; key: string; day: string }
  | { kind: 'anime'; key: string; anime: Anime };

interface AnimeListProps {
  listViewData: AnimeListGroup[];
  renderAnimeCard: (anime: Anime) => React.ReactNode;
  ListHeaderComponent?: React.ComponentType | React.ReactElement | null;
  ListFooterComponent?: React.ComponentType | React.ReactElement | null;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}

function flattenGroups(groups: AnimeListGroup[]): FlashRow[] {
  const out: FlashRow[] = [];
  for (const g of groups) {
    out.push({ kind: 'header', key: `h:${g.day}`, day: g.day });
    for (const anime of g.anime) {
      out.push({ kind: 'anime', key: anime.id, anime });
    }
  }
  return out;
}

export const AnimeList = memo(function AnimeList({
  listViewData,
  renderAnimeCard,
  ListHeaderComponent,
  ListFooterComponent,
  refreshControl,
}: AnimeListProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const data = useMemo(() => flattenGroups(listViewData), [listViewData]);

  const renderItem: ListRenderItem<FlashRow> = useCallback(
    ({ item }) => {
      if (item.kind === 'header') {
        return <Text style={styles.sectionTitle}>{item.day}</Text>;
      }
      // Wrap so each row has its own animated swipe context without the
      // FlashList recycling that into a different anime.
      return <View>{renderAnimeCard(item.anime)}</View>;
    },
    [renderAnimeCard, styles.sectionTitle]
  );

  const keyExtractor = useCallback((item: FlashRow) => item.key, []);
  const getItemType = useCallback((item: FlashRow) => item.kind, []);

  return (
    <FlashList<FlashRow>
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      ListHeaderComponent={ListHeaderComponent ?? undefined}
      ListFooterComponent={ListFooterComponent ?? undefined}
      refreshControl={refreshControl}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      drawDistance={500}
    />
  );
});

const SWIPE_ACTION_WIDTH = 96;

interface AnimeRowCardProps {
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
}

function AnimeRowCardImpl({
  anime,
  bangumiId,
  sourcePlatform,
  isTracked = false,
  onAddTracking,
  onQuickWishlist,
  onToggleReminder,
}: AnimeRowCardProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const isScheduled = useIsAnimeScheduled(anime.id);
  const [isLoading, setIsLoading] = useState(false);
  const swipeRef = useRef<SwipeableMethods>(null);

  const handleRemindMe = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      if (isScheduled) {
        await animeNotificationService.cancelAnimeNotification(anime.id);
      } else {
        await animeNotificationService.scheduleAnimeNotification(anime);
      }
    } catch (error) {
      console.error('Error toggling notification:', error);
    } finally {
      setIsLoading(false);
    }
  };

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
          tint={theme.accent}
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
          tint={isScheduled ? theme.status.warning : theme.status.info}
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
      // Service notifies subscribers when the OS-scheduled set changes, so the
      // bell icon updates automatically — no local optimistic flip needed.
      onToggleReminder!(anime, isScheduled);
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
        onPress={() => pushAnimeDetail(router, anime)}
        onPressIn={() => prefetchAnimeDetail(anime)}
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
                    color={isScheduled ? theme.accent : theme.text.primary}
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
                    color={isTracked ? theme.accent : theme.text.primary}
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

export const AnimeRowCard = memo(AnimeRowCardImpl);

interface SwipeActionPanelProps {
  side: 'left' | 'right';
  dragX: SharedValue<number>;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  tint: string;
}

function SwipeActionPanel({ side, dragX, icon, label, tint }: SwipeActionPanelProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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

const makeStyles = (theme: ThemePalette) =>
  StyleSheet.create({
    contentContainer: {
      paddingHorizontal: Spacing.lg,
      paddingBottom: 140,
    },
    sectionTitle: {
      ...Typography.headlineSmall,
      color: theme.text.primary,
      fontFamily: FontFamily.rounded,
      marginTop: Spacing.lg,
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
      backgroundColor: theme.background.secondary,
      borderRadius: Radius.card,
      padding: Spacing.md,
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    cardImage: {
      width: 96,
      height: 144,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    cardTitle: {
      ...Typography.headlineSmall,
      color: theme.text.primary,
      fontFamily: FontFamily.rounded,
      marginBottom: Spacing.xs,
    },
    tagContainer: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: 5,
      backgroundColor: theme.background.tertiary,
      borderRadius: Radius.chip,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    tagText: {
      ...Typography.captionSmall,
      color: theme.text.secondary,
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
      backgroundColor: theme.background.tertiary,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs + 2,
      backgroundColor: theme.background.secondary,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    addButtonActive: {
      backgroundColor: `${theme.accent}2E`,
      borderColor: theme.accent,
    },
    addButtonText: {
      ...Typography.captionSmall,
      color: theme.text.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    addButtonTextActive: {
      color: theme.accent,
    },
    remindButtonActive: {
      backgroundColor: `${theme.accent}2E`,
      borderColor: theme.accent,
    },
    remindButtonText: {
      ...Typography.captionSmall,
      color: theme.text.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    remindButtonTextActive: {
      color: theme.accent,
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
