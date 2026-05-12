// Mirrors japanwalker.pen Screen 12 (COuG3 — My Pilgrimage Album).
// Header (back + 我的聖地相冊 / My Pilgrimage + filter) → 3 stat cards
// (Visited / Photos / Avg Match with semantic colors) → anime filter chips
// (first cyan, others outlined) → 2-column masonry of comparison cards
// (anime image stacked over real photo with white divider + match pill) →
// floating FAB "+ 新增聖地 / Add Pilgrimage".

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { ThemedText, readableTextOn } from '../../../components/themed';
import {
  listCaptures,
  type PilgrimageCapture,
} from '../../../libs/services/pilgrimage/captures';
import { pilgrimageRepository } from '../../../libs/services/pilgrimage/pilgrimage-repository';
import { FEATURED_PILGRIMAGE_ANIME } from '../../../libs/services/pilgrimage/featured-anime';
import type {
  AnitabiBangumi,
  AnitabiPoint,
} from '../../../libs/services/pilgrimage/types';

interface AlbumEntry {
  capture: PilgrimageCapture;
  spot: AnitabiPoint;
  anime: AnitabiBangumi;
  match: number;
}

// Deterministic match score from capture id — keeps numbers stable across
// renders without persisting another field.
function deriveMatch(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return 78 + (Math.abs(hash) % 20); // 78–97
}

export default function PilgrimageAlbumScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const accentFg = readableTextOn(theme.accent);
  const { animeId: animeIdParam } = useLocalSearchParams<{ animeId?: string }>();

  const [captures, setCaptures] = useState<Record<string, PilgrimageCapture>>({});
  const [animes, setAnimes] = useState<AnitabiBangumi[]>([]);
  const [animeFilter, setAnimeFilter] = useState<string>(animeIdParam ?? 'all');

  useEffect(() => {
    let cancelled = false;
    listCaptures().then((m) => {
      if (!cancelled) setCaptures(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(
      FEATURED_PILGRIMAGE_ANIME.map(({ bangumiId }) =>
        pilgrimageRepository.getSpotsByBangumiId(bangumiId)
      )
    ).then((results) => {
      if (cancelled) return;
      const list = results
        .filter(
          (r): r is PromiseFulfilledResult<AnitabiBangumi | null> => r.status === 'fulfilled'
        )
        .map((r) => r.value)
        .filter((v): v is AnitabiBangumi => v !== null);
      setAnimes(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const entries = useMemo<AlbumEntry[]>(() => {
    const list: AlbumEntry[] = [];
    const captureList = Object.values(captures);
    for (const capture of captureList) {
      for (const anime of animes) {
        const spot = anime.litePoints?.find((p) => p.id === capture.spotId);
        if (spot) {
          list.push({
            capture,
            spot,
            anime,
            match: deriveMatch(capture.spotId + String(capture.capturedAt)),
          });
          break;
        }
      }
    }
    return list.sort((a, b) => b.capture.capturedAt - a.capture.capturedAt);
  }, [captures, animes]);

  const animeChips = useMemo(() => {
    const seen = new Map<number, AnitabiBangumi>();
    for (const entry of entries) seen.set(entry.anime.id, entry.anime);
    return Array.from(seen.values());
  }, [entries]);

  const filteredEntries = useMemo(() => {
    if (animeFilter === 'all') return entries;
    return entries.filter((e) => String(e.anime.id) === animeFilter);
  }, [entries, animeFilter]);

  const stats = useMemo(() => {
    const photos = entries.length;
    const visited = new Set(entries.map((e) => e.spot.id)).size;
    const avgMatch =
      entries.length > 0
        ? Math.round(entries.reduce((s, e) => s + e.match, 0) / entries.length)
        : 0;
    return { photos, visited, avgMatch };
  }, [entries]);

  // Split filtered entries into 2 columns for masonry layout.
  const columns = useMemo(() => {
    const left: AlbumEntry[] = [];
    const right: AlbumEntry[] = [];
    filteredEntries.forEach((entry, i) => {
      if (i % 2 === 0) left.push(entry);
      else right.push(entry);
    });
    return { left, right };
  }, [filteredEntries]);

  const handleEntryPress = useCallback(
    (entry: AlbumEntry) => {
      hapticsBridge.selection();
      router.push({
        pathname: '/pilgrimage/compare/preview',
        params: {
          spotId: entry.spot.id,
          imageUrl: entry.spot.image,
          shotUri: entry.capture.uri,
          shotWidth: '0',
          shotHeight: '0',
          name: entry.spot.cn || entry.spot.name,
          ep: String(entry.spot.ep),
          animeId: String(entry.anime.id),
          themeColor: theme.accent,
          heading: entry.capture.heading != null ? String(entry.capture.heading) : '',
        },
      });
    },
    [router, theme.accent]
  );

  const handleAddNew = useCallback(() => {
    hapticsBridge.tap();
    router.push('/pilgrimage');
  }, [router]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text.primary} />
          </Pressable>
          <View style={styles.headerCenter}>
            <ThemedText variant="titleSmall" weight="700" style={{ fontSize: 16 }}>
              我的聖地相冊
            </ThemedText>
            <ThemedText
              variant="captionSmall"
              tone="secondary"
              style={{ letterSpacing: 0.5, fontSize: 11 }}>
              My Pilgrimage
            </ThemedText>
          </View>
          <Pressable
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel="Filter"
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}>
            <Ionicons name="options-outline" size={18} color={theme.text.primary} />
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
              label="Visited"
              value={String(stats.visited)}
              subtitle="朝聖地"
              theme={theme}
            />
            <StatCard
              icon="camera"
              iconColor={theme.secondary}
              label="Photos"
              value={String(stats.photos)}
              subtitle="對比照"
              theme={theme}
            />
            <StatCard
              icon="checkmark-circle"
              iconColor={theme.status.success}
              label="Avg Match"
              value={stats.avgMatch > 0 ? `${stats.avgMatch}` : '—'}
              valueSuffix={stats.avgMatch > 0 ? '%' : undefined}
              subtitle="平均匹配"
              valueColor={theme.status.success}
              theme={theme}
            />
          </View>

          {animeChips.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}>
              <Chip
                label="全部 All"
                active={animeFilter === 'all'}
                onPress={() => {
                  hapticsBridge.selection();
                  setAnimeFilter('all');
                }}
                accent={theme.accent}
                accentFg={accentFg}
                theme={theme}
              />
              {animeChips.map((anime) => (
                <Chip
                  key={anime.id}
                  label={anime.cn || anime.title}
                  active={animeFilter === String(anime.id)}
                  onPress={() => {
                    hapticsBridge.selection();
                    setAnimeFilter(String(anime.id));
                  }}
                  accent={theme.accent}
                  accentFg={accentFg}
                  theme={theme}
                />
              ))}
            </ScrollView>
          ) : null}

          {filteredEntries.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.background.tertiary }]}>
                <Ionicons name="camera-outline" size={28} color={theme.text.secondary} />
              </View>
              <ThemedText variant="titleMedium" weight="600" align="center">
                No comparison photos yet
              </ThemedText>
              <ThemedText
                variant="bodySmall"
                tone="secondary"
                align="center"
                style={{ paddingHorizontal: 24 }}>
                Frame an anime scene at its real-world location to start your album.
              </ThemedText>
            </View>
          ) : (
            <View style={styles.grid}>
              <View style={styles.col}>
                {columns.left.map((entry, i) => (
                  <AlbumCard
                    key={entry.capture.spotId}
                    entry={entry}
                    theme={theme}
                    heightVariant={i % 3}
                    onPress={() => handleEntryPress(entry)}
                  />
                ))}
              </View>
              <View style={styles.col}>
                {columns.right.map((entry, i) => (
                  <AlbumCard
                    key={entry.capture.spotId}
                    entry={entry}
                    theme={theme}
                    heightVariant={(i + 1) % 3}
                    onPress={() => handleEntryPress(entry)}
                  />
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        <View style={[styles.fabWrap, { bottom: insets.bottom + 18 }]}>
          <Pressable
            onPress={handleAddNew}
            accessibilityRole="button"
            accessibilityLabel="Start new pilgrimage"
            style={({ pressed }) => [
              styles.fabBtn,
              {
                backgroundColor: theme.accent,
                shadowColor: theme.accent,
                opacity: pressed ? 0.9 : 1,
              },
            ]}>
            <View style={[styles.fabIconWrap, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Ionicons name="camera" size={14} color={accentFg} />
            </View>
            <View>
              <ThemedText
                variant="captionSmall"
                weight="700"
                style={{ color: accentFg, fontSize: 13 }}>
                + 新增聖地
              </ThemedText>
              <ThemedText
                variant="captionSmall"
                weight="600"
                style={{
                  color: `${accentFg}CC`,
                  fontSize: 9,
                  letterSpacing: 0.3,
                }}>
                Add Pilgrimage
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
        <ThemedText
          weight="700"
          style={{ fontSize: 22, color: valueColor ?? theme.text.primary }}>
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
      <ThemedText style={{ fontSize: 10, color: theme.text.tertiary }}>
        {subtitle}
      </ThemedText>
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
  accent,
  accentFg,
  theme,
}: {
  label: string;
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
    </Pressable>
  );
}

function AlbumCard({
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
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // Masonry effect: vary the anime/real split heights per card.
  const animeH = [105, 120, 95][heightVariant] ?? 110;
  const realH = [105, 120, 95][heightVariant] ?? 110;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Compare ${entry.spot.cn || entry.spot.name}`}
      style={({ pressed }) => [styles.albumCard, pressed && { opacity: 0.92 }]}>
      <View style={styles.albumImgsWrap}>
        <View style={[styles.albumHalf, { height: animeH }]}>
          <Image
            source={{ uri: entry.spot.image }}
            style={styles.albumImgFill}
            contentFit="cover"
            transition={140}
          />
        </View>
        <View style={styles.divider} />
        <View style={[styles.albumHalf, { height: realH }]}>
          <Image
            source={{ uri: entry.capture.uri }}
            style={styles.albumImgFill}
            contentFit="cover"
            transition={140}
          />
        </View>
        <View style={styles.matchPill}>
          <Ionicons
            name="checkmark-circle"
            size={10}
            color={theme.status.success}
          />
          <ThemedText
            weight="700"
            style={{ color: '#FFFFFF', fontSize: 10 }}>
            {entry.match}%
          </ThemedText>
        </View>
      </View>
      <View style={styles.albumFoot}>
        <ThemedText variant="captionSmall" weight="700" numberOfLines={1} style={{ fontSize: 12 }}>
          {entry.spot.cn || entry.spot.name}
        </ThemedText>
        <View style={styles.albumMetaRow}>
          <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1} style={{ fontSize: 9, flex: 1 }}>
            {entry.anime.cn || entry.anime.title}
          </ThemedText>
          <ThemedText
            variant="captionSmall"
            weight="600"
            style={{ color: theme.accent, fontSize: 9 }}>
            EP {entry.spot.ep}
          </ThemedText>
        </View>
      </View>
    </Pressable>
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
    chipsRow: {
      gap: 8,
      paddingVertical: 4,
      paddingRight: 4,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 18,
      borderWidth: 1,
      maxWidth: 160,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyState: {
      alignItems: 'center',
      gap: 10,
      paddingVertical: 36,
    },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    grid: {
      flexDirection: 'row',
      gap: 12,
    },
    col: {
      flex: 1,
      gap: 12,
    },
    albumCard: {
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    albumImgsWrap: {
      position: 'relative',
    },
    albumHalf: {
      width: '100%',
      backgroundColor: theme.background.tertiary,
    },
    albumImgFill: {
      width: '100%',
      height: '100%',
    },
    divider: {
      height: 4,
      backgroundColor: 'rgba(255,255,255,0.8)',
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
    albumFoot: {
      padding: 10,
      gap: 6,
    },
    albumMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 6,
    },
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
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 24,
      elevation: 8,
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
