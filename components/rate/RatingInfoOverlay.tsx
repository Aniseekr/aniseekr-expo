import { Platform, View, Text, Pressable, StyleSheet } from 'react-native';
import { Photo } from './types';
import Animated, { FadeInUp, FadeOutDown, Layout } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

type Props = {
  photo: Photo | null;
  onClose?: () => void;
  onMoreDetails?: () => void;
};

export function RatingInfoOverlay({ photo, onClose, onMoreDetails }: Props) {
  if (!photo) return null;

  const formattedScore = photo.score
    ? photo.score >= 10
      ? photo.score.toFixed(0)
      : photo.score.toFixed(1)
    : 'N/A';

  return (
    <Animated.View
      entering={FadeInUp.springify().damping(18)}
      exiting={FadeOutDown.springify()}
      layout={Layout.springify()}
      style={styles.container}>
      {/* Glassmorphism Card */}
      <View style={styles.card}>
        <BlurView
          intensity={80}
          tint={Platform.OS === 'ios' ? 'systemThickMaterialDark' : 'dark'}
          style={styles.blurView}>
          {/* Title Row */}
          <View style={styles.titleRow}>
            <View style={styles.titleContainer}>
              <Text style={styles.title} numberOfLines={2}>
                {photo.title || 'Unknown Title'}
              </Text>
              {photo.jpTitle && photo.jpTitle !== photo.title && (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {photo.jpTitle}
                </Text>
              )}
            </View>

            {/* Score Badge */}
            <View style={styles.scoreBadge}>
              <Ionicons name="star" size={16} color="#FBBF24" />
              <Text style={styles.scoreText}>{formattedScore}</Text>
            </View>
          </View>

          {/* Metadata Row */}
          <View style={styles.metadataRow}>
            <View style={styles.metadataItem}>
              <Ionicons name="calendar-outline" size={12} color="rgba(255,255,255,0.5)" />
              <Text style={styles.metadataText}>{photo.year || 'Unknown'}</Text>
            </View>
            <View style={styles.metadataSeparator} />
            <View style={styles.metadataItem}>
              <Ionicons name="tv-outline" size={12} color="rgba(255,255,255,0.5)" />
              <Text style={styles.metadataText}>{photo.type || 'Anime'}</Text>
            </View>
          </View>

          {/* Tags */}
          {photo.tags && photo.tags.length > 0 && (
            <View style={styles.tagsContainer}>
              {photo.tags.slice(0, 4).map((tag, i) => (
                <View key={i} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            <Pressable onPress={onMoreDetails} style={styles.detailButton}>
              <Ionicons name="information-circle-outline" size={18} color="#fff" />
              <Text style={styles.detailButtonText}>Details</Text>
            </Pressable>
          </View>
        </BlurView>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    // Subtle shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 10,
  },
  blurView: {
    padding: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  titleContainer: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  scoreText: {
    color: '#FBBF24',
    fontSize: 16,
    fontWeight: '700',
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  metadataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metadataText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '500',
  },
  metadataSeparator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: 10,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  tag: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tagText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  detailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  detailButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
