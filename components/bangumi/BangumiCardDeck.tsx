// Tinder-style swipe deck for bangumi: left swipe = remind, right swipe = plan.
// Tap a card to open the anime detail. Falls back to action buttons for users
// who prefer not to swipe (also serves as a discoverability cue on first run).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
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
import { Anime } from '../rate/types';
import { pushAnimeDetail } from '../../libs/utils/navigate-to-anime';
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

interface BangumiCardDeckProps {
  anime: Anime[];
  /**
   * Opaque key derived from season/year/filter combo. When it changes the deck
   * restarts at the top. Notably we do NOT reset on `anime` identity alone —
   * swiping triggers a trackedIds update which would regenerate the parent's
   * useMemo and infinitely bounce the deck back to card 0.
   */
  resetKey?: string;
  onSwipeRemind: (anime: Anime) => void;
  onSwipePlan: (anime: Anime) => void;
}

export function BangumiCardDeck({
  anime,
  resetKey,
  onSwipeRemind,
  onSwipePlan,
}: BangumiCardDeckProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [resetKey]);

  const current = anime[index];
  const next = anime[index + 1];
  const planFg = useMemo(() => readableTextOn(theme.accent), [theme.accent]);

  const advance = useCallback(
    (direction: 'left' | 'right', item: Anime) => {
      if (direction === 'left') onSwipeRemind(item);
      else onSwipePlan(item);
      setIndex((i) => i + 1);
    },
    [onSwipeRemind, onSwipePlan]
  );

  if (!current) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconWrap}>
          <Ionicons name="checkmark-done" size={36} color={theme.accent} />
        </View>
        <Text style={styles.emptyTitle}>{"You're all caught up"}</Text>
        <Text style={styles.emptySubtitle}>
          No more anime to triage in this view. Switch seasons or filters to find more.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.counterRow}>
        <Text style={styles.counterText}>
          {index + 1}
          <Text style={styles.counterTextMuted}> / {anime.length}</Text>
        </Text>
      </View>

      <View style={styles.deck}>
        {next ? <BackCard anime={next} theme={theme} /> : null}
        <TopCard
          key={current.id}
          anime={current}
          theme={theme}
          onSwipe={(dir) => advance(dir, current)}
          onOpenDetail={() => {
            hapticsBridge.tap();
            pushAnimeDetail(router, current);
          }}
        />
      </View>

      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Set reminder"
          onPress={() => {
            hapticsBridge.selection();
            advance('left', current);
          }}
          style={({ pressed }) => [
            styles.actionButton,
            styles.actionRemind,
            pressed && { opacity: 0.85 },
          ]}>
          <MaterialIcons name="notifications-active" size={18} color={theme.status.info} />
          <Text style={[styles.actionLabel, { color: theme.status.info }]}>Remind</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add to plan"
          onPress={() => {
            hapticsBridge.success();
            advance('right', current);
          }}
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: theme.accent, borderColor: theme.accent },
            pressed && { opacity: 0.9 },
          ]}>
          <MaterialIcons name="bookmark-add" size={18} color={planFg} />
          <Text style={[styles.actionLabel, { color: planFg }]}>Plan</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface TopCardProps {
  anime: Anime;
  theme: ThemePalette;
  onSwipe: (direction: 'left' | 'right') => void;
  onOpenDetail: () => void;
}

function TopCard({ anime, theme, onSwipe, onOpenDetail }: TopCardProps) {
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

  const remindOverlay = useAnimatedStyle(() => ({
    opacity: interpolate(-translateX.value, [20, 110], [0, 1], Extrapolation.CLAMP),
  }));

  const planOverlay = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [20, 110], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, cardStyle]}>
        <Pressable onPress={onOpenDetail} style={StyleSheet.absoluteFill}>
          <Image
            source={{ uri: anime.image }}
            style={styles.cardImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={anime.id}
            transition={180}
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.85)']}
            style={styles.cardGradient}
            pointerEvents="none"
          />
          <View style={styles.cardInfo} pointerEvents="none">
            <Text style={styles.cardTitle} numberOfLines={2}>
              {anime.title}
            </Text>
            <View style={styles.cardMetaRow}>
              {anime.score ? (
                <View style={styles.scorePill}>
                  <Ionicons name="star" size={11} color={theme.status.warning} />
                  <Text style={styles.scoreText}>{anime.score}</Text>
                </View>
              ) : null}
              {anime.format || anime.type ? (
                <Text style={styles.metaText}>{anime.format ?? anime.type}</Text>
              ) : null}
              {anime.episodes ? <Text style={styles.metaText}>{anime.episodes} eps</Text> : null}
            </View>
          </View>
        </Pressable>

        <Animated.View
          style={[styles.indicator, styles.indicatorLeft, remindOverlay]}
          pointerEvents="none">
          <View style={[styles.indicatorBubble, { borderColor: theme.status.info }]}>
            <MaterialIcons name="notifications-active" size={28} color={theme.status.info} />
          </View>
          <Text style={[styles.indicatorLabel, { color: theme.status.info }]}>Remind</Text>
        </Animated.View>

        <Animated.View
          style={[styles.indicator, styles.indicatorRight, planOverlay]}
          pointerEvents="none">
          <View style={[styles.indicatorBubble, { borderColor: theme.accent }]}>
            <MaterialIcons name="bookmark-add" size={28} color={theme.accent} />
          </View>
          <Text style={[styles.indicatorLabel, { color: theme.accent }]}>Plan</Text>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

function BackCard({ anime, theme }: { anime: Anime; theme: ThemePalette }) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={[styles.card, styles.backCard]} pointerEvents="none">
      <Image
        source={{ uri: anime.image }}
        style={styles.cardImage}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={`back-${anime.id}`}
        transition={120}
      />
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
    cardGradient: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '60%',
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
    scorePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 8,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    scoreText: {
      ...Typography.captionSmall,
      color: '#FFFFFF',
      fontWeight: '700',
    },
    metaText: {
      ...Typography.captionSmall,
      color: '#FFFFFFCC',
      fontWeight: '600',
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
    actionRemind: {
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
