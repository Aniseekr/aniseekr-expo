import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { ThemedText } from '../themed';
import type { CollectionFolder } from '../../types';

interface FolderGridProps {
  folders: CollectionFolder[];
  /** Optional cover image URL keyed by folder.id. */
  covers?: { [folderId: string]: string | undefined };
  onPressFolder?: (folder: CollectionFolder) => void;
  onLongPressFolder?: (folder: CollectionFolder) => void;
}

interface FolderCardProps {
  folder: CollectionFolder;
  cover?: string;
  onPress?: () => void;
  onLongPress?: () => void;
}

function FolderCard({ folder, cover, onPress, onLongPress }: FolderCardProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={() => {
        hapticsBridge.tap();
        onPress?.();
      }}
      onLongPress={
        onLongPress
          ? () => {
              hapticsBridge.longPress();
              onLongPress();
            }
          : undefined
      }
      delayLongPress={350}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.background.secondary,
          borderColor: theme.glassBorder,
          opacity: pressed ? 0.88 : 1,
        },
      ]}>
      <View style={[styles.cover, { backgroundColor: theme.background.tertiary }]}>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.coverImage} contentFit="cover" />
        ) : (
          <LinearGradient
            colors={[`${theme.accent}33`, 'transparent']}
            style={StyleSheet.absoluteFill}
          />
        )}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.45)']}
          style={styles.coverGradient}
          pointerEvents="none"
        />
        <View
          style={[
            styles.iconChip,
            { backgroundColor: `${theme.background.primary}CC` },
          ]}>
          <Ionicons
            name={(folder.icon || 'folder') as keyof typeof Ionicons.glyphMap}
            size={14}
            color={theme.text.primary}
          />
        </View>
      </View>
      <View style={styles.body}>
        <ThemedText variant="bodyMedium" weight="700" numberOfLines={1}>
          {folder.name}
        </ThemedText>
        <View style={styles.metaRow}>
          <ThemedText variant="captionSmall" tone="secondary">
            {folder.animeCount} {folder.animeCount === 1 ? 'item' : 'items'}
          </ThemedText>
          <View style={styles.metaIcons}>
            {folder.isR18 ? (
              <View
                style={[
                  styles.r18Pill,
                  { backgroundColor: theme.accent },
                ]}>
                <ThemedText
                  variant="captionSmall"
                  weight="700"
                  style={{ color: theme.background.primary }}>
                  18+
                </ThemedText>
              </View>
            ) : null}
            {folder.isShared ? (
              <MaterialIcons name="people" size={14} color={theme.text.tertiary} />
            ) : (
              <MaterialIcons
                name="chevron-right"
                size={14}
                color={theme.text.tertiary}
              />
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function FolderGridComponent({
  folders,
  covers,
  onPressFolder,
  onLongPressFolder,
}: FolderGridProps) {
  const rows: CollectionFolder[][] = [];
  for (let i = 0; i < folders.length; i += 2) {
    rows.push(folders.slice(i, i + 2));
  }

  return (
    <View style={styles.grid}>
      {rows.map((row, idx) => (
        <View key={idx} style={styles.row}>
          {row.map((folder) => (
            <View key={folder.id} style={styles.cell}>
              <FolderCard
                folder={folder}
                cover={covers?.[folder.id]}
                onPress={() => onPressFolder?.(folder)}
                onLongPress={
                  onLongPressFolder ? () => onLongPressFolder(folder) : undefined
                }
              />
            </View>
          ))}
          {row.length === 1 ? <View style={styles.cell} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  cell: {
    flex: 1,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cover: {
    height: 92,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
  },
  iconChip: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingTop: 10,
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  metaIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  r18Pill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
});

export const FolderGrid = memo(FolderGridComponent);
