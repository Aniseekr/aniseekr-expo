import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { SettingsScreenLayout } from '../../components/setting/SettingsScreenLayout';
import { ShimmerEffect } from '../../components/common/ShimmerEffect';
import { collectionService } from '../../libs/services/collection/collection-service';
import { CollectionFolder } from '../../types';

interface DNATrait {
  label: string;
  value: number; // 0-100
  color: string;
  hint: string;
}

interface DNATagWeight {
  tag: string;
  weight: number;
  color: string;
}

const TRAIT_PRESETS: { key: keyof Stats; label: string; color: string; hint: string }[] = [
  {
    key: 'completionRate',
    label: 'Completionist',
    color: '#0A84FF',
    hint: 'Series finished vs added',
  },
  { key: 'tasteBreadth', label: 'Taste breadth', color: '#BF5AF2', hint: 'Diversity of folders' },
  { key: 'curator', label: 'Curator', color: '#FF9F0A', hint: 'Custom folder ratio' },
  { key: 'dropper', label: 'Picky', color: '#FF453A', hint: 'How often you drop series' },
];

interface Stats {
  total: number;
  completed: number;
  watching: number;
  wishlist: number;
  dropped: number;
  customFolders: number;
  systemFolders: number;
  completionRate: number;
  tasteBreadth: number;
  curator: number;
  dropper: number;
}

function computeStats(folders: CollectionFolder[]): Stats {
  const find = (name: string) => folders.find((f) => f.name === name)?.animeCount ?? 0;
  const total = folders.reduce((acc, f) => acc + (f.animeCount || 0), 0);
  const completed = find('Completed');
  const watching = find('Watching');
  const wishlist = find('Plan to Watch');
  const dropped = find('Dropped');
  const customFolders = folders.filter((f) => !f.isSystemFolder).length;
  const systemFolders = folders.filter((f) => f.isSystemFolder).length;

  const safeRate = (a: number, b: number) =>
    b <= 0 ? 0 : Math.min(100, Math.round((a / b) * 100));

  return {
    total,
    completed,
    watching,
    wishlist,
    dropped,
    customFolders,
    systemFolders,
    completionRate: safeRate(completed, Math.max(1, completed + watching + dropped)),
    tasteBreadth: safeRate(customFolders, Math.max(1, customFolders + 4)),
    curator: safeRate(customFolders, Math.max(1, customFolders + systemFolders)),
    dropper: safeRate(dropped, Math.max(1, dropped + completed + watching)),
  };
}

export default function OtakuDNAScreen() {
  const { theme } = useTheme();
  const [folders, setFolders] = useState<CollectionFolder[] | null>(null);

  useEffect(() => {
    collectionService
      .getFolders()
      .then(setFolders)
      .catch(() => setFolders([]));
  }, []);

  const stats = useMemo(() => (folders ? computeStats(folders) : null), [folders]);

  const traits: DNATrait[] = useMemo(() => {
    if (!stats) return [];
    return TRAIT_PRESETS.map((preset) => ({
      label: preset.label,
      value: stats[preset.key] as number,
      color: preset.color,
      hint: preset.hint,
    }));
  }, [stats]);

  const tagWeights: DNATagWeight[] = useMemo(() => {
    if (!folders) return [];
    return folders
      .filter((f) => !f.isSystemFolder && f.animeCount > 0)
      .slice(0, 6)
      .map((f, i) => ({
        tag: f.name,
        weight: Math.min(
          100,
          Math.round((f.animeCount / Math.max(1, folders[0].animeCount)) * 100)
        ),
        color: ['#FF9F0A', '#0A84FF', '#BF5AF2', '#30D158', '#FF6F60', '#5E5CE6'][i % 6],
      }));
  }, [folders]);

  return (
    <SettingsScreenLayout title="Otaku DNA" subtitle="Your viewing fingerprint">
      <LinearGradient
        colors={[theme.accent + '40', theme.accentDark + '14'] as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.heroCard, { borderColor: theme.glassBorder }]}>
        <MaterialIcons name="auto-awesome" size={26} color={theme.accent} />
        <Text style={[styles.heroTitle, { color: theme.text.primary }]}>Profile dynamics</Text>
        <Text style={[styles.heroBody, { color: theme.text.secondary }]}>
          A snapshot of how you collect and rate. Updates automatically as your library grows.
        </Text>
      </LinearGradient>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text.primary }]}>Traits</Text>
        {!stats ? (
          <View style={{ gap: Spacing.sm }}>
            <ShimmerEffect width="100%" height={50} borderRadius={14} />
            <ShimmerEffect width="100%" height={50} borderRadius={14} />
            <ShimmerEffect width="100%" height={50} borderRadius={14} />
          </View>
        ) : (
          traits.map((trait) => (
            <View
              key={trait.label}
              style={[
                styles.traitRow,
                {
                  backgroundColor: theme.background.secondary,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.traitLabel, { color: theme.text.primary }]}>
                  {trait.label}
                </Text>
                <Text style={[styles.traitHint, { color: theme.text.tertiary }]}>{trait.hint}</Text>
                <View style={[styles.barTrack, { backgroundColor: theme.background.tertiary }]}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${trait.value}%`, backgroundColor: trait.color },
                    ]}
                  />
                </View>
              </View>
              <Text style={[styles.traitValue, { color: trait.color }]}>{trait.value}</Text>
            </View>
          ))
        )}
      </View>

      {tagWeights.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text.primary }]}>Top folders</Text>
          <View style={styles.tagCloud}>
            {tagWeights.map((t) => (
              <View
                key={t.tag}
                style={[
                  styles.tag,
                  {
                    borderColor: t.color + '66',
                    backgroundColor: t.color + '12',
                  },
                ]}>
                <Text style={[styles.tagText, { color: t.color }]}>{t.tag}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {stats ? (
        <View
          style={[
            styles.summaryCard,
            {
              backgroundColor: theme.background.secondary,
              borderColor: theme.glassBorder,
            },
          ]}>
          <SummaryStat label="Library" value={stats.total} color={theme.accent} />
          <SummaryStat label="Completed" value={stats.completed} color="#0A84FF" />
          <SummaryStat label="Custom folders" value={stats.customFolders} color="#BF5AF2" />
        </View>
      ) : null}
    </SettingsScreenLayout>
  );
}

function SummaryStat({ label, value, color }: { label: string; value: number; color: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: theme.text.secondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    padding: Spacing.md,
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
  },
  heroTitle: {
    ...Typography.headlineSmall,
  },
  heroBody: {
    ...Typography.bodyMedium,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.titleLarge,
    paddingHorizontal: 4,
  },
  traitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm + 2,
    borderRadius: 16,
    borderWidth: 1,
  },
  traitLabel: {
    ...Typography.titleMedium,
  },
  traitHint: {
    ...Typography.captionSmall,
    marginTop: 2,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    marginTop: 8,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  traitValue: {
    fontSize: 24,
    fontWeight: '800',
    width: 48,
    textAlign: 'right',
  },
  tagCloud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  tagText: {
    ...Typography.titleSmall,
    fontWeight: '700',
  },
  summaryCard: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderRadius: 18,
    borderWidth: 1,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  summaryLabel: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
});
