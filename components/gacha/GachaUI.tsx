import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, Modal, Pressable, TouchableOpacity, Dimensions, ScrollView, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface GachaCard {
  id: string;
  rarity: 'SSR' | 'SR' | 'R' | 'N';
  imageUrl: string;
  title: string;
  shards: number;
  totalShards: number;
}

interface CardDetailViewProps {
  visible: boolean;
  card: GachaCard;
  onClose: () => void;
  onShardExchange?: () => void;
}

interface ShardCounterProps {
  totalShards: number;
  shardsPerCard: number;
  exchangeRate: number;
}

interface SortSelectorProps {
  currentSort: 'newest' | 'oldest' | 'rarity' | 'popularity' | 'count' | 'id';
  onSortChange: (sort: 'newest' | 'oldest' | 'rarity' | 'popularity' | 'count' | 'id') => void;
  visible: boolean;
  onClose: () => void;
}

const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'rarity', label: 'Rarity' },
  { id: 'popularity', label: 'Popularity' },
  { id: 'count', label: 'Count' },
  { id: 'id', label: 'ID' },
];

export function CardDetailView({ visible, card, onClose, onShardExchange }: CardDetailViewProps) {
  const [showFullStats, setShowFullStats] = useState(false);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    setShowFullStats(false);
  };

  if (!visible || !card) return null;

  const rarityColor = {
    SSR: '#fbbf24',
    SR: '#a78bfa',
    R: '#f97316',
    N: '#6b7280',
  };

  return (
    <Modal
      visible={visible}
      transparent
      onRequestClose={handleClose}
      animationType={Platform.OS === 'ios' ? 'slide' : 'fade'}
      style={styles.modalContainer}
    >
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <View style={styles.content}>
          <TouchableOpacity
            style={[styles.closeButton, styles.closeButtonTop]}
            onPress={handleClose}
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>

          <ExpoImage
            source={{ uri: card.imageUrl }}
            style={styles.cardImage}
            contentFit="cover"
            transition={500}
          />

          <View style={styles.cardInfo}>
            <View style={[styles.rarityBadge, { backgroundColor: rarityColor[card.rarity] }]}>
              <Text style={styles.rarityText}>{card.rarity}</Text>
            </View>

            <Text style={styles.cardTitle}>{card.title}</Text>

            <TouchableOpacity
              style={styles.shardButton}
              onPress={() => setShowFullStats(!showFullStats)}
            >
              <Text style={styles.shardButtonText}>{card.shards} Shards</Text>
            </TouchableOpacity>

            {showFullStats && (
              <View style={styles.fullStats}>
                <Text style={styles.statsLabel}>Exchange Rate</Text>
                <Text style={styles.statsValue}>1 Shards</Text>
              </View>
            )}
          </View>

          {card.totalShards > 0 && (
            <TouchableOpacity
              style={styles.exchangeButton}
              onPress={() => onShardExchange?.()}
            >
              <Text style={styles.exchangeButtonText}>Exchange {card.totalShards} Shards</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export function ShardCounter({ totalShards, shardsPerCard, exchangeRate }: ShardCounterProps) {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSpring(0.95, { damping: 10, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 10, stiffness: 300 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <View style={styles.iconContainer}>
        <Text style={styles.shardIcon}>💎</Text>
      </View>

      <View style={styles.counterContainer}>
        <Text style={styles.counter}>{totalShards}</Text>
        <Text style={styles.label}>Shards</Text>
      </View>
    </Animated.View>
  );
}

export function SortSelector({ currentSort, onSortChange, visible, onClose }: SortSelectorProps) {
  const handleSortSelect = (sortId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSortChange(sortId as any);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      onRequestClose={onClose}
      animationType={Platform.OS === 'ios' ? 'slide' : 'fade'}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.content}>
          <TouchableOpacity
            style={[styles.closeButton, styles.closeButtonTop]}
            onPress={onClose}
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Sort Collection</Text>

          <ScrollView style={styles.sortList}>
            {SORT_OPTIONS.map((option) => {
              const isSelected = currentSort === option.id;

              return (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.sortOption, isSelected && styles.sortOptionSelected]}
                  onPress={() => handleSortSelect(option.id)}
                >
                  <Text style={[styles.sortOptionText, isSelected && styles.sortOptionTextSelected]}>
                    {option.label}
                  </Text>
                  {isSelected && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },

  content: {
    backgroundColor: '#1e293b',
    borderRadius: 24,
    padding: 20,
    width: SCREEN_WIDTH * 0.9,
    maxHeight: SCREEN_HEIGHT * 0.8,
  },

  closeButtonText: {
    fontSize: 24,
    color: '#fff',
  },

  closeButtonTop: {
    position: 'absolute',
    top: Platform.select({ ios: 20, android: 16 }),
    right: 20,
  },

  cardImage: {
    width: '100%',
    height: SCREEN_WIDTH * 0.5,
    borderRadius: 16,
    marginBottom: 16,
  },

  cardInfo: {
    alignItems: 'center',
  },

  rarityBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#fff',
  },

  rarityText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },

  cardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginTop: 12,
  },

  shardButton: {
    backgroundColor: 'rgba(251, 191, 36, 0.3)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fff',
    marginTop: 8,
  },

  shardButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },

  fullStats: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 12,
    borderRadius: 12,
    marginTop: 12,
  },

  statsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },

  statsValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },

  exchangeButton: {
    backgroundColor: '#fbbf24',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },

  exchangeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },

  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 30,
    padding: 16,
  },

  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fbbf24',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },

  shardIcon: {
    fontSize: 20,
    lineHeight: 24,
  },

  counterContainer: {
    flex: 1,
    alignItems: 'center',
  },

  counter: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },

  label: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    marginLeft: 4,
  },

  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 20,
  },

  sortList: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 16,
    padding: 12,
    maxHeight: SCREEN_HEIGHT * 0.6,
  },

  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 8,
  },

  sortOptionSelected: {
    backgroundColor: '#fbbf24',
    borderWidth: 1,
    borderColor: '#fff',
  },

  sortOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },

  sortOptionTextSelected: {
    color: '#fff',
  },

  checkmark: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 12,
  },
});
