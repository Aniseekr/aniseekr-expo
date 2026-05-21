import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Anime } from '../components/rate/types';
import { AnimeRepository } from '../libs/repositories/anime-repository';
import { pushAnimeDetail } from '../libs/utils/navigate-to-anime';
import { ShimmerEffect } from '../components/common/ShimmerEffect';
import { EmptyStateView } from '../components/common/EmptyStateView';
import { ErrorStateView } from '../components/common/ErrorStateView';
import { Colors, IconSize, Radius, Spacing, Typography } from '../constants/DesignSystem';
import { hapticsBridge } from '../modules/haptics/hapticsBridge';
import { trackingService } from '../libs/services/tracking/tracking-service';
import { isStringArray, safeJsonParse } from '../libs/utils/safe-json';
import { pilgrimageRepository } from '../libs/services/pilgrimage/pilgrimage-repository';
import { lookupBangumiByPlatformId } from '../libs/services/pilgrimage/anitabi-cross-index';
import {
  pilgrimageSearchService,
  type PilgrimageSearchResult,
} from '../libs/services/pilgrimage/pilgrimage-search-service';
import {
  formatPilgrimageSubtitle,
  getPilgrimageAnimeTitles,
} from '../libs/services/pilgrimage/pilgrimage-localization';
import { buildPilgrimageDetailRoute } from '../libs/services/pilgrimage/pilgrimage-navigation';
import { getStringParam } from '../libs/utils/route-params';
import { sameArrayBy } from '../libs/utils/state-array';

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
let AsyncStorage: AsyncStorageLike;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  const memory = new Map<string, string>();
  AsyncStorage = {
    async getItem(k) {
      return memory.get(k) ?? null;
    },
    async setItem(k, v) {
      memory.set(k, v);
    },
  };
}

const RECENT_KEY = '@aniseekr/search/recent';
const MAX_RECENT = 8;
const DEBOUNCE_MS = 320;

type SortKey = 'relevance' | 'score' | 'year';
type FilterKey = 'all' | 'tv' | 'movie' | 'recent';

type SearchAnime = Anime & {
  bangumiId?: number;
  hasPilgrimage?: boolean;
  pilgrimageSource?: PilgrimageSearchResult['source'];
  secondaryTitle?: string;
};

const FILTERS: readonly { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'tv', label: 'TV' },
  { key: 'movie', label: 'Movie' },
  { key: 'recent', label: 'Recent' },
];

const SORTS: readonly { key: SortKey; label: string }[] = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'score', label: 'Score' },
  { key: 'year', label: 'Newest' },
];

function sameSearchResults(current: SearchAnime[], next: SearchAnime[]): boolean {
  return sameArrayBy(current, next, (anime) => [
    anime.id,
    anime.title,
    anime.titleEnglish,
    anime.secondaryTitle,
    anime.image,
    anime.bannerImage,
    anime.rank,
    anime.score,
    anime.startDate?.year,
    anime.startDate?.month,
    anime.startDate?.day,
    anime.type,
    anime.format,
    anime.status,
    anime.episodes,
    anime.durationMinutes,
    anime.nextAiringEpisode?.airingAt,
    anime.nextAiringEpisode?.episode,
    anime.bangumiId,
    anime.hasPilgrimage,
    anime.pilgrimageSource,
  ]);
}

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // `context=pilgrimage` is set by the pilgrimage hub so we route picks to
  // /pilgrimage/[bangumiId] instead of /anime/[id]. Any other value falls
  // through to the default global-search behaviour.
  const params = useLocalSearchParams<{ context?: string; q?: string }>();
  const isPilgrimageMode = params.context === 'pilgrimage';
  const initialQuery = getStringParam(params, 'q') ?? '';
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchAnime[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('relevance');
  const [sortOpen, setSortOpen] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [trackedIds, setTrackedIds] = useState<Set<string>>(() => new Set());
  const [bookmarkPendingId, setBookmarkPendingId] = useState<string | null>(null);
  const [bookmarkToast, setBookmarkToast] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeQueryRef = useRef(initialQuery);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequestRef = useRef(0);
  const resolveRequestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    trackingService
      .getTrackedIdSet()
      .then((ids) => {
        if (!cancelled) setTrackedIds(ids);
      })
      .catch(() => undefined);
    const unsubscribe = trackingService.onTrackedIdsChange((ids) => {
      setTrackedIds(new Set(ids));
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );

  const showBookmarkToast = useCallback((message: string) => {
    setBookmarkToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setBookmarkToast(null), 2000);
  }, []);

  useEffect(() => {
    const next = getStringParam(params, 'q') ?? '';
    if (next === routeQueryRef.current) return;
    routeQueryRef.current = next;
    setQuery(next);
  }, [params]);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((v) => {
        const parsed = safeJsonParse(v, isStringArray);
        if (parsed) setRecent(parsed.slice(0, MAX_RECENT));
      })
      .catch(() => {});
  }, []);

  const persistRecent = useCallback(async (next: string[]) => {
    try {
      await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const runSearch = useCallback(
    async (q: string) => {
      const requestId = ++searchRequestRef.current;
      const trimmed = q.trim();
      if (!trimmed) {
        setResults((prev) => (prev.length === 0 ? prev : []));
        setError((prev) => (prev === null ? prev : null));
        setLoading((prev) => (prev ? false : prev));
        return;
      }
      setLoading(true);
      setError(null);
      setResolveError(null);
      try {
        let nextResults: SearchAnime[];
        if (isPilgrimageMode) {
          const data = await pilgrimageSearchService.search(trimmed, { limit: 30 });
          nextResults = data.map(mapPilgrimageResultToAnime);
        } else {
          const data = await AnimeRepository.searchAnime(trimmed, 1);
          nextResults = (data ?? []) as SearchAnime[];
        }
        if (requestId !== searchRequestRef.current) return;
        setResults((prev) => (sameSearchResults(prev, nextResults) ? prev : nextResults));
      } catch (e) {
        if (requestId !== searchRequestRef.current) return;
        setError(e instanceof Error ? e.message : 'Search failed');
        setResults((prev) => (prev.length === 0 ? prev : []));
      } finally {
        if (requestId === searchRequestRef.current) {
          setLoading(false);
        }
      }
    },
    [isPilgrimageMode]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSearch(query);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const handleSelect = useCallback(
    async (anime: SearchAnime) => {
      const resolveRequestId = ++resolveRequestRef.current;
      hapticsBridge.tap();
      const next = [anime.title, ...recent.filter((r) => r !== anime.title)].slice(0, MAX_RECENT);
      setRecent(next);
      persistRecent(next);
      Keyboard.dismiss();

      if (isPilgrimageMode) {
        if (typeof anime.bangumiId === 'number') {
          router.push(
            buildPilgrimageDetailRoute(anime.bangumiId, {
              returnTo: 'search',
              returnQuery: query,
            })
          );
          return;
        }

        // Translate the browse-source id (usually AniList) → Bangumi subject
        // id before routing to the pilgrimage detail. If we can't resolve a
        // bangumi id at all there is no pilgrimage page to land on, so warn
        // the user inline instead of opening a dead screen.
        setResolveError(null);
        setResolvingId(anime.id);
        try {
          const bangumiId = await pilgrimageRepository.resolveBangumiId({
            sourcePlatform: 'anilist',
            id: anime.id,
          });
          if (resolveRequestId !== resolveRequestRef.current) return;
          if (bangumiId === null) {
            hapticsBridge.warning();
            setResolveError(`No pilgrimage mapping for "${anime.title}".`);
            return;
          }
          router.push(
            buildPilgrimageDetailRoute(bangumiId, {
              returnTo: 'search',
              returnQuery: query,
            })
          );
        } catch (e) {
          if (resolveRequestId !== resolveRequestRef.current) return;
          hapticsBridge.warning();
          setResolveError(e instanceof Error ? e.message : 'Could not resolve this title.');
        } finally {
          if (resolveRequestId === resolveRequestRef.current) {
            setResolvingId(null);
          }
        }
        return;
      }

      pushAnimeDetail(router, anime);
    },
    [recent, persistRecent, router, isPilgrimageMode, query]
  );

  const handleBookmarkToggle = useCallback(
    async (anime: SearchAnime) => {
      if (bookmarkPendingId === anime.id) return;
      const wasTracked = trackedIds.has(anime.id);
      hapticsBridge.selection();
      setBookmarkPendingId(anime.id);
      // Optimistic update so the icon flips instantly. trackingService emits
      // through onTrackedIdsChange after the DB write completes, which will
      // overwrite this set with the authoritative value — same result, but
      // the user sees the change immediately.
      setTrackedIds((prev) => {
        const next = new Set(prev);
        if (wasTracked) next.delete(anime.id);
        else next.add(anime.id);
        return next;
      });
      try {
        if (wasTracked) {
          await trackingService.removeTracking(anime.id);
          showBookmarkToast(`Removed "${anime.title}" from your list`);
        } else {
          await trackingService.upsertTracking({
            animeId: anime.id,
            status: 'planned',
            title: anime.title,
            imageUrl: anime.image,
          });
          showBookmarkToast(
            isPilgrimageMode
              ? `Added "${anime.title}" to your pilgrimages`
              : `Added "${anime.title}" to your list`
          );
        }
      } catch (err) {
        console.warn('[search] bookmark toggle failed', err);
        hapticsBridge.warning();
        // Roll back the optimistic flip.
        setTrackedIds((prev) => {
          const next = new Set(prev);
          if (wasTracked) next.add(anime.id);
          else next.delete(anime.id);
          return next;
        });
        showBookmarkToast(wasTracked ? "Couldn't remove" : "Couldn't add to your list");
      } finally {
        setBookmarkPendingId(null);
      }
    },
    [bookmarkPendingId, trackedIds, isPilgrimageMode, showBookmarkToast]
  );

  const handleRecentTap = useCallback((term: string) => {
    hapticsBridge.selection();
    setQuery(term);
  }, []);

  const handleSubmitSearch = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    runSearch(query);
  }, [query, runSearch]);

  const handleClearRecent = useCallback(async () => {
    hapticsBridge.warning();
    setRecent([]);
    await persistRecent([]);
  }, [persistRecent]);

  const handleClose = () => {
    hapticsBridge.tap();
    if (isPilgrimageMode && !router.canGoBack()) {
      router.replace('/pilgrimage');
      return;
    }
    router.back();
  };

  const handleFilterTap = useCallback((key: FilterKey) => {
    hapticsBridge.selection();
    setFilter(key);
  }, []);

  const handleSortTap = useCallback(() => {
    hapticsBridge.selection();
    setSortOpen((v) => !v);
  }, []);

  const handleSortPick = useCallback((key: SortKey) => {
    hapticsBridge.selection();
    setSort(key);
    setSortOpen(false);
  }, []);

  // Apply client-side filter + sort to keep things responsive without adding
  // backend params. Filters narrow on type; sort reorders only.
  const filteredResults = useMemo(() => {
    let list = results;
    if (filter === 'tv') {
      list = list.filter((a) => (a.type ?? a.format ?? '').toUpperCase().includes('TV'));
    } else if (filter === 'movie') {
      list = list.filter((a) => (a.type ?? a.format ?? '').toUpperCase().includes('MOVIE'));
    } else if (filter === 'recent') {
      const currentYear = new Date().getFullYear();
      list = list.filter((a) => (a.startDate?.year ?? 0) >= currentYear - 1);
    }
    if (sort === 'score') {
      list = [...list].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    } else if (sort === 'year') {
      list = [...list].sort((a, b) => (b.startDate?.year ?? 0) - (a.startDate?.year ?? 0));
    }
    return list;
  }, [filter, results, sort]);

  const sortLabel = SORTS.find((s) => s.key === sort)?.label ?? 'Relevance';

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={Colors.gradients.background as [string, string, ...string[]]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View
          style={[styles.searchHeader, { paddingTop: insets.top > 0 ? Spacing.xs : Spacing.sm }]}>
          <Pressable
            onPress={handleClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.78 }]}>
            <Ionicons name="chevron-back" size={20} color={Colors.text.primary} />
          </Pressable>

          <View style={styles.searchBar}>
            <Ionicons
              name={isPilgrimageMode ? 'location' : 'search'}
              size={16}
              color={isPilgrimageMode ? Colors.primary : Colors.text.secondary}
            />
            <TextInput
              autoFocus
              placeholder={
                isPilgrimageMode
                  ? 'Search anime for pilgrimage…'
                  : 'Search anime, characters, studios…'
              }
              placeholderTextColor={Colors.text.tertiary}
              value={query}
              onChangeText={setQuery}
              style={styles.input}
              returnKeyType="search"
              onSubmitEditing={handleSubmitSearch}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query.length > 0 ? (
              <Pressable
                onPress={() => setQuery('')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear">
                <View style={styles.clearBtn}>
                  <Ionicons name="close" size={12} color={Colors.text.primary} />
                </View>
              </Pressable>
            ) : null}
          </View>
        </View>

        {isPilgrimageMode && resolveError ? (
          <View style={styles.resolveBanner}>
            <Ionicons name="information-circle" size={14} color={Colors.text.primary} />
            <Text style={styles.resolveBannerText} numberOfLines={2}>
              {resolveError}
            </Text>
            <Pressable
              onPress={() => setResolveError(null)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Dismiss">
              <Ionicons name="close" size={14} color={Colors.text.secondary} />
            </Pressable>
          </View>
        ) : null}

        {query.length > 0 ? (
          <View style={styles.filterChipsWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChipsRow}>
              {FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => handleFilterTap(f.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.filterChip,
                      active ? styles.filterChipActive : styles.filterChipInactive,
                      pressed && { opacity: 0.85 },
                    ]}>
                    <Text
                      style={[
                        styles.filterChipText,
                        { color: active ? '#000' : Colors.text.primary },
                      ]}>
                      {f.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {error ? (
          <ErrorStateView title="Search failed" message={error} onRetry={() => runSearch(query)} />
        ) : query.length === 0 ? (
          <ScrollView
            contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
            keyboardShouldPersistTaps="handled">
            {recent.length > 0 ? (
              <View style={styles.recentSection}>
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionTitle}>Recent</Text>
                  <Pressable onPress={handleClearRecent} hitSlop={8}>
                    <Text style={styles.clearText}>Clear</Text>
                  </Pressable>
                </View>
                <View style={styles.recentRow}>
                  {recent.map((term) => (
                    <Pressable
                      key={term}
                      onPress={() => handleRecentTap(term)}
                      style={({ pressed }) => [styles.recentChip, pressed && { opacity: 0.8 }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Search ${term}`}>
                      <MaterialIcons name="history" size={14} color={Colors.text.secondary} />
                      <Text style={styles.recentText} numberOfLines={1}>
                        {term}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              <EmptyStateView
                icon="search"
                title="Discover anime"
                description="Search across all your connected platforms — AniList, MAL, Bangumi, Kitsu and more."
              />
            )}
          </ScrollView>
        ) : loading && results.length === 0 ? (
          <ScrollView
            contentContainerStyle={{
              padding: Spacing.md,
              paddingBottom: insets.bottom + 100,
            }}
            keyboardShouldPersistTaps="handled">
            <View style={styles.sortRow}>
              <ShimmerEffect width={80} height={12} />
              <ShimmerEffect width={90} height={12} />
            </View>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={styles.skeletonRow}>
                <ShimmerEffect width={64} height={88} borderRadius={10} />
                <View style={{ flex: 1, gap: 8 }}>
                  <ShimmerEffect width="80%" height={16} />
                  <ShimmerEffect width="50%" height={12} />
                  <ShimmerEffect width="35%" height={12} />
                </View>
              </View>
            ))}
          </ScrollView>
        ) : filteredResults.length === 0 ? (
          <EmptyStateView
            icon="search-off"
            title="No matches"
            description={`Nothing for "${query}" with the current filters. Try a different keyword or change the filter.`}
          />
        ) : (
          <FlatList
            data={filteredResults}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              padding: Spacing.md,
              paddingTop: 0,
              paddingBottom: insets.bottom + 100,
              gap: 10,
            }}
            ListHeaderComponent={
              <View style={styles.sortRow}>
                <Text style={styles.resultCount}>
                  {filteredResults.length} {filteredResults.length === 1 ? 'result' : 'results'}
                </Text>
                <Pressable
                  onPress={handleSortTap}
                  style={({ pressed }) => [styles.sortBtn, pressed && { opacity: 0.8 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Sort by">
                  <Ionicons name="swap-vertical" size={12} color={Colors.text.secondary} />
                  <Text style={styles.sortBtnText}>{sortLabel}</Text>
                  <Ionicons
                    name={sortOpen ? 'chevron-up' : 'chevron-down'}
                    size={12}
                    color={Colors.text.secondary}
                  />
                </Pressable>
                {sortOpen ? (
                  <View style={styles.sortMenu}>
                    {SORTS.map((s) => (
                      <Pressable
                        key={s.key}
                        onPress={() => handleSortPick(s.key)}
                        style={({ pressed }) => [
                          styles.sortMenuItem,
                          sort === s.key && styles.sortMenuItemActive,
                          pressed && { opacity: 0.8 },
                        ]}>
                        <Text
                          style={[
                            styles.sortMenuItemText,
                            sort === s.key && { color: Colors.primary },
                          ]}>
                          {s.label}
                        </Text>
                        {sort === s.key ? (
                          <Ionicons name="checkmark" size={14} color={Colors.primary} />
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            }
            renderItem={({ item }) => (
              <ResultCard
                anime={item}
                pending={resolvingId === item.id}
                hasPilgrimage={
                  item.hasPilgrimage === true ||
                  lookupBangumiByPlatformId('anilist', item.id) !== null
                }
                isBookmarked={trackedIds.has(item.id)}
                bookmarkPending={bookmarkPendingId === item.id}
                onPress={() => handleSelect(item)}
                onBookmarkPress={() => handleBookmarkToggle(item)}
              />
            )}
            ListFooterComponent={
              loading ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator color={Colors.primary} />
                </View>
              ) : null
            }
          />
        )}
      </SafeAreaView>
      {bookmarkToast ? (
        <View style={[styles.toast, { bottom: insets.bottom + Spacing.lg }]}>
          <Ionicons name="bookmark" size={16} color={Colors.primary} />
          <Text style={styles.toastText} numberOfLines={2}>
            {bookmarkToast}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

interface ResultCardProps {
  anime: SearchAnime;
  pending?: boolean;
  /**
   * Whether the L2 Anitabi cross-index resolved a pilgrimage entry for this
   * anime. Renders a 📍 marker on the title row so users can see at a glance
   * which results have real pilgrimage data — no fake markers; falsy = no
   * marker, never a placeholder.
   */
  hasPilgrimage?: boolean;
  /** Whether the user has already saved this anime to their tracked list. */
  isBookmarked?: boolean;
  /** True while the bookmark toggle's async write is in flight. */
  bookmarkPending?: boolean;
  onPress: () => void;
  /** Tap on the bookmark icon. Independent from the row press. */
  onBookmarkPress?: () => void;
}

function mapPilgrimageResultToAnime(result: PilgrimageSearchResult): SearchAnime {
  const titles = getPilgrimageAnimeTitles({
    id: result.bangumiId,
    title: result.title,
    titleCn: result.titleCn,
    titleEnglish: result.titleEnglish,
    titleRomaji: result.titleRomaji,
  });
  const tags = [
    result.city,
    result.pointsLength > 0
      ? `${result.pointsLength} ${result.pointsLength === 1 ? 'spot' : 'spots'}`
      : null,
  ].filter((tag): tag is string => typeof tag === 'string' && tag.length > 0);

  return {
    id: String(result.bangumiId),
    bangumiId: result.bangumiId,
    hasPilgrimage: true,
    pilgrimageSource: result.source,
    title: titles.primary,
    secondaryTitle: formatPilgrimageSubtitle(titles),
    titleEnglish: titles.english,
    image: result.cover,
    rank: 0,
    type: 'Pilgrimage',
    format: 'Pilgrimage',
    tags,
    mood: '',
    durationMinutes: 0,
  };
}

function ResultCard({
  anime,
  pending,
  hasPilgrimage,
  isBookmarked,
  bookmarkPending,
  onPress,
  onBookmarkPress,
}: ResultCardProps) {
  const score = typeof anime.score === 'number' ? formatScore(anime.score) : null;
  const tags = anime.tags?.slice(0, 3) ?? [];
  return (
    <Pressable
      onPress={onPress}
      disabled={pending}
      accessibilityRole="button"
      accessibilityLabel={hasPilgrimage ? `${anime.title}, pilgrimage available` : anime.title}
      style={({ pressed }) => [
        styles.resultCard,
        pressed && { opacity: 0.85 },
        pending && { opacity: 0.6 },
      ]}>
      <Image
        source={{ uri: anime.image }}
        style={styles.thumb}
        contentFit="cover"
        transition={150}
      />
      <View style={styles.resultBody}>
        <View style={styles.resultTitleRow}>
          <Text style={styles.resultTitle} numberOfLines={2}>
            {anime.title}
          </Text>
          {hasPilgrimage ? (
            <Ionicons
              name="location-sharp"
              size={IconSize.sm}
              color={Colors.primary}
              style={styles.pilgrimagePin}
              accessibilityLabel="Has pilgrimage spots"
            />
          ) : null}
        </View>
        {anime.secondaryTitle ? (
          <Text style={styles.resultSubtitle} numberOfLines={1}>
            {anime.secondaryTitle}
          </Text>
        ) : null}
        <View style={styles.resultMetaRow}>
          {anime.format || anime.type ? (
            <View style={styles.typeChip}>
              <Text style={styles.typeChipText}>{anime.format ?? anime.type}</Text>
            </View>
          ) : null}
          {anime.startDate?.year ? (
            <Text style={styles.resultMeta}>{anime.startDate.year}</Text>
          ) : null}
          {anime.status ? <Text style={styles.resultMetaSubtle}>· {anime.status}</Text> : null}
          {score ? (
            <View style={styles.resultScore}>
              <Ionicons name="star" size={11} color={Colors.primary} />
              <Text style={styles.resultScoreText}>{score}</Text>
            </View>
          ) : null}
        </View>
        {tags.length > 0 ? (
          <Text style={styles.resultTags} numberOfLines={1}>
            {tags.join(' · ')}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={(e) => {
          e.stopPropagation?.();
          onBookmarkPress?.();
        }}
        hitSlop={6}
        disabled={bookmarkPending}
        accessibilityRole="button"
        accessibilityLabel={isBookmarked ? 'Remove from your list' : 'Save to your list'}
        accessibilityState={{ selected: !!isBookmarked, busy: !!bookmarkPending }}
        style={({ pressed }) => [
          styles.bookmarkBtn,
          isBookmarked && styles.bookmarkBtnActive,
          pressed && { opacity: 0.78 },
          bookmarkPending && { opacity: 0.6 },
        ]}>
        <Ionicons
          name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
          size={16}
          color={isBookmarked ? Colors.primary : Colors.text.secondary}
        />
      </Pressable>
    </Pressable>
  );
}

function formatScore(score: number): string {
  if (score > 10) return (score / 10).toFixed(1);
  return score.toFixed(1);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background.primary },
  safe: { flex: 1 },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(40, 40, 44, 0.78)',
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(20, 20, 22, 0.85)',
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  input: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 0,
  },
  clearBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  resolveBanner: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,159,10,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,159,10,0.45)',
  },
  resolveBannerText: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipsWrap: {
    paddingBottom: Spacing.sm,
  },
  filterChipsRow: {
    paddingHorizontal: Spacing.md,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 17,
    borderWidth: 1,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: Colors.text.primary,
    borderColor: Colors.text.primary,
  },
  filterChipInactive: {
    backgroundColor: 'rgba(20, 20, 22, 0.78)',
    borderColor: Colors.glass.border,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sortRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    position: 'relative',
  },
  resultCount: {
    color: Colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(20,20,22,0.78)',
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  sortBtnText: {
    color: Colors.text.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  sortMenu: {
    position: 'absolute',
    top: 38,
    right: 0,
    minWidth: 140,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(20,20,22,0.96)',
    borderWidth: 1,
    borderColor: Colors.glass.border,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 12,
  },
  sortMenuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  sortMenuItemActive: {
    backgroundColor: 'rgba(255, 159, 10, 0.08)',
  },
  sortMenuItemText: {
    color: Colors.text.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  recentSection: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    color: Colors.text.primary,
    ...Typography.titleLarge,
  },
  clearText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  recentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(20, 20, 22, 0.78)',
    borderWidth: 1,
    borderColor: Colors.glass.border,
    maxWidth: 220,
  },
  recentText: {
    color: Colors.text.primary,
    fontSize: 13,
    fontWeight: '500',
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    alignItems: 'center',
  },
  resultCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 10,
    borderRadius: Radius.chipLg,
    backgroundColor: 'rgba(20, 20, 22, 0.85)',
    borderWidth: 1,
    borderColor: Colors.glass.border,
    alignItems: 'center',
  },
  thumb: {
    width: 64,
    height: 88,
    borderRadius: 10,
    backgroundColor: Colors.background.tertiary,
  },
  resultBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  resultTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  resultTitle: {
    flex: 1,
    minWidth: 0,
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  resultSubtitle: {
    color: Colors.text.tertiary,
    fontSize: 12,
    fontWeight: '600',
  },
  pilgrimagePin: {
    padding: Spacing.xs,
    marginTop: -Spacing.xs,
    marginRight: -Spacing.xs,
  },
  resultMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  typeChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: Colors.glass.medium,
  },
  typeChipText: {
    color: Colors.text.secondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  resultMeta: {
    color: Colors.text.secondary,
    fontSize: 11,
    fontWeight: '600',
  },
  resultMetaSubtle: {
    color: Colors.text.tertiary,
    fontSize: 11,
    fontWeight: '500',
  },
  resultScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 'auto',
  },
  resultScoreText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  resultTags: {
    color: Colors.text.tertiary,
    fontSize: 11,
    fontWeight: '500',
  },
  bookmarkBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  bookmarkBtnActive: {
    backgroundColor: 'rgba(255,159,10,0.16)',
    borderColor: 'rgba(255,159,10,0.55)',
  },
  toast: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    bottom: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(20,20,22,0.96)',
    borderWidth: 1,
    borderColor: Colors.glass.border,
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  toastText: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  footerLoader: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
});
