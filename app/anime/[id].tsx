import { useLocalSearchParams, useNavigation, useRouter, Stack } from 'expo-router';
import { useEffect, useMemo, useReducer, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  InteractionManager,
  Linking,
  Share,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';

import { AnimeRepository } from '../../libs/repositories/anime-repository';
import { pushAnimeDetail } from '../../libs/utils/navigate-to-anime';
import { LocalDB } from '../../libs/db';
import { Anime } from '../../components/rate/types';
import { GlassCard } from '../../components/common/GlassCard';
import type {
  AnimeStreaming,
  AnimeRelation,
  AnimeStaff,
  AnimeTheme,
  PlatformRatingData,
} from '../../libs/services/data-sources/anime-data-source';
import type { PlatformType } from '../../libs/services/auth/types';
import { pilgrimageRepository } from '../../libs/services/pilgrimage/pilgrimage-repository';
import { lookupBangumiByPlatformId } from '../../libs/services/pilgrimage/anitabi-cross-index';
import { dataSourceConfig } from '../../libs/services/data-source-config';
import { Skeleton, readableTextOn } from '../../components/themed';
import { PlatformLogo } from '../../components/streaming/PlatformLogo';
import { AnimePilgrimageCard } from '../../components/pilgrimage/AnimePilgrimageCard';
import type { AnitabiBangumi } from '../../libs/services/pilgrimage/types';
import { AddToCollectionSheet } from '../../components/collection/AddToCollectionSheet';
import { trackingService } from '../../libs/services/tracking/tracking-service';
import { collectionService } from '../../libs/services/collection/collection-service';
import {
  loadUserPrefsSync,
  patchUserPrefs,
  subscribeUserPrefs,
  type StreamingPrefs,
} from '../../libs/services/user-prefs';
import {
  resolveWatchOptions,
  type WatchOption,
} from '../../libs/services/streaming/streaming-resolver';
import { openWatchOption } from '../../libs/services/streaming/streaming-linker';
import {
  animeNotificationService,
  useIsAnimeScheduled,
} from '../../modules/notifications/animeNotificationService';

type RatingEntry = { platform: PlatformType; data: PlatformRatingData };

interface MediaState {
  streaming: AnimeStreaming[];
  themes: AnimeTheme | null;
  relations: AnimeRelation[];
  staff: AnimeStaff[];
  ratings: RatingEntry[];
  loading: boolean;
}

type MediaAction =
  | { type: 'reset' }
  | { type: 'streaming'; value: AnimeStreaming[] }
  | { type: 'themes'; value: AnimeTheme | null }
  | { type: 'relations'; value: AnimeRelation[] }
  | { type: 'staff'; value: AnimeStaff[] }
  | { type: 'ratings'; value: RatingEntry[] }
  | { type: 'done' };

const INITIAL_MEDIA: MediaState = {
  streaming: [],
  themes: null,
  relations: [],
  staff: [],
  ratings: [],
  loading: true,
};

function mediaReducer(state: MediaState, action: MediaAction): MediaState {
  switch (action.type) {
    case 'reset':
      return INITIAL_MEDIA;
    case 'streaming':
      return { ...state, streaming: action.value };
    case 'themes':
      return { ...state, themes: action.value };
    case 'relations':
      return { ...state, relations: action.value };
    case 'staff':
      return { ...state, staff: action.value };
    case 'ratings':
      return { ...state, ratings: action.value };
    case 'done':
      return state.loading ? { ...state, loading: false } : state;
  }
}

export default function AnimeDetailScreen() {
  const {
    id,
    openWatch,
    title: paramTitle,
    image: paramImage,
    bannerImage: paramBanner,
  } = useLocalSearchParams<{
    id: string;
    openWatch?: string;
    title?: string;
    image?: string;
    bannerImage?: string;
  }>();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ tabBarStyle: { display: 'none' } });
    return () => parent?.setOptions({ tabBarStyle: undefined });
  }, [navigation]);


  // Rule 10: seed initial state from the sync cache (warm hit) or route-param
  // chrome (cold hit), so frame 1 shows real content instead of a skeleton.
  const initialAnimeRef = useRef<Anime | null>(null);
  if (initialAnimeRef.current === null) {
    const cached = id ? AnimeRepository.getAnimeDetailsSync(id) : null;
    if (cached) {
      initialAnimeRef.current = cached;
    } else if (id && paramTitle && paramImage) {
      initialAnimeRef.current = {
        id,
        title: paramTitle,
        image: paramImage,
        bannerImage: paramBanner,
      } as Anime;
    }
  }
  const [anime, setAnime] = useState<Anime | null>(initialAnimeRef.current);
  // Cache hit means we have the full record; param-seed still needs a fetch but
  // the user already sees a hero, so we don't show a blocking skeleton.
  const hasFullRecord = !!(initialAnimeRef.current && (initialAnimeRef.current.description !== undefined || initialAnimeRef.current.episodes !== undefined));
  const [loading, setLoading] = useState(!hasFullRecord);
  const [pilgrimage, setPilgrimage] = useState<AnitabiBangumi | null>(null);

  const [media, dispatchMedia] = useReducer(mediaReducer, INITIAL_MEDIA);
  const {
    streaming,
    themes,
    relations,
    staff,
    ratings: platformRatings,
    loading: mediaLoading,
  } = media;
  const [favorite, setFavorite] = useState(false);
  const [inCollection, setInCollection] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Seed streaming prefs synchronously from MMKV so the "Watch on" rail
  // renders the user's chosen primary on frame 1, instead of flashing
  // through `DEFAULT_STREAMING_PREFS` (empty list, no CTA) first.
  const [streamingPrefs, setStreamingPrefs] = useState<StreamingPrefs>(
    () => loadUserPrefsSync().streamingPlatforms,
  );
  const reminderScheduled = useIsAnimeScheduled(id);

  useEffect(() => {
    let mounted = true;
    // Stay in sync when the user toggles primary / enabled platforms on the
    // settings screen and returns here — the detail page is still mounted in
    // the Expo Router stack so the seed above won't re-run.
    const unsub = subscribeUserPrefs((p) => {
      if (mounted) setStreamingPrefs(p.streamingPlatforms);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const watchOptions: WatchOption[] = useMemo(
    () =>
      resolveWatchOptions({
        animeTitle: anime?.titleEnglish || anime?.title || '',
        anilistStreaming: streaming,
        prefs: streamingPrefs,
      }),
    [anime, streaming, streamingPrefs]
  );
  const primaryOption = watchOptions[0] ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    // Rule 10: don't flip loading=true if we already painted real content from
    // the sync cache; revalidate silently. Only spinner-block when frame 1 was
    // genuinely empty.
    if (!initialAnimeRef.current) setLoading(true);
    AnimeRepository.getAnimeDetails(id)
      .then((data) => {
        if (!cancelled) setAnime(data);
      })
      .catch((e) => console.warn('[AnimeDetail] load failed', e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const task = InteractionManager.runAfterInteractions(() => {
      void refreshCollectionFlags(id, () => cancelled).then((flags) => {
        if (cancelled || !flags) return;
        setFavorite(flags.favorite);
        setInCollection(flags.inCollection);
      });
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [id]);

  const refreshFlags = useCallback(async () => {
    if (!id) return;
    const flags = await refreshCollectionFlags(id);
    if (!flags) return;
    setFavorite(flags.favorite);
    setInCollection(flags.inCollection);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    setPilgrimage(null);

    // Use the active browse source so the repository's L2 cross-index lookup
    // can short-circuit (anilist/myanimelist hit L2, others fall through to
    // the L1 SQLite mapping table). Pre-resolving the bangumiId via L2 also
    // gives the AnimePilgrimageCard a stable key when we hand it off later.
    const sourcePlatform = dataSourceConfig.browseSource;
    const directBangumiId = lookupBangumiByPlatformId(sourcePlatform, id);

    const task = InteractionManager.runAfterInteractions(() => {
      pilgrimageRepository
        .getSpotsForAnime({
          sourcePlatform,
          id,
          bangumiId: directBangumiId,
        })
        .then((result) => {
          if (cancelled) return;
          setPilgrimage(result);
        })
        .catch((err: unknown) => {
          console.warn('[AnimeDetail] pilgrimage fetch failed:', err);
        });
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [id]);

  // Cross-platform media: streaming, themes, relations, staff, ratings.
  // Fired in parallel after the navigation interaction has settled. The
  // per-channel rate limiter inside each client (AniList 666ms, Jikan 350ms,
  // Bangumi 333ms) still handles spacing; deferring just keeps these secondary
  // requests from competing with the detail hero during tap-to-detail.
  useEffect(() => {
    if (!id) return;
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) {
      dispatchMedia({ type: 'done' });
      return;
    }

    dispatchMedia({ type: 'reset' });
    let cancelled = false;
    const repo = AnimeRepository.defaultInstance();

    const task = InteractionManager.runAfterInteractions(() => {
      const tasks: Promise<unknown>[] = [
        repo
          .fetchAnimeStreaming(numericId, 'anilist')
          .then((v) => {
            if (!cancelled) dispatchMedia({ type: 'streaming', value: v });
          })
          .catch((e) => console.warn('[AnimeDetail] streaming failed', e)),
        repo
          .fetchAnimeThemes(numericId, 'anilist')
          .then((v) => {
            if (!cancelled) dispatchMedia({ type: 'themes', value: v });
          })
          .catch((e) => console.warn('[AnimeDetail] themes failed', e)),
        repo
          .fetchAnimeRelations(numericId, 'anilist')
          .then((v) => {
            if (!cancelled) dispatchMedia({ type: 'relations', value: v });
          })
          .catch((e) => console.warn('[AnimeDetail] relations failed', e)),
        repo
          .fetchAnimeStaff(numericId, 'anilist')
          .then((v) => {
            if (!cancelled) dispatchMedia({ type: 'staff', value: v });
          })
          .catch((e) => console.warn('[AnimeDetail] staff failed', e)),
        repo
          .fetchMultiPlatformRatings(numericId, 'anilist')
          .then((v) => {
            if (!cancelled) dispatchMedia({ type: 'ratings', value: v });
          })
          .catch((e) => console.warn('[AnimeDetail] ratings failed', e)),
      ];

      void Promise.allSettled(tasks).then(() => {
        if (!cancelled) dispatchMedia({ type: 'done' });
      });
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [id]);

  const openOption = useCallback(
    async (option: WatchOption | null) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (option) {
        await openWatchOption(option, {
          preferAppDeepLink: streamingPrefs.preferAppDeepLink,
          linker: Linking,
        });
        return;
      }
      // No resolved option at all — fall back to AniList page so the CTA is
      // never dead. Safe because anilist.co/anime/<id> is always reachable
      // from any id we have, and we never fabricate any platform-specific
      // detail (per CLAUDE.md Rule 8).
      if (id) {
        await Linking.openURL(`https://anilist.co/anime/${id}`).catch(() => undefined);
      }
    },
    [id, streamingPrefs.preferAppDeepLink]
  );

  const handleWatch = useCallback(() => {
    void openOption(primaryOption);
  }, [openOption, primaryOption]);

  // When the user arrives via a notification tap (openWatch=1), surface the
  // primary platform once the resolver has something real. We only fire it
  // when there *is* a resolved option — otherwise we'd be guessing.
  //
  // `firedRef` survives re-renders, so even if `openOption` / `primaryOption`
  // rebuild before `setParams({ openWatch: undefined })` propagates, the deep
  // link can never fire twice for the same arrival. When `openWatch` flips
  // back to something other than '1' we reset the latch so a second
  // notification arriving while the page is still mounted still works.
  const openWatchFiredRef = useRef(false);
  useEffect(() => {
    if (openWatch !== '1') {
      openWatchFiredRef.current = false;
      return;
    }
    if (!primaryOption) return;
    if (openWatchFiredRef.current) return;
    openWatchFiredRef.current = true;
    void openOption(primaryOption);
    // Drop the query param so a back/forward doesn't re-trigger the jump.
    router.setParams({ openWatch: undefined } as never);
  }, [openWatch, primaryOption, openOption, router]);

  const openSheet = useCallback(() => {
    if (!anime) return;
    Haptics.selectionAsync();
    setSheetOpen(true);
  }, [anime]);

  const handleQuickAdd = useCallback(async () => {
    if (!anime) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const target = loadUserPrefsSync().lastAddedFolderId || 'system_favorites';
    const payload = { id: anime.id, title: anime.title, image: anime.image };
    try {
      if (target === 'system_favorites') {
        await LocalDB.addFavorite(payload);
      } else if (target === 'system_watching') {
        await trackingService.updateStatus(anime.id, 'watching', {
          title: anime.title,
          imageUrl: anime.image,
        });
      } else if (target === 'system_completed') {
        await trackingService.updateStatus(anime.id, 'completed', {
          title: anime.title,
          imageUrl: anime.image,
        });
      } else if (target === 'system_dropped') {
        await trackingService.updateStatus(anime.id, 'dropped', {
          title: anime.title,
          imageUrl: anime.image,
        });
      } else if (target === 'system_plan_to_watch') {
        await trackingService.updateStatus(anime.id, 'planned', {
          title: anime.title,
          imageUrl: anime.image,
        });
      } else if (target.startsWith('system_')) {
        // 'system_all' or unknown — fall back to favorites.
        await LocalDB.addFavorite(payload);
        await patchUserPrefs({ lastAddedFolderId: 'system_favorites' });
      } else {
        await trackingService.upsertTracking({
          animeId: anime.id,
          status: 'planned',
          title: anime.title,
          imageUrl: anime.image,
        });
        await collectionService.addToFolder(anime.id, target);
      }
      await refreshFlags();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, [anime, refreshFlags]);

  const handleFavoriteToggle = useCallback(async () => {
    if (!anime) return;
    Haptics.selectionAsync();
    if (favorite) {
      await LocalDB.removeFavorite(anime.id);
      setFavorite(false);
    } else {
      await LocalDB.addFavorite({ id: anime.id, title: anime.title, image: anime.image });
      setFavorite(true);
      await patchUserPrefs({ lastAddedFolderId: 'system_favorites' });
    }
  }, [favorite, anime]);

  const handleToggleReminder = useCallback(async () => {
    if (!anime) return;
    Haptics.selectionAsync();
    try {
      if (reminderScheduled) {
        await animeNotificationService.cancelAnimeNotification(anime.id);
      } else {
        await animeNotificationService.scheduleAnimeNotification(anime);
      }
    } catch (e) {
      console.warn('[AnimeDetail] reminder toggle failed', e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, [anime, reminderScheduled]);

  const handleShare = useCallback(async () => {
    if (!anime) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const url = `https://anilist.co/anime/${anime.id}`;
      await Share.share({ message: `${anime.title} — ${url}`, url });
    } catch {
      // user dismissed
    }
  }, [anime]);

  // Rule 10: only show the blocking skeleton when frame 1 has nothing — cache
  // hit or route-seeded chrome both render the real layout below.
  if (!anime) {
    return (
      <View className="flex-1 bg-black">
        <Stack.Screen options={{ headerShown: false }} />
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 120 }}>
          <Skeleton.HeroDetail showEpisodes={true} />
        </ScrollView>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{
            top: insets.top + 10,
            left: 20,
            position: 'absolute',
            zIndex: 50,
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.6)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.2)',
          }}>
          <Ionicons name="chevron-back" size={24} color="white" />
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 120 }}>
        <View className="relative h-64 w-full">
          <Image
            source={{ uri: anime.bannerImage || anime.image }}
            style={{ width: '100%', height: '100%', opacity: 0.6 }}
            contentFit="cover"
            transition={120}
            cachePolicy="memory-disk"
            recyclingKey={anime.id}
          />
          <LinearGradient
            colors={['transparent', '#000']}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 150 }}
          />
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{
              top: insets.top + 10,
              left: 20,
              position: 'absolute',
              zIndex: 50,
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0,0,0,0.6)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.2)',
            }}>
            <Ionicons name="chevron-back" size={24} color="white" />
          </Pressable>
        </View>

        <View className="-mt-20 px-5">
          <View className="flex-row items-end gap-4">
            <Image
              source={{ uri: anime.image }}
              style={{
                width: 112,
                height: 160,
                borderRadius: 8,
                borderWidth: 2,
                borderColor: 'rgba(255,255,255,0.1)',
              }}
              contentFit="cover"
              transition={120}
              cachePolicy="memory-disk"
              recyclingKey={`${anime.id}-poster`}
            />
            <View className="flex-1 pb-2">
              <Text className="text-xl leading-tight font-bold text-white" numberOfLines={2}>
                {anime.title}
              </Text>
              {anime.titleEnglish ? (
                <Text className="mt-1 text-xs text-zinc-400" numberOfLines={1}>
                  {anime.titleEnglish}
                </Text>
              ) : null}
              <View className="mt-2 flex-row flex-wrap gap-2">
                <GlassCard intensity={20} className="rounded px-2 py-1">
                  <Text className="text-xs font-bold text-white/90">
                    ★ {formatScore(anime.score, anime.rank)}
                  </Text>
                </GlassCard>
                <GlassCard intensity={20} className="rounded px-2 py-1">
                  <Text className="text-xs font-bold text-white/90">
                    {anime.status || 'Unknown'}
                  </Text>
                </GlassCard>
              </View>
            </View>
          </View>

          <View className="mt-6 flex-row gap-3">
            <Pressable
              onPress={handleWatch}
              accessibilityLabel={
                primaryOption
                  ? `Watch on ${primaryOption.displayName}`
                  : 'Open AniList page (no streaming platform configured)'
              }
              className="flex-1 flex-row items-center justify-center gap-2 rounded-full bg-white py-3">
              {primaryOption ? (
                <PlatformLogo
                  size={22}
                  logoDomain={primaryOption.logoDomain}
                  iconUrl={primaryOption.iconUrl}
                  monogram={primaryOption.monogram}
                  brandColor={primaryOption.color}
                  background="transparent"
                />
              ) : (
                <Ionicons name="play" size={20} color="black" />
              )}
              <Text className="text-base font-bold text-black" numberOfLines={1}>
                {primaryOption ? `Watch on ${primaryOption.displayName}` : 'Watch Now'}
              </Text>
            </Pressable>
            <Pressable
              onPress={openSheet}
              onLongPress={handleQuickAdd}
              delayLongPress={320}
              accessibilityLabel="Add to collection"
              accessibilityHint="Long press to add to your last-used folder"
              className="h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-zinc-800">
              <Ionicons
                name={inCollection ? 'checkmark' : 'add'}
                size={24}
                color={inCollection ? '#34d399' : 'white'}
              />
            </Pressable>
            {anime.nextAiringEpisode ? (
              <Pressable
                onPress={handleToggleReminder}
                accessibilityLabel={
                  reminderScheduled ? 'Cancel episode reminder' : 'Set episode reminder'
                }
                className="h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-zinc-800">
                <Ionicons
                  name={reminderScheduled ? 'notifications' : 'notifications-outline'}
                  size={22}
                  color={reminderScheduled ? '#fbbf24' : 'white'}
                />
              </Pressable>
            ) : null}
            <Pressable
              onPress={handleFavoriteToggle}
              accessibilityLabel={favorite ? 'Remove from favorites' : 'Add to favorites'}
              className="h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-zinc-800">
              <Ionicons
                name={favorite ? 'heart' : 'heart-outline'}
                size={22}
                color={favorite ? '#f87171' : 'white'}
              />
            </Pressable>
            <Pressable
              onPress={handleShare}
              accessibilityLabel="Share anime"
              className="h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-zinc-800">
              <Ionicons name="share-outline" size={22} color="white" />
            </Pressable>
          </View>

          <View className="mt-8">
            <Text className="mb-3 text-lg font-bold text-white">Synopsis</Text>
            <Text className="leading-6 text-zinc-400">
              {anime.description || anime.mood || 'No description available.'}
            </Text>
          </View>

          {anime.tags && anime.tags.length > 0 ? (
            <View className="mt-6">
              <Text className="mb-3 text-lg font-bold text-white">Tags</Text>
              <View className="flex-row flex-wrap gap-2">
                {anime.tags.map((tag) => (
                  <View
                    key={tag}
                    className="rounded-full border border-white/5 bg-zinc-800 px-3 py-1.5">
                    <Text className="text-sm text-zinc-300">{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {watchOptions.length > 0 ? (
            <WatchOptionsSection
              items={watchOptions}
              onOpen={(opt) => void openOption(opt)}
              onConfigure={() => router.push('/(setting)/watch-platforms')}
            />
          ) : null}

          {pilgrimage ? (
            <View className="mt-8">
              <Text className="mb-3 text-lg font-bold text-white">Pilgrimage</Text>
              <AnimePilgrimageCard
                anime={pilgrimage}
                onPress={(target) => router.push(`/pilgrimage/${target.id}`)}
              />
            </View>
          ) : null}

          {relations.length > 0 ? <RelationsSection items={relations} /> : null}

          {themes && (themes.openings.length > 0 || themes.endings.length > 0) ? (
            <ThemesSection themes={themes} />
          ) : null}

          {staff.length > 0 ? <StaffSection items={staff} /> : null}

          {platformRatings.length > 0 ? <PlatformRatingsSection items={platformRatings} /> : null}

          {mediaLoading &&
          relations.length === 0 &&
          streaming.length === 0 &&
          staff.length === 0 ? (
            <View className="mt-8 items-center">
              <ActivityIndicator color="#666" />
            </View>
          ) : null}

          <View className="mt-8 rounded-2xl border border-white/5 bg-zinc-900/50 p-4">
            <Text className="mb-4 text-lg font-bold text-white">Information</Text>
            <View className="flex-row flex-wrap">
              <InfoItem label="Format" value={anime.format || '?'} />
              <InfoItem
                label="Episodes"
                value={anime.episodes != null ? String(anime.episodes) : '?'}
              />
              <InfoItem label="Duration" value={`${anime.durationMinutes || '?'} mins`} />
              <InfoItem label="Status" value={anime.status || '?'} />
              <InfoItem
                label="Start Date"
                value={anime.startDate?.year ? String(anime.startDate.year) : '?'}
              />
              <InfoItem label="Studios" value={anime.studios?.[0] || '?'} />
            </View>
          </View>
        </View>
      </ScrollView>

      <AddToCollectionSheet
        visible={sheetOpen}
        anime={anime ? { id: anime.id, title: anime.title, image: anime.image } : null}
        onClose={() => setSheetOpen(false)}
        onChanged={refreshFlags}
      />
    </View>
  );
}

async function refreshCollectionFlags(
  id: string,
  isCancelled: () => boolean = () => false
): Promise<{ favorite: boolean; inCollection: boolean } | null> {
  try {
    const [fav, status, db] = await Promise.all([
      LocalDB.isFavorite(id),
      trackingService.getStatus(id),
      LocalDB.getDatabase(),
    ]);
    if (isCancelled()) return null;
    const customRow = await db.getFirstAsync(
      'SELECT 1 FROM collection_folder_items WHERE anime_id = ? LIMIT 1',
      id
    );
    return {
      favorite: fav,
      inCollection: fav || status != null || customRow != null,
    };
  } catch {
    return null;
  }
}

// AniList exposes averageScore as 0-100; rank mirrors it. Native shows it as
// a 0-10 decimal with two-digit precision, so we divide here. Returns 'N/A'
// when neither field carries a usable number.
function formatScore(score: number | undefined, rank: number | undefined): string {
  const raw = score ?? rank;
  if (raw == null || raw <= 0) return 'N/A';
  return (raw / 10).toFixed(1);
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <View className="mb-4 w-1/2 pr-2">
      <Text className="mb-1 text-xs font-medium text-zinc-500">{label}</Text>
      <Text className="text-sm font-semibold text-white">{value}</Text>
    </View>
  );
}

// MARK: - Watch options

function WatchOptionsSection({
  items,
  onOpen,
  onConfigure,
}: {
  items: WatchOption[];
  onOpen: (option: WatchOption) => void;
  onConfigure: () => void;
}) {
  // Mirror the Staff section's horizontal avatar+caption layout. Each
  // platform is a round brand-tinted disc (icon only) with the name
  // underneath — no rectangular chip backgrounds competing with Synopsis/
  // Tags/Information panels.
  return (
    <View className="mt-8">
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-lg font-bold text-white">Watch on</Text>
        <Pressable
          onPress={onConfigure}
          accessibilityLabel="Configure watch platforms"
          hitSlop={8}>
          <Text className="text-xs font-semibold text-blue-400">Configure ›</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 6, paddingBottom: 2 }}>
        <View className="flex-row gap-4 pr-5">
          {items.map((opt, idx) => (
            <Pressable
              key={`${opt.platformId ?? 'unknown'}:${opt.url}:${idx}`}
              onPress={() => onOpen(opt)}
              accessibilityLabel={`${opt.source === 'official' ? 'Open' : 'Search'} ${opt.displayName}`}
              style={{
                width: 72,
                opacity: opt.isEnabled || opt.source === 'official' ? 1 : 0.7,
                alignItems: 'center',
              }}>
              <View
                style={{
                  position: 'relative',
                  width: 56,
                  height: 56,
                  overflow: 'visible',
                }}>
                <PlatformLogo
                  size={56}
                  logoDomain={opt.logoDomain}
                  iconUrl={opt.iconUrl}
                  monogram={opt.monogram}
                  brandColor={opt.color}
                  containerStyle={
                    opt.isPrimary
                      ? { borderWidth: 2, borderColor: opt.color }
                      : undefined
                  }
                />
                {opt.isPrimary ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: '#000',
                      borderWidth: 1.5,
                      borderColor: opt.color,
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'visible',
                      shadowColor: '#000',
                      shadowOpacity: 0.4,
                      shadowRadius: 3,
                      shadowOffset: { width: 0, height: 1 },
                      elevation: 2,
                    }}>
                    <Ionicons name="star" size={11} color="#FFD60A" />
                  </View>
                ) : null}
              </View>
              <Text
                numberOfLines={2}
                className="mt-2 text-center text-xs font-medium text-white">
                {opt.displayName}
              </Text>
              {opt.source === 'search' ? (
                <Text
                  numberOfLines={1}
                  className="text-center text-zinc-500"
                  style={{ fontSize: 10 }}>
                  search
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// MARK: - Relations (grouped tree)

function RelationsSection({ items }: { items: AnimeRelation[] }) {
  const router = useRouter();
  // Preserve first-seen order of relation types (sequel before prequel etc.)
  const order: string[] = [];
  const groups: Record<string, AnimeRelation[]> = {};
  for (const r of items) {
    if (!groups[r.type]) {
      groups[r.type] = [];
      order.push(r.type);
    }
    groups[r.type].push(r);
  }

  const open = (entry: AnimeRelation) => {
    if (!entry.id) return;
    Haptics.selectionAsync();
    pushAnimeDetail(router, { id: entry.id, title: entry.title, image: entry.imageUrl });
  };

  return (
    <View className="mt-8">
      <Text className="mb-3 text-lg font-bold text-white">Related Entries</Text>
      <View className="gap-4">
        {order.map((type) => (
          <View key={type} className="flex-row gap-3">
            <View className="items-center pt-1.5">
              <View className="h-2 w-2 rounded-full bg-blue-500" />
              <View className="mt-1 w-0.5 bg-blue-500/30" style={{ flex: 1, minHeight: 24 }} />
            </View>
            <View className="flex-1 gap-2">
              <Text className="text-sm font-semibold text-zinc-400">{type}</Text>
              {groups[type].map((entry, idx) => (
                <Pressable
                  key={`${entry.id || entry.title}-${idx}`}
                  onPress={() => open(entry)}
                  disabled={!entry.id}
                  accessibilityRole={entry.id ? 'link' : undefined}
                  accessibilityLabel={`Open ${entry.title}`}
                  className="flex-row items-center justify-between rounded-xl bg-zinc-800/60 p-3">
                  <View className="flex-1 pr-2">
                    <Text className="text-sm text-white" numberOfLines={2}>
                      {entry.title}
                    </Text>
                    {entry.format ? (
                      <Text className="mt-1 text-xs text-zinc-500">{entry.format}</Text>
                    ) : null}
                  </View>
                  {entry.id ? <Ionicons name="chevron-forward" size={16} color="#71717a" /> : null}
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// MARK: - Themes (OP/ED)

type MusicService = 'Spotify' | 'Apple Music' | 'YouTube Music';

function ThemesSection({ themes }: { themes: AnimeTheme }) {
  return (
    <View className="mt-8 gap-5">
      {themes.openings.length > 0 ? (
        <ThemeGroup title="Opening Themes" songs={themes.openings} />
      ) : null}
      {themes.endings.length > 0 ? (
        <ThemeGroup title="Ending Themes" songs={themes.endings} />
      ) : null}
    </View>
  );
}

function ThemeGroup({ title, songs }: { title: string; songs: string[] }) {
  return (
    <View>
      <Text className="mb-3 text-lg font-bold text-white">{title}</Text>
      <View className="gap-2">
        {songs.map((song, i) => (
          <View key={`${title}-${i}`} className="rounded-xl bg-zinc-900/60 p-3.5">
            <Text className="mb-2.5 text-sm text-white" numberOfLines={2}>
              {song}
            </Text>
            <View className="flex-row gap-5">
              <MusicLinkButton song={song} service="Spotify" icon="musical-notes" color="#1db954" />
              <MusicLinkButton
                song={song}
                service="Apple Music"
                icon="logo-apple"
                color="#fb6f6f"
              />
              <MusicLinkButton
                song={song}
                service="YouTube Music"
                icon="logo-youtube"
                color="#ff0033"
              />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function MusicLinkButton({
  song,
  service,
  icon,
  color,
}: {
  song: string;
  service: MusicService;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}) {
  const onPress = () => {
    const q = encodeURIComponent(song);
    let url = '';
    if (service === 'Spotify') url = `https://open.spotify.com/search/${q}`;
    else if (service === 'Apple Music') url = `https://music.apple.com/us/search?term=${q}`;
    else if (service === 'YouTube Music') url = `https://music.youtube.com/search?q=${q}`;
    if (url) Linking.openURL(url).catch(() => undefined);
  };
  return (
    <Pressable onPress={onPress} accessibilityLabel={`Search on ${service}`}>
      <Ionicons name={icon} size={20} color={color} />
    </Pressable>
  );
}

// MARK: - Staff

function StaffSection({ items }: { items: AnimeStaff[] }) {
  // Cap at 24 to keep horizontal scroll snappy; iOS shows the full list but
  // RN's Image is heavier, so trim defensively.
  const visible = items.slice(0, 24);
  return (
    <View className="mt-8">
      <Text className="mb-3 text-lg font-bold text-white">Staff</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-4 pr-5">
          {visible.map((p, i) => (
            <View key={`${p.id || p.name}-${i}`} style={{ width: 96 }}>
              {p.imageUrl ? (
                <Image
                  source={{ uri: p.imageUrl }}
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 40,
                    alignSelf: 'center',
                  }}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <View
                  className="self-center bg-zinc-700"
                  style={{ width: 80, height: 80, borderRadius: 40 }}
                />
              )}
              <Text className="mt-2 text-center text-xs font-medium text-white" numberOfLines={1}>
                {p.name}
              </Text>
              {p.role ? (
                <Text
                  className="text-center text-zinc-500"
                  style={{ fontSize: 10 }}
                  numberOfLines={1}>
                  {p.role}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// MARK: - Platform Ratings

const PLATFORM_META: Partial<
  Record<PlatformType, { name: string; icon: keyof typeof Ionicons.glyphMap; color: string }>
> = {
  myanimelist: { name: 'MyAnimeList', icon: 'tv-outline', color: '#2e51a2' },
  anilist: { name: 'AniList', icon: 'analytics-outline', color: '#a855f7' },
  bangumi: { name: 'Bangumi', icon: 'flame-outline', color: '#f97316' },
  shikimori: { name: 'Shikimori', icon: 'star-outline', color: '#ec4899' },
  kitsu: { name: 'Kitsu', icon: 'paw-outline', color: '#22c55e' },
};

const STATUS_ROWS: { key: string; label: string; color: string }[] = [
  { key: 'watching', label: 'Watching', color: '#34d399' },
  { key: 'completed', label: 'Completed', color: '#60a5fa' },
  { key: 'onHold', label: 'On Hold', color: '#fbbf24' },
  { key: 'dropped', label: 'Dropped', color: '#f87171' },
  { key: 'planToWatch', label: 'Plan to Watch', color: '#9ca3af' },
];

function PlatformRatingsSection({ items }: { items: RatingEntry[] }) {
  return (
    <View className="mt-8 gap-3">
      <Text className="text-lg font-bold text-white">Platform Ratings</Text>
      {items.map((entry) => (
        <PlatformRatingCard key={entry.platform} platform={entry.platform} data={entry.data} />
      ))}
    </View>
  );
}

function PlatformRatingCard({
  platform,
  data,
}: {
  platform: PlatformType;
  data: PlatformRatingData;
}) {
  const dist = data.ratingDistribution || {};
  const scoreBuckets: { score: number; votes: number }[] = [];
  const statusBuckets: Record<string, number> = {};
  let scoreTotal = 0;
  for (const [k, v] of Object.entries(dist)) {
    if (k.startsWith('status:')) {
      statusBuckets[k.slice('status:'.length)] = v;
    } else {
      const n = Number.parseInt(k, 10);
      if (Number.isFinite(n)) {
        scoreBuckets.push({ score: n, votes: v });
        scoreTotal += v;
      }
    }
  }
  scoreBuckets.sort((a, b) => b.score - a.score);
  const statusTotal = statusBuckets.total ?? 0;
  const totalUsers = data.scoredBy ?? statusTotal ?? scoreTotal;

  const meta = PLATFORM_META[platform] ?? {
    name: platform,
    icon: 'list-outline' as keyof typeof Ionicons.glyphMap,
    color: '#3b82f6',
  };

  const hasScores = scoreBuckets.length > 0 && scoreTotal > 0;
  const hasStatus = statusTotal > 0;

  return (
    <View className="gap-3 rounded-2xl bg-zinc-900/60 p-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Ionicons name={meta.icon} size={18} color={meta.color} />
          <Text className="text-base font-semibold text-white">{meta.name}</Text>
        </View>
        {totalUsers > 0 ? (
          <Text className="text-xs text-zinc-500">{totalUsers.toLocaleString()} users</Text>
        ) : null}
      </View>

      {data.averageScore != null ? (
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="star" size={14} color="#fbbf24" />
          <Text className="text-sm font-medium text-yellow-400">
            {data.averageScore.toFixed(2)}
          </Text>
        </View>
      ) : null}

      {hasScores ? (
        <View className="gap-1">
          <Text className="mb-1 text-xs font-medium text-zinc-400">Score Distribution</Text>
          {scoreBuckets.map((b) => {
            const pct = (b.votes / scoreTotal) * 100;
            return (
              <View key={b.score} className="flex-row items-center gap-2">
                <Text className="text-xs text-zinc-400" style={{ width: 18, textAlign: 'right' }}>
                  {b.score}
                </Text>
                <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                  <View
                    style={{
                      width: `${pct}%`,
                      backgroundColor: meta.color,
                      height: '100%',
                    }}
                  />
                </View>
                <Text className="text-zinc-500" style={{ width: 40, fontSize: 10 }}>
                  {pct.toFixed(1)}%
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {hasStatus ? (
        <View className="gap-1.5">
          <Text className="mb-1 text-xs font-medium text-zinc-400">Status Distribution</Text>
          {STATUS_ROWS.map((row) => {
            const count = statusBuckets[row.key] ?? 0;
            if (count === 0) return null;
            const pct = (count / statusTotal) * 100;
            return (
              <View key={row.key}>
                <View className="mb-1 flex-row items-center justify-between">
                  <Text className="text-xs text-zinc-400">{row.label}</Text>
                  <Text className="text-xs text-zinc-500">{count.toLocaleString()}</Text>
                </View>
                <View className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <View
                    style={{
                      width: `${pct}%`,
                      backgroundColor: row.color,
                      height: '100%',
                    }}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
