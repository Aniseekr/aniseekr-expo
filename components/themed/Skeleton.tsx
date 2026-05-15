// Theme-aware skeleton screens. Compose preset variants — one per page archetype —
// out of ShimmerEffect blocks. Layouts (paddings, sizes, gaps) intentionally mirror
// the real rendered content so the swap from skeleton -> data avoids layout shift.
//
// Perf notes:
// - Skeletons are transient (mount → swap to data within ~ms-to-seconds). We
//   deliberately render them as plain Views, not ScrollViews — the user never
//   has time to scroll them and a ScrollView's native setup cost is non-trivial.
// - All shimmer animation cost is shared globally (see ShimmerEffect.tsx), so
//   raising the visible count here is cheap. The bigger cost is the View tree
//   depth, which is why each preset stays flat.

import { memo } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { ShimmerEffect } from '../common/ShimmerEffect';

type CountProps = { count?: number; style?: ViewStyle };

function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

function Col({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.col, style]}>{children}</View>;
}

// ---------- Anime card list (vertical, list of poster + 2-3 lines) ----------

export interface SkeletonAnimeCardListProps extends CountProps {
  horizontal?: boolean;
  paddingHorizontal?: number;
}

function AnimeCardListBase({
  count = 6,
  horizontal = false,
  paddingHorizontal,
  style,
}: SkeletonAnimeCardListProps) {
  // Cap mounted nodes — anything past what fits on a phone screen is wasted
  // shimmer cost on a placeholder the user can't reach (skeletons are
  // non-scrollable; see file header).
  const visibleCount = Math.min(count, horizontal ? 3 : 6);
  const items = Array.from({ length: visibleCount });
  if (horizontal) {
    return (
      <View
        style={[
          styles.hRow,
          paddingHorizontal != null ? { paddingHorizontal } : null,
          style,
        ]}>
        {items.map((_, i) => (
          <Col key={i} style={styles.hCard}>
            <ShimmerEffect width={140} height={186} borderRadius={Radius.md} />
            <ShimmerEffect width={120} height={14} style={{ marginTop: Spacing.xs }} />
            <ShimmerEffect width={80} height={11} style={{ marginTop: 6 }} />
          </Col>
        ))}
      </View>
    );
  }
  return (
    <View style={[styles.list, paddingHorizontal != null ? { paddingHorizontal } : null, style]}>
      {items.map((_, i) => (
        <Row key={i} style={styles.cardRow}>
          <ShimmerEffect width={64} height={88} borderRadius={Radius.md} />
          <Col style={styles.cardBody}>
            <ShimmerEffect width="78%" height={16} />
            <ShimmerEffect width="48%" height={12} style={{ marginTop: 8 }} />
            <ShimmerEffect width="32%" height={12} style={{ marginTop: 6 }} />
          </Col>
        </Row>
      ))}
    </View>
  );
}
export const SkeletonAnimeCardList = memo(AnimeCardListBase);

// ---------- Poster grid (square-ish posters in N columns) ----------

export interface SkeletonPosterGridProps extends CountProps {
  columns?: number;
  aspectRatio?: number; // height / width; default 1.4 ~ 2:3 poster
  gap?: number;
}

function PosterGridBase({
  count = 9,
  columns = 3,
  aspectRatio = 1.4,
  gap = Spacing.sm,
  style,
}: SkeletonPosterGridProps) {
  const items = Array.from({ length: count });
  return (
    <View style={[styles.grid, { gap }, style]}>
      {items.map((_, i) => (
        <View
          key={i}
          style={{
            width: `${100 / columns - 2}%`,
            aspectRatio: 1 / aspectRatio,
          }}>
          <ShimmerEffect width="100%" height="100%" borderRadius={Radius.md} />
          <ShimmerEffect width="70%" height={11} style={{ marginTop: 8 }} />
        </View>
      ))}
    </View>
  );
}
export const SkeletonPosterGrid = memo(PosterGridBase);

// ---------- Hero detail (banner + meta + paragraphs) — anime/[id], pilgrimage/[animeId] ----------

export interface SkeletonHeroDetailProps {
  showEpisodes?: boolean;
  style?: ViewStyle;
}

function HeroDetailBase({ showEpisodes = true, style }: SkeletonHeroDetailProps) {
  return (
    <View style={[styles.hero, style]}>
      <ShimmerEffect width="100%" height={260} borderRadius={0} intensity="low" />
      <View style={styles.heroBody}>
        <ShimmerEffect width="70%" height={24} />
        <ShimmerEffect width="50%" height={14} style={{ marginTop: 10 }} />
        <Row style={{ marginTop: Spacing.md, gap: Spacing.xs }}>
          <ShimmerEffect width={64} height={22} borderRadius={11} />
          <ShimmerEffect width={56} height={22} borderRadius={11} />
          <ShimmerEffect width={72} height={22} borderRadius={11} />
        </Row>
        <View style={{ marginTop: Spacing.lg, gap: 8 }}>
          <ShimmerEffect width="100%" height={12} />
          <ShimmerEffect width="96%" height={12} />
          <ShimmerEffect width="88%" height={12} />
          <ShimmerEffect width="40%" height={12} />
        </View>
        {showEpisodes ? (
          <View style={{ marginTop: Spacing.xl }}>
            <ShimmerEffect width={120} height={14} />
            <Row style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <View key={i}>
                  <ShimmerEffect width={140} height={84} borderRadius={Radius.md} />
                  <ShimmerEffect width={100} height={11} style={{ marginTop: 6 }} />
                </View>
              ))}
            </Row>
          </View>
        ) : null}
      </View>
    </View>
  );
}
export const SkeletonHeroDetail = memo(HeroDetailBase);

// ---------- Stats dashboard (badge + hero card + chart + grid) ----------

export interface SkeletonStatsDashboardProps {
  style?: ViewStyle;
}

function StatsDashboardBase({ style }: SkeletonStatsDashboardProps) {
  const { theme } = useTheme();
  return (
    <View style={[styles.statsWrap, style]}>
      <ShimmerEffect width={160} height={12} />
      <View
        style={[
          styles.statsHero,
          { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
        ]}>
        <ShimmerEffect width="60%" height={18} />
        <Row style={{ marginTop: Spacing.md, gap: Spacing.lg }}>
          <Col style={{ flex: 1 }}>
            <ShimmerEffect width={56} height={28} />
            <ShimmerEffect width={40} height={11} style={{ marginTop: 6 }} />
          </Col>
          <Col style={{ flex: 1 }}>
            <ShimmerEffect width={56} height={28} />
            <ShimmerEffect width={40} height={11} style={{ marginTop: 6 }} />
          </Col>
          <Col style={{ flex: 1 }}>
            <ShimmerEffect width={56} height={28} />
            <ShimmerEffect width={40} height={11} style={{ marginTop: 6 }} />
          </Col>
        </Row>
      </View>
      <View
        style={[
          styles.statsBlock,
          { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
        ]}>
        <ShimmerEffect width={140} height={14} />
        <ShimmerEffect width="100%" height={160} borderRadius={Radius.md} style={{ marginTop: Spacing.md }} />
      </View>
      <View
        style={[
          styles.statsBlock,
          { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
        ]}>
        <ShimmerEffect width={140} height={14} />
        <Row style={{ marginTop: Spacing.md, gap: Spacing.sm, flexWrap: 'wrap' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <ShimmerEffect key={i} width={88} height={88} borderRadius={Radius.md} />
          ))}
        </Row>
      </View>
    </View>
  );
}
export const SkeletonStatsDashboard = memo(StatsDashboardBase);

// ---------- Rating card (single swipe card placeholder) — (rate)/rating ----------

function SkeletonRatingCardBase({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.ratingCard, style]}>
      <ShimmerEffect width="100%" height="100%" borderRadius={Radius.xl} intensity="low" style={styles.ratingPoster} />
      <View style={styles.ratingMeta}>
        <ShimmerEffect width="70%" height={20} />
        <ShimmerEffect width="45%" height={13} style={{ marginTop: 8 }} />
        <ShimmerEffect width="55%" height={11} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}
export const SkeletonRatingCard = memo(SkeletonRatingCardBase);

// ---------- List row (avatar/rank + two lines) — hall-of-fame, persona, profile platforms ----------

export interface SkeletonListRowProps extends CountProps {
  avatarSize?: number;
  avatarShape?: 'circle' | 'square';
}

function ListRowBase({ count = 6, avatarSize = 44, avatarShape = 'circle', style }: SkeletonListRowProps) {
  const items = Array.from({ length: count });
  return (
    <View style={[styles.list, style]}>
      {items.map((_, i) => (
        <Row key={i} style={styles.rowItem}>
          <ShimmerEffect
            width={avatarSize}
            height={avatarSize}
            borderRadius={avatarShape === 'circle' ? avatarSize / 2 : Radius.sm}
          />
          <Col style={styles.rowItemBody}>
            <ShimmerEffect width="60%" height={14} />
            <ShimmerEffect width="40%" height={11} style={{ marginTop: 6 }} />
          </Col>
          <ShimmerEffect width={48} height={20} borderRadius={10} />
        </Row>
      ))}
    </View>
  );
}
export const SkeletonListRow = memo(ListRowBase);

// ---------- Map list (map placeholder + list) ----------

export interface SkeletonMapListProps {
  mapHeight?: number;
  listCount?: number;
  style?: ViewStyle;
}

function MapListBase({ mapHeight = 320, listCount = 5, style }: SkeletonMapListProps) {
  return (
    <View style={[styles.mapWrap, style]}>
      <ShimmerEffect width="100%" height={mapHeight} borderRadius={Radius.lg} intensity="low" />
      <View style={{ marginTop: Spacing.md }}>
        {Array.from({ length: listCount }).map((_, i) => (
          <Row key={i} style={styles.cardRow}>
            <ShimmerEffect width={48} height={48} borderRadius={Radius.md} />
            <Col style={styles.cardBody}>
              <ShimmerEffect width="70%" height={14} />
              <ShimmerEffect width="40%" height={11} style={{ marginTop: 6 }} />
            </Col>
          </Row>
        ))}
      </View>
    </View>
  );
}
export const SkeletonMapList = memo(MapListBase);

// ---------- Timeline / plan (vertical step list) ----------

export interface SkeletonTimelineProps extends CountProps {
  showHeader?: boolean;
}

function TimelineBase({ count = 5, showHeader = true, style }: SkeletonTimelineProps) {
  return (
    <View style={[styles.timeline, style]}>
      {showHeader ? (
        <View style={{ marginBottom: Spacing.lg }}>
          <ShimmerEffect width="60%" height={20} />
          <ShimmerEffect width="40%" height={12} style={{ marginTop: 8 }} />
        </View>
      ) : null}
      {Array.from({ length: count }).map((_, i) => (
        <Row key={i} style={styles.step}>
          <Col style={styles.stepRail}>
            <ShimmerEffect width={12} height={12} borderRadius={6} />
            {i < count - 1 ? <View style={styles.stepConnector} /> : null}
          </Col>
          <Col style={styles.stepBody}>
            <ShimmerEffect width="55%" height={14} />
            <ShimmerEffect width="80%" height={12} style={{ marginTop: 8 }} />
            <ShimmerEffect width="60%" height={12} style={{ marginTop: 6 }} />
          </Col>
        </Row>
      ))}
    </View>
  );
}
export const SkeletonTimeline = memo(TimelineBase);

// ---------- Profile card (single card: avatar ring + name + currency pill) ----------
// Mirrors the profileCard block in app/(tabs)/profile.tsx so the swap to data
// has no layout shift. Stats row, premium CTA, shortcuts and settings row are
// rendered alongside their own data and do not need a skeleton here.

export interface SkeletonProfileProps {
  style?: ViewStyle;
}

function ProfileBase({ style }: SkeletonProfileProps) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.profileCard,
        { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
        style,
      ]}>
      <ShimmerEffect width={72} height={72} borderRadius={36} />
      <ShimmerEffect width={140} height={22} style={{ marginTop: Spacing.sm + 2 }} />
      <ShimmerEffect
        width={180}
        height={36}
        borderRadius={Radius.full}
        style={{ marginTop: Spacing.sm + 2 }}
      />
    </View>
  );
}
export const SkeletonProfile = memo(ProfileBase);

// ---------- Namespace export ----------

export const Skeleton = {
  Block: ShimmerEffect,
  AnimeCardList: SkeletonAnimeCardList,
  PosterGrid: SkeletonPosterGrid,
  HeroDetail: SkeletonHeroDetail,
  StatsDashboard: SkeletonStatsDashboard,
  RatingCard: SkeletonRatingCard,
  ListRow: SkeletonListRow,
  MapList: SkeletonMapList,
  Timeline: SkeletonTimeline,
  Profile: SkeletonProfile,
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  col: { flexDirection: 'column' },
  list: { gap: Spacing.md },
  cardRow: { gap: Spacing.md, paddingVertical: Spacing.xs },
  cardBody: { flex: 1, justifyContent: 'center' },
  hRow: { flexDirection: 'row', gap: Spacing.md, paddingVertical: Spacing.xs, overflow: 'hidden' },
  hCard: { width: 140 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  hero: {},
  heroBody: { padding: Spacing.lg },
  statsWrap: { padding: Spacing.lg, gap: Spacing.lg },
  statsHero: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  statsBlock: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  rowItem: { gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  rowItemBody: { flex: 1 },
  mapWrap: { padding: Spacing.md },
  timeline: { padding: Spacing.lg },
  step: { alignItems: 'flex-start', gap: Spacing.md },
  stepRail: { alignItems: 'center', width: 12, paddingTop: 4 },
  stepConnector: {
    width: 2,
    flex: 1,
    minHeight: 36,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 4,
  },
  stepBody: { flex: 1, paddingBottom: Spacing.lg },
  profileCard: {
    alignItems: 'center',
    padding: Spacing.xl,
    borderRadius: Radius.card,
    borderWidth: 1,
  },
  ratingCard: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
  },
  ratingPoster: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  ratingMeta: {
    padding: Spacing.lg,
  },
});
