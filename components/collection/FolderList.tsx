import { View, Text, Pressable, ScrollView, Platform, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

// Define types locally for now, could be shared
export interface CollectionFolder {
  id: string;
  name: string;
  icon: string;
  isR18: boolean;
  isShared: boolean;
  isSystemFolder: boolean;
  folderType?: string;
}

export interface AnimePreview {
  id: number;
  title: string;
  score?: number;
  year?: number;
  type?: string;
  image?: string;
}

export interface FolderListProps {
  folders: CollectionFolder[];
  folderPreviews: { [key: string]: AnimePreview[] };
  onFolderPress?: (folder: CollectionFolder) => void;
}

export function FolderList({ folders, folderPreviews, onFolderPress }: FolderListProps) {
  const renderFolderSection = (folder: CollectionFolder) => {
    const previews = folderPreviews[folder.id] || [];

    return (
      <View key={folder.id} style={styles.folderSection}>
        <Pressable style={styles.folderHeader} onPress={() => onFolderPress?.(folder)}>
          <View style={styles.folderHeaderLeft}>
            <View style={styles.folderIconContainer}>
              <Ionicons name={folder.icon as any} size={24} color="rgba(255, 255, 255, 0.87)" />
            </View>
            <Text style={styles.folderName}>{folder.name}</Text>
            {folder.isR18 && (
              <View style={styles.r18Badge}>
                <Text style={styles.r18Text}>18+</Text>
              </View>
            )}
            {folder.isShared && (
              <View style={styles.sharedBadge}>
                <MaterialIcons name="people" size={14} color="#3b82f6" />
              </View>
            )}
          </View>
          <MaterialIcons name="chevron-right" size={20} color="rgba(255,255,255,0.4)" />
        </Pressable>

        {folder.name === 'Wishlist' && previews.length > 0 ? (
          <View style={styles.wishlistContainer}>
            <View style={styles.heroCard}>
              {previews[0].image ? (
                <Image
                  source={{ uri: previews[0].image }}
                  style={styles.heroImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.heroImagePlaceholder} />
              )}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.9)']}
                style={styles.heroGradient}
              />
              <View style={styles.heroContent}>
                <Text style={styles.heroTitle}>{previews[0].title}</Text>
                <View style={styles.heroMeta}>
                  {previews[0].score && (
                    <View style={styles.scoreRow}>
                      <MaterialIcons name="star" size={16} color="#fbbf24" />
                      <Text style={styles.scoreText}>{previews[0].score.toFixed(1)}</Text>
                    </View>
                  )}
                  {previews[0].year && <Text style={styles.yearText}>{previews[0].year}</Text>}
                </View>
              </View>
            </View>
          </View>
        ) : folder.folderType === 'all' && previews.length > 0 ? (
          <View style={styles.gridContainer}>
            {previews.slice(0, 6).map((anime) => (
              <View key={anime.id} style={styles.gridItem}>
                <View style={styles.animeCard}>
                  {anime.image ? (
                    <Image
                      source={{ uri: anime.image }}
                      style={styles.animeImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.animeImagePlaceholder} />
                  )}
                </View>
                <Text style={styles.animeTitle} numberOfLines={1}>
                  {anime.title}
                </Text>
                {anime.score && (
                  <View style={styles.scoreRowSmall}>
                    <Text style={styles.starIcon}>⭐</Text>
                    <Text style={styles.scoreTextSmall}>{anime.score.toFixed(1)}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        ) : previews.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScrollContent}>
            {previews.map((anime) => (
              <View key={anime.id} style={styles.horizontalItem}>
                <View style={styles.animeCard}>
                  {anime.image ? (
                    <Image
                      source={{ uri: anime.image }}
                      style={styles.animeImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.animeImagePlaceholder} />
                  )}
                </View>
                <Text style={styles.animeTitleHorizontal} numberOfLines={1}>
                  {anime.title}
                </Text>
              </View>
            ))}
          </ScrollView>
        ) : (
          <Pressable style={styles.emptyContainer}>
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconContainer}>
                <MaterialIcons name="add" size={24} color="rgba(255,255,255,0.2)" />
              </View>
              <Text style={styles.emptyText}>Add to collection</Text>
            </View>
          </Pressable>
        )}
      </View>
    );
  };

  if (!folders || folders.length === 0) {
    return (
      <View style={styles.emptyState}>
        <MaterialIcons name="folder-open" size={48} color="rgba(255, 255, 255, 0.3)" />
        <Text style={styles.emptyStateText}>No folders</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>{folders.map((folder) => renderFolderSection(folder))}</View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  folderSection: {
    marginBottom: 32,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 16,
    marginTop: 16,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  folderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 0,
  },
  folderHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  folderIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: {
        elevation: 1,
      },
    }),
  },
  folderName: {
    color: 'rgba(255, 255, 255, 0.87)',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  r18Badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#EF4444',
    borderRadius: 6,
  },
  r18Text: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  sharedBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  wishlistContainer: {
    paddingHorizontal: 0,
  },
  heroCard: {
    height: 256,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1E1E1E',
    ...Platform.select({
      android: {
        elevation: 4,
      },
    }),
  },
  heroImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  heroImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#2E2E2E',
  },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  heroContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 32,
    paddingTop: 80,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    lineHeight: 28,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scoreText: {
    color: '#fbbf24',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  yearText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    fontWeight: '500',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 0,
  },
  gridItem: {
    width: '31%',
    marginBottom: 8,
  },
  animeCard: {
    aspectRatio: 2 / 3,
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    ...Platform.select({
      android: {
        elevation: 1,
      },
    }),
  },
  animeImage: {
    width: '100%',
    height: '100%',
  },
  animeImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  animeTitle: {
    color: 'rgba(255, 255, 255, 0.87)',
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 16,
    paddingLeft: 4,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  scoreRowSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 4,
    marginTop: 2,
  },
  starIcon: {
    fontSize: 10,
  },
  scoreTextSmall: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  horizontalScrollContent: {
    paddingHorizontal: 20,
  },
  horizontalItem: {
    width: 128,
    marginRight: 16,
  },
  animeTitleHorizontal: {
    color: 'rgba(255, 255, 255, 0.87)',
    fontSize: 12,
    fontWeight: '600',
    paddingLeft: 4,
    marginTop: 8,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  emptyContainer: {
    paddingHorizontal: 0,
  },
  emptyCard: {
    height: 128,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  emptyIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 16,
    fontWeight: '500',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
});
