import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { PhotoCard, PhotoCardRef } from '../../components/rate/PhotoCard';
import { Photo } from '../../components/rate/types';
import { AnimeRepository } from '../../libs/repositories/anime-repository';
import { NativeAdCard, NativeAdCardRef } from '../../components/ads/NativeAdCard';
import { isAdSlotEnabled } from '../../libs/services/ads/ad-config';
import Ionicons from '@expo/vector-icons/Ionicons';
import { RatingInfoOverlay } from '../../components/rate/RatingInfoOverlay';
import { ModeSelector } from '../../components/rate/ModeSelector';
import {
  RatingActionButtons,
  type RatingType,
} from '../../components/rate/RatingActionButtons';
import { ImageDisplaySettingsSheet } from '../../components/rate/ImageDisplaySettingsSheet';
import { ImagePreloader } from '../../libs/image-preloader';
import { trackingService } from '../../libs/services/tracking/tracking-service';
import { LocalDB } from '../../libs/db';
import {
  DEFAULT_SWIPE_PREFS,
  loadUserPrefs,
  patchSwipePrefs,
  type SwipeMode,
  type SwipePrefs,
} from '../../libs/services/user-prefs';
import { useTheme } from '../../context/ThemeContext';
import { readableTextOn } from '../../components/themed';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  SharedValue,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const MAX_VISIBLE_CARDS = 3;
const CARD_STACK_SPACING = 10;
const CARD_SCALE_RATIO = 0.05;
const AD_INTERVAL = 12;
const PREFETCH_THRESHOLD = 5;
const GENRE_PER_PAGE = 20;
const SEASONAL_PER_PAGE = 50;

// Card sizing — 1:7:1 ratio (one part side margin, seven parts card, one part
// side margin) so the deck visually echoes the Discovery hero card.
const CARD_HORIZONTAL_PADDING = SCREEN_WIDTH / 9;

type DeckItem = { kind: 'photo'; photo: Photo } | { kind: 'ad'; id: string };

function buildDeck(photos: Photo[], includeAds: boolean): DeckItem[] {
  if (!includeAds) return photos.map((photo) => ({ kind: 'photo', photo }));
  const deck: DeckItem[] = [];
  let adCounter = 0;
  photos.forEach((photo, index) => {
    deck.push({ kind: 'photo', photo });
    if ((index + 1) % AD_INTERVAL === 0 && index < photos.length - 1) {
      deck.push({ kind: 'ad', id: `ad-${adCounter++}` });
    }
  });
  return deck;
}

// Spring config for smooth animations
const SPRING_CONFIG = {
  damping: 20,
  stiffness: 180,
  mass: 1,
};

function deriveRatingFromDirection(
  direction: 'left' | 'right',
  mode: SwipeMode
): RatingType {
  if (direction === 'left') return 'skip';
  return mode === 'plan' ? 'tracking' : 'like';
}

function isPositiveRating(rating: RatingType): boolean {
  return rating === 'like' || rating === 'love' || rating === 'tracking';
}

async function applyOutcome(photo: Photo, rating: RatingType): Promise<void> {
  try {
    if (rating === 'skip') return;

    if (rating === 'tracking') {
      // Plan-mode right-swipe and tracking button: write into the `planned`
      // status so the item lands in Collection's "Plan to Watch" folder.
      await trackingService.updateStatus(photo.id, 'planned', {
        title: photo.title,
        imageUrl: photo.url,
      });
      return;
    }

    if (rating === 'like' || rating === 'love') {
      // Existing path: addRating('like') + addFavorite.
      await AnimeRepository.rateAnime(photo.id, 'like');
      return;
    }

    // dislike / neutral / pass — record a 'pass' for stats; nothing lands in
    // any folder.
    await LocalDB.addRating(photo.id, 'pass');
  } catch (err) {
    console.warn('[Rating] applyOutcome failed', err);
  }
}

type ModeOption = {
  value: SwipeMode;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
};

const MODE_OPTIONS: readonly ModeOption[] = [
  { value: 'plan', label: 'Plan', icon: 'bookmark' },
  { value: 'like', label: 'Like', icon: 'heart' },
];

export default function RatingScreen() {
  const { top, bottom } = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ genreId?: string; genreName?: string; animeId?: string }>();
  const { theme } = useTheme();

  useEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ tabBarStyle: { display: 'none' } });
    return () => parent?.setOptions({ tabBarStyle: undefined });
  }, [navigation]);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [deck, setDeck] = useState<DeckItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [swipePrefs, setSwipePrefs] = useState<SwipePrefs>(DEFAULT_SWIPE_PREFS);
  const [showSettings, setShowSettings] = useState(false);
  const adsEnabled = isAdSlotEnabled('rate_native');

  // IDs the user has already swiped past in any previous session. Mirrored from
  // SQLite once on mount; new swipes are pushed into both the local ref and the
  // DB so subsequent fetches can filter them out without an extra round-trip.
  const seenIdsRef = useRef<Set<string>>(new Set());

  // Shared Value for the ACTIVE card's translation X
  const activeTranslationX = useSharedValue(0);

  // Ref for the top card (shared shape between PhotoCard and NativeAdCard)
  const topCardRef = useRef<PhotoCardRef | NativeAdCardRef>(null);
  // When a bottom-button is tapped, the desired rating is stashed here so the
  // ensuing swipe-callback consumes it instead of inferring an action from the
  // direction alone (which would lose 'love' vs 'like', 'dislike' vs 'skip', …).
  const pendingRatingRef = useRef<RatingType | null>(null);

  // Hydrate swipe prefs on mount; the ModeSelector + settings sheet persist
  // changes via patchSwipePrefs so they survive deck reloads.
  useEffect(() => {
    let cancelled = false;
    void loadUserPrefs().then((p) => {
      if (!cancelled) setSwipePrefs(p.swipe);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleModeChange = useCallback((mode: SwipeMode) => {
    setSwipePrefs((prev) => ({ ...prev, mode }));
    void patchSwipePrefs({ mode });
    hapticsBridge.selection();
  }, []);

  const handleSwipePrefsChange = useCallback((next: SwipePrefs) => {
    setSwipePrefs(next);
    void patchSwipePrefs(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const seen = await LocalDB.getSwipeSeenIds();
        if (cancelled) return;
        seenIdsRef.current = seen;
      } catch (err) {
        console.warn('[Rating] failed to hydrate seen ids', err);
      } finally {
        if (!cancelled) await loadPhotos();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.genreId, params.animeId]);

  const loadPhotos = async () => {
    setLoading(true);
    try {
      let animeList;
      let nextHasMore = true;
      if (params.animeId) {
        // Direct rating of a single anime — bypass the seen filter so the user
        // can still re-rate an item they explicitly opened.
        const specificAnime = await AnimeRepository.getAnimeDetails(params.animeId);
        animeList = [specificAnime];
        nextHasMore = false;
      } else if (params.genreId) {
        animeList = await AnimeRepository.getAnimeByGenre(params.genreId, 1);
        nextHasMore = animeList.length >= GENRE_PER_PAGE;
      } else {
        animeList = await AnimeRepository.getSeasonalAnime(undefined, undefined, 1);
        nextHasMore = animeList.length >= SEASONAL_PER_PAGE;
      }
      const seen = seenIdsRef.current;
      const isAnimeIdPath = !!params.animeId;
      const mappedPhotos = animeList.map(AnimeRepository.mapAnimeToPhoto);
      const validPhotos = mappedPhotos.filter(
        (p) => !!p.url && (isAnimeIdPath || !seen.has(p.id))
      );
      console.log(`Loaded ${validPhotos.length} photos out of ${mappedPhotos.length} total`);
      if (validPhotos.length > 0) {
        console.log('First photo URL:', validPhotos[0].url);
      }
      setPhotos(validPhotos);
      setDeck(buildDeck(validPhotos, adsEnabled));
      setCurrentIndex(0);
      setCurrentPage(1);
      setHasMore(nextHasMore);
      activeTranslationX.value = 0;
    } catch (error) {
      console.error('Failed to load photos:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMorePhotos = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    if (params.animeId) return;

    setLoadingMore(true);
    const nextPage = currentPage + 1;
    try {
      let animeList;
      let nextHasMore = true;
      if (params.genreId) {
        animeList = await AnimeRepository.getAnimeByGenre(params.genreId, nextPage);
        nextHasMore = animeList.length >= GENRE_PER_PAGE;
      } else {
        animeList = await AnimeRepository.getSeasonalAnime(undefined, undefined, nextPage);
        nextHasMore = animeList.length >= SEASONAL_PER_PAGE;
      }

      const existingIds = new Set(photos.map((p) => p.id));
      const seen = seenIdsRef.current;
      const newPhotos = animeList
        .map(AnimeRepository.mapAnimeToPhoto)
        .filter((p) => !!p.url && !existingIds.has(p.id) && !seen.has(p.id));

      if (newPhotos.length === 0) {
        // Page returned but every item was already seen / duplicate. Bump the
        // page counter so the prefetch effect can pull the next page on its
        // own re-run — without this we'd appear stuck on "all caught up" even
        // though more unseen pages exist.
        setCurrentPage(nextPage);
        if (!nextHasMore) setHasMore(false);
        return;
      }

      setPhotos((prev) => [...prev, ...newPhotos]);
      setDeck((prev) => [...prev, ...buildDeck(newPhotos, adsEnabled)]);
      setCurrentPage(nextPage);
      setHasMore(nextHasMore);
    } catch (err) {
      console.warn('Failed to load more photos:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [
    adsEnabled,
    currentPage,
    hasMore,
    loading,
    loadingMore,
    params.animeId,
    params.genreId,
    photos,
  ]);

  useEffect(() => {
    if (loading || loadingMore || !hasMore) return;
    if (deck.length === 0) return;
    const remaining = deck.length - currentIndex;
    if (remaining <= PREFETCH_THRESHOLD) {
      void loadMorePhotos();
    }
  }, [currentIndex, deck.length, hasMore, loading, loadingMore, loadMorePhotos]);

  const visibleCardIndices = useMemo(() => {
    const maxIndex = Math.min(currentIndex + MAX_VISIBLE_CARDS, deck.length);
    return Array.from({ length: maxIndex - currentIndex }, (_, i) => currentIndex + i);
  }, [currentIndex, deck.length]);

  // 🟢 Prefetch images for smoother experience
  useEffect(() => {
    if (deck.length > 0) {
      // Prefetch next 5 photo cards (skip ad sentinels)
      const nextPhotos = deck
        .slice(currentIndex + 1, currentIndex + 6)
        .map((item) => (item.kind === 'photo' ? item.photo.url : undefined))
        .filter(Boolean) as string[];
      ImagePreloader.preload(nextPhotos);
    }
  }, [currentIndex, deck]);

  const handleSwipe = useCallback(
    (direction: 'left' | 'right') => {
      const item = deck[currentIndex];
      if (item?.kind === 'photo') {
        const pending = pendingRatingRef.current;
        const rating: RatingType =
          pending ?? deriveRatingFromDirection(direction, swipePrefs.mode);
        void applyOutcome(item.photo, rating);
        // Persist that we've shown this card, regardless of action. The next
        // session's deck filters by this set so the user resumes where they
        // left off instead of re-seeing the same items.
        seenIdsRef.current.add(item.photo.id);
        void LocalDB.markSwipeSeen(item.photo.id);
      }
      pendingRatingRef.current = null;

      const isLastCard = currentIndex >= deck.length - 1;
      if (isLastCard && params.animeId) {
        // Single-anime rating flow: nothing else queued, exit back to caller.
        router.back();
        return;
      }
      // For genre / seasonal: advance past the last card and let the render
      // surface the "loading more" / "all done" state. The prefetch effect
      // pulls page N+1 well before we hit the end, so this is mostly a safety
      // net for slow networks.
      setCurrentIndex((prev) => prev + 1);
    },
    [currentIndex, deck, params.animeId, router, swipePrefs.mode]
  );

  // Bottom-button taps: stash the desired rating then animate the card out in
  // a sensible direction so the deck visually matches the action.
  const handleRateFromButton = useCallback((rating: RatingType) => {
    pendingRatingRef.current = rating;
    const direction = isPositiveRating(rating) ? 'right' : 'left';
    topCardRef.current?.swipe(direction);
  }, []);

  const triggerSwipe = useCallback((direction: 'left' | 'right') => {
    pendingRatingRef.current = null;
    topCardRef.current?.swipe(direction);
  }, []);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const currentItem = deck[currentIndex];
  const currentPhoto = currentItem?.kind === 'photo' ? currentItem.photo : undefined;

  return (
    <SafeAreaView style={[styles.container, { paddingTop: 0 }]} edges={['left', 'right']}>
      {/* Header & Filters */}
      <View style={[styles.headerContainer, { paddingTop: top + 10 }]}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <Pressable onPress={handleClose} style={styles.closeButton} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>

          <View style={styles.headerActions}>
            <Pressable
              style={styles.actionButton}
              accessibilityLabel="Rating preferences"
              onPress={() => {
                hapticsBridge.tap();
                setShowSettings(true);
              }}>
              <Ionicons name="options-outline" size={20} color="#fff" />
            </Pressable>
            <Pressable
              style={styles.actionButton}
              accessibilityLabel="View anime details"
              onPress={() => {
                if (currentPhoto) {
                  router.push(`/(rate)/anime/${currentPhoto.id}`);
                }
              }}>
              <Ionicons name="eye" size={22} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* Mode selector: Plan (right swipe → Plan to Watch) / Like (right swipe → Favorites). */}
        <View style={styles.modeSelectorRow}>
          <ModeSelector
            options={MODE_OPTIONS}
            value={swipePrefs.mode}
            onChange={handleModeChange}
            accentColor={theme.accent}
          />
        </View>
      </View>

      {/* Card Stack (Full Screen) */}
      <View style={styles.cardStackContainer}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <Ionicons name="planet" size={48} color="#666" />
            <Text style={styles.loadingText}>Loading Anime...</Text>
          </View>
        ) : deck.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="images-outline" size={64} color="#666" />
            <Text style={styles.emptyText}>No photos available</Text>
            <Pressable onPress={handleClose} style={styles.goBackButton}>
              <Text style={styles.goBackButtonText}>Go Back</Text>
            </Pressable>
          </View>
        ) : currentIndex >= deck.length ? (
          hasMore || loadingMore ? (
            <View style={styles.loadingContainer}>
              <Ionicons name="planet" size={48} color="#666" />
              <Text style={styles.loadingText}>Loading more…</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-done-circle-outline" size={64} color="#666" />
              <Text style={styles.emptyText}>You're all caught up</Text>
              <Pressable onPress={handleClose} style={styles.goBackButton}>
                <Text style={styles.goBackButtonText}>Go Back</Text>
              </Pressable>
            </View>
          )
        ) : (
          <View style={styles.cardStack}>
            {visibleCardIndices
              .slice()
              .reverse()
              .map((deckIndex) => {
                const item = deck[deckIndex];
                if (!item) return null; // Safety check

                const stackIndex = visibleCardIndices.indexOf(deckIndex);
                const key = item.kind === 'photo' ? item.photo.id : item.id;
                return (
                  <CardWrapper
                    key={key}
                    item={item}
                    index={deckIndex}
                    stackIndex={stackIndex}
                    isTop={stackIndex === 0}
                    activeTranslationX={activeTranslationX}
                    onSwipe={handleSwipe}
                    refProp={stackIndex === 0 ? topCardRef : null}
                  />
                );
              })}
          </View>
        )}
      </View>

      {/* Overlays (Info & Buttons) */}
      <View
        style={[styles.overlayContainer, { paddingBottom: bottom + 16 }]}
        pointerEvents="box-none">
        {currentPhoto && (
          <RatingInfoOverlay
            photo={currentPhoto}
            onClose={() => {}}
            onMoreDetails={() => router.push(`/(rate)/anime/${currentPhoto.id}`)}
          />
        )}

        {currentPhoto ? (
          swipePrefs.mode === 'plan' ? (
            <View style={styles.actionButtonsRow}>
              <Pressable
                onPress={() => triggerSwipe('left')}
                style={styles.skipButton}
                accessibilityLabel="Skip">
                <Ionicons name="close" size={28} color="#000" />
              </Pressable>

              <Pressable
                onPress={() => handleRateFromButton('tracking')}
                style={[styles.planButton, { backgroundColor: theme.accent }]}
                accessibilityLabel="Add to Plan to Watch">
                <Ionicons name="calendar" size={32} color={readableTextOn(theme.accent)} />
              </Pressable>
            </View>
          ) : (
            <RatingActionButtons
              style={styles.likeModeButtons}
              mode={swipePrefs.ratingButtons === 'five' ? 'fiveButtons' : 'threeButtons'}
              onRate={handleRateFromButton}
            />
          )
        ) : null}
      </View>

      <ImageDisplaySettingsSheet
        visible={showSettings}
        preferences={swipePrefs}
        onClose={() => setShowSettings(false)}
        onChange={handleSwipePrefsChange}
      />
    </SafeAreaView>
  );
}

// Subcomponent to handle individual card animations
function CardWrapper({
  item,
  index,
  stackIndex,
  isTop,
  activeTranslationX,
  onSwipe,
  refProp,
}: {
  item: DeckItem;
  index: number;
  stackIndex: number;
  isTop: boolean;
  activeTranslationX: SharedValue<number>;
  onSwipe: (direction: 'left' | 'right') => void;
  refProp: React.RefObject<(PhotoCardRef & NativeAdCardRef) | null> | null;
}) {
  // Derive progress from active card translation
  const progress = useDerivedValue(() => {
    return Math.min(Math.abs(activeTranslationX.value) / 300, 1);
  });

  // Non-linear progress for "pop" effect
  const nonLinearProgress = useDerivedValue(() => {
    return interpolate(Math.pow(progress.value, 2), [0, 1], [0, 1]);
  });

  const animatedStyle = useAnimatedStyle(() => {
    if (isTop) {
      return {
        zIndex: 100,
        transform: [{ scale: 1 }, { translateY: 0 }],
      };
    }

    // Background card animation logic
    // Base scale for this stack position (e.g., 1st behind is 0.95, 2nd is 0.9)
    const baseScale = 1 - stackIndex * CARD_SCALE_RATIO;
    // Next scale (what it will become when current card is gone)
    const nextScale = 1 - (stackIndex - 1) * CARD_SCALE_RATIO;

    // Base Y offset
    const baseTranslateY = stackIndex * CARD_STACK_SPACING;
    const nextTranslateY = (stackIndex - 1) * CARD_STACK_SPACING;

    // Interpolate based on progress
    const currentScale = interpolate(
      nonLinearProgress.value,
      [0, 1],
      [baseScale, nextScale],
      Extrapolation.CLAMP
    );

    const currentTranslateY = interpolate(
      nonLinearProgress.value,
      [0, 1],
      [baseTranslateY, nextTranslateY],
      Extrapolation.CLAMP
    );

    // Opacity: cards behind are slightly dimmed
    const baseOpacity = 1 - stackIndex * 0.15;
    const nextOpacity = 1 - (stackIndex - 1) * 0.15;
    const currentOpacity = interpolate(
      nonLinearProgress.value,
      [0, 1],
      [baseOpacity, nextOpacity],
      Extrapolation.CLAMP
    );

    return {
      zIndex: 100 - stackIndex,
      opacity: currentOpacity,
      transform: [{ scale: currentScale }, { translateY: currentTranslateY }],
    };
  });

  return (
    <Animated.View
      style={[styles.cardWrapper, animatedStyle]}
      pointerEvents={isTop ? 'auto' : 'none'}>
      {item.kind === 'photo' ? (
        <PhotoCard
          ref={refProp}
          photo={item.photo}
          index={index}
          isTop={isTop}
          onSwipe={onSwipe}
          activeTranslation={isTop ? activeTranslationX : undefined}
        />
      ) : (
        <NativeAdCard
          ref={refProp}
          isTop={isTop}
          onSwipe={onSwipe}
          activeTranslation={isTop ? activeTranslationX : undefined}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  headerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    paddingHorizontal: 16,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeSelectorRow: {
    paddingTop: 12,
    paddingBottom: 4,
  },
  cardStackContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
    fontWeight: '500',
  },
  goBackButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 24,
    marginTop: 8,
  },
  goBackButtonText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 16,
  },
  cardStack: {
    flex: 1,
    width: '100%',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardWrapper: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    paddingHorizontal: CARD_HORIZONTAL_PADDING,
    paddingTop: 110, // Space for header + mode selector
    paddingBottom: 180, // Space for bottom overlay + action buttons
  },
  overlayContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    paddingHorizontal: 20,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
    marginTop: 16,
    paddingTop: 16,
  },
  skipButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  planButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  likeModeButtons: {
    marginTop: 16,
    paddingTop: 16,
  },
});
