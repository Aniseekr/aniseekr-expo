import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Dimensions, InteractionManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { PhotoCard, PhotoCardRef } from '../../../components/rate/PhotoCard';
import { Photo, DeckItem } from '../../../components/rate/types';
import { AnimeRepository } from '../../../libs/repositories/anime-repository';
import { NativeAdCard, NativeAdCardRef } from '../../../components/ads/NativeAdCard';
import { isAdSlotEnabled } from '../../../libs/services/ads/ad-config';
import Ionicons from '@expo/vector-icons/Ionicons';
import { RatingInfoOverlay } from '../../../components/rate/RatingInfoOverlay';
import { ModeSelector } from '../../../components/rate/ModeSelector';
import {
  RatingActionButtons,
  type RatingType,
} from '../../../components/rate/RatingActionButtons';
import { ImageDisplaySettingsSheet } from '../../../components/rate/ImageDisplaySettingsSheet';
import { ImagePreloader } from '../../../libs/image-preloader';
import { trackingService } from '../../../libs/services/tracking/tracking-service';
import { LocalDB } from '../../../libs/db';
import {
  DEFAULT_SWIPE_PREFS,
  loadUserPrefs,
  patchSwipePrefs,
  type SwipeMode,
  type SwipePrefs,
} from '../../../libs/services/user-prefs';
import { useTheme } from '../../../context/ThemeContext';
import { readableTextOn, Skeleton } from '../../../components/themed';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { getDeck, putDeck, clearDeck } from '../../../libs/services/rate/deck-cache';
import { setOverride as setGenreCoverOverride } from '../../../libs/services/rate/genre-cover-override';
import {
  hasPotentialNextSwipePage,
  isExhaustedSwipeDeck,
} from '../../../libs/services/rate/swipe-pagination';
import {
  STACK_REVEAL_DISTANCE,
  SWIPE_PERSISTENCE_DELAY_MS,
} from '../../../libs/services/rate/swipe-animation';
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
// Card sizing — baseline 1:7:1 horizontal ratio, scaled up 1.15x in width so
// the deck reads as the primary surface. Vertical paddings stay at baseline
// (bottom padding fully restored) so the card never overlaps the bottom
// skip/super-like/like buttons; the top trims a touch to balance the wider
// footprint.
const CARD_SCALE = 1.15;
const BASE_CARD_PADDING_TOP = 110;
const BASE_CARD_PADDING_BOTTOM = 180;
const BASE_CARD_WIDTH = (SCREEN_WIDTH * 7) / 9;
const CARD_HORIZONTAL_PADDING = (SCREEN_WIDTH - BASE_CARD_WIDTH * CARD_SCALE) / 2;
const CARD_PADDING_TOP = 92;
const CARD_PADDING_BOTTOM = BASE_CARD_PADDING_BOTTOM;

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

const swipePersistenceQueue: Array<{ photo: Photo; rating: RatingType }> = [];
let swipePersistenceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSwipePersistence(photo: Photo, rating: RatingType): void {
  swipePersistenceQueue.push({ photo, rating });
  if (swipePersistenceTimer) clearTimeout(swipePersistenceTimer);

  swipePersistenceTimer = setTimeout(() => {
    swipePersistenceTimer = null;
    const jobs = swipePersistenceQueue.splice(0);
    InteractionManager.runAfterInteractions(() => {
      for (const job of jobs) {
        void applyOutcome(job.photo, job.rating);
        void LocalDB.markSwipeSeen(job.photo.id);
      }
    });
  }, SWIPE_PERSISTENCE_DELAY_MS);
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

  const deckRef = useRef<DeckItem[]>([]);
  const currentIndexRef = useRef(0);
  const animeIdRef = useRef<string | undefined>(undefined);
  const swipeModeRef = useRef<SwipeMode>(DEFAULT_SWIPE_PREFS.mode);

  deckRef.current = deck;
  currentIndexRef.current = currentIndex;
  animeIdRef.current = params.animeId;
  swipeModeRef.current = swipePrefs.mode;

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
      }

      // Try the per-genre deck cache first so the user resumes where they left
      // off without flashing the skeleton and without re-hitting AniList.
      // Skips for the single-anime path (no deck to persist) and for the
      // seasonal path (genreId undefined).
      if (params.genreId && !params.animeId) {
        try {
          const snapshot = await getDeck(params.genreId);
          if (cancelled) return;
          if (snapshot && snapshot.deck.length > 0) {
            if (
              isExhaustedSwipeDeck({
                deckLength: snapshot.deck.length,
                currentIndex: snapshot.currentIndex,
                hasMore: snapshot.hasMore,
              })
            ) {
              await clearDeck(params.genreId);
            } else {
              setPhotos(snapshot.photos);
              setDeck(snapshot.deck);
              setCurrentIndex(snapshot.currentIndex);
              setCurrentPage(snapshot.currentPage);
              setHasMore(snapshot.hasMore);
              activeTranslationX.value = 0;
              setLoading(false);
              return;
            }
          }
        } catch (err) {
          console.warn('[Rating] cache hydrate failed', err);
        }
      }

      if (!cancelled) await loadPhotos();
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
      // Dynamic loading guard: deck filters run after the API fetch, so a
      // short non-empty source page is not an end-of-list signal.
      if (params.animeId) {
        // Direct rating of a single anime — bypass the seen filter so the user
        // can still re-rate an item they explicitly opened.
        const specificAnime = await AnimeRepository.getAnimeDetails(params.animeId);
        animeList = [specificAnime];
        nextHasMore = false;
      } else if (params.genreId) {
        animeList = await AnimeRepository.getAnimeByGenre(params.genreId, 1);
        nextHasMore = hasPotentialNextSwipePage(animeList.length);
      } else {
        animeList = await AnimeRepository.getSeasonalAnime(undefined, undefined, 1);
        nextHasMore = hasPotentialNextSwipePage(animeList.length);
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

      // Q3: backfill the Discovery carousel's cover for this genre. The merge
      // step in getGenres only honors the override when the AniList cover came
      // back '', so writing every time is harmless and keeps the override
      // fresh as content rotates.
      if (params.genreId && validPhotos[0]?.url) {
        void setGenreCoverOverride(params.genreId, validPhotos[0].url);
      }
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
      // Same guard as the initial load: only an empty source page should stop
      // category/seasonal swipe pagination.
      if (params.genreId) {
        animeList = await AnimeRepository.getAnimeByGenre(params.genreId, nextPage);
        nextHasMore = hasPotentialNextSwipePage(animeList.length);
      } else {
        animeList = await AnimeRepository.getSeasonalAnime(undefined, undefined, nextPage);
        nextHasMore = hasPotentialNextSwipePage(animeList.length);
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
    const remaining = deck.length - currentIndex;
    if (remaining <= PREFETCH_THRESHOLD) {
      void loadMorePhotos();
    }
  }, [currentIndex, deck.length, hasMore, loading, loadingMore, loadMorePhotos]);

  useEffect(() => {
    activeTranslationX.value = 0;
  }, [activeTranslationX, currentIndex]);

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
      const task = InteractionManager.runAfterInteractions(() => {
        ImagePreloader.preload(nextPhotos);
      });
      return () => task.cancel();
    }
  }, [currentIndex, deck]);

  // Persist the current deck snapshot any time the user moves through it. The
  // service debounces SQLite writes by 500ms, but the in-memory layer is
  // updated synchronously so an immediate re-entry into this genre hydrates
  // with no flash. Disabled for the single-anime path — nothing to resume.
  useEffect(() => {
    if (loading) return;
    if (!params.genreId || params.animeId) return;
    if (deck.length === 0) return;
    putDeck(params.genreId, {
      photos,
      deck,
      currentIndex,
      currentPage,
      hasMore,
      mode: swipePrefs.mode,
      updatedAt: Date.now(),
    });
  }, [
    deck,
    photos,
    currentIndex,
    currentPage,
    hasMore,
    loading,
    params.animeId,
    params.genreId,
    swipePrefs.mode,
  ]);

  // Clear the cached deck the moment the user runs out of unseen content for
  // this genre. Without this, returning later would hydrate straight into the
  // "all caught up" screen instead of fetching the next batch.
  useEffect(() => {
    if (loading || loadingMore) return;
    if (!params.genreId || params.animeId) return;
    if (deck.length === 0) return;
    if (currentIndex < deck.length) return;
    if (hasMore) return;
    void clearDeck(params.genreId);
  }, [
    currentIndex,
    deck.length,
    hasMore,
    loading,
    loadingMore,
    params.animeId,
    params.genreId,
  ]);

  const handleSwipe = useCallback(
    (direction: 'left' | 'right') => {
      const index = currentIndexRef.current;
      const deckSnapshot = deckRef.current;
      const item = deckSnapshot[index];
      if (item?.kind === 'photo') {
        const pending = pendingRatingRef.current;
        const rating: RatingType =
          pending ?? deriveRatingFromDirection(direction, swipeModeRef.current);
        // Persist that we've shown this card, regardless of action. The next
        // session's deck filters by this set so the user resumes where they
        // left off instead of re-seeing the same items.
        seenIdsRef.current.add(item.photo.id);
        scheduleSwipePersistence(item.photo, rating);
      }
      pendingRatingRef.current = null;

      const isLastCard = index >= deckSnapshot.length - 1;
      if (isLastCard && animeIdRef.current) {
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
    [router]
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

  // Restart the current deck: clears the per-genre cache, wipes the global
  // "seen" set so AniList items that were previously filtered out come back,
  // and refetches from page 1. Single-anime path doesn't need this (there's
  // only ever one card).
  const handleRestart = useCallback(async () => {
    hapticsBridge.tap();
    try {
      if (params.genreId) {
        await clearDeck(params.genreId);
      }
      await LocalDB.clearSwipeSeen();
      seenIdsRef.current = new Set();
      setCurrentIndex(0);
      setCurrentPage(1);
      setHasMore(true);
      activeTranslationX.value = 0;
      await loadPhotos();
    } catch (err) {
      console.warn('[Rating] restart failed', err);
    }
    // loadPhotos is defined above with stable refs; intentionally not in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.genreId]);

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
                  router.push(`/anime/${currentPhoto.id}`);
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
          <View style={styles.skeletonCardWrapper}>
            <Skeleton.RatingCard />
          </View>
        ) : deck.length === 0 ? (
          hasMore || loadingMore ? (
            <View style={styles.loadingContainer}>
              <Ionicons name="planet" size={48} color="#666" />
              <Text style={styles.loadingText}>Loading more…</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="images-outline" size={64} color="#666" />
              <Text style={styles.emptyText}>No photos available</Text>
              <Pressable onPress={handleClose} style={styles.goBackButton}>
                <Text style={styles.goBackButtonText}>Go Back</Text>
              </Pressable>
            </View>
          )
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
              <View style={styles.emptyActions}>
                {!params.animeId ? (
                  <Pressable
                    onPress={handleRestart}
                    style={[styles.restartButton, { backgroundColor: theme.accent }]}
                    accessibilityLabel="Restart deck"
                  >
                    <Ionicons
                      name="refresh"
                      size={16}
                      color={readableTextOn(theme.accent)}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[styles.restartButtonText, { color: readableTextOn(theme.accent) }]}
                    >
                      Restart
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={handleClose} style={styles.goBackButton}>
                  <Text style={styles.goBackButtonText}>Go Back</Text>
                </Pressable>
              </View>
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
            onMoreDetails={() => router.push(`/anime/${currentPhoto.id}`)}
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
    return Math.min(Math.abs(activeTranslationX.value) / STACK_REVEAL_DISTANCE, 1);
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
  emptyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  goBackButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 24,
  },
  goBackButtonText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 16,
  },
  restartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  restartButtonText: {
    fontWeight: '700',
    fontSize: 15,
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
    paddingTop: CARD_PADDING_TOP, // Space for header + mode selector
    paddingBottom: CARD_PADDING_BOTTOM, // Space for bottom overlay + action buttons
  },
  skeletonCardWrapper: {
    flex: 1,
    width: '100%',
    paddingHorizontal: CARD_HORIZONTAL_PADDING,
    paddingTop: CARD_PADDING_TOP,
    paddingBottom: CARD_PADDING_BOTTOM,
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
