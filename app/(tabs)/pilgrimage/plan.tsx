// Travel Planner — top-level entry for one-day pilgrimage trips.
// Derives a "Featured Trip" from the most-documented pilgrimage anime, shows
// the user's visited stats, and surfaces curated suggested trips. No backing
// trip-storage exists yet — saved trips would land here when that lands.
//
// All surfaces consume useTheme() so changing accent / theme repaints the
// page; cityToColor is still used per-trip but falls back to theme.accent.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { ThemedText, readableTextOn, Skeleton } from '../../../components/themed';
import { cityToColor } from '../../../libs/services/pilgrimage/region-color';
import { pilgrimageRepository } from '../../../libs/services/pilgrimage/pilgrimage-repository';
import { FEATURED_PILGRIMAGE_ANIME } from '../../../libs/services/pilgrimage/featured-anime';
import { getIndexedById } from '../../../libs/services/pilgrimage/anitabi-index';
import { collectionPilgrimageService } from '../../../libs/services/pilgrimage/collection-pilgrimage-service';
import {
  loadVisitedSpotsSync,
  type VisitedMap,
} from '../../../libs/services/pilgrimage/visited-prefs';
import { buildPilgrimageDetailRoute } from '../../../libs/services/pilgrimage/pilgrimage-navigation';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';
import { useT } from '../../../libs/i18n';

type TripCandidate = {
  anime: AnitabiBangumi;
  estimatedDays: number;
  walkingHours: number;
};

const PLAN_PRESET_DEFS: readonly {
  id: string;
  labelKey: string;
  subtitleKey: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'quick', labelKey: 'pilgrimage.plan.preset.quickLabel', subtitleKey: 'pilgrimage.plan.preset.quickSubtitle', icon: 'walk' },
  { id: 'full', labelKey: 'pilgrimage.plan.preset.fullLabel', subtitleKey: 'pilgrimage.plan.preset.fullSubtitle', icon: 'sunny' },
  { id: 'weekend', labelKey: 'pilgrimage.plan.preset.weekendLabel', subtitleKey: 'pilgrimage.plan.preset.weekendSubtitle', icon: 'calendar' },
  { id: 'ai', labelKey: 'pilgrimage.plan.preset.aiLabel', subtitleKey: 'pilgrimage.plan.preset.aiSubtitle', icon: 'sparkles' },
];

export default function PilgrimagePlanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // Seed candidates synchronously from the bundled offline index so the
  // "Featured Trip" + 「Suggested trips」 lists render on frame 1. The HTTP
  // fetch below upgrades each entry with its richer payload (litePoints,
  // canonical cover URLs) — same pattern as the pilgrimage hub.
  const [candidates, setCandidates] = useState<TripCandidate[]>(() => {
    const seeded: TripCandidate[] = [];
    for (const { bangumiId } of FEATURED_PILGRIMAGE_ANIME) {
      const entry = getIndexedById(bangumiId);
      if (!entry) continue;
      const spots = entry.pointsLength ?? 0;
      seeded.push({
        anime: {
          id: entry.id,
          cn: entry.cn,
          title: entry.title,
          city: entry.city,
          cover: entry.cover,
          color: entry.color,
          geo: [entry.lat, entry.lng],
          zoom: entry.zoom,
          modified: entry.builtAt,
          litePoints: [],
          pointsLength: entry.pointsLength,
          imagesLength: 0,
        },
        estimatedDays: Math.max(1, Math.ceil(spots / 6)),
        walkingHours: +(spots * 0.4).toFixed(1),
      });
    }
    seeded.sort((a, b) => (b.anime.pointsLength ?? 0) - (a.anime.pointsLength ?? 0));
    return seeded;
  });
  const [collectedCount, setCollectedCount] = useState(0);
  // Visited map is in MMKV — seed sync so the "X / N visited" stat is real
  // from frame 1 instead of momentarily reading 0.
  const [visited, setVisited] = useState<VisitedMap>(loadVisitedSpotsSync);
  // Only show the placeholder when the offline seed gave us nothing AND
  // the HTTP fetch hasn't returned yet — vanishingly rare in practice.
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      Promise.allSettled(
        FEATURED_PILGRIMAGE_ANIME.map(({ bangumiId }) =>
          pilgrimageRepository.getSpotsByBangumiId(bangumiId)
        )
      ),
      collectionPilgrimageService.getStats().catch(() => ({ total: 0 })),
    ])
      .then(([fetched, stats]) => {
        if (cancelled) return;
        // Merge HTTP results onto the seeded list. Anything that didn't
        // resolve keeps its index-derived entry — better than blanking the
        // row when one of ~30 requests fails.
        setCandidates((prev) => {
          const byId = new Map(prev.map((c) => [c.anime.id, c] as const));
          for (const r of fetched) {
            if (r.status !== 'fulfilled' || !r.value) continue;
            const anime = r.value;
            const spots = anime.pointsLength ?? 0;
            byId.set(anime.id, {
              anime,
              estimatedDays: Math.max(1, Math.ceil(spots / 6)),
              walkingHours: +(spots * 0.4).toFixed(1),
            });
          }
          return Array.from(byId.values()).sort(
            (a, b) => (b.anime.pointsLength ?? 0) - (a.anime.pointsLength ?? 0),
          );
        });
        setCollectedCount(stats.total ?? 0);
        setVisited(loadVisitedSpotsSync());
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const featured = candidates[0] ?? null;
  const suggested = useMemo(() => candidates.slice(1, 7), [candidates]);

  const stats = useMemo(() => {
    const visitedTotal = Object.values(visited).filter(Boolean).length;
    const totalSpots = candidates.reduce((acc, c) => acc + (c.anime.pointsLength ?? 0), 0);
    return {
      visited: visitedTotal,
      destinations: candidates.length,
      collected: collectedCount,
      totalSpots,
    };
  }, [visited, candidates, collectedCount]);

  const handleAnimePress = useCallback(
    (anime: AnitabiBangumi) => {
      Haptics.selectionAsync().catch(() => undefined);
      router.push(
        buildPilgrimageDetailRoute(anime.id, {
          returnTo: 'plan',
          title: anime.title || anime.cn,
          titleSecondary: anime.cn && anime.cn !== anime.title ? anime.cn : null,
          poster: anime.cover,
          themeColor: anime.color,
        })
      );
    },
    [router]
  );

  const handlePresetPress = useCallback(
    (presetId: string) => {
      Haptics.selectionAsync().catch(() => undefined);
      router.push({ pathname: '/pilgrimage', params: { preset: presetId } });
    },
    [router]
  );

  const handleBack = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.back();
  }, [router]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={theme.gradient} style={StyleSheet.absoluteFill} />
      <View
        style={[styles.bgGlowPrimary, { backgroundColor: `${theme.accent}1A` }]}
        pointerEvents="none"
      />
      <View
        style={[styles.bgGlowSecondary, { backgroundColor: `${theme.secondary}1A` }]}
        pointerEvents="none"
      />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={handleBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.78 }]}>
          <Ionicons name="chevron-back" size={20} color={theme.text.primary} />
        </Pressable>
        <View style={styles.headerText}>
          <ThemedText variant="titleMedium" weight="700" style={{ letterSpacing: 0.5 }}>
            {t('pilgrimage.plan.title')}
          </ThemedText>
          <ThemedText variant="captionSmall" tone="tertiary" weight="500">
            {t('pilgrimage.plan.subtitle')}
          </ThemedText>
        </View>
        <Pressable
          onPress={() => Haptics.selectionAsync().catch(() => undefined)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('pilgrimage.plan.moreOptionsA11y')}
          style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.78 }]}>
          <Ionicons name="ellipsis-horizontal" size={18} color={theme.text.primary} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 140 }]}
        showsVerticalScrollIndicator={false}>
        {loading && !featured ? (
          <Skeleton.Timeline count={5} showHeader={true} style={{ paddingHorizontal: 16 }} />
        ) : null}

        {featured ? (
          <FeaturedTripCard
            candidate={featured}
            theme={theme}
            onPress={() => handleAnimePress(featured.anime)}
          />
        ) : null}

        <View style={styles.statRow}>
          <StatTile
            icon="map"
            value={String(stats.destinations)}
            label={t('pilgrimage.plan.statDestinations')}
            tint={theme.accent}
            theme={theme}
          />
          <StatTile
            icon="bookmark"
            value={String(stats.collected)}
            label={t('pilgrimage.plan.statSaved')}
            tint={theme.secondary}
            theme={theme}
          />
          <StatTile
            icon="checkmark-circle"
            value={String(stats.visited)}
            label={t('pilgrimage.plan.statVisited')}
            tint={theme.status.success}
            theme={theme}
          />
        </View>

        <View style={styles.presetSection}>
          <View style={styles.sectionHeader}>
            <ThemedText variant="titleMedium" weight="700">
              {t('pilgrimage.plan.quickPresets')}
            </ThemedText>
            <ThemedText variant="captionSmall" tone="tertiary">
              {t('pilgrimage.plan.quickPresetsHint')}
            </ThemedText>
          </View>
          <View style={styles.presetGrid}>
            {PLAN_PRESET_DEFS.map((p) => (
              <PresetTile
                key={p.id}
                label={t(p.labelKey)}
                subtitle={t(p.subtitleKey)}
                icon={p.icon}
                theme={theme}
                onPress={() => handlePresetPress(p.id)}
              />
            ))}
          </View>
        </View>

        <BuildOwnBanner
          theme={theme}
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            router.push('/pilgrimage');
          }}
        />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={{ flex: 1 }}>
              <View style={styles.sectionTitleRow}>
                <ThemedText variant="titleMedium" weight="700">
                  {t('pilgrimage.plan.suggestedTitle')}
                </ThemedText>
                {suggested.length > 0 ? (
                  <View
                    style={[
                      styles.countBadge,
                      {
                        backgroundColor: theme.background.secondary,
                        borderColor: theme.glassBorder,
                      },
                    ]}>
                    <ThemedText variant="captionSmall" weight="700" tone="secondary">
                      {suggested.length}
                    </ThemedText>
                  </View>
                ) : null}
              </View>
              <ThemedText variant="captionSmall" tone="tertiary" style={{ marginTop: 2 }}>
                {t('pilgrimage.plan.suggestedSubtitle')}
              </ThemedText>
            </View>
            <Pressable onPress={() => router.push('/pilgrimage')} hitSlop={6}>
              <ThemedText variant="bodySmall" weight="700" style={{ color: theme.accent }}>
                {t('pilgrimage.plan.seeAll')}
              </ThemedText>
            </Pressable>
          </View>

          {suggested.length === 0 && !loading ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="explore-off" size={36} color={theme.text.tertiary} />
              <ThemedText variant="bodyMedium" weight="700" align="center" style={{ marginTop: 6 }}>
                {t('pilgrimage.plan.suggestedEmptyTitle')}
              </ThemedText>
              <ThemedText variant="captionSmall" tone="secondary" align="center">
                {t('pilgrimage.plan.suggestedEmptyBody')}
              </ThemedText>
            </View>
          ) : (
            <View style={styles.suggestedList}>
              {suggested.map((c) => (
                <SuggestedTripRow
                  key={`sugg-${c.anime.id}`}
                  candidate={c}
                  theme={theme}
                  onPress={() => handleAnimePress(c.anime)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

interface FeaturedTripCardProps {
  candidate: TripCandidate;
  theme: ThemePalette;
  onPress: () => void;
}

function FeaturedTripCard({ candidate, theme, onPress }: FeaturedTripCardProps) {
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { anime, estimatedDays, walkingHours } = candidate;
  const tint = cityToColor(anime.city, anime.color || theme.accent);
  const tintFg = readableTextOn(tint);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('pilgrimage.plan.featuredTripA11y', { title: anime.title })}
      style={({ pressed }) => [styles.featuredCard, pressed && { opacity: 0.92 }]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background.secondary }]} />
      {anime.cover ? (
        <Image
          // Anitabi CDN serves bangumi covers only at h160/h360/full — h720 404s.
          source={{ uri: anime.cover.replace('?plan=h160', '?plan=h360') }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={300}
        />
      ) : null}
      <LinearGradient
        colors={['rgba(8,8,8,0)', `${theme.background.primary}C4`, `${theme.background.primary}F2`]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.featuredContent}>
        <View
          style={[
            styles.featuredBadge,
            { backgroundColor: `${theme.accent}28`, borderColor: `${theme.accent}A6` },
          ]}>
          <Ionicons name="star" size={10} color={theme.accent} />
          <ThemedText
            variant="captionSmall"
            weight="700"
            style={{ color: theme.accent, letterSpacing: 0.6 }}>
            {t('pilgrimage.plan.featuredBadge')}
          </ThemedText>
        </View>
        <ThemedText variant="bodySmall" tone="secondary" weight="600" numberOfLines={1}>
          {anime.city || t('pilgrimage.plan.featuredDestinationFallback')}
          {anime.cn ? ` · ${anime.cn}` : ''}
        </ThemedText>
        <ThemedText
          variant="headlineMedium"
          weight="800"
          numberOfLines={2}
          style={{ marginTop: 2 }}>
          {t('pilgrimage.plan.featuredTitleLine', {
            title: anime.title || t('pilgrimage.plan.untitled'),
            days: estimatedDays,
          })}
        </ThemedText>
        <View style={styles.featuredMetaRow}>
          <View style={styles.featuredChip}>
            <Ionicons name="calendar" size={11} color={theme.text.primary} />
            <ThemedText variant="captionSmall" weight="600">
              {t('pilgrimage.plan.daysShort', { count: estimatedDays })}
            </ThemedText>
          </View>
          <View style={styles.featuredChip}>
            <Ionicons name="location" size={11} color={theme.text.primary} />
            <ThemedText variant="captionSmall" weight="600">
              {t('pilgrimage.plan.spotsShort', { count: anime.pointsLength ?? 0 })}
            </ThemedText>
          </View>
          <View style={styles.featuredChip}>
            <Ionicons name="walk" size={11} color={theme.text.primary} />
            <ThemedText variant="captionSmall" weight="600">
              {t('pilgrimage.plan.walkHoursShort', { hours: walkingHours })}
            </ThemedText>
          </View>
        </View>
        <View style={styles.featuredActions}>
          <Pressable
            onPress={onPress}
            style={({ pressed }) => [
              styles.featuredCta,
              { backgroundColor: tint },
              pressed && { opacity: 0.85 },
            ]}>
            <ThemedText variant="bodySmall" weight="700" style={{ color: tintFg }}>
              {t('common.continue')}
            </ThemedText>
            <Ionicons name="arrow-forward" size={14} color={tintFg} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

interface StatTileProps {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  tint: string;
  theme: ThemePalette;
}

function StatTile({ icon, value, label, tint, theme }: StatTileProps) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.statTile}>
      <View style={[styles.statIcon, { backgroundColor: `${tint}22`, borderColor: `${tint}55` }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <ThemedText variant="titleLarge" weight="800">
        {value}
      </ThemedText>
      <ThemedText variant="captionSmall" tone="tertiary" weight="600">
        {label}
      </ThemedText>
    </View>
  );
}

interface PresetTileProps {
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  theme: ThemePalette;
  onPress: () => void;
}

function PresetTile({ label, subtitle, icon, theme, onPress }: PresetTileProps) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.presetTile, pressed && { opacity: 0.85 }]}>
      <View
        style={[
          styles.presetIcon,
          { backgroundColor: `${theme.accent}22`, borderColor: `${theme.accent}66` },
        ]}>
        <Ionicons name={icon} size={18} color={theme.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <ThemedText variant="bodySmall" weight="700">
          {label}
        </ThemedText>
        <ThemedText
          variant="captionSmall"
          tone="tertiary"
          weight="500"
          numberOfLines={1}
          style={{ marginTop: 1 }}>
          {subtitle}
        </ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={14} color={theme.text.tertiary} />
    </Pressable>
  );
}

function BuildOwnBanner({ theme, onPress }: { theme: ThemePalette; onPress: () => void }) {
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // Use the theme's signature accent + secondary as the banner gradient so it
  // refreshes per theme switch instead of staying purple.
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('pilgrimage.plan.buildOwnA11y')}
      style={({ pressed }) => [styles.buildBanner, pressed && { opacity: 0.92 }]}>
      <LinearGradient
        colors={[theme.accentDark, theme.accent, theme.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.buildIconRing}>
        <Ionicons name="sparkles" size={18} color="#FFF" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <ThemedText variant="bodyMedium" weight="800" style={{ color: '#FFF' }}>
          {t('pilgrimage.plan.buildOwnTitle')}
        </ThemedText>
        <ThemedText
          variant="captionSmall"
          numberOfLines={2}
          style={{ color: 'rgba(255,255,255,0.78)', marginTop: 3 }}>
          {t('pilgrimage.plan.buildOwnBody')}
        </ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#FFF" />
    </Pressable>
  );
}

interface SuggestedTripRowProps {
  candidate: TripCandidate;
  theme: ThemePalette;
  onPress: () => void;
}

function SuggestedTripRow({ candidate, theme, onPress }: SuggestedTripRowProps) {
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { anime, estimatedDays, walkingHours } = candidate;
  const tint = cityToColor(anime.city, anime.color || theme.accent);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={anime.title}
      style={({ pressed }) => [
        styles.suggestedCard,
        { borderLeftColor: tint },
        pressed && { opacity: 0.85 },
      ]}>
      {anime.cover ? (
        <Image
          source={{ uri: anime.cover.replace('?plan=h160', '?plan=h360') }}
          style={styles.suggestedThumb}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[styles.suggestedThumb, { backgroundColor: theme.background.secondary }]} />
      )}
      <View style={styles.suggestedBody}>
        <View style={styles.suggestedCityRow}>
          <View style={[styles.suggestedCityDot, { backgroundColor: tint }]} />
          <ThemedText
            variant="captionSmall"
            tone="secondary"
            weight="700"
            style={{ letterSpacing: 0.3, textTransform: 'uppercase' }}>
            {anime.city || t('pilgrimage.plan.multipleAreas')}
          </ThemedText>
        </View>
        <ThemedText variant="bodyMedium" weight="700" numberOfLines={1}>
          {anime.title}
        </ThemedText>
        <View style={styles.suggestedMetaRow}>
          <ThemedText variant="captionSmall" tone="tertiary" weight="600">
            {t('pilgrimage.plan.daysSuffix', { count: estimatedDays })}
          </ThemedText>
          <ThemedText variant="captionSmall" tone="tertiary">
            ·
          </ThemedText>
          <ThemedText variant="captionSmall" tone="tertiary" weight="600">
            {t('pilgrimage.plan.spotsShort', { count: anime.pointsLength ?? 0 })}
          </ThemedText>
          <ThemedText variant="captionSmall" tone="tertiary">
            ·
          </ThemedText>
          <ThemedText variant="captionSmall" tone="tertiary" weight="600">
            {t('pilgrimage.plan.walkHoursLong', { hours: walkingHours })}
          </ThemedText>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.text.tertiary} />
    </Pressable>
  );
}

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background.primary,
    },
    bgGlowPrimary: {
      position: 'absolute',
      top: 220,
      right: -90,
      width: 360,
      height: 360,
      borderRadius: 180,
      opacity: 0.7,
    },
    bgGlowSecondary: {
      position: 'absolute',
      bottom: 80,
      left: -80,
      width: 320,
      height: 320,
      borderRadius: 160,
      opacity: 0.5,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.screenPadding,
      paddingBottom: Spacing.sm,
    },
    headerBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${theme.background.secondary}CC`,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    headerText: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
    },
    scrollContent: {
      paddingTop: Spacing.sm,
      gap: Spacing.md,
    },
    featuredCard: {
      marginHorizontal: Spacing.screenPadding,
      height: 270,
      borderRadius: Radius.xl,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.secondary,
      justifyContent: 'flex-end',
    },
    featuredContent: {
      padding: 16,
      gap: 6,
    },
    featuredBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      borderWidth: 1,
    },
    featuredMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 2,
    },
    featuredChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: 'rgba(255,255,255,0.10)',
    },
    featuredActions: {
      flexDirection: 'row',
      marginTop: 8,
    },
    featuredCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 18,
    },
    statRow: {
      flexDirection: 'row',
      paddingHorizontal: Spacing.screenPadding,
      gap: 10,
    },
    statTile: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.secondary,
      gap: 4,
    },
    statIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    presetSection: {
      paddingHorizontal: Spacing.screenPadding,
      gap: Spacing.sm,
    },
    presetGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    presetTile: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.secondary,
      flexBasis: '47%',
      flexGrow: 1,
      minHeight: 64,
    },
    presetIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    buildBanner: {
      marginHorizontal: Spacing.screenPadding,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderRadius: Radius.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.08)',
    },
    buildIconRing: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    section: {
      paddingHorizontal: Spacing.screenPadding,
      gap: Spacing.sm,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 8,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    countBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      borderWidth: 1,
    },
    emptyCard: {
      paddingVertical: Spacing.xl,
      paddingHorizontal: Spacing.lg,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.secondary,
      alignItems: 'center',
      gap: 6,
    },
    suggestedList: {
      gap: 10,
    },
    suggestedCard: {
      flexDirection: 'row',
      gap: 12,
      padding: 10,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.secondary,
      borderLeftWidth: 3,
      alignItems: 'center',
    },
    suggestedThumb: {
      width: 56,
      height: 76,
      borderRadius: 10,
    },
    suggestedBody: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    suggestedCityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    suggestedCityDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    suggestedMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      flexWrap: 'wrap',
    },
  });
}
