import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PhotoCard, PhotoCardRef } from '../../components/rate/PhotoCard';
import { Photo } from '../../components/rate/types';
import { AnimeRepository } from '../../libs/repositories/anime-repository';
import { NativeAdCard, NativeAdCardRef } from '../../components/ads/NativeAdCard';
import { isAdSlotEnabled } from '../../libs/services/ads/ad-config';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassCard } from '../../components/common/GlassCard';
import { RatingInfoOverlay } from '../../components/rate/RatingInfoOverlay';
import { ImagePreloader } from '../../libs/image-preloader';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  SharedValue,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const MAX_VISIBLE_CARDS = 3;
const CARD_STACK_SPACING = 10;
const CARD_SCALE_RATIO = 0.05;
const AD_INTERVAL = 12;

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

export default function RatingScreen() {
  const { top, bottom } = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ genreId?: string; genreName?: string; animeId?: string }>();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [deck, setDeck] = useState<DeckItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const adsEnabled = isAdSlotEnabled('rate_native');

  // Shared Value for the ACTIVE card's translation X
  const activeTranslationX = useSharedValue(0);

  // Ref for the top card (shared shape between PhotoCard and NativeAdCard)
  const topCardRef = useRef<PhotoCardRef | NativeAdCardRef>(null);

  useEffect(() => {
    loadPhotos();
  }, [params.genreId, params.animeId]);

  const loadPhotos = async () => {
    setLoading(true);
    try {
      let animeList;
      if (params.animeId) {
        // [NEW] Load specific anime if requested
        const specificAnime = await AnimeRepository.getAnimeDetails(params.animeId);
        animeList = [specificAnime];
        // Optional: fetch recommendations based on this anime to fill the stack?
        // For now, just the one to rate.
      } else if (params.genreId) {
        // Genre is a string name in AniList (e.g. "Action")
        animeList = await AnimeRepository.getAnimeByGenre(params.genreId);
      } else {
        animeList = await AnimeRepository.getSeasonalAnime();
      }
      const mappedPhotos = animeList.map(AnimeRepository.mapAnimeToPhoto);
      const validPhotos = mappedPhotos.filter((p) => !!p.url);
      console.log(`Loaded ${validPhotos.length} photos out of ${mappedPhotos.length} total`);
      if (validPhotos.length > 0) {
        console.log('First photo URL:', validPhotos[0].url);
      }
      setPhotos(validPhotos);
      setDeck(buildDeck(validPhotos, adsEnabled));
      setCurrentIndex(0); // Reset index when new photos are loaded
      activeTranslationX.value = 0; // Reset shared value
    } catch (error) {
      console.error('Failed to load photos:', error);
    } finally {
      setLoading(false);
    }
  };

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
      // Save rating logic — only photo cards count toward ratings
      const item = deck[currentIndex];
      if (item?.kind === 'photo') {
        AnimeRepository.rateAnime(item.photo.id, direction === 'right' ? 'like' : 'pass');
      }

      // 2. Simply update Index
      // flingOut in PhotoCard already resets activeTranslationX
      // New PhotoCard (Next) will initialize its own translateX to 0
      if (currentIndex < deck.length - 1) {
        setCurrentIndex((prev) => prev + 1);
        // ❌ Remove: resetActiveTranslation();
      } else {
        router.back();
      }
    },
    [currentIndex, deck, router]
  );

  const triggerSwipe = (direction: 'left' | 'right') => {
    topCardRef.current?.swipe(direction);
  };

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const currentItem = deck[currentIndex];
  const currentPhoto = currentItem?.kind === 'photo' ? currentItem.photo : undefined;
  const photoProgress = useMemo(() => {
    if (deck.length === 0) return { current: 0, total: 0 };
    const total = photos.length;
    let current = 0;
    for (let i = 0; i <= currentIndex && i < deck.length; i++) {
      if (deck[i].kind === 'photo') current += 1;
    }
    return { current, total };
  }, [deck, currentIndex, photos.length]);

  return (
    <SafeAreaView style={[styles.container, { paddingTop: 0 }]} edges={['left', 'right']}>
      {/* Header & Filters */}
      <View style={[styles.headerContainer, { paddingTop: top + 10 }]}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>

          <GlassCard
            className="flex-row items-center gap-2 rounded-full px-3 py-1.5"
            intensity={20}>
            <Text style={styles.counterText}>
              {loading ? '...' : `${photoProgress.current} / ${photoProgress.total}`}
            </Text>
            <Ionicons name="swap-horizontal" size={14} color="#fff" />
          </GlassCard>

          <View style={styles.headerActions}>
            <Pressable style={styles.actionButton}>
              <Ionicons name="sparkles" size={20} color="#fff" />
            </Pressable>
            {/* Detail View Shortcut */}
            <Pressable
              style={styles.actionButton}
              onPress={() => {
                if (currentPhoto) {
                  router.push(`/(rate)/anime/${currentPhoto.id}`);
                }
              }}>
              <Ionicons name="eye" size={22} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* Genre Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.genrePillsContainer}>
          {['All', 'Action', 'Adventure', 'Comedy', 'Drama', 'Sci-Fi', 'Fantasy'].map(
            (genre, i) => (
              <Pressable key={genre} style={[styles.genrePill, i === 1 && styles.genrePillActive]}>
                <Text style={styles.genrePillText}>{genre}</Text>
              </Pressable>
            )
          )}
        </ScrollView>
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

        <View style={styles.actionButtonsRow}>
          {/* Skip */}
          <Pressable onPress={() => triggerSwipe('left')} style={styles.skipButton}>
            <Ionicons name="close" size={28} color="#000" />
          </Pressable>

          {/* Like */}
          <Pressable onPress={() => triggerSwipe('right')} style={styles.likeButton}>
            <Ionicons name="flame" size={40} color="#fff" />
          </Pressable>

          {/* Check */}
          <Pressable onPress={() => triggerSwipe('right')} style={styles.checkButton}>
            <Ionicons name="checkmark" size={28} color="#000" />
          </Pressable>
        </View>
      </View>
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
  counterText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
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
  genrePillsContainer: {
    paddingHorizontal: 0,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
  },
  genrePill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginRight: 8,
  },
  genrePillActive: {
    backgroundColor: 'rgba(39, 39, 42, 1)', // zinc-800
  },
  genrePillText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '500',
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
    paddingHorizontal: 16,
    paddingTop: 120, // Space for header
    paddingBottom: 200, // Space for bottom overlay
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
  likeButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F97316', // orange-500
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.15)',
    // Glow shadow
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  checkButton: {
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
});
