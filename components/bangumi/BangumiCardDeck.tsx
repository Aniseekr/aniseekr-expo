// Tinder-style swipe deck for bangumi: left swipe = remind, right swipe = plan.
// Tap a card to open the anime detail. Falls back to action buttons for users
// who prefer not to swipe (also serves as a discoverability cue on first run).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, InteractionManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  type SharedValue,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Anime } from '../rate/types';
import { pushAnimeDetail } from '../../libs/utils/navigate-to-anime';
import { FontFamily, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { readableTextOn } from '../themed';
import {
  OUTGOING_CARD_LIFETIME_MS,
  SWIPE_PERSISTENCE_DELAY_MS,
} from '../../libs/services/rate/swipe-animation';
import {
  bangumiDeckEntryKey,
  computeBangumiDeckWindow,
  expireBangumiOutgoing,
  type BangumiDeckSlot,
  type BangumiOutgoingCard,
} from '../../libs/services/bangumi/card-deck-window';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - Spacing.lg * 2, 360);
const CARD_HEIGHT = Math.round(CARD_WIDTH * 1.4);
const SWIPE_THRESHOLD = 110;
const VELOCITY_THRESHOLD = 800;
const ROTATION_DEG = 12;
const STACK_REVEAL_DISTANCE = Math.min(CARD_WIDTH * 0.72, 260);

const EXIT_SPRING_CONFIG = {
  damping: 26,
  stiffness: 200,
  mass: 1,
  overshootClamping: true,
};

const RESET_SPRING_CONFIG = {
  damping: 30,
  stiffness: 600,
  mass: 0.9,
  overshootClamping: false,
};

interface BangumiCardDeckProps {
  anime: Anime[];
  onSwipeRemind: (anime: Anime) => void;
  onSwipePlan: (anime: Anime) => void;
}

export function BangumiCardDeck({ anime, onSwipeRemind, onSwipePlan }: BangumiCardDeckProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [index, setIndex] = useState(0);
  const [outgoing, setOutgoing] = useState<BangumiOutgoingCard<Anime>[]>([]);
  const topTranslationX = useSharedValue(0);
  const animeRef = useRef(anime);
  const indexRef = useRef(index);
  const outgoingKeysRef = useRef(new Set<string>());
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistenceTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const onSwipeRemindRef = useRef(onSwipeRemind);
  const onSwipePlanRef = useRef(onSwipePlan);

  animeRef.current = anime;
  indexRef.current = index;
  onSwipeRemindRef.current = onSwipeRemind;
  onSwipePlanRef.current = onSwipePlan;

  const current = anime[index];
  const windowEntries = useMemo(
    () => computeBangumiDeckWindow({ items: anime, topIndex: index, outgoing }),
    [anime, index, outgoing]
  );
  const planFg = useMemo(() => readableTextOn(theme.accent), [theme.accent]);

  const queueSwipeSideEffect = useCallback((direction: 'left' | 'right', item: Anime) => {
    const timer = setTimeout(() => {
      persistenceTimersRef.current.delete(timer);
      InteractionManager.runAfterInteractions(() => {
        if (direction === 'left') onSwipeRemindRef.current(item);
        else onSwipePlanRef.current(item);
      });
    }, SWIPE_PERSISTENCE_DELAY_MS);
    persistenceTimersRef.current.add(timer);
  }, []);

  const scheduleOutgoingExpiry = useCallback(() => {
    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    expiryTimerRef.current = setTimeout(() => {
      expiryTimerRef.current = null;
      setOutgoing((prev) => {
        const next = expireBangumiOutgoing({
          outgoing: prev,
          now: Date.now(),
          lifetimeMs: OUTGOING_CARD_LIFETIME_MS,
        });
        outgoingKeysRef.current = new Set(next.map((card) => card.key));
        return next;
      });
    }, OUTGOING_CARD_LIFETIME_MS);
  }, []);

  const advance = useCallback(
    (direction: 'left' | 'right') => {
      const snapshot = animeRef.current;
      const idx = indexRef.current;
      const item = snapshot[idx];
      if (!item) return;

      const key = bangumiDeckEntryKey(item, idx);
      if (outgoingKeysRef.current.has(key)) return;

      const now = Date.now();
      outgoingKeysRef.current.add(key);
      setOutgoing((prev) => {
        const next = [
          ...expireBangumiOutgoing({
            outgoing: prev,
            now,
            lifetimeMs: OUTGOING_CARD_LIFETIME_MS,
          }),
          { item, key, direction, committedAt: now },
        ];
        outgoingKeysRef.current = new Set(next.map((card) => card.key));
        return next;
      });
      setIndex((i) => i + 1);
      topTranslationX.value = 0;
      queueSwipeSideEffect(direction, item);
      scheduleOutgoingExpiry();
    },
    [queueSwipeSideEffect, scheduleOutgoingExpiry, topTranslationX]
  );

  useEffect(() => {
    return () => {
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
      for (const timer of persistenceTimersRef.current) clearTimeout(timer);
      persistenceTimersRef.current.clear();
      outgoingKeysRef.current.clear();
    };
  }, []);

  if (!current && outgoing.length === 0) {
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
          {Math.min(index + 1, anime.length)}
          <Text style={styles.counterTextMuted}> / {anime.length}</Text>
        </Text>
      </View>

      <View style={styles.deck}>
        {windowEntries.map((entry) =>
          entry.slot === 'next' ? (
            <BackCard
              key={entry.key}
              anime={entry.item}
              theme={theme}
              activeTranslation={topTranslationX}
            />
          ) : (
            <TopCard
              key={entry.key}
              anime={entry.item}
              slot={entry.slot}
              theme={theme}
              activeTranslation={entry.slot === 'top' ? topTranslationX : undefined}
              onSwipe={advance}
              onOpenDetail={() => {
                hapticsBridge.tap();
                pushAnimeDetail(router, entry.item);
              }}
            />
          )
        )}
      </View>

      {current ? (
        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Set reminder"
            onPress={() => {
              hapticsBridge.selection();
              advance('left');
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
              advance('right');
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
      ) : null}
    </View>
  );
}

interface TopCardProps {
  anime: Anime;
  slot: Extract<BangumiDeckSlot, 'outgoing' | 'top'>;
  theme: ThemePalette;
  onSwipe: (direction: 'left' | 'right') => void;
  onOpenDetail: () => void;
  activeTranslation?: SharedValue<number>;
}

function TopCard({ anime, slot, theme, onSwipe, onOpenDetail, activeTranslation }: TopCardProps) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(0);
  const thresholdHit = useSharedValue(false);
  const isTop = slot === 'top';

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(isTop)
        .onBegin(() => {
          thresholdHit.value = false;
        })
        .onChange((event) => {
          translateX.value = event.translationX;
          translateY.value = event.translationY * 0.4;
          if (activeTranslation) {
            activeTranslation.value = event.translationX;
          }
          rotate.value = interpolate(
            event.translationX,
            [-SCREEN_WIDTH, SCREEN_WIDTH],
            [-ROTATION_DEG, ROTATION_DEG],
            Extrapolation.CLAMP
          );
          const distance = Math.abs(event.translationX);
          if (distance > SWIPE_THRESHOLD && !thresholdHit.value) {
            thresholdHit.value = true;
            scheduleOnRN(hapticsBridge.swipeThreshold);
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
            const targetX = dir === 'right' ? SCREEN_WIDTH * 1.4 : -SCREEN_WIDTH * 1.4;
            translateX.value = withSpring(targetX, {
              ...EXIT_SPRING_CONFIG,
              velocity,
            });
            translateY.value = withSpring(-44, EXIT_SPRING_CONFIG);
            rotate.value = withSpring(dir === 'right' ? 20 : -20, {
              ...EXIT_SPRING_CONFIG,
              velocity: velocity / 10,
            });
            if (activeTranslation) {
              activeTranslation.value = withSpring(
                dir === 'right' ? STACK_REVEAL_DISTANCE : -STACK_REVEAL_DISTANCE,
                EXIT_SPRING_CONFIG
              );
            }
            scheduleOnRN(onSwipe, dir);
            scheduleOnRN(hapticsBridge.impact, Math.abs(velocity) > 2000 ? 'heavy' : 'medium');
          } else {
            translateX.value = withSpring(0, RESET_SPRING_CONFIG);
            translateY.value = withSpring(0, RESET_SPRING_CONFIG);
            rotate.value = withSpring(0, RESET_SPRING_CONFIG);
            if (activeTranslation) {
              activeTranslation.value = withSpring(0, RESET_SPRING_CONFIG);
            }
            scheduleOnRN(hapticsBridge.swipeCancel);
          }
          thresholdHit.value = false;
        }),
    [activeTranslation, isTop, onSwipe, rotate, thresholdHit, translateX, translateY]
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
      <Animated.View
        style={[styles.card, slot === 'outgoing' ? styles.outgoingCard : styles.topCard, cardStyle]}
        pointerEvents={isTop ? 'auto' : 'none'}>
        <Pressable onPress={isTop ? onOpenDetail : undefined} style={StyleSheet.absoluteFill}>
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

function BackCard({
  anime,
  theme,
  activeTranslation,
}: {
  anime: Anime;
  theme: ThemePalette;
  activeTranslation: SharedValue<number>;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const cardStyle = useAnimatedStyle(() => {
    const progress = Math.min(Math.abs(activeTranslation.value) / STACK_REVEAL_DISTANCE, 1);
    return {
      opacity: interpolate(progress, [0, 1], [0.7, 1], Extrapolation.CLAMP),
      transform: [
        { scale: interpolate(progress, [0, 1], [0.94, 1], Extrapolation.CLAMP) },
        { translateY: interpolate(progress, [0, 1], [14, 0], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <Animated.View style={[styles.card, styles.backCard, cardStyle]} pointerEvents="none">
      <Image
        source={{ uri: anime.image }}
        style={styles.cardImage}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={`back-${anime.id}`}
        transition={120}
      />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={styles.cardGradient} />
    </Animated.View>
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
    topCard: {
      zIndex: 20,
    },
    outgoingCard: {
      zIndex: 30,
    },
    backCard: {
      zIndex: 10,
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
