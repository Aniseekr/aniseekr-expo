// Pilgrimage Album — two-view screen:
//   • Folders view (default): each anime becomes a folder with its captures.
//     Filter chips along the top group folders by Japanese region (北海道・東北 /
//     関東 / 東京 / 中部 / 近畿 / 中国・四国 / 九州・沖縄). Tapping a folder dives into
//     that anime's detail view without leaving the screen.
//   • Detail view: when entered with an `animeId` param (or via folder tap) we
//     render the existing two-column comparison cards for that anime's spots.
//
// Layout obeys the project rules: ThemedText / theme tokens only (no hex
// surfaces), 44pt touch targets, hapticsBridge on every interactive element,
// and no fake spot-specific data (placeholders fall back to generic copy).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { ThemedText, readableTextOn } from '../../../components/themed';
import { Shadow, Spacing } from '../../../constants/DesignSystem';
import {
  loadCapturesSync,
  type PilgrimageCapture,
} from '../../../libs/services/pilgrimage/captures';
import { pilgrimageRepository } from '../../../libs/services/pilgrimage/pilgrimage-repository';
import { collectionPilgrimageService } from '../../../libs/services/pilgrimage/collection-pilgrimage-service';
import { FEATURED_PILGRIMAGE_ANIME } from '../../../libs/services/pilgrimage/featured-anime';
import {
  buildPilgrimageAlbumEntries,
  type PilgrimageAlbumEntry,
} from '../../../libs/services/pilgrimage/album-captures';
import {
  get88EntriesByBangumiId,
  type AnimeTourism88Region,
} from '../../../libs/services/pilgrimage/anime88-repository';
import {
  getPilgrimageAnimeTitles,
  getPilgrimageSpotTitles,
} from '../../../libs/services/pilgrimage/pilgrimage-localization';
import { buildPilgrimageDetailRoute } from '../../../libs/services/pilgrimage/pilgrimage-navigation';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';
import { useT } from '../../../libs/i18n';
import {
  getCharacterGroups,
  subscribeCharacters,
} from '../../../libs/services/companion/character-library-store';
import type { CharacterGroup } from '../../../libs/services/companion/character-library';

type AlbumEntry = PilgrimageAlbumEntry;

interface FolderGroup {
  anime: AnitabiBangumi;
  entries: AlbumEntry[];
  /** Most recent capture timestamp; used for sort + "last visited" line. */
  lastCapturedAt: number;
  /** Average real frame-match score across captures with analysis. */
  avgMatch: number | null;
  /** Distinct spot ids visited (folder progress). */
  visitedSpots: number;
  /** Total spots known to the anime (from Anitabi.pointsLength). */
  totalSpots: number;
  /** Best cover image — explicit anime cover when available, else first capture. */
  cover: string | undefined;
  /** Region group used for tag filtering. `null` when not in the 88 list. */
  region: AnimeTourism88Region | null;
}

type RegionFilter = AnimeTourism88Region | 'all' | 'other';

// Localized region labels. Long names render at small font sizes — keep the
// kanji compact so they fit a single-line chip on 375pt-wide phones.
const REGION_LABELS: Record<AnimeTourism88Region, string> = {
  hokkaido_tohoku: '北海道・東北',
  kanto: '関東',
  tokyo: '東京',
  chubu: '中部',
  kinki: '近畿',
  chugoku_shikoku: '中国・四国',
  kyushu_okinawa: '九州・沖縄',
};

const REGION_ORDER: AnimeTourism88Region[] = [
  'hokkaido_tohoku',
  'kanto',
  'tokyo',
  'chubu',
  'kinki',
  'chugoku_shikoku',
  'kyushu_okinawa',
];

function formatRelative(timestamp: number, now: number, t: ReturnType<typeof useT>): string {
  const delta = Math.max(0, now - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < hour) return t('pilgrimage.album.justNow');
  if (delta < day) return t('pilgrimage.album.hoursAgo', { count: Math.floor(delta / hour) });
  if (delta < 7 * day) return t('pilgrimage.album.daysAgo', { count: Math.floor(delta / day) });
  if (delta < 30 * day)
    return t('pilgrimage.album.weeksAgo', { count: Math.floor(delta / (7 * day)) });
  return new Date(timestamp).toLocaleDateString();
}

export default function PilgrimageAlbumScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const accentFg = readableTextOn(theme.accent);
  const { animeId: animeIdParam } = useLocalSearchParams<{ animeId?: string }>();

  // `cameFromUrlRef` is true when the user landed here with an animeId in the
  // URL (e.g. from a per-anime detail page). It changes how the back button
  // behaves in detail view: deep-linked users go back out of the screen,
  // folder-tap users go back to the folder grid.
  const cameFromUrlRef = useRef<boolean>(!!animeIdParam);

  // Seed sync from MMKV so the album thumbnail grid renders the user's
  // captures on frame 1 instead of momentarily showing the empty state.
  const [captures, setCaptures] = useState<Record<string, PilgrimageCapture>>(loadCapturesSync);
  const [animes, setAnimes] = useState<AnitabiBangumi[]>([]);
  const [regionFilter, setRegionFilter] = useState<RegionFilter>('all');
  const [selectedAnimeId, setSelectedAnimeId] = useState<string | null>(animeIdParam ?? null);
  const [characters, setCharacters] = useState<CharacterGroup[]>(() => getCharacterGroups());

  useEffect(() => subscribeCharacters(() => setCharacters(getCharacterGroups())), []);

  // Captures are seeded synchronously above; no async reload needed because
  // every writer (camera capture flow, clear actions) updates MMKV directly
  // and the new mount will see the fresh value.

  useEffect(() => {
    let cancelled = false;
    async function loadAlbumAnimeIndex() {
      const byId = new Map<number, AnitabiBangumi>();
      try {
        const collectionEntries = await collectionPilgrimageService.getEntries();
        for (const entry of collectionEntries) byId.set(entry.anime.id, entry.anime);
      } catch (err) {
        console.warn('[PilgrimageAlbum] collection anime load failed:', err);
      }

      const featured = await Promise.allSettled(
        FEATURED_PILGRIMAGE_ANIME.map(({ bangumiId }) =>
          pilgrimageRepository.getSpotsByBangumiId(bangumiId)
        )
      );
      for (const result of featured) {
        if (result.status === 'fulfilled' && result.value) {
          byId.set(result.value.id, result.value);
        }
      }

      if (!cancelled) setAnimes([...byId.values()]);
    }
    void loadAlbumAnimeIndex();
    return () => {
      cancelled = true;
    };
  }, []);

  // Flatten captures into album rows. Current captures carry enough metadata
  // to render even before the related anime appears in the preloaded index;
  // legacy captures still get matched through known Anitabi lite points.
  const entries = useMemo<AlbumEntry[]>(() => {
    return buildPilgrimageAlbumEntries({
      captures: Object.values(captures),
      animes,
    });
  }, [captures, animes]);

  // Group entries by anime to form folders.
  const folders = useMemo<FolderGroup[]>(() => {
    const map = new Map<number, FolderGroup>();
    for (const entry of entries) {
      const id = entry.anime.id;
      const existing = map.get(id);
      if (existing) {
        existing.entries.push(entry);
        existing.lastCapturedAt = Math.max(existing.lastCapturedAt, entry.capture.capturedAt);
      } else {
        const eighty8 = get88EntriesByBangumiId(id);
        map.set(id, {
          anime: entry.anime,
          entries: [entry],
          lastCapturedAt: entry.capture.capturedAt,
          avgMatch: null,
          visitedSpots: 0,
          totalSpots: entry.anime.pointsLength ?? entry.anime.litePoints?.length ?? 0,
          cover: entry.anime.cover || entry.spot.image || entry.capture.uri,
          region: eighty8[0]?.region ?? null,
        });
      }
    }
    // Compute folder aggregates after grouping.
    for (const folder of map.values()) {
      const distinct = new Set(folder.entries.map((e) => e.spot.id));
      const matches = folder.entries
        .map((entry) => entry.matchPercent)
        .filter((value): value is number => typeof value === 'number');
      folder.visitedSpots = distinct.size;
      folder.avgMatch =
        matches.length > 0
          ? Math.round(matches.reduce((sum, value) => sum + value, 0) / matches.length)
          : null;
    }
    return Array.from(map.values()).sort((a, b) => b.lastCapturedAt - a.lastCapturedAt);
  }, [entries]);

  // Filter chips: only show regions that actually appear in the user's
  // folders, so the rail doesn't list empty buckets. `other` collects anime
  // not in the Anime Tourism 88 list.
  const availableRegions = useMemo(() => {
    const inRegions = new Set<AnimeTourism88Region>();
    let hasOther = false;
    for (const folder of folders) {
      if (folder.region) inRegions.add(folder.region);
      else hasOther = true;
    }
    const ordered = REGION_ORDER.filter((r) => inRegions.has(r));
    return { regions: ordered, hasOther };
  }, [folders]);

  const filteredFolders = useMemo(() => {
    if (regionFilter === 'all') return folders;
    if (regionFilter === 'other') return folders.filter((f) => f.region === null);
    return folders.filter((f) => f.region === regionFilter);
  }, [folders, regionFilter]);

  // Stats reflect the active filter so the user can scope "how am I doing in
  // Kanto" without recomputing in their head.
  const stats = useMemo(() => {
    const source = regionFilter === 'all' ? folders : filteredFolders;
    const visited = source.reduce((s, f) => s + f.visitedSpots, 0);
    const photos = source.reduce((s, f) => s + f.entries.length, 0);
    const matches = source.flatMap((folder) =>
      folder.entries
        .map((entry) => entry.matchPercent)
        .filter((value): value is number => typeof value === 'number')
    );
    const avgMatch =
      matches.length > 0
        ? Math.round(matches.reduce((sum, value) => sum + value, 0) / matches.length)
        : null;
    return { visited, photos, avgMatch, folders: source.length };
  }, [folders, filteredFolders, regionFilter]);

  const handleEntryPress = useCallback(
    (entry: AlbumEntry) => {
      hapticsBridge.selection();
      const animeTitles = getPilgrimageAnimeTitles(entry.anime);
      const spotTitles = getPilgrimageSpotTitles(entry.spot);
      const params: Record<string, string> = {
        spotId: entry.spot.id,
        imageUrl: entry.spot.image,
        shotUri: entry.capture.uri,
        shotWidth: '0',
        shotHeight: '0',
        capturedAt: String(entry.capture.capturedAt),
        name: spotTitles.primary,
        ep: String(entry.spot.ep),
        animeId: String(entry.anime.id),
        animeTitle: animeTitles.primary,
        themeColor: entry.anime.color || theme.accent,
        heading: entry.capture.heading != null ? String(entry.capture.heading) : '',
        shotSource:
          entry.capture.source === 'library'
            ? 'library'
            : entry.capture.source === 'auto'
              ? 'auto'
              : 'manual',
        note: entry.capture.note ?? '',
      };
      if (entry.capture.userLocation) {
        params.userLat = String(entry.capture.userLocation.latitude);
        params.userLng = String(entry.capture.userLocation.longitude);
      }
      const [lat, lng] = entry.spot.geo;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        params.spotLat = String(lat);
        params.spotLng = String(lng);
      }
      const snapshot = entry.capture.sensorSnapshot;
      if (snapshot?.distanceMeters != null) params.distanceMeters = String(snapshot.distanceMeters);
      if (snapshot?.headingDeltaDeg != null) {
        params.headingDeltaDeg = String(snapshot.headingDeltaDeg);
      }
      if (snapshot?.tilt != null) params.tilt = String(snapshot.tilt);
      // CC BY-NC-SA 4.0 attribution for the saved reference scene.
      if (entry.spot.origin) params.sceneOrigin = entry.spot.origin;
      if (entry.spot.originURL) params.sceneOriginURL = entry.spot.originURL;
      router.push({
        pathname: '/pilgrimage/compare/preview',
        params,
      });
    },
    [router, theme.accent]
  );

  const handleOpenFolder = useCallback((folder: FolderGroup) => {
    hapticsBridge.tap();
    cameFromUrlRef.current = false;
    setSelectedAnimeId(String(folder.anime.id));
  }, []);

  const handleBack = useCallback(() => {
    // Detail view that was entered from the folder grid: pop back to grid in-screen.
    if (selectedAnimeId && !cameFromUrlRef.current) {
      hapticsBridge.tap();
      setSelectedAnimeId(null);
      return;
    }
    router.back();
  }, [router, selectedAnimeId]);

  const selectedFolder = useMemo(
    () => folders.find((f) => String(f.anime.id) === selectedAnimeId) ?? null,
    [folders, selectedAnimeId]
  );

  const handleAddNew = useCallback(() => {
    hapticsBridge.tap();
    if (selectedAnimeId) {
      const anime = selectedFolder?.anime ?? null;
      router.push(
        buildPilgrimageDetailRoute(selectedAnimeId, {
          returnTo: 'album',
          albumAnimeId: selectedAnimeId,
          title: anime?.title || anime?.cn || null,
          titleSecondary: anime?.cn && anime.cn !== anime.title ? anime.cn : null,
          poster: anime?.cover ?? null,
          themeColor: anime?.color ?? null,
        })
      );
      return;
    }
    router.push('/pilgrimage');
  }, [router, selectedAnimeId, selectedFolder]);

  // Detail-view masonry — split the selected folder's entries into two columns
  // with a small height variation so the grid still feels organic.
  const detailColumns = useMemo(() => {
    const left: AlbumEntry[] = [];
    const right: AlbumEntry[] = [];
    (selectedFolder?.entries ?? []).forEach((entry, i) => {
      if (i % 2 === 0) left.push(entry);
      else right.push(entry);
    });
    return { left, right };
  }, [selectedFolder]);

  const isDetail = !!selectedAnimeId;
  const headerSubtitle = isDetail
    ? selectedFolder
      ? t('pilgrimage.album.detailSubtitle', {
          captures: selectedFolder.entries.length,
          spots: selectedFolder.visitedSpots,
        })
      : t('pilgrimage.album.loadingFolder')
    : t('pilgrimage.album.foldersByAnime');

  const headerTitle = isDetail
    ? selectedFolder
      ? getPilgrimageAnimeTitles(selectedFolder.anime).primary
      : t('pilgrimage.album.albumFallback')
    : t('pilgrimage.album.title');

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text.primary} />
          </Pressable>
          <View style={styles.headerCenter}>
            <ThemedText
              variant="titleSmall"
              weight="700"
              numberOfLines={1}
              style={styles.headerTitle}>
              {headerTitle}
            </ThemedText>
            <ThemedText
              variant="captionSmall"
              tone="secondary"
              numberOfLines={1}
              style={styles.headerSubtitle}>
              {headerSubtitle}
            </ThemedText>
          </View>
          <Pressable
            onPress={handleAddNew}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel={
              isDetail
                ? t('pilgrimage.album.addPhotoA11y')
                : t('pilgrimage.album.startPilgrimageA11y')
            }
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}>
            <Ionicons
              name={isDetail ? 'images-outline' : 'add'}
              size={20}
              color={theme.text.primary}
            />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 110 }]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.statsRow}>
            <StatCard
              icon="location"
              iconColor={theme.status.info}
              label={t('pilgrimage.album.statVisited')}
              value={String(stats.visited)}
              subtitle={t('pilgrimage.album.statSpots')}
              theme={theme}
            />
            <StatCard
              icon="camera"
              iconColor={theme.secondary}
              label={t('pilgrimage.album.statPhotos')}
              value={String(stats.photos)}
              subtitle={t('pilgrimage.album.statCaptures')}
              theme={theme}
            />
            <StatCard
              icon="checkmark-circle"
              iconColor={theme.status.success}
              label={t('pilgrimage.album.statAvgMatch')}
              value={stats.avgMatch !== null ? `${stats.avgMatch}` : '—'}
              valueSuffix={stats.avgMatch !== null ? '%' : undefined}
              subtitle={t('pilgrimage.album.statAverage')}
              valueColor={stats.avgMatch !== null ? theme.status.success : theme.text.tertiary}
              theme={theme}
            />
          </View>

          {!isDetail ? (
            <View style={styles.charSection}>
              <View style={styles.charHeader}>
                <ThemedText variant="titleSmall" weight="700">
                  {t('companion.albumSectionTitle')}
                </ThemedText>
                <Pressable
                  onPress={() => {
                    hapticsBridge.selection();
                    router.push('/companion/library');
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('companion.albumSectionManage')}
                  style={({ pressed }) => [styles.charManageBtn, pressed && { opacity: 0.6 }]}>
                  <ThemedText variant="captionSmall" weight="700" style={{ color: theme.accent }}>
                    {t('companion.albumSectionManage')}
                  </ThemedText>
                  <Ionicons name="chevron-forward" size={13} color={theme.accent} />
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.charRail}>
                {characters.map((group) => (
                  <Pressable
                    key={group.groupId}
                    onPress={() => {
                      hapticsBridge.selection();
                      router.push('/companion/library');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('companion.openA11y', { name: group.name })}
                    style={({ pressed }) => [styles.charTile, pressed && { opacity: 0.85 }]}>
                    <View
                      style={[
                        styles.charThumb,
                        {
                          backgroundColor: theme.background.tertiary,
                          borderColor: theme.glassBorder,
                        },
                      ]}>
                      <Image
                        source={{ uri: group.cover.thumbUri }}
                        style={StyleSheet.absoluteFillObject}
                        contentFit="contain"
                      />
                    </View>
                    <ThemedText
                      variant="captionSmall"
                      weight="600"
                      numberOfLines={1}
                      style={styles.charTileName}>
                      {group.name}
                    </ThemedText>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => {
                    hapticsBridge.selection();
                    router.push('/companion/library');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    characters.length === 0 ? t('companion.empty.cta') : t('companion.import')
                  }
                  style={({ pressed }) => [
                    styles.charAddTile,
                    { borderColor: theme.glassBorder, backgroundColor: theme.background.secondary },
                    pressed && { opacity: 0.8 },
                  ]}>
                  <Ionicons
                    name={characters.length === 0 ? 'people-outline' : 'add'}
                    size={22}
                    color={theme.accent}
                  />
                  {characters.length === 0 ? (
                    <ThemedText
                      variant="captionSmall"
                      weight="700"
                      tone="secondary"
                      numberOfLines={2}
                      style={styles.charAddLabel}>
                      {t('companion.empty.cta')}
                    </ThemedText>
                  ) : null}
                </Pressable>
              </ScrollView>
            </View>
          ) : null}

          {!isDetail && (availableRegions.regions.length > 0 || availableRegions.hasOther) ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}>
              <Chip
                label={t('pilgrimage.album.chipAll')}
                count={folders.length}
                active={regionFilter === 'all'}
                onPress={() => {
                  hapticsBridge.selection();
                  setRegionFilter('all');
                }}
                accent={theme.accent}
                accentFg={accentFg}
                theme={theme}
              />
              {availableRegions.regions.map((region) => {
                const count = folders.filter((f) => f.region === region).length;
                return (
                  <Chip
                    key={region}
                    label={REGION_LABELS[region]}
                    count={count}
                    active={regionFilter === region}
                    onPress={() => {
                      hapticsBridge.selection();
                      setRegionFilter(region);
                    }}
                    accent={theme.accent}
                    accentFg={accentFg}
                    theme={theme}
                  />
                );
              })}
              {availableRegions.hasOther ? (
                <Chip
                  label="その他"
                  count={folders.filter((f) => f.region === null).length}
                  active={regionFilter === 'other'}
                  onPress={() => {
                    hapticsBridge.selection();
                    setRegionFilter('other');
                  }}
                  accent={theme.accent}
                  accentFg={accentFg}
                  theme={theme}
                />
              ) : null}
            </ScrollView>
          ) : null}

          {isDetail ? (
            selectedFolder && selectedFolder.entries.length > 0 ? (
              <View>
                <View style={styles.detailHeader}>
                  <View style={{ flex: 1 }}>
                    <ThemedText variant="titleMedium" weight="700" numberOfLines={1}>
                      {getPilgrimageAnimeTitles(selectedFolder.anime).primary}
                    </ThemedText>
                    {selectedFolder.region ? (
                      <ThemedText variant="captionSmall" tone="secondary" style={{ marginTop: 2 }}>
                        {REGION_LABELS[selectedFolder.region]} ·{' '}
                        {t('pilgrimage.album.capturesShort', {
                          count: selectedFolder.entries.length,
                        })}
                      </ThemedText>
                    ) : null}
                  </View>
                  {selectedFolder.avgMatch !== null ? (
                    <View
                      style={[
                        styles.matchBadge,
                        {
                          backgroundColor: `${theme.status.success}1F`,
                          borderColor: theme.status.success,
                        },
                      ]}>
                      <Ionicons name="checkmark-circle" size={12} color={theme.status.success} />
                      <ThemedText
                        weight="700"
                        style={{ color: theme.status.success, fontSize: 12 }}>
                        {selectedFolder.avgMatch}%
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
                <View style={styles.grid}>
                  <View style={styles.col}>
                    {detailColumns.left.map((entry, i) => (
                      <CompareCard
                        key={entry.capture.spotId}
                        entry={entry}
                        theme={theme}
                        heightVariant={i % 3}
                        onPress={() => handleEntryPress(entry)}
                      />
                    ))}
                  </View>
                  <View style={styles.col}>
                    {detailColumns.right.map((entry, i) => (
                      <CompareCard
                        key={entry.capture.spotId}
                        entry={entry}
                        theme={theme}
                        heightVariant={(i + 1) % 3}
                        onPress={() => handleEntryPress(entry)}
                      />
                    ))}
                  </View>
                </View>
              </View>
            ) : (
              <EmptyState
                theme={theme}
                title={t('pilgrimage.album.emptyFolderTitle')}
                body={t('pilgrimage.album.emptyFolderBody')}
              />
            )
          ) : filteredFolders.length === 0 ? (
            <EmptyState
              theme={theme}
              title={
                folders.length === 0
                  ? t('pilgrimage.album.emptyTitle')
                  : t('pilgrimage.album.emptyRegionTitle')
              }
              body={
                folders.length === 0
                  ? t('pilgrimage.album.emptyBody')
                  : t('pilgrimage.album.emptyRegionBody')
              }
            />
          ) : (
            <FolderGridView
              folders={filteredFolders}
              theme={theme}
              now={Date.now()}
              onPress={handleOpenFolder}
            />
          )}
        </ScrollView>

        <View style={[styles.fabWrap, { bottom: insets.bottom + 18 }]}>
          <Pressable
            onPress={handleAddNew}
            accessibilityRole="button"
            accessibilityLabel={t('pilgrimage.album.startPilgrimageA11y')}
            style={({ pressed }) => [
              styles.fabBtn,
              {
                backgroundColor: theme.accent,
                opacity: pressed ? 0.92 : 1,
              },
              Shadow.glow(theme.accent),
            ]}>
            <View style={[styles.fabIconWrap, { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
              <Ionicons name="camera" size={14} color={accentFg} />
            </View>
            <View>
              <ThemedText
                variant="captionSmall"
                weight="700"
                style={{ color: accentFg, fontSize: 13 }}>
                {t('pilgrimage.album.addPilgrimage')}
              </ThemedText>
              <ThemedText
                variant="captionSmall"
                weight="600"
                style={{
                  color: `${accentFg}CC`,
                  fontSize: 9,
                  letterSpacing: 0.3,
                }}>
                {t('pilgrimage.album.startCapture')}
              </ThemedText>
            </View>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function StatCard({
  icon,
  iconColor,
  label,
  value,
  valueSuffix,
  subtitle,
  valueColor,
  theme,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  label: string;
  value: string;
  valueSuffix?: string;
  subtitle: string;
  valueColor?: string;
  theme: ThemePalette;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.statCard}>
      <View style={styles.statTop}>
        <Ionicons name={icon} size={12} color={iconColor} />
        <ThemedText
          variant="captionSmall"
          weight="600"
          tone="secondary"
          style={{ letterSpacing: 0.4, fontSize: 10 }}>
          {label}
        </ThemedText>
      </View>
      <View style={styles.statValueRow}>
        <ThemedText weight="700" style={{ fontSize: 22, color: valueColor ?? theme.text.primary }}>
          {value}
        </ThemedText>
        {valueSuffix ? (
          <ThemedText
            weight="600"
            style={{
              fontSize: 13,
              color: valueColor ?? theme.text.primary,
              marginBottom: 2,
            }}>
            {valueSuffix}
          </ThemedText>
        ) : null}
      </View>
      <ThemedText style={{ fontSize: 10, color: theme.text.tertiary }}>{subtitle}</ThemedText>
    </View>
  );
}

function Chip({
  label,
  count,
  active,
  onPress,
  accent,
  accentFg,
  theme,
}: {
  label: string;
  count?: number;
  active: boolean;
  onPress: () => void;
  accent: string;
  accentFg: string;
  theme: ThemePalette;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? accent : theme.background.secondary,
          borderColor: active ? accent : theme.glassBorder,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <ThemedText
        weight={active ? '700' : '600'}
        style={{
          color: active ? accentFg : theme.text.primary,
          fontSize: 12,
        }}
        numberOfLines={1}>
        {label}
      </ThemedText>
      {count !== undefined && count > 0 ? (
        <View
          style={[
            styles.chipCount,
            {
              backgroundColor: active ? 'rgba(255,255,255,0.22)' : theme.background.tertiary,
            },
          ]}>
          <ThemedText
            weight="700"
            style={{
              color: active ? accentFg : theme.text.tertiary,
              fontSize: 10,
            }}>
            {count}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

function FolderGridView({
  folders,
  theme,
  now,
  onPress,
}: {
  folders: FolderGroup[];
  theme: ThemePalette;
  now: number;
  onPress: (folder: FolderGroup) => void;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const rows: FolderGroup[][] = [];
  for (let i = 0; i < folders.length; i += 2) {
    rows.push(folders.slice(i, i + 2));
  }
  return (
    <View style={styles.folderGrid}>
      {rows.map((row, idx) => (
        <View key={idx} style={styles.folderRow}>
          {row.map((folder) => (
            <View key={folder.anime.id} style={styles.folderCell}>
              <FolderCard folder={folder} theme={theme} now={now} onPress={() => onPress(folder)} />
            </View>
          ))}
          {row.length === 1 ? <View style={styles.folderCell} /> : null}
        </View>
      ))}
    </View>
  );
}

function FolderCard({
  folder,
  theme,
  now,
  onPress,
}: {
  folder: FolderGroup;
  theme: ThemePalette;
  now: number;
  onPress: () => void;
}) {
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const titles = getPilgrimageAnimeTitles(folder.anime);
  const regionLabel = folder.region ? REGION_LABELS[folder.region] : null;
  const spotPart =
    folder.totalSpots > 0
      ? t('pilgrimage.album.folderSpotsRatio', {
          visited: folder.visitedSpots,
          total: folder.totalSpots,
        })
      : t('pilgrimage.album.folderSpotsCount', { count: folder.visitedSpots });
  const photoPart = t('pilgrimage.album.folderPhotosCount', { count: folder.entries.length });
  const subtitle = `${spotPart} · ${photoPart}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('pilgrimage.album.openFolderA11y', { title: titles.primary })}
      style={({ pressed }) => [
        styles.folderCard,
        {
          backgroundColor: theme.background.secondary,
          borderColor: theme.glassBorder,
          opacity: pressed ? 0.9 : 1,
        },
      ]}>
      <View style={styles.folderCoverWrap}>
        {folder.cover ? (
          <Image
            source={{ uri: folder.cover }}
            style={styles.folderCoverImage}
            contentFit="cover"
            transition={160}
          />
        ) : (
          <LinearGradient
            colors={[`${theme.accent}26`, 'transparent']}
            style={StyleSheet.absoluteFill}
          />
        )}
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.7)']}
          style={styles.folderCoverGradient}
          pointerEvents="none"
        />
        {regionLabel ? (
          <View style={styles.regionPill}>
            <Ionicons name="location-outline" size={10} color="#FFFFFF" />
            <ThemedText weight="700" style={{ color: '#FFFFFF', fontSize: 10 }} numberOfLines={1}>
              {regionLabel}
            </ThemedText>
          </View>
        ) : null}
        <View style={styles.countPill}>
          <Ionicons name="camera" size={10} color="#FFFFFF" />
          <ThemedText weight="700" style={{ color: '#FFFFFF', fontSize: 10 }}>
            {folder.entries.length}
          </ThemedText>
        </View>
        {folder.avgMatch !== null ? (
          <View style={[styles.matchOverlay, { backgroundColor: `${theme.status.success}E6` }]}>
            <Ionicons name="checkmark-circle" size={11} color="#FFFFFF" />
            <ThemedText weight="800" style={{ color: '#FFFFFF', fontSize: 11 }}>
              {folder.avgMatch}%
            </ThemedText>
          </View>
        ) : null}
      </View>
      <View style={styles.folderBody}>
        <ThemedText variant="bodyMedium" weight="700" numberOfLines={1}>
          {titles.primary}
        </ThemedText>
        <View style={styles.folderMetaRow}>
          <ThemedText
            variant="captionSmall"
            tone="secondary"
            numberOfLines={1}
            style={{ flex: 1, fontSize: 11 }}>
            {subtitle}
          </ThemedText>
        </View>
        <View style={styles.folderFootRow}>
          <ThemedText variant="captionSmall" tone="tertiary" style={{ fontSize: 10 }}>
            {formatRelative(folder.lastCapturedAt, now, t)}
          </ThemedText>
          <Ionicons name="chevron-forward" size={14} color={theme.text.tertiary} />
        </View>
      </View>
    </Pressable>
  );
}

function CompareCard({
  entry,
  theme,
  heightVariant,
  onPress,
}: {
  entry: AlbumEntry;
  theme: ThemePalette;
  heightVariant: number;
  onPress: () => void;
}) {
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // Two-image stack with light masonry variation. Heights apply to both
  // panels so the divider sits at a predictable point.
  const animeH = [120, 138, 108][heightVariant] ?? 120;
  const realH = [120, 138, 108][heightVariant] ?? 120;
  const spotTitles = getPilgrimageSpotTitles(entry.spot);
  const animeTitles = getPilgrimageAnimeTitles(entry.anime);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('pilgrimage.album.compareA11y', { title: spotTitles.primary })}
      style={({ pressed }) => [
        styles.compareCard,
        {
          backgroundColor: theme.background.secondary,
          borderColor: theme.glassBorder,
          opacity: pressed ? 0.92 : 1,
        },
      ]}>
      <View style={styles.compareImgsWrap}>
        <View style={[styles.compareHalf, { height: animeH }]}>
          <Image
            source={{ uri: entry.spot.image }}
            style={styles.compareImgFill}
            contentFit="cover"
            transition={140}
          />
          <View style={styles.cornerTag}>
            <ThemedText weight="700" style={{ color: '#FFFFFF', fontSize: 9 }}>
              {t('pilgrimage.album.tagScene')}
            </ThemedText>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={[styles.compareHalf, { height: realH }]}>
          <Image
            source={{ uri: entry.capture.uri }}
            style={styles.compareImgFill}
            contentFit="cover"
            transition={140}
          />
          <View style={[styles.cornerTag, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
            <ThemedText weight="700" style={{ color: '#FFFFFF', fontSize: 9 }}>
              {entry.capture.source === 'library'
                ? t('pilgrimage.album.tagLibrary')
                : t('pilgrimage.album.tagYours')}
            </ThemedText>
          </View>
        </View>
        {entry.matchPercent !== null ? (
          <View style={styles.matchPill}>
            <Ionicons name="checkmark-circle" size={10} color={theme.status.success} />
            <ThemedText weight="700" style={{ color: '#FFFFFF', fontSize: 10 }}>
              {entry.matchPercent}%
            </ThemedText>
          </View>
        ) : null}
      </View>
      <View style={styles.compareFoot}>
        <ThemedText variant="captionSmall" weight="700" numberOfLines={1} style={{ fontSize: 12 }}>
          {spotTitles.primary}
        </ThemedText>
        {entry.capture.note ? (
          <ThemedText
            variant="captionSmall"
            tone="secondary"
            numberOfLines={2}
            style={{ fontSize: 10 }}>
            {entry.capture.note}
          </ThemedText>
        ) : null}
        <View style={styles.compareMetaRow}>
          <ThemedText
            variant="captionSmall"
            tone="tertiary"
            numberOfLines={1}
            style={{ fontSize: 9, flex: 1 }}>
            {animeTitles.primary}
          </ThemedText>
          <ThemedText
            variant="captionSmall"
            weight="600"
            style={{ color: theme.accent, fontSize: 9 }}>
            {t('pilgrimage.album.epLabel', { ep: entry.spot.ep })}
          </ThemedText>
        </View>
        {entry.capture.userLocation ? (
          <View style={styles.compareMetaRow}>
            <Ionicons name="location-outline" size={10} color={theme.text.tertiary} />
            <ThemedText
              variant="captionSmall"
              tone="tertiary"
              numberOfLines={1}
              style={{ flex: 1, fontSize: 9 }}>
              {entry.capture.userLocation.latitude.toFixed(4)},{' '}
              {entry.capture.userLocation.longitude.toFixed(4)}
            </ThemedText>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function EmptyState({ theme, title, body }: { theme: ThemePalette; title: string; body: string }) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.background.tertiary }]}>
        <Ionicons name="camera-outline" size={28} color={theme.text.secondary} />
      </View>
      <ThemedText variant="titleMedium" weight="600" align="center">
        {title}
      </ThemedText>
      <ThemedText
        variant="bodySmall"
        tone="secondary"
        align="center"
        style={{ paddingHorizontal: 24 }}>
        {body}
      </ThemedText>
    </View>
  );
}

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background.primary },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 12,
      gap: 12,
    },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    headerCenter: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    headerTitle: {
      fontSize: 16,
      textAlign: 'center',
    },
    headerSubtitle: {
      letterSpacing: 0.5,
      fontSize: 11,
      textAlign: 'center',
    },
    scroll: {
      paddingHorizontal: 16,
      gap: 12,
    },
    statsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    statCard: {
      flex: 1,
      padding: 12,
      borderRadius: 14,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      gap: 4,
    },
    statTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    statValueRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 2,
    },
    charSection: {
      gap: 8,
    },
    charHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    charManageBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingVertical: 4,
    },
    charRail: {
      gap: 10,
      paddingVertical: 2,
      paddingRight: 4,
    },
    charTile: {
      width: 72,
      gap: 4,
    },
    charThumb: {
      width: 72,
      height: 92,
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 1,
    },
    charTileName: {
      textAlign: 'center',
    },
    charAddTile: {
      width: 72,
      height: 92,
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingHorizontal: 4,
    },
    charAddLabel: {
      textAlign: 'center',
    },
    chipsRow: {
      gap: 8,
      paddingVertical: 4,
      paddingRight: 4,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 18,
      borderWidth: 1,
      minHeight: 36,
      maxWidth: 180,
    },
    chipCount: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 8,
      minWidth: 18,
      alignItems: 'center',
    },
    detailHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: 4,
      marginBottom: 8,
    },
    matchBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      borderWidth: 1,
    },
    emptyState: {
      alignItems: 'center',
      gap: 10,
      paddingVertical: 56,
    },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },

    // Folder grid (default view)
    folderGrid: {
      gap: 12,
    },
    folderRow: {
      flexDirection: 'row',
      gap: 12,
    },
    folderCell: {
      flex: 1,
    },
    folderCard: {
      borderRadius: 18,
      borderWidth: 1,
      overflow: 'hidden',
    },
    folderCoverWrap: {
      aspectRatio: 1,
      backgroundColor: theme.background.tertiary,
      position: 'relative',
    },
    folderCoverImage: {
      width: '100%',
      height: '100%',
    },
    folderCoverGradient: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '60%',
    },
    regionPill: {
      position: 'absolute',
      top: 8,
      left: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 10,
      backgroundColor: 'rgba(0,0,0,0.6)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.15)',
      maxWidth: '70%',
    },
    countPill: {
      position: 'absolute',
      top: 8,
      right: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 10,
      backgroundColor: 'rgba(0,0,0,0.6)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.15)',
    },
    matchOverlay: {
      position: 'absolute',
      bottom: 8,
      left: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 10,
    },
    folderBody: {
      padding: 12,
      gap: 4,
    },
    folderMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    folderFootRow: {
      marginTop: 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },

    // Detail view (per-folder)
    grid: {
      flexDirection: 'row',
      gap: 12,
    },
    col: {
      flex: 1,
      gap: 12,
    },
    compareCard: {
      borderRadius: 18,
      borderWidth: 1,
      overflow: 'hidden',
    },
    compareImgsWrap: {
      position: 'relative',
    },
    compareHalf: {
      width: '100%',
      backgroundColor: theme.background.tertiary,
      position: 'relative',
    },
    compareImgFill: {
      width: '100%',
      height: '100%',
    },
    cornerTag: {
      position: 'absolute',
      top: 6,
      right: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    divider: {
      height: 3,
      backgroundColor: 'rgba(255,255,255,0.85)',
    },
    matchPill: {
      position: 'absolute',
      top: 8,
      left: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 10,
      backgroundColor: 'rgba(0,0,0,0.7)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
    },
    compareFoot: {
      padding: 10,
      gap: 6,
    },
    compareMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 6,
    },

    // FAB
    fabWrap: {
      position: 'absolute',
      right: 16,
    },
    fabBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 28,
    },
    fabIconWrap: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
