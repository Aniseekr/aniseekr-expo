import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, InteractionManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Photo, DeckItem } from '../../../components/rate/types';
import { AnimeRepository } from '../../../libs/repositories/anime-repository';
import { pushAnimeDetail } from '../../../libs/utils/navigate-to-anime';
import { isAdSlotEnabled } from '../../../libs/services/ads/ad-config';
import { isRateNativeAdSuppressedSync } from '../../../libs/services/ads/rate-native-ad-session';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ModePill } from '../../../components/rate/ModePill';
import { ModeSwitcherSheet, type ModeOption } from '../../../components/rate/ModeSwitcherSheet';
import { RatingActionButtons, type RatingType } from '../../../components/rate/RatingActionButtons';
import { ImageDisplaySettingsSheet } from '../../../components/rate/ImageDisplaySettingsSheet';
import { SwipeDeck, type SwipeDeckRef } from '../../../components/rate/SwipeDeck';
import { ImagePreloader } from '../../../libs/image-preloader';
import { trackingService } from '../../../libs/services/tracking/tracking-service';
import { LocalDB } from '../../../libs/db';
import {
  DEFAULT_SWIPE_PREFS,
  loadUserPrefsSync,
  patchSwipePrefs,
  type SwipeMode,
  type SwipePrefs,
} from '../../../libs/services/user-prefs';
import { useTheme } from '../../../context/ThemeContext';
import { useSubscription } from '../../../context/SubscriptionContext';
import { readableTextOn, Skeleton } from '../../../components/themed';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { getDeck, putDeck, clearDeck } from '../../../libs/services/rate/deck-cache';
import { loadGenreSwipePage } from '../../../libs/services/rate/genre-deck-prefetch';
import { restartGenreDeck } from '../../../libs/services/rate/restart-genre-deck';
import { setOverride as setGenreCoverOverride } from '../../../libs/services/rate/genre-cover-override';
import { isExhaustedSwipeDeck } from '../../../libs/services/rate/swipe-pagination';
import { loadNextUsableSwipePage } from '../../../libs/services/rate/swipe-page-loader';
import {
  buildRatingDeck,
  getUpcomingPhotoUrls,
  removeAdCardsPreservingPhotoIndex,
} from '../../../libs/services/rate/rating-deck';
import { SWIPE_PERSISTENCE_DELAY_MS } from '../../../libs/services/rate/swipe-animation';
import {
  persistSwipeJob,
  type SwipePersistenceJob,
} from '../../../libs/services/rate/swipe-persistence';
import { useT } from '../../../libs/i18n';

// Trigger and refill from remaining-card pressure, not source page length.
// AniList pages are 20 upstream, but R18/seen/image filters can leave any
// number of usable cards, including zero.
const PREFETCH_THRESHOLD = 8;
const LOAD_MORE_TARGET_PHOTOS = PREFETCH_THRESHOLD + 4;
const FILTERED_EMPTY_PAGE_SKIP_LIMIT = 2;
const PREFETCH_PHOTO_COUNT = 5;
// Card sizing — the top padding stacks on top of the safe-area inset so the
// card always clears the X + ModePill on notched devices (otherwise the
// inline Tap-for-info chip sits behind the pill). The bottom only needs to
// clear the action buttons since the hint now lives inside the card.
const CARD_HORIZONTAL_PADDING = 28;
const CARD_TOP_GAP = 56;
const CARD_PADDING_BOTTOM = 125;

function deriveRatingFromDirection(direction: 'left' | 'right', mode: SwipeMode): RatingType {
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

const swipePersistenceQueue: SwipePersistenceJob[] = [];
let swipePersistenceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSwipePersistence(photo: Photo, rating: RatingType): void {
  swipePersistenceQueue.push({ photo, rating, markSeen: true });
  if (swipePersistenceTimer) clearTimeout(swipePersistenceTimer);

  swipePersistenceTimer = setTimeout(() => {
    swipePersistenceTimer = null;
    const jobs = swipePersistenceQueue.splice(0);
    InteractionManager.runAfterInteractions(() => {
      for (const job of jobs) {
        void persistSwipeJob(job, {
          applyOutcome,
          markSwipeSeen: LocalDB.markSwipeSeen,
          warn: console.warn,
        });
      }
    });
  }, SWIPE_PERSISTENCE_DELAY_MS);
}

function releaseQueuedSwipeSeen(ids: string[]): void {
  if (ids.length === 0) return;
  const released = new Set(ids);
  for (const job of swipePersistenceQueue) {
    if (released.has(job.photo.id)) {
      job.markSeen = false;
    }
  }
}

const PLAN_COLOR = '#0A84FF';
const LIKE_COLOR = '#FF4F5E';
const SKIP_COLOR = '#FF6F60';

const SKIP_INDICATOR = { icon: 'close', color: SKIP_COLOR } as const;
const RIGHT_INDICATOR_BY_MODE: Record<SwipeMode, { icon: 'bookmark' | 'heart'; color: string }> = {
  plan: { icon: 'bookmark', color: PLAN_COLOR },
  like: { icon: 'heart', color: LIKE_COLOR },
};

export default function RatingScreen() {
  const { top, bottom } = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ genreId?: string; genreName?: string; animeId?: string }>();
  const { theme } = useTheme();
  const subscription = useSubscription();
  const t = useT();
  const MODE_OPTIONS: readonly ModeOption[] = useMemo(
    () => [
      { value: 'plan', label: t('tabs.ratingScreen.mode.plan'), icon: 'bookmark', color: PLAN_COLOR },
      { value: 'like', label: t('tabs.ratingScreen.mode.like'), icon: 'heart', color: LIKE_COLOR },
    ],
    [t]
  );

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
  // Seed sync so the swipe deck opens in the user's chosen mode/content-fit
  // on frame 1 — previously this rendered the default deck first and only
  // flipped after an async load resolved (visible flicker when re-entering
  // from a tab).
  const [swipePrefs, setSwipePrefs] = useState<SwipePrefs>(() => loadUserPrefsSync().swipe);
  const [showSettings, setShowSettings] = useState(false);
  const [showModeSwitcher, setShowModeSwitcher] = useState(false);
  const [restartableSeenIds, setRestartableSeenIds] = useState<string[]>([]);
  // Bumped on restart to force-remount the SwipeDeck so its internal topIndex
  // and outgoing-card list start clean.
  const [deckGeneration, setDeckGeneration] = useState(0);
  const adsEnabled =
    !subscription.isPro && isAdSlotEnabled('rate_native') && !isRateNativeAdSuppressedSync();

  // IDs the user has already swiped past in any previous session. Mirrored from
  // SQLite once on mount; new swipes are pushed into both the local ref and the
  // DB so subsequent fetches can filter them out without an extra round-trip.
  const seenIdsRef = useRef<Set<string>>(new Set());
  const skippedSeenIdsRef = useRef<Set<string>>(new Set());

  const photosRef = useRef<Photo[]>([]);
  const deckRef = useRef<DeckItem[]>([]);
  const animeIdRef = useRef<string | undefined>(undefined);
  const swipeModeRef = useRef<SwipeMode>(DEFAULT_SWIPE_PREFS.mode);
  // The initial top index for SwipeDeck at mount/remount time. Resetting this
  // alongside deckGeneration is how cache hydration and restart drop the user
  // onto the right card without SwipeDeck reacting to startIndex changes
  // mid-flight.
  const startIndexRef = useRef(0);

  photosRef.current = photos;
  deckRef.current = deck;
  animeIdRef.current = params.animeId;
  swipeModeRef.current = swipePrefs.mode;

  // Imperative handle into SwipeDeck — bottom buttons commit via swipeDeckRef.
  const swipeDeckRef = useRef<SwipeDeckRef>(null);
  // When a bottom-button is tapped, the desired rating is stashed here so the
  // ensuing swipe-callback consumes it instead of inferring an action from the
  // direction alone (which would lose 'love' vs 'like', 'dislike' vs 'skip', …).
  const pendingRatingRef = useRef<RatingType | null>(null);

  const rememberRestartableSeenIds = useCallback((ids: string[], mode: 'replace' | 'append') => {
    const next = mode === 'replace' ? new Set(ids) : new Set(skippedSeenIdsRef.current);
    if (mode === 'append') {
      for (const id of ids) next.add(id);
    }
    skippedSeenIdsRef.current = next;
    setRestartableSeenIds([...next]);
  }, []);

  // Swipe prefs are seeded synchronously above via `loadUserPrefsSync` so the
  // deck opens in the user's chosen mode on frame 1. No async hydrate needed.

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
              const cachedDeck = adsEnabled
                ? { deck: snapshot.deck, currentIndex: snapshot.currentIndex }
                : removeAdCardsPreservingPhotoIndex(snapshot.deck, snapshot.currentIndex);
              setPhotos(snapshot.photos);
              setDeck(cachedDeck.deck);
              setCurrentIndex(cachedDeck.currentIndex);
              startIndexRef.current = cachedDeck.currentIndex;
              setCurrentPage(snapshot.currentPage);
              setHasMore(snapshot.hasMore);
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
    // Bootstrap is scoped to the requested deck. Runtime ad availability changes
    // are handled by the normalization effect below without refetching content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.genreId, params.animeId]);

  const loadPhotos = async () => {
    setLoading(true);
    try {
      let validPhotos: Photo[] = [];
      let nextCurrentPage = 1;
      let nextHasMore = false;

      if (params.animeId) {
        // Direct rating of a single anime — bypass the seen filter so the user
        // can still re-rate an item they explicitly opened.
        const specificAnime = await AnimeRepository.getAnimeDetails(params.animeId);
        const mapped = AnimeRepository.mapAnimeToPhoto(specificAnime);
        validPhotos = mapped.url ? [mapped] : [];
        rememberRestartableSeenIds([], 'replace');
      } else {
        const pageResult = await loadNextUsableSwipePage({
          startPage: 1,
          fetchPage: (page) =>
            params.genreId
              ? loadGenreSwipePage(params.genreId, page)
              : AnimeRepository.getSeasonalAnime(undefined, undefined, page),
          mapItemToPhoto: AnimeRepository.mapAnimeToPhoto,
          seenIds: seenIdsRef.current,
          maxEmptyPagesToSkip: FILTERED_EMPTY_PAGE_SKIP_LIMIT,
        });
        validPhotos = pageResult.photos;
        nextCurrentPage = pageResult.currentPage;
        nextHasMore = pageResult.hasMore;
        rememberRestartableSeenIds(pageResult.releasableSeenIds, 'replace');
        if (pageResult.stoppedByScanLimit) {
          console.warn(
            `[Rating] stopped initial swipe page scan after ${pageResult.scannedPages} empty usable pages`
          );
        }
      }

      console.log(`Loaded ${validPhotos.length} swipe photos`);
      if (validPhotos.length > 0) {
        console.log('First photo URL:', validPhotos[0].url);
      }
      setPhotos(validPhotos);
      setDeck(buildRatingDeck(validPhotos, adsEnabled));
      setCurrentIndex(0);
      startIndexRef.current = 0;
      setCurrentPage(nextCurrentPage);
      setHasMore(nextHasMore);

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
      const pageResult = await loadNextUsableSwipePage({
        startPage: nextPage,
        fetchPage: (page) =>
          params.genreId
            ? loadGenreSwipePage(params.genreId, page)
            : AnimeRepository.getSeasonalAnime(undefined, undefined, page),
        mapItemToPhoto: AnimeRepository.mapAnimeToPhoto,
        existingIds: new Set(photos.map((p) => p.id)),
        seenIds: seenIdsRef.current,
        maxEmptyPagesToSkip: FILTERED_EMPTY_PAGE_SKIP_LIMIT,
        targetPhotoCount: LOAD_MORE_TARGET_PHOTOS,
      });
      const newPhotos = pageResult.photos;
      rememberRestartableSeenIds(pageResult.releasableSeenIds, 'append');

      if (newPhotos.length === 0) {
        setCurrentPage(pageResult.currentPage);
        setHasMore(pageResult.hasMore);
        if (pageResult.stoppedByScanLimit) {
          console.warn(
            `[Rating] stopped load-more swipe page scan after ${pageResult.scannedPages} empty usable pages`
          );
        }
        return;
      }

      setPhotos((prev) => [...prev, ...newPhotos]);
      setDeck((prev) => [...prev, ...buildRatingDeck(newPhotos, adsEnabled)]);
      setCurrentPage(pageResult.currentPage);
      setHasMore(pageResult.hasMore);
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
    rememberRestartableSeenIds,
  ]);

  // Prefetch upcoming photo cards. SwipeDeck reports the visual top via
  // onTopChange → currentIndex, so the same value drives image preloading.
  useEffect(() => {
    if (deck.length === 0) return;
    const nextPhotos = getUpcomingPhotoUrls(deck, currentIndex, PREFETCH_PHOTO_COUNT);
    if (nextPhotos.length === 0) return;
    const task = InteractionManager.runAfterInteractions(() => {
      ImagePreloader.preload(nextPhotos);
    });
    return () => task.cancel();
  }, [currentIndex, deck]);

  useEffect(() => {
    if (adsEnabled) return;
    if (!deck.some((item) => item.kind === 'ad')) return;

    const normalized = removeAdCardsPreservingPhotoIndex(deck, currentIndex);
    setDeck(normalized.deck);
    setCurrentIndex(normalized.currentIndex);
    startIndexRef.current = normalized.currentIndex;
    setDeckGeneration((g) => g + 1);
  }, [adsEnabled, currentIndex, deck]);

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
  }, [currentIndex, deck.length, hasMore, loading, loadingMore, params.animeId, params.genreId]);

  const handleCommit = useCallback(
    (item: DeckItem, direction: 'left' | 'right') => {
      if (item.kind === 'photo') {
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

      // Single-anime rating flow: nothing else queued, exit back to caller.
      if (animeIdRef.current) {
        router.back();
      }
    },
    [router]
  );

  const handleTopChange = useCallback((_item: DeckItem | null, index: number) => {
    setCurrentIndex(index);
  }, []);

  const handlePressTopCard = useCallback(
    (item: DeckItem) => {
      if (item.kind !== 'photo') return;
      pushAnimeDetail(router, {
        id: item.photo.id,
        title: item.photo.title ?? item.photo.enTitle ?? item.photo.jpTitle,
        image: item.photo.url,
      });
    },
    [router]
  );

  // Bottom-button taps: stash the desired rating then animate the card out in
  // a sensible direction so the deck visually matches the action.
  const handleRateFromButton = useCallback((rating: RatingType) => {
    pendingRatingRef.current = rating;
    const direction = isPositiveRating(rating) ? 'right' : 'left';
    swipeDeckRef.current?.swipe(direction);
  }, []);

  const triggerSwipe = useCallback((direction: 'left' | 'right') => {
    pendingRatingRef.current = null;
    swipeDeckRef.current?.swipe(direction);
  }, []);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  // Restart the current genre deck: clear this genre's cache, release the
  // loaded cards from swipe_seen, then refetch from page 1. Bumping
  // deckGeneration force-remounts SwipeDeck so its internal topIndex / outgoing
  // state restart cleanly alongside the data.
  const handleRestart = useCallback(async () => {
    if (!params.genreId || params.animeId) return;
    try {
      const extraReleasedIds = [...skippedSeenIdsRef.current];
      const releasedIds = await restartGenreDeck(
        params.genreId,
        photosRef.current,
        deckRef.current
      );
      if (extraReleasedIds.length > 0) {
        await LocalDB.clearSwipeSeenIds(extraReleasedIds);
      }
      const allReleasedIds = [...new Set([...releasedIds, ...extraReleasedIds])];
      for (const id of allReleasedIds) {
        seenIdsRef.current.delete(id);
      }
      releaseQueuedSwipeSeen(allReleasedIds);
      skippedSeenIdsRef.current.clear();
      setRestartableSeenIds([]);
      setCurrentIndex(0);
      startIndexRef.current = 0;
      setCurrentPage(1);
      setHasMore(true);
      setDeckGeneration((g) => g + 1);
      await loadPhotos();
      hapticsBridge.success();
    } catch (err) {
      console.warn('[Rating] restart failed', err);
      hapticsBridge.warning();
    }
    // loadPhotos is defined above with stable refs; intentionally not in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.animeId, params.genreId]);

  const confirmRestart = useCallback(() => {
    if (!params.genreId || params.animeId) return;
    const genreName = params.genreName ? String(params.genreName) : 'this genre';
    hapticsBridge.warning();
    Alert.alert(
      'Restart this genre?',
      `Cards you swiped in ${genreName} will come back from the start. Your collection, favorites, and tracking status stay unchanged.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restart',
          style: 'destructive',
          onPress: () => {
            void handleRestart();
          },
        },
      ]
    );
  }, [handleRestart, params.animeId, params.genreId, params.genreName]);

  const cardContainerStyle = useMemo(
    () => ({
      paddingHorizontal: CARD_HORIZONTAL_PADDING,
      paddingTop: top + CARD_TOP_GAP,
      paddingBottom: CARD_PADDING_BOTTOM,
    }),
    [top]
  );
  const deckScopeKey = params.animeId
    ? `anime-${params.animeId}`
    : params.genreId
      ? `genre-${params.genreId}`
      : 'seasonal';

  const currentItem = deck[currentIndex];
  const currentPhoto = currentItem?.kind === 'photo' ? currentItem.photo : undefined;
  const activeModeOption = MODE_OPTIONS.find((m) => m.value === swipePrefs.mode) ?? MODE_OPTIONS[0];
  const canRestartCurrentGenre = !!params.genreId && !params.animeId;
  const showEmptyRestart = canRestartCurrentGenre && restartableSeenIds.length > 0;
  const showDeck = !loading && deck.length > 0;
  const showEmpty = !loading && deck.length === 0;
  const showExhausted = !loading && deck.length > 0 && currentIndex >= deck.length;

  return (
    <SafeAreaView style={[styles.container, { paddingTop: 0 }]} edges={['left', 'right']}>
      {/* Header — close (left) + compact mode pill, then optional settings (right). */}
      <View style={[styles.headerContainer, { paddingTop: top + 10 }]}>
        <View style={styles.topBar}>
          <View style={styles.headerLeftCluster}>
            <Pressable onPress={handleClose} style={styles.closeButton} accessibilityLabel={t('tabs.ratingScreen.closeA11y')}>
              <Ionicons name="close" size={20} color="#fff" />
            </Pressable>
            <ModePill
              icon={activeModeOption.icon}
              label={activeModeOption.label}
              color={activeModeOption.color ?? theme.accent}
              onPress={() => setShowModeSwitcher(true)}
            />
          </View>

          <Pressable
            style={styles.actionButton}
            accessibilityLabel={t('tabs.ratingScreen.preferencesA11y')}
            onPress={() => {
              hapticsBridge.tap();
              setShowSettings(true);
            }}>
            <Ionicons name="options-outline" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* Card Stack (Full Screen) */}
      <View style={styles.cardStackContainer}>
        {loading ? (
          <View style={[styles.skeletonCardWrapper, { paddingTop: top + CARD_TOP_GAP }]}>
            <Skeleton.RatingCard />
          </View>
        ) : null}

        {showEmpty ? (
          hasMore || loadingMore ? (
            <View style={styles.loadingContainer}>
              <Ionicons name="planet" size={48} color="#666" />
              <Text style={styles.loadingText}>{t('tabs.ratingScreen.loadingMore')}</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="images-outline" size={64} color="#666" />
              <Text style={styles.emptyText}>{t('tabs.ratingScreen.noPhotos')}</Text>
              <View style={styles.emptyActions}>
                {showEmptyRestart ? (
                  <Pressable
                    onPress={confirmRestart}
                    style={[styles.restartButton, { backgroundColor: theme.accent }]}
                    accessibilityLabel={t('tabs.ratingScreen.restartConfirm.deckA11y')}>
                    <Ionicons
                      name="refresh"
                      size={16}
                      color={readableTextOn(theme.accent)}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[styles.restartButtonText, { color: readableTextOn(theme.accent) }]}>
                      {t('tabs.ratingScreen.restart')}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={handleClose} style={styles.goBackButton}>
                  <Text style={styles.goBackButtonText}>{t('tabs.ratingScreen.goBack')}</Text>
                </Pressable>
              </View>
            </View>
          )
        ) : null}

        {showDeck ? (
          <SwipeDeck
            key={`deck-${deckScopeKey}-${deckGeneration}`}
            ref={swipeDeckRef}
            items={deck}
            startIndex={startIndexRef.current}
            cardContainerStyle={cardContainerStyle}
            loadMoreThreshold={PREFETCH_THRESHOLD}
            onCommit={handleCommit}
            onTopChange={handleTopChange}
            onNeedMore={loadMorePhotos}
            onPressTop={handlePressTopCard}
            rightIndicator={RIGHT_INDICATOR_BY_MODE[swipePrefs.mode]}
            leftIndicator={SKIP_INDICATOR}
          />
        ) : null}

        {showExhausted ? (
          hasMore || loadingMore ? (
            <View style={styles.loadingContainer}>
              <Ionicons name="planet" size={48} color="#666" />
              <Text style={styles.loadingText}>{t('tabs.ratingScreen.loadingMore')}</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-done-circle-outline" size={64} color="#666" />
              <Text style={styles.emptyText}>{t('tabs.ratingScreen.allCaughtUp')}</Text>
              <View style={styles.emptyActions}>
                {canRestartCurrentGenre ? (
                  <Pressable
                    onPress={confirmRestart}
                    style={[styles.restartButton, { backgroundColor: theme.accent }]}
                    accessibilityLabel={t('tabs.ratingScreen.restartConfirm.deckA11y')}>
                    <Ionicons
                      name="refresh"
                      size={16}
                      color={readableTextOn(theme.accent)}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[styles.restartButtonText, { color: readableTextOn(theme.accent) }]}>
                      {t('tabs.ratingScreen.restart')}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={handleClose} style={styles.goBackButton}>
                  <Text style={styles.goBackButtonText}>{t('tabs.ratingScreen.goBack')}</Text>
                </Pressable>
              </View>
            </View>
          )
        ) : null}
      </View>

      {/* Bottom overlay — just the action buttons. The Tap-for-info hint now
          lives inside the card so the screen reads as one cohesive surface. */}
      <View
        style={[styles.overlayContainer, { paddingBottom: bottom + 16 }]}
        pointerEvents="box-none">
        {currentPhoto ? (
          swipePrefs.mode === 'plan' ? (
            <View style={styles.planButtonsRow}>
              <Pressable
                onPress={() => triggerSwipe('left')}
                style={styles.planSideButton}
                accessibilityLabel={t('tabs.ratingScreen.skipA11y')}>
                <Ionicons name="close" size={26} color="#FF6F60" />
              </Pressable>

              <Pressable
                onPress={() => handleRateFromButton('tracking')}
                style={[
                  styles.planSideButton,
                  styles.planSidePrimary,
                  { borderColor: theme.accent },
                ]}
                accessibilityLabel={t('tabs.ratingScreen.addToPlanA11y')}>
                <Ionicons name="bookmark" size={24} color={theme.accent} />
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

      <ModeSwitcherSheet
        visible={showModeSwitcher}
        value={swipePrefs.mode}
        options={MODE_OPTIONS}
        onSelect={handleModeChange}
        onClose={() => setShowModeSwitcher(false)}
      />

      <ImageDisplaySettingsSheet
        visible={showSettings}
        preferences={swipePrefs}
        onClose={() => setShowSettings(false)}
        onChange={handleSwipePrefsChange}
        restartGenreName={params.genreName ? String(params.genreName) : undefined}
        onRestartGenre={params.genreId && !params.animeId ? confirmRestart : undefined}
      />
    </SafeAreaView>
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(30,30,34,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLeftCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(30,30,34,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardStackContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    zIndex: 20,
    paddingHorizontal: 28,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
    fontWeight: '500',
  },
  emptyContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    zIndex: 20,
    paddingHorizontal: 28,
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
  skeletonCardWrapper: {
    flex: 1,
    width: '100%',
    paddingHorizontal: CARD_HORIZONTAL_PADDING,
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
  planButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 4,
  },
  planSideButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,20,22,0.85)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 111, 96, 0.55)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  planSidePrimary: {
    borderWidth: 1.5,
  },
  likeModeButtons: {
    marginTop: 16,
    paddingTop: 16,
  },
});
