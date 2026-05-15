import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Colors, Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import {
  SettingsScreenLayout,
  SettingsRow,
  SettingsSection,
} from '../../components/setting/SettingsScreenLayout';
import {
  CacheManager,
  type BucketStats,
  type CacheBucket,
  type CacheSubBucket,
  type StorageOverview,
} from '../../libs/services/cache/cache-manager';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const precision = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unit]}`;
}

function formatStats(stats: BucketStats): string {
  const parts: string[] = [];
  if (stats.bytes > 0) parts.push(formatBytes(stats.bytes));
  if (stats.entries > 0) {
    parts.push(`${stats.entries} ${stats.entries === 1 ? 'entry' : 'entries'}`);
  }
  if (stats.expiredEntries && stats.expiredEntries > 0) {
    parts.push(`${stats.expiredEntries} expired`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Empty';
}

type BucketSnapshot = {
  bucket: CacheBucket;
  stats: BucketStats;
  children: CacheSubBucket[] | null;
};

export default function CacheSettingsScreen() {
  const { theme } = useTheme();
  const manager = useMemo(() => CacheManager.getInstance(), []);
  const [snapshots, setSnapshots] = useState<BucketSnapshot[]>([]);
  const [overview, setOverview] = useState<StorageOverview | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const buckets = manager.getBuckets();
      const [overviewRes, statsRes] = await Promise.all([
        manager.getStorageOverview(),
        Promise.all(
          buckets.map(async (b) => {
            const stats = await b.getStats().catch(() => ({ entries: 0, bytes: 0 }) as BucketStats);
            const children = b.getChildren
              ? await b.getChildren().catch(() => [] as CacheSubBucket[])
              : null;
            return { bucket: b, stats, children } satisfies BucketSnapshot;
          })
        ),
      ]);
      setOverview(overviewRes);
      setSnapshots(statsRes);
    } finally {
      setLoading(false);
    }
  }, [manager]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const withBusy = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await work();
      hapticsBridge.success();
    } catch (e) {
      hapticsBridge.error();
      console.warn('[CacheSettings] action failed:', e);
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  const handleClearBucket = (bucket: CacheBucket) => {
    Alert.alert(
      'Clear this cache?',
      `${bucket.label} will be cleared. It will be downloaded or computed again when needed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => void withBusy(() => bucket.clear()),
        },
      ]
    );
  };

  const handleClearSubBucket = (child: CacheSubBucket) => {
    Alert.alert('Clear this category?', `${child.label} will be cleared.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => void withBusy(() => child.clear()),
      },
    ]);
  };

  const handlePruneExpired = () =>
    withBusy(async () => {
      const result = await manager.pruneAll();
      if (result.totalRemoved === 0) {
        Alert.alert('No expired entries', 'All TTL-based cache entries are still valid.');
      }
    });

  const handleClearAll = () => {
    Alert.alert(
      'Clear all caches?',
      'Image caches, API responses, request memory cache, and preloaded files will be removed. Collections, ratings, and pilgrimage records are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: () => void withBusy(() => manager.clearAll()),
        },
      ]
    );
  };

  return (
    <SettingsScreenLayout
      title="Cache"
      subtitle="Manage offline data and storage usage"
      refreshing={loading}
      onRefresh={() => void refresh()}>
      <SettingsSection title="Storage Overview">
        <SettingsRow
          icon="folder"
          label="Cache directory"
          description="Images, temporary files, and preloaded data"
          value={overview ? formatBytes(overview.cacheDirBytes) : '...'}
        />
        <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
        <SettingsRow
          icon="description"
          label="Document directory"
          description="User data; never cleared by cache actions"
          value={overview ? formatBytes(overview.documentDirBytes) : '...'}
        />
        <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
        <SettingsRow
          icon="storage"
          label="Available device storage"
          value={
            overview && overview.totalDiskBytes > 0
              ? `${formatBytes(overview.availableDiskBytes)} / ${formatBytes(overview.totalDiskBytes)}`
              : '...'
          }
        />
      </SettingsSection>

      <SettingsSection title="Cache Buckets">
        {snapshots.length === 0 && loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : (
          snapshots.map((snap, index) => {
            const isExpanded = expanded.has(snap.bucket.id);
            const hasChildren = !!snap.children && snap.children.length > 0;
            return (
              <View key={snap.bucket.id}>
                {index > 0 ? (
                  <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
                ) : null}
                <BucketRow
                  bucket={snap.bucket}
                  stats={snap.stats}
                  hasChildren={hasChildren}
                  expanded={isExpanded}
                  onToggle={() => toggleExpand(snap.bucket.id)}
                  onClear={() => handleClearBucket(snap.bucket)}
                />
                {isExpanded && hasChildren
                  ? snap.children!.map((child) => (
                      <SubBucketRow
                        key={child.id}
                        child={child}
                        onClear={() => handleClearSubBucket(child)}
                      />
                    ))
                  : null}
              </View>
            );
          })
        )}
      </SettingsSection>

      <SettingsSection title="Actions">
        <SettingsRow icon="refresh" label="Recalculate usage" onPress={() => void refresh()} />
        <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
        <SettingsRow
          icon="cleaning-services"
          label="Prune expired entries"
          description="Only clears TTL-based cache entries that are already expired"
          onPress={handlePruneExpired}
        />
      </SettingsSection>

      <Pressable
        onPress={handleClearAll}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Clear all caches"
        accessibilityState={{ disabled: busy }}
        style={({ pressed }) => [
          styles.dangerButton,
          {
            backgroundColor: Colors.error + '14',
            borderColor: Colors.error + '66',
            opacity: pressed || busy ? 0.7 : 1,
          },
        ]}>
        <MaterialIcons name="delete-forever" size={20} color={Colors.error} />
        <Text style={styles.dangerLabel}>Clear all caches</Text>
      </Pressable>
    </SettingsScreenLayout>
  );
}

interface BucketRowProps {
  bucket: CacheBucket;
  stats: BucketStats;
  hasChildren: boolean;
  expanded: boolean;
  onToggle: () => void;
  onClear: () => void;
}

function BucketRow({ bucket, stats, hasChildren, expanded, onToggle, onClear }: BucketRowProps) {
  const { theme } = useTheme();
  const icon = (bucket.icon ?? 'storage') as React.ComponentProps<typeof MaterialIcons>['name'];
  return (
    <Pressable
      onPress={() => {
        if (hasChildren) {
          hapticsBridge.selection();
          onToggle();
        }
      }}
      style={({ pressed }) => [styles.bucketRow, { opacity: pressed && hasChildren ? 0.7 : 1 }]}>
      <View style={[styles.bucketIcon, { backgroundColor: theme.background.tertiary }]}>
        <MaterialIcons name={icon} size={18} color={theme.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.bucketLabel, { color: theme.text.primary }]}>{bucket.label}</Text>
        {bucket.description ? (
          <Text style={[styles.bucketDescription, { color: theme.text.secondary }]}>
            {bucket.description}
          </Text>
        ) : null}
        <Text style={[styles.bucketStats, { color: theme.text.tertiary }]}>
          {formatStats(stats)}
        </Text>
      </View>
      <Pressable
        onPress={() => {
          hapticsBridge.warning();
          onClear();
        }}
        hitSlop={10}
        accessibilityLabel={`Clear ${bucket.label}`}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.bucketAction,
          {
            backgroundColor: theme.background.tertiary,
            borderColor: theme.glassBorder,
            opacity: pressed ? 0.7 : 1,
          },
        ]}>
        <MaterialIcons name="delete-outline" size={16} color={theme.text.secondary} />
      </Pressable>
      {hasChildren ? (
        <MaterialIcons
          name={expanded ? 'expand-less' : 'expand-more'}
          size={20}
          color={theme.text.tertiary}
        />
      ) : null}
    </Pressable>
  );
}

interface SubBucketRowProps {
  child: CacheSubBucket;
  onClear: () => void;
}

function SubBucketRow({ child, onClear }: SubBucketRowProps) {
  const { theme } = useTheme();
  return (
    <View style={[styles.subRow, { borderTopColor: theme.glassBorder }]}>
      <View style={styles.subIndicator}>
        <View style={[styles.subDot, { backgroundColor: theme.accent }]} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.subLabel, { color: theme.text.primary }]}>{child.label}</Text>
        <Text style={[styles.subStats, { color: theme.text.tertiary }]}>
          {formatStats(child.stats)}
        </Text>
      </View>
      <Pressable
        onPress={() => {
          hapticsBridge.warning();
          onClear();
        }}
        hitSlop={10}
        accessibilityLabel={`Clear ${child.label}`}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.subAction,
          {
            backgroundColor: theme.background.tertiary,
            borderColor: theme.glassBorder,
            opacity: pressed ? 0.7 : 1,
          },
        ]}>
        <Text style={[styles.subActionLabel, { color: theme.text.secondary }]}>Clear</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    marginLeft: 56,
  },
  loadingBox: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bucketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.sm + 2,
  },
  bucketIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bucketLabel: {
    ...Typography.titleMedium,
  },
  bucketDescription: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
  bucketStats: {
    ...Typography.captionSmall,
    marginTop: 4,
  },
  bucketAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.sm,
    paddingLeft: 48,
    borderTopWidth: 1,
  },
  subIndicator: {
    width: 12,
    alignItems: 'center',
  },
  subDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  subLabel: {
    ...Typography.bodyMedium,
    fontWeight: '600',
  },
  subStats: {
    ...Typography.captionSmall,
    marginTop: 2,
  },
  subAction: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  subActionLabel: {
    ...Typography.captionSmall,
    fontWeight: '600',
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: Spacing.sm + 2,
    borderRadius: 14,
    borderWidth: 1,
  },
  dangerLabel: {
    ...Typography.titleMedium,
    color: Colors.error,
    fontWeight: '700',
  },
});
