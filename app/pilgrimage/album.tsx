// Mirrors japanwalker.pen Screen 12 (My Pilgrimage Album).
// Lists every spot the user has captured a comparison photo for, with stats
// header, anime filter chips, and a 2-up grid of comparison cards.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { ThemedText, readableTextOn } from '../../components/themed';
import {
  listCaptures,
  type PilgrimageCapture,
} from '../../libs/services/pilgrimage/captures';
import { pilgrimageRepository } from '../../libs/services/pilgrimage/pilgrimage-repository';
import { FEATURED_PILGRIMAGE_ANIME } from '../../libs/services/pilgrimage/featured-anime';
import type {
  AnitabiBangumi,
  AnitabiPoint,
} from '../../libs/services/pilgrimage/types';

interface AlbumEntry {
  capture: PilgrimageCapture;
  spot: AnitabiPoint;
  anime: AnitabiBangumi;
}

export default function PilgrimageAlbumScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const accentFg = readableTextOn(theme.accent);

  const [captures, setCaptures] = useState<Record<string, PilgrimageCapture>>({});
  const [animes, setAnimes] = useState<AnitabiBangumi[]>([]);
  const [animeFilter, setAnimeFilter] = useState<string>('all');

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
          list.push({ capture, spot, anime });
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
    return { photos, visited };
  }, [entries]);

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
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text.primary} />
          </Pressable>
          <View style={styles.headerCenter}>
            <ThemedText variant="titleLarge" weight="700">
              我的聖地相簿
            </ThemedText>
            <ThemedText variant="captionSmall" tone="secondary">
              My Pilgrimage
            </ThemedText>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.statsRow}>
            <StatPill
              label="Visited"
              value={String(stats.visited)}
              theme={theme}
            />
            <StatPill
              label="Photos"
              value={String(stats.photos)}
              theme={theme}
            />
            <StatPill
              label="Avg Match"
              value="—"
              hint="?"
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
              {filteredEntries.map((entry) => (
                <AlbumCard key={entry.capture.spotId} entry={entry} theme={theme} onPress={() => handleEntryPress(entry)} />
              ))}
            </View>
          )}
        </ScrollView>

        <View style={[styles.fab, { bottom: insets.bottom + 18 }]}>
          <Pressable
            onPress={handleAddNew}
            accessibilityRole="button"
            accessibilityLabel="Start new pilgrimage"
            style={({ pressed }) => [
              styles.fabBtn,
              { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Ionicons name="add" size={20} color={accentFg} />
            <ThemedText variant="bodyMedium" weight="700" style={{ color: accentFg }}>
              新增聖地 Add Pilgrimage
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function StatPill({
  label,
  value,
  hint,
  theme,
}: {
  label: string;
  value: string;
  hint?: string;
  theme: ThemePalette;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.statPill}>
      <ThemedText variant="titleLarge" weight="700">
        {value}
        {hint ? (
          <ThemedText variant="bodySmall" weight="700" style={{ color: theme.accent }}>
            {' '}
            {hint}
          </ThemedText>
        ) : null}
      </ThemedText>
      <ThemedText variant="captionSmall" tone="secondary" weight="600">
        {label}
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
        variant="bodySmall"
        weight={active ? '700' : '600'}
        style={{ color: active ? accentFg : theme.text.primary }}
        numberOfLines={1}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function AlbumCard({
  entry,
  theme,
  onPress,
}: {
  entry: AlbumEntry;
  theme: ThemePalette;
  onPress: () => void;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Compare ${entry.spot.cn || entry.spot.name}`}
      style={({ pressed }) => [styles.albumCard, pressed && { opacity: 0.9 }]}>
      <View style={styles.albumImageWrap}>
        <Image
          source={{ uri: entry.spot.image }}
          style={[styles.albumImage, { borderColor: theme.glassBorder }]}
          contentFit="cover"
          transition={140}
        />
        <Image
          source={{ uri: entry.capture.uri }}
          style={[styles.albumThumb, { borderColor: theme.background.primary }]}
          contentFit="cover"
        />
      </View>
      <View style={styles.albumBody}>
        <ThemedText variant="bodyMedium" weight="700" numberOfLines={1}>
          {entry.spot.cn || entry.spot.name}
        </ThemedText>
        <View style={styles.albumMetaRow}>
          <View style={[styles.epPill, { backgroundColor: `${theme.accent}33` }]}>
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: theme.accent }}>
              EP {entry.spot.ep}
            </ThemedText>
          </View>
          <ThemedText variant="captionSmall" tone="secondary" numberOfLines={1}>
            {entry.anime.cn || entry.anime.title}
          </ThemedText>
        </View>
      </View>
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']}
        style={styles.albumGradient}
        pointerEvents="none"
      />
    </Pressable>
  );
}

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background.primary },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
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
      paddingHorizontal: 20,
      gap: 16,
    },
    statsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    statPill: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: Radius.card,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      gap: 2,
    },
    chipsRow: {
      gap: 8,
      paddingRight: 4,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      maxWidth: 160,
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
      flexWrap: 'wrap',
      gap: 12,
    },
    albumCard: {
      width: '47.5%',
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    albumImageWrap: {
      position: 'relative',
      width: '100%',
      aspectRatio: 1,
    },
    albumImage: {
      width: '100%',
      height: '100%',
    },
    albumThumb: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      width: 40,
      height: 40,
      borderRadius: 10,
      borderWidth: 2,
    },
    albumBody: {
      padding: Spacing.sm + 2,
      gap: 6,
    },
    albumMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    epPill: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    albumGradient: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 56,
      height: 40,
    },
    fab: {
      position: 'absolute',
      left: 20,
      right: 20,
    },
    fabBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 999,
    },
  });
}
