import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  Platform,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Colors, Radius, Spacing, Typography } from '../../constants/DesignSystem';

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

const rarityColor = {
  SSR: '#fbbf24',
  SR: '#a78bfa',
  R: '#f97316',
  N: '#6b7280',
};

export function CardDetailView({ visible, card, onClose, onShardExchange }: CardDetailViewProps) {
  const [showFullStats, setShowFullStats] = useState(false);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    setShowFullStats(false);
  };

  if (!visible || !card) return null;

  return (
    <Modal
      visible={visible}
      transparent
      onRequestClose={handleClose}
      animationType={Platform.OS === 'ios' ? 'slide' : 'fade'}
      style={styles.modalContainer}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <View style={styles.content}>
          <TouchableOpacity
            style={[styles.closeButton, styles.closeButtonTop]}
            onPress={handleClose}>
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
              onPress={() => setShowFullStats(!showFullStats)}>
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
            <TouchableOpacity style={styles.exchangeButton} onPress={() => onShardExchange?.()}>
              <Text style={styles.exchangeButtonText}>Exchange {card.totalShards} Shards</Text>
            </TouchableOpacity>
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

export function ShardCounter({ totalShards, shardsPerCard, exchangeRate }: ShardCounterProps) {
  const scale = useSharedValue(1);

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
      animationType={Platform.OS === 'ios' ? 'slide' : 'fade'}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.content}>
          <TouchableOpacity style={[styles.closeButton, styles.closeButtonTop]} onPress={onClose}>
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
                  onPress={() => handleSortSelect(option.id)}>
                  <Text
                    style={[styles.sortOptionText, isSelected && styles.sortOptionTextSelected]}>
                    {option.label}
                  </Text>
                  {isSelected && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
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
    justifyContent: 'center',
    alignItems: 'center',
  },

  content: {
    backgroundColor: Colors.background.secondary,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    width: SCREEN_WIDTH * 0.9,
    maxHeight: SCREEN_HEIGHT * 0.8,
  },

  closeButton: {
    padding: 8,
  },

  closeButtonText: {
    fontSize: 24,
    color: Colors.text.secondary,
  },

  closeButtonTop: {
    position: 'absolute',
    top: Platform.select({ ios: 20, android: 16 }),
    right: 20,
    zIndex: 10,
  },

  cardImage: {
    width: '100%',
    height: SCREEN_WIDTH * 0.5,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
  },

  cardInfo: {
    alignItems: 'center',
  },

  rarityBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: 3,
    borderColor: '#fff',
  },

  rarityText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },

  cardTitle: {
    ...Typography.headlineMedium,
    color: Colors.text.primary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },

  shardButton: {
    backgroundColor: Colors.glass.light,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.text.primary,
    marginTop: Spacing.xs,
  },

  shardButtonText: {
    ...Typography.titleMedium,
    color: Colors.text.primary,
  },

  fullStats: {
    backgroundColor: Colors.glass.medium,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginTop: Spacing.sm,
  },

  statsLabel: {
    ...Typography.bodySmall,
    color: Colors.text.secondary,
    marginBottom: 4,
  },

  statsValue: {
    ...Typography.headlineSmall,
    color: Colors.text.primary,
  },

  exchangeButton: {
    backgroundColor: Colors.warning,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    marginTop: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
    alignItems: 'center',
  },

  exchangeButtonText: {
    ...Typography.titleMedium,
    color: '#000',
  },

  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.glass.medium,
    borderRadius: Radius.full,
    padding: Spacing.md,
  },

  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
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
    ...Typography.headlineLarge,
    color: Colors.text.primary,
  },

  label: {
    ...Typography.bodySmall,
    color: Colors.text.secondary,
    marginLeft: 4,
  },

  title: {
    ...Typography.headlineSmall,
    color: Colors.text.primary,
    marginBottom: Spacing.lg,
  },

  sortList: {
    backgroundColor: Colors.glass.dark,
    borderRadius: Radius.lg,
    padding: Spacing.sm,
    maxHeight: SCREEN_HEIGHT * 0.6,
  },

  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: Radius.md,
    backgroundColor: Colors.glass.light,
    marginBottom: 8,
  },

  sortOptionSelected: {
    backgroundColor: Colors.warning,
    borderWidth: 1,
    borderColor: '#fff',
  },

  sortOptionText: {
    ...Typography.bodyLarge,
    color: Colors.text.primary,
    flex: 1,
  },

  sortOptionTextSelected: {
    color: '#000',
  },

  checkmark: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginLeft: 12,
  },
});
