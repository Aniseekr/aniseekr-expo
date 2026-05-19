// Tinder-style swipe deck for a collection folder. Left = "haven't watched yet"
// (status → planning, NOT dropped — explicit triage intent). Right = "like"
// (toggle into favorites). Tap a card opens the existing progress editor so
// EP / score adjustments stay one tap away.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { FontFamily, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { readableTextOn } from '../themed';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - Spacing.lg * 2, 360);
const CARD_HEIGHT = Math.round(CARD_WIDTH * 1.4);
const SWIPE_THRESHOLD = 110;
const VELOCITY_THRESHOLD = 800;
const ROTATION_DEG = 12;

export interface FolderSwipeItem {
  id: string;
  title: string;
  image_url: string;
  progress: number;
  total_episodes: number;
  status: string;
  score: number;
}

interface FolderSwipeDeckProps {
  items: FolderSwipeItem[];
  /**
   * Opaque key (typically the folder id). When it changes the deck restarts
   * at the top. We deliberately do NOT reset on `items` reference alone —
   * an edit-and-save inside swipe mode regenerates the parent's array and
   * would otherwise bounce the deck back to the first card.
   */
  resetKey?: string;
  /** Swipe-left action — explicit semantic: "haven't watched yet". */
  onHaventWatched: (item: FolderSwipeItem) => void;
  /** Swipe-right action — explicit semantic: "like / favorite". */
  onLike: (item: FolderSwipeItem) => void;
  /** Tap on a card opens the EP / score editor. */
  onOpenDetail?: (item: FolderSwipeItem) => void;
}

export function FolderSwipeDeck({
  items,
  resetKey,
  onHaventWatched,
  onLike,
  onOpenDetail,
}: FolderSwipeDeckProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [resetKey]);

  const current = items[index];
  const next = items[index + 1];
  const likeFg = useMemo(() => readableTextOn(theme.accent), [theme.accent]);

  const advance = useCallback(
    (direction: 'left' | 'right', item: FolderSwipeItem) => {
      if (direction === 'left') onHaventWatched(item);
      else onLike(item);
      setIndex((i) => i + 1);
    },
    [onHaventWatched, onLike]
  );

  if (!current) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconWrap}>
          <Ionicons name="checkmark-done" size={36} color={theme.accent} />
        </View>
        <Text style={styles.emptyTitle}>{"You've triaged everything"}</Text>
        <Text style={styles.emptySubtitle}>
          {'Swipe ← for "haven\'t watched", swipe → to like. Tap a card to edit EP or score.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.counterRow}>
        <Text style={styles.counterText}>
          {index + 1}
          <Text style={styles.counterTextMuted}> / {items.length}</Text>
        </Text>
      </View>

      <View style={styles.deck}>
        {next ? <BackCard item={next} theme={theme} /> : null}
        <TopCard
          key={current.id}
          item={current}
          theme={theme}
          onSwipe={(dir) => advance(dir, current)}
          onOpenDetail={onOpenDetail ? () => onOpenDetail(current) : undefined}
        />
      </View>

      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Haven't watched yet"
          onPress={() => {
            hapticsBridge.selection();
            advance('left', current);
          }}
          style={({ pressed }) => [
            styles.actionButton,
            styles.actionHavent,
            pressed && { opacity: 0.85 },
          ]}>
          <MaterialIcons name="bookmark-border" size={18} color={theme.text.primary} />
          <Text style={[styles.actionLabel, { color: theme.text.primary }]}>
            {"Haven't watched"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Like"
          onPress={() => {
            hapticsBridge.success();
            advance('right', current);
          }}
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: theme.accent, borderColor: theme.accent },
            pressed && { opacity: 0.9 },
          ]}>
          <MaterialIcons name="favorite" size={18} color={likeFg} />
          <Text style={[styles.actionLabel, { color: likeFg }]}>Like</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface TopCardProps {
  item: FolderSwipeItem;
  theme: ThemePalette;
  onSwipe: (direction: 'left' | 'right') => void;
  onOpenDetail?: () => void;
}

function TopCard({ item, theme, onSwipe, onOpenDetail }: TopCardProps) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(0);
  const thresholdHit = useSharedValue(false);

  const flingOut = useCallback(
    (direction: 'left' | 'right') => {
      const targetX = direction === 'right' ? SCREEN_WIDTH * 1.4 : -SCREEN_WIDTH * 1.4;
      translateX.value = withSpring(
        targetX,
        { damping: 26, stiffness: 200, overshootClamping: true },
        (finished) => {
          if (finished) runOnJS(onSwipe)(direction);
        }
      );
      rotate.value = withSpring(direction === 'right' ? 20 : -20, {
        damping: 22,
        stiffness: 200,
      });
    },
    [onSwipe, rotate, translateX]
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          thresholdHit.value = false;
        })
        .onChange((event) => {
          translateX.value = event.translationX;
          translateY.value = event.translationY * 0.4;
          rotate.value = interpolate(
            event.translationX,
            [-SCREEN_WIDTH, SCREEN_WIDTH],
            [-ROTATION_DEG, ROTATION_DEG],
            Extrapolation.CLAMP
          );
          const distance = Math.abs(event.translationX);
          if (distance > SWIPE_THRESHOLD && !thresholdHit.value) {
            thresholdHit.value = true;
            runOnJS(hapticsBridge.swipeThreshold)();
          } else if (distance < SWIPE_THRESHOLD * 0.7 && thresholdHit.value) {
            thresholdHit.value = false;
          }
        })
        .onEnd((event) => {
          const distance = event.translationX;
          const velocity = event.velocityX;
          const shouldCommit =
            Math.abs(distance) > SWIPE_THRESHOLD || Math.abs(velocity) > VELOCITY_THRESHOLD;
          if (shouldCommit) {
            const dir = distance > 0 ? 'right' : 'left';
            runOnJS(flingOut)(dir);
          } else {
            translateX.value = withSpring(0, { damping: 22, stiffness: 320 });
            translateY.value = withSpring(0, { damping: 22, stiffness: 320 });
            rotate.value = withSpring(0, { damping: 22, stiffness: 320 });
          }
          thresholdHit.value = false;
        }),
    [flingOut, rotate, thresholdHit, translateX, translateY]
  );

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotateZ: `${rotate.value}deg` },
    ],
  }));

  const haventOverlay = useAnimatedStyle(() => ({
    opacity: interpolate(-translateX.value, [20, 110], [0, 1], Extrapolation.CLAMP),
  }));

  const likeOverlay = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [20, 110], [0, 1], Extrapolation.CLAMP),
  }));

  const progressPct =
    item.total_episodes > 0 ? Math.min(1, item.progress / item.total_episodes) : 0;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, cardStyle]}>
        <Pressable
          onPress={() => {
            hapticsBridge.tap();
            onOpenDetail?.();
          }}
          disabled={!onOpenDetail}
          style={StyleSheet.absoluteFill}>
          {item.image_url ? (
            <Image
              source={{ uri: item.image_url }}
              style={styles.cardImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={item.id}
              transition={180}
            />
          ) : (
            <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
              <MaterialIcons name="image" size={48} color={theme.text.tertiary} />
            </View>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.85)']}
            style={styles.cardGradient}
            pointerEvents="none"
          />
          <View style={styles.cardInfo} pointerEvents="none">
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={styles.cardMetaRow}>
              <View style={styles.metaPill}>
                <MaterialIcons name="play-circle-filled" size={11} color="#FFFFFF" />
                <Text style={styles.metaText}>
                  {item.progress}
                  {item.total_episodes > 0 ? ` / ${item.total_episodes}` : ''} EP
                </Text>
              </View>
              {item.score > 0 ? (
                <View style={styles.metaPill}>
                  <Ionicons name="star" size={11} color={theme.status.warning} />
                  <Text style={styles.metaText}>{(item.score / 10).toFixed(1)}</Text>
                </View>
              ) : null}
              {item.status ? (
                <Text style={[styles.metaText, { textTransform: 'capitalize', opacity: 0.85 }]}>
                  {item.status.replace(/_/g, ' ')}
                </Text>
              ) : null}
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progressPct * 100)}%` }]} />
            </View>
            <Text style={styles.tapHint}>Tap to edit EP or score</Text>
          </View>
        </Pressable>

        <Animated.View
          style={[styles.indicator, styles.indicatorLeft, haventOverlay]}
          pointerEvents="none">
          <View style={[styles.indicatorBubble, { borderColor: theme.text.primary }]}>
            <MaterialIcons name="bookmark-border" size={28} color={theme.text.primary} />
          </View>
          <Text style={[styles.indicatorLabel, { color: theme.text.primary }]}>
            {"Haven't watched"}
          </Text>
        </Animated.View>

        <Animated.View
          style={[styles.indicator, styles.indicatorRight, likeOverlay]}
          pointerEvents="none">
          <View style={[styles.indicatorBubble, { borderColor: theme.accent }]}>
            <MaterialIcons name="favorite" size={28} color={theme.accent} />
          </View>
          <Text style={[styles.indicatorLabel, { color: theme.accent }]}>Like</Text>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

function BackCard({ item, theme }: { item: FolderSwipeItem; theme: ThemePalette }) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={[styles.card, styles.backCard]} pointerEvents="none">
      {item.image_url ? (
        <Image
          source={{ uri: item.image_url }}
          style={styles.cardImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={`back-${item.id}`}
          transition={120}
        />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <MaterialIcons name="image" size={48} color={theme.text.tertiary} />
        </View>
      )}
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={styles.cardGradient} />
    </View>
  );
}

const makeStyles = (theme: ThemePalette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.lg,
      alignItems: 'center',
    },
    counterRow: {
      marginBottom: Spacing.sm,
    },
    counterText: {
      ...Typography.titleSmall,
      color: theme.text.primary,
      fontFamily: FontFamily.rounded,
    },
    counterTextMuted: {
      color: theme.text.tertiary,
    },
    deck: {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
    },
    card: {
      position: 'absolute',
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      borderRadius: Radius.xxl,
      overflow: 'hidden',
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.35,
      shadowRadius: 18,
      elevation: 8,
    },
    backCard: {
      transform: [{ scale: 0.94 }, { translateY: 14 }],
      opacity: 0.7,
    },
    cardImage: {
      ...StyleSheet.absoluteFillObject,
    },
    cardImagePlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background.tertiary,
    },
    cardGradient: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '65%',
    },
    cardInfo: {
      position: 'absolute',
      left: Spacing.lg,
      right: Spacing.lg,
      bottom: Spacing.lg,
      gap: Spacing.xs,
    },
    cardTitle: {
      ...Typography.headlineSmall,
      color: '#FFFFFF',
      fontFamily: FontFamily.rounded,
    },
    cardMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    metaPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    metaText: {
      ...Typography.captionSmall,
      color: '#FFFFFF',
      fontWeight: '700',
    },
    progressTrack: {
      height: 4,
      borderRadius: 2,
      backgroundColor: 'rgba(255,255,255,0.2)',
      overflow: 'hidden',
      marginTop: 4,
    },
    progressFill: {
      height: '100%',
      backgroundColor: theme.accent,
      borderRadius: 2,
    },
    tapHint: {
      ...Typography.captionSmall,
      color: 'rgba(255,255,255,0.75)',
      fontWeight: '600',
      marginTop: 4,
    },
    indicator: {
      position: 'absolute',
      top: Spacing.lg,
      alignItems: 'center',
      gap: 6,
    },
    indicatorLeft: {
      left: Spacing.lg,
    },
    indicatorRight: {
      right: Spacing.lg,
    },
    indicatorBubble: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderWidth: 2,
    },
    indicatorLabel: {
      ...Typography.captionSmall,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    actionRow: {
      flexDirection: 'row',
      marginTop: Spacing.lg,
      gap: Spacing.md,
      width: CARD_WIDTH,
    },
    actionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: Spacing.sm + 2,
      borderRadius: Radius.full,
      borderWidth: 1,
    },
    actionHavent: {
      backgroundColor: theme.background.secondary,
      borderColor: theme.glassBorder,
    },
    actionLabel: {
      ...Typography.titleSmall,
      fontWeight: '700',
      letterSpacing: 0.4,
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.xl,
      gap: Spacing.sm,
    },
    emptyIconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${theme.accent}22`,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      marginBottom: Spacing.sm,
    },
    emptyTitle: {
      ...Typography.headlineSmall,
      color: theme.text.primary,
      fontFamily: FontFamily.rounded,
    },
    emptySubtitle: {
      ...Typography.bodySmall,
      color: theme.text.secondary,
      textAlign: 'center',
      maxWidth: 280,
    },
  });
