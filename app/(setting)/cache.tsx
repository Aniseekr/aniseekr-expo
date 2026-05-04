import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CacheService } from '../../libs/services/cache-service';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import {
  SettingsScreenLayout,
  SettingsRow,
  SettingsSection,
} from '../../components/setting/SettingsScreenLayout';

interface CacheUsage {
  imageCacheBytes: number;
  documentBytes: number;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

async function readDirectorySize(path: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists || !info.isDirectory) return 0;
    const items = await FileSystem.readDirectoryAsync(path);
    let total = 0;
    for (const name of items) {
      const child = path.endsWith('/') ? `${path}${name}` : `${path}/${name}`;
      const childInfo = await FileSystem.getInfoAsync(child);
      if (childInfo.exists) {
        total += (childInfo as any).size ?? 0;
        if (childInfo.isDirectory) {
          total += await readDirectorySize(child);
        }
      }
    }
    return total;
  } catch {
    return 0;
  }
}

export default function CacheSettingsScreen() {
  const { theme } = useTheme();
  const [usage, setUsage] = useState<CacheUsage | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    measure();
  }, []);

  const measure = async () => {
    const cacheRoot = (FileSystem as any).cacheDirectory as string | null;
    const docsRoot = (FileSystem as any).documentDirectory as string | null;

    const imageCacheBytes = cacheRoot ? await readDirectorySize(cacheRoot) : 0;
    const documentBytes = docsRoot ? await readDirectorySize(docsRoot) : 0;

    setUsage({ imageCacheBytes, documentBytes });
  };

  const clearImageCache = async () => {
    setBusy(true);
    try {
      const cacheRoot = (FileSystem as any).cacheDirectory as string | null;
      if (cacheRoot) {
        const items = await FileSystem.readDirectoryAsync(cacheRoot);
        await Promise.all(
          items.map((name) =>
            FileSystem.deleteAsync(
              cacheRoot.endsWith('/') ? `${cacheRoot}${name}` : `${cacheRoot}/${name}`,
              { idempotent: true }
            )
          )
        );
      }
      hapticsBridge.success();
    } catch (e) {
      hapticsBridge.error();
      console.warn('clearImageCache failed:', e);
    } finally {
      await measure();
      setBusy(false);
    }
  };

  const clearMetadata = async () => {
    setBusy(true);
    try {
      await CacheService.clear();
      hapticsBridge.success();
    } catch (e) {
      hapticsBridge.error();
      console.warn('CacheService.clear failed:', e);
    } finally {
      await measure();
      setBusy(false);
    }
  };

  const confirmClearAll = () => {
    Alert.alert(
      'Clear all cached data?',
      'Image thumbnails, anime metadata, and temporary files will be removed. Your library and folders are unaffected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: async () => {
            await clearImageCache();
            await clearMetadata();
          },
        },
      ]
    );
  };

  return (
    <SettingsScreenLayout title="Cache" subtitle="Manage offline data and disk usage">
      <SettingsSection title="Storage usage">
        <SettingsRow
          icon="image"
          label="Image cache"
          value={usage ? formatBytes(usage.imageCacheBytes) : '...'}
        />
        <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
        <SettingsRow
          icon="storage"
          label="App data"
          value={usage ? formatBytes(usage.documentBytes) : '...'}
        />
      </SettingsSection>

      <SettingsSection title="Actions">
        <SettingsRow icon="refresh" label="Recalculate usage" onPress={measure} />
        <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
        <SettingsRow
          icon="cleaning-services"
          label="Clear image cache"
          description="Re-downloads thumbnails as needed"
          onPress={clearImageCache}
        />
        <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
        <SettingsRow
          icon="layers-clear"
          label="Clear metadata"
          description="Drops cached API responses"
          onPress={clearMetadata}
        />
      </SettingsSection>

      <Pressable
        onPress={confirmClearAll}
        disabled={busy}
        style={({ pressed }) => [
          styles.dangerButton,
          {
            backgroundColor: '#FF453A14',
            borderColor: '#FF453A66',
            opacity: pressed || busy ? 0.7 : 1,
          },
        ]}>
        <MaterialIcons name="delete-forever" size={20} color="#FF453A" />
        <Text style={styles.dangerLabel}>Clear all caches</Text>
      </Pressable>
    </SettingsScreenLayout>
  );
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    marginLeft: 56,
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
    color: '#FF453A',
    fontWeight: '700',
  },
});
