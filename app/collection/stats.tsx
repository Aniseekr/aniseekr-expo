import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import { collectionService } from '../../libs/services/collection/collection-service';
import { CollectionFolder } from '../../types';
import { Colors, Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { ShimmerEffect } from '../../components/common/ShimmerEffect';
import { ErrorStateView } from '../../components/common/ErrorStateView';
import { EmptyStateView } from '../../components/common/EmptyStateView';
import { GlassCard } from '../../components/common/GlassCard';

interface StatTile {
  label: string;
  value: number;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  color: string;
}

export default function CollectionStatsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [folders, setFolders] = useState<CollectionFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await collectionService.getFolders();
      setFolders(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const total = folders.reduce((acc, f) => acc + (f.animeCount || 0), 0);
    const find = (name: string) => folders.find((f) => f.name === name)?.animeCount ?? 0;

    return {
      total,
      watching: find('Watching'),
      completed: find('Completed'),
      wishlist: find('Plan to Watch'),
      favorites: find('Favorites'),
      dropped: find('Dropped'),
      customFolders: folders.filter((f) => !f.isSystemFolder).length,
    };
  }, [folders]);

  const tiles: StatTile[] = [
    { label: 'Total', value: stats.total, icon: 'collections-bookmark', color: theme.accent },
    { label: 'Watching', value: stats.watching, icon: 'play-circle-filled', color: '#30D158' },
    { label: 'Completed', value: stats.completed, icon: 'check-circle', color: '#0A84FF' },
    { label: 'Wishlist', value: stats.wishlist, icon: 'bookmark', color: '#5E5CE6' },
    { label: 'Favorites', value: stats.favorites, icon: 'favorite', color: '#FF453A' },
    { label: 'Dropped', value: stats.dropped, icon: 'cancel', color: '#FF9F0A' },
  ];

  const completionRatio = stats.total > 0 ? Math.min(1, stats.completed / stats.total) : 0;
  const watchingRatio = stats.total > 0 ? Math.min(1, stats.watching / stats.total) : 0;

  const statusPieData = useMemo(() => {
    const slices = [
      { label: 'Watching', value: stats.watching, color: Colors.success },
      { label: 'Completed', value: stats.completed, color: Colors.info },
      { label: 'Wishlist', value: stats.wishlist, color: Colors.secondary },
      { label: 'Favorites', value: stats.favorites, color: Colors.error },
      { label: 'Dropped', value: stats.dropped, color: Colors.warning },
    ];
    return slices.filter((s) => s.value > 0);
  }, [stats]);

  const folderBarData = useMemo(() => {
    const palette = [
      Colors.primary,
      Colors.secondary,
      Colors.success,
      Colors.info,
      Colors.warning,
      Colors.error,
    ];
    return [...folders]
      .filter((f) => (f.animeCount ?? 0) > 0)
      .sort((a, b) => (b.animeCount ?? 0) - (a.animeCount ?? 0))
      .slice(0, 6)
      .map((folder, idx) => ({
        value: folder.animeCount ?? 0,
        label: folder.name.length > 8 ? `${folder.name.slice(0, 7)}…` : folder.name,
        frontColor: palette[idx % palette.length],
        topLabelComponent: () => (
          <Text style={[styles.barTopLabel, { color: theme.text.secondary }]}>
            {folder.animeCount ?? 0}
          </Text>
        ),
      }));
  }, [folders, theme.text.secondary]);

  const folderBarMax = useMemo(() => {
    if (folderBarData.length === 0) return 4;
    const max = Math.max(...folderBarData.map((d) => d.value));
    return Math.max(4, Math.ceil(max * 1.15));
  }, [folderBarData]);

  return (
    <View style={[styles.root, { backgroundColor: theme.background.primary }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={theme.gradient} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={[styles.header, { paddingTop: insets.top > 0 ? 0 : Spacing.sm }]}>
          <Pressable
            onPress={() => {
              hapticsBridge.tap();
              router.back();
            }}
            hitSlop={12}
            style={[
              styles.backButton,
              {
                backgroundColor: theme.background.secondary,
                borderColor: theme.glassBorder,
              },
            ]}>
            <MaterialIcons name="arrow-back" size={20} color={theme.text.primary} />
          </Pressable>
          <Text style={[styles.title, { color: theme.text.primary }]}>Library stats</Text>
          <View style={{ width: 36 }} />
        </View>

        {error ? (
          <ErrorStateView title="Couldn't load stats" message={error} onRetry={loadStats} />
        ) : loading ? (
          <ScrollView contentContainerStyle={styles.content}>
            <ShimmerEffect width="100%" height={140} borderRadius={20} />
            <View style={styles.grid}>
              {tiles.map((_, i) => (
                <ShimmerEffect key={i} width="48%" height={100} borderRadius={16} />
              ))}
            </View>
          </ScrollView>
        ) : stats.total === 0 ? (
          <EmptyStateView
            icon="bar-chart"
            title="No stats yet"
            description="Start adding anime to your folders to see your library breakdown."
            actionLabel="Browse anime"
            onAction={() => router.push('/(rate)')}
          />
        ) : (
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}>
            <View
              style={[
                styles.heroCard,
                {
                  backgroundColor: theme.background.secondary,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <Text style={[styles.heroLabel, { color: theme.text.secondary }]}>
                Library health
              </Text>
              <Text style={[styles.heroValue, { color: theme.text.primary }]}>{stats.total}</Text>
              <Text style={[styles.heroSubtitle, { color: theme.text.tertiary }]}>
                series across {stats.customFolders} custom folder
                {stats.customFolders === 1 ? '' : 's'}
              </Text>

              <View style={styles.progressRow}>
                <ProgressBar label="Completed" value={completionRatio} color="#0A84FF" />
                <ProgressBar label="Watching" value={watchingRatio} color="#30D158" />
              </View>
            </View>

            <View style={styles.grid}>
              {tiles.map((tile) => (
                <View
                  key={tile.label}
                  style={[
                    styles.tile,
                    {
                      backgroundColor: theme.background.secondary,
                      borderColor: theme.glassBorder,
                    },
                  ]}>
                  <View style={[styles.tileIcon, { backgroundColor: tile.color + '24' }]}>
                    <MaterialIcons name={tile.icon} size={22} color={tile.color} />
                  </View>
                  <Text style={[styles.tileValue, { color: theme.text.primary }]}>
                    {tile.value}
                  </Text>
                  <Text style={[styles.tileLabel, { color: theme.text.secondary }]}>
                    {tile.label}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={[styles.sectionTitle, { color: theme.text.primary }]}>
              Library snapshot
            </Text>

            <GlassCard variant="frosted" style={styles.chartCard}>
              <Text style={[styles.chartTitle, { color: theme.text.primary }]}>
                Status distribution
              </Text>
              <Text style={[styles.chartSubtitle, { color: theme.text.secondary }]}>
                How your library splits across watching states
              </Text>
              {statusPieData.length === 0 ? (
                <View style={styles.chartEmpty}>
                  <Text style={[styles.chartEmptyText, { color: theme.text.tertiary }]}>
                    No data yet
                  </Text>
                </View>
              ) : (
                <View style={styles.pieWrapper}>
                  <PieChart
                    data={statusPieData}
                    radius={80}
                    innerRadius={45}
                    donut
                    showTooltip={false}
                    centerLabelComponent={() => (
                      <View style={styles.pieCenter}>
                        <Text style={[styles.pieCenterValue, { color: theme.text.primary }]}>
                          {stats.total}
                        </Text>
                        <Text style={[styles.pieCenterLabel, { color: theme.text.tertiary }]}>
                          total
                        </Text>
                      </View>
                    )}
                  />
                  <View style={styles.pieLegend}>
                    {statusPieData.map((slice) => (
                      <View key={slice.label} style={styles.legendRow}>
                        <View style={[styles.legendDot, { backgroundColor: slice.color }]} />
                        <Text style={[styles.legendLabel, { color: theme.text.secondary }]}>
                          {slice.label}
                        </Text>
                        <Text style={[styles.legendValue, { color: theme.text.primary }]}>
                          {slice.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </GlassCard>

            <GlassCard variant="frosted" style={styles.chartCard}>
              <Text style={[styles.chartTitle, { color: theme.text.primary }]}>Top folders</Text>
              <Text style={[styles.chartSubtitle, { color: theme.text.secondary }]}>
                Largest folders by item count
              </Text>
              {folderBarData.length === 0 ? (
                <View style={styles.chartEmpty}>
                  <Text style={[styles.chartEmptyText, { color: theme.text.tertiary }]}>
                    No data yet
                  </Text>
                </View>
              ) : (
                <View style={styles.barWrapper}>
                  <BarChart
                    data={folderBarData}
                    barWidth={28}
                    spacing={20}
                    hideRules
                    noOfSections={4}
                    maxValue={folderBarMax}
                    barBorderRadius={6}
                    xAxisThickness={0}
                    yAxisThickness={0}
                    hideYAxisText
                    xAxisLabelTextStyle={{
                      ...Typography.captionSmall,
                      color: theme.text.tertiary,
                    }}
                    initialSpacing={10}
                    isAnimated
                  />
                </View>
              )}
            </GlassCard>

            <Text style={[styles.sectionTitle, { color: theme.text.primary }]}>
              Folder breakdown
            </Text>
            {folders.map((folder) => (
              <View
                key={folder.id}
                style={[
                  styles.folderRow,
                  {
                    backgroundColor: theme.background.secondary,
                    borderColor: theme.glassBorder,
                  },
                ]}>
                <View style={[styles.folderIcon, { backgroundColor: theme.accent + '24' }]}>
                  <MaterialIcons
                    name={folder.isSystemFolder ? 'folder-special' : 'folder'}
                    size={18}
                    color={theme.accent}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.folderName, { color: theme.text.primary }]}>
                    {folder.name}
                  </Text>
                  {folder.isR18 ? (
                    <Text style={[styles.folderTag, { color: '#FF453A' }]}>R18</Text>
                  ) : null}
                </View>
                <Text style={[styles.folderCount, { color: theme.text.secondary }]}>
                  {folder.animeCount}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

function ProgressBar({ label, value, color }: { label: string; value: number; color: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.progressItem}>
      <View style={styles.progressHeader}>
        <Text style={[styles.progressLabel, { color: theme.text.secondary }]}>{label}</Text>
        <Text style={[styles.progressValue, { color: theme.text.primary }]}>
          {Math.round(value * 100)}%
        </Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: theme.background.tertiary }]}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.round(value * 100)}%`, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...Typography.headlineSmall,
  },
  content: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  heroCard: {
    padding: Spacing.md,
    borderRadius: 22,
    borderWidth: 1,
    gap: 6,
  },
  heroLabel: {
    ...Typography.captionSmall,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroValue: {
    fontSize: 48,
    fontWeight: '800',
  },
  heroSubtitle: {
    ...Typography.bodyMedium,
  },
  progressRow: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  progressItem: {
    gap: 6,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabel: {
    ...Typography.titleSmall,
  },
  progressValue: {
    ...Typography.titleSmall,
    fontWeight: '700',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  tile: {
    width: '48%',
    padding: Spacing.sm + 2,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  tileLabel: {
    ...Typography.bodySmall,
  },
  sectionTitle: {
    ...Typography.headlineSmall,
    marginTop: Spacing.md,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
  },
  folderIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderName: {
    ...Typography.titleMedium,
  },
  folderTag: {
    ...Typography.captionSmall,
    fontWeight: '700',
    marginTop: 2,
  },
  folderCount: {
    ...Typography.titleLarge,
    fontWeight: '700',
  },
  chartCard: {
    padding: Spacing.md,
    gap: 6,
  },
  chartTitle: {
    ...Typography.titleLarge,
    fontWeight: '700',
  },
  chartSubtitle: {
    ...Typography.bodySmall,
    marginBottom: Spacing.sm,
  },
  chartEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
  },
  chartEmptyText: {
    ...Typography.bodyMedium,
  },
  pieWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  pieCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pieCenterValue: {
    fontSize: 26,
    fontWeight: '800',
  },
  pieCenterLabel: {
    ...Typography.captionSmall,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  pieLegend: {
    flex: 1,
    gap: 6,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    flex: 1,
    ...Typography.bodySmall,
  },
  legendValue: {
    ...Typography.titleSmall,
    fontWeight: '700',
  },
  barWrapper: {
    paddingTop: Spacing.sm,
    paddingRight: Spacing.sm,
    overflow: 'hidden',
  },
  barTopLabel: {
    ...Typography.captionSmall,
    fontWeight: '700',
    marginBottom: 2,
  },
});
