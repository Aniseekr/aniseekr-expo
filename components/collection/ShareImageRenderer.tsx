import { useMemo, type Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontFamily, Typography } from '../../constants/DesignSystem';
import type {
  ShareEntry,
  ShareTemplateBuild,
} from '../../libs/services/collection/share-templates';

const POSTER_WIDTH = 1080;
const POSTER_HEIGHT = 1920;

interface ShareImageRendererProps {
  build: ShareTemplateBuild;
  ref?: Ref<View>;
}

function PosterFooter() {
  return (
    <View style={styles.footer} pointerEvents="none">
      <Text style={styles.footerText}>Made with Aniseekr</Text>
    </View>
  );
}

function HeaderBlock({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.header} pointerEvents="none">
      <Text style={styles.headerTitle}>{title}</Text>
      {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function Cover({ uri, style }: { uri?: string; style?: any }) {
  if (!uri) {
    return (
      <View style={[style, styles.coverFallback]}>
        <Text style={styles.coverFallbackText}>?</Text>
      </View>
    );
  }
  return <Image source={{ uri }} style={style} contentFit="cover" />;
}

function Top10Body({ entries, username }: { entries: ShareEntry[]; username?: string }) {
  return (
    <>
      <HeaderBlock title="My Top 10 Anime" subtitle={username ? `by ${username}` : undefined} />
      <View style={styles.top10List}>
        {entries.slice(0, 10).map((entry, idx) => (
          <View key={`${entry.animeId}-${idx}`} style={styles.top10Row}>
            <View style={styles.rankBadge}>
              <Text style={styles.rankBadgeText}>{idx + 1}</Text>
            </View>
            <Cover uri={entry.coverUrl} style={styles.top10Cover} />
            <View style={styles.top10Meta}>
              <Text style={styles.top10Title} numberOfLines={2}>
                {entry.title}
              </Text>
              {entry.year ? <Text style={styles.top10Year}>{entry.year}</Text> : null}
            </View>
            {typeof entry.score === 'number' ? (
              <View style={styles.scoreBadge}>
                <Text style={styles.scoreBadgeText}>{(entry.score / 10).toFixed(1)}</Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </>
  );
}

function YearlyBestBody({
  entries,
  username,
  year,
}: {
  entries: ShareEntry[];
  username?: string;
  year?: number;
}) {
  const grouped = useMemo(() => {
    const map = new Map<number, ShareEntry[]>();
    entries.forEach((e) => {
      if (typeof e.year !== 'number') return;
      const list = map.get(e.year) ?? [];
      list.push(e);
      map.set(e.year, list);
    });
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [entries]);

  return (
    <>
      <HeaderBlock
        title="Yearly Best"
        subtitle={username ? `by ${username}` : year ? `${year}` : undefined}
      />
      <View style={styles.yearlyGrid}>
        {grouped.slice(0, 4).map(([yr, items]) => (
          <View key={yr} style={styles.yearlyCard}>
            <Text style={styles.yearlyYear}>{yr}</Text>
            <View style={styles.yearlyCovers}>
              {items.slice(0, 3).map((entry, idx) => (
                <Cover
                  key={`${entry.animeId}-${idx}`}
                  uri={entry.coverUrl}
                  style={styles.yearlyCover}
                />
              ))}
            </View>
            <View style={styles.yearlyTitles}>
              {items.slice(0, 3).map((entry, idx) => (
                <Text
                  key={`${entry.animeId}-t-${idx}`}
                  style={styles.yearlyTitle}
                  numberOfLines={1}>
                  {idx + 1}. {entry.title}
                </Text>
              ))}
            </View>
          </View>
        ))}
      </View>
    </>
  );
}

function StarterPackBody({ entries, username }: { entries: ShareEntry[]; username?: string }) {
  return (
    <>
      <HeaderBlock
        title="Starter Pack"
        subtitle={username ? `curated by ${username}` : 'If you are new, watch these'}
      />
      <View style={styles.starterGrid}>
        {entries.slice(0, 6).map((entry, idx) => (
          <View key={`${entry.animeId}-${idx}`} style={styles.starterCell}>
            <Cover uri={entry.coverUrl} style={styles.starterCover} />
            <Text style={styles.starterTitle} numberOfLines={2}>
              {entry.title}
            </Text>
            {entry.tag ? <Text style={styles.starterTag}>{entry.tag}</Text> : null}
          </View>
        ))}
      </View>
    </>
  );
}

function MasterpieceBody({ entries, username }: { entries: ShareEntry[]; username?: string }) {
  const hero = entries[0];
  if (!hero) {
    return (
      <View style={styles.masterpieceEmpty} pointerEvents="none">
        <Text style={styles.masterpieceEmptyText}>Pick a masterpiece</Text>
      </View>
    );
  }

  return (
    <>
      <HeaderBlock
        title="Masterpiece"
        subtitle={username ? `chosen by ${username}` : 'must-watch'}
      />
      <View style={styles.masterpieceWrap}>
        <View style={styles.masterpieceCoverFrame}>
          <Cover uri={hero.coverUrl} style={styles.masterpieceCover} />
          <View style={styles.masterpieceStamp}>
            <Text style={styles.masterpieceStampText}>MUST{'\n'}WATCH</Text>
          </View>
        </View>
        <Text style={styles.masterpieceTitle} numberOfLines={3}>
          {hero.title}
        </Text>
        <View style={styles.masterpieceMetaRow}>
          {hero.year ? <Text style={styles.masterpieceMetaText}>{hero.year}</Text> : null}
          {typeof hero.score === 'number' ? (
            <View style={styles.masterpieceScoreBadge}>
              <Text style={styles.masterpieceScoreText}>★ {(hero.score / 10).toFixed(1)}</Text>
            </View>
          ) : null}
        </View>
        {hero.synopsis ? (
          <Text style={styles.masterpieceSynopsis} numberOfLines={6}>
            {hero.synopsis}
          </Text>
        ) : null}
      </View>
    </>
  );
}

export function ShareImageRenderer({ build, ref }: ShareImageRendererProps) {
  const { template, entries, meta } = build;
  const useAurora = template.id === 'masterpiece' || template.id === 'yearly_best';

  return (
    <View ref={ref} collapsable={false} style={styles.poster}>
      <LinearGradient
        colors={
          useAurora
            ? (Colors.gradients.aurora as [string, string, ...string[]])
            : (Colors.gradients.background as [string, string, ...string[]])
        }
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glow} pointerEvents="none" />
      <View style={styles.posterContent}>
        {template.id === 'top10' ? <Top10Body entries={entries} username={meta?.username} /> : null}
        {template.id === 'yearly_best' ? (
          <YearlyBestBody entries={entries} username={meta?.username} year={meta?.year} />
        ) : null}
        {template.id === 'starter_pack' ? (
          <StarterPackBody entries={entries} username={meta?.username} />
        ) : null}
        {template.id === 'masterpiece' ? (
          <MasterpieceBody entries={entries} username={meta?.username} />
        ) : null}
      </View>
      <PosterFooter />
    </View>
  );
}

const styles = StyleSheet.create({
  poster: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    overflow: 'hidden',
    backgroundColor: '#0F0F10',
  },
  glow: {
    position: 'absolute',
    top: -200,
    right: -160,
    width: 720,
    height: 720,
    borderRadius: 360,
    backgroundColor: 'rgba(255,159,10,0.18)',
  },
  posterContent: {
    flex: 1,
    paddingHorizontal: 80,
    paddingTop: 120,
    paddingBottom: 200,
  },
  header: {
    marginBottom: 56,
  },
  headerTitle: {
    color: Colors.text.primary,
    fontSize: 96,
    fontWeight: '800',
    fontFamily: FontFamily.rounded,
    letterSpacing: 0.6,
  },
  headerSubtitle: {
    color: Colors.text.secondary,
    fontSize: 36,
    fontWeight: '600',
    fontFamily: FontFamily.text,
    marginTop: 16,
  },
  footer: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  footerText: {
    color: Colors.text.secondary,
    fontSize: 28,
    fontWeight: '600',
    fontFamily: FontFamily.rounded,
    letterSpacing: 0.5,
  },
  top10List: {
    gap: 22,
  },
  top10Row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 28,
    paddingVertical: 18,
    paddingHorizontal: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  rankBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    color: '#0E0A06',
    fontSize: 32,
    fontWeight: '800',
    fontFamily: FontFamily.rounded,
  },
  top10Cover: {
    width: 80,
    height: 120,
    borderRadius: 12,
    backgroundColor: '#222',
  },
  top10Meta: {
    flex: 1,
  },
  top10Title: {
    color: Colors.text.primary,
    fontSize: 32,
    fontWeight: '700',
    fontFamily: FontFamily.text,
  },
  top10Year: {
    color: Colors.text.secondary,
    fontSize: 24,
    marginTop: 6,
    fontFamily: FontFamily.text,
  },
  scoreBadge: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,159,10,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,159,10,0.4)',
  },
  scoreBadgeText: {
    color: Colors.primary,
    fontSize: 30,
    fontWeight: '800',
    fontFamily: FontFamily.rounded,
  },
  yearlyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 28,
    justifyContent: 'space-between',
  },
  yearlyCard: {
    width: '47%',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 32,
    padding: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  yearlyYear: {
    color: Colors.text.primary,
    fontSize: 56,
    fontWeight: '800',
    fontFamily: FontFamily.rounded,
    marginBottom: 18,
  },
  yearlyCovers: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  yearlyCover: {
    flex: 1,
    aspectRatio: 2 / 3,
    borderRadius: 14,
    backgroundColor: '#222',
  },
  yearlyTitles: {
    gap: 8,
  },
  yearlyTitle: {
    color: Colors.text.primary,
    fontSize: 22,
    fontWeight: '600',
    fontFamily: FontFamily.text,
  },
  starterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 36,
  },
  starterCell: {
    width: '31%',
  },
  starterCover: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: 18,
    backgroundColor: '#222',
  },
  starterTitle: {
    color: Colors.text.primary,
    fontSize: 26,
    fontWeight: '700',
    fontFamily: FontFamily.text,
    marginTop: 14,
  },
  starterTag: {
    color: Colors.primary,
    fontSize: 22,
    fontWeight: '600',
    fontFamily: FontFamily.text,
    marginTop: 6,
  },
  masterpieceWrap: {
    alignItems: 'center',
  },
  masterpieceCoverFrame: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: 32,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 40,
    backgroundColor: '#222',
  },
  masterpieceCover: {
    width: '100%',
    height: '100%',
  },
  masterpieceStamp: {
    position: 'absolute',
    top: 36,
    right: 36,
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 6,
    borderColor: '#FF453A',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-12deg' }],
    backgroundColor: 'rgba(255,69,58,0.15)',
  },
  masterpieceStampText: {
    color: '#FF453A',
    fontSize: 32,
    fontWeight: '900',
    fontFamily: FontFamily.rounded,
    textAlign: 'center',
    lineHeight: 36,
  },
  masterpieceTitle: {
    color: Colors.text.primary,
    ...Typography.displayLarge,
    fontSize: 64,
    lineHeight: 72,
    fontWeight: '800',
    textAlign: 'center',
  },
  masterpieceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    marginTop: 24,
  },
  masterpieceMetaText: {
    color: Colors.text.secondary,
    fontSize: 32,
    fontWeight: '600',
    fontFamily: FontFamily.text,
  },
  masterpieceScoreBadge: {
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(255,159,10,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,159,10,0.4)',
  },
  masterpieceScoreText: {
    color: Colors.primary,
    fontSize: 30,
    fontWeight: '800',
    fontFamily: FontFamily.rounded,
  },
  masterpieceSynopsis: {
    color: Colors.text.primary,
    fontSize: 28,
    lineHeight: 38,
    fontFamily: FontFamily.text,
    textAlign: 'center',
    marginTop: 28,
    paddingHorizontal: 24,
  },
  masterpieceEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  masterpieceEmptyText: {
    color: Colors.text.secondary,
    fontSize: 36,
    fontFamily: FontFamily.rounded,
  },
  coverFallback: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverFallbackText: {
    color: Colors.text.tertiary,
    fontSize: 36,
    fontFamily: FontFamily.rounded,
  },
});
