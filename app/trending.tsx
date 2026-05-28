// Full trending list — opened from Home Trend's "See all". Mirrors the home
// tab's [This Week | All Time] pill but paginates further (top 50) and offers
// a richer rank row. Range is hydrated from `?range=week|all` query params so
// the section the user tapped lands focused.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { readableTextOn, Skeleton } from '../components/themed';
import { AnimeRepository } from '../libs/repositories/anime-repository';
import { pushAnimeDetail } from '../libs/utils/navigate-to-anime';
import { Anime } from '../components/rate/types';
import { hapticsBridge } from '../modules/haptics/hapticsBridge';
import { FontFamily, Radius, Spacing, Typography } from '../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../context/ThemeContext';
import { useT } from '../libs/i18n';

type TrendRange = 'week' | 'all';

const PER_PAGE = 50;

function parseRange(value: string | undefined): TrendRange {
  return value === 'all' ? 'all' : 'week';
}

export default function TrendingScreen() {
  const { range: initialRangeParam } = useLocalSearchParams<{ range?: string }>();
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const rangeOptions = useMemo<readonly { value: TrendRange; label: string }[]>(
    () => [
      { value: 'week', label: t('trending.rangeWeek') },
      { value: 'all', label: t('trending.rangeAllTime') },
    ],
    [t]
  );

  const [range, setRange] = useState<TrendRange>(() => parseRange(initialRangeParam));
  const [weeklyAnime, setWeeklyAnime] = useState<Anime[]>([]);
  const [allTimeAnime, setAllTimeAnime] = useState<Anime[]>([]);
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = range === 'week' ? weeklyAnime : allTimeAnime;
  const loading = range === 'week' ? loadingWeek : loadingAll;
  const isInitialLoading = loading && list.length === 0;

  const loadRange = useCallback(
    async (target: TrendRange, force = false) => {
      if (target === 'week') {
        if (!force && weeklyAnime.length > 0) return;
        setLoadingWeek(true);
      } else {
        if (!force && allTimeAnime.length > 0) return;
        setLoadingAll(true);
      }
      try {
        const data =
          target === 'week'
            ? await AnimeRepository.getTrendingAnime(1, PER_PAGE)
            : await AnimeRepository.getTopAnime(1, PER_PAGE);
        if (target === 'week') setWeeklyAnime(data);
        else setAllTimeAnime(data);
        setError(null);
      } catch (err) {
        console.error('[/trending] load failed', err);
        setError(t('trending.errorLoadFailed'));
      } finally {
        if (target === 'week') setLoadingWeek(false);
        else setLoadingAll(false);
      }
    },
    [weeklyAnime.length, allTimeAnime.length, t]
  );

  useEffect(() => {
    void loadRange(range);
  }, [loadRange, range]);

  const handleRangeChange = useCallback(
    (next: TrendRange) => {
      if (next === range) return;
      hapticsBridge.selection();
      setRange(next);
    },
    [range]
  );

  const handleAnimePress = useCallback(
    (anime: Anime) => {
      hapticsBridge.tap();
      pushAnimeDetail(router, anime);
    },
    [router]
  );

  const handleRefresh = useCallback(() => {
    void loadRange(range, true);
  }, [loadRange, range]);

  const renderItem = useCallback(
    ({ item, index }: { item: Anime; index: number }) => (
      <TrendingListRow
        anime={item}
        rank={index + 1}
        onPress={() => handleAnimePress(item)}
      />
    ),
    [handleAnimePress]
  );

  const keyExtractor = useCallback((item: Anime) => item.id, []);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={theme.gradient} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={[styles.safe, { paddingTop: top > 0 ? 0 : Spacing.xs }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => {
              hapticsBridge.tap();
              router.back();
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.6 }]}>
            <Ionicons name="chevron-back" size={20} color={theme.text.primary} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{t('trending.title')}</Text>
            <Text style={styles.headerSubtitle}>
              {range === 'week' ? t('trending.subtitleWeek') : t('trending.subtitleAllTime')}
            </Text>
          </View>
          <View style={styles.iconButtonGhost} />
        </View>

        <View style={styles.rangeRow}>
          <RangePill options={rangeOptions} value={range} onChange={handleRangeChange} />
        </View>

        {isInitialLoading ? (
          <View style={styles.skeletonWrap}>
            <Skeleton.ListRow count={8} avatarShape="square" avatarSize={52} />
          </View>
        ) : error && list.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="cloud-offline-outline" size={32} color={theme.text.tertiary} />
            <Text style={styles.emptyText}>{error}</Text>
            <Pressable
              onPress={handleRefresh}
              hitSlop={8}
              style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]}>
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            refreshControl={
              <RefreshControl
                tintColor={theme.text.primary}
                refreshing={loading && list.length > 0}
                onRefresh={handleRefresh}
              />
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

interface RangePillProps {
  options: readonly { value: TrendRange; label: string }[];
  value: TrendRange;
  onChange: (next: TrendRange) => void;
}

function RangePill({ options, value, onChange }: RangePillProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const activeFg = useMemo(() => readableTextOn(theme.accent), [theme.accent]);
  return (
    <View style={styles.rangePill}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt.label}
            hitSlop={6}
            style={({ pressed }) => [
              styles.rangePillItem,
              active && { backgroundColor: theme.accent },
              pressed && !active && { opacity: 0.7 },
            ]}>
            <Text
              style={[
                styles.rangePillText,
                active
                  ? { color: activeFg, fontWeight: '700' }
                  : { color: theme.text.secondary },
              ]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface TrendingListRowProps {
  anime: Anime;
  rank: number;
  onPress: () => void;
}

function TrendingListRow({ anime, rank, onPress }: TrendingListRowProps) {
  const { theme } = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const score = anime.score != null ? formatScore(anime.score) : null;
  const isTop3 = rank <= 3;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={t('trending.rankA11y', { rank, title: anime.title })}>
      <Text
        style={[
          styles.rankNumber,
          isTop3 && { color: theme.accent },
        ]}>
        {String(rank).padStart(2, '0')}
      </Text>
      <Image
        source={{ uri: anime.image }}
        style={styles.thumb}
        contentFit="cover"
        transition={80}
        cachePolicy="memory-disk"
        recyclingKey={anime.id}
      />
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {anime.title}
        </Text>
        <View style={styles.metaRow}>
          {anime.tags?.[0] ? (
            <Text style={styles.tag}>{anime.tags[0]}</Text>
          ) : anime.type ? (
            <Text style={styles.tag}>{anime.type}</Text>
          ) : null}
          {anime.startDate?.year ? (
            <Text style={styles.tag}>· {anime.startDate.year}</Text>
          ) : null}
          {score ? (
            <View style={styles.score}>
              <Ionicons name="star" size={11} color={theme.accent} />
              <Text style={styles.scoreText}>{score}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.text.tertiary} />
    </Pressable>
  );
}

function formatScore(score: number): string {
  if (score > 10) return (score / 10).toFixed(1);
  return score.toFixed(1);
}

const makeStyles = (theme: ThemePalette) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.background.primary,
    },
    safe: {
      flex: 1,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      marginBottom: Spacing.sm,
      gap: Spacing.sm,
    },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconButtonGhost: {
      width: 40,
      height: 40,
    },
    headerCenter: {
      flex: 1,
      alignItems: 'center',
    },
    headerTitle: {
      ...Typography.titleLarge,
      fontFamily: FontFamily.rounded,
      color: theme.text.primary,
    },
    headerSubtitle: {
      ...Typography.caption,
      color: theme.text.tertiary,
      marginTop: 2,
    },
    rangeRow: {
      paddingHorizontal: Spacing.md,
      marginBottom: Spacing.md,
      alignItems: 'center',
    },
    rangePill: {
      flexDirection: 'row',
      padding: 3,
      borderRadius: 999,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      gap: 2,
    },
    rangePillItem: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 96,
    },
    rangePillText: {
      fontSize: 13,
      fontWeight: '600',
    },
    listContent: {
      paddingHorizontal: Spacing.md,
      paddingBottom: 140,
    },
    skeletonWrap: {
      paddingHorizontal: Spacing.md,
    },
    emptyWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.lg,
      gap: 12,
    },
    emptyText: {
      ...Typography.bodyMedium,
      color: theme.text.secondary,
      textAlign: 'center',
    },
    retryBtn: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: theme.accent,
    },
    retryText: {
      fontSize: 13,
      fontWeight: '700',
      color: readableTextOn(theme.accent),
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: Radius.lg,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    rankNumber: {
      color: theme.text.tertiary,
      fontSize: 22,
      fontWeight: '800',
      fontFamily: FontFamily.rounded,
      minWidth: 32,
      textAlign: 'center',
    },
    thumb: {
      width: 52,
      height: 70,
      borderRadius: 8,
      backgroundColor: theme.background.tertiary,
    },
    body: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    title: {
      color: theme.text.primary,
      fontSize: 14,
      fontWeight: '700',
      lineHeight: 18,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    tag: {
      color: theme.text.secondary,
      fontSize: 11,
      fontWeight: '500',
    },
    score: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    scoreText: {
      color: theme.accent,
      fontSize: 11,
      fontWeight: '700',
    },
  });
